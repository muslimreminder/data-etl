/**
 * Edits of the color (COLR v0) page fonts of a tajweed mushaf, done on the raw OpenType bytes.
 *
 * The fonts paint the letters black from their palette, and the tajweed marks in color. Apps color
 * a word to highlight it (the verse being recited, the word picked in a menu): a layer painted from the
 * palette ignores that color, so the black layers are switched to the text color (palette index 0xFFFF,
 * "foreground"). The tajweed colors are kept. Black text still renders black.
 */

const FOREGROUND = 0xffff;
/** A palette color this dark is the text itself, not a tajweed rule (QUL palettes hold #000000 and #040000). */
const MAX_TEXT_CHANNEL = 0x10;

type Table = { tag: string; record: number; offset: number; length: number };

function tables(font: Uint8Array): Map<string, Table> {
    const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
    const count = view.getUint16(4);
    const result = new Map<string, Table>();
    for (let index = 0; index < count; index++) {
        const record = 12 + index * 16;
        const tag = String.fromCharCode(...font.subarray(record, record + 4));
        result.set(tag, { tag, record, offset: view.getUint32(record + 8), length: view.getUint32(record + 12) });
    }
    return result;
}

function checksum(view: DataView, offset: number, length: number): number {
    let sum = 0;
    const end = offset + length;
    for (let at = offset; at < end; at += 4) {
        // A table is padded to 4 bytes in the file, but its length is not: the padding counts as zeros.
        let word = 0;
        for (let byte = 0; byte < 4; byte++) word = (word << 8) | (at + byte < end ? view.getUint8(at + byte) : 0);
        sum = (sum + (word >>> 0)) >>> 0;
    }
    return sum;
}

/** Palette indices of palette 0 that hold the text color (black), not a tajweed color. */
function textColorIndices(view: DataView, cpal: Table): Set<number> {
    const entries = view.getUint16(cpal.offset + 2);
    const colorRecords = view.getUint32(cpal.offset + 8);
    const firstOfPalette0 = view.getUint16(cpal.offset + 12);
    const indices = new Set<number>();
    for (let index = 0; index < entries; index++) {
        // Color records are BGRA.
        const at = cpal.offset + colorRecords + (firstOfPalette0 + index) * 4;
        const [blue, green, red, alpha] = [0, 1, 2, 3].map((byte) => view.getUint8(at + byte));
        if (alpha === 0xff && Math.max(red!, green!, blue!) <= MAX_TEXT_CHANNEL) indices.add(index);
    }
    return indices;
}

/**
 * A copy of a COLR v0 font whose black layers take the text color. Returns how many layers changed;
 * a font without COLR/CPAL is returned as is.
 */
export function paintTextInForeground(source: Uint8Array): { font: Uint8Array; layers: number } {
    const font = new Uint8Array(source);
    const view = new DataView(font.buffer);
    const found = tables(font);
    const colr = found.get('COLR');
    const cpal = found.get('CPAL');
    const head = found.get('head');
    if (!colr || !cpal || !head) return { font, layers: 0 };
    if (view.getUint16(colr.offset) !== 0) throw new Error(`COLR version ${view.getUint16(colr.offset)}, only version 0 is supported`);

    const text = textColorIndices(view, cpal);
    const layerRecords = colr.offset + view.getUint32(colr.offset + 8);
    const layerCount = view.getUint16(colr.offset + 12);
    let layers = 0;
    for (let index = 0; index < layerCount; index++) {
        const at = layerRecords + index * 4 + 2;
        if (text.has(view.getUint16(at))) {
            view.setUint16(at, FOREGROUND);
            layers++;
        }
    }
    if (layers === 0) return { font, layers };

    // The COLR checksum, then the whole-font one (head.checkSumAdjustment), computed with the adjustment at 0.
    view.setUint32(colr.record + 4, checksum(view, colr.offset, colr.length));
    view.setUint32(head.offset + 8, 0);
    view.setUint32(head.offset + 8, (0xb1b0afba - checksum(view, 0, font.length)) >>> 0);
    return { font, layers };
}

/** Code points the font draws (cmap format 4 or 12), to check that a page font has every glyph of its page. */
export function codePoints(font: Uint8Array): Set<number> {
    const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
    const cmap = tables(font).get('cmap');
    if (!cmap) throw new Error('no cmap table');
    const points = new Set<number>();
    const count = view.getUint16(cmap.offset + 2);
    for (let index = 0; index < count; index++) {
        const subtable = cmap.offset + view.getUint32(cmap.offset + 4 + index * 8 + 4);
        const format = view.getUint16(subtable);
        if (format === 4) {
            const segments = view.getUint16(subtable + 6) / 2;
            const ends = subtable + 14;
            const starts = ends + segments * 2 + 2;
            for (let segment = 0; segment < segments; segment++) {
                const end = view.getUint16(ends + segment * 2);
                for (let point = view.getUint16(starts + segment * 2); point <= end && point !== 0xffff; point++) points.add(point);
            }
        } else if (format === 12) {
            const groups = view.getUint32(subtable + 12);
            for (let group = 0; group < groups; group++) {
                const at = subtable + 16 + group * 12;
                for (let point = view.getUint32(at); point <= view.getUint32(at + 4); point++) points.add(point);
            }
        }
    }
    return points;
}
