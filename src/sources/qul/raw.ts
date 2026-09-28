import { QURAN_VERSE_COUNTS } from '@muslimreminder/schema/content';
import { z } from 'zod';

/**
 * A QUL translation JSON (`simple.json` or `translation-with-footnote-tags.json`):
 * `{ "2:43": { "t": "…<sup foot_note=\"230183\">1</sup>", "f": { "230183": "…" } } }`.
 */
export const RawQulVerseSchema = z.object({
    t: z.string(),
    /** Footnotes by id, referenced by `<sup foot_note="id">` in `t`. Only in the footnote-tags format. */
    f: z.record(z.string(), z.string()).optional(),
});
export type RawQulVerse = z.infer<typeof RawQulVerseSchema>;

export const RawQulTranslationSchema = z.record(z.string(), RawQulVerseSchema).superRefine((raw, ctx) => {
    const missing = QURAN_VERSE_COUNTS.flatMap((count, surah) =>
        Array.from({ length: count }, (_, verse) => `${surah + 1}:${verse + 1}`),
    ).filter((key) => !(key in raw));
    if (missing.length > 0) {
        ctx.addIssue({ code: 'custom', message: `Missing ${missing.length} verse(s), e.g. ${missing.slice(0, 3).join(', ')}` });
    }
    const expected = QURAN_VERSE_COUNTS.reduce((sum, count) => sum + count, 0);
    const count = Object.keys(raw).length;
    if (count !== expected) {
        ctx.addIssue({ code: 'custom', message: `Expected ${expected} verses, got ${count}` });
    }
});
export type RawQulTranslation = z.infer<typeof RawQulTranslationSchema>;

/** Parses a downloaded file; throws with a readable message when it is not a QUL translation. */
export function parseQulTranslation(text: string): RawQulTranslation {
    const result = RawQulTranslationSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL translation: ${result.error.issues.slice(0, 3).map((issue) => issue.message).join('; ')}`);
    }
    return result.data;
}

/** Whether the file carries footnotes, i.e. is the footnote-tags download rather than `simple.json`. */
export const hasFootnoteTags = (raw: RawQulTranslation): boolean => Object.values(raw).some((verse) => verse.f !== undefined);
