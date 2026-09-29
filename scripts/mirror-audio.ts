// Copies the verse audio of the recitations to the content bucket, so the apps only ever talk to
// cdn.muslim-reminder.com. A recitation is 6,236 files (roughly 400 MB), so a run takes hours; it is
// resumable, and only ever runs again for a recitation whose source changed.
//
//   npm run mirror-audio -- --qul ~/Downloads --out ./out                  # local, to see what it writes
//   npm run mirror-audio -- --target r2                                    # every recitation of the catalog
//   npm run mirror-audio -- --target r2 --recitations al-husary,sudais
//   npm run mirror-audio -- --target r2 --dry-run                          # download and count, upload nothing
//
// Env for --target r2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (default muslimreminder-content), R2_SOURCES_BUCKET (default muslimreminder-sources).
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { mirrorRecitationAudio } from '../src/mirror/audio.ts';
import { LocalStorage, R2Storage, type ContentStorage } from '../src/publish/storage.ts';
import type { ReadQulSource } from '../src/sources/qul/index.ts';
import { parseQulRecitation, QUL_RECITATIONS, qulRecitationAudioUrls, qulRecitationSourceKey } from '../src/sources/qul/recitations.ts';

const HELP = `Usage: npm run mirror-audio -- [options]

  --target local|r2      Where to copy the audio (default: local)
  --out <dir>            Folder for --target local (default: ./out)
  --recitations <ids>    Comma-separated recitations to mirror (default: all of the catalog)
  --qul <dir|r2>         Downloaded QUL files, named <id>.json (default: r2 with --target r2)
  --concurrency <n>      Verses downloaded at the same time (default: 8)
  --dry-run              Download and count, write nothing
  -h, --help`;

const { values } = parseArgs({
    options: {
        target: { type: 'string', default: 'local' },
        out: { type: 'string', default: 'out' },
        recitations: { type: 'string' },
        qul: { type: 'string' },
        concurrency: { type: 'string', default: '8' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
    },
});

if (values.help) {
    console.log(HELP);
    process.exit(0);
}

const requireEnv = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`Missing environment variable ${name}\n\n${HELP}`);
        process.exit(1);
    }
    return value;
};

const r2 = (bucket: string) =>
    new R2Storage({
        accountId: requireEnv('R2_ACCOUNT_ID'),
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
        bucket,
    });

function createStorage(): ContentStorage {
    if (values.target === 'local') return new LocalStorage(values.out);
    if (values.target === 'r2') return r2(process.env.R2_BUCKET?.trim() || 'muslimreminder-content');
    console.error(`Unknown target "${values.target}"\n\n${HELP}`);
    process.exit(1);
}

function qulSource(): ReadQulSource {
    const source = values.qul ?? (values.target === 'r2' ? 'r2' : undefined);
    if (source === undefined) {
        console.error(`--qul <dir> is required to mirror audio locally\n\n${HELP}`);
        process.exit(1);
    }
    if (source === 'r2') {
        const bucket = r2(process.env.R2_SOURCES_BUCKET?.trim() || 'muslimreminder-sources');
        return (key) => bucket.getWithDate(key);
    }
    return async (key) => {
        const file = join(source, basename(key));
        const text = await readFile(file, 'utf8').catch(() => undefined);
        return text === undefined ? undefined : { text, modifiedAt: (await stat(file)).mtime };
    };
}

const only = values.recitations?.split(',').map((id) => id.trim()).filter(Boolean);
const recitations = QUL_RECITATIONS.filter((recitation) => !only || only.includes(recitation.id));
const unknown = only?.filter((id) => !QUL_RECITATIONS.some((recitation) => recitation.id === id)) ?? [];
if (recitations.length === 0 || unknown.length > 0) {
    console.error(`Unknown recitation "${unknown.join(', ')}"\n\n${HELP}`);
    process.exit(1);
}

const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
    console.error(`--concurrency must be between 1 and 32\n\n${HELP}`);
    process.exit(1);
}

const storage = createStorage();
const read = qulSource();
const dryRun = values['dry-run'];
const started = Date.now();
const log = (message: string) => console.log(message);
log(`Mirroring ${recitations.map((recitation) => recitation.id).join(', ')} to ${storage.description}${dryRun ? ' (dry run)' : ''}`);

let missing = 0;
for (const recitation of recitations) {
    const source = await read(qulRecitationSourceKey(recitation.id));
    if (!source) {
        console.warn(`⚠️  ${recitation.id}: no source at ${qulRecitationSourceKey(recitation.id)}, not mirrored`);
        missing++;
        continue;
    }
    const urls = qulRecitationAudioUrls(parseQulRecitation(source.text));
    const result = await mirrorRecitationAudio(recitation, { urls, storage, concurrency, dryRun, log });
    const megabytes = (result.bytes / 1024 / 1024).toFixed(0);
    log(
        `${recitation.id}: ${result.uploaded} verses ${dryRun ? 'to copy' : 'copied'} (${megabytes} MB), ` +
            `${result.skipped} already there, ${result.failed.length} unavailable` +
            `${result.failed.length > 0 ? ` (e.g. ${result.failed.slice(0, 3).join(', ')})` : ''}`,
    );
}

const minutes = Math.round((Date.now() - started) / 60_000);
log(`\n${recitations.length - missing} recitation(s) mirrored in ${minutes} min.`);
