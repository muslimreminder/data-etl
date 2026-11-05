// Google Play KPIs of an app: the active users of a day (Play Developer Reporting API, the Android vitals user counts)
// and the new installs of a day (the monthly installs reports Play Console writes to its Cloud Storage bucket).
// Both sources lag: vitals by ~1-2 days, installs reports by ~2-3 days, so each KPI carries its own day.

export const PLAY_SCOPES = ['https://www.googleapis.com/auth/playdeveloperreporting', 'https://www.googleapis.com/auth/devstorage.read_only'];

const REPORTING_API = 'https://playdeveloperreporting.googleapis.com/v1beta1';
const STORAGE_API = 'https://storage.googleapis.com/storage/v1';
/** Daily vitals are aggregated over days of this time zone, the only one the API accepts for them. */
const VITALS_TIME_ZONE = 'America/Los_Angeles';

/** A calendar day, ISO `YYYY-MM-DD`. */
export type Day = string;

type ApiDate = { year: number; month: number; day: number; timeZone?: { id: string } };
type MetricRow = {
    startTime: ApiDate;
    dimensions?: { dimension: string; stringValue?: string; int64Value?: string }[];
    metrics: { metric: string; decimalValue?: { value: string } }[];
};

const toDay = ({ year, month, day }: ApiDate): Day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const toApiDate = (day: Day): ApiDate => {
    const [year, month, date] = day.split('-').map(Number) as [number, number, number];
    return { year, month, day: date, timeZone: { id: VITALS_TIME_ZONE } };
};
export const addDays = (day: Day, days: number): Day => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A version from which the active users are counted apart: its name in the message, its version code. */
export type VersionThreshold = { name: string; code: number };

export type ActiveUsersDay = {
    day: Day;
    /** Distinct users who used the app that day (only those sharing usage & diagnostics with Google, rounded by Google). */
    total: number;
    /** The same, on a version code >= each threshold, in the order of the thresholds. */
    sinceVersions: (VersionThreshold & { users: number })[];
};

const distinctUsers = (row: MetricRow) => Number(row.metrics.find((m) => m.metric === 'distinctUsers')?.decimalValue?.value ?? 0);
const versionCode = (row: MetricRow) => {
    const dimension = row.dimensions?.find((d) => d.dimension === 'versionCode');
    return Number(dimension?.stringValue ?? dimension?.int64Value ?? NaN);
};

/**
 * The active users of the last day of the two vitals queries (all users, and by version code).
 * The total comes from its own query: a user who updated during the day counts in two versions.
 */
export function summarizeActiveUsers(totalRows: MetricRow[], versionRows: MetricRow[], thresholds: VersionThreshold[]): ActiveUsersDay | undefined {
    const day = totalRows
        .map((row) => toDay(row.startTime))
        .sort()
        .at(-1);
    if (!day) return undefined;
    const usersOf = (rows: MetricRow[]) => rows.filter((row) => toDay(row.startTime) === day).reduce((sum, row) => sum + distinctUsers(row), 0);
    return {
        day,
        total: usersOf(totalRows),
        sinceVersions: thresholds.map((threshold) => ({ ...threshold, users: usersOf(versionRows.filter((row) => versionCode(row) >= threshold.code)) })),
    };
}

export type InstallsDay = { day: Day; userInstalls: number };

/** Decodes a Play Console report: UTF-16 LE with a BOM (as Play writes them), else UTF-8. */
export function decodeReport(bytes: Uint8Array): string {
    const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
    return new TextDecoder(utf16 ? 'utf-16le' : 'utf-8').decode(bytes).replace(/^﻿/, '');
}

/** Rows of an `installs_<package>_<YYYYMM>_overview.csv` report, oldest first. */
export function parseInstallsReport(csv: string): InstallsDay[] {
    const [header, ...lines] = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (!header) return [];
    const cells = (line: string) => line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'));
    const columns = cells(header);
    const column = (name: string) => {
        const index = columns.indexOf(name);
        if (index < 0) throw new Error(`Installs report without a "${name}" column (columns: ${columns.join(', ')})`);
        return index;
    };
    const [date, installs] = [column('Date'), column('Daily User Installs')];
    return lines
        .map(cells)
        .map((row) => ({ day: row[date]!, userInstalls: Number(row[installs] || 0) }))
        .sort((a, b) => a.day.localeCompare(b.day));
}

export class PlayKpis {
    private readonly accessToken: string;
    private readonly packageName: string;
    private readonly fetchImpl: typeof fetch;

    constructor(accessToken: string, packageName: string, fetchImpl: typeof fetch = fetch) {
        this.accessToken = accessToken;
        this.packageName = packageName;
        this.fetchImpl = fetchImpl;
    }

    private async call(url: string, init: RequestInit = {}): Promise<Response> {
        const response = await this.fetchImpl(url, {
            ...init,
            headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok && response.status !== 404) {
            const text = await response.text();
            // Google APIs answer {"error": {"message": …}}: keep the message alone. Cloud Storage escapes its quotes.
            let detail = text;
            try {
                detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
            } catch {}
            detail = detail.replaceAll('&#39;', "'").replaceAll('&quot;', '"');
            throw new Error(`${new URL(url).host} answered HTTP ${response.status}: ${detail.slice(0, 300)}`);
        }
        return response;
    }

    /** The active users of the last day the vitals have data for. */
    async activeUsers(thresholds: VersionThreshold[]): Promise<ActiveUsersDay | undefined> {
        const metricSet = `${REPORTING_API}/apps/${this.packageName}/crashRateMetricSet`;
        const freshness = (await (await this.call(metricSet)).json()) as {
            freshnessInfo?: { freshnesses?: { aggregationPeriod: string; latestEndTime: ApiDate }[] };
        };
        const latestEnd = freshness.freshnessInfo?.freshnesses?.find((f) => f.aggregationPeriod === 'DAILY')?.latestEndTime;
        if (!latestEnd) throw new Error('The vitals have no daily data yet');
        // latestEndTime is exclusive: the last full day ends there.
        const end = toDay(latestEnd);

        const query = async (dimensions: string[]) => {
            const rows: MetricRow[] = [];
            let pageToken: string | undefined;
            do {
                const body = {
                    timelineSpec: { aggregationPeriod: 'DAILY', startTime: toApiDate(addDays(end, -1)), endTime: toApiDate(end) },
                    dimensions,
                    metrics: ['distinctUsers'],
                    pageSize: 1000,
                    ...(pageToken && { pageToken }),
                };
                const page = (await (await this.call(`${metricSet}:query`, { method: 'POST', body: JSON.stringify(body) })).json()) as {
                    rows?: MetricRow[];
                    nextPageToken?: string;
                };
                rows.push(...(page.rows ?? []));
                pageToken = page.nextPageToken;
            } while (pageToken);
            return rows;
        };
        const [total, byVersion] = await Promise.all([query([]), query(['versionCode'])]);
        return summarizeActiveUsers(total, byVersion, thresholds);
    }

    /** The new installs of the last day of the current or previous month's report. */
    async installs(bucket: string, today: Day = new Date().toISOString().slice(0, 10)): Promise<InstallsDay | undefined> {
        const month = (day: Day) => day.slice(0, 7).replace('-', '');
        const thisMonth = `${today.slice(0, 7)}-01`;
        const reports = await Promise.all(
            [addDays(thisMonth, -1), thisMonth].map(async (day) => {
                const object = `stats/installs/installs_${this.packageName}_${month(day)}_overview.csv`;
                const response = await this.call(`${STORAGE_API}/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`);
                // A month without a report yet (the first days of a month).
                if (response.status === 404) return [];
                return parseInstallsReport(decodeReport(new Uint8Array(await response.arrayBuffer())));
            }),
        );
        return reports.flat().at(-1);
    }
}
