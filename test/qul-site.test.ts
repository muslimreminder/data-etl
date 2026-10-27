import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { QUL_RESOURCES } from '../src/sources/qul/resources.ts';
import { parseDownloadLinks, parseResourceList, QulSite, unzipSingle } from '../src/sources/qul/site.ts';

/** A zip archive of one file, laid out like the ones QUL serves. */
function zip(name: string, text: string, deflate = true): Uint8Array {
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const fileName = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(0, 42);
    const centralOffset = local.length + fileName.length + data.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + fileName.length, 12);
    end.writeUInt32LE(centralOffset, 16);
    return new Uint8Array(Buffer.concat([local, fileName, data, central, fileName, end]));
}

const SIGNED_IN_PAGE = `
  <a target="_blank" class="btn btn-success" href="/resources/tafsir/0a1b2c/download">
    Download json
  </a>
  <a target="_blank" class="btn btn-success" href="/resources/tafsir/3d4e5f/download">Download sqlite</a>`;

const SIGNED_OUT_PAGE = `<a class="btn btn-success" data-controller="ajax-modal" href="#_">Download json</a>`;

describe('parseResourceList', () => {
    it('reads the resource cards, once per resource', () => {
        const html = `
          <a class="inline-flex" data-turbo-frame="_top" href="/resources/tafsir/22">
              <span>Tafsir Ibn Kathir</span>
          <a class="inline-flex" href="/resources/tafsir/499"><span>Tafsir Ibn Abi Zamanin &amp; co</span></a>
          <a href="/resources/tafsir/22"><span>Tafsir Ibn Kathir</span></a>
          <a href="/resources/translation/5"><span>Other kind</span></a>`;
        expect(parseResourceList(html, 'tafsir')).toEqual([
            { type: 'tafsir', id: 22, name: 'Tafsir Ibn Kathir' },
            { type: 'tafsir', id: 499, name: 'Tafsir Ibn Abi Zamanin & co' },
        ]);
    });
});

describe('parseDownloadLinks', () => {
    it('maps each format to its download path', () => {
        expect(parseDownloadLinks(SIGNED_IN_PAGE)).toEqual(
            new Map([
                ['json', '/resources/tafsir/0a1b2c/download'],
                ['sqlite', '/resources/tafsir/3d4e5f/download'],
            ]),
        );
    });

    it('finds nothing on a signed-out page', () => {
        expect(parseDownloadLinks(SIGNED_OUT_PAGE).size).toBe(0);
    });
});

describe('unzipSingle', () => {
    it('inflates the only file of the archive', () => {
        const { name, data } = unzipSingle(zip('ar-tafsir-ibn-kathir.json', '{"1:1":"ok"}'));
        expect(name).toBe('ar-tafsir-ibn-kathir.json');
        expect(Buffer.from(data).toString()).toBe('{"1:1":"ok"}');
    });

    it('reads a stored (uncompressed) file', () => {
        expect(Buffer.from(unzipSingle(zip('a.json', '[]', false)).data).toString()).toBe('[]');
    });

    it('rejects what is not a zip', () => {
        expect(() => unzipSingle(new TextEncoder().encode('<html>Sign in</html>'))).toThrow('not a zip');
    });
});

describe('QulSite.download', () => {
    type Call = { url: string; cookie: string | null };

    const fakeFetch = (routes: Record<string, () => Response>, calls: Call[]) =>
        (async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            calls.push({ url, cookie: new Headers(init?.headers).get('cookie') });
            const route = routes[url];
            if (!route) throw new Error(`unexpected request ${url}`);
            return route();
        }) as typeof fetch;

    it('follows the download redirect without sending the cookie away from QUL', async () => {
        const calls: Call[] = [];
        const site = new QulSite('abc123', {
            delayMs: 0,
            fetch: fakeFetch(
                {
                    'https://qul.tarteel.ai/resources/tafsir/22': () => new Response(SIGNED_IN_PAGE),
                    'https://qul.tarteel.ai/resources/tafsir/0a1b2c/download': () =>
                        new Response(null, { status: 302, headers: { location: 'https://files.example.com/x.zip?sig=1' } }),
                    'https://files.example.com/x.zip?sig=1': () => new Response(zip('ar-tafsir-ibn-kathir.json', '{}')),
                },
                calls,
            ),
        });

        const download = await site.download('tafsir', 22, 'json');

        expect(download.name).toBe('ar-tafsir-ibn-kathir.json');
        expect(new TextDecoder().decode(download.bytes)).toBe('{}');
        expect(calls.map((call) => call.cookie)).toEqual([
            '_quran_com-community_session=abc123',
            '_quran_com-community_session=abc123',
            null,
        ]);
    });

    it('explains an expired session', async () => {
        const site = new QulSite('expired', {
            delayMs: 0,
            fetch: fakeFetch({ 'https://qul.tarteel.ai/resources/tafsir/22': () => new Response(SIGNED_OUT_PAGE) }, []),
        });
        await expect(site.download('tafsir', 22, 'json')).rejects.toThrow('cookie has expired');
    });

    it('lists the formats when the expected one is missing', async () => {
        const site = new QulSite('abc', {
            delayMs: 0,
            fetch: fakeFetch({ 'https://qul.tarteel.ai/resources/tafsir/22': () => new Response(SIGNED_IN_PAGE) }, []),
        });
        await expect(site.download('tafsir', 22, 'simple.json')).rejects.toThrow('available: json, sqlite');
    });
});

describe('QUL_RESOURCES', () => {
    it('gives every resource a unique source key', () => {
        expect(new Set(QUL_RESOURCES.map((resource) => resource.key)).size).toBe(QUL_RESOURCES.length);
    });

    it('knows where to download every resource', () => {
        expect(QUL_RESOURCES.filter((resource) => resource.qulId === undefined).map((resource) => resource.id)).toEqual([]);
    });
});
