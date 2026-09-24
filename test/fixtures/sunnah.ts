import type { RawBook, RawChapter, RawCollection, RawHadith } from '../../src/sources/sunnah/raw.ts';

// Trimmed copies of real sunnah.com responses (Sahih al-Bukhari, book 1).
export const rawCollection: RawCollection = {
    name: 'bukhari',
    hasBooks: 'yes',
    hasChapters: 'yes',
    collection: [
        { lang: 'en', title: 'Sahih al-Bukhari', shortIntro: 'The <i>Sunnah</i> of the Prophet (ﷺ).\r\n\r\nTranslated by Dr. M. Muhsin Khan.' },
        { lang: 'ar', title: 'صحيح البخاري', shortIntro: '' },
    ],
    totalHadith: 7563,
    totalAvailableHadith: 7277,
};

export const rawBook: RawBook = {
    bookNumber: '1',
    book: [
        { lang: 'en', name: 'Revelation' },
        { lang: 'ar', name: 'كتاب بدء الوحى ' },
    ],
    hadithStartNumber: 1,
    hadithEndNumber: 7,
    numberOfHadith: 7,
};

export const rawChapters: RawChapter[] = [
    {
        bookNumber: '1',
        chapterId: '1.00',
        chapter: [
            {
                lang: 'en',
                chapterNumber: '1',
                chapterTitle: "How the Divine Revelation started being revealed to Allah's Messenger",
                intro: '<p>And the Statement of Allah: "Verily, We have sent the revelation to you" (V.4:163)</p>',
                ending: null,
            },
            { lang: 'ar', chapterNumber: '1', chapterTitle: 'باب كَيْفَ كَانَ بَدْءُ الْوَحْىِ', intro: null, ending: null },
        ],
    },
    {
        bookNumber: '1',
        chapterId: '2.00',
        chapter: [
            { lang: 'en', chapterNumber: '2', chapterTitle: '', intro: null, ending: null },
            { lang: 'ar', chapterNumber: '2', chapterTitle: 'باب', intro: null, ending: null },
        ],
    },
    {
        bookNumber: '1',
        chapterId: '3.00',
        chapter: [{ lang: 'en', chapterNumber: '3', chapterTitle: 'Unused chapter', intro: null, ending: null }],
    },
];

const hadith = (number: string, chapterId: string | null, en: string | null, ar: string | null): RawHadith => ({
    collection: 'bukhari',
    bookNumber: '1',
    chapterId,
    hadithNumber: number,
    hadith: [
        { lang: 'en', chapterNumber: '1', chapterTitle: null, urn: 10, body: en, grades: [{ graded_by: null, grade: 'Sahih' }] },
        { lang: 'ar', chapterNumber: '1', chapterTitle: null, urn: 100010, body: ar, grades: [] },
    ],
});

export const rawHadiths: RawHadith[] = [
    hadith(
        '1',
        '1.00',
        "<p>Narrated 'Umar bin Al-Khattab:\n</p>\n<p>\n I heard Allah's Messenger (ﷺ) saying, &quot;The reward of deeds depends upon the \n intentions.&quot;\n</p>",
        '<p>حَدَّثَنَا الْحُمَيْدِيُّ ... إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ</p>',
    ),
    hadith('2', '2.00', '<p>Narrated Aisha:</p><p>Line one<br/>Line two</p>', null),
    hadith('2', '2.00', '<p>Duplicate of 2</p>', null),
    hadith('3', '9.00', '<p>Hadith in an unknown chapter</p>', null),
    hadith('4', '1.00', null, '   '),
];
