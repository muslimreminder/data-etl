// Copies the verse audio of the recitations to the content bucket, so the apps only ever talk to
// cdn.muslim-reminder.com. A recitation is 6,236 files (roughly 400 MB), so a run takes hours; it is
// resumable, and only ever runs again for a recitation whose source changed.
//
//   npm run mirror-audio -- --qul ~/Downloads --out ./out                  # local, to see what it writes
//   npm run mirror-audio -- --target r2                                    # every recitation of the catalog
//   npm run mirror-audio -- --target r2 --recitations al-husary,sudais
//   npm run mirror-audio -- --target r2 --dry-run                          # download and count, upload nothing
//   npm run mirror-audio -- --target r2 --kind surah --recitations alafasy # recitations streamed surah by surah
//
// A surah recitation is 114 files of up to ~300 MB (1 to 5 GB in all).
//
// Env for --target r2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (default muslimreminder-content), R2_SOURCES_BUCKET (default muslimreminder-sources).
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { mirrorRecitationAudio, mirrorSurahAudio, type MirrorResult } from '../src/mirror/audio.ts';
import { LocalStorage, R2Storage, type ContentStorage } from '../src/publish/storage.ts';
import type { ReadQulSource } from '../src/sources/qul/index.ts';
import { parseQulRecitation, QUL_RECITATIONS, qulRecitationAudioUrls, qulRecitationSourceKey } from '../src/sources/qul/recitations.ts';
import {
    parseQulSurahRecitation,
    QUL_SURAH_RECITATIONS,
    qulSurahAudioUrls,
    qulSurahRecitationSourceKey,
} from '../src/sources/qul/surah-recitations.ts';

const HELP = `Usage: npm run mirror-audio -- [options]

  --kind verse|surah     Recitations played verse by verse, or streamed surah by surah (default: verse)
  --target local|r2      Where to copy the audio (default: local)
  --out <dir>            Folder for --target local (default: ./out)
  --recitations <ids>    Comma-separated recitations to mirror (default: all of the catalog)
  --qul <dir|r2>         Downloaded QUL files, named <id>.json (default: r2 with --target r2)
  --concurrency <n>      Files downloaded at the same time (default: 8 verses, 4 surahs)
  --dry-run              Download and count, write nothing
  -h, --help`;

const { values } = parseArgs({
    options: {
        kind: { type: 'string', default: 'verse' },
        target: { type: 'string', default: 'local' },
        out: { type: 'string', default: 'out' },
        recitations: { type: 'string' },
        qul: { type: 'string' },
        concurrency: { type: 'string' },
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
        // `<dir>/<key>` first (`qul/surah-recitations/al-husary.json`), then `<dir>/<id>.json`.
        let file = join(source, key);
        let text = await readFile(file, 'utf8').catch(() => undefined);
        if (text === undefined) {
            file = join(source, basename(key));
            text = await readFile(file, 'utf8').catch(() => undefined);
        }
        return text === undefined ? undefined : { text, modifiedAt: (await stat(file)).mtime };
    };
}

if (values.kind !== 'verse' && values.kind !== 'surah') {
    console.error(`Unknown kind "${values.kind}"\n\n${HELP}`);
    process.exit(1);
}
const surahKind = values.kind === 'surah';
const catalog: { id: string }[] = surahKind ? QUL_SURAH_RECITATIONS : QUL_RECITATIONS;

const only = values.recitations?.split(',').map((id) => id.trim()).filter(Boolean);
const recitations = catalog.filter((recitation) => !only || only.includes(recitation.id));
const unknown = only?.filter((id) => !catalog.some((recitation) => recitation.id === id)) ?? [];
if (recitations.length === 0 || unknown.length > 0) {
    console.error(`Unknown ${values.kind} recitation "${unknown.join(', ')}"\n\n${HELP}`);
    process.exit(1);
}

const concurrency = Number(values.concurrency ?? (surahKind ? 4 : 8));
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

const unit = surahKind ? 'surahs' : 'verses';
let missing = 0;
for (const recitation of recitations) {
    const key = surahKind ? qulSurahRecitationSourceKey(recitation.id) : qulRecitationSourceKey(recitation.id);
    const source = await read(key);
    if (!source) {
        console.warn(`⚠️  ${recitation.id}: no source at ${key}, not mirrored`);
        missing++;
        continue;
    }
    const options = { storage, concurrency, dryRun, log };
    const result: MirrorResult = surahKind
        ? await mirrorSurahAudio(recitation, { ...options, urls: qulSurahAudioUrls(parseQulSurahRecitation(source.text)) })
        : await mirrorRecitationAudio(recitation, { ...options, urls: qulRecitationAudioUrls(parseQulRecitation(source.text)) });
    const megabytes = (result.bytes / 1024 / 1024).toFixed(0);
    log(
        `${recitation.id}: ${result.uploaded} ${unit} ${dryRun ? 'to copy' : 'copied'} (${megabytes} MB), ` +
            `${result.skipped} already there, ${result.failed.length} unavailable` +
            `${result.failed.length > 0 ? ` (e.g. ${result.failed.slice(0, 3).join(', ')})` : ''}`,
    );
}

const minutes = Math.round((Date.now() - started) / 60_000);
log(`\n${recitations.length - missing} recitation(s) mirrored in ${minutes} min.`);
