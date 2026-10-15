import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
    contentKeys,
    QURAN_MUSHAF_PAGE_COUNT,
    QuranMushafFileSchema,
    QuranMushafsFileSchema,
    quranMushafFontPath,
    type QuranMushaf,
    type QuranMushafLine,
    type QuranMushafWord,
} from '@muslimreminder/schema/content';
import { z } from 'zod';
import type { OutputAsset, OutputFile } from '../../output.ts';
import { codePoints, paintTextInForeground } from './font.ts';

/**
 * A mushaf the apps can download instead of the one they ship: its glyph font (one per page), the glyph of
 * every word in that font, and the layout of the page lines. QUL publishes the three as separate resources.
 */
export type QulMushaf = {
    id: string;
    name: string;
    tajweed: boolean;
    /** Word-by-word glyph codes, https://qul.tarteel.ai/resources/quran-script/{qulId} (json download). */
    script: { qulId: number; file: RegExp };
    /** Lines of each page, https://qul.tarteel.ai/resources/mushaf-layout/{qulId} (sqlite download). */
    layout: { qulId: number; file: RegExp };
    /**
     * Page fonts, https://qul.tarteel.ai/resources/font/{qulId}. QUL serves them publicly (the download of the
     * resource page zips the 604 files together): `fontUrl(page)` is the TTF of a page, numbered from 1.
     */
    font: { qulId: number; url: (page: number) => string };
};

export const QUL_MUSHAFS: QulMushaf[] = [
    {
        id: 'qpc-v4-tajweed',
        name: 'KFGQPC V4 Tajweed (1441H)',
        tajweed: true,
        script: { qulId: 47, file: /^qpc-v4\.json$/i },
        layout: { qulId: 19, file: /^qpc-v4-tajweed-15-lines\.(db|sqlite)$/i },
        font: { qulId: 240, url: (page) => `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/ttf/p${page}.ttf` },
    },
];

/** Object keys of the downloaded QUL files in the private sources bucket. */
export const qulMushafScriptKey = (id: string) => `qul/mushafs/${id}/script.json`;
export const qulMushafLayoutKey = (id: string) => `qul/mushafs/${id}/layout.sqlite`;

const RESOURCE_URL = 'https://qul.tarteel.ai/resources';

/** A word of a QUL word-by-word script: `{"1:1:1": {"id": 1, "surah": "1", "ayah": "1", "word": "1", "text": "ﱁ"}}`. */
const RawScriptSchema = z.record(
    z.string(),
    z.object({ id: z.number().int().positive(), surah: z.coerce.number().int(), ayah: z.coerce.number().int(), word: z.coerce.number().int(), text: z.string().min(1) }),
);
type RawWord = z.infer<typeof RawScriptSchema>[string];

/** A line of a QUL layout database (table `pages`). */
export type RawLayoutLine = {
    page_number: number;
    line_number: number;
    line_type: string;
    is_centered: number;
    first_word_id: number | null;
    last_word_id: number | null;
    surah_number: number | null;
};

export function parseQulScript(text: string): Map<number, RawWord> {
    return new Map(Object.values(RawScriptSchema.parse(JSON.parse(text))).map((word) => [word.id, word]));
}

/** The lines of a QUL layout (`.db` download), in page and line order. */
export function readQulLayout(bytes: Uint8Array): RawLayoutLine[] {
    const dir = mkdtempSync(join(tmpdir(), 'qul-layout-'));
    const file = join(dir, 'layout.db');
    try {
        writeFileSync(file, bytes);
        const db = new DatabaseSync(file, { readOnly: true });
        try {
            return db.prepare('SELECT * FROM pages ORDER BY page_number, line_number').all() as unknown as RawLayoutLine[];
        } finally {
            db.close();
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * The pages of a mushaf without their fonts: the lines of the layout, filled with the words of the
 * script. QUL numbers the verse-end marker as the last word of its verse; it becomes word 0.
 */
export function toMushafPages(script: Map<number, RawWord>, layout: RawLayoutLine[]): QuranMushafLine[][] {
    const lastWord = new Map<string, number>();
    for (const word of script.values()) {
        const verse = `${word.surah}:${word.ayah}`;
        lastWord.set(verse, Math.max(lastWord.get(verse) ?? 0, word.word));
    }

    const pages: QuranMushafLine[][] = Array.from({ length: QURAN_MUSHAF_PAGE_COUNT }, () => []);
    for (const line of layout) {
        const page = pages[line.page_number - 1];
        const where = `page ${line.page_number} line ${line.line_number}`;
        if (!page) throw new Error(`${where}: no such page`);
        if (line.line_type === 'surah_name') {
            if (!line.surah_number) throw new Error(`${where}: surah name without a surah`);
            page.push({ type: 'surah-name', surah: line.surah_number });
        } else if (line.line_type === 'basmallah') {
            page.push({ type: 'basmala' });
        } else if (line.line_type === 'ayah') {
            if (!line.first_word_id || !line.last_word_id) throw new Error(`${where}: no words`);
            const words: QuranMushafWord[] = [];
            for (let id = line.first_word_id; id <= line.last_word_id; id++) {
                const word = script.get(id);
                if (!word) throw new Error(`${where}: word ${id} is not in the script`);
                const end = word.word === lastWord.get(`${word.surah}:${word.ayah}`);
                words.push([word.surah, word.ayah, end ? 0 : word.word, word.text]);
            }
            page.push({ type: 'text', centered: line.is_centered === 1, words });
        } else {
            throw new Error(`${where}: unknown line type "${line.line_type}"`);
        }
    }
    return pages;
}

/** Downloads `count` items, `concurrency` at a time, in order. */
async function mapConcurrent<T>(count: number, concurrency: number, task: (index: number) => Promise<T>): Promise<T[]> {
    const results: T[] = new Array(count);
    let next = 0;
    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            while (next < count) {
                const index = next++;
                results[index] = await task(index);
            }
        }),
    );
    return results;
}

export type FetchFont = (url: string) => Promise<Uint8Array>;

const fetchFont: FetchFont = async (url) => {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(url, { headers: { 'user-agent': 'muslimreminder-data-etl (+https://github.com/muslimreminder/data-etl)' } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            if (attempt === 3) throw new Error(`${url}: ${(error as Error).message}`);
            await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
        }
    }
};

/** The source files of a mushaf in the sources bucket, as bytes, and when they were uploaded. */
export type ReadQulBytes = (key: string) => Promise<{ bytes: Uint8Array; modifiedAt: Date } | undefined>;

/**
 * Per mushaf: its page fonts (assets, published first), its layout file, then the catalog. A mushaf
 * whose sources are missing keeps its published catalog entry (its layout file stays published).
 */
export async function buildMushafFiles(
    read: ReadQulBytes,
    options: {
        previous?: QuranMushaf[];
        mushafs?: QulMushaf[];
        fetchFont?: FetchFont;
        concurrency?: number;
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<{ files: OutputFile[]; assets: OutputAsset[] }> {
    const previous = new Map(options.previous?.map((mushaf) => [mushaf.id, mushaf]));
    const files: OutputFile[] = [];
    const assets: OutputAsset[] = [];
    const catalog: QuranMushaf[] = [];

    for (const mushaf of options.mushafs ?? QUL_MUSHAFS) {
        const [script, layout] = await Promise.all([read(qulMushafScriptKey(mushaf.id)), read(qulMushafLayoutKey(mushaf.id))]);
        if (!script || !layout) {
            const kept = previous.get(mushaf.id);
            if (kept) catalog.push(kept);
            options.warn(`${mushaf.id}: no script or layout in the sources bucket${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const lines = toMushafPages(parseQulScript(new TextDecoder().decode(script.bytes)), readQulLayout(layout.bytes));

        let layers = 0;
        const fonts = await mapConcurrent(QURAN_MUSHAF_PAGE_COUNT, options.concurrency ?? 8, async (index) => {
            const page = index + 1;
            const patched = paintTextInForeground(await (options.fetchFont ?? fetchFont)(mushaf.font.url(page)));
            layers += patched.layers;
            const drawn = codePoints(patched.font);
            const missing = lines[index]!.flatMap((line) => (line.type === 'text' ? line.words : []))
                .filter(([, , , glyphs]) => [...glyphs].some((glyph) => !drawn.has(glyph.codePointAt(0)!)));
            if (missing.length > 0) {
                throw new Error(`${mushaf.id}: the font of page ${page} cannot draw ${missing.length} word(s), e.g. ${missing[0]!.slice(0, 3).join(':')}`);
            }
            const sha256 = createHash('sha256').update(patched.font).digest('hex');
            const path = quranMushafFontPath(mushaf.id, page, sha256);
            assets.push({ path, bytes: patched.font, contentType: 'font/ttf' });
            return { path, sha256, bytes: patched.font.length };
        });

        const entry: QuranMushaf = {
            id: mushaf.id,
            name: mushaf.name,
            tajweed: mushaf.tajweed,
            lineCount: Math.max(...lines.map((page) => page.length)),
            bytes: fonts.reduce((sum, font) => sum + font.bytes, 0),
            attribution: {
                source: 'Quranic Universal Library (Tarteel)',
                sourceUrl: `${RESOURCE_URL}/font/${mushaf.font.qulId}`,
                retrievedAt: new Date(Math.max(script.modifiedAt.getTime(), layout.modifiedAt.getTime())).toISOString(),
            },
        };
        const data = QuranMushafFileSchema.parse({
            schemaVersion: 1,
            mushaf: entry,
            pages: fonts.map((font, index) => ({ font, lines: lines[index] })),
        });
        files.push({ key: contentKeys.quran.mushaf(mushaf.id), data });
        catalog.push(entry);
        options.log(`${mushaf.id}: 604 pages, ${(entry.bytes / 1e6).toFixed(1)} MB of fonts, ${layers} layers painted in the text color`);
    }

    files.push({ key: contentKeys.quran.mushafs(), data: QuranMushafsFileSchema.parse({ schemaVersion: 1, mushafs: catalog }) });
    return { files, assets };
}
