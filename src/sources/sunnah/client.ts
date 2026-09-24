import { z } from 'zod';
import { paginated, RawBookSchema, RawChapterSchema, RawCollectionSchema, RawHadithSchema } from './raw.ts';

const API_URL = 'https://api.sunnah.com/v1';
const PAGE_SIZE = 100;
const MAX_ATTEMPTS = 8;
/**
 * Our sunnah.com plan: 5 requests/second and 5,000 requests/day.
 * Stay under both; a full run needs about half of the daily quota.
 */
const DEFAULT_INTERVAL_MS = 250;
const DEFAULT_MAX_REQUESTS = 4_500;
/** Upper bound of the adaptive delay between two requests. */
const MAX_INTERVAL_MS = 5_000;

export type SunnahClientOptions = {
    apiKey: string;
    /**
     * Minimum delay between two requests. The API rate-limits (429) without exposing its limits:
     * the delay grows on every 429.
     */
    minIntervalMs?: number;
    /** Stops the run before the daily quota is exhausted. */
    maxRequests?: number;
    fetch?: typeof fetch;
    log?: (message: string) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SunnahClient {
    private readonly apiKey: string;
    private minIntervalMs: number;
    private readonly maxRequests: number;
    private readonly fetch: typeof fetch;
    private readonly log: (message: string) => void;
    private nextRequestAt = 0;
    requestCount = 0;

    constructor(options: SunnahClientOptions) {
        this.apiKey = options.apiKey;
        this.minIntervalMs = options.minIntervalMs ?? DEFAULT_INTERVAL_MS;
        this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
        this.fetch = options.fetch ?? fetch;
        this.log = options.log ?? (() => {});
    }

    collections() {
        return this.getAllPages('collections', RawCollectionSchema);
    }

    books(collection: string) {
        return this.getAllPages(`collections/${collection}/books`, RawBookSchema);
    }

    chapters(collection: string, book: string) {
        return this.getAllPages(`collections/${collection}/books/${encodeURIComponent(book)}/chapters`, RawChapterSchema);
    }

    hadiths(collection: string, book: string) {
        return this.getAllPages(`collections/${collection}/books/${encodeURIComponent(book)}/hadiths`, RawHadithSchema);
    }

    private async getAllPages<T extends z.ZodType>(path: string, item: T): Promise<z.infer<T>[]> {
        const schema = paginated(item);
        const results: z.infer<T>[] = [];
        for (let page = 1; ; page++) {
            const json = await this.get(`${path}?limit=${PAGE_SIZE}&page=${page}`);
            const parsed = schema.safeParse(json);
            if (!parsed.success) {
                const preview = JSON.stringify(json).slice(0, 300);
                throw new Error(`Unexpected sunnah.com response for ${path} (page ${page}):\n${z.prettifyError(parsed.error)}\nBody: ${preview}`);
            }
            results.push(...parsed.data.data);
            if (parsed.data.next === null || parsed.data.data.length === 0) {
                return results;
            }
        }
    }

    private async get(pathAndQuery: string): Promise<unknown> {
        for (let attempt = 1; ; attempt++) {
            await this.throttle();
            if (this.requestCount >= this.maxRequests) {
                throw new Error(`Stopped after ${this.requestCount} sunnah.com requests to stay under the daily quota (5,000/day)`);
            }
            this.requestCount++;
            try {
                const response = await this.fetch(`${API_URL}/${pathAndQuery}`, {
                    headers: { 'X-API-Key': this.apiKey, accept: 'application/json' },
                    signal: AbortSignal.timeout(30_000),
                });
                if (response.ok) {
                    return await response.json();
                }
                const retryable = response.status === 429 || response.status >= 500;
                if (!retryable || attempt >= MAX_ATTEMPTS) {
                    throw new Error(`sunnah.com ${response.status} on ${pathAndQuery}`);
                }
                if (response.status === 429) {
                    // Slow down every pending request, not only this one.
                    const retryAfter = Number(response.headers.get('retry-after')) * 1000 || 5_000 * attempt;
                    this.minIntervalMs = Math.min(Math.round(this.minIntervalMs * 1.5), MAX_INTERVAL_MS);
                    this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + retryAfter);
                    this.log(`sunnah.com 429 on ${pathAndQuery}: pausing ${retryAfter / 1000}s, then 1 request / ${this.minIntervalMs} ms`);
                    continue;
                }
                this.log(`sunnah.com ${response.status} on ${pathAndQuery}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
            } catch (error) {
                const network = error instanceof TypeError || (error as Error).name === 'TimeoutError';
                if (!network || attempt >= MAX_ATTEMPTS) {
                    throw error;
                }
                this.log(`network error on ${pathAndQuery} (${(error as Error).message}), retry ${attempt}/${MAX_ATTEMPTS - 1}`);
            }
            await sleep(2 ** attempt * 500);
        }
    }

    private async throttle() {
        const wait = this.nextRequestAt - Date.now();
        if (wait > 0) {
            await sleep(wait);
        }
        this.nextRequestAt = Date.now() + this.minIntervalMs;
    }
}
