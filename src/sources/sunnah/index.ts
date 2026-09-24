import {
    contentKeys,
    HadithBookFileSchema,
    HadithBooksFileSchema,
    HadithCollectionsFileSchema,
    type HadithCollection,
} from '@muslimreminder/schema/content';
import type { OutputFile } from '../../output.ts';
import type { SunnahClient } from './client.ts';
import { LANGUAGES, toBookFile, toCollection } from './transform.ts';

const BOOK_CONCURRENCY = 3;

export type BuildHadithOptions = {
    /** Only rebuild these collections (default: every collection with hadiths). */
    only?: string[];
    /** Currently published collections: kept for collections not rebuilt, and to keep `retrievedAt` stable. */
    previous?: HadithCollection[];
    retrievedAt: string;
    log: (message: string) => void;
    warn: (message: string) => void;
};

export async function buildHadithFiles(client: SunnahClient, options: BuildHadithOptions): Promise<OutputFile[]> {
    const { log, warn } = options;
    const rawCollections = await client.collections();
    const unknown = options.only?.filter((id) => !rawCollections.some((raw) => raw.name === id)) ?? [];
    if (unknown.length > 0) {
        throw new Error(`Unknown sunnah.com collection(s): ${unknown.join(', ')}`);
    }

    const previous = new Map(options.previous?.map((collection) => [collection.id, collection]));
    const files: OutputFile[] = [];
    const collections: HadithCollection[] = [];

    for (const rawCollection of rawCollections) {
        const id = rawCollection.name;
        if (options.only && !options.only.includes(id)) {
            const kept = previous.get(id);
            if (kept) collections.push(kept);
            continue;
        }
        if (!rawCollection.totalAvailableHadith) {
            log(`${id}: no hadith available on sunnah.com, skipped`);
            continue;
        }

        const rawBooks = (await client.books(id)).filter((rawBook) => rawBook.numberOfHadith);
        // sunnah.com takes ~5 s per page: fetch a few books at a time, keep the source order.
        const fetched = await mapWithConcurrency(rawBooks, BOOK_CONCURRENCY, async (rawBook) => {
            const rawHadiths = await client.hadiths(id, rawBook.bookNumber);
            const rawChapters = rawCollection.hasChapters === 'yes' && rawHadiths.length > 0
                ? await client.chapters(id, rawBook.bookNumber)
                : [];
            return { rawBook, rawHadiths, rawChapters };
        });

        const books = [];
        const languages = new Set<string>();
        let hadithCount = 0;
        for (const { rawBook, rawHadiths, rawChapters } of fetched) {
            const bookFile = toBookFile(id, rawBook, books.length + 1, rawChapters, rawHadiths, warn);
            if (!bookFile) continue;

            files.push({ key: contentKeys.hadith.book(id, bookFile.book.id), data: HadithBookFileSchema.parse(bookFile) });
            books.push(bookFile.book);
            hadithCount += bookFile.hadiths.length;
            bookFile.hadiths.forEach((hadith) => Object.keys(hadith.texts).forEach((lang) => languages.add(lang)));
        }

        if (books.length === 0) {
            log(`${id}: no book with hadiths, skipped`);
            continue;
        }
        files.push({
            key: contentKeys.hadith.books(id),
            data: HadithBooksFileSchema.parse({ schemaVersion: 1, collectionId: id, books }),
        });

        const collection = toCollection(
            rawCollection,
            { bookCount: books.length, hadithCount, languages: LANGUAGES.filter((lang) => languages.has(lang)) },
            options.retrievedAt,
        );
        collections.push(keepRetrievedAtIfUnchanged(collection, previous.get(id)));
        log(`${id}: ${books.length} books, ${hadithCount} hadiths (${client.requestCount} requests so far)`);
    }

    files.push({
        key: contentKeys.hadith.collections(),
        data: HadithCollectionsFileSchema.parse({ schemaVersion: 1, collections }),
    });
    return files;
}

/** Avoids republishing the collections file (and the manifest) when only the fetch date changed. */
function keepRetrievedAtIfUnchanged(next: HadithCollection, previous: HadithCollection | undefined): HadithCollection {
    if (!previous) return next;
    const withoutDate = (collection: HadithCollection) =>
        JSON.stringify({ ...collection, attribution: { ...collection.attribution, retrievedAt: '' } });
    return withoutDate(next) === withoutDate(previous) ? previous : next;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index] as T);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}
