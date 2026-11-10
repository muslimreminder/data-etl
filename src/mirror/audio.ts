import { CONTENT_PATH_PREFIX, quranSurahAudioPath, quranVerseAudioPath, QURAN_VERSE_COUNTS } from '@muslimreminder/schema/content';
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
    /** Files copied during this run. */
    uploaded: number;
    /** Files already in the bucket: a run that is resumed skips them without touching the network. */
    skipped: number;
    /** Files the source would not give, by `surah:verse` or surah number. */
    failed: string[];
    bytes: number;
};

export type MirrorOptions<Key> = {
    /** Where the source hosts each file: by `surah:verse` for verses (see `qulRecitationAudioUrls`), by surah for surahs. */
    urls: Map<Key, string>;
    storage: ContentStorage;
    /** Files fetched at the same time. The sources are public CDNs: stay civil. */
    concurrency?: number;
    /** Attempts per file, with a growing pause between them. */
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

/** A file to copy: `name` identifies it in the logs and in `failed`, `path` is where it goes under the content root. */
type MirrorItem = { name: string; path: string; url: string | undefined };

/**
 * Copies files to the content bucket. A run is resumable: what the bucket already holds is listed once,
 * then left alone. A file the source refuses is reported and does not stop the others.
 */
async function mirrorFiles(label: string, prefix: string, items: MirrorItem[], options: Omit<MirrorOptions<unknown>, 'urls'> & { unit: string }): Promise<MirrorResult> {
    const {
        storage,
        concurrency = 8,
        attempts = 3,
        dryRun = false,
        fetchBytes = defaultFetchBytes,
        wait = sleep,
        log = () => {},
        unit,
    } = options;

    const published = await storage.list(objectKey(prefix));
    const todo = items.filter((item) => !published.has(objectKey(item.path)));
    const result: MirrorResult = { uploaded: 0, skipped: items.length - todo.length, failed: [], bytes: 0 };
    log(`${label}: ${result.skipped} ${unit} already mirrored, ${todo.length} to go`);
    const every = Math.max(1, Math.round(todo.length / 25));

    let next = 0;
    const worker = async () => {
        while (next < todo.length) {
            const item = todo[next++]!;
            if (!item.url) {
                result.failed.push(item.name);
                continue;
            }
            for (let attempt = 1; attempt <= attempts; attempt++) {
                try {
                    const bytes = await fetchBytes(item.url);
                    if (bytes.byteLength === 0) {
                        throw new Error('empty file');
                    }
                    if (!dryRun) {
                        await storage.putBytes(objectKey(item.path), bytes, {
                            cacheControl: AUDIO_CACHE,
                            contentType: AUDIO_CONTENT_TYPE,
                        });
                    }
                    result.uploaded++;
                    result.bytes += bytes.byteLength;
                    if (result.uploaded % every === 0) {
                        log(`${label}: ${result.uploaded}/${todo.length} ${unit}`);
                    }
                    break;
                } catch (error) {
                    if (attempt === attempts) {
                        result.failed.push(item.name);
                        log(`${label}: ${item.name} unavailable (${(error as Error).message})`);
                    } else {
                        await wait(500 * 2 ** (attempt - 1));
                    }
                }
            }
        }
    };

    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
    return result;
}

/**
 * Copies a recitation to the content bucket, one file per verse at `quran/audio/<id>/<sss><vvv>.mp3`.
 *
 * Resumable: the same recitation can be mirrored again after an interrupted run without downloading
 * it all over again. A missing verse does not stop the others: the app falls back on the verses it can
 * play, and the next run picks the missing ones up.
 */
export function mirrorRecitationAudio(recitation: Pick<QulRecitation, 'id'>, options: MirrorOptions<string>): Promise<MirrorResult> {
    const items = everyVerse().map(({ surah, ayah, key }) => ({
        name: key,
        path: quranVerseAudioPath(recitation.id, surah, ayah),
        url: options.urls.get(key),
    }));
    return mirrorFiles(recitation.id, `quran/audio/${recitation.id}/`, items, { ...options, unit: 'verses' });
}

/**
 * Copies a recitation streamed surah by surah, one file per surah at `quran/surah-audio/<id>/<sss>.mp3`.
 * Only the surahs the source has are copied (`urls`, by surah number).
 */
export function mirrorSurahAudio(recitation: { id: string }, options: MirrorOptions<number>): Promise<MirrorResult> {
    const items = [...options.urls.keys()]
        .sort((a, b) => a - b)
        .map((surah) => ({ name: String(surah), path: quranSurahAudioPath(recitation.id, surah), url: options.urls.get(surah) }));
    return mirrorFiles(recitation.id, `quran/surah-audio/${recitation.id}/`, items, { ...options, unit: 'surahs' });
}
