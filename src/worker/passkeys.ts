import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createSession, requireAuth, requireRecentAuth, type AuthContext, type User } from './auth';
import { cookie, getCookie, HttpError, isRecord, json, readJson } from './http';
import { hash, networkKey, randomToken, rateLimit } from './security';

type Ceremony = { challenge: string; user_id: string | null; session_hash: string | null };
type PasskeyRow = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports_json: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
};
const CEREMONY_SECONDS = 300;

function fail(): HttpError {
  return new HttpError(400, 'The passkey could not be verified. Please try again.');
}

async function createCeremony(
  request: Request,
  env: Env,
  challenge: string,
  kind: 'login' | 'register',
  auth?: AuthContext,
): Promise<string> {
  const token = randomToken();
  const statements = [
    env.DB.prepare(
      `INSERT INTO ceremonies (token_hash, challenge, kind, user_id, session_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      await hash(token),
      challenge,
      kind,
      auth?.user.id ?? null,
      auth?.sessionHash ?? null,
      Date.now() + CEREMONY_SECONDS * 1000,
    ),
  ];
  const previous = getCookie(request, env, 'ceremony');
  if (previous)
    statements.push(
      env.DB.prepare('DELETE FROM ceremonies WHERE token_hash = ?').bind(await hash(previous)),
    );
  await env.DB.batch(statements);
  return cookie(env, 'ceremony', token, CEREMONY_SECONDS);
}

async function consumeCeremony(
  request: Request,
  env: Env,
  kind: 'login' | 'register',
): Promise<Ceremony> {
  const token = getCookie(request, env, 'ceremony');
  if (!token || !/^[\w-]{43}$/.test(token)) throw fail();
  const row = await env.DB.prepare(
    `DELETE FROM ceremonies WHERE token_hash = ? AND kind = ? AND expires_at > ?
    RETURNING challenge, user_id, session_hash`,
  )
    .bind(await hash(token), kind, Date.now())
    .first<Ceremony>();
  if (!row) throw fail();
  return row;
}

function credentialShape(
  value: unknown,
): value is Record<string, unknown> & { response: Record<string, unknown> } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length <= 2048 &&
    typeof value.rawId === 'string' &&
    value.type === 'public-key' &&
    isRecord(value.clientExtensionResults) &&
    isRecord(value.response) &&
    typeof value.response.clientDataJSON === 'string'
  );
}

function isAuthentication(value: unknown): value is AuthenticationResponseJSON {
  return (
    credentialShape(value) &&
    typeof value.response.authenticatorData === 'string' &&
    typeof value.response.signature === 'string'
  );
}

function isRegistration(value: unknown): value is RegistrationResponseJSON {
  return credentialShape(value) && typeof value.response.attestationObject === 'string';
}

export async function loginOptions(request: Request, env: Env): Promise<Response> {
  await rateLimit(env, `passkey:options:${networkKey(request)}`, 30, 10 * 60);
  const options = await generateAuthenticationOptions({
    rpID: new URL(env.APP_ORIGIN).hostname,
    userVerification: 'required',
    timeout: 60_000,
  });
  return json(options, 200, {
    'Set-Cookie': await createCeremony(request, env, options.challenge, 'login'),
  });
}

export async function loginVerify(request: Request, env: Env): Promise<Response> {
  await rateLimit(env, `passkey:verify:${networkKey(request)}`, 60, 10 * 60);
  const input = await readJson(request, 65_536);
  if (!isAuthentication(input.response)) throw fail();
  const challenge = await consumeCeremony(request, env, 'login');
  const passkey = await env.DB.prepare('SELECT * FROM passkeys WHERE id = ?')
    .bind(input.response.id)
    .first<PasskeyRow>();
  if (!passkey) throw fail();
  // A discoverable credential must identify the same account as the saved key.
  if (
    input.response.response.userHandle &&
    input.response.response.userHandle !== Buffer.from(passkey.user_id).toString('base64url')
  )
    throw fail();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: env.APP_ORIGIN,
      expectedRPID: new URL(env.APP_ORIGIN).hostname,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, 'base64url')),
        counter: passkey.counter,
      },
      requireUserVerification: true,
    });
  } catch {
    throw fail();
  }
  if (!verification.verified || !verification.authenticationInfo.userVerified) throw fail();
  const updated = await env.DB.prepare(
    `UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ? AND counter = ? RETURNING user_id`,
  )
    .bind(verification.authenticationInfo.newCounter, Date.now(), passkey.id, passkey.counter)
    .first<{ user_id: string }>();
  if (!updated) throw fail();
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(passkey.user_id)
    .first<User>();
  if (!user) throw fail();
  return createSession(request, env, user);
}

export async function registerOptions(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  requireRecentAuth(auth);
  const credentials = await env.DB.prepare('SELECT id FROM passkeys WHERE user_id = ?')
    .bind(auth.user.id)
    .all<{ id: string }>();
  if (credentials.results.length >= 10)
    throw new HttpError(400, 'You can save up to 10 passkeys. Remove an old one first.');
  await rateLimit(env, `passkey:register:${auth.user.id}`, 20, 10 * 60);
  const options = await generateRegistrationOptions({
    rpName: 'CW Academy Companion',
    rpID: new URL(env.APP_ORIGIN).hostname,
    userID: new TextEncoder().encode(auth.user.id),
    userName: auth.user.email,
    userDisplayName: auth.user.email,
    attestationType: 'none',
    // Explicit interoperable algorithms avoid experimental browser defaults.
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: credentials.results,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: 60_000,
  });
  return json(options, 200, {
    'Set-Cookie': await createCeremony(request, env, options.challenge, 'register', auth),
  });
}

export async function registerVerify(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  requireRecentAuth(auth);
  const input = await readJson(request, 65_536);
  if (!isRegistration(input.response)) throw fail();
  const challenge = await consumeCeremony(request, env, 'register');
  if (challenge.user_id !== auth.user.id || challenge.session_hash !== auth.sessionHash)
    throw fail();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: env.APP_ORIGIN,
      expectedRPID: new URL(env.APP_ORIGIN).hostname,
      requireUserVerification: true,
    });
  } catch {
    throw fail();
  }
  if (!verification.verified || !verification.registrationInfo?.userVerified) throw fail();
  const { credential } = verification.registrationInfo;
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
  const inserted = await env.DB.prepare(
    `INSERT INTO passkeys (id, user_id, public_key, counter, transports_json, name, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM passkeys WHERE user_id = ?) < 10
    ON CONFLICT(id) DO NOTHING RETURNING id`,
  )
    .bind(
      credential.id,
      auth.user.id,
      Buffer.from(credential.publicKey).toString('base64url'),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      name || 'My passkey',
      Date.now(),
      auth.user.id,
    )
    .first<{ id: string }>();
  if (!inserted)
    throw new HttpError(
      400,
      'This passkey is already registered, or your account has reached its passkey limit.',
    );
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(env, 'ceremony', '', 0) });
}

export async function listPasskeys(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const result = await env.DB.prepare(
    'SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(auth.user.id)
    .all<Pick<PasskeyRow, 'id' | 'name' | 'created_at' | 'last_used_at'>>();
  return json({
    passkeys: result.results.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: new Date(row.created_at).toISOString(),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    })),
  });
}

export async function deletePasskey(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  requireRecentAuth(auth);
  await env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?')
    .bind(id, auth.user.id)
    .run();
  return json({ ok: true });
}
