import { inflateRawSync } from 'node:zlib';
import { decodeHTML } from 'entities';
import type { QulResourceType } from './resources.ts';

export const QUL_URL = 'https://qul.tarteel.ai';
const SESSION_COOKIE = '_quran_com-community_session';
const USER_AGENT = 'muslimreminder-data-etl (+https://github.com/muslimreminder/data-etl)';

/** A resource listed on `https://qul.tarteel.ai/resources/<type>`. */
export type QulListedResource = { type: QulResourceType; id: number; name: string };

/** A downloaded file: its name in the zip QUL serves, and its bytes as they are. */
export type QulDownload = { name: string; bytes: Uint8Array };

/**
 * The QUL website, read the way a signed-in browser does. QUL has no API: resource pages are public,
 * but their download links only show up for a signed-in user, hence the session cookie of a real account.
 */
export class QulSite {
    private readonly cookie: string;
    private readonly fetch: typeof fetch;
    private readonly delayMs: number;
    private last = 0;

    /** `session`: the value of the `_quran_com-community_session` cookie, or a whole `Cookie` header holding it. */
    constructor(session: string, options: { fetch?: typeof fetch; delayMs?: number } = {}) {
        const value = session.trim();
        this.cookie = value.includes('=') ? value : `${SESSION_COOKIE}=${value}`;
        this.fetch = options.fetch ?? fetch;
        this.delayMs = options.delayMs ?? 1_000;
    }

    /** Every resource of a kind, as listed by QUL (public page, no cookie sent). */
    async list(type: QulResourceType): Promise<QulListedResource[]> {
        const html = await this.text(`/resources/${type}`, false);
        return parseResourceList(html, type);
    }

    /** Downloads the file `format` of a resource page (`Download <format>`), and unzips it. */
    async download(type: QulResourceType, id: number, format: string): Promise<QulDownload> {
        const page = `/resources/${type}/${id}`;
        const links = parseDownloadLinks(await this.text(page, true));
        if (links.size === 0) {
            throw new Error(`no download link on ${QUL_URL}${page}: the QUL session cookie has expired or the resource is restricted`);
        }
        const path = links.get(format);
        if (!path) {
            throw new Error(`no "${format}" download on ${QUL_URL}${page} (available: ${[...links.keys()].join(', ')})`);
        }

        // The download answers with a redirect to the stored file: followed by hand, so the cookie stays on QUL.
        const response = await this.request(path, true, 'manual');
        const location = response.headers.get('location');
        if (response.status < 300 || response.status >= 400 || !location) {
            throw new Error(`${QUL_URL}${path} answered HTTP ${response.status} instead of a redirect`);
        }
        if (new URL(location, QUL_URL).pathname.startsWith('/users/sign_in')) {
            throw new Error('QUL asks to sign in again: the QUL session cookie has expired');
        }
        const file = await this.fetch(new URL(location, QUL_URL), { headers: { 'user-agent': USER_AGENT } });
        if (!file.ok) throw new Error(`downloading ${page} (${format}) answered HTTP ${file.status}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const entry = unzipSingle(bytes);
        return { name: entry.name, bytes: entry.data };
    }

    private async text(path: string, signedIn: boolean) {
        const response = await this.request(path, signedIn, 'follow');
        if (!response.ok) throw new Error(`${QUL_URL}${path} answered HTTP ${response.status}`);
        return response.text();
    }

    /** One request at a time, `delayMs` apart: QUL is a community website, not a CDN. */
    private async request(path: string, signedIn: boolean, redirect: 'follow' | 'manual') {
        const wait = this.last + this.delayMs - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        this.last = Date.now();
        return this.fetch(new URL(path, QUL_URL), {
            redirect,
            headers: { 'user-agent': USER_AGENT, ...(signedIn && { cookie: this.cookie }) },
        });
    }
}

/** Resource cards of a listing page: `<a href="/resources/tafsir/22"> <span>Tafsir Ibn Kathir</span>`. */
export function parseResourceList(html: string, type: QulResourceType): QulListedResource[] {
    const resources = new Map<number, QulListedResource>();
    const card = new RegExp(`href="/resources/${type}/(\\d+)"[^>]*>\\s*<span>([^<]+)</span>`, 'g');
    for (const match of html.matchAll(card)) {
        const id = Number(match[1]);
        if (!resources.has(id)) resources.set(id, { type, id, name: decodeHTML(match[2]!).trim() });
    }
    return [...resources.values()];
}

/** `Download <format>` buttons of a resource page, format → path. Only rendered for a signed-in user. */
export function parseDownloadLinks(html: string): Map<string, string> {
    const links = new Map<string, string>();
    const link = /<a[^>]*href="(\/resources\/[^"/]+\/[0-9a-f]+\/download)"[^>]*>\s*Download\s+([^<]+?)\s*</g;
    for (const match of html.matchAll(link)) {
        const format = decodeHTML(match[2]!).trim();
        if (!links.has(format)) links.set(format, decodeHTML(match[1]!));
    }
    return links;
}

/** The only file of a zip archive (QUL zips every download), read from its central directory. */
export function unzipSingle(zip: Uint8Array): { name: string; data: Uint8Array } {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let end = -1;
    for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65_557); offset--) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            end = offset;
            break;
        }
    }
    if (end < 0) throw new Error('the download is not a zip archive');
    const entries = view.getUint16(end + 10, true);
    if (entries !== 1) throw new Error(`the zip archive holds ${entries} files, expected 1`);

    const central = view.getUint32(end + 16, true);
    if (view.getUint32(central, true) !== 0x02014b50) throw new Error('corrupt zip archive');
    const method = view.getUint16(central + 10, true);
    const size = view.getUint32(central + 20, true);
    const nameLength = view.getUint16(central + 28, true);
    const local = view.getUint32(central + 42, true);
    const name = new TextDecoder().decode(zip.subarray(central + 46, central + 46 + nameLength));

    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('corrupt zip archive');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    if (method === 0) return { name, data };
    if (method === 8) return { name, data: new Uint8Array(inflateRawSync(data)) };
    throw new Error(`unsupported zip compression method ${method}`);
}
