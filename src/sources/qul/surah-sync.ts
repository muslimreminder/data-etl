import { createHash } from 'node:crypto';
import {
    fetchQulSurahRecitation,
    parseQulSurahRecitation,
    qulSurahRecitationSourceKey,
    type QulAudioApi,
    type QulSurahRecitation,
} from './surah-recitations.ts';

/** When each recitation's segments were last downloaded, by recitation id: `qul/surah-recitations/state.json`. */
export const SURAH_SYNC_STATE_KEY = 'qul/surah-recitations/state.json';
type SyncState = Record<string, { segmentsCheckedAt: string }>;

/** The part of the sources bucket the sync uses. */
export type SurahSyncSources = {
    get(key: string): Promise<string | undefined>;
    etag(key: string): Promise<string | undefined>;
    put(key: string, body: string, options: { cacheControl: string }): Promise<void>;
};

export type SurahSyncOptions = {
    api: QulAudioApi;
    sources: SurahSyncSources;
    recitations: QulSurahRecitation[];
    now?: Date;
    /**
     * Segments are 115 requests per recitation and rarely change: they are downloaded again after
     * `refreshDays`, for `maxRefreshes` recitations per run at most (the oldest first), so the weekly
     * sync stays short. A recitation never downloaded is always fetched.
     */
    refreshDays?: number;
    maxRefreshes?: number;
    dryRun?: boolean;
    log?: (message: string) => void;
};

export type SurahSyncResult = { changed: string[]; unchanged: number; errors: string[] };

/**
 * Downloads the surah recitations of the catalog from the QUL audio API into the sources bucket, as
 * `qul/surah-recitations/<id>.json`. The detail (audio files, lengths, sizes) is read every run; the
 * segments when they are due (see `refreshDays`), the stored ones being kept otherwise. A source is
 * uploaded only when it changed: the ETL then publishes it, and the mirror copies the new audio files.
 */
export async function syncSurahRecitations(options: SurahSyncOptions): Promise<SurahSyncResult> {
    const { api, sources, recitations, now = new Date(), refreshDays = 28, maxRefreshes = 8, dryRun = false, log = () => {} } = options;
    const state: SyncState = JSON.parse((await sources.get(SURAH_SYNC_STATE_KEY)) ?? '{}');
    const result: SurahSyncResult = { changed: [], unchanged: 0, errors: [] };

    const stale = recitations
        .filter((recitation) => {
            const checked = state[recitation.id]?.segmentsCheckedAt;
            return checked && now.getTime() - Date.parse(checked) >= refreshDays * 86_400_000;
        })
        .sort((a, b) => state[a.id]!.segmentsCheckedAt.localeCompare(state[b.id]!.segmentsCheckedAt))
        .slice(0, maxRefreshes)
        .map((recitation) => recitation.id);

    for (const recitation of recitations) {
        const key = qulSurahRecitationSourceKey(recitation.id);
        try {
            const stored = await sources.get(key);
            const refresh = !stored || !state[recitation.id] || stale.includes(recitation.id);
            const raw = await fetchQulSurahRecitation(api, recitation.apiId, {
                segments: refresh || !stored ? true : parseQulSurahRecitation(stored).segments,
            });
            if (refresh) state[recitation.id] = { segmentsCheckedAt: now.toISOString() };

            const body = JSON.stringify(raw);
            const md5 = createHash('md5').update(body).digest('hex');
            if ((await sources.etag(key)) === md5) {
                result.unchanged++;
                log(`${recitation.id}: unchanged${refresh ? ' (segments checked)' : ''}`);
                continue;
            }
            if (!dryRun) await sources.put(key, body, { cacheControl: 'no-store' });
            result.changed.push(recitation.id);
            const surahs = Object.keys(raw.segments ?? {}).length;
            log(`${recitation.id}: QUL audio ${recitation.apiId} → ${key}${surahs ? ` (${surahs} surahs timed)` : ''}${dryRun ? ' (dry run)' : ''}`);
        } catch (error) {
            result.errors.push(`${recitation.id}: ${(error as Error).message}`);
        }
    }

    if (!dryRun) await sources.put(SURAH_SYNC_STATE_KEY, `${JSON.stringify(state, null, 2)}\n`, { cacheControl: 'no-store' });
    return result;
}
