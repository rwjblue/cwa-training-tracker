import { DEFAULT_PROFILE, validateProfile } from '../shared/training';
import { cookie, getCookie, HttpError, json, readJson } from './http';
import {
  equalHash,
  hash,
  networkKey,
  privateHash,
  randomCode,
  randomToken,
  rateLimit,
} from './security';

export const CODE_LIFETIME_SECONDS = 300;
export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export type User = { id: string; email: string };
export type AuthContext = { user: User; sessionHash: string; createdAt: number };

export async function getAuth(request: Request, env: Env): Promise<AuthContext | null> {
  const token = getCookie(request, env, 'session');
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  const sessionHash = await hash(token);
  const row = await env.DB.prepare(
    `
    SELECT users.id, users.email, sessions.created_at FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `,
  )
    .bind(sessionHash, Date.now())
    .first<User & { created_at: number }>();
  return row
    ? { user: { id: row.id, email: row.email }, sessionHash, createdAt: row.created_at }
    : null;
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext> {
  const auth = await getAuth(request, env);
  if (!auth) throw new HttpError(401, 'Sign in to continue.');
  const accountId = request.headers.get('X-CWA-Account');
  if (accountId !== null && accountId !== auth.user.id)
    throw new HttpError(
      409,
      'This request belongs to a different account. Sign in to that account to retry.',
      { code: 'account_changed' },
    );
  return auth;
}

export function requireRecentAuth(auth: AuthContext): void {
  if (Date.now() - auth.createdAt > 10 * 60 * 1000) {
    throw new HttpError(403, 'Please sign in again before changing your passkeys.');
  }
}

export async function createSession(request: Request, env: Env, user: User): Promise<Response> {
  const token = randomToken();
  const tokenHash = await hash(token);
  const prior = getCookie(request, env, 'session');
  const now = Date.now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).bind(tokenHash, user.id, now, now + SESSION_LIFETIME_SECONDS * 1000),
  ];
  if (prior)
    statements.push(
      env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(prior)),
    );
  // Bound the number of devices retaining access while preserving the newest.
  statements.push(
    env.DB.prepare(
      `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN
    (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20)`,
    ).bind(user.id, user.id),
  );
  await env.DB.batch(statements);
  const response = json({ user });
  response.headers.append('Set-Cookie', cookie(env, 'session', token, SESSION_LIFETIME_SECONDS));
  response.headers.append('Set-Cookie', cookie(env, 'email', '', 0));
  response.headers.append('Set-Cookie', cookie(env, 'ceremony', '', 0));
  return response;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

export async function requestEmailCode(request: Request, env: Env): Promise<Response> {
  const input = await readJson(request);
  const email = normalizeEmail(input.email);
  await rateLimit(env, `email:ip:${networkKey(request)}`, 20, 15 * 60);
  await rateLimit(env, `email:address:${email}`, 5, 15 * 60);
  await rateLimit(env, `email:cooldown:${email}`, 1, 60);
  const token = randomToken();
  const tokenHash = await hash(token);
  const code = randomCode();
  const codeHash = await privateHash(env, `code:${tokenHash}:${email}:${code}`);
  const previous = getCookie(request, env, 'email');
  const statements = [
    env.DB.prepare(
      `INSERT INTO email_codes (token_hash, email, code_hash, expires_at) VALUES (?, ?, ?, ?)`,
    ).bind(tokenHash, email, codeHash, Date.now() + CODE_LIFETIME_SECONDS * 1000),
  ];
  if (previous)
    statements.push(
      env.DB.prepare('DELETE FROM email_codes WHERE token_hash = ?').bind(await hash(previous)),
    );
  await env.DB.batch(statements);
  try {
    await env.EMAIL.send({
      to: email,
      from: { email: env.EMAIL_FROM, name: 'CW Academy Companion' },
      subject: 'Your training tracker sign-in code',
      text: `Your sign-in code is ${code}.\n\nEnter it in the browser where you requested it at ${env.APP_ORIGIN}. It expires in 5 minutes and can be used once.\n\nIf you did not request this code, you can ignore this email. Never share this code.\n\n73,\nCW Academy Companion\nAn independent community tool, not affiliated with CWops.`,
      html: `<p>Your sign-in code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>Enter it in the browser where you requested it at ${env.APP_ORIGIN}. It expires in <strong>5 minutes</strong> and can be used once.</p><p>If you did not request this code, you can ignore this email. Never share this code.</p><p>73,<br>CW Academy Companion<br>An independent community tool, not affiliated with CWops.</p>`,
    });
  } catch {
    await env.DB.prepare('DELETE FROM email_codes WHERE token_hash = ?').bind(tokenHash).run();
    // Never include provider errors, email addresses, or authentication secrets in logs.
    console.error(JSON.stringify({ event: 'email_delivery_failed' }));
    throw new HttpError(503, 'We could not send your code. Please try again in a minute.');
  }
  return json({ ok: true, expiresIn: CODE_LIFETIME_SECONDS }, 200, {
    'Set-Cookie': cookie(env, 'email', token, CODE_LIFETIME_SECONDS),
  });
}

export async function verifyEmailCode(request: Request, env: Env): Promise<Response> {
  const input = await readJson(request);
  const email = normalizeEmail(input.email);
  const failure = () =>
    new HttpError(400, 'That code is invalid or expired. Request a new code and try again.');
  await rateLimit(env, `verify:ip:${networkKey(request)}`, 60, 15 * 60);
  const token = getCookie(request, env, 'email');
  if (
    !token ||
    !/^[\w-]{43}$/.test(token) ||
    typeof input.code !== 'string' ||
    !/^\d{6}$/.test(input.code)
  )
    throw failure();
  const tokenHash = await hash(token);
  // Reserve an attempt atomically, including when several requests race.
  const row = await env.DB.prepare(
    `UPDATE email_codes SET attempts = attempts + 1
    WHERE token_hash = ? AND email = ? AND expires_at > ? AND attempts < 5
    RETURNING code_hash`,
  )
    .bind(tokenHash, email, Date.now())
    .first<{ code_hash: string }>();
  if (!row) throw failure();
  const candidate = await privateHash(env, `code:${tokenHash}:${email}:${input.code}`);
  if (!equalHash(candidate, row.code_hash)) throw failure();
  // A second concurrent request cannot consume the same successful challenge.
  const consumed = await env.DB.prepare(
    `DELETE FROM email_codes WHERE token_hash = ? AND expires_at > ? RETURNING email`,
  )
    .bind(tokenHash, Date.now())
    .first<{ email: string }>();
  if (!consumed) throw failure();
  const id = crypto.randomUUID();
  let initialProfile = DEFAULT_PROFILE;
  if (typeof input.timezone === 'string') {
    try {
      initialProfile = validateProfile({ ...DEFAULT_PROFILE, timezone: input.timezone });
    } catch {
      /* An unsupported browser timezone falls back to UTC. */
    }
  }
  await env.DB.prepare(
    `INSERT INTO users (id, email, created_at, profile_json) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO NOTHING`,
  )
    .bind(id, email, Date.now(), JSON.stringify(initialProfile))
    .run();
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?')
    .bind(email)
    .first<User>();
  if (!user) throw new HttpError(503, 'Sign-in is temporarily unavailable.');
  return createSession(request, env, user);
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, env, 'session');
  if (token)
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await hash(token))
      .run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(env, 'session', '', 0) });
}
