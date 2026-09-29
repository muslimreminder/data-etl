import {
    contentKeys,
    QURAN_VERSE_COUNTS,
    QuranRecitationFileSchema,
    QuranRecitationsFileSchema,
    type QuranRecitation,
    type QuranRecitationFile,
    type QuranRecitationId,
    type QuranRecitationStyle,
    type QuranVerseRecitation,
    type QuranWordTiming,
} from '@muslimreminder/schema/content';
import { z } from 'zod';
import type { OutputFile } from '../../output.ts';
import type { ReadQulSource } from './index.ts';

/** A verse-by-verse recitation hand-picked from https://qul.tarteel.ai/resources/recitation. */
export type QulRecitation = {
    id: QuranRecitationId;
    /** QUL resource id, when the downloaded file carries one (it is in its name). */
    qulId?: number;
    reciter: string;
    style: QuranRecitationStyle;
    /** Recognizes the downloaded file (`ayah-recitation-<reciter>…json` on QUL). */
    file: RegExp;
};

/** Published recitations, in catalog order. Every one is Hafs `an` Asim, the reading the mushaf shows. */
export const QUL_RECITATIONS: QulRecitation[] = [
    { id: 'al-husary', qulId: 957, reciter: 'Mahmoud Khalil Al-Husary', style: 'murattal', file: /^ayah-recitation-mahmoud-khalil-al-husary/i },
    { id: 'al-minshawi', qulId: 959, reciter: 'Muhammad Siddiq Al-Minshawi', style: 'murattal', file: /^ayah-recitation-muhammad-siddiq-al-minshawi/i },
    { id: 'sudais', reciter: 'Abdur-Rahman as-Sudais', style: 'murattal', file: /^ayah-recitation-abdur-rahman-as-sudais/i },
    { id: 'al-dosari', qulId: 961, reciter: 'Yasser Al-Dosari', style: 'murattal', file: /^ayah-recitation-yasser-al-dosari/i },
    { id: 'ar-rifai', qulId: 68, reciter: 'Hani ar-Rifai', style: 'murattal', file: /^ayah-recitation-hani-ar-rifai/i },
    { id: 'al-tunaiji', qulId: 958, reciter: 'Khalifa Al Tunaiji', style: 'murattal', file: /^ayah-recitation-khalifa-al-tunaiji/i },
    { id: 'alnufais', qulId: 471, reciter: 'Ahmad Alnufais', style: 'murattal', file: /^ayah-recitation-alnufais/i },
];

export const qulRecitationSourceKey = (id: QuranRecitationId) => `qul/recitations/${id}.json`;

const RECITATION_URL = 'https://qul.tarteel.ai/resources/recitation';

/** A number QUL writes either as a number or as a string (`"380"`), depending on the export. */
const NumericSchema = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/)]).transform(Number);

/**
 * A QUL ayah recitation JSON, keyed `surah:verse`:
 * `{ "1:1": { "surah_number": 1, "ayah_number": 1, "audio_url": "https://…/001001.mp3",
 *             "duration": 3.84, "segments": [[1, 0, 500], …] } }`.
 *
 * A segment is `[word, start, end]`, the word numbered from 1 in its verse and the times in
 * milliseconds. `duration` is in seconds, and `null` on the exports that do not measure the files.
 */
export const RawQulRecitationSchema = z
    .record(
        z.string().regex(/^\d+:\d+$/, 'Expected "surah:verse" keys'),
        z.object({
            surah_number: NumericSchema,
            ayah_number: NumericSchema,
            audio_url: z.url(),
            duration: NumericSchema.nullable().optional(),
            segments: z.array(z.tuple([NumericSchema, NumericSchema, NumericSchema])),
        }),
    )
    .superRefine((raw, ctx) => {
        const missing = QURAN_VERSE_COUNTS.flatMap((count, surah) =>
            Array.from({ length: count }, (_, verse) => `${surah + 1}:${verse + 1}`),
        ).filter((key) => !(key in raw));
        if (missing.length > 0) {
            ctx.addIssue({ code: 'custom', message: `Missing ${missing.length} verse(s), e.g. ${missing.slice(0, 3).join(', ')}` });
        }
    });
export type RawQulRecitation = z.infer<typeof RawQulRecitationSchema>;

export function parseQulRecitation(text: string): RawQulRecitation {
    const result = RawQulRecitationSchema.safeParse(JSON.parse(text));
    if (!result.success) {
        throw new Error(`Not a QUL ayah recitation: ${result.error.issues.slice(0, 3).map((issue) => issue.message).join('; ')}`);
    }
    return result.data;
}

/** Where the source hosts the audio of each verse, by `surah:verse`: what the audio mirror downloads. */
export const qulRecitationAudioUrls = (raw: RawQulRecitation): Map<string, string> =>
    new Map(Object.entries(raw).map(([key, verse]) => [key, verse.audio_url]));

/**
 * The word timings of one verse, put back in order: the exports have a few segments out of order or
 * ending before they start, and some repeat a word. Times are rounded to the millisecond.
 */
export function toWordTimings(segments: readonly (readonly [number, number, number])[]): QuranWordTiming[] {
    const timings = segments
        .map(([word, start, end]) => [Math.round(word), Math.max(0, Math.round(start)), Math.max(0, Math.round(end))] as QuranWordTiming)
        .filter(([word]) => Number.isInteger(word) && word > 0)
        .map(([word, start, end]) => [word, start, Math.max(start, end)] as QuranWordTiming)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);

    // A word recited twice is the export repeating itself: its first timing is the one to follow.
    const seen = new Set<number>();
    return timings.filter(([word]) => !seen.has(word) && seen.add(word) !== undefined);
}

/**
 * `surahs[s - 1][v - 1]`: the audio of every verse, with the timing of its words. A verse the source
 * has nothing for at all fails: the file is not a whole recitation.
 */
export function toRecitationFile(
    recitation: QulRecitation,
    raw: RawQulRecitation,
    options: { retrievedAt: string; warn: (message: string) => void },
): QuranRecitationFile {
    const missing: string[] = [];
    let untimed = 0;

    const surahs = QURAN_VERSE_COUNTS.map((count, surah) =>
        Array.from({ length: count }, (_, ayah): QuranVerseRecitation => {
            const key = `${surah + 1}:${ayah + 1}`;
            const verse = raw[key];
            if (!verse) {
                missing.push(key);
                return { words: [] };
            }
            const words = toWordTimings(verse.segments);
            if (words.length === 0) untimed++;
            // Seconds in the source, milliseconds here; the exports that do not measure them send `null`.
            const duration = verse.duration ? Math.round(verse.duration * 1000) : undefined;
            return { ...(duration && { duration }), words };
        }),
    );
    if (missing.length > 0) {
        throw new Error(`${recitation.id}: no audio for ${missing.length} verse(s), e.g. ${missing.slice(0, 3).join(', ')}`);
    }
    if (untimed > 0) options.warn(`${recitation.id}: ${untimed} verse(s) without word timings, played whole`);

    const entry: QuranRecitation = {
        id: recitation.id,
        reciter: recitation.reciter,
        style: recitation.style,
        timedVerseCount: surahs.flat().filter((verse) => verse.words.length > 0).length,
        attribution: {
            source: 'Quranic Universal Library (Tarteel)',
            sourceUrl: recitation.qulId === undefined ? RECITATION_URL : `${RECITATION_URL}/${recitation.qulId}`,
            retrievedAt: options.retrievedAt,
        },
    };
    return QuranRecitationFileSchema.parse({ schemaVersion: 1, recitation: entry, surahs });
}

/** One file per recitation, then their catalog; a missing source keeps its published entry. */
export async function buildRecitationFiles(
    read: ReadQulSource,
    options: {
        previous?: QuranRecitation[];
        recitations?: QulRecitation[];
        log: (message: string) => void;
        warn: (message: string) => void;
    },
): Promise<OutputFile[]> {
    const previous = new Map(options.previous?.map((recitation) => [recitation.id, recitation]));
    const files: OutputFile[] = [];
    const catalog: QuranRecitation[] = [];

    for (const recitation of options.recitations ?? QUL_RECITATIONS) {
        const source = await read(qulRecitationSourceKey(recitation.id));
        if (!source) {
            const kept = previous.get(recitation.id);
            if (kept) catalog.push(kept);
            options.warn(`${recitation.id}: no source at ${qulRecitationSourceKey(recitation.id)}${kept ? ', published version kept' : ', not published'}`);
            continue;
        }
        const file = toRecitationFile(recitation, parseQulRecitation(source.text), {
            retrievedAt: source.modifiedAt.toISOString(),
            warn: options.warn,
        });
        files.push({ key: contentKeys.quran.recitation(recitation.id), data: file });
        catalog.push(file.recitation);
        options.log(`${recitation.id}: ${file.recitation.timedVerseCount} verses timed word by word`);
    }

    files.push({
        key: contentKeys.quran.recitations(),
        data: QuranRecitationsFileSchema.parse({ schemaVersion: 1, recitations: catalog }),
    });
    return files;
}
