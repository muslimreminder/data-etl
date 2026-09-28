// Uploads QUL translations downloaded by hand to the private R2 bucket read by the ETL.
// QUL has no API and its downloads need an account: download each translation of
// src/sources/qul/catalog.ts from https://qul.tarteel.ai/resources/translation, then:
//   npm run upload-qul -- ~/Downloads                          # every recognized file of the folder
//   npm run upload-qul -- ~/Downloads/fr-rashid-maash-with-footnote-tags.json
//   npm run upload-qul -- --dry-run ~/Downloads                # check the files, upload nothing
//   npm run upload-qul -- es-montada=~/Downloads/montada-islamic-foundation-with-footnote-tags-2.json
//                                                              # a file whose name several translations share
// Files are recognized by name (catalog `file`), checked, then stored as qul/translations/<id>.json.
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { QUL_TRANSLATIONS, qulSourceKey, type QulTranslation } from '../src/sources/qul/catalog.ts';
import { hasFootnoteTags, parseQulTranslation } from '../src/sources/qul/raw.ts';

const BUCKET = process.env.R2_SOURCES_BUCKET?.trim() || 'muslimreminder-sources';
const dryRun = process.argv.includes('--dry-run');
const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
if (args.length === 0) {
    console.error('Usage: npm run upload-qul -- [--dry-run] <file.json | folder>...');
    process.exit(1);
}

const matches = new Map<QulTranslation, string>();
let failed = false;
const files: string[] = [];
for (const arg of args) {
    // `id=file`: the translation is given, not guessed from the file name.
    const explicit = arg.match(/^([a-z0-9-]+)=(.+)$/);
    if (explicit) {
        const translation = QUL_TRANSLATIONS.find(candidate => candidate.id === explicit[1]);
        if (!translation) {
            console.error(`${explicit[1]}: not in the catalog`);
            failed = true;
        } else {
            matches.set(translation, explicit[2]!);
        }
    } else if ((await stat(arg)).isDirectory()) {
        files.push(...(await readdir(arg)).filter((name) => name.endsWith('.json')).map((name) => join(arg, name)));
    } else {
        files.push(arg);
    }
}

const explicitFiles = new Set(matches.values());
const candidates = new Map<QulTranslation, string[]>();
for (const file of files) {
    if (explicitFiles.has(file)) continue;
    const found = QUL_TRANSLATIONS.filter((translation) => translation.file.test(basename(file)));
    if (found.length !== 1) {
        // A folder holds other downloads: only files named explicitly must be recognized.
        if (args.includes(file)) {
            console.error(`${file}: ${found.length === 0 ? 'matches no translation of the catalog' : `matches ${found.map((t) => t.id).join(', ')}`}`);
            failed = true;
        }
        continue;
    }
    const translation = found[0]!;
    if (!matches.has(translation)) candidates.set(translation, [...(candidates.get(translation) ?? []), file]);
}
for (const [translation, found] of candidates) {
    if (found.length === 1) {
        matches.set(translation, found[0]!);
    } else if (found.some(file => args.includes(file))) {
        console.error(`${translation.id}: several files (${found.join(', ')}), keep only one`);
        failed = true;
    } else {
        // A folder holding two downloads with the same name pattern: not guessed, but not fatal either.
        console.warn(`${translation.id}: several files in the folder (${found.map(file => basename(file)).join(', ')}), skipped: pass ${translation.id}=<file>`);
    }
}

const uploads: { translation: QulTranslation; file: string }[] = [];
for (const [translation, file] of matches) {
    try {
        const raw = parseQulTranslation(await readFile(file, 'utf8'));
        if (translation.format === 'footnote-tags' && !hasFootnoteTags(raw)) {
            throw new Error('no footnotes: download "translation-with-footnote-tags.json", not "simple.json"');
        }
        uploads.push({ translation, file });
    } catch (error) {
        console.error(`${file}: ${(error as Error).message}`);
        failed = true;
    }
}

if (failed) process.exit(1);
if (uploads.length === 0) {
    console.error(`No translation of the catalog found in ${args.join(', ')}`);
    process.exit(1);
}

for (const { translation, file } of uploads) {
    const key = qulSourceKey(translation.id);
    console.log(`${basename(file)} → r2://${BUCKET}/${key}${dryRun ? ' (dry run)' : ''}`);
    if (dryRun) continue;
    execFileSync(
        'npx',
        ['-y', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote', '--file', file, '--content-type', 'application/json'],
        { stdio: ['ignore', 'ignore', 'inherit'] },
    );
}

const missing = QUL_TRANSLATIONS.filter((translation) => !matches.has(translation)).map((translation) => translation.id);
console.log(`\n${uploads.length} ${dryRun ? 'to upload' : 'uploaded'}.${missing.length ? ` Not in this upload: ${missing.join(', ')}.` : ''}`);
console.log('Then run GitHub Actions → "Publish content" with content = quran-translations.');
