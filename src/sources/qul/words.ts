import type { LanguageCode } from '@muslimreminder/schema/common';
import {
    contentKeys,
    QURAN_VERSE_COUNTS,
    QuranWordTranslationFileSchema,
    QuranWordTranslationsFileSchema,
    type QuranTranslationId,
    type QuranWordTranslation,
    type QuranWordTranslationFile,
} from '@muslimreminder/schema/content';
import { decodeHTML } from 'entities';
import { z } from 'zod';
import type { OutputFile } from '../../output.ts';
import type { ReadQulSource } from './index.ts';

/** A word-by-word translation hand-picked from https://qul.tarteel.ai/resources/translation. */
export type QulWordTranslation = {
    id: QuranTranslationId;
    qulId: number;
    language: LanguageCode;
    name: string;
    /** Recognizes the downloaded file (`<language>-wbw-translation.json` on QUL). */
    file: RegExp;
};

export const QUL_WORD_TRANSLATIONS: QulWordTranslation[] = [
    { id: 'fr-wbw', qulId: 95, language: 'fr', name: 'Mot à mot', file: /french-wbw/i },
    { id: 'en-wbw', qulId: 92, language: 'en', name: 'Word by word', file: /english-wbw/i },
    { id: 'tr-wbw', qulId: 99, language: 'tr', name: 'Kelime kelime', file: /turkish-wbw/i },
];

export const qulWordSourceKey = (id: QuranTranslationId) => `qul/word-translations/${id}.json`;

/** A QUL word-by-word JSON: `{ "1:1:1": "In (the) name", … }`, keyed `surah:verse:word`. */
export const RawQulWordsSchema = z.record(z.string().regex(/^\d+:\d+:\d+$/, 'Expected "surah:verse:word" keys'), z.string());
export type RawQulWords = z.infer<typeof RawQulWordsSchema>;

/** Some files also translate the verse end marker, as a last word such as `(255)`: it is not a word. */
const VERSE_NUMBER = /^\(\d+\)$/;

export function parseQulWords(text: string): RawQulWords {
    const result = RawQulWordsSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL word-by-word translation: ${result.error.issues.slice(0, 3).map((issue) => issue.message).join('; ')}`);
    }
    return result.data;
}

/**
 * `surahs[s - 1][v - 1][w - 1]`: the words of every verse at their position, `null` where the source
 * skips one. A verse the source has no word for at all fails: the file is not a whole Quran.
 */
export function toWordTranslationFile(
    translation: QulWordTranslation,
    raw: RawQulWords,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranWordTranslationFile {
    const verses = new Map<string, Map<number, string>>();
    for (const [key, value] of Object.entries(raw)) {
        const text = decodeHTML(value).replace(/\s+/g, ' ').trim();
        if (!text || VERSE_NUMBER.test(text)) continue;
        const [surah, ayah, word] = key.split(':').map(Number) as [number, number, number];
        const words = verses.get(`${surah}:${ayah}`) ?? new Map<number, string>();
        words.set(word, text);
        verses.set(`${surah}:${ayah}`, words);
    }

    const missing: string[] = [];
    let holes = 0;
    const surahs = QURAN_VERSE_COUNTS.map((count, surah) =>
        Array.from({ length: count }, (_, ayah) => {
            const words = verses.get(`${surah + 1}:${ayah + 1}`);
            if (!words) {
                missing.push(`${surah + 1}:${ayah + 1}`);
                return [null];
            }
            const last = Math.max(...words.keys());
            return Array.from({ length: last }, (_, index) => {
                const text = words.get(index + 1) ?? null;
                if (text === null) holes++;
                return text;
            });
        }),
    );
    if (missing.length > 0) {
        throw new Error(`${translation.id}: no word for ${missing.length} verse(s), e.g. ${missing.slice(0, 3).join(', ')}`);
    }
    if (holes > 0) options.warn(`${translation.id}: ${holes} word(s) without a translation`);

    const entry: QuranWordTranslation = {
        id: translation.id,
        language: translation.language,
        name: translation.name,
        translatedWordCount: surahs.flat(2).filter((word) => word !== null).length,
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: `https://qul.tarteel.ai/resources/translation/${translation.qulId}`,
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranWordTranslationFileSchema.parse({ schemaVersion: 1, translation: entry, surahs });
}

/** One file per word-by-word translation, then their catalog; a missing source keeps its published entry. */
export async function buildWordTranslationFiles(
    read: ReadQulSource,
    options: {
        previous?: QuranWordTranslation[];
        translations?: QulWordTranslation[];
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<OutputFile[]> {
    const previous = new Map(options.previous?.map((translation) => [translation.id, translation]));
    const files: OutputFile[] = [];
    const catalog: QuranWordTranslation[] = [];

    for (const translation of options.translations ?? QUL_WORD_TRANSLATIONS) {
        const source = await read(qulWordSourceKey(translation.id));
        if (!source) {
            const kept = previous.get(translation.id);
            if (kept) catalog.push(kept);
            options.warn(`${translation.id}: no source at ${qulWordSourceKey(translation.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const file = toWordTranslationFile(translation, parseQulWords(source.text), {
            retrievedAt: source.modifiedAt.toISOString(),
            warn: options.warn,
        });
        files.push({ key: contentKeys.quran.wordTranslation(translation.id), data: file });
        catalog.push(file.translation);
        options.log(`${translation.id}: ${file.translation.translatedWordCount} translated words`);
    }

    files.push({
        key: contentKeys.quran.wordTranslations(),
        data: QuranWordTranslationsFileSchema.parse({ schemaVersion: 1, translations: catalog }),
    });
    return files;
}
