import { describe, expect, it } from 'vitest';
import { htmlToText, splitNarrator } from '../src/sources/sunnah/text.ts';

describe('htmlToText', () => {
    it('turns paragraphs and line breaks into plain text', () => {
        expect(htmlToText('<p>First \n paragraph</p>\n<p>Second<br/>line</p>')).toBe('First paragraph\n\nSecond\nline');
    });

    it('decodes entities and strips inline tags', () => {
        expect(htmlToText('He said, &quot;<b>Allah</b> is Greater&quot; &amp; smiled&nbsp;.')).toBe('He said, "Allah is Greater" & smiled .');
    });

    it('keeps Arabic text intact', () => {
        const ar = 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
        expect(htmlToText(`<p>${ar}</p>`)).toBe(ar);
    });
});

describe('splitNarrator', () => {
    it('extracts the narrator line', () => {
        expect(splitNarrator("Narrated 'Umar:\n\nI heard...")).toEqual({ narrator: "Narrated 'Umar:", body: 'I heard...' });
    });

    it('leaves other texts untouched', () => {
        expect(splitNarrator('Abu Huraira reported: ...')).toEqual({ body: 'Abu Huraira reported: ...' });
        expect(splitNarrator('Narrated Aisha:')).toEqual({ body: 'Narrated Aisha:' });
    });
});

describe('htmlToText on plain text', () => {
    it('keeps the paragraphs of texts without <p>', () => {
        expect(htmlToText('First <i>one</i>.\r\n\r\nSecond\r\n\r\n\r\nThird')).toBe('First one.\n\nSecond\n\nThird');
    });
});
