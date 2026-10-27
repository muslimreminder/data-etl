import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { googleAccessToken } from '../src/kpis/google-auth.ts';
import { formatKpis } from '../src/kpis/message.ts';
import { addDays, decodeReport, parseInstallsReport, PlayKpis, summarizeActiveUsers } from '../src/kpis/play.ts';

const date = (day: number) => ({ year: 2026, month: 10, day, timeZone: { id: 'America/Los_Angeles' } });
const row = (day: number, metrics: Record<string, number>, versionCode?: string) => ({
    startTime: date(day),
    ...(versionCode && { dimensions: [{ dimension: 'versionCode', stringValue: versionCode }] }),
    metrics: Object.entries(metrics).map(([metric, value]) => ({ metric, decimalValue: { value: String(value) } })),
});

it('adds days across months', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-10-25', 2)).toBe('2026-10-27');
});

describe('summarizeActiveUsers', () => {
    it('keeps the total of its own query and the versions from the threshold', () => {
        const total = [row(26, { distinctUsers: 1000 }), row(25, { distinctUsers: 900 })];
        const byVersion = [
            row(26, { distinctUsers: 700, crashRate: 0.01 }, '68'),
            row(26, { distinctUsers: 300, crashRate: 0.002 }, '122'),
            row(26, { distinctUsers: 100, crashRate: 0.006 }, '123'),
            row(25, { distinctUsers: 900, crashRate: 0 }, '68'),
        ];
        const [previous, latest] = summarizeActiveUsers(total, byVersion, 122);
        expect(previous).toEqual({ day: '2026-10-25', total: 900, sinceVersion: 0 });
        expect(latest).toMatchObject({ day: '2026-10-26', total: 1000, sinceVersion: 400 });
        expect(latest!.crashRateSinceVersion).toBeCloseTo(0.003);
    });
});

describe('installs report', () => {
    const csv = [
        'Date,Package Name,Daily Device Installs,Daily Device Uninstalls,Daily User Installs,Daily User Uninstalls',
        '2026-10-24,com.mga5.buttontocount,60,20,52,15',
        '2026-10-23,com.mga5.buttontocount,50,10,41,9',
        '',
    ].join('\r\n');

    it('decodes the UTF-16 reports of Play Console', () => {
        const bytes = new Uint8Array([0xff, 0xfe, ...Buffer.from(csv, 'utf16le')]);
        expect(decodeReport(bytes)).toBe(csv);
        expect(decodeReport(new TextEncoder().encode(csv))).toBe(csv);
    });

    it('reads the user installs and uninstalls, oldest first', () => {
        expect(parseInstallsReport(csv)).toEqual([
            { day: '2026-10-23', userInstalls: 41, userUninstalls: 9 },
            { day: '2026-10-24', userInstalls: 52, userUninstalls: 15 },
        ]);
    });

    it('fails on a report without the expected columns', () => {
        expect(() => parseInstallsReport('Date,Installs\n2026-10-24,3')).toThrow(/Daily User Installs/);
    });
});

describe('PlayKpis', () => {
    it('queries the last full days of the vitals', async () => {
        const bodies: Record<string, unknown>[] = [];
        const fetchImpl = (async (url: string, init: RequestInit = {}) => {
            if (!init.body) return Response.json({ freshnessInfo: { freshnesses: [{ aggregationPeriod: 'DAILY', latestEndTime: date(27) }] } });
            const body = JSON.parse(init.body as string);
            bodies.push(body);
            return Response.json({ rows: body.dimensions.length ? [row(26, { distinctUsers: 5, crashRate: 0 }, '122')] : [row(26, { distinctUsers: 8 })] });
        }) as unknown as typeof fetch;
        const users = await new PlayKpis('T', 'com.app', fetchImpl).activeUsers(122);
        expect(users).toEqual([{ day: '2026-10-26', total: 8, sinceVersion: 5, crashRateSinceVersion: 0 }]);
        expect(bodies[0]).toMatchObject({ timelineSpec: { aggregationPeriod: 'DAILY', startTime: date(25), endTime: date(27) } });
    });

    it('reads the reports of this month and the previous one, a missing one being empty', async () => {
        const urls: string[] = [];
        const fetchImpl = (async (url: string) => {
            urls.push(url);
            if (url.includes('202611')) return new Response('', { status: 404 });
            return new Response('Date,Daily User Installs,Daily User Uninstalls\n2026-10-31,4,1');
        }) as unknown as typeof fetch;
        expect(await new PlayKpis('T', 'com.app', fetchImpl).installs('pubsite_prod_1', '2026-11-02')).toEqual([{ day: '2026-10-31', userInstalls: 4, userUninstalls: 1 }]);
        expect(urls[0]).toBe('https://storage.googleapis.com/storage/v1/b/pubsite_prod_1/o/stats%2Finstalls%2Finstalls_com.app_202610_overview.csv?alt=media');
    });

    it('throws on an API error', async () => {
        const fetchImpl = (async () => new Response('denied', { status: 403 })) as unknown as typeof fetch;
        await expect(new PlayKpis('T', 'com.app', fetchImpl).activeUsers(122)).rejects.toThrow('HTTP 403: denied');
    });
});

it('signs the token request with the service account key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    let assertion = '';
    const fetchImpl = (async (_url: string, init: RequestInit) => {
        assertion = new URLSearchParams(init.body as URLSearchParams).get('assertion')!;
        return Response.json({ access_token: 'ya29' });
    }) as unknown as typeof fetch;
    const key = { client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
    expect(await googleAccessToken(key, ['a', 'b'], fetchImpl)).toBe('ya29');
    const [header, claims, signature] = assertion.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ iss: key.client_email, scope: 'a b' });
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
});

describe('formatKpis', () => {
    it('reports the last day with its change, and the errors', () => {
        const message = formatKpis({
            app: 'Muslim Reminder',
            minVersionCode: 122,
            activeUsers: [
                { day: '2026-10-25', total: 900, sinceVersion: 100 },
                { day: '2026-10-26', total: 1000, sinceVersion: 250, crashRateSinceVersion: 0.0012 },
            ],
            errors: ['Téléchargements : HTTP 403 <denied>'],
        });
        expect(message).toContain('👥 <b>Utilisateurs actifs</b> · lun. 26 oct.');
        expect(message).toContain('1 000 (+100 vs veille)');
        expect(message).toContain('🆕 <b>v122+</b> : 250 · 25 % des actifs (+150 vs veille)');
        expect(message).toContain('0,12 % des utilisateurs');
        expect(message).not.toContain('Nouveaux téléchargements');
        expect(message).toContain('⚠️ Téléchargements : HTTP 403 &lt;denied&gt;');
    });
});
