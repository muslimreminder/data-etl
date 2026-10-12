import { QUL_TRANSLATIONS, qulSourceKey } from './catalog.ts';
import { hasFootnoteTags, parseQulTranslation } from './raw.ts';
import { parseQulRecitation, QUL_RECITATIONS, qulRecitationSourceKey } from './recitations.ts';
import { parseQulSurahInfos, QUL_SURAH_INFOS, qulSurahInfoSourceKey } from './surah-infos.ts';
import { parseQulTafsir, QUL_TAFSIRS, qulTafsirSourceKey } from './tafsirs.ts';
import { parseQulWords, QUL_WORD_TRANSLATIONS, qulWordSourceKey } from './words.ts';

/** `--content` of the ETL that publishes a kind of QUL resource. */
export type QulContent = 'quran-translations' | 'quran-word-translations' | 'quran-surah-infos' | 'quran-tafsirs' | 'quran-recitations';

/** Kind of resource in QUL URLs: `https://qul.tarteel.ai/resources/<type>/<id>`. */
export type QulResourceType = 'translation' | 'tafsir' | 'surah-info' | 'recitation';

export const QUL_RESOURCE_TYPES: QulResourceType[] = ['translation', 'tafsir', 'surah-info', 'recitation'];

/** A resource of one of the catalogs, where to download it on QUL and how to check its file. */
export type QulResource = {
    id: string;
    content: QulContent;
    type: QulResourceType;
    /** Missing for a recitation downloaded before QUL ids were recorded: it can only be uploaded by hand. */
    qulId?: number;
    /** Which download of the resource page to take (the `Download <format>` button). */
    format: string;
    /** Recognizes the downloaded file, whatever QUL or the browser named it. */
    file: RegExp;
    /** Object key in the private sources bucket. */
    key: string;
    check: (text: string) => void;
};

export const QUL_RESOURCES: QulResource[] = [
    ...QUL_TRANSLATIONS.map((translation) => ({
        id: translation.id,
        content: 'quran-translations' as const,
        type: 'translation' as const,
        qulId: translation.qulId,
        format: translation.format === 'footnote-tags' ? 'translation-with-footnote-tags.json' : 'simple.json',
        file: translation.file,
        key: qulSourceKey(translation.id),
        check: (text: string) => {
            const raw = parseQulTranslation(text);
            if (translation.format === 'footnote-tags' && !hasFootnoteTags(raw)) {
                throw new Error('no footnotes: download "translation-with-footnote-tags.json", not "simple.json"');
            }
        },
    })),
    ...QUL_WORD_TRANSLATIONS.map((translation) => ({
        id: translation.id,
        content: 'quran-word-translations' as const,
        type: 'translation' as const,
        qulId: translation.qulId,
        format: 'json',
        file: translation.file,
        key: qulWordSourceKey(translation.id),
        check: (text: string) => void parseQulWords(text),
    })),
    ...QUL_SURAH_INFOS.map((info) => ({
        id: info.id,
        content: 'quran-surah-infos' as const,
        type: 'surah-info' as const,
        qulId: info.qulId,
        format: 'json',
        file: info.file,
        key: qulSurahInfoSourceKey(info.id),
        check: (text: string) => void parseQulSurahInfos(text),
    })),
    ...QUL_TAFSIRS.map((tafsir) => ({
        id: tafsir.id,
        content: 'quran-tafsirs' as const,
        type: 'tafsir' as const,
        qulId: tafsir.qulId,
        format: 'json',
        file: tafsir.file,
        key: qulTafsirSourceKey(tafsir.id),
        check: (text: string) => void parseQulTafsir(text),
    })),
    ...QUL_RECITATIONS.map((recitation) => ({
        id: recitation.id,
        content: 'quran-recitations' as const,
        type: 'recitation' as const,
        ...(recitation.qulId !== undefined && { qulId: recitation.qulId }),
        format: 'json',
        file: recitation.file,
        key: qulRecitationSourceKey(recitation.id),
        check: (text: string) => void parseQulRecitation(text),
    })),
];
