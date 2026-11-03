import { escapeHtml } from '../notify/telegram.ts';
import type { Platform, StoreRating, StoreReview } from './review.ts';

const PLATFORMS: Record<Platform, string> = { android: '🤖 Android', ios: '🍎 iOS' };

const numberFormat = new Intl.NumberFormat('fr-FR');
const averageFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const languageNames = new Intl.DisplayNames(['fr'], { type: 'language' });

/** "anglais", "portugais (Brésil)"… from a language like `en` or `pt_BR`. */
export function languageName(language: string): string {
    try {
        return languageNames.of(language.replace('_', '-')) ?? language;
    } catch {
        return language;
    }
}

const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));

/** The Telegram message (HTML) of a review: the review, its translation, then the overall rating of the app. */
export function formatReview(review: StoreReview, { edited, rating }: { edited?: boolean; rating?: StoreRating | undefined } = {}): string {
    const sections = [
        `${edited ? '✏️ <b>Avis modifié</b>' : '🆕 <b>Nouvel avis</b>'} · ${PLATFORMS[review.platform]}\n` +
            `${stars(review.rating)} ${review.rating}/5${review.author ? ` · ${escapeHtml(review.author)}` : ''}`,
        `« ${escapeHtml(review.text)} »`,
    ];
    if (review.translation) {
        const from = review.language ? ` (${languageName(review.language)})` : '';
        sections.push(`🇫🇷 <i>Traduction${escapeHtml(from)}</i>\n« ${escapeHtml(review.translation)} »`);
    }
    const details = [review.appVersion && (/^\d/.test(review.appVersion) ? `v${review.appVersion}` : review.appVersion), review.device, review.osVersion].filter(Boolean) as string[];
    if (details.length > 0) sections.push(`📱 ${escapeHtml(details.join(' · '))}`);
    if (rating) {
        sections.push(`⭐ <b>Note globale ${PLATFORMS[rating.platform]}</b> : ${averageFormat.format(rating.average)}/5 · ${numberFormat.format(rating.count)} notes`);
    }
    return sections.join('\n\n');
}
