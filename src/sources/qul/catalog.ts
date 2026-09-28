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
    { id: 'tr-dar-al-salam', qulId: 196, language: 'tr', name: 'Dar Al-Salam Center', format: 'simple', file: /dar-al-salam/i },
    { id: 'tr-muslim-shahin', qulId: 157, language: 'tr', name: 'Muslim Shahin', format: 'simple', file: /muslim-shahin/i },
    { id: 'tr-shaban-britch', qulId: 161, language: 'tr', name: 'Shaban Britch', format: 'simple', file: /shaban-britch/i },
    { id: 'tr-hamdi', qulId: 233, language: 'tr', name: 'Elmalılı Hamdi Yazır', format: 'simple', file: /hamdi/i },
    { id: 'de-bubenheim', qulId: 191, language: 'de', name: 'Frank Bubenheim & Nadeem Elyas', format: 'simple', file: /bubenheim/i },
    { id: 'es-isa-garcia', qulId: 152, language: 'es', name: 'Isa Garcia', format: 'footnote-tags', file: /isa-garcia/i },
    // Same QUL file name as the French one: pass it explicitly, `npm run upload-qul -- es-montada=<file>`.
    { id: 'es-montada', qulId: 176, language: 'es', name: 'Montada Islamic Foundation', format: 'footnote-tags', file: /montada/i },
    { id: 'es-noor-international', qulId: 223, language: 'es', name: 'Noor International Center', format: 'footnote-tags', file: /noor-international/i },
    { id: 'ru-kuliev', qulId: 136, language: 'ru', name: 'Elmir Kuliev', format: 'simple', file: /kuliev/i },
    { id: 'ru-abu-adel', qulId: 150, language: 'ru', name: 'Abu Adel', format: 'simple', file: /abu-adel/i },
    { id: 'ru-sablukov', qulId: 274, language: 'ru', name: 'Gordy Semyonovich Sablukov', format: 'simple', file: /gordy|sablukov/i },
    { id: 'ru-osmanov', qulId: 271, language: 'ru', name: 'Magomed-Nuri Osmanov', format: 'simple', file: /nuri|osmanov/i },
];

/** Object key of a downloaded QUL file in the private sources bucket. */
export const qulSourceKey = (id: QuranTranslationId) => `qul/translations/${id}.json`;
