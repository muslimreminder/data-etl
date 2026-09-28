import { contentKeys, QuranSurahInfosFileSchema } from "@muslimreminder/schema/content";
import { describe, expect, it } from "vitest";
import {
  buildSurahInfoFiles,
  htmlToBlocks,
  parseQulSurahInfos,
  QUL_SURAH_INFOS,
  toSurahInfoFile,
  type RawQulSurahInfos,
} from "../src/sources/qul/surah-infos.ts";

const english = QUL_SURAH_INFOS.find((info) => info.id === "en-maududi")!;
const long = (label: string) => `${label} `.repeat(40).trim();

/** Every surah with a long enough introduction, with `overrides` on top. */
const rawInfos = (overrides: RawQulSurahInfos = {}): RawQulSurahInfos => ({
  ...Object.fromEntries(
    Array.from({ length: 114 }, (_, index) => [
      String(index + 1),
      { text: `<p>${long(`Surah ${index + 1}`)}</p>`, short_text: "None" },
    ]),
  ),
  ...overrides,
});

describe("htmlToBlocks", () => {
  it("keeps headings, paragraphs and lists as plain text", () => {
    expect(
      htmlToBlocks(
        '<h2>Name</h2><p>Named after <em>the Cow</em> (<a href="/2/67-73">67-73</a>).</p>' +
          "<ol><li>At Makkah,<p>the Quraish.</p></li><li>At Madinah</li></ol><p>Then&nbsp;more.</p>",
      ),
    ).toEqual([
      { type: "heading", text: "Name" },
      { type: "paragraph", text: "Named after the Cow (67-73)." },
      { type: "list", ordered: true, items: ["At Makkah, the Quraish.", "At Madinah"] },
      { type: "paragraph", text: "Then more." },
    ]);
  });

  it("splits loose text and <br> into paragraphs, and drops footnote calls", () => {
    expect(
      htmlToBlocks('<p><h2>Name:</h2> First\r\n line.<br><br>Second<sup class="f-noteno">N12</sup> line.</p><ul><li></li></ul>'),
    ).toEqual([
      { type: "heading", text: "Name:" },
      { type: "paragraph", text: "First line." },
      { type: "paragraph", text: "Second line." },
    ]);
  });
});

describe("toSurahInfoFile", () => {
  it("publishes null for a missing or too short introduction, and ignores a \"None\" summary", () => {
    const warnings: string[] = [];
    const file = toSurahInfoFile(
      english,
      rawInfos({
        "1": { text: `<p>${long("Opening")}</p>`, short_text: " The opening. " },
        "13": { text: "<p>Vedi Appendice 1.</p>", short_text: "None" },
        "114": { text: null },
      }),
      { retrievedAt: "2026-09-28T08:00:00.000Z", warn: (message) => warnings.push(message) },
    );
    expect(file.surahs[0]).toEqual({ summary: "The opening.", blocks: [{ type: "paragraph", text: long("Opening") }] });
    expect(file.surahs[1]).toEqual({ blocks: [{ type: "paragraph", text: long("Surah 2") }] });
    expect(file.surahs[12]).toBeNull();
    expect(file.surahs[113]).toBeNull();
    expect(file.info).toMatchObject({
      id: "en-maududi",
      language: "en",
      surahCount: 112,
      attribution: { sourceUrl: "https://qul.tarteel.ai/resources/surah-info/3" },
    });
    expect(warnings).toEqual(["en-maududi: no usable introduction for surah(s) 13, 114"]);
  });

  it("rejects a file that is not a QUL surah info", () => {
    expect(() => parseQulSurahInfos('{"1:1": "In the name"}')).toThrow(/Not a QUL surah info file/);
  });
});

describe("buildSurahInfoFiles", () => {
  it("builds each language then the catalog, keeping the published entry of a missing source", async () => {
    const [urdu] = QUL_SURAH_INFOS.filter((info) => info.id === "ur-maududi");
    const kept = { ...toSurahInfoFile(urdu!, rawInfos(), { retrievedAt: "2026-09-01T00:00:00.000Z", warn: () => {} }).info };
    const files = await buildSurahInfoFiles(
      async (key) =>
        key === "qul/surah-infos/en-maududi.json"
          ? { text: JSON.stringify(rawInfos()), modifiedAt: new Date("2026-09-28T08:00:00.000Z") }
          : undefined,
      { infos: [english, urdu!], previous: [kept], log: () => {}, warn: () => {} },
    );
    expect(files.map((file) => file.key)).toEqual([
      contentKeys.quran.surahInfo("en-maududi"),
      contentKeys.quran.surahInfos(),
    ]);
    const catalog = QuranSurahInfosFileSchema.parse(files[1]!.data);
    expect(catalog.infos.map((info) => info.id)).toEqual(["en-maududi", "ur-maududi"]);
  });
});
