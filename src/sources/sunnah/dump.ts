import type { HadithSegment } from '@muslimreminder/schema/content';
import type { RawHadith } from './raw.ts';
import { htmlToText } from './text.ts';

/**
 * sunnah.com data snapshot (MySQL dump of `HadithTable`, https://sunnah.com/HadithTable.sql.gz).
 * Used to enrich the API: sanad/matan markup and records the API fails to serve.
 */
export type DumpRecord = {
    collection: string;
    bookNumber: string;
    chapterId: string;
    hadithNumber: string;
    arabicUrn: number;
    englishUrn: number;
    arabicText: string;
    englishText: string;
    arabicGrade: string;
    englishGrade: string;
};

export type SunnahDump = {
    byArabicUrn: Map<number, DumpRecord>;
    byBook: Map<string, DumpRecord[]>;
};

const bookKey = (collection: string, bookNumber: string) => `${collection}/${bookNumber}`;

/** Parses the dump. Columns are read from `CREATE TABLE`, so a reordering does not break it. */
export function parseHadithDump(sql: string): SunnahDump {
    const create = sql.match(/CREATE TABLE `HadithTable` \(([\s\S]*?)\n\)/);
    if (!create?.[1]) throw new Error('Not a HadithTable dump: CREATE TABLE `HadithTable` not found');
    const columns = [...create[1].matchAll(/^\s*`(\w+)`/gm)].map((match) => match[1]!);
    const index = (name: string) => {
        const i = columns.indexOf(name);
        if (i < 0) throw new Error(`HadithTable dump: missing column ${name}`);
        return i;
    };
    const col = {
        collection: index('collection'),
        bookNumber: index('bookNumber'),
        babID: index('babID'),
        hadithNumber: index('hadithNumber'),
        arabicURN: index('arabicURN'),
        englishURN: index('englishURN'),
        arabicText: index('arabicText'),
        englishText: index('englishText'),
        arabicgrade1: index('arabicgrade1'),
        englishgrade1: index('englishgrade1'),
    };

    const dump: SunnahDump = { byArabicUrn: new Map(), byBook: new Map() };
    for (const statement of sql.split('INSERT INTO `HadithTable` VALUES').slice(1)) {
        for (const row of parseValues(statement)) {
            const text = (i: number) => row[i] ?? '';
            const record: DumpRecord = {
                collection: text(col.collection),
                bookNumber: text(col.bookNumber),
                chapterId: text(col.babID),
                hadithNumber: text(col.hadithNumber),
                arabicUrn: Number(row[col.arabicURN]),
                englishUrn: Number(row[col.englishURN]),
                arabicText: text(col.arabicText),
                englishText: text(col.englishText),
                arabicGrade: text(col.arabicgrade1),
                englishGrade: text(col.englishgrade1),
            };
            dump.byArabicUrn.set(record.arabicUrn, record);
            const key = bookKey(record.collection, record.bookNumber);
            dump.byBook.set(key, [...(dump.byBook.get(key) ?? []), record]);
        }
    }
    if (dump.byArabicUrn.size === 0) throw new Error('HadithTable dump: no row found');
    return dump;
}

const ESCAPES: Record<string, string> = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };

/** `(a,'b',NULL),(…)` → rows of raw values (numbers kept as their source text). */
function* parseValues(statement: string): Generator<(string | null)[]> {
    const end = statement.indexOf(';\n');
    const s = end >= 0 ? statement.slice(0, end) : statement;
    let i = 0;
    while (i < s.length) {
        if (s[i] !== '(') {
            i++;
            continue;
        }
        i++;
        const row: (string | null)[] = [];
        for (;;) {
            if (s[i] === "'") {
                i++;
                let value = '';
                for (;;) {
                    const c = s[i]!;
                    if (c === '\\') {
                        const next = s[i + 1]!;
                        value += ESCAPES[next] ?? next;
                        i += 2;
                    } else if (c === "'" && s[i + 1] === "'") {
                        value += "'";
                        i += 2;
                    } else if (c === "'") {
                        i++;
                        break;
                    } else {
                        value += c;
                        i++;
                    }
                }
                row.push(value);
            } else {
                let j = i;
                while (s[j] !== ',' && s[j] !== ')') j++;
                const token = s.slice(i, j).trim();
                row.push(token === 'NULL' ? null : token);
                i = j;
            }
            if (s[i] === ',') {
                i++;
                continue;
            }
            i++; // ')'
            break;
        }
        yield row;
    }
}

const SEGMENT_TAGS: Record<string, HadithSegment['type']> = {
    prematn: 'sanad',
    matn: 'matan',
    // Text after the matan (other chains, compiler's remarks): displayed like the sanad.
    postmatn: 'sanad',
};
const START = '\u0001';
const END = '\u0002';

/** Arabic text without sunnah.com markup (`[narrator …]`, `[matn]`…). */
export function stripMarkup(text: string): string {
    return htmlToText(text);
}

/** `[prematn]…[/prematn][matn]…[/matn]` → sanad/matan segments; undefined without a matan. */
export function toSegments(markup: string): HadithSegment[] | undefined {
    if (!markup.includes('[matn]')) return undefined;
    const marked = markup
        .replace(/\[(prematn|matn|postmatn)\]/g, (_, tag: string) => `${START}${tag}${END}`)
        .replace(/\[\/(prematn|matn|postmatn)\]/g, `${START}${END}`);
    const text = htmlToText(marked);

    const segments: HadithSegment[] = [];
    let current: HadithSegment['type'] | undefined;
    for (const part of text.split(START)) {
        const close = part.indexOf(END);
        const tag = close >= 0 ? part.slice(0, close) : '';
        const content = (close >= 0 ? part.slice(close + 1) : part).trim();
        if (close >= 0) current = SEGMENT_TAGS[tag]; // opening tag, or '' for a closing one
        if (!content) continue;
        // Untagged text (punctuation…) sticks to the previous segment, or to the sanad at the start.
        const type = current ?? segments.at(-1)?.type ?? 'sanad';
        const last = segments.at(-1);
        if (last?.type === type) last.text += (/^[\p{P}\u200f]/u.test(content) ? '' : ' ') + content;
        else segments.push({ type, text: content });
    }
    return segments.some((segment) => segment.type === 'matan') ? segments : undefined;
}

const comparable = (text: string) => text.replace(/[\s‎‏]/g, '');

/** Segments only if they spell exactly the text we publish: never color a text that differs. */
export function segmentsFor(record: DumpRecord | undefined, publishedArabic: string): HadithSegment[] | undefined {
    if (!record) return undefined;
    const segments = toSegments(record.arabicText);
    if (!segments) return undefined;
    return comparable(segments.map((segment) => segment.text).join('')) === comparable(publishedArabic) ? segments : undefined;
}

/** A dump record in the API format, to recover a hadith the API fails to serve. */
export function toRawHadith(record: DumpRecord): RawHadith {
    const grades = (grade: string) => (grade.trim() ? [{ graded_by: null, grade }] : []);
    return {
        collection: record.collection,
        bookNumber: record.bookNumber,
        chapterId: record.chapterId,
        hadithNumber: record.hadithNumber,
        hadith: [
            { lang: 'en', chapterNumber: null, chapterTitle: null, urn: record.englishUrn, body: record.englishText, grades: grades(record.englishGrade) },
            { lang: 'ar', chapterNumber: null, chapterTitle: null, urn: record.arabicUrn, body: stripMarkup(record.arabicText), grades: grades(record.arabicGrade) },
        ],
    };
}

export const dumpBook = (dump: SunnahDump | undefined, collection: string, bookNumber: string) =>
    dump?.byBook.get(bookKey(collection, bookNumber)) ?? [];
