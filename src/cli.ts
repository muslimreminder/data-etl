import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import {
    contentKeys,
    HadithCollectionsFileSchema,
    QuranSurahInfosFileSchema,
    QuranTranslationsFileSchema,
    QuranWordTranslationsFileSchema,
} from '@muslimreminder/schema/content';
import type { OutputFile } from './output.ts';
import { publish, readManifest, readPublished } from './publish/publish.ts';
import { LocalStorage, R2Storage, type ContentStorage } from './publish/storage.ts';
import { SunnahClient } from './sources/sunnah/client.ts';
import { parseHadithDump, type SunnahDump } from './sources/sunnah/dump.ts';
import { buildHadithFiles } from './sources/sunnah/index.ts';
import { buildTranslationFiles, type ReadQulSource } from './sources/qul/index.ts';
import { buildSurahInfoFiles } from './sources/qul/surah-infos.ts';
import { buildWordTranslationFiles } from './sources/qul/words.ts';

const HELP = `Usage: npm run etl -- [options]

  --content <list>      Comma-separated: hadith, quran-translations, quran-word-translations,
                        quran-surah-infos (default: hadith)
  --target local|r2     Where to publish (default: local)
  --out <dir>           Folder for --target local (default: ./out)
  --collections <ids>   Comma-separated sunnah.com collections to rebuild (default: all)
  --dump <file|none>    sunnah.com snapshot (HadithTable.sql[.gz]). Default: r2://muslimreminder-sources
                        with --target r2, none with --target local
  --qul <dir|r2>        Downloaded QUL files (translations, surah infos), named <id>.json (see npm run upload-qul).
                        Default: r2://muslimreminder-sources with --target r2
  --dry-run             Build and compare, but write nothing
  -h, --help

Env: SUNNAH_API_KEY (hadith), and for --target r2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_BUCKET (default muslimreminder-content), R2_SOURCES_BUCKET (default muslimreminder-sources)`;

const DUMP_KEY = 'sunnah/HadithTable.sql.gz';

const { values } = parseArgs({
    options: {
        content: { type: 'string', default: 'hadith' },
        target: { type: 'string', default: 'local' },
        out: { type: 'string', default: 'out' },
        collections: { type: 'string' },
        dump: { type: 'string' },
        qul: { type: 'string' },
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

const CONTENTS = ['hadith', 'quran-translations', 'quran-word-translations', 'quran-surah-infos'] as const;
const contents = values.content.split(',').map((content) => content.trim()).filter(Boolean);
const unknownContent = contents.filter((content) => !(CONTENTS as readonly string[]).includes(content));
if (contents.length === 0 || unknownContent.length > 0) {
    console.error(`Unknown content "${unknownContent.join(', ')}"\n\n${HELP}`);
    process.exit(1);
}

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

/** The snapshot only enriches the API: a missing or unreadable dump never fails the run. */
async function loadDump(): Promise<SunnahDump | undefined> {
    const source = values.dump ?? (values.target === 'r2' ? 'r2' : 'none');
    if (source === 'none') return undefined;
    try {
        const bytes = source === 'r2'
            ? await r2(sourcesBucket()).getBytes(DUMP_KEY)
            : await readFile(source);
        if (!bytes) {
            warn(`No sunnah.com snapshot at ${DUMP_KEY}: hadiths published without sanad/matan`);
            return undefined;
        }
        const buffer = Buffer.from(bytes);
        const sql = (buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer) : buffer).toString('utf8');
        const dump = parseHadithDump(sql);
        log(`Snapshot loaded: ${dump.byArabicUrn.size} hadiths`);
        return dump;
    } catch (error) {
        warn(`sunnah.com snapshot unusable (${(error as Error).message}): hadiths published without sanad/matan`);
        return undefined;
    }
}

const sourcesBucket = () => process.env.R2_SOURCES_BUCKET?.trim() || 'muslimreminder-sources';

/** Where the downloaded QUL files are: the private sources bucket, or a local folder of `<id>.json`. */
function qulSource(): ReadQulSource {
    const source = values.qul ?? (values.target === 'r2' ? 'r2' : undefined);
    if (source === undefined) {
        console.error(`--qul <dir> is required to build QUL content locally\n\n${HELP}`);
        process.exit(1);
    }
    if (source === 'r2') {
        const bucket = r2(sourcesBucket());
        return (key) => bucket.getWithDate(key);
    }
    // A local folder holds every kind side by side, as `<id>.json`: ids never collide between kinds.
    return async (key) => {
        const file = join(source, basename(key));
        const text = await readFile(file, 'utf8').catch(() => undefined);
        return text === undefined ? undefined : { text, modifiedAt: (await stat(file)).mtime };
    };
}

const log = (message: string) => console.log(message);
const warnings: string[] = [];
const warn = (message: string) => {
    warnings.push(message);
    console.warn(`⚠️  ${message}`);
};

const started = Date.now();
const now = new Date();
const storage = createStorage();
const dryRun = values['dry-run'];
const only = values.collections?.split(',').map((id) => id.trim()).filter(Boolean);
log(
    `Publishing ${contents.join(', ')} to ${storage.description}${dryRun ? ' (dry run)' : ''}` +
        `${only && contents.includes('hadith') ? `, collections: ${only.join(', ')}` : ''}`,
);

const previous = await readManifest(storage);
const files: OutputFile[] = [];
let sunnahRequests: number | undefined;

if (contents.includes('hadith')) {
    const published = await readPublished(storage, previous, contentKeys.hadith.collections(), HadithCollectionsFileSchema);
    const dump = await loadDump();
    const client = new SunnahClient({ apiKey: requireEnv('SUNNAH_API_KEY'), log: warn });
    files.push(
        ...(await buildHadithFiles(client, {
            ...(dump && { dump }),
            ...(only && { only }),
            ...(published && { previous: published.collections }),
            retrievedAt: now.toISOString(),
            log,
            warn,
        })),
    );
    sunnahRequests = client.requestCount;
}

if (contents.includes('quran-translations')) {
    const published = await readPublished(storage, previous, contentKeys.quran.translations(), QuranTranslationsFileSchema);
    files.push(
        ...(await buildTranslationFiles(qulSource(), {
            ...(published && { previous: published.translations }),
            log,
            warn,
        })),
    );
}

if (contents.includes('quran-word-translations')) {
    const published = await readPublished(storage, previous, contentKeys.quran.wordTranslations(), QuranWordTranslationsFileSchema);
    files.push(
        ...(await buildWordTranslationFiles(qulSource(), {
            ...(published && { previous: published.translations }),
            log,
            warn,
        })),
    );
}

if (contents.includes('quran-surah-infos')) {
    const published = await readPublished(storage, previous, contentKeys.quran.surahInfos(), QuranSurahInfosFileSchema);
    files.push(
        ...(await buildSurahInfoFiles(qulSource(), {
            ...(published && { previous: published.infos }),
            log,
            warn,
        })),
    );
}

const result = await publish(storage, files, { previous, now, dryRun, log });
const seconds = Math.round((Date.now() - started) / 1000);
log(
    `\n${files.length} files built, ${result.uploaded.length} ${dryRun ? 'to upload' : 'uploaded'}, ${result.unchanged} unchanged, ` +
        `manifest ${result.manifestUpdated ? (dryRun ? 'would be updated' : 'updated') : 'unchanged'}. ` +
        `${sunnahRequests === undefined ? '' : `${sunnahRequests} sunnah.com requests, `}${warnings.length} warnings, ${seconds}s.`,
);
