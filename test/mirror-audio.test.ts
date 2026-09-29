import { describe, expect, it } from 'vitest';
import { AUDIO_CACHE, AUDIO_CONTENT_TYPE, everyVerse, mirrorRecitationAudio } from '../src/mirror/audio.ts';
import type { ContentStorage, PutBytesOptions, PutOptions } from '../src/publish/storage.ts';

class MemoryStorage implements ContentStorage {
    readonly description = 'memory';
    readonly objects = new Map<string, { body: string; options: PutOptions }>();
    readonly bytes = new Map<string, { body: Uint8Array; options: PutBytesOptions }>();
    async get(path: string) {
        return this.objects.get(path)?.body;
    }
    async exists(path: string) {
        return this.objects.has(path) || this.bytes.has(path);
    }
    async put(path: string, body: string, options: PutOptions) {
        this.objects.set(path, { body, options });
    }
    async putBytes(path: string, body: Uint8Array, options: PutBytesOptions) {
        this.bytes.set(path, { body, options });
    }
    async list(prefix: string) {
        return new Set([...this.objects.keys(), ...this.bytes.keys()].filter((key) => key.startsWith(prefix)));
    }
}

const urlsOf = (keys: string[]) => new Map(keys.map((key) => [key, `https://audio.example.com/${key}.mp3`]));
const everyUrl = () => urlsOf(everyVerse().map((verse) => verse.key));
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
const wait = async () => {};

describe('recitation audio mirror', () => {
    it('copies every verse under a path the apps can compute', async () => {
        const storage = new MemoryStorage();
        const result = await mirrorRecitationAudio({ id: 'al-husary' }, {
            urls: everyUrl(),
            storage,
            fetchBytes: async () => mp3,
            wait,
        });

        expect(result).toMatchObject({ uploaded: 6236, skipped: 0, failed: [], bytes: 6236 * 4 });
        expect(storage.bytes.size).toBe(6236);
        const first = storage.bytes.get('v1/quran/audio/al-husary/001001.mp3');
        expect(first?.options).toEqual({ cacheControl: AUDIO_CACHE, contentType: AUDIO_CONTENT_TYPE });
        expect(storage.bytes.has('v1/quran/audio/al-husary/114006.mp3')).toBe(true);
    });

    it('resumes: what the bucket already holds is not downloaded again', async () => {
        const storage = new MemoryStorage();
        await storage.putBytes('v1/quran/audio/sudais/001001.mp3', mp3, {
            cacheControl: AUDIO_CACHE,
            contentType: AUDIO_CONTENT_TYPE,
        });
        const asked: string[] = [];
        const result = await mirrorRecitationAudio({ id: 'sudais' }, {
            urls: everyUrl(),
            storage,
            fetchBytes: async (url) => {
                asked.push(url);
                return mp3;
            },
            wait,
        });

        expect(result.skipped).toBe(1);
        expect(result.uploaded).toBe(6235);
        expect(asked).not.toContain('https://audio.example.com/1:1.mp3');
    });

    it('retries a verse, then reports the one the source keeps refusing', async () => {
        const storage = new MemoryStorage();
        const tries = new Map<string, number>();
        const result = await mirrorRecitationAudio({ id: 'ar-rifai' }, {
            urls: everyUrl(),
            storage,
            concurrency: 1,
            fetchBytes: async (url) => {
                const count = (tries.get(url) ?? 0) + 1;
                tries.set(url, count);
                if (url === 'https://audio.example.com/2:255.mp3' && count < 3) throw new Error('HTTP 503');
                if (url === 'https://audio.example.com/3:1.mp3') throw new Error('HTTP 404');
                return mp3;
            },
            wait,
        });

        expect(result.failed).toEqual(['3:1']);
        expect(result.uploaded).toBe(6235);
        expect(storage.bytes.has('v1/quran/audio/ar-rifai/002255.mp3')).toBe(true);
        expect(storage.bytes.has('v1/quran/audio/ar-rifai/003001.mp3')).toBe(false);
    });

    it('treats an empty answer as a failure rather than publishing a silent verse', async () => {
        const storage = new MemoryStorage();
        const result = await mirrorRecitationAudio({ id: 'alnufais' }, {
            urls: urlsOf(['1:1']),
            storage,
            attempts: 1,
            fetchBytes: async () => new Uint8Array(),
            wait,
        });

        expect(result.failed).toContain('1:1');
        expect(storage.bytes.size).toBe(0);
    });

    it('downloads but writes nothing on a dry run', async () => {
        const storage = new MemoryStorage();
        const result = await mirrorRecitationAudio({ id: 'al-dosari' }, {
            urls: everyUrl(),
            storage,
            dryRun: true,
            fetchBytes: async () => mp3,
            wait,
        });

        expect(result.uploaded).toBe(6236);
        expect(storage.bytes.size).toBe(0);
    });

    it('walks the 6,236 verses of the mushaf in reading order', () => {
        const verses = everyVerse();
        expect(verses).toHaveLength(6236);
        expect(verses[0]).toEqual({ surah: 1, ayah: 1, key: '1:1' });
        expect(verses.at(-1)).toEqual({ surah: 114, ayah: 6, key: '114:6' });
    });
});
