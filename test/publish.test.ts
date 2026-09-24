import { ManifestSchema } from '@muslimreminder/schema/content';
import { describe, expect, it } from 'vitest';
import { IMMUTABLE_CACHE, MANIFEST_CACHE, publish, readManifest } from '../src/publish/publish.ts';
import type { ContentStorage, PutOptions } from '../src/publish/storage.ts';

class MemoryStorage implements ContentStorage {
    readonly description = 'memory';
    readonly objects = new Map<string, { body: string; options: PutOptions }>();
    readonly puts: string[] = [];
    async get(path: string) {
        return this.objects.get(path)?.body;
    }
    async exists(path: string) {
        return this.objects.has(path);
    }
    async put(path: string, body: string, options: PutOptions) {
        this.objects.set(path, { body, options });
        this.puts.push(path);
    }
}

const log = () => {};
const run = async (storage: MemoryStorage, files: { key: string; data: unknown }[], dryRun = false) =>
    publish(storage, files, { previous: await readManifest(storage), now: new Date('2026-09-24T12:00:00Z'), dryRun, log });

describe('publish', () => {
    it('uploads hashed files first and the manifest last', async () => {
        const storage = new MemoryStorage();
        const result = await run(storage, [{ key: 'hadith/collections', data: { a: 1 } }, { key: 'hadith/bukhari/books', data: { b: 2 } }]);

        expect(result).toMatchObject({ unchanged: 0, manifestUpdated: true });
        expect(storage.puts.at(-1)).toBe('v1/manifest.json');
        expect(storage.puts[0]).toMatch(/^v1\/hadith\/collections\.[a-f0-9]{8}\.json$/);
        expect(storage.objects.get(storage.puts[0]!)?.options.cacheControl).toBe(IMMUTABLE_CACHE);
        expect(storage.objects.get('v1/manifest.json')?.options.cacheControl).toBe(MANIFEST_CACHE);

        const manifest = ManifestSchema.parse(JSON.parse((await storage.get('v1/manifest.json'))!));
        expect(Object.keys(manifest.files)).toEqual(['hadith/bukhari/books', 'hadith/collections']);
        expect(await storage.get(`v1/${manifest.files['hadith/collections']!.path}`)).toBe('{"a":1}');
    });

    it('uploads nothing when the content did not change', async () => {
        const storage = new MemoryStorage();
        await run(storage, [{ key: 'hadith/collections', data: { a: 1 } }]);
        storage.puts.length = 0;

        const result = await run(storage, [{ key: 'hadith/collections', data: { a: 1 } }]);
        expect(result).toEqual({ uploaded: [], unchanged: 1, manifestUpdated: false });
        expect(storage.puts).toEqual([]);
    });

    it('uploads only changed files and keeps keys that were not rebuilt', async () => {
        const storage = new MemoryStorage();
        await run(storage, [{ key: 'hadith/collections', data: { a: 1 } }, { key: 'hadith/bukhari/books', data: { b: 2 } }]);
        storage.puts.length = 0;

        await run(storage, [{ key: 'hadith/collections', data: { a: 2 } }]);
        expect(storage.puts).toHaveLength(2);
        const manifest = (await readManifest(storage))!;
        expect(Object.keys(manifest.files)).toEqual(['hadith/bukhari/books', 'hadith/collections']);
    });

    it('writes nothing in dry run', async () => {
        const storage = new MemoryStorage();
        const result = await run(storage, [{ key: 'hadith/collections', data: { a: 1 } }], true);
        expect(result.uploaded).toHaveLength(1);
        expect(result.manifestUpdated).toBe(true);
        expect(storage.puts).toEqual([]);
    });
});
