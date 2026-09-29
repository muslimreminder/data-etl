import { QURAN_VERSE_COUNTS, QuranRecitationFileSchema } from '@muslimreminder/schema/content';
import { describe, expect, it } from 'vitest';
import {
    buildRecitationFiles,
    parseQulRecitation,
    QUL_RECITATIONS,
    qulRecitationAudioUrls,
    qulRecitationSourceKey,
    toRecitationFile,
    toWordTimings,
} from '../src/sources/qul/recitations.ts';

const recitation = QUL_RECITATIONS[0]!;
const modifiedAt = new Date('2026-09-24T10:00:00.000Z');

/** A whole recitation: every verse of the mushaf, one word each, plus what the test overrides. */
const rawRecitation = (overrides: Record<string, unknown> = {}) => {
    const raw: Record<string, unknown> = {};
    QURAN_VERSE_COUNTS.forEach((count, surah) => {
        for (let ayah = 1; ayah <= count; ayah++) {
            raw[`${surah + 1}:${ayah}`] = {
                surah_number: surah + 1,
                ayah_number: ayah,
                audio_url: `https://audio.example.com/${surah + 1}-${ayah}.mp3`,
                duration: 3,
                segments: [[1, 0, 2800]],
            };
        }
    });
    return { ...raw, ...overrides };
};

const build = (overrides: Record<string, unknown> = {}) =>
    toRecitationFile(recitation, parseQulRecitation(JSON.stringify(rawRecitation(overrides))), {
        retrievedAt: modifiedAt.toISOString(),
        warn: () => {},
    });

describe('QUL ayah recitations', () => {
    it('reads the numbers QUL writes as strings', () => {
        const raw = parseQulRecitation(
            JSON.stringify(
                rawRecitation({
                    '1:1': {
                        surah_number: '1',
                        ayah_number: '1',
                        audio_url: 'https://audio.example.com/001001.mp3',
                        duration: '3.5',
                        segments: [['1', '380', '730']],
                    },
                }),
            ),
        );
        expect(raw['1:1']).toMatchObject({ surah_number: 1, ayah_number: 1, duration: 3.5, segments: [[1, 380, 730]] });
    });

    it('rejects a file that is not a whole recitation', () => {
        const partial = rawRecitation();
        delete partial['2:255'];
        expect(() => parseQulRecitation(JSON.stringify(partial))).toThrow(/Missing 1 verse/);
        expect(() => parseQulRecitation('{"1:1":{"surah_number":1}}')).toThrow(/Not a QUL ayah recitation/);
    });

    it('puts the word timings back in order and keeps one timing per word', () => {
        expect(
            toWordTimings([
                [2, 1200, 1800],
                [1, 300, 900],
                [2, 2400, 2600],
            ]),
        ).toEqual([
            [1, 300, 900],
            [2, 1200, 1800],
        ]);
    });

    it('never lets a word end before it starts, and drops the segments without a word', () => {
        expect(toWordTimings([[1, 900, 300]])).toEqual([[1, 900, 900]]);
        expect(toWordTimings([[0, 0, 300], [-1, 0, 300]])).toEqual([]);
    });

    it('builds a whole recitation, in milliseconds', () => {
        const file = build({
            '1:1': {
                surah_number: 1,
                ayah_number: 1,
                audio_url: 'https://audio.example.com/001001.mp3',
                duration: 3.84,
                segments: [
                    [1, 0, 500],
                    [2, 520, 1120],
                ],
            },
        });
        expect(QuranRecitationFileSchema.parse(file)).toEqual(file);
        expect(file.surahs).toHaveLength(114);
        expect(file.surahs[0]![0]).toEqual({ duration: 3840, words: [[1, 0, 500], [2, 520, 1120]] });
        expect(file.recitation).toMatchObject({ id: 'al-husary', style: 'murattal', timedVerseCount: 6236 });
        expect(file.recitation.attribution.sourceUrl).toBe('https://qul.tarteel.ai/resources/recitation/957');
        expect(file.recitation.attribution.retrievedAt).toBe(modifiedAt.toISOString());
    });

    it('leaves out the duration the source does not measure, and keeps the verse playable', () => {
        const file = build({
            '1:1': {
                surah_number: 1,
                ayah_number: 1,
                audio_url: 'https://audio.example.com/001001.mp3',
                duration: null,
                segments: [],
            },
        });
        expect(file.surahs[0]![0]).toEqual({ words: [] });
        expect(file.recitation.timedVerseCount).toBe(6235);
    });

    it('warns about the verses the source does not time word by word', () => {
        const warnings: string[] = [];
        toRecitationFile(
            recitation,
            parseQulRecitation(
                JSON.stringify(
                    rawRecitation({
                        '1:1': { surah_number: 1, ayah_number: 1, audio_url: 'https://a.example.com/1.mp3', duration: 3, segments: [] },
                    }),
                ),
            ),
            { retrievedAt: modifiedAt.toISOString(), warn: (message) => warnings.push(message) },
        );
        expect(warnings).toEqual(['al-husary: 1 verse(s) without word timings, played whole']);
    });

    it('lists the source url of every verse for the audio mirror', () => {
        const urls = qulRecitationAudioUrls(parseQulRecitation(JSON.stringify(rawRecitation())));
        expect(urls.size).toBe(6236);
        expect(urls.get('2:255')).toBe('https://audio.example.com/2-255.mp3');
    });

    it('publishes one file per recitation, then the catalog', async () => {
        const text = JSON.stringify(rawRecitation());
        const files = await buildRecitationFiles(async () => ({ text, modifiedAt }), {
            recitations: QUL_RECITATIONS.slice(0, 2),
            log: () => {},
            warn: () => {},
        });
        expect(files.map((file) => file.key)).toEqual([
            'quran/recitations/al-husary',
            'quran/recitations/al-minshawi',
            'quran/recitations',
        ]);
        expect((files.at(-1)!.data as { recitations: { id: string }[] }).recitations.map((entry) => entry.id)).toEqual([
            'al-husary',
            'al-minshawi',
        ]);
    });

    it('keeps the published entry of a recitation whose source is gone', async () => {
        const warnings: string[] = [];
        const previous = [
            {
                id: 'al-husary',
                reciter: 'Mahmoud Khalil Al-Husary',
                style: 'murattal' as const,
                timedVerseCount: 6236,
                attribution: { source: 'Quranic Universal Library (Tarteel)', retrievedAt: modifiedAt.toISOString() },
            },
        ];
        const files = await buildRecitationFiles(async () => undefined, {
            recitations: QUL_RECITATIONS.slice(0, 1),
            previous,
            log: () => {},
            warn: (message) => warnings.push(message),
        });
        expect(files.map((file) => file.key)).toEqual(['quran/recitations']);
        expect((files[0]!.data as { recitations: unknown[] }).recitations).toEqual(previous);
        expect(warnings[0]).toContain('published version kept');
    });

    it('names every source file and every reciter once', () => {
        expect(new Set(QUL_RECITATIONS.map((entry) => entry.id)).size).toBe(QUL_RECITATIONS.length);
        expect(new Set(QUL_RECITATIONS.map((entry) => entry.reciter)).size).toBe(QUL_RECITATIONS.length);
        expect(qulRecitationSourceKey('al-husary')).toBe('qul/recitations/al-husary.json');
    });

    it('recognizes the files downloaded from QUL, and only those', () => {
        const downloads: Record<string, string> = {
            'ayah-recitation-mahmoud-khalil-al-husary-murattal-hafs-957.json': 'al-husary',
            'ayah-recitation-muhammad-siddiq-al-minshawi-murattal-hafs-959.json': 'al-minshawi',
            'ayah-recitation-abdur-rahman-as-sudais-recitation.json': 'sudais',
            'ayah-recitation-yasser-al-dosari-murattal-hafs-961.json': 'al-dosari',
            'ayah-recitation-hani-ar-rifai-recitation-murattal-hafs-68.json': 'ar-rifai',
            'ayah-recitation-khalifa-al-tunaiji-murattal-hafs-958.json': 'al-tunaiji',
            'ayah-recitation-alnufais.json': 'alnufais',
        };
        for (const [name, id] of Object.entries(downloads)) {
            const matching = QUL_RECITATIONS.filter((entry) => entry.file.test(name));
            expect(matching.map((entry) => entry.id)).toEqual([id]);
        }
        expect(QUL_RECITATIONS.filter((entry) => entry.file.test('english-wbw-translation.json'))).toEqual([]);
    });
});
