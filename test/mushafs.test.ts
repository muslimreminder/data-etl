import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { QURAN_VERSE_COUNTS, QuranMushafFileSchema } from '@muslimreminder/schema/content';
import { describe, expect, it } from 'vitest';
import { codePoints, paintTextInForeground } from '../src/sources/qul/font.ts';
import {
    buildMushafFiles,
    parseQulScript,
    QUL_MUSHAFS,
    qulMushafLayoutKey,
    qulMushafScriptKey,
    readQulLayout,
    toMushafPages,
    type RawLayoutLine,
} from '../src/sources/qul/mushafs.ts';

/** A minimal OpenType font: head, cmap (format 4, one range), CPAL (one palette) and COLR v0. */
function font(options: { colors: [number, number, number][]; layers: number[]; firstCode: number; lastCode: number }) {
    const u16 = (value: number) => [value >> 8, value & 0xff];
    const u32 = (value: number) => [...u16(value >>> 16), ...u16(value & 0xffff)];
    const head = new Array(54).fill(0);
    const cmap = [
        ...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12),
        ...u16(4), ...u16(32), ...u16(0), ...u16(4), ...u16(0), ...u16(0), ...u16(0),
        ...u16(options.lastCode), ...u16(0xffff), ...u16(0), ...u16(options.firstCode), ...u16(0xffff), ...u16(0), ...u16(1), ...u16(0), ...u16(0),
    ];
    const cpal = [
        ...u16(0), ...u16(options.colors.length), ...u16(1), ...u16(options.colors.length), ...u32(14), ...u16(0),
        ...options.colors.flatMap(([red, green, blue]) => [blue, green, red, 0xff]),
    ];
    const colr = [
        ...u16(0), ...u16(1), ...u32(14), ...u32(20), ...u16(options.layers.length),
        ...u16(1), ...u16(0), ...u16(options.layers.length),
        ...options.layers.flatMap((color, index) => [...u16(index + 2), ...u16(color)]),
    ];
    const tables = [['COLR', colr], ['CPAL', cpal], ['cmap', cmap], ['head', head]] as const;
    let offset = 12 + tables.length * 16;
    const directory: number[] = [];
    const bodies: number[] = [];
    for (const [tag, body] of tables) {
        const padded = [...body, ...new Array((4 - (body.length % 4)) % 4).fill(0)];
        directory.push(...[...tag].map((char) => char.charCodeAt(0)), ...u32(0), ...u32(offset), ...u32(body.length));
        bodies.push(...padded);
        offset += padded.length;
    }
    return new Uint8Array([...u32(0x00010000), ...u16(tables.length), 0, 0, 0, 0, 0, 0, ...directory, ...bodies]);
}

const layerColors = (bytes: Uint8Array) => {
    const view = new DataView(bytes.buffer);
    const colr = 12 + 0 * 16;
    const offset = view.getUint32(colr + 8);
    const count = view.getUint16(offset + 12);
    return Array.from({ length: count }, (_, index) => view.getUint16(offset + 20 + index * 4 + 2));
};

describe('mushaf fonts', () => {
    it('paints the black layers in the text color and keeps the tajweed colors', () => {
        const source = font({ colors: [[0, 0, 0], [0xb5, 0, 0], [4, 0, 0]], layers: [0, 1, 2, 1], firstCode: 0xfc41, lastCode: 0xfc43 });
        const { font: patched, layers } = paintTextInForeground(source);
        expect(layers).toBe(2);
        expect(layerColors(patched)).toEqual([0xffff, 1, 0xffff, 1]);
        expect(layerColors(source)).toEqual([0, 1, 2, 1]);

        // Whole-font checksum: the sum of the font, adjustment included, is the magic number.
        const view = new DataView(patched.buffer);
        let sum = 0;
        for (let at = 0; at < patched.length; at += 4) sum = (sum + view.getUint32(at)) >>> 0;
        expect(sum).toBe(0xb1b0afba);
        expect([...codePoints(patched)]).toEqual([0xfc41, 0xfc42, 0xfc43]);
    });
});

/** A Quran of one word per verse, whose verse `s:a` is drawn by word ids `2n - 1` (the word) and `2n` (the marker). */
const verses = QURAN_VERSE_COUNTS.flatMap((count, surah) => Array.from({ length: count }, (_, ayah) => [surah + 1, ayah + 1] as const));
const script = Object.fromEntries(
    verses.flatMap(([surah, ayah], index) => [
        [`${surah}:${ayah}:1`, { id: 2 * index + 1, surah: String(surah), ayah: String(ayah), word: '1', location: `${surah}:${ayah}:1`, text: 'ﱁ' }],
        [`${surah}:${ayah}:2`, { id: 2 * index + 2, surah: String(surah), ayah: String(ayah), word: '2', location: `${surah}:${ayah}:2`, text: 'ﱂ' }],
    ]),
);
const perPage = Math.ceil(verses.length / 604);
const layout: RawLayoutLine[] = Array.from({ length: 604 }, (_, index) => {
    const first = index * perPage;
    const last = Math.min(verses.length, first + perPage) - 1;
    const line = { page_number: index + 1, line_number: 2, is_centered: 0, surah_number: null };
    return last < first
        ? { ...line, line_type: 'basmallah', first_word_id: null, last_word_id: null }
        : { ...line, line_type: 'ayah', first_word_id: 2 * first + 1, last_word_id: 2 * last + 2 };
});
layout.unshift({ page_number: 1, line_number: 1, line_type: 'surah_name', is_centered: 1, first_word_id: null, last_word_id: null, surah_number: 1 });

function layoutDatabase(lines: RawLayoutLine[]): Uint8Array {
    const dir = mkdtempSync(join(tmpdir(), 'mushaf-test-'));
    try {
        const db = new DatabaseSync(join(dir, 'layout.db'));
        db.exec('CREATE TABLE pages (page_number INTEGER, line_number INTEGER, line_type TEXT, is_centered INTEGER, first_word_id INTEGER, last_word_id INTEGER, surah_number INTEGER)');
        const insert = db.prepare('INSERT INTO pages VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const line of lines) {
            insert.run(line.page_number, line.line_number, line.line_type, line.is_centered, line.first_word_id, line.last_word_id, line.surah_number);
        }
        db.close();
        return new Uint8Array(readFileSync(join(dir, 'layout.db')));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('mushaf layout', () => {
    it('fills the layout lines with the script words, the verse marker as word 0', () => {
        const pages = toMushafPages(parseQulScript(JSON.stringify(script)), readQulLayout(layoutDatabase(layout)));
        expect(pages[0]![0]).toEqual({ type: 'surah-name', surah: 1 });
        expect(pages[0]![1]).toMatchObject({ type: 'text', centered: false });
        const words = pages[0]![1]!.type === 'text' ? pages[0]![1]!.words : [];
        expect(words.slice(0, 2)).toEqual([[1, 1, 1, 'ﱁ'], [1, 1, 0, 'ﱂ']]);
    });

    it('fails on a line whose words are not in the script', () => {
        const broken = [...layout, { ...layout[1]!, line_number: 3, first_word_id: 999_999, last_word_id: 999_999 }];
        expect(() => toMushafPages(parseQulScript(JSON.stringify(script)), broken)).toThrow(/not in the script/);
    });

    it('publishes the fonts as assets and lists them in the layout file', async () => {
        const mushaf = QUL_MUSHAFS[0]!;
        const sources: Record<string, Uint8Array> = {
            [qulMushafScriptKey(mushaf.id)]: new TextEncoder().encode(JSON.stringify(script)),
            [qulMushafLayoutKey(mushaf.id)]: layoutDatabase(layout),
        };
        const modifiedAt = new Date('2026-10-15T08:43:00.000Z');
        const pageFont = font({ colors: [[0, 0, 0], [0xb5, 0, 0]], layers: [0, 1], firstCode: 0xfc41, lastCode: 0xfc42 });
        const urls: string[] = [];
        const { files, assets } = await buildMushafFiles(async (key) => sources[key] && { bytes: sources[key], modifiedAt }, {
            fetchFont: async (url) => {
                urls.push(url);
                return pageFont;
            },
            log: () => {},
            warn: () => {},
        });
        expect(urls).toHaveLength(604);
        expect(assets).toHaveLength(604);
        expect(assets[2]!.path).toMatch(/^quran\/mushafs\/qpc-v4-tajweed\/fonts\/003\.[a-f0-9]{8}\.ttf$/);
        const layoutFile = QuranMushafFileSchema.parse(files[0]!.data);
        expect(layoutFile.pages[2]!.font.path).toBe(assets[2]!.path);
        expect(layoutFile.mushaf).toMatchObject({ tajweed: true, bytes: 604 * pageFont.length, attribution: { retrievedAt: modifiedAt.toISOString() } });
        expect(files[1]).toMatchObject({ key: 'quran/mushafs', data: { mushafs: [layoutFile.mushaf] } });
    });

    it('fails when a page font cannot draw a word of its page', async () => {
        const mushaf = QUL_MUSHAFS[0]!;
        const sources: Record<string, Uint8Array> = {
            [qulMushafScriptKey(mushaf.id)]: new TextEncoder().encode(JSON.stringify(script)),
            [qulMushafLayoutKey(mushaf.id)]: layoutDatabase(layout),
        };
        const narrow = font({ colors: [[0, 0, 0]], layers: [0], firstCode: 0xfc41, lastCode: 0xfc41 });
        await expect(
            buildMushafFiles(async (key) => sources[key] && { bytes: sources[key], modifiedAt: new Date() }, {
                fetchFont: async () => narrow,
                log: () => {},
                warn: () => {},
            }),
        ).rejects.toThrow(/cannot draw/);
    });
});
