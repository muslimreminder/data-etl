import { contentKeys, QURAN_VERSE_COUNTS, QuranTranslationsFileSchema, type QuranTranslationFile } from '@muslimreminder/schema/content';
import { describe, expect, it } from 'vitest';
import { QUL_TRANSLATIONS, type QulTranslation } from '../src/sources/qul/catalog.ts';
import { buildTranslationFiles, type QulSource } from '../src/sources/qul/index.ts';
import { hasFootnoteTags, parseQulTranslation, type RawQulTranslation } from '../src/sources/qul/raw.ts';
import { footnoteToText, toVerse } from '../src/sources/qul/transform.ts';

const noWarn = () => {
    throw new Error('unexpected warning');
};

/** A complete QUL file, every verse `Verse s:v`, with `overrides` on top. */
const rawTranslation = (overrides: RawQulTranslation = {}): RawQulTranslation => ({
    ...Object.fromEntries(
        QURAN_VERSE_COUNTS.flatMap((count, surah) =>
            Array.from({ length: count }, (_, verse) => [`${surah + 1}:${verse + 1}`, { t: `Verse ${surah + 1}:${verse + 1}` }]),
        ),
    ),
    ...overrides,
});

const hamidullah: QulTranslation = QUL_TRANSLATIONS.find((translation) => translation.id === 'fr-hamidullah')!;

describe('toVerse', () => {
    it('keeps plain verses as they are', () => {
        expect(toVerse({ t: 'In the name of Allah, the Compassionate, the Merciful.' }, '1:1', noWarn)).toEqual({
            text: 'In the name of Allah, the Compassionate, the Merciful.',
        });
    });

    it('takes the footnotes out of the text, at the offset of their marker', () => {
        const verse = toVerse(
            {
                t: 'Et accomplissez la prière,<sup foot_note="1">1</sup> et inclinez-vous <sup foot_note="2">2</sup> avec eux.',
                f: { '1': 'La Salât.', '2': 'Le rukû‘.' },
            },
            '2:43',
            noWarn,
        );
        expect(verse.text).toBe('Et accomplissez la prière, et inclinez-vous avec eux.');
        expect(verse.footnotes).toEqual([
            { offset: 'Et accomplissez la prière,'.length, text: 'La Salât.' },
            { offset: 'Et accomplissez la prière, et inclinez-vous'.length, text: 'Le rukû‘.' },
        ]);
    });

    it('decodes entities, strips other tags and trims around a trailing marker', () => {
        const verse = toVerse({ t: ' Alif, L&acirc;m, <i>Mîm</i>. <sup foot_note="9">1</sup> ', f: { '9': 'Lettres isolées.' } }, '2:1', noWarn);
        expect(verse).toEqual({ text: 'Alif, Lâm, Mîm.', footnotes: [{ offset: 15, text: 'Lettres isolées.' }] });
    });

    it('drops a marker whose footnote is missing, with a warning', () => {
        const warnings: string[] = [];
        const verse = toVerse({ t: 'Texte.<sup foot_note="7">1</sup>', f: {} }, 'fr 3:2', (message) => warnings.push(message));
        expect(verse).toEqual({ text: 'Texte.' });
        expect(warnings).toEqual(['fr 3:2: footnote 7 is missing or empty, dropped']);
    });
});

describe('footnoteToText', () => {
    it('turns the line breaks between merged notes into paragraphs', () => {
        expect(footnoteToText('Après eux: les Aād.<br />[810] Ils ont discuté.')).toBe('Après eux: les Aād.\n\n[810] Ils ont discuté.');
    });
});

describe('parseQulTranslation', () => {
    it('accepts a complete file and tells the footnote-tags format apart', () => {
        const simple = parseQulTranslation(JSON.stringify(rawTranslation()));
        expect(hasFootnoteTags(simple)).toBe(false);
        const tagged = parseQulTranslation(JSON.stringify(rawTranslation({ '1:1': { t: 'Au nom d’Allah', f: {} } })));
        expect(hasFootnoteTags(tagged)).toBe(true);
    });

    it('rejects a file with missing or extra verses', () => {
        const { '2:255': _, ...missing } = rawTranslation();
        expect(() => parseQulTranslation(JSON.stringify(missing))).toThrow(/Missing 1 verse\(s\), e.g. 2:255/);
        expect(() => parseQulTranslation(JSON.stringify(rawTranslation({ '115:1': { t: 'x' } })))).toThrow(/Expected 6236 verses/);
        expect(() => parseQulTranslation('{"hadith": 1}')).toThrow(/Not a QUL translation/);
    });
});

describe('buildTranslationFiles', () => {
    const uploadedAt = new Date('2026-09-28T08:00:00Z');
    const sources = (files: Record<string, RawQulTranslation>) => async (key: string): Promise<QulSource | undefined> =>
        files[key] && { text: JSON.stringify(files[key]), modifiedAt: uploadedAt };

    it('publishes each translation and a catalog, dated by the upload of their source', async () => {
        const raw = rawTranslation({ '1:1': { t: 'Au nom d’Allah.<sup foot_note="1">1</sup>', f: { '1': 'La basmala.' } } });
        const files = await buildTranslationFiles(sources({ 'qul/translations/fr-hamidullah.json': raw }), {
            translations: [hamidullah],
            log: () => {},
            warn: noWarn,
        });

        expect(files.map((file) => file.key)).toEqual([contentKeys.quran.translation('fr-hamidullah'), contentKeys.quran.translations()]);
        const translation = files[0]!.data as QuranTranslationFile;
        expect(translation.surahs[0]![0]).toEqual({ text: 'Au nom d’Allah.', footnotes: [{ offset: 15, text: 'La basmala.' }] });
        expect(translation.surahs[113]![5]).toEqual({ text: 'Verse 114:6' });
        expect(translation.translation).toEqual({
            id: 'fr-hamidullah',
            language: 'fr',
            name: 'Muhammad Hamidullah',
            footnotedVerseCount: 1,
            attribution: {
                source: 'Quranic Universal Library (Tarteel)',
                sourceUrl: 'https://qul.tarteel.ai/resources/translation/227',
                retrievedAt: '2026-09-28T08:00:00.000Z',
            },
        });
        expect(QuranTranslationsFileSchema.parse(files[1]!.data).translations).toEqual([translation.translation]);
    });

    it('keeps the published entry of a translation whose source is missing', async () => {
        const published = { ...(await firstEntry()), name: 'Published name' };
        const warnings: string[] = [];
        const files = await buildTranslationFiles(sources({}), {
            translations: [hamidullah],
            previous: [published],
            log: () => {},
            warn: (message) => warnings.push(message),
        });
        expect(files.map((file) => file.key)).toEqual([contentKeys.quran.translations()]);
        expect(QuranTranslationsFileSchema.parse(files[0]!.data).translations).toEqual([published]);
        expect(warnings).toEqual(['fr-hamidullah: no source at qul/translations/fr-hamidullah.json, published version kept']);
    });

    it('warns when the footnote-tags download is expected but a simple file was uploaded', async () => {
        const warnings: string[] = [];
        await buildTranslationFiles(sources({ 'qul/translations/fr-hamidullah.json': rawTranslation() }), {
            translations: [hamidullah],
            log: () => {},
            warn: (message) => warnings.push(message),
        });
        expect(warnings).toEqual(['fr-hamidullah: expected the footnote-tags download, got a file without footnotes']);
    });

    async function firstEntry() {
        const files = await buildTranslationFiles(sources({ 'qul/translations/fr-hamidullah.json': rawTranslation({ '1:1': { t: 'a', f: {} } }) }), {
            translations: [hamidullah],
            log: () => {},
            warn: noWarn,
        });
        return (files[0]!.data as QuranTranslationFile).translation;
    }
});

describe('catalog', () => {
    it('has unique ids and recognizes each file by a distinct name', () => {
        expect(new Set(QUL_TRANSLATIONS.map((translation) => translation.id)).size).toBe(QUL_TRANSLATIONS.length);
        const downloads = [
            'quran-fr-hamidullah-with-footnote-tags.json',
            'fr-rashid-maash-with-footnote-tags.json',
            'en-daryabadi-simple.json',
            'muslim-shahin-simple.json',
            'shaban-britch-simple.json',
            'tr-hamdi-simple.json',
            'de-bubenheim-simple.json',
            'es-isa-garcia-with-footnote-tags.json',
            'noor-international-center-with-footnote-tags.json',
            'quran-ru-kuliev-simple.json',
            'ru-abu-adel-simple.json',
            'ru-gordy-simple.json',
            'ru-nuri-simple.json',
            'en-sahih-international-with-footnote-tags.json',
            'ruwwad-center-simple.json',
            'en-muhsin-khan-simple.json',
            'quran-en-pickthall-simple.json',
            'abu-reda-muhammad-ibn-ahmad-simple.json',
            'quran-id-with-footnote-tags.json',
            'king-fahad-quran-complex-with-footnote-tags.json',
            'the-sabiq-company-with-footnote-tags.json',
            'ur-junagarri-with-footnote-tags.json',
            'dr-abu-bakr-muhammad-zakaria-simple.json',
            'islamhouse-com-simple.json',
            'mawlawi-muhammad-anwar-badkhashani-simple.json',
            'abdullah-basamia-simple.json',
            'maulana-azizul-haque-al-umari-with-footnote-tags.json',
            'othman-al-sharif-simple.json',
            'helmi-nasr-simple.json',
            'dutch-islamic-center-simple.json',
            'besim-korkut-simple.json',
            'bs-unknown-simple.json',
            'al-hasan-efendi-with-footnote-tags.json',
            'croatian-translation-rwwad-simple.json',
            'macedonian-scholars-with-footnote-tags.json',
            'swahili-translation-rowad-translation-center-simple.json',
            'dr-abdullah-muhammad-abu-bakr-and-sheikh-nasir-khamis-simple.json',
            'abubakar-mahmood-jummi-with-footnote-tags.json',
            'abdullah-hassan-yacoub-with-footnote-tags.json',
            'am-sadiq-simple.json',
            'amharic-translation-zain-simple.json',
            'ghali-apapur-apaghuna-simple.json',
            'om-rowwad-simple.json',
            'shaykh-abu-rahimah-mikael-aykyuni-with-footnote-tags.json',
            'muhammad-makin-simple.json',
            'chinese-suliman-simple.json',
            'chinese-translation-basair-simple.json',
            'saeed-sato-simple.json',
            'hamed-choi-simple.json',
            'quran-th-quran-complex-simple.json',
            'hasan-abdul-karim-simple.json',
            'uzbek-translation-rowwad-translation-center-simple.json',
            'alauddin-mansour-with-footnote-tags.json',
            'muhammad-sodik-muhammad-yusuf-with-footnote-tags.json',
            'khalifa-altay-simple.json',
            'kyrgyz-hakimov-simple.json',
            'pioneers-of-translation-center-simple.json',
            'khawaja-mirof-khawaja-mir-with-footnote-tags.json',
            'az-alikhan-simple.json',
            'sheikh-omar-sharif-bin-abdul-salam-simple.json',
            'abdul-hameed-baqavi-simple.json',
            'abdul-hamid-haidar-kanhi-muhammad-simple.json',
            'maulana-abder-rahim-ibn-muhammad-simple.json',
            'kannada-translation-bashir-missouri-simple.json',
            'muhammad-hamza-battur-simple.json',
            'rabila-al-umry-simple.json',
            'muhammad-shafi-i-ansari-simple.json',
            'ahl-al-hadith-central-society-of-nepal-simple.json',
            'punjabi-arif-simple.json',
            'zakaria-abulsalam-simple.json',
            'pashto-translation-rowwad-translation-center-simple.json',
            'pashto-sarfaraz-simple.json',
            'kurdish-translation-salahuddin-simple.json',
            'muhammad-saleh-bamoki-simple.json',
            'kurdish-kurmanji-translation-simple.json',
            'ug-saleh-simple.json',
            'dr-mikhailo-yaqubovic-simple.json',
            'romanian-translation-simple.json',
            'bulgarian-translation-simple.json',
            'lithuanian-translation-with-footnote-tags.json',
            'greek-translation-simple.json',
            'the-rwanda-muslims-association-team-with-footnote-tags.json',
            'lingala-translation-simple.json',
            'malagasy-translation-rowad-simple.json',
            'zulu-translation-adel-jaffer-simple.json',
            'sn-dar-ilam-institute-simple.json',
            'chewa-translation-simple.json',
            'shaikh-mahmud-abdulkader-hamza-simple.json',
            'muhammad-baba-gutubu-simple.json',
            'luhya-translation-simple.json',
            'african-development-foundation-simple.json',
            'ikirundi-gehiti-simple.json',
            'abdul-hamid-silika-with-footnote-tags.json',
            'bisayan-translation-rowwad-center-simple.json',
            'maguindanao-rwwad-simple.json',
            'filipino-iranionian-translation-simple.json',
            'cambodian-muslim-community-development-simple.json',
            'khmer-translation-rwwad-translation-center-simple.json',
            'shaykh-rafeequl-islam-habibur-rahman-with-footnote-tags.json',
            'suliman-kanti-simple.json',
            'baba-mamady-jani-simple.json',
        ];
        for (const name of downloads) {
            expect(QUL_TRANSLATIONS.filter((translation) => translation.file.test(name))).toHaveLength(1);
        }
    });

    it('leaves the Montada files to an explicit id, QUL naming them the same in every language', () => {
        const montada = QUL_TRANSLATIONS.filter((translation) => translation.file.test('montada-islamic-foundation-with-footnote-tags.json'));
        expect(montada.map((translation) => translation.id)).toEqual(['fr-montada', 'es-montada']);
    });

    it('leaves the other files QUL names alike to an explicit id', () => {
        const ids = (name: string) => QUL_TRANSLATIONS.filter((translation) => translation.file.test(name)).map((translation) => translation.id);
        expect(ids('dar-al-salam-center-simple.json')).toEqual(['tr-dar-al-salam', 'sr-rowwad', 'he-dar-al-salam', 'tl-dar-al-salam']);
        expect(ids('translation-pioneers-center-simple.json')).toEqual(['sq-rowwad', 'vi-rowwad', 'si-rowwad']);
        expect(ids('rowad-translation-center-simple.json')).toEqual(['ak-harun-ismail', 'ff-rowwad']);
    });
});
