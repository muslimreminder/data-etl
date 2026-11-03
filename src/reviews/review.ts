// A store review, whatever the store: the Google Play reviews today, the App Store ones later.

export type Platform = 'android' | 'ios';

export type StoreReview = {
    platform: Platform;
    /** Unique within its platform. */
    id: string;
    author?: string;
    /** 1 to 5. */
    rating: number;
    /** What the user wrote, in their language. */
    text: string;
    /** The language of the review, e.g. `en` or `pt_BR`. */
    language?: string;
    /** The text translated to French by the store, when the review is in another language. */
    translation?: string;
    appVersion?: string;
    device?: string;
    osVersion?: string;
    /** When the review was written or last edited, ISO. */
    updatedAt: string;
};

/** The overall rating of the app on a store. */
export type StoreRating = { platform: Platform; average: number; count: number };

/** Reviews already posted, by `<platform>:<id>`, with the `updatedAt` they were posted at. */
export type SeenReviews = Record<string, string>;

export const reviewKey = (review: Pick<StoreReview, 'platform' | 'id'>) => `${review.platform}:${review.id}`;

/** The reviews that are new, or edited since they were posted, oldest first. */
export const unseenReviews = (reviews: StoreReview[], seen: SeenReviews) =>
    reviews.filter((review) => seen[reviewKey(review)] !== review.updatedAt).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

/**
 * Drops the reviews older than `days`: the stores only list the recent ones (a week for Google Play), so they can no
 * longer come back as new.
 */
export function pruneSeen(seen: SeenReviews, now: Date, days = 60): SeenReviews {
    const limit = new Date(now.getTime() - days * 86_400_000).toISOString();
    return Object.fromEntries(Object.entries(seen).filter(([, updatedAt]) => updatedAt >= limit));
}
