/**
 * A mushaf the apps can download instead of the one they ship: its glyph font (one per page), the glyph of
 * every word in that font, and the layout of the page lines. QUL publishes the three as separate resources.
 */
export type QulMushaf = {
    id: string;
    name: string;
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
        // File names guessed (not downloaded yet): a mismatch fails the sync with the real name.
        script: { qulId: 47, file: /v4.*\.json$/i },
        layout: { qulId: 19, file: /\.(db|sqlite)$/i },
        font: { qulId: 240, url: (page) => `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/ttf/p${page}.ttf` },
    },
];

/** Object keys of the downloaded QUL files in the private sources bucket. */
export const qulMushafScriptKey = (id: string) => `qul/mushafs/${id}/script.json`;
export const qulMushafLayoutKey = (id: string) => `qul/mushafs/${id}/layout.sqlite`;
