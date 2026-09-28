import type { LanguageCode } from '@muslimreminder/schema/common';
import {
    contentKeys,
    QURAN_SURAH_COUNT,
    QURAN_VERSE_COUNTS,
    QuranTafsirFileSchema,
    QuranTafsirsFileSchema,
    type QuranTafsir,
    type QuranTafsirBlock,
    type QuranTafsirFile,
    type QuranTafsirPassage,
    type QuranTranslationId,
} from '@muslimreminder/schema/content';
import { z } from 'zod';
import type { OutputFile } from '../../output.ts';
import type { ReadQulSource } from './index.ts';
import { htmlToBlocks } from './surah-infos.ts';

/** Tafsirs hand-picked from https://qul.tarteel.ai/resources/tafsir. */
export type QulTafsir = {
    id: QuranTranslationId;
    qulId: number;
    language: LanguageCode;
    name: string;
    author?: string;
    /** Recognizes the downloaded file, named after the QUL resource. */
    file: RegExp;
    /**
     * What a backtick stands for: an ʿayn in transliterations (`Fir`awn`), an apostrophe in Albanian
     * (`t`u`), nothing where it only opens a transliteration (French Mukhtasar: `(`ar-rabbu)`).
     */
    backtick: string;
    /** Rejoins the words the source hyphenated at its line ends (`словосо- четания`), a PDF extraction left-over. */
    joinHyphenatedWords?: boolean;
};

const AYN = 'ʿ';

/**
 * Published tafsirs, in catalog order. Left out: the Turkish "Tafsir Ibne Kathir" (QUL 306), which only
 * holds the translation of the verses, not a commentary.
 */
export const QUL_TAFSIRS: QulTafsir[] = [
    { id: 'ar-ibn-kathir', qulId: 22, language: 'ar', name: 'Tafsir Ibn Kathir', author: 'Ismail ibn Kathir', file: /^ar-tafsir-ibn-kathir/i, backtick: AYN },
    { id: 'ar-ibn-abi-zamanin', qulId: 499, language: 'ar', name: 'Tafsir Ibn Abi Zamanin', author: 'Ibn Abi Zamanin', file: /^tafsir-ibn-abi-zamanin/i, backtick: AYN },
    { id: 'en-ibn-kathir', qulId: 35, language: 'en', name: 'Tafsir Ibn Kathir (abridged)', author: 'Ismail ibn Kathir', file: /^en-taf(?:si|is)r-ibn-kathir/i, backtick: AYN },
    { id: 'en-mukhtasar', qulId: 266, language: 'en', name: 'Al-Mukhtasar (Abridged Explanation of the Quran)', file: /^abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'fr-mukhtasar', qulId: 259, language: 'fr', name: 'Al-Mukhtasar (L’Exégèse abrégée du Coran)', file: /^french-mokhtasar/i, backtick: '' },
    { id: 'ru-ibn-kathir', qulId: 307, language: 'ru', name: 'Tafsir Ibn Kathir', author: 'Ismail ibn Kathir', file: /^ru-tafsir-ibne?-ka(?:h?t|th)h?ir/i, backtick: AYN },
    { id: 'ru-saadi', qulId: 310, language: 'ru', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /^tafsir-as-saadi-russian/i, backtick: AYN, joinHyphenatedWords: true },
    { id: 'ru-mukhtasar', qulId: 262, language: 'ru', name: 'Al-Mukhtasar', file: /^russian-mokhtasar/i, backtick: AYN },
    { id: 'sq-saadi', qulId: 283, language: 'sq', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /^sq-saadi/i, backtick: '’' },
];

export const qulTafsirSourceKey = (id: QuranTranslationId) => `qul/tafsirs/${id}.json`;

const VERSE_KEY = /^(\d+):(\d+)$/;

/**
 * A QUL tafsir JSON: `{ "2:3": { "text": "…", "ayah_keys": ["2:3", "2:4"] }, "2:4": "2:3" }`. A verse
 * explained with others points to the first verse of its group; `ayah_keys` is absent for a single verse.
 */
export const RawQulTafsirSchema = z.record(
    z.string().regex(VERSE_KEY, 'Expected verse keys like "2:255"'),
    z.union([
        z.string().regex(VERSE_KEY),
        z.object({ text: z.string(), ayah_keys: z.array(z.string().regex(VERSE_KEY)).min(1).optional() }),
    ]),
);
export type RawQulTafsir = z.infer<typeof RawQulTafsirSchema>;

export function parseQulTafsir(text: string): RawQulTafsir {
    const result = RawQulTafsirSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL tafsir file: ${result.error.issues.slice(0, 3).map((issue) => issue.message).join('; ')}`);
    }
    return result.data;
}

const verseOf = (key: string) => {
    const [, surah, verse] = key.match(VERSE_KEY)!;
    return { surah: Number(surah), verse: Number(verse) };
};

/** Paragraphs of a source written in plain text (the Mukhtasar): one per line. */
const plainTextToBlocks = (text: string): QuranTafsirBlock[] =>
    text
        .split(/\r?\n/)
        .map((line) => line.replace(/[\s ]+/g, ' ').trim())
        .filter(Boolean)
        .map((line) => ({ type: 'paragraph', text: line }));

/** The verse translation some tafsirs quote before their commentary: `<p class="en translation">`. */
const isQuote = (tag: string) => /class\s*=\s*"[^"]*\btranslation\b/.test(tag);

/**
 * A passage text → blocks. The editors' notes of the Arabic Ibn Kathir (`[[في أ: "يفتتح".]]`, manuscript
 * variants) are dropped: they interrupt the text and mean nothing to a reader. The Russian Ibn Kathir
 * wraps each Quran word in its own span, without spaces between them: they are put back.
 */
export function tafsirTextToBlocks(text: string, source: Pick<QulTafsir, 'backtick' | 'joinHyphenatedWords'>): QuranTafsirBlock[] {
    const cleaned = text.replace(/\[\[[\s\S]*?\]\]/g, '').replace(/<\/span>(?=<span[^>]*qpc-hafs)/g, '</span> ');
    const blocks = /<[a-z][^>]*>/i.test(cleaned) ? htmlToBlocks(cleaned, { isQuote }) : plainTextToBlocks(cleaned);
    const fix = (value: string) => {
        const joined = source.joinHyphenatedWords ? value.replace(/(\p{Ll})- (\p{Ll})/gu, '$1$2') : value;
        return joined.replaceAll('`', source.backtick).replace(/ {2,}/g, ' ').trim();
    };
    return blocks
        .map((block): QuranTafsirBlock => (block.type === 'list' ? { ...block, items: block.items.map(fix).filter(Boolean) } : { ...block, text: fix(block.text) }))
        .filter((block) => (block.type === 'list' ? block.items.length > 0 : block.text.length > 0));
}

export function toTafsirFile(
    tafsir: QulTafsir,
    raw: RawQulTafsir,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranTafsirFile {
    const surahs: QuranTafsirPassage[][] = Array.from({ length: QURAN_SURAH_COUNT }, () => []);
    let empty = 0;

    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
            const group = raw[value];
            if (typeof group !== 'object' || !(group.ayah_keys ?? [value]).includes(key)) {
                throw new Error(`${tafsir.id}: ${key} points to ${value}, which does not explain it`);
            }
            continue;
        }
        const verses = (value.ayah_keys ?? [key]).map(verseOf);
        const { surah, verse: from } = verses[0]!;
        const to = verses.at(-1)!.verse;
        if (key !== value.ayah_keys?.[0] && value.ayah_keys) {
            throw new Error(`${tafsir.id}: the group of ${key} starts at ${value.ayah_keys[0]}`);
        }
        if (verses.some((v, i) => v.surah !== surah || v.verse !== from + i)) {
            throw new Error(`${tafsir.id}: the verses of ${key} are not consecutive verses of one surah`);
        }
        if (surah > QURAN_SURAH_COUNT || to > QURAN_VERSE_COUNTS[surah - 1]!) {
            throw new Error(`${tafsir.id}: ${key} is not a verse of the Quran`);
        }
        const blocks = tafsirTextToBlocks(value.text, tafsir);
        if (blocks.length === 0) {
            empty += to - from + 1;
            continue;
        }
        surahs[surah - 1]!.push({ from, to, blocks });
    }
    for (const passages of surahs) passages.sort((a, b) => a.from - b.from);

    const verseCount = surahs.flat().reduce((sum, passage) => sum + passage.to - passage.from + 1, 0);
    const missing = QURAN_VERSE_COUNTS.reduce((sum, count) => sum + count, 0) - verseCount;
    if (missing > 0) {
        options.warn(`${tafsir.id}: ${missing} verses without commentary${empty ? ` (${empty} with an empty text)` : ''}`);
    }

    const entry: QuranTafsir = {
        id: tafsir.id,
        language: tafsir.language,
        name: tafsir.name,
        ...(tafsir.author && { author: tafsir.author }),
        verseCount,
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: `https://qul.tarteel.ai/resources/tafsir/${tafsir.qulId}`,
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranTafsirFileSchema.parse({ schemaVersion: 1, tafsir: entry, surahs });
}

/** One file per tafsir, then their catalog; a missing source keeps its published entry. */
export async function buildTafsirFiles(
    read: ReadQulSource,
    options: {
        previous?: QuranTafsir[];
        tafsirs?: QulTafsir[];
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<OutputFile[]> {
    const previous = new Map(options.previous?.map((tafsir) => [tafsir.id, tafsir]));
    const files: OutputFile[] = [];
    const catalog: QuranTafsir[] = [];

    for (const tafsir of options.tafsirs ?? QUL_TAFSIRS) {
        const source = await read(qulTafsirSourceKey(tafsir.id));
        if (!source) {
            const kept = previous.get(tafsir.id);
            if (kept) catalog.push(kept);
            options.warn(`${tafsir.id}: no source at ${qulTafsirSourceKey(tafsir.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const file = toTafsirFile(tafsir, parseQulTafsir(source.text), {
            retrievedAt: source.modifiedAt.toISOString(),
            warn: options.warn,
        });
        files.push({ key: contentKeys.quran.tafsir(tafsir.id), data: file });
        catalog.push(file.tafsir);
        options.log(`${tafsir.id}: ${file.surahs.flat().length} passages, ${file.tafsir.verseCount} verses`);
    }

    files.push({
        key: contentKeys.quran.tafsirs(),
        data: QuranTafsirsFileSchema.parse({ schemaVersion: 1, tafsirs: catalog }),
    });
    return files;
}
