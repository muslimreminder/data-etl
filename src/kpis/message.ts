import { escapeHtml } from '../notify/telegram.ts';
import type { ActiveUsersDay, Day, InstallsDay } from './play.ts';

export type KpiReport = {
    app: string;
    activeUsers?: ActiveUsersDay;
    installs?: InstallsDay;
    errors: string[];
};

const numberFormat = new Intl.NumberFormat('fr-FR');
const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const formatDay = (day: Day) => dayFormat.format(Date.parse(`${day}T00:00:00Z`));

/** The Telegram message (HTML) of a report: what could be read, then what failed. */
export function formatKpis({ app, activeUsers, installs, errors }: KpiReport): string {
    const sections = [`📊 <b>${escapeHtml(app)}</b> · KPIs`];
    if (activeUsers) {
        const { day, total, sinceVersions } = activeUsers;
        const share = (users: number) => (total > 0 ? ` (${percentFormat.format(users / total)})` : '');
        // Google rounds the vitals user counts (to the thousand for a few thousand users).
        sections.push(
            [
                `👥 <b>Utilisateurs actifs</b> · ${formatDay(day)} : ≈ ${numberFormat.format(total)}`,
                ...sinceVersions.map(({ name, users }) => `↳ dont v${escapeHtml(name)}+ : ≈ ${numberFormat.format(users)}${share(users)}`),
            ].join('\n'),
        );
    }
    if (installs) sections.push(`📥 <b>Téléchargements</b> · ${formatDay(installs.day)} : ${numberFormat.format(installs.userInstalls)}`);
    if (errors.length > 0) sections.push(errors.map((error) => `⚠️ ${escapeHtml(error)}`).join('\n'));
    return sections.join('\n\n');
}
