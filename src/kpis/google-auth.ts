import { sign } from 'node:crypto';

/** The fields of a Google service account JSON key that the token exchange needs. */
export type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string };

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** Exchanges a service account key for an OAuth access token (JWT bearer grant, no client library). */
export async function googleAccessToken(key: ServiceAccountKey, scopes: string[], fetchImpl: typeof fetch = fetch): Promise<string> {
    const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iss: key.client_email, scope: scopes.join(' '), aud: tokenUri, iat: now, exp: now + 3600 }));
    const signature = base64url(sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), key.private_key));

    const response = await fetchImpl(tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Google token exchange answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return ((await response.json()) as { access_token: string }).access_token;
}
