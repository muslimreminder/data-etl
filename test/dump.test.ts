import { describe, expect, it } from 'vitest';
import { parseHadithDump, segmentsFor, stripMarkup, toRawHadith, toSegments } from '../src/sources/sunnah/dump.ts';

const SQL = `-- MariaDB dump
CREATE TABLE \`HadithTable\` (
  \`collection\` varchar(50) NOT NULL,
  \`bookNumber\` varchar(20) NOT NULL,
  \`babID\` decimal(6,2) NOT NULL,
  \`hadithNumber\` varchar(50) NOT NULL,
  \`arabicURN\` int NOT NULL,
  \`arabicText\` text,
  \`arabicgrade1\` varchar(2000) NOT NULL,
  \`englishURN\` int NOT NULL,
  \`englishText\` text,
  \`englishgrade1\` varchar(2000) NOT NULL,
  PRIMARY KEY (\`arabicURN\`)
) ENGINE=InnoDB;
INSERT INTO \`HadithTable\` VALUES
('bukhari','1',1.00,'1',100010,'[prematn]حَدَّثَنَا [narrator id=\\"4698\\" tooltip=\\"الحميدي\\"]الْحُمَيْدِيُّ[/narrator] يَقُولُ \\"[/prematn][matn]إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ\\"[/matn].','صحيح',10,'<p>Narrated \\'Umar:</p><p>Deeds are by intentions.</p>','Sahih'),
('bukhari','89',1.00,'6940',169400,'نص بلا ترميز','',69400,'Text','');
`;

describe('parseHadithDump', () => {
    it('reads rows by column name, with escapes', () => {
        const dump = parseHadithDump(SQL);
        expect(dump.byArabicUrn.size).toBe(2);
        const record = dump.byArabicUrn.get(100010)!;
        expect(record).toMatchObject({ collection: 'bukhari', bookNumber: '1', chapterId: '1.00', hadithNumber: '1', englishUrn: 10, englishGrade: 'Sahih' });
        expect(record.englishText).toBe("<p>Narrated 'Umar:</p><p>Deeds are by intentions.</p>");
        expect(dump.byBook.get('bukhari/89')?.map((r) => r.hadithNumber)).toEqual(['6940']);
    });

    it('rejects something that is not the HadithTable dump', () => {
        expect(() => parseHadithDump('CREATE TABLE `Other` (\n  `a` int\n);')).toThrow(/HadithTable/);
    });
});

describe('segments', () => {
    const markup = '[prematn]حَدَّثَنَا [narrator id="1"]الْحُمَيْدِيُّ[/narrator] يَقُولُ "[/prematn][matn]إِنَّمَا الأَعْمَالُ[/matn].[postmatn]قَالَ أَبُو عِيسَى[/postmatn]';

    it('splits sanad / matan and drops the other markup', () => {
        expect(toSegments(markup)).toEqual([
            { type: 'sanad', text: 'حَدَّثَنَا الْحُمَيْدِيُّ يَقُولُ "' },
            { type: 'matan', text: 'إِنَّمَا الأَعْمَالُ.' },
            { type: 'sanad', text: 'قَالَ أَبُو عِيسَى' },
        ]);
        expect(stripMarkup(markup)).toBe('حَدَّثَنَا الْحُمَيْدِيُّ يَقُولُ "إِنَّمَا الأَعْمَالُ.قَالَ أَبُو عِيسَى');
    });

    it('returns nothing without a matan', () => {
        expect(toSegments('نص بلا ترميز')).toBeUndefined();
    });

    it('only keeps segments that spell the published text', () => {
        const record = parseHadithDump(SQL).byArabicUrn.get(100010)!;
        const published = stripMarkup(record.arabicText);
        expect(segmentsFor(record, published)?.map((s) => s.type)).toEqual(['sanad', 'matan']);
        expect(segmentsFor(record, `${published} زيادة`)).toBeUndefined();
        expect(segmentsFor(undefined, published)).toBeUndefined();
    });
});

describe('toRawHadith', () => {
    it('builds an API-shaped hadith without markup', () => {
        const raw = toRawHadith(parseHadithDump(SQL).byArabicUrn.get(100010)!);
        expect(raw).toMatchObject({ collection: 'bukhari', bookNumber: '1', chapterId: '1.00', hadithNumber: '1' });
        expect(raw.hadith[1]).toMatchObject({ lang: 'ar', urn: 100010, grades: [{ graded_by: null, grade: 'صحيح' }] });
        expect(raw.hadith[1]?.body).not.toContain('[');
    });
});
