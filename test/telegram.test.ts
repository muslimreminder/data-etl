import { describe, expect, it } from 'vitest';
import { escapeHtml, joinWithinLimit, sendTelegram, telegramTargetFromEnv } from '../src/notify/telegram.ts';

describe('telegramTargetFromEnv', () => {
    it('needs the bot token and the chat', () => {
        expect(telegramTargetFromEnv({ TELEGRAM_BOT_TOKEN: 't' })).toBeUndefined();
        expect(telegramTargetFromEnv({ TELEGRAM_CHAT_ID: '-1' })).toBeUndefined();
        expect(telegramTargetFromEnv({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '-1', TELEGRAM_TOPIC_ID: '' })).toEqual({ token: 't', chatId: '-1' });
        expect(telegramTargetFromEnv({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '-1', TELEGRAM_TOPIC_ID: '4' })).toEqual({ token: 't', chatId: '-1', topicId: 4 });
    });
});

describe('joinWithinLimit', () => {
    it('keeps short messages whole', () => {
        expect(joinWithinLimit(['a', 'b'])).toBe('a\nb');
    });

    it('drops the last lines past the limit', () => {
        expect(joinWithinLimit(['title', 'aaaaaa', 'bbbbbb', 'cccccc'], 22)).toBe('title\naaaaaa\n… 2 more');
    });
});

it('escapes HTML', () => {
    expect(escapeHtml('Tafsir <Ibn> "Kathir" & co')).toBe('Tafsir &lt;Ibn&gt; &quot;Kathir&quot; &amp; co');
});

describe('sendTelegram', () => {
    it('posts to the chat, in the topic when there is one', async () => {
        const calls: { url: string; body: Record<string, unknown> }[] = [];
        const fetchImpl = (async (url: string, init: RequestInit) => {
            calls.push({ url, body: JSON.parse(init.body as string) });
            return new Response('{"ok":true}');
        }) as unknown as typeof fetch;
        await sendTelegram({ token: 'T', chatId: '-1' }, 'hi', fetchImpl);
        await sendTelegram({ token: 'T', chatId: '-1', topicId: 7 }, 'hi', fetchImpl);
        expect(calls[0]!.url).toBe('https://api.telegram.org/botT/sendMessage');
        expect(calls[0]!.body).not.toHaveProperty('message_thread_id');
        expect(calls[1]!.body).toMatchObject({ chat_id: '-1', message_thread_id: 7, text: 'hi', parse_mode: 'HTML' });
    });

    it('throws on a Telegram error', async () => {
        const fetchImpl = (async () => new Response('chat not found', { status: 400 })) as unknown as typeof fetch;
        await expect(sendTelegram({ token: 'T', chatId: '-1' }, 'hi', fetchImpl)).rejects.toThrow('HTTP 400: chat not found');
    });
});
