import type { LanguageCode } from '@muslimreminder/schema/common';
import {
    contentKeys,
    QURAN_SURAH_COUNT,
    QURAN_VERSE_COUNTS,
    QuranTafsirFileSchema,
    QuranTafsirsFileSchema,
    type QuranTafsir,
    type QuranTafsirBlock,
    type QuranTafsirFile,
    type QuranTafsirPassage,
    type QuranTranslationId,
} from '@muslimreminder/schema/content';
import { z } from 'zod';
import type { OutputFile } from '../../output.ts';
import type { ReadQulSource } from './index.ts';
import { htmlToBlocks } from './surah-infos.ts';

/** Tafsirs hand-picked from https://qul.tarteel.ai/resources/tafsir. */
export type QulTafsir = {
    id: QuranTranslationId;
    qulId: number;
    language: LanguageCode;
    name: string;
    author?: string;
    /** Recognizes the downloaded file, named after the QUL resource. */
    file: RegExp;
    /**
     * What a backtick stands for: an ʿayn in transliterations (`Fir`awn`), an apostrophe in Albanian
     * (`t`u`), nothing where it only opens a transliteration (French Mukhtasar: `(`ar-rabbu)`).
     */
    backtick: string;
    /** Rejoins the words the source hyphenated at its line ends (`словосо- четания`), a PDF extraction left-over. */
    joinHyphenatedWords?: boolean;
};

const AYN = 'ʿ';

/**
 * Published tafsirs, in catalog order. Left out: the Turkish "Tafsir Ibne Kathir" (QUL 306), which only
 * holds the translation of the verses, not a commentary.
 */
export const QUL_TAFSIRS: QulTafsir[] = [
    { id: 'ar-ibn-kathir', qulId: 22, language: 'ar', name: 'Tafsir Ibn Kathir', author: 'Ismail ibn Kathir', file: /^ar-tafsir-ibn-kathir/i, backtick: AYN },
    { id: 'ar-ibn-abi-zamanin', qulId: 499, language: 'ar', name: 'Tafsir Ibn Abi Zamanin', author: 'Ibn Abi Zamanin', file: /^tafsir-ibn-abi-zamanin/i, backtick: AYN },
    { id: 'en-ibn-kathir', qulId: 35, language: 'en', name: 'Tafsir Ibn Kathir (abridged)', author: 'Ismail ibn Kathir', file: /^en-taf(?:si|is)r-ibn-kathir/i, backtick: AYN },
    { id: 'en-mukhtasar', qulId: 266, language: 'en', name: 'Al-Mukhtasar (Abridged Explanation of the Quran)', file: /^abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'fr-mukhtasar', qulId: 259, language: 'fr', name: 'Al-Mukhtasar (L’Exégèse abrégée du Coran)', file: /^french-mokhtasar/i, backtick: '' },
    { id: 'ru-ibn-kathir', qulId: 307, language: 'ru', name: 'Tafsir Ibn Kathir', author: 'Ismail ibn Kathir', file: /^ru-tafsir-ibne?-ka(?:h?t|th)h?ir/i, backtick: AYN },
    { id: 'ru-saadi', qulId: 310, language: 'ru', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /^tafsir-as-saadi-russian/i, backtick: AYN, joinHyphenatedWords: true },
    { id: 'ru-mukhtasar', qulId: 262, language: 'ru', name: 'Al-Mukhtasar', file: /^russian-mokhtasar/i, backtick: AYN },
    { id: 'sq-saadi', qulId: 283, language: 'sq', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /^sq-saadi/i, backtick: '’' },
    // Free to republish: QuranEnc.com tafsirs (Muyassar, Saadi, Siraj, Mukhtasar) and classical works in the
    // public domain. Left out: modern works under copyright (Tahrir wa Tanwir, Al-Wasit, Adwa al-Bayan…).
    { id: 'ar-muyassar', qulId: 38, language: 'ar', name: 'Tafsir al-Muyassar', author: 'King Fahd Quran Complex', file: /tafsir-muyassar/i, backtick: AYN },
    { id: 'ar-saadi', qulId: 308, language: 'ar', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /tafsir-as-saadi/i, backtick: AYN },
    { id: 'ar-siraj', qulId: 250, language: 'ar', name: 'As-Siraj fi Bayan Gharib al-Quran', author: 'Muhammad al-Khudayri', file: /asseraj-fi-bayan-gharib-alquran/i, backtick: AYN },
    { id: 'ar-mukhtasar', qulId: 251, language: 'ar', name: 'Al-Mukhtasar fi Tafsir al-Quran', file: /arabic-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'ar-tabari', qulId: 37, language: 'ar', name: 'Tafsir al-Tabari', author: 'Ibn Jarir al-Tabari', file: /tafsir-al-tabari/i, backtick: AYN },
    { id: 'ar-qurtubi', qulId: 23, language: 'ar', name: 'Tafsir al-Qurtubi', author: 'Abu Abdillah al-Qurtubi', file: /tafseer-al-qurtubi/i, backtick: AYN },
    { id: 'ar-baghawi', qulId: 27, language: 'ar', name: 'Tafsir al-Baghawi', author: 'Al-Husayn al-Baghawi', file: /tafseer-al-baghawi/i, backtick: AYN },
    { id: 'ar-jalalayn', qulId: 523, language: 'ar', name: 'Tafsir al-Jalalayn', author: 'Jalal ad-Din al-Mahalli & Jalal ad-Din as-Suyuti', file: /tafsir-jalalayn/i, backtick: AYN },
    { id: 'ar-ibn-juzay', qulId: 491, language: 'ar', name: 'Tafsir Ibn Juzay (At-Tashil)', author: 'Ibn Juzay al-Kalbi', file: /tafsir-ibn-juzay/i, backtick: AYN },
    { id: 'ar-baydawi', qulId: 518, language: 'ar', name: 'Tafsir al-Baydawi', author: 'Nasir ad-Din al-Baydawi', file: /tafsir-al-baydawi/i, backtick: AYN },
    { id: 'ar-nasafi', qulId: 514, language: 'ar', name: 'Tafsir an-Nasafi', author: 'Abu al-Barakat an-Nasafi', file: /tafsir-al-nasafi/i, backtick: AYN },
    { id: 'ar-samani', qulId: 529, language: 'ar', name: 'Tafsir as-Samani', author: 'Abu al-Muzaffar as-Samani', file: /tafsir-al-sam-ani/i, backtick: AYN },
    { id: 'ar-ibn-al-jawzi', qulId: 496, language: 'ar', name: 'Zad al-Masir', author: 'Ibn al-Jawzi', file: /tafsir-ibn-al-jawzi/i, backtick: AYN },
    { id: 'ar-shawkani', qulId: 494, language: 'ar', name: 'Fath al-Qadir', author: 'Muhammad ash-Shawkani', file: /fath-al-qadir-al-shawkani/i, backtick: AYN },
    { id: 'ar-ibn-abi-hatim', qulId: 502, language: 'ar', name: 'Tafsir Ibn Abi Hatim', author: 'Ibn Abi Hatim ar-Razi', file: /tafsir-ibn-abi-hatim/i, backtick: AYN },
    { id: 'ar-durr-manthur', qulId: 493, language: 'ar', name: 'Ad-Durr al-Manthur', author: 'Jalal ad-Din as-Suyuti', file: /al-durr-al-manthur/i, backtick: AYN },
    { id: 'ar-biqai', qulId: 498, language: 'ar', name: 'Nazm ad-Durar', author: 'Burhan ad-Din al-Biqai', file: /nazam-al-durar-al-biqa-i/i, backtick: AYN },
    { id: 'ar-ibn-atiyyah', qulId: 509, language: 'ar', name: 'Al-Muharrar al-Wajiz', author: 'Ibn Atiyyah', file: /al-muharrar-al-wajiz-ibn-atiyyah/i, backtick: AYN },
    { id: 'ar-wahidi-basit', qulId: 511, language: 'ar', name: 'Al-Basit', author: 'Al-Wahidi', file: /al-basit/i, backtick: AYN },
    { id: 'ar-wahidi-wajiz', qulId: 489, language: 'ar', name: 'Al-Wajiz', author: 'Al-Wahidi', file: /al-wajiz-wahidi/i, backtick: AYN },
    { id: 'ar-ibn-adil', qulId: 516, language: 'ar', name: 'Al-Lubab fi Ulum al-Kitab', author: 'Ibn Adil', file: /al-lubab-fi-ulum-al-kitab/i, backtick: AYN },
    { id: 'ar-razi', qulId: 488, language: 'ar', name: 'Mafatih al-Ghayb', author: 'Fakhr ad-Din ar-Razi', file: /tafsir-al-razi/i, backtick: AYN },
    { id: 'ar-makki', qulId: 490, language: 'ar', name: 'Al-Hidayah ila Bulugh an-Nihayah', author: 'Makki ibn Abi Talib', file: /tafsir-makhi/i, backtick: AYN },
    { id: 'ar-qasimi', qulId: 524, language: 'ar', name: 'Mahasin at-Tawil', author: 'Jamal ad-Din al-Qasimi', file: /mahasin-al-ta-wil-al-qasimi/i, backtick: AYN },
    { id: 'ar-bahr-muhit', qulId: 526, language: 'ar', name: 'Al-Bahr al-Muhit', author: 'Abu Hayyan al-Andalusi', file: /al-bahr-al-muhit/i, backtick: AYN },
    { id: 'ar-thaalibi', qulId: 528, language: 'ar', name: 'Al-Jawahir al-Hisan', author: 'Abd ar-Rahman ath-Thaalibi', file: /tafsir-al-tha-alibi/i, backtick: AYN },
    { id: 'ar-iji', qulId: 508, language: 'ar', name: 'Jami al-Bayan', author: 'Al-Iji', file: /jamia-al-bayan-aliji/i, backtick: AYN },
    { id: 'ar-samarqandi', qulId: 513, language: 'ar', name: 'Bahr al-Ulum', author: 'Abu al-Layth as-Samarqandi', file: /tafsir-al-samarqandi/i, backtick: AYN },
    { id: 'ar-alusi', qulId: 501, language: 'ar', name: 'Ruh al-Maani', author: 'Al-Alusi', file: /tafsir-al-alusi/i, backtick: AYN },
    { id: 'ar-samin-halabi', qulId: 505, language: 'ar', name: 'Ad-Durr al-Masun', author: 'As-Samin al-Halabi', file: /al-dur-al-masun-lil-samin-al-halabi/i, backtick: AYN },
    { id: 'ar-qanuji', qulId: 495, language: 'ar', name: 'Fath al-Bayan', author: 'Siddiq Hasan Khan al-Qanuji', file: /fath-al-bayan-li-al-qanuji/i, backtick: AYN },
    { id: 'ar-abi-al-suud', qulId: 497, language: 'ar', name: 'Irshad al-Aql as-Salim', author: 'Abu as-Suud', file: /tafsir-abi-al-suaood/i, backtick: AYN },
    { id: 'ar-mawardi', qulId: 512, language: 'ar', name: 'An-Nukat wa al-Uyun', author: 'Al-Mawardi', file: /tafsir-al-mawardi/i, backtick: AYN },
    { id: 'ar-zamakhshari', qulId: 510, language: 'ar', name: 'Al-Kashshaf', author: 'Az-Zamakhshari', file: /al-kashshaf-al-zamakhshari/i, backtick: AYN },
    { id: 'it-mukhtasar', qulId: 253, language: 'it', name: 'Al-Mukhtasar', file: /italian-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'es-mukhtasar', qulId: 268, language: 'es', name: 'Al-Mukhtasar', file: /spanish-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'tr-mukhtasar', qulId: 258, language: 'tr', name: 'Al-Mukhtasar', file: /turkish-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'id-mukhtasar', qulId: 260, language: 'id', name: 'Al-Mukhtasar', file: /indoniesua-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'fa-mukhtasar', qulId: 263, language: 'fa', name: 'Al-Mukhtasar', file: /persian-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'bn-mukhtasar', qulId: 267, language: 'bn', name: 'Al-Mukhtasar', file: /bengali-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'hi-mukhtasar', qulId: 535, language: 'hi', name: 'Al-Mukhtasar', file: /hindi-mokhtasar/i, backtick: AYN },
    { id: 'zh-mukhtasar', qulId: 264, language: 'zh', name: 'Al-Mukhtasar', file: /chinese-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'ja-mukhtasar', qulId: 265, language: 'ja', name: 'Al-Mukhtasar', file: /japanese-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'bs-mukhtasar', qulId: 252, language: 'bs', name: 'Al-Mukhtasar', file: /bosnian-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'ml-mukhtasar', qulId: 256, language: 'ml', name: 'Al-Mukhtasar', file: /malayalam-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'ta-mukhtasar', qulId: 554, language: 'ta', name: 'Al-Mukhtasar', file: /tamil-mokhtasar/i, backtick: AYN },
    { id: 'te-mukhtasar', qulId: 540, language: 'te', name: 'Al-Mukhtasar', file: /telugu-mokhtasar/i, backtick: AYN },
    { id: 'th-mukhtasar', qulId: 541, language: 'th', name: 'Al-Mukhtasar', file: /thai-mokhtasar/i, backtick: AYN },
    { id: 'vi-mukhtasar', qulId: 261, language: 'vi', name: 'Al-Mukhtasar', file: /vietnamese-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'uz-mukhtasar', qulId: 538, language: 'uz', name: 'Al-Mukhtasar', file: /uzbek-mokhtasar/i, backtick: AYN },
    { id: 'ky-mukhtasar', qulId: 536, language: 'ky', name: 'Al-Mukhtasar', file: /kyrgyz-mokhtasar/i, backtick: AYN },
    { id: 'ckb-mukhtasar', qulId: 542, language: 'ckb', name: 'Al-Mukhtasar', file: /kurdish-mokhtasar/i, backtick: AYN },
    { id: 'ps-mukhtasar', qulId: 533, language: 'ps', name: 'Al-Mukhtasar', file: /pashto-mokhtasar/i, backtick: AYN },
    { id: 'sr-mukhtasar', qulId: 543, language: 'sr', name: 'Al-Mukhtasar', file: /serbian-mokhtasar/i, backtick: AYN },
    { id: 'si-mukhtasar', qulId: 453, language: 'si', name: 'Al-Mukhtasar', file: /sinhalese-mokhtasar/i, backtick: AYN },
    { id: 'km-mukhtasar', qulId: 257, language: 'km', name: 'Al-Mukhtasar', file: /khmer-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'tl-mukhtasar', qulId: 254, language: 'tl', name: 'Al-Mukhtasar', file: /filipino-tagalog-al-mukhtasar-in-interpreting-the-noble-quran/i, backtick: AYN },
    { id: 'ug-mukhtasar', qulId: 539, language: 'ug', name: 'Al-Mukhtasar', file: /uyghur-mokhtasar/i, backtick: AYN },
    { id: 'az-mukhtasar', qulId: 537, language: 'az', name: 'Al-Mukhtasar', file: /azeri-mokhtasar/i, backtick: AYN },
    { id: 'as-mukhtasar', qulId: 255, language: 'as', name: 'Al-Mukhtasar', file: /assamese-abridged-explanation-of-the-quran/i, backtick: AYN },
    { id: 'ff-mukhtasar', qulId: 534, language: 'ff', name: 'Al-Mukhtasar', file: /fulani-mokhtasar/i, backtick: AYN },
    { id: 'id-saadi', qulId: 503, language: 'id', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /tafsir-as-saadi-indonesian/i, backtick: AYN },
    { id: 'fa-saadi', qulId: 485, language: 'fa', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /tafsir-as-saadi-persian/i, backtick: AYN },
    { id: 'tr-saadi', qulId: 484, language: 'tr', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /tafsir-as-saadi-turkish/i, backtick: AYN },
    { id: 'ur-saadi', qulId: 309, language: 'ur', name: 'Tafsir as-Saadi', author: 'Abd ar-Rahman as-Saadi', file: /tafsir-as-saadi-urdu/i, backtick: AYN },
];

export const qulTafsirSourceKey = (id: QuranTranslationId) => `qul/tafsirs/${id}.json`;

const VERSE_KEY = /^(\d+):(\d+)$/;

/**
 * A QUL tafsir JSON: `{ "2:3": { "text": "…", "ayah_keys": ["2:3", "2:4"] }, "2:4": "2:3" }`. A verse
 * explained with others points to the first verse of its group; `ayah_keys` is absent for a single verse.
 */
export const RawQulTafsirSchema = z.record(
    z.string().regex(VERSE_KEY, 'Expected verse keys like "2:255"'),
    z.union([
        z.string().regex(VERSE_KEY),
        z.object({ text: z.string(), ayah_keys: z.array(z.string().regex(VERSE_KEY)).min(1).optional() }),
    ]),
);
export type RawQulTafsir = z.infer<typeof RawQulTafsirSchema>;

export function parseQulTafsir(text: string): RawQulTafsir {
    const result = RawQulTafsirSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL tafsir file: ${result.error.issues.slice(0, 3).map((issue) => issue.message).join('; ')}`);
    }
    return result.data;
}

const verseOf = (key: string) => {
    const [, surah, verse] = key.match(VERSE_KEY)!;
    return { surah: Number(surah), verse: Number(verse) };
};

/** Paragraphs of a source written in plain text (the Mukhtasar): one per line. */
const plainTextToBlocks = (text: string): QuranTafsirBlock[] =>
    text
        .split(/\r?\n/)
        .map((line) => line.replace(/[\s ]+/g, ' ').trim())
        .filter(Boolean)
        .map((line) => ({ type: 'paragraph', text: line }));

/** The verse translation some tafsirs quote before their commentary: `<p class="en translation">`. */
const isQuote = (tag: string) => /class\s*=\s*"[^"]*\btranslation\b/.test(tag);

/**
 * A passage text → blocks. The editors' notes of the Arabic Ibn Kathir (`[[في أ: "يفتتح".]]`, manuscript
 * variants) are dropped: they interrupt the text and mean nothing to a reader. The Russian Ibn Kathir
 * wraps each Quran word in its own span, without spaces between them: they are put back.
 */
export function tafsirTextToBlocks(text: string, source: Pick<QulTafsir, 'backtick' | 'joinHyphenatedWords'>): QuranTafsirBlock[] {
    const cleaned = text.replace(/\[\[[\s\S]*?\]\]/g, '').replace(/<\/span>(?=<span[^>]*qpc-hafs)/g, '</span> ');
    const blocks = /<[a-z][^>]*>/i.test(cleaned) ? htmlToBlocks(cleaned, { isQuote }) : plainTextToBlocks(cleaned);
    const fix = (value: string) => {
        const joined = source.joinHyphenatedWords ? value.replace(/(\p{Ll})- (\p{Ll})/gu, '$1$2') : value;
        return joined.replaceAll('`', source.backtick).replace(/ {2,}/g, ' ').trim();
    };
    return blocks
        .map((block): QuranTafsirBlock => (block.type === 'list' ? { ...block, items: block.items.map(fix).filter(Boolean) } : { ...block, text: fix(block.text) }))
        .filter((block) => (block.type === 'list' ? block.items.length > 0 : block.text.length > 0));
}

export function toTafsirFile(
    tafsir: QulTafsir,
    raw: RawQulTafsir,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranTafsirFile {
    const surahs: QuranTafsirPassage[][] = Array.from({ length: QURAN_SURAH_COUNT }, () => []);
    let empty = 0;

    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
            const group = raw[value];
            if (typeof group !== 'object' || !(group.ayah_keys ?? [value]).includes(key)) {
                throw new Error(`${tafsir.id}: ${key} points to ${value}, which does not explain it`);
            }
            continue;
        }
        const verses = (value.ayah_keys ?? [key]).map(verseOf);
        const { surah, verse: from } = verses[0]!;
        const to = verses.at(-1)!.verse;
        if (key !== value.ayah_keys?.[0] && value.ayah_keys) {
            throw new Error(`${tafsir.id}: the group of ${key} starts at ${value.ayah_keys[0]}`);
        }
        if (verses.some((v, i) => v.surah !== surah || v.verse !== from + i)) {
            throw new Error(`${tafsir.id}: the verses of ${key} are not consecutive verses of one surah`);
        }
        if (surah > QURAN_SURAH_COUNT || to > QURAN_VERSE_COUNTS[surah - 1]!) {
            throw new Error(`${tafsir.id}: ${key} is not a verse of the Quran`);
        }
        const blocks = tafsirTextToBlocks(value.text, tafsir);
        if (blocks.length === 0) {
            empty += to - from + 1;
            continue;
        }
        surahs[surah - 1]!.push({ from, to, blocks });
    }
    for (const passages of surahs) passages.sort((a, b) => a.from - b.from);

    const verseCount = surahs.flat().reduce((sum, passage) => sum + passage.to - passage.from + 1, 0);
    const missing = QURAN_VERSE_COUNTS.reduce((sum, count) => sum + count, 0) - verseCount;
    if (missing > 0) {
        options.warn(`${tafsir.id}: ${missing} verses without commentary${empty ? ` (${empty} with an empty text)` : ''}`);
    }

    const entry: QuranTafsir = {
        id: tafsir.id,
        language: tafsir.language,
        name: tafsir.name,
        ...(tafsir.author && { author: tafsir.author }),
        verseCount,
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: `https://qul.tarteel.ai/resources/tafsir/${tafsir.qulId}`,
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranTafsirFileSchema.parse({ schemaVersion: 1, tafsir: entry, surahs });
}

/** One file per tafsir, then their catalog; a missing source keeps its published entry. */
export async function buildTafsirFiles(
    read: ReadQulSource,
    options: {
        previous?: QuranTafsir[];
        tafsirs?: QulTafsir[];
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<OutputFile[]> {
    const previous = new Map(options.previous?.map((tafsir) => [tafsir.id, tafsir]));
    const files: OutputFile[] = [];
    const catalog: QuranTafsir[] = [];

    for (const tafsir of options.tafsirs ?? QUL_TAFSIRS) {
        const source = await read(qulTafsirSourceKey(tafsir.id));
        if (!source) {
            const kept = previous.get(tafsir.id);
            if (kept) catalog.push(kept);
            options.warn(`${tafsir.id}: no source at ${qulTafsirSourceKey(tafsir.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const file = toTafsirFile(tafsir, parseQulTafsir(source.text), {
            retrievedAt: source.modifiedAt.toISOString(),
            warn: options.warn,
        });
        files.push({ key: contentKeys.quran.tafsir(tafsir.id), data: file });
        catalog.push(file.tafsir);
        options.log(`${tafsir.id}: ${file.surahs.flat().length} passages, ${file.tafsir.verseCount} verses`);
    }

    files.push({
        key: contentKeys.quran.tafsirs(),
        data: QuranTafsirsFileSchema.parse({ schemaVersion: 1, tafsirs: catalog }),
    });
    return files;
}
