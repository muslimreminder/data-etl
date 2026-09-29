import { CONTENT_PATH_PREFIX, quranVerseAudioPath, QURAN_VERSE_COUNTS } from '@muslimreminder/schema/content';
import { IMMUTABLE_CACHE } from '../publish/publish.ts';
import type { ContentStorage } from '../publish/storage.ts';
import type { QulRecitation } from '../sources/qul/recitations.ts';

export const AUDIO_CONTENT_TYPE = 'audio/mpeg';

/** The audio files never change: cached for a year by the CDN, like the hashed JSON ones. */
export const AUDIO_CACHE = IMMUTABLE_CACHE;

const objectKey = (path: string) => `${CONTENT_PATH_PREFIX}/${path}`;

/** The 6,236 verses of the mushaf, in reading order. */
export const everyVerse = (): { surah: number; ayah: number; key: string }[] =>
    QURAN_VERSE_COUNTS.flatMap((count, surah) =>
        Array.from({ length: count }, (_, ayah) => ({
            surah: surah + 1,
            ayah: ayah + 1,
            key: `${surah + 1}:${ayah + 1}`,
        })),
    );

export type MirrorResult = {
    /** Verses copied during this run. */
    uploaded: number;
    /** Verses already in the bucket: a run that is resumed skips them without touching the network. */
    skipped: number;
    /** Verses the source would not give, by `surah:verse`. */
    failed: string[];
    bytes: number;
};

export type MirrorOptions = {
    /** Where the source hosts each verse, by `surah:verse` (see `qulRecitationAudioUrls`). */
    urls: Map<string, string>;
    storage: ContentStorage;
    /** Verses fetched at the same time. The sources are public CDNs: stay civil. */
    concurrency?: number;
    /** Attempts per verse, with a growing pause between them. */
    attempts?: number;
    dryRun?: boolean;
    fetchBytes?: (url: string) => Promise<Uint8Array>;
    wait?: (ms: number) => Promise<void>;
    log?: (message: string) => void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const defaultFetchBytes = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
};

/**
 * Copies a recitation to the content bucket, one file per verse at `quran/audio/<id>/<sss><vvv>.mp3`.
 *
 * A run is resumable: what the bucket already holds is listed once, then left alone — the same
 * recitation can be mirrored again after an interrupted run without downloading it all over again.
 * A verse the source refuses is reported and does not stop the others: the app falls back on the
 * verses it can play, and the next run picks the missing ones up.
 */
export async function mirrorRecitationAudio(
    recitation: Pick<QulRecitation, 'id'>,
    options: MirrorOptions,
): Promise<MirrorResult> {
    const {
        urls,
        storage,
        concurrency = 8,
        attempts = 3,
        dryRun = false,
        fetchBytes = defaultFetchBytes,
        wait = sleep,
        log = () => {},
    } = options;

    const prefix = objectKey(`quran/audio/${recitation.id}/`);
    const published = await storage.list(prefix);
    const verses = everyVerse().filter(({ surah, ayah }) => !published.has(objectKey(quranVerseAudioPath(recitation.id, surah, ayah))));
    const result: MirrorResult = { uploaded: 0, skipped: 6236 - verses.length, failed: [], bytes: 0 };
    log(`${recitation.id}: ${result.skipped} verses already mirrored, ${verses.length} to go`);

    let next = 0;
    const worker = async () => {
        while (next < verses.length) {
            const verse = verses[next++]!;
            const url = urls.get(verse.key);
            if (!url) {
                result.failed.push(verse.key);
                continue;
            }
            for (let attempt = 1; attempt <= attempts; attempt++) {
                try {
                    const bytes = await fetchBytes(url);
                    if (bytes.byteLength === 0) {
                        throw new Error('empty file');
                    }
                    if (!dryRun) {
                        await storage.putBytes(objectKey(quranVerseAudioPath(recitation.id, verse.surah, verse.ayah)), bytes, {
                            cacheControl: AUDIO_CACHE,
                            contentType: AUDIO_CONTENT_TYPE,
                        });
                    }
                    result.uploaded++;
                    result.bytes += bytes.byteLength;
                    if (result.uploaded % 250 === 0) {
                        log(`${recitation.id}: ${result.uploaded}/${verses.length} verses`);
                    }
                    break;
                } catch (error) {
                    if (attempt === attempts) {
                        result.failed.push(verse.key);
                        log(`${recitation.id}: ${verse.key} unavailable (${(error as Error).message})`);
                    } else {
                        await wait(500 * 2 ** (attempt - 1));
                    }
                }
            }
        }
    };

    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, verses.length)) }, worker));
    return result;
}
