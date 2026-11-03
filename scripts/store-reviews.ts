// Posts the new reviews of the app on Telegram, one message each: the review, its French translation when it is in
// another language, and the overall rating of the app on its store. Google Play only for now (the App Store later).
// The reviews already posted are kept in the sources bucket; the first run only records the existing ones.
//
//   GOOGLE_PLAY_SA_JSON=<key> npm run store-reviews -- [--dry-run]
//
// GOOGLE_PLAY_SA_JSON: JSON key of a service account invited in Play Console with "Reply to reviews" on the app, its
// Google Cloud project having the Google Play Android Developer API enabled. Env: PLAY_PACKAGE_NAME, for Telegram
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_TOPIC_ID, and for R2 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_SOURCES_BUCKET (default muslimreminder-sources).
// --dry-run prints the messages instead of posting them and records nothing; without R2, it prints the last 3 reviews.
// Without --dry-run, prints no review (the repo is public).
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { googleAccessToken, type ServiceAccountKey } from '../src/kpis/google-auth.ts';
import { sendTelegram, telegramTargetFromEnv } from '../src/notify/telegram.ts';
import { R2Storage } from '../src/publish/storage.ts';
import { formatReview } from '../src/reviews/message.ts';
import { fetchPlayRating, listPlayReviews, REVIEWS_SCOPES } from '../src/reviews/play.ts';
import { pruneSeen, reviewKey, unseenReviews, type SeenReviews, type StoreRating } from '../src/reviews/review.ts';

const SEEN_KEY = 'reviews/seen.json';

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });
const dryRun = values['dry-run'];

const requireEnv = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`Missing environment variable ${name}`);
        process.exit(1);
    }
    return value;
};

const key = JSON.parse(requireEnv('GOOGLE_PLAY_SA_JSON')) as ServiceAccountKey;
const packageName = process.env.PLAY_PACKAGE_NAME?.trim() || 'com.mga5.buttontocount';
const telegram = dryRun ? undefined : telegramTargetFromEnv();
if (!dryRun && !telegram) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID (or pass --dry-run)');
    process.exit(1);
}
const sources =
    dryRun && !process.env.R2_ACCOUNT_ID
        ? undefined
        : new R2Storage({
              accountId: requireEnv('R2_ACCOUNT_ID'),
              accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
              secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
              bucket: process.env.R2_SOURCES_BUCKET?.trim() || 'muslimreminder-sources',
          });

const reviews = await listPlayReviews(await googleAccessToken(key, REVIEWS_SCOPES), packageName);
const stored = await sources?.get(SEEN_KEY);
const seen: SeenReviews = stored ? JSON.parse(stored) : {};

if (stored === undefined && !dryRun) {
    for (const review of reviews) seen[reviewKey(review)] = review.updatedAt;
    await sources!.put(SEEN_KEY, `${JSON.stringify(seen, null, 2)}\n`, { cacheControl: 'no-store' });
    console.log(`First run: ${reviews.length} existing reviews recorded, none posted`);
    process.exit(0);
}

const unseen = unseenReviews(reviews, seen);
const toPost = stored === undefined ? unseen.slice(-3) : unseen;
console.log(`${reviews.length} reviews listed, ${toPost.length} to post`);

let rating: StoreRating | undefined;
let ratingError: string | undefined;
if (toPost.length > 0) {
    try {
        rating = await fetchPlayRating(packageName);
    } catch (error) {
        // The review matters more than the rating: post it without.
        ratingError = (error as Error).message;
        console.error(`⚠️ Overall rating: ${ratingError}`);
    }
}

try {
    for (const [index, review] of toPost.entries()) {
        const message = formatReview(review, { edited: reviewKey(review) in seen, rating });
        if (telegram) {
            // Telegram allows about 20 messages a minute in a group.
            if (index > 0) await sleep(3_000);
            await sendTelegram(telegram, message);
        } else {
            console.log(`${message}\n${'─'.repeat(40)}`);
        }
        seen[reviewKey(review)] = review.updatedAt;
    }
} finally {
    // Recorded even when a message failed, so that the posted ones are not posted again.
    if (!dryRun && toPost.length > 0) {
        await sources!.put(SEEN_KEY, `${JSON.stringify(pruneSeen(seen, new Date()), null, 2)}\n`, { cacheControl: 'no-store' });
    }
}
if (telegram && toPost.length > 0) console.log(`Posted ${toPost.length} reviews on Telegram`);
if (ratingError) process.exit(1);
