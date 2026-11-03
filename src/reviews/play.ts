// The Google Play reviews of an app (Google Play Developer API), and its overall rating (the public store page: the
// API does not give it). The API only lists the reviews of the last week that have a text, translated to French by
// Google when asked.
import type { StoreRating, StoreReview } from './review.ts';

export const REVIEWS_SCOPES = ['https://www.googleapis.com/auth/androidpublisher'];

const PUBLISHER_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

type UserComment = {
    text?: string;
    originalText?: string;
    lastModified?: { seconds: string; nanos?: number };
    starRating?: number;
    reviewerLanguage?: string;
    device?: string;
    androidOsVersion?: number;
    appVersionName?: string;
    deviceMetadata?: { productName?: string; manufacturer?: string };
};
export type ApiReview = { reviewId: string; authorName?: string; comments?: { userComment?: UserComment }[] };

/** Android versions by API level, as users know them. */
const ANDROID_VERSIONS: Record<number, string> = {
    21: '5.0', 22: '5.1', 23: '6', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9', 29: '10',
    30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16',
};

/** The review of an API answer, undefined for one without a user comment. */
export function toStoreReview({ reviewId, authorName, comments }: ApiReview): StoreReview | undefined {
    const comment = comments?.find((c) => c.userComment)?.userComment;
    if (!comment?.lastModified) return undefined;
    // Google prefixes texts with a tab.
    const text = comment.text?.trim() ?? '';
    const original = comment.originalText?.trim();
    const { productName, manufacturer } = comment.deviceMetadata ?? {};
    // productName reads "a51 (Galaxy A51)": keep the commercial name.
    const model = productName?.match(/\((.+)\)$/)?.[1] ?? productName ?? comment.device;
    const level = comment.androidOsVersion;
    return {
        platform: 'android',
        id: reviewId,
        ...(authorName?.trim() && { author: authorName.trim() }),
        rating: comment.starRating ?? 0,
        // With translationLanguage, `text` is the translation and `originalText` what the user wrote.
        text: original || text,
        ...(original && original !== text && { translation: text }),
        ...(comment.reviewerLanguage && { language: comment.reviewerLanguage }),
        ...(comment.appVersionName && { appVersion: comment.appVersionName }),
        ...(model && { device: [manufacturer, model].filter(Boolean).join(' ') }),
        ...(level && { osVersion: `Android ${ANDROID_VERSIONS[level] ?? `API ${level}`}` }),
        updatedAt: new Date(Number(comment.lastModified.seconds) * 1000).toISOString(),
    };
}

/** All the reviews the API lists (the last week), translated to `language`. */
export async function listPlayReviews(accessToken: string, packageName: string, language = 'fr', fetchImpl: typeof fetch = fetch): Promise<StoreReview[]> {
    const reviews: StoreReview[] = [];
    let token: string | undefined;
    do {
        const query = new URLSearchParams({ translationLanguage: language, maxResults: '100', ...(token && { token }) });
        const response = await fetchImpl(`${PUBLISHER_API}/applications/${packageName}/reviews?${query}`, {
            headers: { authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
            const text = await response.text();
            let detail = text;
            try {
                detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
            } catch {}
            throw new Error(`Google Play answered HTTP ${response.status}: ${detail.slice(0, 300)}`);
        }
        const page = (await response.json()) as { reviews?: ApiReview[]; tokenPagination?: { nextPageToken?: string } };
        reviews.push(...(page.reviews ?? []).flatMap((review) => toStoreReview(review) ?? []));
        token = page.tokenPagination?.nextPageToken;
    } while (token);
    return reviews;
}

/**
 * The overall rating on the store page. The page embeds it as `[["4,9",4.8586955],[null,<5 star counts>],["31 615",31615]`
 * once per form factor (phones, then all devices): the one with the most ratings is the overall one.
 */
export function parsePlayRating(html: string): Omit<StoreRating, 'platform'> | undefined {
    const pattern = /\[\["[^"]*",(\d(?:\.\d+)?)\],\[null,(?:\["[^"]*",\d+\],?){5}\],\["[^"]*",(\d+)\]/g;
    const ratings = [...html.matchAll(pattern)].map((match) => ({ average: Number(match[1]), count: Number(match[2]) }));
    return ratings.sort((a, b) => b.count - a.count)[0];
}

export async function fetchPlayRating(packageName: string, fetchImpl: typeof fetch = fetch): Promise<StoreRating> {
    const response = await fetchImpl(`https://play.google.com/store/apps/details?id=${packageName}&hl=fr&gl=FR`, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`play.google.com answered HTTP ${response.status}`);
    const rating = parsePlayRating(await response.text());
    if (!rating) throw new Error('no rating found on the Play Store page, has its layout changed?');
    return { platform: 'android', ...rating };
}
