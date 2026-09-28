import type { LanguageCode } from '@muslimreminder/schema/common';
import type { QuranTranslationId } from '@muslimreminder/schema/content';

/** A translation hand-picked from https://qul.tarteel.ai/resources/translation. */
export type QulTranslation = {
    id: QuranTranslationId;
    /** Id of the resource on QUL (`/resources/translation/{qulId}`). */
    qulId: number;
    language: LanguageCode;
    name: string;
    /** Download to pick on QUL: `translation-with-footnote-tags.json` when it exists, else `simple.json`. */
    format: 'footnote-tags' | 'simple';
    /** Recognizes the downloaded file, whatever QUL or the browser named it. */
    file: RegExp;
    license?: string;
};

/**
 * Published translations, in catalog order. To add one: append it here, download it from QUL
 * (an account is required), then `npm run upload-qul -- <file>` and run "Publish content".
 */
export const QUL_TRANSLATIONS: QulTranslation[] = [
    { id: 'fr-hamidullah', qulId: 227, language: 'fr', name: 'Muhammad Hamidullah', format: 'footnote-tags', file: /hamidullah/i },
    { id: 'fr-rashid-maash', qulId: 295, language: 'fr', name: 'Rashid Maash', format: 'footnote-tags', file: /rashid-maash/i },
    { id: 'fr-montada', qulId: 174, language: 'fr', name: 'Montada Islamic Foundation', format: 'footnote-tags', file: /montada/i },
    { id: 'en-daryabadi', qulId: 276, language: 'en', name: 'Abdul Majid Daryabadi', format: 'simple', file: /daryabadi/i },
];

/** Object key of a downloaded QUL file in the private sources bucket. */
export const qulSourceKey = (id: QuranTranslationId) => `qul/translations/${id}.json`;
