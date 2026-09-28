import {
    QURAN_VERSE_COUNTS,
    QuranTranslationFileSchema,
    type QuranFootnote,
    type QuranTranslation,
    type QuranTranslationFile,
    type QuranVerseTranslation,
} from '@muslimreminder/schema/content';
import { decodeHTML } from 'entities';
import type { QulTranslation } from './catalog.ts';
import type { RawQulTranslation, RawQulVerse } from './raw.ts';

const FOOTNOTE_TAG = /<sup\b[^>]*\bfoot_note="?(\d+)"?[^>]*>.*?<\/sup>/gis;
/** Stands for a footnote marker while the text is cleaned, so that its offset follows the cleaning. */
const MARKER = '\u0000';

/** Footnote HTML → plain text; `<br>` separates notes merged by the source, kept as paragraphs. */
export function footnoteToText(html: string): string {
    return decodeHTML(html.replace(/(?:\s*<br\s*\/?>\s*)+/gi, '\n\n').replace(/<[^>]+>/g, ''))
        .replace(/ /g, ' ')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** A QUL verse → plain text, footnotes taken out and kept with the offset of their marker. */
export function toVerse(raw: RawQulVerse, ref: string, warn: (message: string) => void): QuranVerseTranslation {
    const notes: string[] = [];
    const marked = raw.t.replace(FOOTNOTE_TAG, (_, id: string) => {
        const text = footnoteToText(raw.f?.[id] ?? '');
        if (!text) {
            warn(`${ref}: footnote ${id} is missing or empty, dropped`);
            return '';
        }
        notes.push(text);
        return MARKER;
    });

    const cleaned = decodeHTML(marked.replace(/<[^>]+>/g, ''))
        .replace(/ /g, ' ')
        // A marker sticks to the word before it: "prière. ¹" and "prière.¹" give the same offset.
        .replace(new RegExp(`\\s+${MARKER}`, 'g'), MARKER)
        .replace(/\s+/g, ' ')
        .trim();

    let text = '';
    const footnotes: QuranFootnote[] = [];
    for (const char of cleaned) {
        if (char === MARKER) {
            footnotes.push({ offset: text.length, text: notes[footnotes.length]! });
        } else {
            text += char;
        }
    }
    return footnotes.length > 0 ? { text, footnotes } : { text };
}

export function toTranslationFile(
    translation: QulTranslation,
    raw: RawQulTranslation,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranTranslationFile {
    const surahs = QURAN_VERSE_COUNTS.map((count, surah) =>
        Array.from({ length: count }, (_, verse) => {
            const ref = `${translation.id} ${surah + 1}:${verse + 1}`;
            return toVerse(raw[`${surah + 1}:${verse + 1}`]!, ref, options.warn);
        }),
    );
    const entry: QuranTranslation = {
        id: translation.id,
        language: translation.language,
        name: translation.name,
        footnotedVerseCount: surahs.flat().filter((verse) => verse.footnotes).length,
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: `https://qul.tarteel.ai/resources/translation/${translation.qulId}`,
            ...(translation.license && { license: translation.license }),
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranTranslationFileSchema.parse({ schemaVersion: 1, translation: entry, surahs });
}
