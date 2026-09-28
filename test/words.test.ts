import {
  contentKeys,
  QURAN_VERSE_COUNTS,
  QuranWordTranslationsFileSchema,
  type QuranWordTranslationFile,
} from "@muslimreminder/schema/content";
import { describe, expect, it } from "vitest";
import {
  buildWordTranslationFiles,
  parseQulWords,
  QUL_WORD_TRANSLATIONS,
  toWordTranslationFile,
  type RawQulWords,
} from "../src/sources/qul/words.ts";

const french = QUL_WORD_TRANSLATIONS.find(
  (translation) => translation.id === "fr-wbw",
)!;

/** A whole Quran of one-word verses, `w s:v`, with `overrides` on top. */
const rawWords = (overrides: RawQulWords = {}): RawQulWords => ({
  ...Object.fromEntries(
    QURAN_VERSE_COUNTS.flatMap((count, surah) =>
      Array.from({ length: count }, (_, verse) => [
        `${surah + 1}:${verse + 1}:1`,
        `w ${surah + 1}:${verse + 1}`,
      ]),
    ),
  ),
  ...overrides,
});

describe("toWordTranslationFile", () => {
  it("places each word at its position, skipping the verse number some files add", () => {
    const warnings: string[] = [];
    const file = toWordTranslationFile(
      french,
      rawWords({
        "1:1:1": "Au nom",
        "1:1:2": " d’Allah ",
        "1:1:4": "le Très Miséricordieux",
        "1:1:5": "(1)",
      }),
      {
        retrievedAt: "2026-09-28T08:00:00.000Z",
        warn: (message) => warnings.push(message),
      },
    );

    // Word 3 is left to the translation of word 2 by the source: kept empty, so the others stay aligned.
    expect(file.surahs[0]![0]).toEqual([
      "Au nom",
      "d’Allah",
      null,
      "le Très Miséricordieux",
    ]);
    expect(file.surahs[113]![5]).toEqual(["w 114:6"]);
    expect(file.translation).toMatchObject({
      id: "fr-wbw",
      language: "fr",
      translatedWordCount: 6238,
    });
    expect(warnings).toEqual(["fr-wbw: 1 word(s) without a translation"]);
  });

  it("fails on a file missing whole verses", () => {
    const { "2:255:1": _, ...raw } = rawWords();
    expect(() =>
      toWordTranslationFile(french, raw, {
        retrievedAt: "2026-09-28T08:00:00.000Z",
        warn: () => {},
      }),
    ).toThrow(/no word for 1 verse\(s\), e.g. 2:255/);
  });
});

describe("parseQulWords", () => {
  it("rejects what is not keyed by surah:verse:word", () => {
    expect(() => parseQulWords('{"1:1": {"t": "x"}}')).toThrow(
      /Not a QUL word-by-word translation/,
    );
  });
});

describe("buildWordTranslationFiles", () => {
  it("publishes each translation and a catalog, keeping a published entry whose source is missing", async () => {
    const read = async (key: string) =>
      key === "qul/word-translations/fr-wbw.json"
        ? {
            text: JSON.stringify(rawWords()),
            modifiedAt: new Date("2026-09-28T08:00:00Z"),
          }
        : undefined;
    const english = QUL_WORD_TRANSLATIONS.find(
      (translation) => translation.id === "en-wbw",
    )!;
    const published = {
      id: "en-wbw",
      language: "en",
      name: "Word by word",
      translatedWordCount: 1,
      attribution: { source: "QUL", retrievedAt: "2026-09-01T00:00:00.000Z" },
    };
    const warnings: string[] = [];

    const files = await buildWordTranslationFiles(read, {
      translations: [french, english],
      previous: [published],
      log: () => {},
      warn: (message) => warnings.push(message),
    });

    expect(files.map((file) => file.key)).toEqual([
      contentKeys.quran.wordTranslation("fr-wbw"),
      contentKeys.quran.wordTranslations(),
    ]);
    expect(
      (files[0]!.data as QuranWordTranslationFile).translation.attribution
        .retrievedAt,
    ).toBe("2026-09-28T08:00:00.000Z");
    expect(
      QuranWordTranslationsFileSchema.parse(files[1]!.data).translations.map(
        (t) => t.id,
      ),
    ).toEqual(["fr-wbw", "en-wbw"]);
    expect(warnings).toEqual([
      "en-wbw: no source at qul/word-translations/en-wbw.json, published version kept",
    ]);
  });
});
