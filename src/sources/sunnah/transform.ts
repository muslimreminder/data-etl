import type { Attribution, LocalizedText } from '@muslimreminder/schema/common';
import type {
    HadithBook,
    HadithBookFile,
    HadithChapter,
    HadithCollection,
    HadithGrade,
    HadithText,
    Hadith,
} from '@muslimreminder/schema/content';
import { segmentsFor, type SunnahDump } from './dump.ts';
import type { RawBook, RawChapter, RawCollection, RawHadith } from './raw.ts';
import { htmlToText, splitNarrator } from './text.ts';

/** Languages published from sunnah.com. French will come from another source. */
export const LANGUAGES = ['ar', 'en'] as const;
const isPublishedLanguage = (lang: string) => (LANGUAGES as readonly string[]).includes(lang);

const NO_CHAPTER = '0.00';

export const SUNNAH_ATTRIBUTION = { source: 'sunnah.com', sourceUrl: 'https://sunnah.com' } as const;

/** `[{ lang, name }]` → `{ en, ar }`, dropping empty values and unpublished languages. */
export function localized<T extends { lang: string }>(entries: T[], pick: (entry: T) => string | null | undefined): LocalizedText | undefined {
    const result: LocalizedText = {};
    for (const entry of entries) {
        const raw = pick(entry);
        const text = raw ? htmlToText(raw) : '';
        if (text && isPublishedLanguage(entry.lang) && !(entry.lang in result)) {
            result[entry.lang] = text;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

export function toCollection(
    raw: RawCollection,
    stats: { bookCount: number; hadithCount: number; languages: string[] },
    retrievedAt: string,
): HadithCollection {
    const shortIntro = localized(raw.collection, (entry) => entry.shortIntro);
    const attribution: Attribution = { ...SUNNAH_ATTRIBUTION, retrievedAt };
    return {
        id: raw.name,
        name: localized(raw.collection, (entry) => entry.title) ?? { en: raw.name },
        ...(shortIntro && { shortIntro }),
        bookCount: stats.bookCount,
        hadithCount: stats.hadithCount,
        languages: stats.languages,
        attribution,
    };
}

export function toBook(raw: RawBook, order: number, hadithCount: number): HadithBook {
    const first = raw.hadithStartNumber;
    const last = raw.hadithEndNumber;
    return {
        id: raw.bookNumber,
        order,
        name: localized(raw.book, (entry) => entry.name) ?? { en: `Book ${raw.bookNumber}` },
        hadithCount,
        ...(first && last && first <= last ? { numberRange: { first, last } } : {}),
    };
}

export function toChapter(raw: RawChapter): HadithChapter {
    const intro = localized(raw.chapter, (entry) => entry.intro);
    const number = raw.chapter.find((entry) => entry.chapterNumber)?.chapterNumber ?? raw.chapterId;
    return {
        id: raw.chapterId,
        title: localized(raw.chapter, (entry) => entry.chapterTitle) ?? { en: `Chapter ${number}` },
        ...(intro && { intro }),
    };
}

function toGrades(raw: RawHadith['hadith'][number]['grades']): HadithGrade[] {
    return (raw ?? [])
        .map((grade) => ({ grade: htmlToText(grade.grade), gradedBy: grade.graded_by ? htmlToText(grade.graded_by) || null : null }))
        .filter((grade) => grade.grade.length > 0);
}

/** sunnah.com URN, unique in the collection: the Arabic one, else the English one. */
export const hadithUrn = (raw: RawHadith) =>
    raw.hadith.find((entry) => entry.lang === 'ar')?.urn ?? raw.hadith.find((entry) => entry.lang === 'en')?.urn ?? undefined;

/** Chapters named in the hadiths themselves, for collections without a chapters endpoint (e.g. Shamail). */
export function chaptersFromHadiths(rawHadiths: RawHadith[], known: ReadonlySet<string>): HadithChapter[] {
    const chapters = new Map<string, HadithChapter>();
    for (const raw of rawHadiths) {
        if (!raw.chapterId || raw.chapterId === NO_CHAPTER || known.has(raw.chapterId) || chapters.has(raw.chapterId)) continue;
        const title = localized(raw.hadith, (entry) => entry.chapterTitle);
        if (title) chapters.set(raw.chapterId, { id: raw.chapterId, title });
    }
    return [...chapters.values()];
}

export function toHadith(raw: RawHadith, chapterIds: ReadonlySet<string>, dump?: SunnahDump): Hadith | undefined {
    const texts: Record<string, HadithText> = {};
    for (const entry of raw.hadith) {
        const text = entry.body ? htmlToText(entry.body) : '';
        if (!text || !isPublishedLanguage(entry.lang) || entry.lang in texts) {
            continue;
        }
        const { narrator, body } = entry.lang === 'en' ? splitNarrator(text) : { body: text };
        const segments = entry.lang === 'ar' && entry.urn ? segmentsFor(dump?.byArabicUrn.get(entry.urn), body) : undefined;
        texts[entry.lang] = { ...(narrator && { narrator }), body, ...(segments && { segments }), grades: toGrades(entry.grades) };
    }
    if (Object.keys(texts).length === 0) {
        return undefined;
    }
    return {
        id: String(hadithUrn(raw)),
        collectionId: raw.collection,
        bookId: raw.bookNumber,
        number: raw.hadithNumber,
        ...(raw.chapterId && chapterIds.has(raw.chapterId) ? { chapterId: raw.chapterId } : {}),
        texts,
    };
}

/**
 * One book file. Drops what the schema would reject (hadith without text, duplicate numbers)
 * and reports it, instead of failing the whole run for one upstream glitch.
 */
export function toBookFile(
    collectionId: string,
    rawBook: RawBook,
    order: number,
    rawChapters: RawChapter[],
    rawHadiths: RawHadith[],
    warn: (message: string) => void,
    dump?: SunnahDump,
): HadithBookFile | undefined {
    const fromEndpoint = uniqueBy(rawChapters.map(toChapter), (chapter) => chapter.id);
    const chapters = [...fromEndpoint, ...chaptersFromHadiths(rawHadiths, new Set(fromEndpoint.map((chapter) => chapter.id)))];
    const chapterIds = new Set(chapters.map((chapter) => chapter.id));

    const hadiths: Hadith[] = [];
    const ids = new Set<string>();
    for (const raw of rawHadiths) {
        const where = `${collectionId}/${rawBook.bookNumber} #${raw.hadithNumber.trim() || '?'}`;
        if (raw.collection !== collectionId || raw.bookNumber !== rawBook.bookNumber) {
            warn(`${where}: belongs to ${raw.collection}/${raw.bookNumber}, skipped`);
            continue;
        }
        const urn = hadithUrn(raw);
        if (!raw.hadithNumber.trim() || urn === undefined) {
            warn(`${where} (urn ${urn ?? '?'}): no ${urn === undefined ? 'urn' : 'number'}, skipped`);
            continue;
        }
        if (ids.has(String(urn))) {
            warn(`${where}: duplicate urn ${urn}, skipped`);
            continue;
        }
        const hadith = toHadith(raw, chapterIds, dump);
        if (!hadith) {
            warn(`${where}: no ar/en text, skipped`);
            continue;
        }
        // "0.00" is sunnah.com's "no chapter" (e.g. Musnad Ahmad).
        if (raw.chapterId && raw.chapterId !== NO_CHAPTER && !hadith.chapterId) {
            warn(`${where}: unknown chapter ${raw.chapterId}, chapter dropped`);
        }
        ids.add(hadith.id);
        hadiths.push(hadith);
    }
    if (hadiths.length === 0) {
        return undefined;
    }

    // Only keep chapters that are used, in source order.
    const usedChapters = new Set(hadiths.map((hadith) => hadith.chapterId));
    return {
        schemaVersion: 1,
        collectionId,
        book: toBook(rawBook, order, hadiths.length),
        chapters: chapters.filter((chapter) => usedChapters.has(chapter.id)),
        hadiths,
    };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        const k = key(item);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
