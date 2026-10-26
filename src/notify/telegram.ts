const TELEGRAM_API = 'https://api.telegram.org';
/** Telegram rejects messages longer than 4096 characters. */
const MAX_MESSAGE_LENGTH = 4096;

/** Where the shared Muslim Reminder bot posts: a chat, and optionally a forum topic of it. */
export type TelegramTarget = { token: string; chatId: string; topicId?: number };

/** The bot target from the environment, or undefined when the bot token or the chat are not configured. */
export function telegramTargetFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramTarget | undefined {
    const token = env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) return undefined;
    const topic = env.TELEGRAM_TOPIC_ID?.trim();
    // A mistyped topic would silently land in the General one: fail instead.
    if (topic && !/^\d+$/.test(topic)) throw new Error(`TELEGRAM_TOPIC_ID must be a topic id, got "${topic}"`);
    return { token, chatId, ...(topic && { topicId: Number(topic) }) };
}

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Joins lines into one message, dropping the last ones (with a "… N more" line) past Telegram's limit. */
export function joinWithinLimit(lines: string[], limit = MAX_MESSAGE_LENGTH): string {
    const text = lines.join('\n');
    if (text.length <= limit) return text;
    for (let kept = lines.length - 1; kept > 0; kept--) {
        const shortened = [...lines.slice(0, kept), `… ${lines.length - kept} more`].join('\n');
        if (shortened.length <= limit) return shortened;
    }
    return text.slice(0, limit);
}

/** Sends an HTML message. Throws on a Telegram error. */
export async function sendTelegram(target: TelegramTarget, html: string, fetchImpl: typeof fetch = fetch): Promise<void> {
    const response = await fetchImpl(`${TELEGRAM_API}/bot${target.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            chat_id: target.chatId,
            // Undefined keys are dropped by JSON.stringify: no topic, the General one.
            message_thread_id: target.topicId,
            text: html,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 500);
        throw new Error(`Telegram answered HTTP ${response.status}: ${detail}`);
    }
}
