// Reads the Google Play KPIs of the app and posts them on Telegram: the active users of the day, with the share on the
// versions >= each of VERSION_THRESHOLDS, and the new installs of the day. A source that fails does not hold back the other:
// what could be read is posted, with the error, then the script fails so that GitHub sends a notification.
//
//   GOOGLE_PLAY_SA_JSON=<key> npm run play-kpis -- [--dry-run]
//
// GOOGLE_PLAY_SA_JSON: JSON key of a service account invited in Play Console with "View app information and
// download bulk reports" on the app. Env: PLAY_PACKAGE_NAME, PLAY_REPORTS_BUCKET (pubsite_prod_<developer id>),
// VERSION_THRESHOLDS (`<name>=<version code>`, comma-separated, default `1.1.1=122,1.2.0=125`), and for Telegram
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_TOPIC_ID.
// --dry-run prints the message instead of posting it. Without --dry-run, prints no figure (the repo is public).
import { parseArgs } from 'node:util';
import { googleAccessToken, type ServiceAccountKey } from '../src/kpis/google-auth.ts';
import { formatKpis, type KpiReport } from '../src/kpis/message.ts';
import { PLAY_SCOPES, PlayKpis, type VersionThreshold } from '../src/kpis/play.ts';
import { sendTelegram, telegramTargetFromEnv } from '../src/notify/telegram.ts';

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });

const requireEnv = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`Missing environment variable ${name}`);
        process.exit(1);
    }
    return value;
};

const key = JSON.parse(requireEnv('GOOGLE_PLAY_SA_JSON')) as ServiceAccountKey;
const packageName = process.env.PLAY_PACKAGE_NAME?.trim() || 'com.mga5.buttontocount';
const bucket = requireEnv('PLAY_REPORTS_BUCKET');
const thresholds: VersionThreshold[] = (process.env.VERSION_THRESHOLDS?.trim() || '1.1.1=122,1.2.0=125').split(',').map((entry) => {
    const [name, code] = entry.split('=').map((part) => part.trim());
    if (!name || !Number.isInteger(Number(code))) {
        console.error(`Invalid VERSION_THRESHOLDS entry "${entry}" (expected <name>=<version code>)`);
        process.exit(1);
    }
    return { name, code: Number(code) };
});
const telegram = values['dry-run'] ? undefined : telegramTargetFromEnv();
if (!values['dry-run'] && !telegram) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID (or pass --dry-run)');
    process.exit(1);
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const report: KpiReport = { app: 'Muslim Reminder', errors: [] };
try {
    const play = new PlayKpis(await googleAccessToken(key, PLAY_SCOPES), packageName);
    const [activeUsers, installs] = await Promise.allSettled([play.activeUsers(thresholds), play.installs(bucket)]);
    if (activeUsers.status === 'rejected') report.errors.push(`Utilisateurs actifs : ${reason(activeUsers.reason)}`);
    else if (!activeUsers.value) report.errors.push('Utilisateurs actifs : aucune donnée');
    else report.activeUsers = activeUsers.value;
    if (installs.status === 'rejected') report.errors.push(`Téléchargements : ${reason(installs.reason)}`);
    else if (!installs.value) report.errors.push('Téléchargements : aucun rapport');
    else report.installs = installs.value;
} catch (error) {
    report.errors.push(reason(error));
}

const message = formatKpis(report);
if (telegram) {
    await sendTelegram(telegram, message);
    console.log('Posted on Telegram');
} else {
    console.log(message);
}
for (const error of report.errors) console.error(error);
if (report.errors.length > 0) process.exit(1);
