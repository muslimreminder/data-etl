import { HadithBookFileSchema, HadithCollectionSchema } from '@muslimreminder/schema/content';
import { describe, expect, it } from 'vitest';
import { toBookFile, toCollection } from '../src/sources/sunnah/transform.ts';
import { rawBook, rawChapters, rawCollection, rawHadiths } from './fixtures/sunnah.ts';

const build = () => {
    const warnings: string[] = [];
    const file = toBookFile('bukhari', rawBook, 1, rawChapters, rawHadiths, (message) => warnings.push(message));
    return { file: file!, warnings };
};

describe('toBookFile', () => {
    it('produces a file valid against the shared schema', () => {
        expect(HadithBookFileSchema.safeParse(build().file).success).toBe(true);
    });

    it('cleans texts and splits the English narrator', () => {
        const [first] = build().file.hadiths;
        expect(first?.texts.en).toEqual({
            narrator: "Narrated 'Umar bin Al-Khattab:",
            body: 'I heard Allah\'s Messenger (ﷺ) saying, "The reward of deeds depends upon the intentions."',
            grades: [{ grade: 'Sahih', gradedBy: null }],
        });
        expect(first?.texts.ar?.body).toBe('حَدَّثَنَا الْحُمَيْدِيُّ ... إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ');
        expect(first?.texts.ar?.grades).toEqual([]);
    });

    it('keeps alternative chains sharing a number, identified by urn', () => {
        const { file } = build();
        expect(file.hadiths.map((hadith) => [hadith.id, hadith.number])).toEqual([
            ['100010', '1'],
            ['100020', '2'],
            ['100021', '2'],
            ['100030', '3'],
            ['100035', '3b'],
        ]);
        expect(file.book.hadithCount).toBe(5);
    });

    it('drops duplicated urns, hadiths without text or number, and reports them', () => {
        expect(build().warnings).toEqual([
            'bukhari/1 #2: duplicate urn 100021, skipped',
            'bukhari/1 #3b: unknown chapter 8.00, chapter dropped',
            'bukhari/1 #4: no ar/en text, skipped',
            'bukhari/1 #? (urn 100050): no number, skipped',
        ]);
    });

    it('names chapters missing from the endpoint from the hadiths themselves', () => {
        const chapter = build().file.chapters.find((c) => c.id === '9.00');
        expect(chapter).toEqual({ id: '9.00', title: { en: 'Chapter from the hadith' } });
    });

    it('keeps used chapters only, with a fallback for empty titles', () => {
        const { file } = build();
        expect(file.chapters.map((chapter) => chapter.id)).toEqual(['1.00', '2.00', '9.00']);
        expect(file.chapters[1]?.title).toEqual({ ar: 'باب' });
        expect(file.chapters[0]?.intro?.en).toBe('And the Statement of Allah: "Verily, We have sent the revelation to you" (V.4:163)');
    });

    it('returns nothing for a book without usable hadith', () => {
        expect(toBookFile('bukhari', rawBook, 1, [], rawHadiths.filter((h) => h.hadithNumber === '4'), () => {})).toBeUndefined();
    });
});

describe('toCollection', () => {
    it('uses the published counts and drops empty intros', () => {
        const collection = toCollection(rawCollection, { bookCount: 1, hadithCount: 3, languages: ['ar', 'en'] }, '2026-09-24T12:00:00.000Z');
        expect(HadithCollectionSchema.safeParse(collection).success).toBe(true);
        expect(collection.name).toEqual({ en: 'Sahih al-Bukhari', ar: 'صحيح البخاري' });
        expect(collection.shortIntro).toEqual({ en: 'The Sunnah of the Prophet (ﷺ).\n\nTranslated by Dr. M. Muhsin Khan.' });
        expect(collection.attribution).toEqual({ source: 'sunnah.com', sourceUrl: 'https://sunnah.com', retrievedAt: '2026-09-24T12:00:00.000Z' });
    });
});

describe('collections without chapters', () => {
    it('drops untitled chapter ids silently', () => {
        const warnings: string[] = [];
        const untitled = rawHadiths.filter((h) => h.hadithNumber === '3b');
        const file = toBookFile('bukhari', rawBook, 1, [], untitled, (message) => warnings.push(message));
        expect(file?.hadiths[0]?.chapterId).toBeUndefined();
        expect(file?.chapters).toEqual([]);
        expect(warnings).toEqual([]);
    });
});
