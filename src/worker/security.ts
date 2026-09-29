import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './http';

export function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

export function randomCode(): string {
  // Rejection sampling avoids a biased remainder when choosing six digits.
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= 4_294_000_000);
  return String(buffer[0] % 1_000_000).padStart(6, '0');
}

export async function hash(value: string): Promise<string> {
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  ).toString('hex');
}

export async function privateHash(env: Env, value: string): Promise<string> {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)
    throw new HttpError(503, 'Sign-in is temporarily unavailable.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Buffer.from(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  ).toString('hex');
}

export function equalHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function rateLimit(
  env: Env,
  key: string,
  maximum: number,
  windowSeconds: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const keyHash = await privateHash(env, `rate:${key}`);
  const row = await env.DB.prepare(
    `
    INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= ? THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING count
  `,
  )
    .bind(keyHash, now + windowSeconds, now, now)
    .first<{ count: number }>();
  if (!row || row.count > maximum)
    throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}

export function networkKey(request: Request): string {
  // Cloudflare sets this header at the edge; never trust X-Forwarded-For.
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}
