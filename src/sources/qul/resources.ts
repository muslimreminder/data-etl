import { QUL_TRANSLATIONS, qulSourceKey } from './catalog.ts';
import { hasFootnoteTags, parseQulTranslation } from './raw.ts';
import { parseQulRecitation, QUL_RECITATIONS, qulRecitationSourceKey } from './recitations.ts';
import { parseQulSurahInfos, QUL_SURAH_INFOS, qulSurahInfoSourceKey } from './surah-infos.ts';
import { parseQulTafsir, QUL_TAFSIRS, qulTafsirSourceKey } from './tafsirs.ts';
import { QUL_MUSHAFS, qulMushafLayoutKey, qulMushafScriptKey } from './mushafs.ts';
import { parseQulWords, QUL_WORD_TRANSLATIONS, qulWordSourceKey } from './words.ts';

/** `--content` of the ETL that publishes a kind of QUL resource. */
export type QulContent =
    | 'quran-translations'
    | 'quran-word-translations'
    | 'quran-surah-infos'
    | 'quran-tafsirs'
    | 'quran-recitations'
    | 'quran-mushafs';

/** Kind of resource in QUL URLs: `https://qul.tarteel.ai/resources/<type>/<id>`. */
export type QulResourceType = 'translation' | 'tafsir' | 'surah-info' | 'recitation' | 'quran-script' | 'mushaf-layout';

/** Kinds whose new resources the sync reports. Scripts and layouts only matter with a font, picked by hand. */
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
    /** Object type in the sources bucket. */
    contentType?: string;
    check: (bytes: Uint8Array) => void;
};

const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

const SQLITE_HEADER = 'SQLite format 3\0';

export const QUL_RESOURCES: QulResource[] = [
    ...QUL_TRANSLATIONS.map((translation) => ({
        id: translation.id,
        content: 'quran-translations' as const,
        type: 'translation' as const,
        qulId: translation.qulId,
        format: translation.format === 'footnote-tags' ? 'translation-with-footnote-tags.json' : 'simple.json',
        file: translation.file,
        key: qulSourceKey(translation.id),
        check: (bytes: Uint8Array) => {
            const raw = parseQulTranslation(utf8(bytes));
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
        check: (bytes: Uint8Array) => void parseQulWords(utf8(bytes)),
    })),
    ...QUL_SURAH_INFOS.map((info) => ({
        id: info.id,
        content: 'quran-surah-infos' as const,
        type: 'surah-info' as const,
        qulId: info.qulId,
        format: 'json',
        file: info.file,
        key: qulSurahInfoSourceKey(info.id),
        check: (bytes: Uint8Array) => void parseQulSurahInfos(utf8(bytes)),
    })),
    ...QUL_TAFSIRS.map((tafsir) => ({
        id: tafsir.id,
        content: 'quran-tafsirs' as const,
        type: 'tafsir' as const,
        qulId: tafsir.qulId,
        format: 'json',
        file: tafsir.file,
        key: qulTafsirSourceKey(tafsir.id),
        check: (bytes: Uint8Array) => void parseQulTafsir(utf8(bytes)),
    })),
    ...QUL_RECITATIONS.map((recitation) => ({
        id: recitation.id,
        content: 'quran-recitations' as const,
        type: 'recitation' as const,
        ...(recitation.qulId !== undefined && { qulId: recitation.qulId }),
        format: 'json',
        file: recitation.file,
        key: qulRecitationSourceKey(recitation.id),
        check: (bytes: Uint8Array) => void parseQulRecitation(utf8(bytes)),
    })),
    ...QUL_MUSHAFS.flatMap((mushaf) => [
        {
            id: `${mushaf.id}-script`,
            content: 'quran-mushafs' as const,
            type: 'quran-script' as const,
            qulId: mushaf.script.qulId,
            format: 'json',
            file: mushaf.script.file,
            key: qulMushafScriptKey(mushaf.id),
            check: (bytes: Uint8Array) => void JSON.parse(utf8(bytes)),
        },
        {
            id: `${mushaf.id}-layout`,
            content: 'quran-mushafs' as const,
            type: 'mushaf-layout' as const,
            qulId: mushaf.layout.qulId,
            format: 'sqlite',
            file: mushaf.layout.file,
            key: qulMushafLayoutKey(mushaf.id),
            contentType: 'application/vnd.sqlite3',
            check: (bytes: Uint8Array) => {
                if (new TextDecoder().decode(bytes.subarray(0, 16)) !== SQLITE_HEADER) throw new Error('not a SQLite database');
            },
        },
    ]),
];
