import { contentKeys, QuranTranslationsFileSchema, type QuranTranslation } from '@muslimreminder/schema/content';
import type { OutputFile } from '../../output.ts';
import { QUL_TRANSLATIONS, qulSourceKey, type QulTranslation } from './catalog.ts';
import { hasFootnoteTags, parseQulTranslation } from './raw.ts';
import { toTranslationFile } from './transform.ts';

/** A downloaded QUL file, and when it was uploaded (published as `retrievedAt`, stable across runs). */
export type QulSource = { text: string; modifiedAt: Date };
export type ReadQulSource = (key: string) => Promise<QulSource | undefined>;

export type BuildTranslationOptions = {
    /** Currently published catalog: a translation whose source is missing keeps its published entry. */
    previous?: QuranTranslation[];
    translations?: QulTranslation[];
    log: (message: string) => void;
    warn: (message: string) => void;
};

/** One file per translation, then the catalog (`quran/translations`) listing every published one. */
export async function buildTranslationFiles(read: ReadQulSource, options: BuildTranslationOptions): Promise<OutputFile[]> {
    const { log, warn } = options;
    const previous = new Map(options.previous?.map((translation) => [translation.id, translation]));
    const files: OutputFile[] = [];
    const catalog: QuranTranslation[] = [];

    for (const translation of options.translations ?? QUL_TRANSLATIONS) {
        const source = await read(qulSourceKey(translation.id));
        if (!source) {
            const kept = previous.get(translation.id);
            if (kept) catalog.push(kept);
            warn(`${translation.id}: no source at ${qulSourceKey(translation.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const raw = parseQulTranslation(source.text);
        if (translation.format === 'footnote-tags' && !hasFootnoteTags(raw)) {
            warn(`${translation.id}: expected the footnote-tags download, got a file without footnotes`);
        }
        const file = toTranslationFile(translation, raw, { retrievedAt: source.modifiedAt.toISOString(), warn });
        files.push({ key: contentKeys.quran.translation(translation.id), data: file });
        catalog.push(file.translation);
        log(`${translation.id}: ${file.translation.footnotedVerseCount} footnoted verses`);
    }

    const data = QuranTranslationsFileSchema.parse({ schemaVersion: 1, translations: catalog });
    files.push({ key: contentKeys.quran.translations(), data });
    return files;
}
