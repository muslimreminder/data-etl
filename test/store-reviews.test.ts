import { describe, expect, it } from 'vitest';
import { formatReview, languageName } from '../src/reviews/message.ts';
import { listPlayReviews, parsePlayRating, toStoreReview, type ApiReview } from '../src/reviews/play.ts';
import { pruneSeen, unseenReviews, type StoreReview } from '../src/reviews/review.ts';

/** fr-FR formats with narrow and non-breaking spaces: compare with plain ones. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

const apiReview = (id: string, seconds: number, comment: Record<string, unknown> = {}): ApiReview => ({
    reviewId: id,
    authorName: 'Amina',
    comments: [{ userComment: { text: '\tGreat app', lastModified: { seconds: String(seconds) }, starRating: 5, reviewerLanguage: 'fr', ...comment } }],
});

const review = (id: string, updatedAt: string): StoreReview => ({ platform: 'android', id, rating: 5, text: 't', updatedAt });

describe('toStoreReview', () => {
    it('keeps what the user wrote and the translation apart', () => {
        const translated = apiReview('r1', 1_793_000_000, {
            text: '\tSuper appli',
            originalText: 'Great app',
            reviewerLanguage: 'en',
            appVersionName: '1.1.1',
            androidOsVersion: 34,
            deviceMetadata: { manufacturer: 'Samsung', productName: 'a51 (Galaxy A51)' },
        });
        expect(toStoreReview(translated)).toEqual({
            platform: 'android',
            id: 'r1',
            author: 'Amina',
            rating: 5,
            text: 'Great app',
            translation: 'Super appli',
            language: 'en',
            appVersion: '1.1.1',
            device: 'Samsung Galaxy A51',
            osVersion: 'Android 14',
            updatedAt: '2026-10-26T07:33:20.000Z',
        });
    });

    it('has no translation for a review already in French', () => {
        const review = toStoreReview(apiReview('r2', 1_793_000_000, { text: '\tTop', androidOsVersion: 99 }))!;
        expect(review).toMatchObject({ text: 'Top', osVersion: 'Android API 99' });
        expect(review.translation).toBeUndefined();
    });

    it('falls back to the version code, and does not double the brand', () => {
        const review = toStoreReview(
            apiReview('r4', 1, { appVersionName: 'صلي علي محمد', appVersionCode: 68, deviceMetadata: { manufacturer: 'Redmi', productName: 'fog (Redmi 10C)' } }),
        )!;
        expect(review).toMatchObject({ appVersion: 'build 68', device: 'Redmi 10C' });
        expect(formatReview(review)).toContain('📱 build 68 · Redmi 10C');
    });

    it('skips a review without a user comment', () => {
        expect(toStoreReview({ reviewId: 'r3', comments: [] })).toBeUndefined();
    });
});

it('lists every page of reviews, translated to French', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
        urls.push(url);
        return url.includes('token=p2')
            ? Response.json({ reviews: [apiReview('b', 2)] })
            : Response.json({ reviews: [apiReview('a', 1)], tokenPagination: { nextPageToken: 'p2' } });
    }) as unknown as typeof fetch;
    expect((await listPlayReviews('T', 'com.app', 'fr', fetchImpl)).map((r) => r.id)).toEqual(['a', 'b']);
    expect(urls[0]).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.app/reviews?translationLanguage=fr&maxResults=100');
});

it('throws the message of a Google error', async () => {
    const fetchImpl = (async () => Response.json({ error: { message: 'API disabled' } }, { status: 403 })) as unknown as typeof fetch;
    await expect(listPlayReviews('T', 'com.app', 'fr', fetchImpl)).rejects.toThrow('HTTP 403: API disabled');
});

describe('parsePlayRating', () => {
    it('keeps the rating with the most ratings, the overall one', () => {
        // As embedded in the store page: the phones' rating, then the overall one.
        const html =
            `data:[[[[]]],[null,null,[{"52":[["4,9",4.8586955],[null,["337",337],["0",0],["674",674],["1 687",1687],["28 347",28347]],["31 047",31047],["43",43],null]}]]` +
            `null,[["4,9",4.8601],[null,["343",343],["0",0],["687",687],["1 718",1718],["28 865",28865]],["31 615",31615],["43",43],null,[null,[]]],null`;
        expect(parsePlayRating(html)).toEqual({ average: 4.8601, count: 31615 });
    });

    it('is undefined on a page without a rating', () => {
        expect(parsePlayRating('<html></html>')).toBeUndefined();
    });
});

describe('seen reviews', () => {
    it('keeps the new and edited reviews, oldest first', () => {
        const reviews = [review('c', '2026-11-03T10:00:00Z'), review('a', '2026-11-01T10:00:00Z'), review('b', '2026-11-02T10:00:00Z')];
        const seen = { 'android:a': '2026-11-01T10:00:00Z', 'android:b': '2026-11-01T09:00:00Z' };
        expect(unseenReviews(reviews, seen).map((r) => r.id)).toEqual(['b', 'c']);
    });

    it('forgets the old ones', () => {
        const seen = { 'android:old': '2026-08-01T00:00:00Z', 'android:new': '2026-11-01T00:00:00Z' };
        expect(pruneSeen(seen, new Date('2026-11-03T00:00:00Z'))).toEqual({ 'android:new': '2026-11-01T00:00:00Z' });
    });
});

describe('formatReview', () => {
    it('shows the review, its translation, the device and the overall rating', () => {
        const message = formatReview(
            { ...review('r', '2026-11-03T10:00:00Z'), author: 'A <b>', rating: 4, text: 'Great & simple', translation: 'Super et simple', language: 'en', appVersion: '1.1.1', device: 'Samsung Galaxy A51', osVersion: 'Android 14' },
            { rating: { platform: 'android', average: 4.8601, count: 31615 } },
        );
        expect(plain(message)).toBe(
            [
                '🆕 <b>Nouvel avis</b> · 🤖 Android',
                '★★★★☆ 4/5 · A &lt;b&gt;',
                '',
                '« Great &amp; simple »',
                '',
                '🇫🇷 <i>Traduction (anglais)</i>',
                '« Super et simple »',
                '',
                '📱 v1.1.1 · Samsung Galaxy A51 · Android 14',
                '',
                '⭐ <b>Note globale 🤖 Android</b> : 4,86/5 · 31 615 notes',
            ].join('\n'),
        );
    });

    it('marks an edited review, without translation nor rating', () => {
        const message = formatReview({ ...review('r', '2026-11-03T10:00:00Z'), rating: 1 }, { edited: true });
        expect(message).toBe('✏️ <b>Avis modifié</b> · 🤖 Android\n★☆☆☆☆ 1/5\n\n« t »');
    });

    it('names the languages in French', () => {
        expect(languageName('pt_BR')).toBe('portugais brésilien');
        expect(languageName('??')).toBe('??');
    });
});
