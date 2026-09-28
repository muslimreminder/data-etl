import type { LanguageCode } from '@muslimreminder/schema/common';
import {
    contentKeys,
    QURAN_SURAH_COUNT,
    QuranSurahInfoFileSchema,
    QuranSurahInfosFileSchema,
    type QuranSurahInfo,
    type QuranSurahInfoBlock,
    type QuranSurahInfoFile,
    type QuranSurahIntroduction,
    type QuranTafsirBlock,
    type QuranTranslationId,
} from '@muslimreminder/schema/content';
import { decodeHTML } from 'entities';
import { z } from 'zod';
import type { OutputFile } from '../../output.ts';
import type { ReadQulSource } from './index.ts';

/** Surah introductions hand-picked from https://qul.tarteel.ai/resources/surah-info. */
export type QulSurahInfo = {
    id: QuranTranslationId;
    qulId: number;
    language: LanguageCode;
    name: string;
    /** Recognizes the downloaded file (`surah-info-<language>.json` on QUL). */
    file: RegExp;
};

/**
 * Published introductions, in catalog order. Tamil (QUL 5) is left out: its file repeats the
 * introduction of Al-Imran for every surah.
 */
export const QUL_SURAH_INFOS: QulSurahInfo[] = [
    { id: 'en-maududi', qulId: 3, language: 'en', name: 'Abul Ala Maududi (Tafhim al-Quran)', file: /surah-info-en\b/i },
    { id: 'ur-maududi', qulId: 4, language: 'ur', name: 'Abul Ala Maududi (Tafhim al-Quran)', file: /surah-info-ur\b/i },
    { id: 'ml-maududi', qulId: 7, language: 'ml', name: 'Abul Ala Maududi (Tafhim al-Quran)', file: /surah-info-ml\b/i },
    { id: 'id-kemenag', qulId: 454, language: 'id', name: 'Kementerian Agama RI', file: /surah-info-id\b/i },
    { id: 'it-piccardo', qulId: 6, language: 'it', name: 'Hamza Roberto Piccardo', file: /surah-info-it\b/i },
];

export const qulSurahInfoSourceKey = (id: QuranTranslationId) => `qul/surah-infos/${id}.json`;

/** A QUL surah info JSON: `{ "1": { "surah_number": "1", "surah_name": "Al-Fatihah", "text": "<h2>…", "short_text": "…" } }`. */
export const RawQulSurahInfosSchema = z.record(
    z.string().regex(/^\d+$/, 'Expected surah numbers as keys'),
    z.object({
        text: z.string().nullable(),
        short_text: z.string().nullable().optional(),
    }),
);
export type RawQulSurahInfos = z.infer<typeof RawQulSurahInfosSchema>;

export function parseQulSurahInfos(text: string): RawQulSurahInfos {
    const result = RawQulSurahInfosSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL surah info file: ${result.error.issues.slice(0, 3).map((issue) => issue.message).join('; ')}`);
    }
    return result.data;
}

/** Below this, an introduction is only a cross-reference ("Vedi Appendice 1."), not worth a screen. */
const MIN_LENGTH = 200;

const cleanText = (text: string) => decodeHTML(text).replace(/[\s ]+/g, ' ').trim();

/** Text of the source that stands for "nothing", e.g. `short_text: "None"`. */
const isEmpty = (text: string | null | undefined): text is null | undefined =>
    !text || /^\s*(none|null)?\s*$/i.test(text);

const HEADING = /^h[1-6]$/;
/** Tags whose content is dropped: footnote calls such as `<sup>N12</sup>`. */
const SKIPPED = new Set(['sup', 'script', 'style']);

/**
 * QUL HTML → plain-text blocks. Headings, paragraphs and lists are kept; inline markup
 * (emphasis, links to verses, spans) keeps its text only. Loose text between blocks and `<br>` start a
 * new paragraph, as the sources use them in place of `<p>`. With `isQuote`, the paragraphs whose opening
 * tag it accepts (e.g. `<p class="translation">`) become `quote` blocks.
 */
export function htmlToBlocks(html: string): QuranSurahInfoBlock[];
export function htmlToBlocks(html: string, options: { isQuote: (tag: string) => boolean }): QuranTafsirBlock[];
export function htmlToBlocks(html: string, options?: { isQuote: (tag: string) => boolean }): QuranTafsirBlock[] {
    const blocks: QuranTafsirBlock[] = [];
    let buffer = '';
    let heading = false;
    let quote = false;
    let list: { ordered: boolean; items: string[] } | undefined;
    let item: string | undefined;
    let skipped = 0;

    const flush = () => {
        const text = cleanText(buffer);
        buffer = '';
        if (!text) return;
        if (list && item !== undefined) {
            item += ` ${text}`;
        } else if (list) {
            list.items.push(text);
        } else {
            blocks.push({ type: heading ? 'heading' : quote ? 'quote' : 'paragraph', text });
        }
    };
    const endItem = () => {
        flush();
        const text = item === undefined ? '' : cleanText(item);
        if (list && text) list.items.push(text);
        item = undefined;
    };
    const endList = () => {
        endItem();
        if (list && list.items.length > 0) blocks.push({ type: 'list', ...list });
        list = undefined;
    };

    for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
        const tag = token.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)/);
        if (!tag) {
            if (skipped === 0 && !token.startsWith('<')) buffer += token;
            continue;
        }
        const closing = tag[1] === '/';
        const name = tag[2]!.toLowerCase();
        if (SKIPPED.has(name)) {
            skipped = Math.max(0, skipped + (closing ? -1 : 1));
            continue;
        }
        if (HEADING.test(name)) {
            if (list) endList();
            flush();
            heading = !closing;
        } else if (name === 'p' || name === 'div' || name === 'br') {
            // Inside a list item, a paragraph only separates sentences of the same item.
            if (item !== undefined) buffer += ' ';
            else flush();
            if (name !== 'br') quote = !closing && options?.isQuote(token) === true;
        } else if (name === 'ol' || name === 'ul') {
            if (closing) endList();
            else {
                if (list) endList();
                flush();
                list = { ordered: name === 'ol', items: [] };
            }
        } else if (name === 'li') {
            endItem();
            if (!closing && list) item = '';
        }
        // Other tags are inline markup (emphasis, links to verses, spans): only their text is kept.
    }
    if (list) endList();
    flush();
    return blocks;
}

const blocksLength = (blocks: QuranSurahInfoBlock[]) =>
    blocks.reduce((sum, block) => sum + (block.type === 'list' ? block.items.join(' ').length : block.text.length), 0);

export function toSurahInfoFile(
    info: QulSurahInfo,
    raw: RawQulSurahInfos,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranSurahInfoFile {
    const skipped: number[] = [];
    const surahs = Array.from({ length: QURAN_SURAH_COUNT }, (_, index): QuranSurahIntroduction | null => {
        const entry = raw[String(index + 1)];
        const blocks = isEmpty(entry?.text) ? [] : htmlToBlocks(entry.text);
        if (blocksLength(blocks) < MIN_LENGTH) {
            skipped.push(index + 1);
            return null;
        }
        const summary = isEmpty(entry?.short_text) ? '' : cleanText(entry.short_text);
        return summary ? { summary, blocks } : { blocks };
    });
    if (skipped.length > 0) {
        options.warn(`${info.id}: no usable introduction for surah(s) ${skipped.join(', ')}`);
    }

    const entry: QuranSurahInfo = {
        id: info.id,
        language: info.language,
        name: info.name,
        surahCount: surahs.filter((surah) => surah !== null).length,
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: `https://qul.tarteel.ai/resources/surah-info/${info.qulId}`,
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranSurahInfoFileSchema.parse({ schemaVersion: 1, info: entry, surahs });
}

/** One file per language, then their catalog; a missing source keeps its published entry. */
export async function buildSurahInfoFiles(
    read: ReadQulSource,
    options: {
        previous?: QuranSurahInfo[];
        infos?: QulSurahInfo[];
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<OutputFile[]> {
    const previous = new Map(options.previous?.map((info) => [info.id, info]));
    const files: OutputFile[] = [];
    const catalog: QuranSurahInfo[] = [];

    for (const info of options.infos ?? QUL_SURAH_INFOS) {
        const source = await read(qulSurahInfoSourceKey(info.id));
        if (!source) {
            const kept = previous.get(info.id);
            if (kept) catalog.push(kept);
            options.warn(`${info.id}: no source at ${qulSurahInfoSourceKey(info.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const file = toSurahInfoFile(info, parseQulSurahInfos(source.text), {
            retrievedAt: source.modifiedAt.toISOString(),
            warn: options.warn,
        });
        files.push({ key: contentKeys.quran.surahInfo(info.id), data: file });
        catalog.push(file.info);
        options.log(`${info.id}: ${file.info.surahCount} surahs`);
    }

    files.push({
        key: contentKeys.quran.surahInfos(),
        data: QuranSurahInfosFileSchema.parse({ schemaVersion: 1, infos: catalog }),
    });
    return files;
}
