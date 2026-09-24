import { decodeHTML } from 'entities';

/**
 * sunnah.com editorial markup, e.g. `[quran sura="96" aya_start="1" aya_end="3"]` (left in API texts)
 * or `[narrator id="4698" …]…[/narrator]`. Closed list + `key="value"` attributes only, so that
 * translator notes in brackets ("[the Prophet]") are never touched.
 */
export const SUNNAH_MARKUP =
    /\[\/?(?:quran|narrator|prematn|matn|postmatn|place|name|verse|poem|commentary)(?:\s+[\w-]+="[^"]*")*\s*\]/g;

/**
 * sunnah.com HTML → plain text; paragraphs are separated by a blank line.
 * In HTML with `<p>`/`<br>`, source line breaks are formatting only; in plain text
 * (collection intros), they are the paragraphs.
 */
export function htmlToText(html: string): string {
    const structured = /<(p|br)\b/i.test(html);
    html = html.replace(SUNNAH_MARKUP, '');
    return decodeHTML(
        (structured ? html.replace(/\s+/g, ' ') : html.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' '))
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
            .replace(/<[^>]+>/g, ''),
    )
        .replace(/ /g, ' ')
        .split('\n')
        .map((line) => line.replace(/ {2,}/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const NARRATOR = /^(Narrated [^:\n]{1,200}:)\s*/;

/** Splits the leading `Narrated X:` line of an English hadith. */
export function splitNarrator(text: string): { narrator?: string; body: string } {
    const match = text.match(NARRATOR);
    if (!match?.[1] || match[0].length >= text.length) {
        return { body: text };
    }
    return { narrator: match[1], body: text.slice(match[0].length) };
}
