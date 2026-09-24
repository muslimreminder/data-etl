import { z } from 'zod';

/**
 * Raw sunnah.com API v1 responses (https://sunnah.stoplight.io/docs/api).
 * Validated so that an upstream format change fails the run instead of publishing broken data.
 */

const langEntry = <T extends z.ZodRawShape>(shape: T) => z.object({ lang: z.string(), ...shape });

export const paginated = <T extends z.ZodType>(item: T) =>
    z.object({
        data: z.array(item),
        total: z.number(),
        limit: z.number(),
        previous: z.number().nullable(),
        next: z.number().nullable(),
    });

export const RawCollectionSchema = z.object({
    name: z.string(),
    hasBooks: z.enum(['yes', 'no']),
    hasChapters: z.enum(['yes', 'no']),
    collection: z.array(langEntry({ title: z.string(), shortIntro: z.string().nullable().optional() })),
    totalHadith: z.number().nullable(),
    totalAvailableHadith: z.number().nullable(),
});
export type RawCollection = z.infer<typeof RawCollectionSchema>;

export const RawBookSchema = z.object({
    bookNumber: z.string(),
    book: z.array(langEntry({ name: z.string().nullable() })),
    hadithStartNumber: z.number().nullable(),
    hadithEndNumber: z.number().nullable(),
    numberOfHadith: z.number().nullable(),
});
export type RawBook = z.infer<typeof RawBookSchema>;

export const RawChapterSchema = z.object({
    bookNumber: z.string(),
    chapterId: z.string(),
    chapter: z.array(
        langEntry({
            chapterNumber: z.string().nullable(),
            chapterTitle: z.string().nullable(),
            intro: z.string().nullable(),
            ending: z.string().nullable(),
        }),
    ),
});
export type RawChapter = z.infer<typeof RawChapterSchema>;

export const RawHadithSchema = z.object({
    collection: z.string(),
    bookNumber: z.string(),
    chapterId: z.string().nullable(),
    hadithNumber: z.string(),
    hadith: z.array(
        langEntry({
            chapterNumber: z.string().nullable(),
            chapterTitle: z.string().nullable(),
            urn: z.number().nullable(),
            body: z.string().nullable(),
            grades: z.array(z.object({ graded_by: z.string().nullable(), grade: z.string() })).nullable(),
        }),
    ),
});
export type RawHadith = z.infer<typeof RawHadithSchema>;
