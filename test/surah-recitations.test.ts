import { createHash } from 'node:crypto';
import { contentKeys, QURAN_VERSE_COUNTS } from '@muslimreminder/schema/content';
import { describe, expect, it } from 'vitest';
import { mirrorSurahAudio } from '../src/mirror/audio.ts';
import type { ContentStorage, PutBytesOptions, PutOptions } from '../src/publish/storage.ts';
import {
    buildSurahRecitationFiles,
    fetchQulSurahRecitation,
    parseQulSurahRecitation,
    QUL_SURAH_RECITATIONS,
    qulSurahAudioUrls,
    qulSurahRecitationSourceKey,
    toSurahRecitationFile,
    type QulSurahRecitation,
    type RawQulSurahRecitation,
} from '../src/sources/qul/surah-recitations.ts';
import { SURAH_SYNC_STATE_KEY, syncSurahRecitations } from '../src/sources/qul/surah-sync.ts';

const husary: QulSurahRecitation = { id: 'al-husary', apiId: 6, reciter: 'Mahmoud Khalil Al-Husary', style: 'murattal', riwayah: 'hafs' };
const retrievedAt = '2026-11-10T12:00:00.000Z';
const API = 'https://qul.tarteel.ai/api/v1/audio';

/** Every surah, 10 s per verse; a recitation answer of the QUL audio API. */
const detail = (surahs: number = QURAN_VERSE_COUNTS.length) => ({
    id: 6,
    name: 'Mahmoud Khalil Al-Husary (Murattal)',
    has_segments: true,
    audio_files: Object.fromEntries(
        QURAN_VERSE_COUNTS.slice(0, surahs).map((count, index) => [
            String(index + 1),
            { audio_url: `https://audio.example.com/${index + 1}.mp3`, duration: count * 10, file_size: count * 1000, segments_count: count },
        ]),
    ),
});

/** The segments of a surah: each verse 10 s long, its first word timed. */
const segmentsOf = (surah: number) => ({
    audio: { url: `https://audio.example.com/${surah}.mp3`, duration: QURAN_VERSE_COUNTS[surah - 1]! * 10 },
    segments: Object.fromEntries(
        Array.from({ length: QURAN_VERSE_COUNTS[surah - 1]! }, (_, index) => [
            `${surah}:${index + 1}`,
            { time_from: index * 10_000, time_to: index * 10_000 + 9000, duration: 9, segments: [[1, index * 10_000 + 200, index * 10_000 + 900]] },
        ]),
    ),
    pagination: { next_page: null },
});

const raw = (): RawQulSurahRecitation => ({
    recitation: parseQulSurahRecitation(JSON.stringify({ recitation: detail() })).recitation,
    segments: Object.fromEntries(QURAN_VERSE_COUNTS.map((_, index) => [String(index + 1), segmentsOf(index + 1)])),
});

describe('QUL surah recitations', () => {
    it('locates every verse and word in its surah file, and totals the recitation', () => {
        const file = toSurahRecitationFile(husary, raw(), { retrievedAt, warn: () => {} });
        expect(file.surahs).toHaveLength(114);
        expect(file.surahs[0]).toEqual({
            duration: 70_000,
            bytes: 7000,
            verses: Array.from({ length: 7 }, (_, index) => ({
                from: index * 10_000,
                to: index * 10_000 + 9000,
                words: [[1, index * 10_000 + 200, index * 10_000 + 900]],
            })),
        });
        expect(file.recitation).toMatchObject({ surahCount: 114, timedVerseCount: 6236, duration: 62_360_000, bytes: 6_236_000, riwayah: 'hafs' });
        expect(file.recitation.attribution.sourceUrl).toBe(`${API}/surah_recitations/6`);
    });

    it('plays an untimed recitation surah by surah, and leaves out the surahs it lacks', () => {
        const source = raw();
        delete source.segments;
        delete source.recitation.audio_files['114'];
        source.recitation.audio_files['3']!.file_size = undefined;
        const warnings: string[] = [];
        const file = toSurahRecitationFile(husary, source, { retrievedAt, warn: (message) => warnings.push(message) });
        expect(file.surahs[0]).toEqual({ duration: 70_000, bytes: 7000 });
        expect(file.surahs[113]).toBeNull();
        expect(file.recitation).toMatchObject({ surahCount: 113, timedVerseCount: 0 });
        expect(file.recitation.bytes).toBeUndefined();
        expect(warnings).toEqual(['al-husary: 1 surah(s) without audio']);
    });

    it('takes the length from the segments, then from the last verse, when the source gives none', () => {
        const source = raw();
        source.recitation.audio_files['1']!.duration = undefined;
        source.recitation.audio_files['2']!.duration = undefined;
        source.segments!['2']!.audio = {};
        const file = toSurahRecitationFile(husary, source, { retrievedAt, warn: () => {} });
        expect(file.surahs[0]!.duration).toBe(70_000);
        expect(file.surahs[1]!.duration).toBe(285 * 10_000 + 9000);
    });

    it('drops the verses placed before the previous one, and the missing ones', () => {
        const source = raw();
        const fatihah = source.segments!['1']!.segments;
        fatihah['1:3'] = { ...fatihah['1:3']!, time_from: 5000 };
        delete fatihah['1:5'];
        const warnings: string[] = [];
        const file = toSurahRecitationFile(husary, source, { retrievedAt, warn: (message) => warnings.push(message) });
        expect(file.surahs[0]!.verses!.map((verse) => verse?.from ?? null)).toEqual([0, 10_000, null, 30_000, null, 50_000, 60_000]);
        expect(file.recitation.timedVerseCount).toBe(6234);
        expect(warnings).toEqual(['al-husary: surah 1: 1 verse(s) out of order, played without following them']);
    });

    it('lists the audio files by surah, ignoring the keys that are not surahs', () => {
        const source = raw();
        source.recitation.audio_files[''] = { audio_url: 'https://audio.example.com/extra.mp3', duration: undefined, file_size: undefined };
        source.recitation.audio_files['115'] = { audio_url: 'https://audio.example.com/115.mp3', duration: undefined, file_size: undefined };
        const urls = qulSurahAudioUrls(source);
        expect(urls.size).toBe(114);
        expect(urls.get(2)).toBe('https://audio.example.com/2.mp3');
    });

    it('downloads the detail, then the segments of each surah, 286 verses per page', async () => {
        const asked: string[] = [];
        const api = {
            json: async (url: string) => {
                asked.push(url);
                if (url.endsWith('/surah_recitations/6')) return { recitation: detail(2) };
                const surah = Number(new URL(url).searchParams.get('surah'));
                return segmentsOf(surah);
            },
        };
        const fetched = await fetchQulSurahRecitation(api, 6, { segments: true });
        expect(asked).toEqual([`${API}/surah_recitations/6`, `${API}/surah_segments/6?surah=1&per_page=286`, `${API}/surah_segments/6?surah=2&per_page=286`]);
        expect(Object.keys(fetched.segments!)).toEqual(['1', '2']);

        asked.length = 0;
        const kept = await fetchQulSurahRecitation(api, 6, { segments: fetched.segments });
        expect(asked).toHaveLength(1);
        expect(kept.segments).toBe(fetched.segments);
    });

    it('publishes a file per recitation and their catalog, keeping a published one without source', async () => {
        const sources = new Map([[qulSurahRecitationSourceKey('al-husary'), JSON.stringify(raw())]]);
        const read = async (key: string) => (sources.has(key) ? { text: sources.get(key)!, modifiedAt: new Date(retrievedAt) } : undefined);
        const previous = toSurahRecitationFile({ ...husary, id: 'sudais', apiId: 3, reciter: 'Abdur-Rahman as-Sudais' }, raw(), { retrievedAt, warn: () => {} }).recitation;
        const warnings: string[] = [];
        const files = await buildSurahRecitationFiles(read, {
            recitations: [husary, { ...husary, id: 'sudais', apiId: 3 }],
            previous: [previous],
            log: () => {},
            warn: (message) => warnings.push(message),
        });
        expect(files.map((file) => file.key)).toEqual([contentKeys.quran.surahRecitation('al-husary'), contentKeys.quran.surahRecitations()]);
        expect((files[1]!.data as { recitations: { id: string }[] }).recitations.map((recitation) => recitation.id)).toEqual(['al-husary', 'sudais']);
        expect(warnings).toEqual(['sudais: no source at qul/surah-recitations/sudais.json, published version kept']);
    });

    it('has a catalog of unique ids and QUL ids, Hafs only', () => {
        expect(new Set(QUL_SURAH_RECITATIONS.map((recitation) => recitation.id)).size).toBe(QUL_SURAH_RECITATIONS.length);
        expect(new Set(QUL_SURAH_RECITATIONS.map((recitation) => recitation.apiId)).size).toBe(QUL_SURAH_RECITATIONS.length);
        expect(QUL_SURAH_RECITATIONS.every((recitation) => recitation.apiId > 0 && recitation.riwayah === 'hafs')).toBe(true);
        expect(QUL_SURAH_RECITATIONS.every((recitation) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recitation.id))).toBe(true);
    });
});

describe('surah recitation sync', () => {
    const memorySources = () => {
        const objects = new Map<string, string>();
        return {
            objects,
            get: async (key: string) => objects.get(key),
            etag: async (key: string) => (objects.has(key) ? createHash('md5').update(objects.get(key)!).digest('hex') : undefined),
            put: async (key: string, body: string) => void objects.set(key, body),
        };
    };
    const countingApi = () => {
        const asked: string[] = [];
        return {
            asked,
            json: async (url: string) => {
                asked.push(url);
                return url.includes('/surah_recitations/') ? { recitation: detail(2) } : segmentsOf(Number(new URL(url).searchParams.get('surah')));
            },
        };
    };

    it('uploads a new recitation, then only reads its detail while its segments are fresh', async () => {
        const sources = memorySources();
        const api = countingApi();
        const first = await syncSurahRecitations({ api, sources, recitations: [husary], now: new Date('2026-11-10') });
        expect(first).toEqual({ changed: ['al-husary'], unchanged: 0, errors: [] });
        expect(api.asked).toHaveLength(3);
        expect(JSON.parse(sources.objects.get(SURAH_SYNC_STATE_KEY)!)).toEqual({ 'al-husary': { segmentsCheckedAt: '2026-11-10T00:00:00.000Z' } });

        api.asked.length = 0;
        const second = await syncSurahRecitations({ api, sources, recitations: [husary], now: new Date('2026-11-17') });
        expect(second).toEqual({ changed: [], unchanged: 1, errors: [] });
        expect(api.asked).toHaveLength(1);

        api.asked.length = 0;
        await syncSurahRecitations({ api, sources, recitations: [husary], now: new Date('2026-12-09') });
        expect(api.asked).toHaveLength(3);
    });

    it('refreshes the oldest segments first, a few per run', async () => {
        const sources = memorySources();
        const api = countingApi();
        const recitations = ['a', 'b', 'c'].map((id) => ({ ...husary, id }));
        for (const [index, recitation] of recitations.entries()) {
            await syncSurahRecitations({ api, sources, recitations: [recitation], now: new Date(Date.UTC(2026, 9, 1 + index)) });
        }
        api.asked.length = 0;
        await syncSurahRecitations({ api, sources, recitations: recitations.reverse(), now: new Date('2026-12-01'), maxRefreshes: 2 });
        const state = JSON.parse(sources.objects.get(SURAH_SYNC_STATE_KEY)!);
        expect(Object.fromEntries(Object.entries(state).map(([id, value]) => [id, (value as { segmentsCheckedAt: string }).segmentsCheckedAt.slice(0, 10)]))).toEqual({
            a: '2026-12-01',
            b: '2026-12-01',
            c: '2026-10-03',
        });
        expect(api.asked).toHaveLength(3 + 3 + 1);
    });

    it('reports a failing recitation and writes nothing in a dry run', async () => {
        const sources = memorySources();
        const api = { json: async () => ({ recitation: { id: 6 } }) };
        const result = await syncSurahRecitations({ api, sources, recitations: [husary], dryRun: true });
        expect(result.changed).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(sources.objects.size).toBe(0);
    });
});

describe('surah audio mirror', () => {
    class MemoryStorage implements ContentStorage {
        readonly description = 'memory';
        readonly bytes = new Map<string, { body: Uint8Array; options: PutBytesOptions }>();
        async get() {
            return undefined;
        }
        async exists(path: string) {
            return this.bytes.has(path);
        }
        async put(_path: string, _body: string, _options: PutOptions) {}
        async putBytes(path: string, body: Uint8Array, options: PutBytesOptions) {
            this.bytes.set(path, { body, options });
        }
        async list(prefix: string) {
            return new Set([...this.bytes.keys()].filter((key) => key.startsWith(prefix)));
        }
    }

    it('copies the surahs the source has, once', async () => {
        const storage = new MemoryStorage();
        const urls = qulSurahAudioUrls(raw());
        urls.delete(114);
        const mp3 = new Uint8Array([0x49, 0x44, 0x33]);
        const first = await mirrorSurahAudio(husary, { urls, storage, fetchBytes: async () => mp3, wait: async () => {} });
        expect(first).toMatchObject({ uploaded: 113, skipped: 0, failed: [] });
        expect(storage.bytes.has('v1/quran/surah-audio/al-husary/002.mp3')).toBe(true);
        expect(storage.bytes.get('v1/quran/surah-audio/al-husary/001.mp3')?.options.contentType).toBe('audio/mpeg');

        const second = await mirrorSurahAudio(husary, { urls, storage, fetchBytes: async () => mp3, wait: async () => {} });
        expect(second).toMatchObject({ uploaded: 0, skipped: 113 });
    });
});
