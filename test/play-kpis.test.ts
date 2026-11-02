import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { googleAccessToken } from '../src/kpis/google-auth.ts';
import { formatKpis } from '../src/kpis/message.ts';
import { addDays, decodeReport, parseInstallsReport, PlayKpis, summarizeActiveUsers } from '../src/kpis/play.ts';

const date = (day: number) => ({ year: 2026, month: 10, day, timeZone: { id: 'America/Los_Angeles' } });
const row = (day: number, distinctUsers: number, versionCode?: string) => ({
    startTime: date(day),
    ...(versionCode && { dimensions: [{ dimension: 'versionCode', stringValue: versionCode }] }),
    metrics: [{ metric: 'distinctUsers', decimalValue: { value: String(distinctUsers) } }],
});
/** fr-FR formats with narrow and non-breaking spaces: compare with plain ones. */
const plain = (text: string) => text.replace(/[  ]/g, ' ');

it('adds days across months', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-10-25', 2)).toBe('2026-10-27');
});

describe('summarizeActiveUsers', () => {
    it('keeps the total of its own query and the versions from the threshold, on the last day', () => {
        const total = [row(26, 1000), row(25, 900)];
        const byVersion = [row(26, 700, '68'), row(26, 300, '122'), row(26, 100, '123'), row(25, 900, '122')];
        expect(summarizeActiveUsers(total, byVersion, 122)).toEqual({ day: '2026-10-26', total: 1000, sinceVersion: 400 });
    });

    it('is undefined without data', () => {
        expect(summarizeActiveUsers([], [], 122)).toBeUndefined();
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

    it('reads the user installs, oldest first', () => {
        expect(parseInstallsReport(csv)).toEqual([
            { day: '2026-10-23', userInstalls: 41 },
            { day: '2026-10-24', userInstalls: 52 },
        ]);
    });

    it('fails on a report without the expected columns', () => {
        expect(() => parseInstallsReport('Date,Installs\n2026-10-24,3')).toThrow(/Daily User Installs/);
    });
});

describe('PlayKpis', () => {
    it('queries the last full day of the vitals', async () => {
        const bodies: Record<string, unknown>[] = [];
        const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
            if (!init.body) return Response.json({ freshnessInfo: { freshnesses: [{ aggregationPeriod: 'DAILY', latestEndTime: date(27) }] } });
            const body = JSON.parse(init.body as string);
            bodies.push(body);
            return Response.json({ rows: body.dimensions.length ? [row(26, 5, '122'), row(26, 4, '68')] : [row(26, 8)] });
        }) as unknown as typeof fetch;
        expect(await new PlayKpis('T', 'com.app', fetchImpl).activeUsers(122)).toEqual({ day: '2026-10-26', total: 8, sinceVersion: 5 });
        expect(bodies[0]).toMatchObject({ timelineSpec: { aggregationPeriod: 'DAILY', startTime: date(26), endTime: date(27) }, metrics: ['distinctUsers'] });
    });

    it('reads the last day of this month and the previous one, a missing report being empty', async () => {
        const urls: string[] = [];
        const fetchImpl = (async (url: string) => {
            urls.push(url);
            if (url.includes('202611')) return new Response('', { status: 404 });
            return new Response('Date,Daily User Installs\n2026-10-31,4\n2026-10-30,7');
        }) as unknown as typeof fetch;
        expect(await new PlayKpis('T', 'com.app', fetchImpl).installs('pubsite_prod_1', '2026-11-02')).toEqual({ day: '2026-10-31', userInstalls: 4 });
        expect(urls[0]).toBe('https://storage.googleapis.com/storage/v1/b/pubsite_prod_1/o/stats%2Finstalls%2Finstalls_com.app_202610_overview.csv?alt=media');
    });

    it('throws on an API error', async () => {
        const fetchImpl = (async () => new Response('denied', { status: 403 })) as unknown as typeof fetch;
        await expect(new PlayKpis('T', 'com.app', fetchImpl).activeUsers(122)).rejects.toThrow('HTTP 403: denied');
    });

    it('keeps the message of a Google error, unescaped', async () => {
        const fetchImpl = (async () => Response.json({ error: { message: 'Permission &#39;storage.objects.get&#39; denied' } }, { status: 403 })) as unknown as typeof fetch;
        await expect(new PlayKpis('T', 'com.app', fetchImpl).installs('b', '2026-11-02')).rejects.toThrow("HTTP 403: Permission 'storage.objects.get' denied");
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
    it('reports the active users with the share on the new versions, and the installs', () => {
        const message = formatKpis({
            app: 'Muslim Reminder',
            minVersion: '1.1.1',
            activeUsers: { day: '2026-10-31', total: 4000, sinceVersion: 2000 },
            installs: { day: '2026-10-29', userInstalls: 1052 },
            errors: [],
        });
        expect(plain(message)).toBe(
            [
                '📊 <b>Muslim Reminder</b> · KPIs',
                '',
                '👥 <b>Utilisateurs actifs</b> · sam. 31 oct. : ≈ 4 000',
                '↳ dont v1.1.1+ : ≈ 2 000 (50 %)',
                '',
                '📥 <b>Téléchargements</b> · jeu. 29 oct. : 1 052',
            ].join('\n'),
        );
    });

    it('reports what could be read, then the errors', () => {
        const message = formatKpis({
            app: 'A',
            minVersion: '1.1.1',
            activeUsers: { day: '2026-10-31', total: 0, sinceVersion: 0 },
            errors: ['Téléchargements : HTTP 403 <denied>'],
        });
        expect(plain(message)).toContain('↳ dont v1.1.1+ : ≈ 0\n');
        expect(message).not.toContain('📥');
        expect(message).toContain('⚠️ Téléchargements : HTTP 403 &lt;denied&gt;');
    });
});
