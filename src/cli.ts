import { parseArgs } from 'node:util';
import { contentKeys, HadithCollectionsFileSchema } from '@muslimreminder/schema/content';
import { publish, readManifest, readPublished } from './publish/publish.ts';
import { LocalStorage, R2Storage, type ContentStorage } from './publish/storage.ts';
import { SunnahClient } from './sources/sunnah/client.ts';
import { buildHadithFiles } from './sources/sunnah/index.ts';

const HELP = `Usage: npm run etl -- [options]

  --target local|r2     Where to publish (default: local)
  --out <dir>           Folder for --target local (default: ./out)
  --collections <ids>   Comma-separated sunnah.com collections to rebuild (default: all)
  --dry-run             Build and compare, but write nothing
  -h, --help

Env: SUNNAH_API_KEY, and for --target r2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (default muslimreminder-content)`;

const { values } = parseArgs({
    options: {
        target: { type: 'string', default: 'local' },
        out: { type: 'string', default: 'out' },
        collections: { type: 'string' },
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

function createStorage(): ContentStorage {
    if (values.target === 'local') return new LocalStorage(values.out);
    if (values.target === 'r2') {
        return new R2Storage({
            accountId: requireEnv('R2_ACCOUNT_ID'),
            accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
            secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
            bucket: process.env.R2_BUCKET?.trim() || 'muslimreminder-content',
        });
    }
    console.error(`Unknown target "${values.target}"\n\n${HELP}`);
    process.exit(1);
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
log(`Publishing to ${storage.description}${dryRun ? ' (dry run)' : ''}${only ? `, collections: ${only.join(', ')}` : ''}`);

const previous = await readManifest(storage);
const published = await readPublished(storage, previous, contentKeys.hadith.collections(), HadithCollectionsFileSchema);

const client = new SunnahClient({ apiKey: requireEnv('SUNNAH_API_KEY'), log: warn });
const files = await buildHadithFiles(client, {
    ...(only && { only }),
    ...(published && { previous: published.collections }),
    retrievedAt: now.toISOString(),
    log,
    warn,
});

const result = await publish(storage, files, { previous, now, dryRun, log });
const seconds = Math.round((Date.now() - started) / 1000);
log(
    `\n${files.length} files built, ${result.uploaded.length} ${dryRun ? 'to upload' : 'uploaded'}, ${result.unchanged} unchanged, ` +
        `manifest ${result.manifestUpdated ? (dryRun ? 'would be updated' : 'updated') : 'unchanged'}. ` +
        `${client.requestCount} sunnah.com requests, ${warnings.length} warnings, ${seconds}s.`,
);
