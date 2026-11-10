import {
    contentKeys,
    QURAN_SURAH_COUNT,
    QURAN_VERSE_COUNTS,
    QuranSurahRecitationFileSchema,
    QuranSurahRecitationsFileSchema,
    type QuranRecitationOccasion,
    type QuranRiwayah,
    type QuranSurahAudio,
    type QuranSurahRecitation,
    type QuranSurahRecitationFile,
    type QuranSurahRecitationStyle,
    type QuranSurahVerseTiming,
} from '@muslimreminder/schema/content';
import { z } from 'zod';
import type { OutputFile } from '../../output.ts';
import type { ReadQulSource } from './index.ts';
import { toWordTimings } from './recitations.ts';

/**
 * A recitation streamed surah by surah, hand-picked from the QUL audio API
 * (`https://qul.tarteel.ai/api/v1/audio/surah_recitations`): one file per surah, verses located in it.
 */
export type QulSurahRecitation = {
    id: string;
    /** Id of the recitation in the QUL audio API, not a resource page id. */
    apiId: number;
    reciter: string;
    label?: string;
    style: QuranSurahRecitationStyle;
    riwayah: QuranRiwayah;
    occasion?: QuranRecitationOccasion;
};

const hafs = (apiId: number, id: string, reciter: string, extra: Partial<QulSurahRecitation> = {}): QulSurahRecitation => ({
    id,
    apiId,
    reciter,
    style: 'murattal',
    riwayah: 'hafs',
    ...extra,
});
const mujawwad = { style: 'mujawwad' } as const;
const taraweeh = (mosque: 'madinah' | 'makkah', year: number): QulSurahRecitation => ({
    id: `${mosque}-taraweeh-${year}`,
    apiId: 0,
    reciter: mosque === 'madinah' ? "Masjid an-Nabawi (Madinah)" : 'Masjid al-Haram (Makkah)',
    label: `Taraweeh ${year}H`,
    style: 'murattal',
    riwayah: 'hafs',
    occasion: 'taraweeh',
});

/**
 * Published recitations, in catalog order: every complete Hafs recitation of the QUL audio API, minus
 * the ones mixed with a spoken translation, the children's repeat editions, the other riwayat (the
 * mushaf and the timings of the apps are Hafs) and the duplicates (an archived or lower quality copy
 * of a recording already listed). Left out too: Abu Bakr Dhaby (QUL 178), whose audio files the
 * source CDN does not serve (404).
 */
export const QUL_SURAH_RECITATIONS: QulSurahRecitation[] = [
    // Timed verse by verse and word by word.
    hafs(7, 'alafasy', 'Mishari Rashid al-Afasy'),
    hafs(6, 'al-husary', 'Mahmoud Khalil Al-Husary'),
    hafs(164, 'al-husary-mujawwad', 'Mahmoud Khalil Al-Husary', mujawwad),
    hafs(12, 'al-husary-muallim', 'Mahmoud Khalil Al-Husary', { style: 'muallim' }),
    hafs(122, 'al-husary-ijazah', 'Mahmoud Khalil Al-Husary', { label: 'Ijazah' }),
    hafs(2, 'abdul-basit', 'Abdul Basit Abdul Samad'),
    hafs(1, 'abdul-basit-mujawwad', 'Abdul Basit Abdul Samad', mujawwad),
    hafs(9, 'al-minshawi', 'Muhammad Siddiq Al-Minshawi'),
    hafs(8, 'al-minshawi-mujawwad', 'Muhammad Siddiq Al-Minshawi', mujawwad),
    hafs(3, 'sudais', 'Abdur-Rahman as-Sudais'),
    hafs(10, 'al-shuraim', 'Saud Al-Shuraim'),
    hafs(65, 'al-muaiqly', "Maher Al-Mu'aiqly"),
    hafs(159, 'al-muaiqly-1440', "Maher Al-Mu'aiqly", { label: '1440H' }),
    hafs(4, 'al-shatri', 'Abu Bakr al-Shatri'),
    hafs(13, 'al-ghamdi', 'Saad al-Ghamdi'),
    hafs(5, 'ar-rifai', 'Hani ar-Rifai'),
    hafs(174, 'al-dosari', 'Yasser Al-Dosari'),
    hafs(19, 'al-ajmy', 'Ahmed ibn Ali al-Ajmy'),
    hafs(175, 'alnufais', 'Ahmad Alnufais'),
    hafs(161, 'al-tunaiji', 'Khalifa Al-Tunaiji'),
    hafs(14, 'fares-abbad', 'Fares Abbad'),
    hafs(162, 'al-juhani', 'Abdullah Awad al-Juhani'),
    hafs(163, 'basfar', 'Abdullah Basfar'),
    hafs(158, 'ali-jabir', 'Abdullah Ali Jabir'),
    hafs(43, 'al-budair', 'Salah al-Budair'),
    hafs(18, 'bukhatir', 'Salah Bukhatir'),
    hafs(104, 'al-qatami', 'Nasser Al-Qatami'),
    hafs(91, 'al-tablawi', 'Mohammad Al-Tablawi'),
    hafs(169, 'jibreel', 'Muhammad Jibreel'),
    hafs(170, 'al-jalil', 'Khalid Al-Jalil'),
    hafs(179, 'al-salimi', 'Mansour al-Salimi', { label: '1444H' }),
    hafs(160, 'baleela', 'Bandar Baleela'),
    hafs(124, 'matroud', 'Abdullah Matroud'),
    hafs(17, 'sahl-yasin', 'Sahl Yasin'),
    hafs(44, 'alili', 'Aziz Alili'),
    hafs(70, 'abdul-kareem', 'Muhammad Abdul-Kareem'),
    hafs(88, 'mostafa-ismaeel', 'Mostafa Ismaeel'),
    hafs(126, 'nauina', 'Ahmad Nauina'),
    hafs(127, 'al-alaqmi', 'Akram Al-Alaqmi'),
    hafs(128, 'alsouasi', 'Ali Hajjaj Alsouasi'),
    hafs(129, 'al-bana', 'Mahmood Ali Al-Bana'),
    hafs(172, 'toure', 'Hady Toure'),
    hafs(176, 'alijon-qori', 'Alijon Qori'),
    hafs(177, 'al-turki', 'Badr Al-Turki'),
    // Played as whole surahs.
    hafs(167, 'al-huthaify', 'Ali Abdur-Rahman al-Huthaify'),
    hafs(22, 'ayyoob', 'Muhammad Ayyoob'),
    hafs(23, 'as-sawaigh', "Tawfeeq ibn Sa'id as-Sawa'igh"),
    hafs(166, 'al-qahtani', 'Khalid al-Qahtani'),
    hafs(165, 'nabil-ar-rifai', 'Nabil ar-Rifai'),
    hafs(81, 'kalbani', 'Adel Kalbani'),
    hafs(138, 'kalbani-1437', 'Adel Kalbani', { label: '1437H' }),
    hafs(68, 'al-dulaimi', 'Abdur-Razaq bin Abtan al-Dulaimi', mujawwad),
    hafs(40, 'haneef', 'AbdulWadud Haneef'),
    hafs(61, 'sadaqat-ali', 'Sadaqat Ali'),
    hafs(64, 'hamad-sinan', 'Hamad Sinan'),
    hafs(72, 'khayat', 'Abdullah Khayat'),
    hafs(79, 'muhammad-hassan', 'Muhammad Hassan'),
    hafs(90, 'patel', 'Muhammad Sulaiman Patel'),
    hafs(92, 'al-muqaddim', 'Mohammad Ismaeel Al-Muqaddim'),
    hafs(93, 'imad-hafez', 'Imad Zuhair Hafez'),
    hafs(103, 'al-akhdar', 'Ibrahim Al-Akhdar'),
    hafs(106, 'al-hazmi', 'AbdulKareem Al-Hazmi'),
    hafs(108, 'abdul-mubdi', "Abdul-Mun'im Abdul-Mubdi'"),
    hafs(130, 'al-yamani', 'Wadee Hammadi Al-Yamani'),
    hafs(134, 'seferagic', 'Fatih Seferagic'),
    hafs(135, 'abdul-aleem', 'Asim Abdul Aleem'),
    hafs(136, 'abdal', 'Abdallah Abdal'),
    hafs(209, 'al-hammad', 'Ahmed Al-Hammad'),
    // Taraweeh, recorded live in Ramadan.
    hafs(115, 'al-shatri-taraweeh', 'Abu Bakr al-Shatri', { label: 'Taraweeh', occasion: 'taraweeh' }),
    hafs(24, 'ali-jabir-taraweeh', 'Abdullah Ali Jabir', { label: 'Taraweeh', occasion: 'taraweeh' }),
    hafs(107, 'ayyoob-taraweeh', 'Muhammad Ayyoob', { label: 'Taraweeh', occasion: 'taraweeh' }),
    hafs(86, 'hatem-farid-taraweeh-1432', 'Hatem Farid', { label: 'Taraweeh 1432H', occasion: 'taraweeh' }),
    hafs(87, 'hatem-farid-taraweeh-1431', 'Hatem Farid', { label: 'Taraweeh 1431H', occasion: 'taraweeh' }),
    hafs(139, 'hatem-farid-taraweeh-1430', 'Hatem Farid', { label: 'Taraweeh 1430H', occasion: 'taraweeh' }),
    ...(
        [
            [154, 'makkah', 1442], [153, 'makkah', 1441], [152, 'makkah', 1440], [151, 'makkah', 1439], [150, 'makkah', 1438],
            [133, 'makkah', 1437], [120, 'makkah', 1434],
            [149, 'madinah', 1442], [148, 'madinah', 1441], [147, 'madinah', 1440], [146, 'madinah', 1439], [145, 'madinah', 1437],
            [144, 'madinah', 1436], [123, 'madinah', 1435], [143, 'madinah', 1434], [101, 'madinah', 1432], [100, 'madinah', 1430],
            [99, 'madinah', 1429], [46, 'madinah', 1423],
        ] as const
    ).map(([apiId, mosque, year]) => ({ ...taraweeh(mosque, year), apiId })),
];

export const qulSurahRecitationSourceKey = (id: string) => `qul/surah-recitations/${id}.json`;

const API_URL = 'https://qul.tarteel.ai/api/v1/audio';

/** A number QUL writes either as a number or as a string, or leaves empty. */
const OptionalNumberSchema = z
    .union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined ? undefined : Number(value)));

/** `GET /surah_recitations/{id}`: the recitation and its audio files, keyed by surah number. */
export const RawQulSurahRecitationDetailSchema = z.object({
    id: z.number(),
    name: z.string(),
    has_segments: z.boolean().nullable().optional(),
    audio_files: z.record(
        z.string(),
        z.object({
            audio_url: z.string().nullable().optional(),
            duration: OptionalNumberSchema,
            file_size: OptionalNumberSchema,
        }),
    ),
});
export type RawQulSurahRecitationDetail = z.infer<typeof RawQulSurahRecitationDetailSchema>;

/**
 * The `[word, start, end]` of a verse. QUL sometimes sends them as a JSON string, adds a metadata object
 * (`[15, 1057069, 1058525, { "waqaf": true }]`) or cuts one short (`[9, 211249]`): the string is parsed,
 * the extra items dropped, and a segment without its three numbers left out.
 */
const WordSegmentsSchema = z
    .union([z.array(z.unknown()), z.string(), z.null()])
    .optional()
    .transform((value): number[][] => {
        const list = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
        if (!Array.isArray(list)) return [];
        return list
            .filter((segment): segment is unknown[] => Array.isArray(segment))
            .map((segment) => segment.slice(0, 3))
            .filter((segment): segment is number[] => segment.length === 3 && segment.every((item) => typeof item === 'number' && Number.isFinite(item)));
    });

/**
 * `GET /surah_segments/{id}?surah={s}`: the verses of a surah, keyed `surah:verse`, located in its
 * audio file. `segments` are `[word, start, end]`, every time in milliseconds from the start of the file.
 */
export const RawQulSurahSegmentsSchema = z.object({
    audio: z.object({ duration: OptionalNumberSchema }).partial().optional(),
    segments: z.record(
        z.string(),
        z.object({
            time_from: OptionalNumberSchema,
            time_to: OptionalNumberSchema,
            segments: WordSegmentsSchema,
        }),
    ),
});
export type RawQulSurahSegments = z.infer<typeof RawQulSurahSegmentsSchema>;

/** What the sync stores in the sources bucket: the API answers, as they are. */
export const RawQulSurahRecitationSchema = z.object({
    recitation: RawQulSurahRecitationDetailSchema,
    /** Segments by surah number, for a recitation that has them. */
    segments: z.record(z.string(), RawQulSurahSegmentsSchema).optional(),
});
export type RawQulSurahRecitation = z.infer<typeof RawQulSurahRecitationSchema>;

export function parseQulSurahRecitation(text: string): RawQulSurahRecitation {
    const result = RawQulSurahRecitationSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL surah recitation: ${result.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    }
    return result.data;
}

const isSurah = (key: string) => /^\d+$/.test(key) && Number(key) >= 1 && Number(key) <= QURAN_SURAH_COUNT;

/** Where the source hosts each surah, by surah number: what the audio mirror downloads. */
export function qulSurahAudioUrls(raw: RawQulSurahRecitation): Map<number, string> {
    return new Map(
        Object.entries(raw.recitation.audio_files)
            .filter(([key, file]) => isSurah(key) && file.audio_url)
            // Some old paths hold a doubled slash (`muhammad_ayyoob//001.mp3`), which the source CDN serves anyway.
            .map(([key, file]) => [Number(key), file.audio_url!] as const),
    );
}

/** The surahs that have an audio file, in order. */
export const qulSurahNumbers = (detail: RawQulSurahRecitationDetail) =>
    Object.keys(detail.audio_files).filter(isSurah).map(Number).sort((a, b) => a - b);

/** The QUL audio API, read through a throttled fetch. */
export type QulAudioApi = { json: (url: string) => Promise<unknown> };

/** Downloads a recitation from the QUL audio API: its detail, then the segments of each surah when it has some. */
export async function fetchQulSurahRecitation(
    api: QulAudioApi,
    apiId: number,
    options: { segments: boolean | RawQulSurahRecitation['segments'] },
): Promise<RawQulSurahRecitation> {
    const { recitation } = z.object({ recitation: RawQulSurahRecitationDetailSchema.loose() }).parse(await api.json(`${API_URL}/surah_recitations/${apiId}`));
    const detail = RawQulSurahRecitationDetailSchema.parse(recitation);
    if (options.segments === false || detail.has_segments === false) return { recitation: detail };
    if (options.segments !== true) return { recitation: detail, ...(options.segments && { segments: options.segments }) };

    const segments: NonNullable<RawQulSurahRecitation['segments']> = {};
    for (const surah of qulSurahNumbers(detail)) {
        // 286 = the most verses a surah has, and the most QUL serves in one page.
        const answer = RawQulSurahSegmentsSchema.parse(await api.json(`${API_URL}/surah_segments/${apiId}?surah=${surah}&per_page=286`));
        if (Object.keys(answer.segments).length > 0) segments[surah] = answer;
    }
    return { recitation: detail, ...(Object.keys(segments).length > 0 && { segments }) };
}

/**
 * The verses of one surah located in its audio, `null` for the ones the source does not locate or
 * places before the previous verse. `undefined` when the source has no segments for the surah.
 */
function toVerseTimings(surah: number, raw: RawQulSurahSegments | undefined, warn: (message: string) => void): (QuranSurahVerseTiming | null)[] | undefined {
    if (!raw) return undefined;
    let previous = 0;
    let dropped = 0;
    const verses = Array.from({ length: QURAN_VERSE_COUNTS[surah - 1]! }, (_, index): QuranSurahVerseTiming | null => {
        const verse = raw.segments[`${surah}:${index + 1}`];
        if (verse?.time_from === undefined || verse.time_to === undefined) return null;
        const from = Math.max(0, Math.round(verse.time_from));
        const to = Math.round(verse.time_to);
        if (to < from || from < previous) {
            dropped++;
            return null;
        }
        previous = from;
        // A word timed `[w, 0, 0]` inside a verse that starts later is a word QUL could not place.
        const segments = verse.segments.filter(([, start, end]) => !(start === 0 && end === 0 && from > 0));
        const words = toWordTimings(segments.map(([word, start, end]) => [word!, start!, end!] as const));
        return { from, to, words };
    });
    if (dropped > 0) warn(`surah ${surah}: ${dropped} verse(s) out of order, played without following them`);
    return verses.some(Boolean) ? verses : undefined;
}

/** `surahs[s - 1]`: the audio file of every surah, `null` for the ones the recitation does not have. */
export function toSurahRecitationFile(
    recitation: QulSurahRecitation,
    raw: RawQulSurahRecitation,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranSurahRecitationFile {
    const warn = (message: string) => options.warn(`${recitation.id}: ${message}`);
    const missing: number[] = [];

    const surahs = Array.from({ length: QURAN_SURAH_COUNT }, (_, index): QuranSurahAudio | null => {
        const surah = index + 1;
        const file = raw.recitation.audio_files[surah];
        if (!file?.audio_url) return null;
        const segments = raw.segments?.[surah];
        const verses = toVerseTimings(surah, segments, warn);
        const lastEnd = Math.max(0, ...(verses ?? []).map((verse) => verse?.to ?? 0));
        // Seconds in the source, rounded; the last verse tells a little more when the source has none.
        const seconds = file.duration || segments?.audio?.duration || 0;
        const duration = Math.max(Math.round(seconds * 1000), lastEnd);
        if (duration <= 0) {
            missing.push(surah);
            return null;
        }
        const bytes = file.file_size && file.file_size > 0 ? Math.round(file.file_size) : undefined;
        return { duration, ...(bytes && { bytes }), ...(verses && { verses }) };
    });
    if (missing.length > 0) warn(`${missing.length} surah(s) without a known length, left out (e.g. ${missing.slice(0, 3).join(', ')})`);

    const present = surahs.filter((surah) => surah !== null);
    if (present.length === 0) throw new Error(`${recitation.id}: no surah with a known length`);
    if (present.length < QURAN_SURAH_COUNT) warn(`${QURAN_SURAH_COUNT - present.length} surah(s) without audio`);
    const timedVerseCount = present.reduce((count, surah) => count + (surah.verses?.filter(Boolean).length ?? 0), 0);
    const bytes = present.every((surah) => surah.bytes) ? present.reduce((total, surah) => total + surah.bytes!, 0) : undefined;

    const entry: QuranSurahRecitation = {
        id: recitation.id,
        reciter: recitation.reciter,
        ...(recitation.label && { label: recitation.label }),
        style: recitation.style,
        riwayah: recitation.riwayah,
        ...(recitation.occasion && { occasion: recitation.occasion }),
        surahCount: present.length,
        timedVerseCount,
        duration: present.reduce((total, surah) => total + surah.duration, 0),
        ...(bytes && { bytes }),
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: `${API_URL}/surah_recitations/${recitation.apiId}`,
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranSurahRecitationFileSchema.parse({ schemaVersion: 1, recitation: entry, surahs });
}

/** One file per recitation, then their catalog; a missing source keeps its published entry. */
export async function buildSurahRecitationFiles(
    read: ReadQulSource,
    options: {
        previous?: QuranSurahRecitation[];
        recitations?: QulSurahRecitation[];
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<OutputFile[]> {
    const previous = new Map(options.previous?.map((recitation) => [recitation.id, recitation]));
    const files: OutputFile[] = [];
    const catalog: QuranSurahRecitation[] = [];

    for (const recitation of options.recitations ?? QUL_SURAH_RECITATIONS) {
        const source = await read(qulSurahRecitationSourceKey(recitation.id));
        if (!source) {
            const kept = previous.get(recitation.id);
            if (kept) catalog.push(kept);
            options.warn(`${recitation.id}: no source at ${qulSurahRecitationSourceKey(recitation.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const file = toSurahRecitationFile(recitation, parseQulSurahRecitation(source.text), {
            retrievedAt: source.modifiedAt.toISOString(),
            warn: options.warn,
        });
        files.push({ key: contentKeys.quran.surahRecitation(recitation.id), data: file });
        catalog.push(file.recitation);
        const hours = (file.recitation.duration / 3_600_000).toFixed(1);
        options.log(`${recitation.id}: ${file.recitation.surahCount} surahs, ${hours} h, ${file.recitation.timedVerseCount} verses timed`);
    }

    files.push({
        key: contentKeys.quran.surahRecitations(),
        data: QuranSurahRecitationsFileSchema.parse({ schemaVersion: 1, recitations: catalog }),
    });
    return files;
}
