// Downloads the QUL resources of the catalogs with a signed-in session, and uploads the changed ones to the
// private sources bucket read by the ETL (what `npm run upload-qul` does with files downloaded by hand).
// Also lists the resources QUL added since the last run, for a human to pick or ignore, and posts them on Telegram.
//
//   QUL_TOKEN=<cookie> npm run sync-qul -- [--dry-run] [--only <id,id>] [--report <file.md>]
//
// QUL_TOKEN: value of the `_quran_com-community_session` cookie of https://qul.tarteel.ai, once signed in.
// Env for R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_SOURCES_BUCKET (default muslimreminder-sources).
// Env for Telegram (optional, nothing is sent without them or in a dry run): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
// TELEGRAM_TOPIC_ID (forum topic, default the General one).
// In GitHub Actions, writes `contents` (what to publish), `recitations` and `new_resources` to $GITHUB_OUTPUT.
import { createHash } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { escapeHtml, joinWithinLimit, sendTelegram, telegramTargetFromEnv } from '../src/notify/telegram.ts';
import { R2Storage } from '../src/publish/storage.ts';
import { QUL_RESOURCE_TYPES, QUL_RESOURCES, type QulContent, type QulResourceType } from '../src/sources/qul/resources.ts';
import { QUL_URL, QulSite, type QulListedResource } from '../src/sources/qul/site.ts';

const KNOWN_KEY = 'qul/known-resources.json';
type Known = Partial<Record<QulResourceType, number[]>>;

const { values } = parseArgs({
    options: {
        'dry-run': { type: 'boolean', default: false },
        only: { type: 'string' },
        report: { type: 'string' },
    },
});

const requireEnv = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`Missing environment variable ${name}`);
        process.exit(1);
    }
    return value;
};

const dryRun = values['dry-run'];
const only = values.only?.split(',').map((id) => id.trim()).filter(Boolean);
const unknown = only?.filter((id) => !QUL_RESOURCES.some((resource) => resource.id === id)) ?? [];
if (unknown.length > 0) {
    console.error(`Not in the catalogs: ${unknown.join(', ')}`);
    process.exit(1);
}

const site = new QulSite(requireEnv('QUL_TOKEN'));
const sources = new R2Storage({
    accountId: requireEnv('R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucket: process.env.R2_SOURCES_BUCKET?.trim() || 'muslimreminder-sources',
});

const changed: { id: string; content: QulContent }[] = [];
const errors: string[] = [];
const resources = QUL_RESOURCES.filter((resource) => !only || only.includes(resource.id));

for (const resource of resources) {
    if (resource.qulId === undefined) {
        console.warn(`⚠️  ${resource.id}: no QUL id in the catalog, skipped (upload it with npm run upload-qul)`);
        continue;
    }
    try {
        const download = await site.download(resource.type, resource.qulId, resource.format);
        if (!resource.file.test(download.name)) {
            throw new Error(`QUL ${resource.type} ${resource.qulId} serves "${download.name}", which does not match ${resource.file}: wrong QUL id?`);
        }
        resource.check(download.bytes);
        const md5 = createHash('md5').update(download.bytes).digest('hex');
        if ((await sources.etag(resource.key)) === md5) {
            console.log(`${resource.id}: unchanged`);
            continue;
        }
        if (!dryRun) {
            await sources.putBytes(resource.key, download.bytes, { contentType: resource.contentType ?? 'application/json', cacheControl: 'no-store' });
        }
        changed.push({ id: resource.id, content: resource.content });
        console.log(`${resource.id}: ${download.name} (${download.bytes.length} bytes) → ${resource.key}${dryRun ? ' (dry run)' : ''}`);
    } catch (error) {
        errors.push(`${resource.id}: ${(error as Error).message}`);
        console.error(`❌ ${resource.id}: ${(error as Error).message}`);
    }
}

// Resources QUL added since the last run. The first run only records what exists.
const added: QulListedResource[] = [];
let firstRun = false;
if (!only) {
    const stored = await sources.get(KNOWN_KEY);
    firstRun = stored === undefined;
    const known: Known = stored ? JSON.parse(stored) : {};
    for (const type of QUL_RESOURCE_TYPES) {
        try {
            const listed = await site.list(type);
            if (listed.length === 0) throw new Error('no resource found on the page, has its layout changed?');
            const seen = new Set([
                ...(known[type] ?? []),
                ...QUL_RESOURCES.filter((resource) => resource.type === type).flatMap((resource) => resource.qulId ?? []),
            ]);
            if (!firstRun) added.push(...listed.filter((resource) => !seen.has(resource.id)));
            known[type] = [...new Set([...(known[type] ?? []), ...listed.map((resource) => resource.id)])].sort((a, b) => a - b);
        } catch (error) {
            errors.push(`listing ${type}: ${(error as Error).message}`);
            console.error(`❌ listing ${type}: ${(error as Error).message}`);
        }
    }
    if (!dryRun) await sources.put(KNOWN_KEY, `${JSON.stringify(known, null, 2)}\n`, { cacheControl: 'no-store' });
}

const contents = [...new Set(changed.map((resource) => resource.content))];
const recitations = changed.filter((resource) => resource.content === 'quran-recitations').map((resource) => resource.id);

const report = [
    `### Sync QUL${dryRun ? ' (dry run)' : ''}`,
    '',
    changed.length
        ? `**${changed.length} changed** (${dryRun ? 'not uploaded' : 'uploaded'}): ${changed.map((resource) => `\`${resource.id}\``).join(', ')}`
        : `No change in the ${resources.length} resources of the catalogs.`,
    ...(errors.length ? ['', `**${errors.length} errors**`, ...errors.map((error) => `- ${error}`)] : []),
    ...(firstRun ? ['', 'First run: the resources listed on QUL are recorded, the next runs report the new ones.'] : []),
    ...(added.length
        ? [
              '',
              `**${added.length} new resources on QUL** (to add, append them to the matching catalog of \`src/sources/qul/\`):`,
              ...added.map((resource) => `- [ ] ${resource.type} [${resource.name}](${QUL_URL}/resources/${resource.type}/${resource.id}) (QUL ${resource.id})`),
          ]
        : []),
].join('\n');
console.log(`\n${report}`);
if (values.report) await writeFile(values.report, `${report}\n`);

// New resources and failures (an expired cookie above all) go to the Muslim Reminder Telegram group.
const telegram = telegramTargetFromEnv();
if (telegram && !dryRun && (added.length > 0 || errors.length > 0)) {
    const run = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined;
    const lines = [
        ...(added.length
            ? [
                  `<b>🆕 QUL: ${added.length} new resource${added.length > 1 ? 's' : ''}</b>`,
                  'To publish one, add it to its catalog in data-etl (src/sources/qul/).',
                  '',
                  ...added.map((resource) => `• ${resource.type}: <a href="${QUL_URL}/resources/${resource.type}/${resource.id}">${escapeHtml(resource.name)}</a> (QUL ${resource.id})`),
              ]
            : []),
        ...(errors.length
            ? [
                  ...(added.length ? [''] : []),
                  `<b>❌ Sync QUL: ${errors.length} error${errors.length > 1 ? 's' : ''}</b>`,
                  ...(errors.some((error) => error.includes('cookie has expired')) ? ['The QUL_TOKEN cookie has expired: sign in to QUL again and replace the secret.'] : []),
                  ...(run ? [`<a href="${run}">See the run</a>`] : []),
                  '',
                  ...errors.map((error) => `• ${escapeHtml(error)}`),
              ]
            : []),
    ];
    try {
        await sendTelegram(telegram, joinWithinLimit(lines));
    } catch (error) {
        errors.push(`Telegram: ${(error as Error).message}`);
        console.error(`❌ Telegram: ${(error as Error).message}`);
    }
}

if (process.env.GITHUB_OUTPUT) {
    await appendFile(
        process.env.GITHUB_OUTPUT,
        `contents=${contents.join(',')}\nrecitations=${recitations.join(',')}\nnew_resources=${added.length}\n`,
    );
}
if (errors.length) process.exit(1);
