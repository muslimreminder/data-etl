import { contentKeys, QuranTafsirsFileSchema } from "@muslimreminder/schema/content";
import { describe, expect, it } from "vitest";
import {
  buildTafsirFiles,
  parseQulTafsir,
  QUL_TAFSIRS,
  tafsirTextToBlocks,
  toTafsirFile,
  type RawQulTafsir,
} from "../src/sources/qul/tafsirs.ts";

const english = QUL_TAFSIRS.find((tafsir) => tafsir.id === "en-ibn-kathir")!;
const retrievedAt = "2026-09-28T08:00:00.000Z";

/** Every verse explained alone, with `overrides` on top. */
const rawTafsir = (overrides: RawQulTafsir = {}): RawQulTafsir => {
  const counts = [7, 286];
  const raw: RawQulTafsir = {};
  counts.forEach((count, s) => {
    for (let v = 1; v <= count; v++) raw[`${s + 1}:${v}`] = { text: `<p>Verse ${s + 1}:${v}.</p>` };
  });
  return { ...raw, ...overrides };
};

describe("tafsirTextToBlocks", () => {
  it("turns quoted translations into quotes, drops editors' notes and spaces Quran words", () => {
    expect(
      tafsirTextToBlocks(
        '<h2 class="en">Praise</h2><p class="en translation" lang="en">All praise <span>(2)</span></p>' +
          '<div class=ar lang=ar><p>قَالَ [[في أ: "يفتتح".]] <span class="arabic qpc-hafs">ٱلْحَمْدُ</span><span class="arabic qpc-hafs">لِلَّهِ</span></p></div>' +
          "<p>Fir`awn</p>",
        english,
      ),
    ).toEqual([
      { type: "heading", text: "Praise" },
      { type: "quote", text: "All praise (2)" },
      { type: "paragraph", text: "قَالَ ٱلْحَمْدُ لِلَّهِ" },
      { type: "paragraph", text: "Firʿawn" },
    ]);
  });

  it("splits plain text into paragraphs and applies the source fixes", () => {
    expect(tafsirTextToBlocks("Le Seigneur (`ar-rabbu).\n\n- Allâhu", { backtick: "" })).toEqual([
      { type: "paragraph", text: "Le Seigneur (ar-rabbu)." },
      { type: "paragraph", text: "- Allâhu" },
    ]);
    expect(tafsirTextToBlocks("<p>словосо- четания — Кото- рому</p>", { backtick: "ʿ", joinHyphenatedWords: true })).toEqual([
      { type: "paragraph", text: "словосочетания — Которому" },
    ]);
    expect(tafsirTextToBlocks("<div class=ar lang=ar></div>", english)).toEqual([]);
  });
});

describe("toTafsirFile", () => {
  it("groups verses explained together and leaves out the verses without commentary", () => {
    const warnings: string[] = [];
    const file = toTafsirFile(
      english,
      rawTafsir({
        "1:5": { text: "<p>Worship and help.</p>", ayah_keys: ["1:5", "1:6", "1:7"] },
        "1:6": "1:5",
        "1:7": "1:5",
        "2:1": { text: "<div class=ar lang=ar></div>" },
      }),
      { retrievedAt, warn: (message) => warnings.push(message) },
    );
    expect(file.surahs[0]!.map(({ from, to }) => [from, to])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 7]]);
    expect(file.surahs[0]![4]!.blocks).toEqual([{ type: "paragraph", text: "Worship and help." }]);
    expect(file.surahs[1]![0]!.from).toBe(2);
    expect(file.tafsir).toMatchObject({
      id: "en-ibn-kathir",
      author: "Ismail ibn Kathir",
      verseCount: 7 + 285,
      attribution: { sourceUrl: "https://qul.tarteel.ai/resources/tafsir/35" },
    });
    expect(warnings).toEqual([`en-ibn-kathir: ${6236 - 292} verses without commentary (1 with an empty text)`]);
  });

  it("rejects a pointer to a group that does not hold the verse, and a group across surahs", () => {
    const options = { retrievedAt, warn: () => {} };
    expect(() => toTafsirFile(english, rawTafsir({ "1:3": "1:2" }), options)).toThrow(/does not explain it/);
    expect(() =>
      toTafsirFile(english, rawTafsir({ "1:7": { text: "<p>x</p>", ayah_keys: ["1:7", "2:1"] }, "2:1": "1:7" }), options),
    ).toThrow(/not consecutive verses of one surah/);
  });

  it("rejects a file that is not a QUL tafsir", () => {
    expect(() => parseQulTafsir('{"1": { "text": "Al-Fatihah" }}')).toThrow(/Not a QUL tafsir file/);
  });
});

describe("buildTafsirFiles", () => {
  it("builds each tafsir then the catalog, keeping the published entry of a missing source", async () => {
    const [french] = QUL_TAFSIRS.filter((tafsir) => tafsir.id === "fr-mukhtasar");
    const kept = { ...toTafsirFile(french!, rawTafsir(), { retrievedAt, warn: () => {} }).tafsir };
    const files = await buildTafsirFiles(
      async (key) =>
        key === "qul/tafsirs/en-ibn-kathir.json" ? { text: JSON.stringify(rawTafsir()), modifiedAt: new Date(retrievedAt) } : undefined,
      { tafsirs: [english, french!], previous: [kept], log: () => {}, warn: () => {} },
    );
    expect(files.map((file) => file.key)).toEqual([contentKeys.quran.tafsir("en-ibn-kathir"), contentKeys.quran.tafsirs()]);
    const catalog = QuranTafsirsFileSchema.parse(files[1]!.data);
    expect(catalog.tafsirs.map((tafsir) => tafsir.id)).toEqual(["en-ibn-kathir", "fr-mukhtasar"]);
  });

  it("recognizes each downloaded file by its QUL name", () => {
    const names = [
      "ar-tafsir-ibn-kathir.json",
      "tafsir-ibn-abi-zamanin.json",
      "en-tafisr-ibn-kathir.json",
      "abridged-explanation-of-the-quran.json",
      "french-mokhtasar.json",
      "ru-tafsir-ibne-kahtir.json",
      "tafsir-as-saadi-russian.json",
      "russian-mokhtasar.json",
      "sq-saadi.json",
    ];
    expect(names.map((name) => QUL_TAFSIRS.filter((tafsir) => tafsir.file.test(name)).map((tafsir) => tafsir.id))).toEqual(
      QUL_TAFSIRS.map((tafsir) => [tafsir.id]),
    );
    expect(QUL_TAFSIRS.filter((tafsir) => tafsir.file.test("tr-tafsir-ibne-kathir.json"))).toEqual([]);
  });
});
