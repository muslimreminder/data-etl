// Reads the Google Play KPIs of the app and posts a summary on Telegram: daily active users (all, and on the
// versions >= MIN_VERSION_CODE, with their crash rate) and the new installs of the day, each with its change
// since the day before. A source that fails does not hold back the other: what could be read is posted, with the
// error, then the script fails so that GitHub sends a notification.
//
//   GOOGLE_PLAY_SA_JSON=<key> npm run play-kpis -- [--dry-run]
//
// GOOGLE_PLAY_SA_JSON: JSON key of a service account invited in Play Console with "View app information and
// download bulk reports" on the app. Env: PLAY_PACKAGE_NAME, PLAY_REPORTS_BUCKET (pubsite_prod_<developer id>),
// MIN_VERSION_CODE (default 122), and for Telegram TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_TOPIC_ID.
// --dry-run prints the message instead of posting it. Without --dry-run, prints no figure (the repo is public).
import { parseArgs } from 'node:util';
import { googleAccessToken, type ServiceAccountKey } from '../src/kpis/google-auth.ts';
import { formatKpis, type KpiReport } from '../src/kpis/message.ts';
import { PLAY_SCOPES, PlayKpis } from '../src/kpis/play.ts';
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
const minVersionCode = Number(process.env.MIN_VERSION_CODE?.trim() || 122);
const telegram = values['dry-run'] ? undefined : telegramTargetFromEnv();
if (!values['dry-run'] && !telegram) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID (or pass --dry-run)');
    process.exit(1);
}

const report: KpiReport = { app: 'Muslim Reminder', minVersionCode, errors: [] };
try {
    const play = new PlayKpis(await googleAccessToken(key, PLAY_SCOPES), packageName);
    const [activeUsers, installs] = await Promise.allSettled([play.activeUsers(minVersionCode), play.installs(bucket)]);
    if (activeUsers.status === 'fulfilled') report.activeUsers = activeUsers.value;
    else report.errors.push(`Utilisateurs actifs : ${activeUsers.reason instanceof Error ? activeUsers.reason.message : activeUsers.reason}`);
    if (installs.status === 'fulfilled') report.installs = installs.value;
    else report.errors.push(`Téléchargements : ${installs.reason instanceof Error ? installs.reason.message : installs.reason}`);
} catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
}
if (!report.activeUsers?.length && !report.errors.some((e) => e.startsWith('Utilisateurs'))) report.errors.push('Utilisateurs actifs : aucune donnée');
if (!report.installs?.length && !report.errors.some((e) => e.startsWith('Téléchargements'))) report.errors.push('Téléchargements : aucun rapport');

const message = formatKpis(report);
if (telegram) {
    await sendTelegram(telegram, message);
    console.log('Posted on Telegram');
} else {
    console.log(message);
}
for (const error of report.errors) console.error(error);
if (report.errors.length > 0) process.exit(1);
