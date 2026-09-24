import { describe, expect, it } from 'vitest';
import { SunnahClient } from '../src/sources/sunnah/client.ts';

const page = (data: unknown[], next: number | null) => ({ data, total: 3, limit: 100, previous: null, next });
const book = (bookNumber: string) => ({ bookNumber, book: [], hadithStartNumber: 1, hadithEndNumber: 2, numberOfHadith: 2 });

const fakeFetch = (responses: Response[]) => {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
        urls.push(url);
        return responses.shift() ?? new Response('{}', { status: 500 });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, urls };
};
const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

describe('SunnahClient', () => {
    it('follows pagination and sends the API key', async () => {
        const { fetch, urls } = fakeFetch([json(page([book('1'), book('2')], 2)), json(page([book('3')], null))]);
        const client = new SunnahClient({ apiKey: 'k', minIntervalMs: 0, fetch });
        expect((await client.books('bukhari')).map((b) => b.bookNumber)).toEqual(['1', '2', '3']);
        expect(urls).toEqual([
            'https://api.sunnah.com/v1/collections/bukhari/books?limit=100&page=1',
            'https://api.sunnah.com/v1/collections/bukhari/books?limit=100&page=2',
        ]);
    });

    it('waits and retries on 429', async () => {
        const logs: string[] = [];
        const { fetch } = fakeFetch([
            new Response('', { status: 429, headers: { 'retry-after': '0.01' } }),
            json(page([book('1')], null)),
        ]);
        const client = new SunnahClient({ apiKey: 'k', minIntervalMs: 0, fetch, log: (m) => logs.push(m) });
        expect(await client.books('bukhari')).toHaveLength(1);
        expect(logs[0]).toContain('429');
    });

    it('fails on an unexpected response shape', async () => {
        const { fetch } = fakeFetch([json({ error: { code: 404 } })]);
        const client = new SunnahClient({ apiKey: 'k', minIntervalMs: 0, fetch });
        await expect(client.books('bukhari')).rejects.toThrow(/Unexpected sunnah.com response/);
    });

    it('fails fast on a non retryable status', async () => {
        const { fetch } = fakeFetch([new Response('', { status: 403 })]);
        const client = new SunnahClient({ apiKey: 'k', minIntervalMs: 0, fetch });
        await expect(client.books('bukhari')).rejects.toThrow('sunnah.com 403');
    });

    it('stops before exceeding the request budget', async () => {
        const { fetch } = fakeFetch([json(page([book('1')], 2)), json(page([book('2')], 3))]);
        const client = new SunnahClient({ apiKey: 'k', minIntervalMs: 0, maxRequests: 1, fetch });
        await expect(client.books('bukhari')).rejects.toThrow(/daily quota/);
    });
});
