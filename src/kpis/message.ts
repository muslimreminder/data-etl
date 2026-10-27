import { escapeHtml } from '../notify/telegram.ts';
import type { ActiveUsersDay, Day, InstallsDay } from './play.ts';
import type { SentryUsersDay } from './sentry.ts';

export type KpiReport = {
    app: string;
    minVersionCode: number;
    /** Oldest first: the last entry is reported, the one before it gives the change. */
    activeUsers?: ActiveUsersDay[];
    installs?: InstallsDay[];
    /** Release health, when a Sentry token is configured. */
    sentry?: { minVersion: string; users: SentryUsersDay[] };
    errors: string[];
    /** The day of the run, to flag vitals older than usual. */
    today?: Day;
};

/** The vitals usually lag by 1-2 days. */
const STALE_AFTER_DAYS = 3;
const daysBetween = (from: Day, to: Day) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const numberFormat = new Intl.NumberFormat('fr-FR');
const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const crashFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const formatDay = (day: Day) => dayFormat.format(Date.parse(`${day}T00:00:00Z`));
const change = (value: number, previous: number | undefined) => {
    if (previous === undefined) return '';
    const delta = value - previous;
    return ` (${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${numberFormat.format(Math.abs(delta))} vs veille)`;
};

/** The Telegram message (HTML) of a report: what could be read, then what failed. */
export function formatKpis(report: KpiReport): string {
    const lines = [`📊 <b>${escapeHtml(report.app)}</b> · KPIs Google Play`];

    const active = report.activeUsers?.at(-1);
    if (active) {
        const previous = report.activeUsers?.at(-2);
        const version = `v${report.minVersionCode}+`;
        // Google rounds the vitals user counts (to the thousand for a few thousand users).
        lines.push('', `👥 <b>Utilisateurs actifs</b> · ${formatDay(active.day)}`, `≈ ${numberFormat.format(active.total)}${change(active.total, previous?.total)}`);
        const share = active.total > 0 ? ` · ${percentFormat.format(active.sinceVersion / active.total)} des actifs` : '';
        lines.push(`🆕 <b>${version}</b> : ≈ ${numberFormat.format(active.sinceVersion)}${share}${change(active.sinceVersion, previous?.sinceVersion)}`);
        const crashes = [
            active.crashRate !== undefined && `toutes versions ${crashFormat.format(active.crashRate)}`,
            active.crashRateSinceVersion !== undefined && `${version} ${crashFormat.format(active.crashRateSinceVersion)}`,
        ].filter(Boolean);
        if (crashes.length > 0) lines.push(`💥 Utilisateurs ayant planté : ${crashes.join(' · ')}`);
        const late = report.today && daysBetween(active.day, report.today) > STALE_AFTER_DAYS;
        if (late) lines.push(`⏳ Données Google en retard : dernier jour disponible il y a ${daysBetween(active.day, report.today!)} jours`);
    }

    const sentry = report.sentry?.users.at(-1);
    if (sentry) {
        const previous = report.sentry!.users.at(-2);
        const version = `v${report.sentry!.minVersion}+`;
        const share = sentry.total > 0 ? ` · ${percentFormat.format(sentry.sinceVersion / sentry.total)}` : '';
        const crashFree = sentry.crashFreeSinceVersion !== undefined ? ` · ${crashFormat.format(sentry.crashFreeSinceVersion)} sans plantage` : '';
        lines.push(
            '',
            `🛰️ <b>Sentry</b> (Android + iOS) · ${formatDay(sentry.day)}`,
            `Utilisateurs : ${numberFormat.format(sentry.total)}${change(sentry.total, previous?.total)}`,
            `🆕 <b>${version}</b> : ${numberFormat.format(sentry.sinceVersion)}${share}${change(sentry.sinceVersion, previous?.sinceVersion)}${crashFree}`,
        );
    }

    const installs = report.installs?.at(-1);
    if (installs) {
        const previous = report.installs?.at(-2);
        lines.push(
            '',
            `📥 <b>Nouveaux téléchargements</b> · ${formatDay(installs.day)}`,
            `${numberFormat.format(installs.userInstalls)}${change(installs.userInstalls, previous?.userInstalls)} · ${numberFormat.format(installs.userUninstalls)} désinstallations`,
        );
    }

    if (report.errors.length > 0) lines.push('', ...report.errors.map((error) => `⚠️ ${escapeHtml(error)}`));
    return lines.join('\n');
}
