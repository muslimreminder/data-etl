// Daily active users per app version from Sentry release health (the sessions the app's Sentry SDK sends, Android
// and iOS): exact counts, a day old at most, but only for the versions that ship Sentry.
import { addDays, type Day } from './play.ts';

const SENTRY_API = 'https://sentry.io/api/0';

export type SentryUsersDay = {
    day: Day;
    /** Distinct users of the day, all versions with Sentry. */
    total: number;
    /** The same, on releases of a version >= the threshold. */
    sinceVersion: number;
    /** Share (0-1) of the users of those releases who did not crash, weighted by their users. */
    crashFreeSinceVersion?: number;
};

type SessionsGroup = { by: { release?: string }; series: Record<string, (number | null)[]> };
type Sessions = { intervals: string[]; groups: SessionsGroup[] };

/** The version of a release named `<bundle id>@<version>+<build>`, as the React Native SDK names them. */
export const releaseVersion = (release: string) => release.split('@').at(-1)!.split('+')[0]!;

/** Compares dotted versions numerically: 1.10.0 > 1.9.2. */
export function compareVersions(a: string, b: string): number {
    const [left, right] = [a, b].map((version) => version.split('.').map((part) => Number.parseInt(part, 10) || 0));
    for (let i = 0; i < Math.max(left!.length, right!.length); i++) {
        const delta = (left![i] ?? 0) - (right![i] ?? 0);
        if (delta !== 0) return delta;
    }
    return 0;
}

/** Folds the all-releases and per-release sessions series into one entry per day, oldest first. */
export function summarizeSentryUsers(total: Sessions, byRelease: Sessions, minVersion: string): SentryUsersDay[] {
    const users = 'count_unique(user)';
    const crashFree = 'crash_free_rate(user)';
    return total.intervals.map((interval, i) => {
        let sinceVersion = 0;
        let crashFreeUsers = 0;
        for (const group of byRelease.groups) {
            if (!group.by.release || compareVersions(releaseVersion(group.by.release), minVersion) < 0) continue;
            const count = group.series[users]?.[i] ?? 0;
            sinceVersion += count;
            crashFreeUsers += (group.series[crashFree]?.[i] ?? 1) * count;
        }
        return {
            day: interval.slice(0, 10),
            total: total.groups[0]?.series[users]?.[i] ?? 0,
            sinceVersion,
            ...(sinceVersion > 0 && { crashFreeSinceVersion: crashFreeUsers / sinceVersion }),
        };
    });
}

export class SentryKpis {
    private readonly token: string;
    private readonly organization: string;
    private readonly project: string;
    private readonly fetchImpl: typeof fetch;

    constructor(token: string, organization: string, project: string, fetchImpl: typeof fetch = fetch) {
        this.token = token;
        this.organization = organization;
        this.project = project;
        this.fetchImpl = fetchImpl;
    }

    private async get<T>(path: string): Promise<T> {
        const response = await this.fetchImpl(`${SENTRY_API}${path}`, {
            headers: { authorization: `Bearer ${this.token}` },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`sentry.io answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        return (await response.json()) as T;
    }

    /** The users of the last `days` full UTC days, oldest first. */
    async activeUsers(minVersion: string, today: Day = new Date().toISOString().slice(0, 10), days = 2): Promise<SentryUsersDay[]> {
        const { id } = await this.get<{ id: string }>(`/projects/${this.organization}/${this.project}/`);
        const sessions = (groupBy?: string) => {
            const params = new URLSearchParams({ project: id, start: `${addDays(today, -days)}T00:00:00Z`, end: `${today}T00:00:00Z`, interval: '1d' });
            params.append('field', 'count_unique(user)');
            params.append('field', 'crash_free_rate(user)');
            if (groupBy) params.set('groupBy', groupBy);
            return this.get<Sessions>(`/organizations/${this.organization}/sessions/?${params}`);
        };
        const [total, byRelease] = await Promise.all([sessions(), sessions('release')]);
        return summarizeSentryUsers(total, byRelease, minVersion);
    }
}
