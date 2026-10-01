import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import {
  DEFAULT_PROFILE,
  getPracticePurpose,
  summarizePractice,
  type PracticeSession,
  type TrainingExport,
} from '../shared/training';
import { dailyPlanSummary, type PlannedTask } from '../shared/plan';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';
import { getAuth } from './auth';
import { getAccountSnapshot } from './account-sync';
import type { AccountChange, AccountOperation, AccountSnapshot } from '../shared/account-sync';
import {
  hashLifecyclePayload,
  type AccountLifecycleBackup,
  type LifecycleIdentity,
  type LifecycleResult,
} from '../shared/account-lifecycle';
import {
  GeneratedListeningCollector,
  type GeneratedListeningSummary,
} from '../shared/generated-listening';

// Run production SQL against SQLite, including D1's transactional batch behavior.
// The cast bridges only the D1 transport API; SQL and schema are not mocked.
class SQLiteDatabase {
  sqlite = new DatabaseSync(':memory:');
  private batches: Promise<void> = Promise.resolve();
  constructor() {
    const directory = new URL('../../migrations/', import.meta.url);
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      this.sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
  }
  prepare(sql: string) {
    return new SQLiteStatement(this.sqlite, sql);
  }
  async batch(statements: SQLiteStatement[]) {
    // One SQLite connection serializes transactions, as D1 does for these batches.
    const previous = this.batches;
    let release!: () => void;
    this.batches = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }
  withSession(): never {
    throw new Error('Session API is not used by this worker.');
  }
  async dump(): Promise<ArrayBuffer> {
    throw new Error('Dump API is not used by this worker.');
  }
}

class SQLiteStatement {
  values: SQLInputValue[] = [];
  constructor(
    private sqlite: DatabaseSync,
    readonly sql: string,
  ) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.values);
    return (row ? (column ? row[column] : row) : null) as T | null;
  }
  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const before = Number(this.sqlite.prepare('SELECT total_changes() AS count').get()?.count ?? 0);
    const results = this.sqlite.prepare(this.sql).all(...this.values);
    // D1 reports total changes, including writes performed inside triggers.
    const changes =
      Number(this.sqlite.prepare('SELECT total_changes() AS count').get()?.count ?? 0) - before;
    return {
      results: results as T[],
      success: true,
      meta: {
        changes: Number(changes),
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
      },
    };
  }
  async run<T = Record<string, unknown>>() {
    return this.all<T>();
  }
  async raw(): Promise<never> {
    throw new Error('Raw API is not used by this worker.');
  }
}

type Mail = { text?: string; to: unknown };
let db: SQLiteDatabase;
let env: Env;
let mail: Mail[];
const origin = 'https://cwa.n1rwj.com';

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookies = '',
  headers: Record<string, string> = {},
  autoPrepare = true,
) {
  // Arrange legacy endpoint fixtures against an explicitly current snapshot.
  // Boundary tests override these headers to exercise missing/stale authority.
  const auth = cookies
    ? await getAuth(new Request(`${origin}${path}`, { headers: { Cookie: cookies } }), env)
    : null;
  if (
    auth &&
    (path.startsWith('/api/entries') ||
      path.startsWith('/api/plan') ||
      path === '/api/settings' ||
      path === '/api/import') &&
    method !== 'GET' &&
    !Object.hasOwn(headers, 'X-CWA-Account')
  )
    headers['X-CWA-Account'] = auth.user.id;
  if (auth && method !== 'GET' && !Object.hasOwn(headers, 'X-CWA-Generation'))
    headers['X-CWA-Generation'] = String(
      db.sqlite.prepare('SELECT dataset_generation FROM users WHERE id = ?').get(auth.user.id)
        ?.dataset_generation,
    );
  if (
    auth &&
    body &&
    typeof body === 'object' &&
    (path === '/api/reset' ||
      (path === '/api/import' && (body as { mode?: string }).mode === 'replace')) &&
    !Object.hasOwn(body, 'lifecycle')
  ) {
    const payload =
      path === '/api/reset'
        ? { confirmation: (body as { confirmation?: unknown }).confirmation }
        : { mode: 'replace', data: (body as { data?: unknown }).data };
    body = {
      ...body,
      lifecycle: await lifecycleIdentity(
        auth.user.id,
        path === '/api/reset' ? 'reset' : 'replace',
        payload,
      ),
    };
  }
  if (
    autoPrepare &&
    auth &&
    body &&
    typeof body === 'object' &&
    (path === '/api/reset' ||
      (path === '/api/import' && (body as { mode?: string }).mode === 'replace')) &&
    typeof (body as { lifecycle?: LifecycleIdentity }).lifecycle?.id === 'string'
  )
    await request(
      '/api/account-lifecycle/prepare',
      'POST',
      (body as { lifecycle: LifecycleIdentity }).lifecycle,
      cookies,
      {},
      false,
    );
  if (
    auth &&
    ((path === '/api/settings' && method === 'PUT') ||
      (path.startsWith('/api/plan') && method !== 'GET')) &&
    !Object.hasOwn(headers, 'If-Match')
  )
    headers['If-Match'] =
      `"${db.sqlite.prepare('SELECT account_revision FROM users WHERE id = ?').get(auth.user.id)?.account_revision}"`;
  return worker.fetch(
    new Request(`${origin}${path}`, {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookies, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

async function lifecycleIdentity(
  accountId: string,
  kind: 'reset' | 'replace',
  payload: unknown,
  id: string = crypto.randomUUID(),
): Promise<LifecycleIdentity> {
  const state = await getAccountSnapshot(env, accountId);
  return {
    version: 1,
    id,
    accountId,
    kind,
    baseRevision: state.revision,
    baseHistoryRevision: state.historyRevision!,
    generation: state.generation,
    payloadHash: await hashLifecyclePayload(kind, payload),
  };
}
function cookiesFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
function code() {
  return mail.at(-1)?.text?.match(/code is (\d{6})/)?.[1] ?? '';
}
async function signIn(email: string) {
  const requested = await request('/api/auth/email/request', 'POST', { email });
  expect(requested.status).toBe(200);
  const verified = await request(
    '/api/auth/email/verify',
    'POST',
    { email, code: code() },
    cookiesFrom(requested),
  );
  expect(verified.status).toBe(200);
  return {
    cookie: cookiesFrom(verified),
    user: ((await verified.json()) as { user: { id: string; email: string } }).user,
  };
}
const entry = (id = 'test-entry') => ({
  id,
  date: '2026-09-28',
  kind: 'listening',
  minutes: 15,
  notes: 'Private practice',
  createdAt: '2026-09-28T12:00:00Z',
});
const backup = (sessions: unknown[] = [entry()]) => ({
  format: 'cwa-training-tracker',
  version: 1,
  exportedAt: '2026-09-28T12:00:00Z',
  sessions,
});

beforeEach(() => {
  db = new SQLiteDatabase();
  mail = [];
  env = {
    DB: db as D1Database,
    ASSETS: {
      fetch: async () => new Response('static'),
      connect: () => {
        throw new Error('Sockets are not used.');
      },
    },
    EMAIL: {
      send: async (message) => {
        mail.push(message as Mail);
        return { messageId: 'test-message' };
      },
    },
    APP_ORIGIN: origin,
    EMAIL_FROM: 'signin@cwa.n1rwj.com',
    ENVIRONMENT: 'production',
    AUTH_SECRET: 'test-secret-long-enough-for-hmac-testing',
  };
});
afterEach(() => {
  db.sqlite.close();
  vi.restoreAllMocks();
});

describe('authentication boundary', () => {
  it('keeps private routes behind authentication and rejects foreign origins', async () => {
    expect(await (await request('/api/me')).json()).toEqual({ user: null });
    expect((await request('/api/entries')).status).toBe(401);
    expect(
      (
        await request('/api/settings', 'PUT', DEFAULT_PROFILE, '', {
          Origin: 'https://attacker.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/api/auth/email/request', 'POST', { email: 'person@example.com' }, '', {
          'Sec-Fetch-Site': 'cross-site',
        })
      ).status,
    ).toBe(403);
    expect(mail).toHaveLength(0);
  });

  it('issues five-minute browser-bound codes, hashes credentials, and consumes each code once', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const requested = await request('/api/auth/email/request', 'POST', {
      email: ' Person@Example.com ',
    });
    expect(await requested.json()).toEqual({ ok: true, expiresIn: 300 });
    expect(requested.headers.get('Set-Cookie')).toContain('__Host-cwa-email=');
    expect(requested.headers.get('Set-Cookie')).toContain('Max-Age=300; Secure');
    const stored = db.sqlite.prepare('SELECT * FROM email_codes').get();
    expect(stored?.expires_at).toBe(now + 300_000);
    expect(stored?.code_hash).not.toBe(code());
    const verified = await request(
      '/api/auth/email/verify',
      'POST',
      { email: 'person@example.com', code: code() },
      cookiesFrom(requested),
    );
    expect(verified.status).toBe(200);
    expect(verified.headers.get('Cache-Control')).toBe('no-store');
    expect(verified.headers.getSetCookie()[0]).toContain('HttpOnly; SameSite=Lax');
    const sessionHash = db.sqlite.prepare('SELECT token_hash FROM sessions').get()?.token_hash;
    expect(cookiesFrom(verified)).not.toContain(String(sessionHash));
    expect(
      (
        await request(
          '/api/auth/email/verify',
          'POST',
          { email: 'person@example.com', code: code() },
          cookiesFrom(requested),
        )
      ).status,
    ).toBe(400);
  });

  it('does not accept an email code in another browser or for another email', async () => {
    const response = await request('/api/auth/email/request', 'POST', { email: 'one@example.com' });
    expect(
      (await request('/api/auth/email/verify', 'POST', { email: 'one@example.com', code: code() }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/auth/email/verify',
          'POST',
          { email: 'two@example.com', code: code() },
          cookiesFrom(response),
        )
      ).status,
    ).toBe(400);
  });

  it('locks a code after five wrong guesses', async () => {
    const response = await request('/api/auth/email/request', 'POST', { email: 'one@example.com' });
    const wrong = code() === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(
        (
          await request(
            '/api/auth/email/verify',
            'POST',
            { email: 'one@example.com', code: wrong },
            cookiesFrom(response),
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request(
          '/api/auth/email/verify',
          'POST',
          { email: 'one@example.com', code: code() },
          cookiesFrom(response),
        )
      ).status,
    ).toBe(400);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM sessions').get()?.count).toBe(0);
  });

  it('rejects a code exactly at the five-minute expiration boundary', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const response = await request('/api/auth/email/request', 'POST', { email: 'one@example.com' });
    vi.spyOn(Date, 'now').mockReturnValue(now + 300_000);
    expect(
      (
        await request(
          '/api/auth/email/verify',
          'POST',
          { email: 'one@example.com', code: code() },
          cookiesFrom(response),
        )
      ).status,
    ).toBe(400);
  });

  it('allows only one concurrent successful consumption', async () => {
    const response = await request('/api/auth/email/request', 'POST', { email: 'one@example.com' });
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(
          '/api/auth/email/verify',
          'POST',
          { email: 'one@example.com', code: code() },
          cookiesFrom(response),
        ),
      ),
    );
    expect(responses.map((value) => value.status).sort()).toEqual([200, 400, 400, 400]);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM sessions').get()?.count).toBe(1);
  });

  it('invalidates a code when delivery fails and rate-limits resends', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.EMAIL.send = async () => {
      throw new Error('private provider details');
    };
    const response = await request('/api/auth/email/request', 'POST', { email: 'one@example.com' });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private provider');
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM email_codes').get()?.count).toBe(0);
    expect(
      (await request('/api/auth/email/request', 'POST', { email: 'one@example.com' })).status,
    ).toBe(429);
  });

  it('revokes the server session on logout and enforces its absolute expiry', async () => {
    const auth = await signIn('one@example.com');
    expect((await request('/api/entries', 'GET', undefined, auth.cookie)).status).toBe(200);
    await request('/api/auth/logout', 'POST', {}, auth.cookie);
    expect((await request('/api/entries', 'GET', undefined, auth.cookie)).status).toBe(401);
    const other = await signIn('two@example.com');
    db.sqlite.exec('UPDATE sessions SET expires_at = 0');
    expect((await request('/api/entries', 'GET', undefined, other.cookie)).status).toBe(401);
  });

  it('creates browser-bound passkey options and consumes rejected challenges', async () => {
    const options = await request('/api/auth/passkeys/login/options', 'POST', {});
    expect(((await options.json()) as { userVerification: string }).userVerification).toBe(
      'required',
    );
    expect(options.headers.get('Set-Cookie')).toContain('__Host-cwa-ceremony');
    const fakeResponse = {
      id: 'unregistered',
      rawId: 'unregistered',
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: '', authenticatorData: '', signature: '' },
    };
    expect(
      (
        await request(
          '/api/auth/passkeys/login/verify',
          'POST',
          { response: fakeResponse },
          cookiesFrom(options),
        )
      ).status,
    ).toBe(400);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM ceremonies').get()?.count).toBe(0);
    const auth = await signIn('one@example.com');
    const register = await request('/api/auth/passkeys/register/options', 'POST', {}, auth.cookie);
    const body = (await register.json()) as {
      rp: { id: string };
      authenticatorSelection: { residentKey: string; userVerification: string };
    };
    expect(body.rp.id).toBe('cwa.n1rwj.com');
    expect(body.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    });
    db.sqlite.exec('UPDATE sessions SET created_at = 0');
    expect(
      (await request('/api/auth/passkeys/register/options', 'POST', {}, auth.cookie)).status,
    ).toBe(403);
  });
});

describe('private training data', () => {
  it('acknowledges equivalent retries without duplicating or overwriting private entries', async () => {
    const a = await signIn('a@example.com');
    const b = await signIn('b@example.com');
    const initial = { ...entry(), metadata: { nested: { first: 1, second: 2 }, values: [1, 2] } };
    const normalized = { ...initial, createdAt: '2026-09-28T12:00:00.000Z' };
    const responses = await Promise.all([
      request('/api/entries', 'POST', initial, a.cookie),
      request('/api/entries', 'POST', initial, a.cookie),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const storedBytes = db.sqlite
      .prepare('SELECT storage_bytes FROM users WHERE id = ?')
      .get(a.user.id)?.storage_bytes;
    const retried = await request(
      '/api/entries',
      'POST',
      {
        ...initial,
        metadata: { values: [1, 2], nested: { second: 2, first: 1 } },
      },
      a.cookie,
    );
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ duplicate: true, entry: normalized });
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(a.user.id)
        ?.storage_bytes,
    ).toBe(storedBytes);
    expect(
      (
        await request(
          '/api/entries',
          'POST',
          {
            ...initial,
            metadata: { ...initial.metadata, values: [2, 1] },
          },
          a.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (await request('/api/entries', 'POST', { ...initial, notes: 'Changed' }, a.cookie)).status,
    ).toBe(409);
    expect(
      (await request('/api/entries', 'POST', { ...initial, notes: 'Other account' }, b.cookie))
        .status,
    ).toBe(201);
    const list = await (await request('/api/entries', 'GET', undefined, a.cookie)).json();
    expect(list).toMatchObject({ entries: [normalized] });
  });

  it('keeps the original creation time when retrying an entry that omitted it', async () => {
    const auth = await signIn('a@example.com');
    const { createdAt: _createdAt, ...input } = entry();
    const first = await request('/api/entries', 'POST', input, auth.cookie);
    const saved = (await first.json()) as { entry: PracticeSession };
    const again = await request('/api/entries', 'POST', input, auth.cookie);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ...saved, duplicate: true });
  });

  it('validates native results, derives measured fields, and preserves them through private backup', async () => {
    const auth = await signIn('a@example.com');
    const initial = createCopyAttempt(
      { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 2 },
      {
        id: 'native-api',
        seed: 'private-copy',
        now: '2026-09-28T12:00:00.000Z',
      },
    );
    const attempt = {
      ...submitCopyAnswer(initial, initial.targets[0], { now: '2026-09-28T12:02:00.000Z' }),
      audioSeconds: 43.25,
      answerSeconds: 8.5,
      reviewSeconds: 2,
    };
    const input = {
      ...entry('copy:native-api'),
      ...copyAttemptSessionFields(attempt),
      kind: 'icr',
      minutes: 999,
      characterWpm: 60,
      effectiveWpm: 50,
      accuracy: 1,
    };
    const forged = {
      ...input,
      metadata: { copyAttempt: { ...attempt, trials: [{ ...attempt.trials[0], points: 100 }] } },
    };
    expect((await request('/api/entries', 'POST', forged, auth.cookie)).status).toBe(400);
    const first = await request('/api/entries', 'POST', input, auth.cookie);
    expect(first.status).toBe(201);
    const saved = (await first.json()) as { entry: PracticeSession };
    expect(saved.entry).toMatchObject({
      minutes: 53.75 / 60,
      characterWpm: 25,
      effectiveWpm: 10,
      accuracy: 100,
      metadata: { copyAttempt: attempt },
    });
    const retry = await request('/api/entries', 'POST', input, auth.cookie);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ...saved, duplicate: true });
    const differentAttempt = {
      ...submitCopyAnswer(initial, '?', { now: attempt.updatedAt }),
      audioSeconds: attempt.audioSeconds,
      answerSeconds: attempt.answerSeconds,
      reviewSeconds: attempt.reviewSeconds,
    };
    expect(
      (
        await request(
          '/api/entries',
          'POST',
          {
            ...input,
            metadata: { copyAttempt: differentAttempt },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(409);
    const legacy = {
      source: 'rwjblue.com',
      data: { lcwo: { runs: [{ id: 'original', score: 0 }] } },
    };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'merge',
            data: { ...backup([]), legacy },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions).toEqual([saved.entry]);
    expect(exported.legacy).toEqual(legacy);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
        .status,
    ).toBe(200);
    const restored = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(restored.sessions).toEqual(exported.sessions);
    expect(restored.legacy).toEqual(exported.legacy);
  });

  it('isolates create, edit, delete, settings, and reset by account', async () => {
    const a = await signIn('a@example.com');
    const b = await signIn('b@example.com');
    expect((await request('/api/entries', 'POST', entry(), a.cookie)).status).toBe(201);
    expect(await (await request('/api/entries', 'GET', undefined, b.cookie)).json()).toMatchObject({
      entries: [],
    });
    expect(
      (await request('/api/entries/test-entry', 'PUT', { ...entry(), notes: 'stolen' }, b.cookie))
        .status,
    ).toBe(404);
    await request('/api/entries/test-entry', 'DELETE', undefined, b.cookie);
    expect((await request('/api/entries', 'POST', entry('b-entry'), b.cookie)).status).toBe(201);
    await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, callsign: 'W1AW' }, a.cookie);
    const bSettings = (await (
      await request('/api/settings', 'GET', undefined, b.cookie)
    ).json()) as { settings: { callsign: string } };
    expect(bSettings.settings.callsign).toBe('');
    expect((await request('/api/reset', 'POST', { confirmation: 'wrong' }, a.cookie)).status).toBe(
      400,
    );
    await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie);
    expect(await (await request('/api/entries', 'GET', undefined, a.cookie)).json()).toMatchObject({
      entries: [],
    });
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, b.cookie)).json()) as {
          entries: unknown[];
        }
      ).entries,
    ).toHaveLength(1);
    expect((await request('/api/me', 'GET', undefined, a.cookie)).status).toBe(200);
  });

  it('merges imports idempotently and validates replacements before removing data', async () => {
    const auth = await signIn('a@example.com');
    expect(
      await (
        await request('/api/import', 'POST', { data: backup(), mode: 'merge' }, auth.cookie)
      ).json(),
    ).toEqual({ imported: 1, skipped: 0 });
    expect(
      await (
        await request('/api/import', 'POST', { data: backup(), mode: 'merge' }, auth.cookie)
      ).json(),
    ).toEqual({ imported: 0, skipped: 1 });
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { data: backup([{ ...entry(), minutes: -1 }]), mode: 'replace' },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()) as {
          entries: unknown[];
        }
      ).entries,
    ).toHaveLength(1);
    await request(
      '/api/import',
      'POST',
      { data: backup([entry('new-entry')]), mode: 'replace' },
      auth.cookie,
    );
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as { sessions: { id: string }[] };
    expect(exported.sessions.map((value) => value.id)).toEqual(['new-entry']);
  });

  it('rolls back the whole replacement if a database write fails', async () => {
    const auth = await signIn('a@example.com');
    await request('/api/entries', 'POST', entry(), auth.cookie);
    db.sqlite.exec(
      `CREATE TRIGGER test_failure BEFORE INSERT ON practice_entries WHEN NEW.id = 'broken' BEGIN SELECT RAISE(ABORT, 'test_failure'); END;`,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { data: backup([entry('broken')]), mode: 'replace' },
          auth.cookie,
        )
      ).status,
    ).toBe(500);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as { sessions: { id: string }[] };
    expect(exported.sessions.map((value) => value.id)).toEqual(['test-entry']);
  });

  it('merges historical imports without changing current data and rolls back failed archive writes', async () => {
    const auth = await signIn('a@example.com');
    const other = await signIn('b@example.com');
    const settings = { ...DEFAULT_PROFILE, callsign: 'W1AW', timezone: 'America/New_York' };
    await request('/api/settings', 'PUT', settings, auth.cookie);
    const today = {
      ...entry('today'),
      date: '2026-09-29',
      createdAt: '2026-09-29T12:00:00Z',
    };
    await request('/api/entries', 'POST', today, auth.cookie);
    await request('/api/entries', 'POST', entry('legacy:historical'), other.cookie);
    const legacy = {
      source: 'rwjblue.com',
      importedBefore: { date: '2026-09-29', timezone: 'America/New_York' },
      data: { attempts: [{ id: 'historical' }, { id: 'today-not-converted' }] },
    };
    // The preconverted historical file intentionally omits profile so existing
    // account preferences survive, while its archive retains the complete source.
    const historical = { ...entry('legacy:historical'), source: 'legacy', minutes: 9.5 };
    const data = {
      ...backup([historical]),
      legacy,
    };
    expect(
      await (await request('/api/import', 'POST', { data, mode: 'merge' }, auth.cookie)).json(),
    ).toEqual({ imported: 1, skipped: 0 });
    expect(
      await (await request('/api/import', 'POST', { data, mode: 'merge' }, auth.cookie)).json(),
    ).toEqual({ imported: 0, skipped: 1 });
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.profile).toEqual(settings);
    expect(exported.sessions).toEqual([
      { ...today, createdAt: '2026-09-29T12:00:00.000Z' },
      { ...historical, createdAt: '2026-09-28T12:00:00.000Z' },
    ]);
    expect(exported.legacy).toEqual(legacy);

    db.sqlite.exec(
      `CREATE TRIGGER test_archive_failure BEFORE INSERT ON import_sources BEGIN SELECT RAISE(ABORT, 'test_archive_failure'); END;`,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            data: { ...data, sessions: [entry('another-historical-entry')] },
            mode: 'merge',
          },
          auth.cookie,
        )
      ).status,
    ).toBe(500);
    const afterFailure = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(afterFailure).toMatchObject({
      profile: exported.profile,
      sessions: exported.sessions,
      legacy: exported.legacy,
    });
    const otherExport = (await (
      await request('/api/export', 'GET', undefined, other.cookie)
    ).json()) as TrainingExport;
    expect(otherExport.sessions).toEqual([
      { ...entry('legacy:historical'), createdAt: '2026-09-28T12:00:00.000Z' },
    ]);
    expect(otherExport).not.toHaveProperty('legacy');
  });

  it('merges against the transaction state when another browser deletes a known entry', async () => {
    const auth = await signIn('a@example.com');
    await request('/api/entries', 'POST', entry(), auth.cookie);
    const batch = db.batch.bind(db);
    vi.spyOn(db, 'batch')
      .mockImplementationOnce(batch)
      .mockImplementationOnce(async (statements) => {
        db.sqlite.prepare('DELETE FROM practice_entries WHERE user_id = ?').run(auth.user.id);
        return batch(statements);
      });
    const data = { ...backup(), profile: DEFAULT_PROFILE };
    const response = await request('/api/import', 'POST', { data, mode: 'merge' }, auth.cookie);
    expect(await response.json()).toEqual({ imported: 1, skipped: 0 });
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()) as {
          entries: unknown[];
        }
      ).entries,
    ).toHaveLength(1);
  });

  it('preserves a large original private archive across export and reimport', async () => {
    const auth = await signIn('a@example.com');
    const legacy = { source: 'rwjblue.com', data: { note: 'Original 😀 '.repeat(25_000) } };
    const data = { ...backup(), legacy };
    expect(
      (await request('/api/import', 'POST', { data, mode: 'merge' }, auth.cookie)).status,
    ).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as { legacy: unknown };
    expect(exported.legacy).toEqual(legacy);
    expect(
      (await request('/api/import', 'POST', { data: exported, mode: 'replace' }, auth.cookie))
        .status,
    ).toBe(200);
  });

  it('rejects unbounded bodies and non-JSON writes', async () => {
    const response = await request('/api/auth/email/request', 'POST', {
      email: 'x'.repeat(20_000),
    });
    expect(response.status).toBe(413);
    expect(
      (
        await request('/api/auth/email/request', 'POST', { email: 'a@example.com' }, '', {
          'Content-Type': 'text/plain',
        })
      ).status,
    ).toBe(415);
  });

  it('isolates private plans and includes them in export, replacement, and reset', async () => {
    const a = await signIn('a@example.com');
    const b = await signIn('b@example.com');
    const task = {
      id: 'private-exercise',
      title: 'My assigned exercise',
      kind: 'listening',
      targetMinutes: 15,
      done: false,
      notes: 'Private notes',
      createdAt: '2026-09-28T12:00:00Z',
    };
    expect((await request('/api/plan', 'POST', task, a.cookie)).status).toBe(201);
    expect(await (await request('/api/plan', 'GET', undefined, b.cookie)).json()).toEqual({
      plan: [],
      revision: 0,
      generation: 0,
    });
    expect(
      (await request('/api/plan/private-exercise', 'PUT', { ...task, done: true }, b.cookie))
        .status,
    ).toBe(404);
    const exported = (await (await request('/api/export', 'GET', undefined, a.cookie)).json()) as {
      plan: unknown[];
    };
    expect(exported.plan).toEqual([{ ...task, createdAt: '2026-09-28T12:00:00.000Z' }]);
    await request('/api/import', 'POST', { data: exported, mode: 'replace' }, a.cookie);
    expect(
      (
        (await (await request('/api/plan', 'GET', undefined, a.cookie)).json()) as {
          plan: unknown[];
        }
      ).plan,
    ).toHaveLength(1);
    await request('/api/import', 'POST', { data: backup([]), mode: 'replace' }, a.cookie);
    expect(await (await request('/api/plan', 'GET', undefined, a.cookie)).json()).toEqual({
      plan: [],
      revision: 3,
      generation: 2,
    });
    await request('/api/plan', 'POST', task, a.cookie);
    await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie);
    expect(await (await request('/api/plan', 'GET', undefined, a.cookie)).json()).toEqual({
      plan: [],
      revision: 5,
      generation: 3,
    });
  });

  it('derives assigned exercises and preserves private completion through rescheduling and restore', async () => {
    const a = await signIn('a@example.com');
    const b = await signIn('b@example.com');
    const settings = {
      ...DEFAULT_PROFILE,
      level: 'intermediate',
      firstClassDate: '2026-10-08',
      classDays: [1, 4],
    };
    for (const auth of [a, b]) await request('/api/settings', 'PUT', settings, auth.cookie);
    const plan = async (cookie: string) =>
      (
        (await (await request('/api/plan', 'GET', undefined, cookie)).json()) as {
          plan: PlannedTask[];
        }
      ).plan;
    const initial = await plan(a.cookie);
    const task = initial.find((task) => task.exercise?.type === 'audio')!;
    expect(task.dueDate).toBe('2026-10-06');
    expect(
      (
        await request(
          `/api/plan/${encodeURIComponent(task.id)}`,
          'PUT',
          { ...task, done: true, notes: 'My private reminder' },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await plan(b.cookie)).find((item) => item.id === task.id)).toMatchObject({
      done: false,
      notes: task.notes,
    });
    await request('/api/settings', 'PUT', { ...settings, firstClassDate: '2026-10-15' }, a.cookie);
    const shifted = await plan(a.cookie);
    expect(shifted).toHaveLength(initial.length);
    expect(shifted.find((item) => item.id === task.id)).toMatchObject({
      done: true,
      dueDate: '2026-10-13',
      notes: 'My private reminder',
    });
    expect(
      (await request(`/api/plan/${encodeURIComponent(task.id)}`, 'DELETE', undefined, a.cookie))
        .status,
    ).toBe(400);
    const saved = await (await request('/api/export', 'GET', undefined, a.cookie)).json();
    await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie);
    expect(await plan(a.cookie)).toEqual([]);
    expect(
      (await request('/api/import', 'POST', { data: saved, mode: 'replace' }, a.cookie)).status,
    ).toBe(200);
    expect(await plan(a.cookie)).toEqual(shifted);
  });

  describe('plan status updates', () => {
    const task = (id = 'status-exercise') => ({
      id,
      title: 'An exercise with private notes',
      kind: 'listening',
      done: false,
      notes: 'Keep this reminder',
      createdAt: '2026-09-28T12:00:00Z',
    });
    const settings = {
      ...DEFAULT_PROFILE,
      level: 'intermediate',
      firstClassDate: '2026-10-08',
      classDays: [1, 4],
    };
    const plan = async (cookie: string) =>
      (
        (await (await request('/api/plan', 'GET', undefined, cookie)).json()) as {
          plan: PlannedTask[];
        }
      ).plan;

    it('requires authentication and same-origin requests and applies the write rate limit', async () => {
      const body = { ids: ['status-exercise'], done: true };
      expect((await request('/api/plan/status', 'POST', body)).status).toBe(401);
      const auth = await signIn('status@example.com');
      await request('/api/plan', 'POST', task(), auth.cookie);
      expect(
        (
          await request('/api/plan/status', 'POST', body, auth.cookie, {
            Origin: 'https://attacker.example',
          })
        ).status,
      ).toBe(403);
      db.sqlite.prepare('UPDATE rate_limits SET count = 120').run();
      expect((await request('/api/plan/status', 'POST', body, auth.cookie)).status).toBe(429);
      expect((await plan(auth.cookie))[0].done).toBe(false);
    });

    it('rejects invalid, duplicate, oversized, and ambiguous status payloads before plan writes', async () => {
      const auth = await signIn('status@example.com');
      for (const body of [
        {},
        { ids: [], done: true },
        { ids: ['one'] },
        { ids: 'one', done: true },
        { ids: ['one', 'one'], done: true },
        { ids: [''], done: true },
        { ids: [1], done: true },
        { ids: ['bad/id'], done: true },
        { ids: ['a'.repeat(201)], done: true },
        { ids: Array.from({ length: 2001 }, (_, index) => `task-${index}`), done: true },
        { ids: ['one'], done: 'true' },
        { ids: ['one'], dismissedFromToday: null },
        { ids: ['one'], done: false, dismissedFromToday: 1 },
        { ids: ['one'], done: true, notes: 'Not a status field' },
        { ids: ['one'], dismissedFromToday: true, targetMinutes: 15 },
      ]) {
        const response = await request('/api/plan/status', 'POST', body, auth.cookie);
        expect(response.status, JSON.stringify(body)).toBe(400);
      }
      expect(db.sqlite.prepare('SELECT count(*) AS count FROM training_plan').get()?.count).toBe(0);
    });

    it('rejects missing or foreign IDs without changing or materializing any selected task', async () => {
      const a = await signIn('a@example.com');
      const b = await signIn('b@example.com');
      await request('/api/settings', 'PUT', settings, a.cookie);
      await request('/api/plan', 'POST', task('mine'), a.cookie);
      await request('/api/plan', 'POST', task('theirs'), b.cookie);
      const initial = await plan(a.cookie);
      const generated = initial.find((item) => item.source === 'curriculum')!;
      const response = await request(
        '/api/plan/status',
        'POST',
        {
          ids: ['mine', generated.id, 'theirs'],
          done: true,
          dismissedFromToday: true,
        },
        a.cookie,
      );
      expect(response.status).toBe(404);
      expect(await plan(a.cookie)).toEqual(initial);
      expect((await plan(b.cookie))[0].done).toBe(false);
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM training_plan WHERE user_id = ?')
          .get(a.user.id)?.count,
      ).toBe(1);
      expect(
        (
          await request(
            '/api/plan/status',
            'POST',
            {
              ids: ['mine', 'missing'],
              dismissedFromToday: true,
            },
            a.cookie,
          )
        ).status,
      ).toBe(404);
      expect(await plan(a.cookie)).toEqual(initial);
    });

    it('dismisses a mixed bulk selection without completion, time credit, or stale field replacement', async () => {
      const auth = await signIn('status@example.com');
      const other = await signIn('other@example.com');
      for (const account of [auth, other])
        await request('/api/settings', 'PUT', settings, account.cookie);
      await request('/api/plan', 'POST', task(), auth.cookie);
      const initial = await plan(auth.cookie);
      const generated = initial.filter((item) => item.source === 'curriculum').slice(0, 2);
      // A different view can update notes between rendering Today and dismissing its rows.
      await request(
        '/api/plan/status-exercise',
        'PUT',
        {
          ...task(),
          notes: 'A newer reminder',
          targetMinutes: 17,
        },
        auth.cookie,
      );
      const before = await plan(auth.cookie);
      const ids = [task().id, ...generated.map((item) => item.id)];
      const selected = before.filter((item) => ids.includes(item.id));
      const response = await request(
        '/api/plan/status',
        'POST',
        {
          ids,
          dismissedFromToday: true,
        },
        auth.cookie,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        tasks: selected.map((item) => ({ ...item, dismissedFromToday: true })),
        revision: 4,
        generation: 0,
      });
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM training_plan WHERE user_id = ?')
          .get(auth.user.id)?.count,
      ).toBe(3);
      expect(
        await (await request('/api/entries', 'GET', undefined, auth.cookie)).json(),
      ).toMatchObject({
        entries: [],
      });
      expect((await plan(other.cookie)).filter((item) => ids.includes(item.id))).toEqual(generated);
      expect((await plan(auth.cookie)).filter((item) => !ids.includes(item.id))).toEqual(
        before.filter((item) => !ids.includes(item.id)),
      );
    });

    it('preserves completion and dismissal in export/import and can reopen and restore independently', async () => {
      const auth = await signIn('status@example.com');
      await request('/api/settings', 'PUT', settings, auth.cookie);
      const generated = (await plan(auth.cookie))[0];
      const ids = [generated.id];
      expect(
        (
          await request(
            '/api/plan/status',
            'POST',
            {
              ids,
              done: true,
              dismissedFromToday: true,
            },
            auth.cookie,
          )
        ).status,
      ).toBe(200);
      const exported = (await (
        await request('/api/export', 'GET', undefined, auth.cookie)
      ).json()) as TrainingExport;
      expect(exported.plan?.find((item) => item.id === generated.id)).toMatchObject({
        done: true,
        dismissedFromToday: true,
      });
      const other = await signIn('restore@example.com');
      expect(
        (
          await request(
            '/api/import',
            'POST',
            {
              data: exported,
              mode: 'replace',
            },
            other.cookie,
          )
        ).status,
      ).toBe(200);
      const reopened = await request(
        '/api/plan/status',
        'POST',
        { ids, done: false },
        other.cookie,
      );
      expect(await reopened.json()).toEqual({
        tasks: [{ ...generated, done: false, dismissedFromToday: true }],
        revision: 2,
        generation: 1,
      });
      const restored = await request(
        '/api/plan/status',
        'POST',
        {
          ids,
          dismissedFromToday: false,
        },
        other.cookie,
      );
      expect(await restored.json()).toEqual({
        tasks: [{ ...generated, done: false, dismissedFromToday: false }],
        revision: 3,
        generation: 1,
      });
      expect((await plan(auth.cookie)).find((item) => item.id === generated.id)).toMatchObject({
        done: true,
        dismissedFromToday: true,
      });
      expect(
        await (await request('/api/entries', 'GET', undefined, other.cookie)).json(),
      ).toMatchObject({
        entries: [],
      });
    });

    it('rolls back generated materialization if the status update fails inside the batch', async () => {
      const auth = await signIn('status@example.com');
      await request('/api/settings', 'PUT', settings, auth.cookie);
      const initial = await plan(auth.cookie);
      const storedBytes = db.sqlite
        .prepare('SELECT storage_bytes FROM users WHERE id = ?')
        .get(auth.user.id)?.storage_bytes;
      db.sqlite.exec(`CREATE TRIGGER reject_status_patch BEFORE UPDATE OF task_json ON training_plan
        WHEN json_extract(NEW.task_json, '$.dismissedFromToday') = 1
        BEGIN SELECT RAISE(ABORT, 'status_patch_failed'); END;`);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await request(
        '/api/plan/status',
        'POST',
        {
          ids: initial.slice(0, 2).map((item) => item.id),
          dismissedFromToday: true,
        },
        auth.cookie,
      );
      expect(response.status).toBe(500);
      expect(db.sqlite.prepare('SELECT count(*) AS count FROM training_plan').get()?.count).toBe(0);
      expect(
        db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
          ?.storage_bytes,
      ).toBe(storedBytes);
      expect(await plan(auth.cookie)).toEqual(initial);
    });
  });

  it('enforces the storage budget transactionally and restores bytes after deletion', async () => {
    const auth = await signIn('a@example.com');
    const large = {
      ...backup(),
      legacy: { source: 'rwjblue.com', data: 'x'.repeat(6 * 1024 * 1024) },
    };
    expect(
      (await request('/api/import', 'POST', { data: large, mode: 'merge' }, auth.cookie)).status,
    ).toBe(400);
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    ).toBe(0);
    expect(
      await (await request('/api/entries', 'GET', undefined, auth.cookie)).json(),
    ).toMatchObject({
      entries: [],
    });
    await request('/api/entries', 'POST', entry(), auth.cookie);
    const storedBytes = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    expect(storedBytes).toBeGreaterThan(0);
    await request(
      '/api/entries/test-entry',
      'PUT',
      { ...entry(), notes: 'longer private practice note' },
      auth.cookie,
    );
    expect(
      Number(
        db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
          ?.storage_bytes,
      ),
    ).toBeGreaterThan(storedBytes);
    await request('/api/entries/test-entry', 'DELETE', undefined, auth.cookie);
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    ).toBe(0);
  });

  it('replaces the retained legacy archive during merge without invisible history', async () => {
    const auth = await signIn('a@example.com');
    for (const note of ['first', 'second']) {
      const data = { ...backup(), legacy: { source: 'rwjblue.com', data: { note } } };
      expect(
        (await request('/api/import', 'POST', { data, mode: 'merge' }, auth.cookie)).status,
      ).toBe(200);
    }
    expect(
      db.sqlite.prepare('SELECT count(DISTINCT source_hash) AS count FROM import_sources').get()
        ?.count,
    ).toBe(1);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as { legacy: { data: unknown } };
    expect(exported.legacy.data).toEqual({ note: 'second' });
  });
});

describe('account operation revisions and receipts', () => {
  async function snapshot(cookie: string): Promise<AccountSnapshot> {
    const response = await request('/api/account-state', 'GET', undefined, cookie);
    expect(response.status).toBe(200);
    return ((await response.json()) as { state: AccountSnapshot }).state;
  }
  function operation(
    state: AccountSnapshot,
    change: AccountChange,
    id: string = crypto.randomUUID(),
  ): AccountOperation {
    return {
      version: 1,
      id,
      accountId: state.accountId,
      baseRevision: state.revision,
      generation: state.generation,
      createdAt: '2026-09-30T12:00:00.000Z',
      change,
    };
  }
  const customTask = (): PlannedTask => ({
    id: 'outbox-task',
    title: 'Private sending',
    kind: 'sending',
    done: false,
    targetMinutes: 17,
    dueDate: '2026-10-01',
    notes: 'Keep this reminder',
    source: 'manual',
    createdAt: '2026-09-30T12:00:00.000Z',
  });
  function send(cookie: string, operation: AccountOperation) {
    return request('/api/account-operations', 'POST', operation, cookie, {
      'X-CWA-Account': operation.accountId,
    });
  }

  it('acknowledges exact lost-response retries without reapplying older settings', async () => {
    const auth = await signIn('receipts@example.test');
    const first = operation(
      await snapshot(auth.cookie),
      { type: 'settings', changes: { displayName: 'First confirmed name' } },
      'stable-first',
    );
    expect((await send(auth.cookie, first)).status).toBe(200);
    const second = operation(
      await snapshot(auth.cookie),
      { type: 'settings', changes: { displayName: 'Newer confirmed name' } },
      'stable-second',
    );
    expect((await send(auth.cookie, second)).status).toBe(200);
    const retry = await send(auth.cookie, first);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      operationId: first.id,
      state: { revision: 2, settings: { displayName: 'Newer confirmed name' } },
    });
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(2);
    const collision = await send(auth.cookie, {
      ...first,
      change: { type: 'settings', changes: { displayName: 'Different body' } },
    });
    expect(collision.status).toBe(409);
    expect((await snapshot(auth.cookie)).settings.displayName).toBe('Newer confirmed name');
    expect((await snapshot(auth.cookie)).revision).toBe(2);
  });

  it('atomically accepts one of two concurrent revisions and acknowledges concurrent exact retries once', async () => {
    const auth = await signIn('concurrent@example.test');
    const initial = await snapshot(auth.cookie);
    const competing = await Promise.all([
      send(
        auth.cookie,
        operation(initial, { type: 'settings', changes: { callsign: 'N1AAA' } }, 'concurrent-a'),
      ),
      send(
        auth.cookie,
        operation(initial, { type: 'settings', changes: { callsign: 'N1BBB' } }, 'concurrent-b'),
      ),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await competing.find((response) => response.status === 409)!.json()).toMatchObject({
      state: { accountId: auth.user.id, revision: 1 },
    });
    const current = await snapshot(auth.cookie);
    const exact = operation(
      current,
      { type: 'settings', changes: { dailyGoalMinutes: 20 } },
      'concurrent-exact',
    );
    const retried = await Promise.all([send(auth.cookie, exact), send(auth.cookie, exact)]);
    expect(retried.map((response) => response.status)).toEqual([200, 200]);
    expect((await snapshot(auth.cookie)).revision).toBe(2);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(2);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
  });

  it('preserves unrelated current task fields through edit, completion, dismissal, and clear patches', async () => {
    const auth = await signIn('patches@example.test');
    const create = operation(await snapshot(auth.cookie), {
      type: 'task-create',
      task: customTask(),
    });
    expect((await send(auth.cookie, create)).status).toBe(200);
    const edit = operation(await snapshot(auth.cookie), {
      type: 'task-edit',
      id: customTask().id,
      changes: { notes: 'Newer notes' },
    });
    expect((await send(auth.cookie, edit)).status).toBe(200);
    const status = operation(await snapshot(auth.cookie), {
      type: 'task-status',
      ids: [customTask().id],
      done: true,
      dismissedFromToday: true,
    });
    expect((await send(auth.cookie, status)).status).toBe(200);
    expect((await snapshot(auth.cookie)).plan).toEqual([
      { ...customTask(), notes: 'Newer notes', done: true, dismissedFromToday: true },
    ]);
    const clear = operation(await snapshot(auth.cookie), {
      type: 'task-edit',
      id: customTask().id,
      changes: { targetMinutes: null, dueDate: null },
    });
    expect((await send(auth.cookie, clear)).status).toBe(200);
    const task = (await snapshot(auth.cookie)).plan[0];
    expect(task).not.toHaveProperty('targetMinutes');
    expect(task).not.toHaveProperty('dueDate');
    expect(task).toMatchObject({
      notes: 'Newer notes',
      done: true,
      dismissedFromToday: true,
      source: 'manual',
    });
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.plan).toEqual([task]);
    expect(exported).not.toHaveProperty('accountId');
    expect(exported).not.toHaveProperty('generation');
  });

  it('protects curriculum facts and atomically materializes learner status and duration overrides', async () => {
    const auth = await signIn('curriculum-patches@example.test');
    await request(
      '/api/settings',
      'PUT',
      { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' },
      auth.cookie,
    );
    const before = await snapshot(auth.cookie);
    const assigned = before.plan[0];
    const invalid = operation(before, {
      type: 'task-edit',
      id: assigned.id,
      changes: { kind: 'other' },
    });
    expect((await send(auth.cookie, invalid)).status).toBe(400);
    expect((await snapshot(auth.cookie)).revision).toBe(before.revision);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM training_plan').get()?.count).toBe(0);
    const status = operation(before, { type: 'task-status', ids: [assigned.id], done: true });
    expect((await send(auth.cookie, status)).status).toBe(200);
    const cleared = operation(await snapshot(auth.cookie), {
      type: 'task-edit',
      id: assigned.id,
      changes: { targetMinutes: null, targetMinutesExplicit: true, notes: 'Learner reminder' },
    });
    expect((await send(auth.cookie, cleared)).status).toBe(200);
    const saved = (await snapshot(auth.cookie)).plan.find((task) => task.id === assigned.id)!;
    expect(saved).toMatchObject({
      done: true,
      notes: 'Learner reminder',
      targetMinutesExplicit: true,
      kind: assigned.kind,
      curriculum: assigned.curriculum,
      exercise: assigned.exercise,
    });
    expect(saved).not.toHaveProperty('targetMinutes');
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM training_plan').get()?.count).toBe(1);
  });

  it('rejects stale direct settings and every legacy plan mutation without conditional authority', async () => {
    const auth = await signIn('conditional@example.test');
    const before = await snapshot(auth.cookie);
    expect(
      (await request('/api/settings', 'PUT', DEFAULT_PROFILE, auth.cookie, { 'If-Match': '' }))
        .status,
    ).toBe(428);
    expect(
      (await request('/api/plan', 'POST', customTask(), auth.cookie, { 'If-Match': '' })).status,
    ).toBe(428);
    await request('/api/plan', 'POST', customTask(), auth.cookie);
    const stale = await request(
      '/api/settings',
      'PUT',
      { ...DEFAULT_PROFILE, callsign: 'N1OLD' },
      auth.cookie,
      { 'If-Match': `"${before.revision}"` },
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ state: { revision: 1, settings: DEFAULT_PROFILE } });
    for (const [path, method, body] of [
      ['/api/plan/outbox-task', 'PUT', { ...customTask(), notes: 'Stale replacement' }],
      ['/api/plan/outbox-task', 'DELETE', undefined],
      ['/api/plan/status', 'POST', { ids: [customTask().id], done: true }],
    ] as const)
      expect((await request(path, method, body, auth.cookie, { 'If-Match': '"0"' })).status).toBe(
        409,
      );
    expect((await snapshot(auth.cookie)).plan).toEqual([customTask()]);
    const pending = operation(before, { type: 'settings', changes: { callsign: 'N1STALE' } });
    expect((await send(auth.cookie, pending)).status).toBe(409);
  });

  it('makes import and reset revision transitions invalidate older mutable operations', async () => {
    const auth = await signIn('lifecycle-revision@example.test');
    const pending = operation(await snapshot(auth.cookie), {
      type: 'settings',
      changes: { callsign: 'N1STALE' },
    });
    await request('/api/import', 'POST', { mode: 'merge', data: backup([]) }, auth.cookie);
    expect((await snapshot(auth.cookie)).revision).toBe(1);
    expect((await send(auth.cookie, pending)).status).toBe(409);
    const afterImport = operation(await snapshot(auth.cookie), {
      type: 'task-create',
      task: customTask(),
    });
    await request('/api/reset', 'POST', { confirmation: 'RESET' }, auth.cookie);
    expect((await snapshot(auth.cookie)).revision).toBe(2);
    expect((await send(auth.cookie, afterImport)).status).toBe(409);
    expect((await snapshot(auth.cookie)).generation).toBe(1);
    const beforeUpload = (await snapshot(auth.cookie)).revision;
    await request('/api/entries', 'POST', entry(), auth.cookie);
    await request(
      '/api/entries/test-entry',
      'PUT',
      { ...entry(), notes: 'Edited note' },
      auth.cookie,
    );
    await request('/api/entries/test-entry', 'DELETE', undefined, auth.cookie);
    expect((await snapshot(auth.cookie)).revision).toBe(beforeUpload);
  });

  it('checks owner headers and operation account IDs before reading or mutating private data', async () => {
    const a = await signIn('scope-a@example.test');
    const b = await signIn('scope-b@example.test');
    const fromA = operation(
      await snapshot(a.cookie),
      { type: 'settings', changes: { displayName: 'Private A' } },
      'same-id',
    );
    expect((await send(b.cookie, fromA)).status).toBe(409);
    expect((await request('/api/account-operations', 'POST', fromA, b.cookie)).status).toBe(409);
    for (const path of [
      '/api/entries',
      '/api/plan',
      '/api/settings',
      '/api/export',
      '/api/account-state',
    ])
      expect(
        (await request(path, 'GET', undefined, b.cookie, { 'X-CWA-Account': a.user.id })).status,
      ).toBe(409);
    const mismatched = await request('/api/entries', 'POST', entry(), b.cookie, {
      'X-CWA-Account': a.user.id,
    });
    expect(mismatched.status).toBe(409);
    const error = await mismatched.json();
    expect(error).toEqual({
      error: 'This request belongs to a different account. Sign in to that account to retry.',
      code: 'account_changed',
    });
    expect(error).not.toHaveProperty('state');
    const bare = await worker.fetch(
      new Request(`${origin}/api/entries`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: b.cookie },
        body: JSON.stringify(entry()),
      }),
      env,
    );
    expect(bare.status).toBe(428);
    expect((await snapshot(b.cookie)).revision).toBe(0);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      0,
    );
    expect((await send(a.cookie, fromA)).status).toBe(200);
    const forB = {
      ...fromA,
      accountId: b.user.id,
      change: { type: 'settings' as const, changes: { displayName: 'Private B' } },
    };
    expect((await send(b.cookie, forB)).status).toBe(200);
    expect((await snapshot(a.cookie)).settings.displayName).toBe('Private A');
    expect((await snapshot(b.cookie)).settings.displayName).toBe('Private B');
    expect((await request('/api/account-state')).status).toBe(401);
    const publicAsset = await request('/');
    expect(await publicAsset.text()).not.toMatch(/Private A|Private B/);
  });

  it('rolls back task mutation, revision, receipt, and byte accounting when receipt quota fails', async () => {
    const auth = await signIn('receipt-quota@example.test');
    const before = await snapshot(auth.cookie);
    const pending = operation(before, { type: 'task-create', task: customTask() }, 'quota-receipt');
    const taskBytes = new TextEncoder().encode(JSON.stringify(customTask())).length;
    const stored = 6 * 1024 * 1024 - taskBytes - pending.id.length - 64 + 1;
    db.sqlite.prepare('UPDATE users SET storage_bytes = ? WHERE id = ?').run(stored, auth.user.id);
    const response = await send(auth.cookie, pending);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('storage limit'),
    });
    expect(await snapshot(auth.cookie)).toEqual(before);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM training_plan').get()?.count).toBe(0);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(0);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    ).toBe(stored);
  });

  it('keeps 2,000-item semantic status updates bounded and rolls back a task-count overflow', async () => {
    const auth = await signIn('bulk-operations@example.test');
    const tasks = Array.from({ length: 2000 }, (_, index) => ({
      ...customTask(),
      id: `bulk-${index}`,
    }));
    db.sqlite
      .prepare(
        `INSERT INTO training_plan (user_id,id,task_json)
      SELECT ?,json_extract(value,'$.id'),value FROM json_each(?)`,
      )
      .run(auth.user.id, JSON.stringify(tasks));
    const before = await snapshot(auth.cookie);
    const batch = vi.spyOn(db, 'batch');
    const status = operation(before, {
      type: 'task-status',
      ids: tasks.map((task) => task.id),
      done: true,
    });
    expect((await send(auth.cookie, status)).status).toBe(200);
    expect(batch.mock.calls.every(([statements]) => statements.length < 50)).toBe(true);
    expect(
      db.sqlite
        .prepare(
          "SELECT count(*) AS count FROM training_plan WHERE json_extract(task_json,'$.done') = 1",
        )
        .get()?.count,
    ).toBe(2000);
    const after = await snapshot(auth.cookie);
    const overflow = operation(after, { type: 'task-create', task: customTask() });
    expect((await send(auth.cookie, overflow)).status).toBe(400);
    expect(await snapshot(auth.cookie)).toEqual(after);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(1);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
  });

  it('rejects invalid payloads, nonexistent tasks, and wrong generations without revision or receipt writes', async () => {
    const auth = await signIn('invalid-operations@example.test');
    const before = await snapshot(auth.cookie);
    const invalid = operation(before, { type: 'settings', changes: { dailyGoalMinutes: 1 } });
    expect((await send(auth.cookie, invalid)).status).toBe(400);
    const missing = operation(before, { type: 'task-status', ids: ['not-in-plan'], done: true });
    expect((await send(auth.cookie, missing)).status).toBe(400);
    const generation = {
      ...operation(before, { type: 'settings', changes: { callsign: 'N1FUTURE' } }),
      generation: 1,
    };
    const rejected = await send(auth.cookie, generation);
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({ state: before });
    expect(await snapshot(auth.cookie)).toEqual(before);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(0);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
  });
  const finished = (taskId: string, id = 'delayed-result') => ({
    ...entry(id),
    kind: 'sending',
    source: 'timer',
    minutes: 90.25 / 60,
    notes: 'Frozen private result notes',
    metadata: {
      elapsedSeconds: 90.25,
      recallSeconds: 5,
      practiceTool: 'sending',
      plannedTaskId: taskId,
    },
  });

  it.each(['level', 'firstClassDate'] as const)(
    'retains delayed-result ownership when a merge import changes %s without trusting imported historical IDs',
    async (field) => {
      const auth = await signIn(`merge-retirement-${field}@example.test`);
      const profile = { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' };
      await request('/api/settings', 'PUT', profile, auth.cookie);
      const before = await snapshot(auth.cookie);
      const taskId = before.plan[0].id;
      const frozen = finished(taskId, 'frozen-before-merge');
      const historical = {
        ...entry('imported-provenance'),
        historicalPlannedTaskId: 'never-owned-imported-task',
      };
      const imported = await request(
        '/api/import',
        'POST',
        {
          mode: 'merge',
          data: {
            ...backup([historical]),
            profile: { ...profile, [field]: field === 'level' ? 'fundamental' : '' },
          },
        },
        auth.cookie,
      );
      expect(imported.status).toBe(200);
      const current = await snapshot(auth.cookie);
      expect(current.plan.some((task) => task.id === taskId)).toBe(false);
      expect(
        db.sqlite
          .prepare('SELECT task_id FROM retired_plan_tasks WHERE user_id = ? AND task_id = ?')
          .get(auth.user.id, taskId)?.task_id,
      ).toBe(taskId);
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM retired_plan_tasks WHERE task_id = ?')
          .get(historical.historicalPlannedTaskId)?.count,
      ).toBe(0);
      const saved = await request('/api/entries', 'POST', frozen, auth.cookie);
      expect(saved.status).toBe(201);
      expect(await saved.json()).toMatchObject({
        entry: { historicalPlannedTaskId: taskId, notes: frozen.notes, minutes: frozen.minutes },
      });
      expect(await snapshot(auth.cookie)).toEqual({
        ...current,
        historyRevision: current.historyRevision! + 1,
      });
      expect(
        (
          await request(
            '/api/entries',
            'POST',
            finished(historical.historicalPlannedTaskId, 'new-invented-claim'),
            auth.cookie,
          )
        ).status,
      ).toBe(400);
    },
  );

  it.each(['entry', 'retirement'] as const)(
    'rolls back a course-changing merge import when its %s write fails',
    async (boundary) => {
      const auth = await signIn(`merge-rollback-${boundary}@example.test`);
      const profile = { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' };
      await request('/api/settings', 'PUT', profile, auth.cookie);
      const before = await snapshot(auth.cookie);
      const bytes = db.sqlite
        .prepare('SELECT storage_bytes FROM users WHERE id = ?')
        .get(auth.user.id)?.storage_bytes;
      const table = boundary === 'entry' ? 'practice_entries' : 'retired_plan_tasks';
      db.sqlite.exec(
        `CREATE TRIGGER reject_merge BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'synthetic_merge_failure'); END;`,
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const imported = await request(
        '/api/import',
        'POST',
        {
          mode: 'merge',
          data: {
            ...backup([entry('merge-failing-entry')]),
            profile: { ...profile, level: 'fundamental' },
          },
        },
        auth.cookie,
      );
      expect(imported.status).toBe(500);
      expect(await snapshot(auth.cookie)).toEqual(before);
      expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
        0,
      );
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM retired_plan_tasks').get()?.count,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
          ?.storage_bytes,
      ).toBe(bytes);
    },
  );

  it('re-evaluates a new linked result after course removal commits at its guarded SQL boundary while retaining earlier saved progress', async () => {
    const auth = await signIn('placement-boundary-race@example.test');
    const profile = { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' };
    await request('/api/settings', 'PUT', profile, auth.cookie);
    const before = await snapshot(auth.cookie);
    const taskId = before.plan[0].id;
    const earlier = finished(taskId, 'saved-before-removal');
    const confirmed = await request('/api/entries', 'POST', earlier, auth.cookie);
    expect(confirmed.status).toBe(201);
    const earlierSaved = ((await confirmed.json()) as { entry: PracticeSession }).entry;
    expect(earlierSaved.metadata?.plannedTaskId).toBe(taskId);
    expect(await snapshot(auth.cookie)).toEqual({
      ...before,
      historyRevision: before.historyRevision! + 1,
    });
    let reached!: () => void;
    let release!: () => void;
    const boundaryReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const boundaryReleased = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const actualBatch = db.batch.bind(db);
    vi.spyOn(db, 'batch').mockImplementation(async (statements) => {
      if (
        !held &&
        statements.some((statement) => statement.sql.includes('INSERT INTO practice_entries'))
      ) {
        held = true;
        reached();
        await boundaryReleased;
      }
      return actualBatch(statements);
    });
    const frozen = finished(taskId, 'new-result-after-removal');
    const frozenBody = JSON.stringify(frozen);
    const pending = request('/api/entries', 'POST', frozen, auth.cookie);
    await boundaryReached;
    expect(
      db.sqlite
        .prepare('SELECT count(*) AS count FROM practice_entries WHERE id = ?')
        .get(frozen.id)?.count,
    ).toBe(0);
    expect(
      (await request('/api/settings', 'PUT', { ...profile, firstClassDate: '' }, auth.cookie))
        .status,
    ).toBe(200);
    const removed = await snapshot(auth.cookie);
    expect(removed.plan).toHaveLength(0);
    release();
    const response = await pending;
    expect(response.status).toBe(201);
    const historical = ((await response.json()) as { entry: PracticeSession }).entry;
    expect(historical.historicalPlannedTaskId).toBe(taskId);
    expect(historical.metadata).not.toHaveProperty('plannedTaskId');
    expect(historical).toMatchObject({
      notes: frozen.notes,
      minutes: frozen.minutes,
      metadata: { elapsedSeconds: 90.25, recallSeconds: 5 },
    });
    expect(JSON.stringify(frozen)).toBe(frozenBody);
    expect(await snapshot(auth.cookie)).toEqual({
      ...removed,
      historyRevision: removed.historyRevision! + 1,
    });
    expect((await request('/api/entries', 'POST', earlier, auth.cookie)).status).toBe(200);
    expect((await request('/api/settings', 'PUT', profile, auth.cookie)).status).toBe(200);
    const restored = await snapshot(auth.cookie);
    const summary = dailyPlanSummary(restored.plan, [], [earlierSaved, historical], '2026-09-30');
    const task = [
      ...summary.assignedToday,
      ...summary.earlier,
      ...summary.preparation,
      ...summary.unscheduled,
      ...summary.upcoming,
    ].find((item) => item.task.id === taskId)!;
    expect(task.loggedMinutes).toBe(earlierSaved.minutes);
    expect(task.status).toBe('started');
    const retried = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({
      entry: historical,
      duplicate: true,
      accountId: auth.user.id,
      generation: 0,
    });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      2,
    );
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
  });

  it('keeps guarded concurrent exact linked-result inserts idempotent', async () => {
    const auth = await signIn('linked-concurrent-exact@example.test');
    await request('/api/plan', 'POST', customTask(), auth.cookie);
    const before = await snapshot(auth.cookie);
    const frozen = finished(customTask().id);
    const responses = await Promise.all([
      request('/api/entries', 'POST', frozen, auth.cookie),
      request('/api/entries', 'POST', frozen, auth.cookie),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await snapshot(auth.cookie)).toEqual({
      ...before,
      historyRevision: before.historyRevision! + 1,
    });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      1,
    );
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
  });

  it('returns retryable 503 after bounded actual SQL contention and later accepts the same frozen linked result', async () => {
    const auth = await signIn('linked-contention@example.test');
    await request('/api/plan', 'POST', customTask(), auth.cookie);
    const frozen = finished(customTask().id);
    const originalBody = JSON.stringify(frozen);
    const actualBatch = db.batch.bind(db);
    let conflicts = 0;
    const contending = vi.spyOn(db, 'batch').mockImplementation(async (statements) => {
      if (statements.some((statement) => statement.sql.includes('INSERT INTO practice_entries'))) {
        conflicts++;
        db.sqlite
          .prepare('UPDATE users SET account_revision = account_revision + 1 WHERE id = ?')
          .run(auth.user.id);
      }
      return actualBatch(statements);
    });
    const response = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('retried') });
    expect(conflicts).toBe(3);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      0,
    );
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
    contending.mockRestore();
    const beforeRetry = await snapshot(auth.cookie);
    const retry = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({
      entry: {
        id: frozen.id,
        notes: frozen.notes,
        minutes: frozen.minutes,
        metadata: { plannedTaskId: customTask().id },
      },
    });
    expect(JSON.stringify(frozen)).toBe(originalBody);
    expect(await snapshot(auth.cookie)).toEqual({
      ...beforeRetry,
      historyRevision: beforeRetry.historyRevision! + 1,
    });
  });

  it.each(['semantic', 'direct'] as const)(
    'saves a delayed result after %s task deletion with scoped historical provenance and exact retries',
    async (route) => {
      const auth = await signIn(`retired-${route}@example.test`);
      const other = await signIn(`foreign-retired-${route}@example.test`);
      const task = customTask();
      expect(
        (
          await send(
            auth.cookie,
            operation(await snapshot(auth.cookie), { type: 'task-create', task }),
          )
        ).status,
      ).toBe(200);
      // This exact body freezes offline; mutable create/delete uploads run before the result.
      const frozen = finished(task.id);
      const originalBody = JSON.stringify(frozen);
      if (route === 'semantic')
        expect(
          (
            await send(
              auth.cookie,
              operation(await snapshot(auth.cookie), { type: 'task-delete', id: task.id }),
            )
          ).status,
        ).toBe(200);
      else
        expect(
          (await request(`/api/plan/${task.id}`, 'DELETE', undefined, auth.cookie)).status,
        ).toBe(200);
      const afterDelete = await snapshot(auth.cookie);
      expect(afterDelete.plan).toEqual([]);
      expect(
        db.sqlite
          .prepare('SELECT task_id, generation FROM retired_plan_tasks WHERE user_id = ?')
          .all(auth.user.id),
      ).toEqual([{ task_id: task.id, generation: 0 }]);
      expect((await request('/api/entries', 'POST', frozen, other.cookie)).status).toBe(400);
      expect(
        (
          await request(
            '/api/entries',
            'POST',
            finished('never-owned', 'unknown-result'),
            auth.cookie,
          )
        ).status,
      ).toBe(400);
      const response = await request('/api/entries', 'POST', frozen, auth.cookie);
      expect(response.status).toBe(201);
      const saved = ((await response.json()) as { entry: PracticeSession }).entry;
      expect(saved).toMatchObject({
        historicalPlannedTaskId: task.id,
        notes: frozen.notes,
        minutes: frozen.minutes,
        source: 'timer',
        metadata: {
          elapsedSeconds: 90.25,
          recallSeconds: 5,
          evidence: { measurement: { seconds: 90.25, recallSeconds: 5 } },
        },
      });
      expect(saved.metadata).not.toHaveProperty('plannedTaskId');
      expect(await snapshot(auth.cookie)).toEqual({
        ...afterDelete,
        historyRevision: afterDelete.historyRevision! + 1,
      });
      expect(JSON.stringify(frozen)).toBe(originalBody);
      const retry = await request('/api/entries', 'POST', frozen, auth.cookie);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({
        entry: saved,
        duplicate: true,
        accountId: auth.user.id,
        generation: 0,
      });
      for (const changed of [
        { ...frozen, notes: 'Changed retry notes' },
        { ...frozen, metadata: { ...frozen.metadata, elapsedSeconds: 100 } },
        { ...frozen, metadata: { ...frozen.metadata, plannedTaskId: 'other-task' } },
        { ...frozen, historicalPlannedTaskId: 'other-task' },
      ])
        expect((await request('/api/entries', 'POST', changed, auth.cookie)).status).toBe(409);
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM practice_entries WHERE user_id = ?')
          .get(auth.user.id)?.count,
      ).toBe(1);
      const exported = (await (
        await request('/api/export', 'GET', undefined, auth.cookie)
      ).json()) as TrainingExport;
      expect(exported.sessions).toEqual([saved]);
      expect(exported).not.toHaveProperty('retiredPlanTasks');
      expect(exported).not.toHaveProperty('generation');
      expect(
        (await request('/api/import', 'POST', { mode: 'replace', data: exported }, other.cookie))
          .status,
      ).toBe(200);
      const restored = (await (
        await request('/api/entries', 'GET', undefined, other.cookie)
      ).json()) as { entries: PracticeSession[] };
      expect(restored.entries).toEqual([saved]);
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM retired_plan_tasks WHERE user_id = ?')
          .get(other.user.id)?.count,
      ).toBe(0);
      // Portable provenance does not authorize a new result claiming the foreign task.
      expect(
        (
          await request(
            '/api/entries',
            'POST',
            { ...frozen, id: 'new-foreign-claim' },
            other.cookie,
          )
        ).status,
      ).toBe(400);
    },
  );

  it.each(['semantic', 'direct'] as const)(
    'records course IDs removed by %s profile changes, retaining active ownership through rescheduling',
    async (route) => {
      const auth = await signIn(`retired-profile-${route}@example.test`);
      const settings = { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' };
      await request('/api/settings', 'PUT', settings, auth.cookie);
      const assigned = (await snapshot(auth.cookie)).plan[0];
      const frozen = finished(assigned.id, 'former-course-result');
      const update = async (changes: Partial<typeof settings>) => {
        if (route === 'semantic')
          return send(
            auth.cookie,
            operation(await snapshot(auth.cookie), { type: 'settings', changes }),
          );
        return request(
          '/api/settings',
          'PUT',
          { ...(await snapshot(auth.cookie)).settings, ...changes },
          auth.cookie,
        );
      };
      expect((await update({ firstClassDate: '2026-10-05' })).status).toBe(200);
      expect((await snapshot(auth.cookie)).plan.some((task) => task.id === assigned.id)).toBe(true);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM retired_plan_tasks').get()?.count,
      ).toBe(0);
      const active = await request(
        '/api/entries',
        'POST',
        { ...frozen, id: 'rescheduled-result' },
        auth.cookie,
      );
      expect(active.status).toBe(201);
      expect(await active.json()).toMatchObject({
        entry: { metadata: { plannedTaskId: assigned.id } },
      });
      expect((await update({ level: 'fundamental' })).status).toBe(200);
      expect(
        db.sqlite
          .prepare(
            'SELECT count(*) AS count FROM retired_plan_tasks WHERE user_id = ? AND task_id = ?',
          )
          .get(auth.user.id, assigned.id)?.count,
      ).toBe(1);
      const delayed = await request('/api/entries', 'POST', frozen, auth.cookie);
      expect(delayed.status).toBe(201);
      const historical = ((await delayed.json()) as { entry: PracticeSession }).entry;
      expect(historical.historicalPlannedTaskId).toBe(assigned.id);
      expect(historical.metadata).not.toHaveProperty('plannedTaskId');
      const fundamental = (await snapshot(auth.cookie)).plan[0];
      expect((await update({ firstClassDate: '' })).status).toBe(200);
      const cleared = await request(
        '/api/entries',
        'POST',
        finished(fundamental.id, 'cleared-course-result'),
        auth.cookie,
      );
      expect(cleared.status).toBe(201);
      expect(await cleared.json()).toMatchObject({
        entry: { historicalPlannedTaskId: fundamental.id },
      });
      expect((await update({ level: 'beginner', firstClassDate: '2026-10-05' })).status).toBe(200);
      const retried = await request('/api/entries', 'POST', frozen, auth.cookie);
      expect(retried.status).toBe(200);
      expect(await retried.json()).toEqual({
        entry: historical,
        duplicate: true,
        accountId: auth.user.id,
        generation: 0,
      });
    },
  );

  it.each(['task-delete', 'settings'] as const)(
    'rolls back %s and retirement ownership when its retirement transaction fails',
    async (type) => {
      const auth = await signIn(`retirement-rollback-${type}@example.test`);
      await request(
        '/api/settings',
        'PUT',
        { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' },
        auth.cookie,
      );
      await request('/api/plan', 'POST', customTask(), auth.cookie);
      const before = await snapshot(auth.cookie);
      const bytes = db.sqlite
        .prepare('SELECT storage_bytes FROM users WHERE id = ?')
        .get(auth.user.id)?.storage_bytes;
      db.sqlite.exec(
        "CREATE TRIGGER reject_retirement BEFORE INSERT ON retired_plan_tasks BEGIN SELECT RAISE(ABORT, 'synthetic_retirement_failure'); END;",
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const change: AccountChange =
        type === 'task-delete'
          ? { type, id: customTask().id }
          : { type, changes: { firstClassDate: '' } };
      const response = await send(auth.cookie, operation(before, change));
      expect(response.status).toBe(500);
      expect(await snapshot(auth.cookie)).toEqual(before);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM retired_plan_tasks').get()?.count,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
          ?.storage_bytes,
      ).toBe(bytes);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
      ).toBe(0);
    },
  );

  it('bounds retirement metadata with the account byte budget and cannot use another dataset generation as proof', async () => {
    const auth = await signIn('retirement-quota@example.test');
    await request(
      '/api/settings',
      'PUT',
      { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' },
      auth.cookie,
    );
    const before = await snapshot(auth.cookie);
    const storedBytes = 6 * 1024 * 1024 - 1;
    db.sqlite
      .prepare('UPDATE users SET storage_bytes = ? WHERE id = ?')
      .run(storedBytes, auth.user.id);
    const refused = await request(
      '/api/settings',
      'PUT',
      { ...before.settings, firstClassDate: '' },
      auth.cookie,
    );
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: expect.stringContaining('storage limit') });
    expect(await snapshot(auth.cookie)).toEqual(before);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM retired_plan_tasks').get()?.count).toBe(
      0,
    );
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    ).toBe(storedBytes);
    db.sqlite.prepare('UPDATE users SET storage_bytes = 0 WHERE id = ?').run(auth.user.id);
    expect(
      (
        await request(
          '/api/settings',
          'PUT',
          { ...before.settings, firstClassDate: '' },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    const proofBytes = db.sqlite
      .prepare(
        'SELECT sum(length(CAST(task_id AS BLOB))) AS bytes FROM retired_plan_tasks WHERE user_id = ?',
      )
      .get(auth.user.id)?.bytes;
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    ).toBe(proofBytes);
    db.sqlite.prepare('UPDATE users SET dataset_generation = 1 WHERE id = ?').run(auth.user.id);
    expect(
      (await request('/api/entries', 'POST', finished(before.plan[0].id), auth.cookie)).status,
    ).toBe(400);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      0,
    );
  });
});

describe('generated listening evidence', () => {
  const words = (characterWpm = 20): GeneratedListeningSummary => ({
    mode: 'words',
    listId: 'custom',
    customLabel: 'Your word list',
    entryCount: 2,
    characterWpm,
    effectiveWpm: 10,
    toneHz: 600,
    wordGapSeconds: 1,
    shuffle: false,
    repeat: true,
    spokenAnswers: false,
  });
  const generated = (
    summaries: readonly GeneratedListeningSummary[] = [words(), words(25)],
    overflow = false,
  ) => ({
    ...entry('generated-listening'),
    source: 'morse',
    characterWpm: 50,
    effectiveWpm: 40,
    metadata: {
      evidence: {
        version: 1,
        type: 'timed',
        measurement: { seconds: 60 },
        recordings: [],
        generatedListening: { version: 1, summaries, overflow },
      },
    },
  });

  it('round trips mixed actual sources with stable identity and immutable raw evidence', async () => {
    const auth = await signIn('generated-roundtrip@example.test');
    const source = generated();
    const created = await request('/api/entries', 'POST', source, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(saved.characterWpm).toBeUndefined();
    expect(saved.effectiveWpm).toBeUndefined();
    expect(saved.minutes).toBe(1);
    expect(saved.metadata?.evidence).toEqual(source.metadata.evidence);
    expect((await request('/api/entries', 'POST', source, auth.cookie)).status).toBe(200);
    const modified = {
      ...saved,
      metadata: { ...saved.metadata, evidence: generated([words(30)]).metadata.evidence },
    };
    expect((await request(`/api/entries/${saved.id}`, 'PUT', modified, auth.cookie)).status).toBe(
      400,
    );
    const edited = {
      ...saved,
      notes: 'Reviewed listening',
      metadata: {
        ...saved.metadata,
        evidence: {
          ...source.metadata.evidence,
          correction: { seconds: 55, reason: 'Five seconds of unrelated interruption' },
        },
      },
    };
    expect((await request(`/api/entries/${saved.id}`, 'PUT', edited, auth.cookie)).status).toBe(
      200,
    );
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions).toHaveLength(1);
    expect(exported.sessions[0]).toMatchObject({
      id: saved.id,
      minutes: 55 / 60,
      metadata: { evidence: { generatedListening: source.metadata.evidence.generatedListening } },
    });
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, auth.cookie)
        ).json()) as TrainingExport
      ).sessions,
    ).toEqual(exported.sessions);
    const other = await signIn('generated-other@example.test');
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, other.cookie)).json()) as {
          entries: PracticeSession[];
        }
      ).entries,
    ).toEqual([]);
    expect((await request(`/api/entries/${saved.id}`, 'PUT', saved, other.cookie)).status).toBe(
      404,
    );
  });

  it('preserves the explicit overflow bound and rejects invalid private fields atomically', async () => {
    const auth = await signIn('generated-bounds@example.test');
    const collector = new GeneratedListeningCollector();
    for (let index = 0; index < 16; index++) collector.record(words(20 + index));
    const envelope = collector.snapshot()!;
    expect(envelope.summaries).toHaveLength(15);
    expect(envelope.overflow).toBe(true);
    const response = await request(
      '/api/entries',
      'POST',
      generated(envelope.summaries, true),
      auth.cookie,
    );
    expect(response.status).toBe(201);
    const saved = ((await response.json()) as { entry: PracticeSession }).entry;
    expect(saved.metadata?.evidence).toMatchObject({ generatedListening: envelope });
    const invalidEnvelopes = [
      {
        version: 1,
        summaries: Array.from({ length: 16 }, (_, index) => words(20 + index)),
        overflow: false,
      },
      { version: 1, summaries: [{ ...words(), text: 'PRIVATE CUSTOM TEXT' }], overflow: false },
      { version: 1, summaries: [{ ...words(), customLabel: 'X'.repeat(101) }], overflow: false },
      { version: 1, summaries: [{ ...words(), toneHz: 1200 }], overflow: false },
    ];
    for (const envelope of invalidEnvelopes) {
      const invalid = {
        ...generated(),
        metadata: { evidence: { ...generated().metadata.evidence, generatedListening: envelope } },
      };
      expect((await request('/api/entries', 'POST', invalid, auth.cookie)).status).toBe(400);
      expect(
        (
          await request(
            '/api/import',
            'POST',
            { mode: 'replace', data: { ...backup([invalid]), evidenceVersion: 1 } },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()) as {
          entries: PracticeSession[];
        }
      ).entries,
    ).toEqual([saved]);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      1,
    );
  });

  it('requires generated task evidence to belong to the writing account and resulting import plan', async () => {
    const owner = await signIn('generated-task-owner@example.test');
    const foreign = await signIn('generated-task-foreign@example.test');
    const task = {
      id: 'generated-owned-task',
      title: 'Generated words',
      kind: 'listening',
      notes: '',
      done: false,
      createdAt: entry().createdAt,
    };
    expect((await request('/api/plan', 'POST', task, owner.cookie)).status).toBe(201);
    const linked = {
      ...generated(),
      metadata: { ...generated().metadata, plannedTaskId: task.id },
    };
    expect((await request('/api/entries', 'POST', linked, foreign.cookie)).status).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...backup([linked]), evidenceVersion: 1 } },
          foreign.cookie,
        )
      ).status,
    ).toBe(400);
    expect((await request('/api/entries', 'POST', linked, owner.cookie)).status).toBe(201);
    const exported = (await (
      await request('/api/export', 'GET', undefined, owner.cookie)
    ).json()) as TrainingExport;
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, foreign.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, foreign.cookie)
        ).json()) as TrainingExport
      ).sessions,
    ).toEqual(exported.sessions);
  });
});

describe('validated non-copy evidence', () => {
  const measured = () => ({
    ...entry('native-timed'),
    source: 'timer',
    minutes: 900,
    metadata: { elapsedSeconds: 90.25, recallSeconds: 10, practiceTool: 'sending' },
  });
  it.each([false, true])(
    'normalizes near-limit orphan links without oversized metadata (timed %s)',
    async (timed) => {
      const auth = await signIn(`orphan-limit-${timed}@example.test`);
      const metadata: Record<string, unknown> = {
        plannedTaskId: 'deleted-own-link',
        ...(timed ? { elapsedSeconds: 30 } : {}),
        padding: '',
      };
      metadata.padding = 'x'.repeat(199995 - JSON.stringify(metadata).length);
      const old = { ...entry('old-orphan-limit'), minutes: 0.5, metadata };
      expect(JSON.stringify(metadata).length).toBe(199995);
      db.sqlite
        .prepare('INSERT INTO practice_entries (user_id,id,date,entry_json) VALUES (?,?,?,?)')
        .run(auth.user.id, old.id, old.date, JSON.stringify(old));
      const exportedResponse = await request('/api/export', 'GET', undefined, auth.cookie);
      expect(exportedResponse.status).toBe(200);
      const exported = (await exportedResponse.json()) as TrainingExport;
      expect(exported.sessions[0].historicalPlannedTaskId).toBe('deleted-own-link');
      expect(JSON.stringify(exported.sessions[0].metadata).length).toBeLessThanOrEqual(200000);
      for (const mode of ['merge', 'replace']) {
        const data =
          mode === 'merge'
            ? { ...backup([{ ...old, id: 'another-old-orphan' }]), plan: [] }
            : { ...backup([old]), plan: [] };
        expect((await request('/api/import', 'POST', { mode, data }, auth.cookie)).status).toBe(
          200,
        );
        expect((await request('/api/entries', 'GET', undefined, auth.cookie)).status).toBe(200);
        expect((await request('/api/export', 'GET', undefined, auth.cookie)).status).toBe(200);
      }
      expect(
        (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
          .status,
      ).toBe(200);
    },
  );
  it('rejects modern normalization overflow before writing while keeping older near-limit records usable', async () => {
    const auth = await signIn('near-limit-evidence@example.test');
    const original = {
      ...entry('old-large-evidence'),
      source: 'timer',
      minutes: 1,
      metadata: { elapsedSeconds: 120, note: 'x'.repeat(199960) },
    };
    const refused = await request('/api/entries', 'POST', original, auth.cookie);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: expect.stringContaining('Normalized session metadata'),
    });
    db.sqlite
      .prepare('INSERT INTO practice_entries (user_id,id,date,entry_json) VALUES (?,?,?,?)')
      .run(auth.user.id, original.id, original.date, JSON.stringify(original));
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0]).toMatchObject({
      evidenceMode: 'historical',
      minutes: 1,
      metadata: original.metadata,
    });
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
        .status,
    ).toBe(200);
    const updated = { ...exported.sessions[0], notes: 'Reviewed historical accounting' };
    expect(
      (await request('/api/entries/old-large-evidence', 'PUT', updated, auth.cookie)).status,
    ).toBe(200);
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()) as {
          entries: PracticeSession[];
        }
      ).entries[0],
    ).toEqual(updated);
    expect(
      (
        await request(
          '/api/entries/old-large-evidence',
          'PUT',
          { ...updated, evidenceMode: undefined },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
  });
  it.each([false, true])(
    'preserves pre-evidence D1 duration edits on reads and portable restore (recording %s)',
    async (recording) => {
      const auth = await signIn(`old-stored-${recording}@example.test`);
      const original = {
        ...entry('old-duration-edit'),
        minutes: recording ? 0.5 : 1,
        source: 'timer',
        metadata: {
          elapsedSeconds: 120,
          recallSeconds: recording ? 10 : 0,
          ...(recording
            ? { recordings: [{ url: 'https://example.test/old.wav', seconds: 60 }] }
            : {}),
        },
      };
      db.sqlite
        .prepare('INSERT INTO practice_entries (user_id,id,date,entry_json) VALUES (?,?,?,?)')
        .run(auth.user.id, original.id, original.date, JSON.stringify(original));
      const listed = (await (
        await request('/api/entries', 'GET', undefined, auth.cookie)
      ).json()) as { entries: PracticeSession[] };
      expect(listed.entries[0].minutes).toBe(original.minutes);
      if (recording)
        expect(listed.entries[0].metadata?.historicalTiming).toMatchObject({
          savedSeconds: 30,
          timing: original.metadata,
        });
      else
        expect(listed.entries[0].metadata?.evidence).toMatchObject({
          measurement: { seconds: 120 },
          correction: { seconds: 60 },
        });
      expect(
        JSON.parse(
          String(
            db.sqlite
              .prepare('SELECT entry_json FROM practice_entries WHERE user_id=? AND id=?')
              .get(auth.user.id, original.id)?.entry_json,
          ),
        ),
      ).toEqual(original);
      const exported = (await (
        await request('/api/export', 'GET', undefined, auth.cookie)
      ).json()) as TrainingExport;
      expect(exported.sessions).toEqual(listed.entries);
      expect(
        (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
          .status,
      ).toBe(200);
      expect(
        (
          (await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()) as {
            entries: PracticeSession[];
          }
        ).entries,
      ).toEqual(listed.entries);
      if (recording)
        expect(
          (
            await request(
              '/api/entries/old-duration-edit',
              'PUT',
              { ...listed.entries[0], metadata: {} },
              auth.cookie,
            )
          ).status,
        ).toBe(400);
    },
  );
  it.each(['merge', 'replace'])(
    'restores old v1 orphan exercise links safely with %s',
    async (mode) => {
      const auth = await signIn(`old-${mode}-backup@example.test`);
      await request('/api/entries', 'POST', entry(), auth.cookie);
      const old = {
        ...measured(),
        minutes: 90.25 / 60,
        metadata: { ...measured().metadata, plannedTaskId: 'previously-deleted-task' },
      };
      const response = await request(
        '/api/import',
        'POST',
        {
          mode,
          data: { ...backup([old]), plan: [] },
        },
        auth.cookie,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject(
        mode === 'replace'
          ? { outcome: 'applied', applied: { imported: 1, historicalLinks: 1 } }
          : { imported: 1, historicalLinks: 1 },
      );
      const exported = (await (
        await request('/api/export', 'GET', undefined, auth.cookie)
      ).json()) as TrainingExport;
      expect(exported.evidenceVersion).toBe(1);
      const restored = exported.sessions.find((item) => item.id === old.id)!;
      expect(restored.minutes).toBe(old.minutes);
      expect(restored.metadata?.plannedTaskId).toBeUndefined();
      expect(restored.historicalPlannedTaskId).toBe('previously-deleted-task');
      expect(restored.metadata?.evidence).toMatchObject({
        measurement: { seconds: 90.25, recallSeconds: 10 },
      });
      expect(exported.sessions).toHaveLength(mode === 'merge' ? 2 : 1);
      expect(
        (await request('/api/import', 'POST', { mode, data: exported }, auth.cookie)).status,
      ).toBe(200);
      expect(
        (
          (await (
            await request('/api/export', 'GET', undefined, auth.cookie)
          ).json()) as TrainingExport
        ).sessions,
      ).toEqual(exported.sessions);
    },
  );
  it('keeps a deleted exercise as portable historical provenance without claiming a current task', async () => {
    const auth = await signIn('deleted-evidence@example.test');
    const task = {
      id: 'deleted-task',
      title: 'Private exercise',
      kind: 'sending',
      notes: '',
      done: false,
      createdAt: entry().createdAt,
    };
    await request('/api/plan', 'POST', task, auth.cookie);
    await request(
      '/api/entries',
      'POST',
      { ...measured(), metadata: { ...measured().metadata, plannedTaskId: task.id } },
      auth.cookie,
    );
    await request('/api/plan/deleted-task', 'DELETE', undefined, auth.cookie);
    const retryBody = {
      ...measured(),
      metadata: { ...measured().metadata, plannedTaskId: task.id },
    };
    const retry = await request('/api/entries', 'POST', retryBody, auth.cookie);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ duplicate: true });
    expect(
      (await request('/api/entries', 'POST', { ...retryBody, notes: 'Changed body' }, auth.cookie))
        .status,
    ).toBe(409);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0].metadata?.plannedTaskId).toBeUndefined();
    expect(exported.sessions[0].historicalPlannedTaskId).toBe('deleted-task');
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, auth.cookie)
        ).json()) as TrainingExport
      ).sessions,
    ).toEqual(exported.sessions);
  });
  it('derives source time, protects raw evidence on edits, and round trips a declared correction', async () => {
    const auth = await signIn('evidence@example.test');
    const response = await request('/api/entries', 'POST', measured(), auth.cookie);
    expect(response.status).toBe(201);
    const { entry: saved } = (await response.json()) as { entry: PracticeSession };
    expect(saved.minutes).toBe(90.25 / 60);
    expect((await request('/api/entries', 'POST', measured(), auth.cookie)).status).toBe(200);
    expect(
      (await request('/api/entries/native-timed', 'PUT', { ...saved, metadata: {} }, auth.cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/entries/native-timed',
          'PUT',
          {
            ...saved,
            metadata: {
              ...saved.metadata,
              elapsedSeconds: 100,
              evidence: {
                version: 1,
                type: 'timed',
                measurement: { seconds: 100, recallSeconds: 10 },
                recordings: [],
              },
            },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    const corrected = {
      ...saved,
      metadata: {
        ...saved.metadata,
        evidence: {
          ...saved.metadata!.evidence!,
          correction: { seconds: 60, recallSeconds: 5, reason: 'Timer interruption' },
        },
      },
    };
    const updated = await request('/api/entries/native-timed', 'PUT', corrected, auth.cookie);
    expect(updated.status).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0]).toMatchObject({
      minutes: 1,
      metadata: {
        evidence: {
          measurement: { seconds: 90.25, recallSeconds: 10 },
          correction: { seconds: 60, recallSeconds: 5 },
        },
      },
    });
    const other = await signIn('other-evidence@example.test');
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, other.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, other.cookie)
        ).json()) as TrainingExport
      ).sessions,
    ).toEqual(exported.sessions);
    expect(
      (
        await request(
          '/api/entries/native-timed',
          'PUT',
          corrected,
          (await signIn('third-evidence@example.test')).cookie,
        )
      ).status,
    ).toBe(404);
  });
  it('rejects invalid write/import evidence before replacement changes history', async () => {
    const auth = await signIn('malformed-evidence@example.test');
    await request('/api/entries', 'POST', entry(), auth.cookie);
    const invalid = { ...measured(), metadata: { elapsedSeconds: 10, recallSeconds: 11 } };
    const response = await request('/api/entries', 'POST', invalid, auth.cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Recall') });
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: backup([invalid]) },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()) as {
          entries: PracticeSession[];
        }
      ).entries.map((entry) => entry.id),
    ).toEqual(['test-entry']);
  });
  it('accepts owned generated/imported tasks and rejects foreign links using the resulting plan', async () => {
    const auth = await signIn('owned-evidence@example.test');
    const other = await signIn('foreign-evidence@example.test');
    const task = {
      id: 'foreign-task',
      title: 'Private exercise',
      kind: 'sending',
      notes: '',
      done: false,
      createdAt: entry().createdAt,
    };
    expect((await request('/api/plan', 'POST', task, other.cookie)).status).toBe(201);
    const linked = { ...measured(), metadata: { ...measured().metadata, plannedTaskId: task.id } };
    expect((await request('/api/entries', 'POST', linked, auth.cookie)).status).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...backup([linked]), evidenceVersion: 1 } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...backup([linked]), plan: [task] } },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    await request(
      '/api/settings',
      'PUT',
      { ...DEFAULT_PROFILE, level: 'intermediate', firstClassDate: '2026-09-28' },
      auth.cookie,
    );
    const plan = (
      (await (await request('/api/plan', 'GET', undefined, auth.cookie)).json()) as {
        plan: PlannedTask[];
      }
    ).plan;
    const generated = plan.find((item) => item.source === 'curriculum')!;
    const next = {
      ...measured(),
      id: 'generated-evidence',
      metadata: { ...measured().metadata, plannedTaskId: generated.id },
    };
    expect((await request('/api/entries', 'POST', next, auth.cookie)).status).toBe(201);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'replace',
            data: { ...backup([next]), profile: DEFAULT_PROFILE, evidenceVersion: 1 },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
  });
});

describe('review purpose and assignment provenance', () => {
  const reviewTask = (id = 'review-task'): PlannedTask => ({
    id,
    title: 'Private sending exercise',
    kind: 'sending',
    done: false,
    notes: '',
    dueDate: '2026-09-28',
    createdAt: '2026-09-28T12:00:00.000Z',
  });
  const reviewEntry = (id = 'review-result', taskId?: string): PracticeSession => ({
    ...entry(id),
    kind: 'sending',
    source: 'timer',
    minutes: 1.5,
    metadata: {
      elapsedSeconds: 90,
      practicePurpose: 'review',
      ...(taskId ? { plannedTaskId: taskId } : {}),
    },
  });

  it('preserves owned review on exact retry, note edits and portable account restore without required credit', async () => {
    const auth = await signIn('review-owner@example.test');
    const task = reviewTask();
    expect((await request('/api/plan', 'POST', task, auth.cookie)).status).toBe(201);
    const frozen = reviewEntry('review-result', task.id);
    const originalBody = JSON.stringify(frozen);
    const created = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(saved).toMatchObject({
      metadata: {
        plannedTaskId: task.id,
        practicePurpose: 'review',
        evidence: {
          type: 'timed',
          measurement: { seconds: 90 },
        },
      },
    });
    const retry = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ duplicate: true, entry: saved });
    expect(JSON.stringify(frozen)).toBe(originalBody);
    expect(
      (
        await request(
          '/api/entries',
          'POST',
          {
            ...frozen,
            metadata: { ...frozen.metadata, practicePurpose: 'assigned' },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(409);
    const edited = { ...saved, notes: 'Review sending rhythm' };
    expect((await request('/api/entries/review-result', 'PUT', edited, auth.cookie)).status).toBe(
      200,
    );
    expect((await request('/api/entries', 'POST', frozen, auth.cookie)).status).toBe(409);
    const beforeAssigned = dailyPlanSummary([task], [], [edited, edited], '2026-09-28');
    expect(beforeAssigned.assignedToday[0]).toMatchObject({
      loggedMinutes: 0,
      todayMinutes: 0,
      status: 'ready',
      task: { done: false },
    });
    expect(summarizePractice([edited, edited], '2026-09-28').todayMinutes).toBe(1.5);
    const assigned = {
      ...entry('ordinary-unflagged'),
      kind: 'sending',
      minutes: 2,
      metadata: { plannedTaskId: task.id },
    };
    expect((await request('/api/entries', 'POST', assigned, auth.cookie)).status).toBe(201);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.plan).toEqual([task]);
    expect(exported.sessions.find((item) => item.id === saved.id)).toEqual(edited);
    expect(
      dailyPlanSummary(exported.plan!, [], exported.sessions, '2026-09-28').assignedToday[0],
    ).toMatchObject({
      loggedMinutes: 2,
      todayMinutes: 2,
      status: 'started',
      task: { done: false },
    });
    expect(summarizePractice(exported.sessions, '2026-09-28').todayMinutes).toBe(3.5);
    for (const key of [
      'accountId',
      'generation',
      'retiredPlanTasks',
      'revision',
      'historyRevision',
    ])
      expect(exported).not.toHaveProperty(key);
    const restored = await signIn('review-restored@example.test');
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, restored.cookie))
        .status,
    ).toBe(200);
    const imported = (await (
      await request('/api/export', 'GET', undefined, restored.cookie)
    ).json()) as TrainingExport;
    expect(imported.sessions).toEqual(exported.sessions);
    expect(imported.plan).toEqual(exported.plan);
    expect(
      db.sqlite
        .prepare('SELECT count(*) AS count FROM practice_entries WHERE user_id = ?')
        .get(auth.user.id)?.count,
    ).toBe(2);
  });

  it.each([
    ['old ordinary', undefined],
    ['assigned', 'assigned'],
    ['review', 'review'],
  ] as const)(
    'keeps saved %s purpose immutable while allowing notes edits',
    async (label, purpose) => {
      const auth = await signIn(`purpose-${label.replaceAll(' ', '-')}@example.test`);
      const value = {
        ...entry(),
        metadata: purpose === undefined ? {} : { practicePurpose: purpose },
      };
      expect((await request('/api/entries', 'POST', value, auth.cookie)).status).toBe(201);
      const edited = { ...value, notes: 'Updated notes' };
      expect((await request('/api/entries/test-entry', 'PUT', edited, auth.cookie)).status).toBe(
        200,
      );
      const relabeled = {
        ...edited,
        metadata: {
          practicePurpose: purpose === 'review' ? 'assigned' : 'review',
        },
      };
      const rejected = await request('/api/entries/test-entry', 'PUT', relabeled, auth.cookie);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({ error: expect.stringContaining('purpose') });
      if (purpose !== undefined)
        expect(
          (
            await request(
              '/api/entries/test-entry',
              'PUT',
              { ...edited, metadata: {} },
              auth.cookie,
            )
          ).status,
        ).toBe(400);
      const stored = JSON.parse(
        String(
          db.sqlite
            .prepare('SELECT entry_json FROM practice_entries WHERE user_id = ? AND id = ?')
            .get(auth.user.id, value.id)?.entry_json,
        ),
      ) as PracticeSession;
      expect(stored.notes).toBe(edited.notes);
      expect(getPracticePurpose(stored)).toBe(purpose ?? 'assigned');
    },
  );

  it('uses actual live/retired ownership for review POST, PUT and import and retains historical purpose', async () => {
    const auth = await signIn('review-links-owner@example.test');
    const other = await signIn('review-links-foreign@example.test');
    const owned = reviewTask('owned-review-task');
    const foreign = reviewTask('foreign-review-task');
    expect((await request('/api/plan', 'POST', owned, auth.cookie)).status).toBe(201);
    expect((await request('/api/plan', 'POST', foreign, other.cookie)).status).toBe(201);
    const original = reviewEntry('unlinked-review');
    const created = await request('/api/entries', 'POST', original, auth.cookie);
    const unlinked = ((await created.json()) as { entry: PracticeSession }).entry;
    const liveEdit = await request(
      `/api/entries/${unlinked.id}`,
      'PUT',
      {
        ...unlinked,
        metadata: { ...unlinked.metadata, plannedTaskId: owned.id },
      },
      auth.cookie,
    );
    expect(liveEdit.status).toBe(200);
    expect(await liveEdit.json()).toMatchObject({
      entry: {
        metadata: { plannedTaskId: owned.id, practicePurpose: 'review' },
      },
    });
    const retiredCandidate = await request(
      '/api/entries',
      'POST',
      reviewEntry('unlinked-retired-review'),
      auth.cookie,
    );
    const retiredUnlinked = ((await retiredCandidate.json()) as { entry: PracticeSession }).entry;
    const foreignBody = reviewEntry('foreign-review', foreign.id);
    for (const retired of [false, true]) {
      if (retired) {
        expect(
          (await request(`/api/plan/${foreign.id}`, 'DELETE', undefined, other.cookie)).status,
        ).toBe(200);
        expect(
          db.sqlite
            .prepare('SELECT task_id FROM retired_plan_tasks WHERE user_id = ?')
            .all(other.user.id),
        ).toEqual([{ task_id: foreign.id }]);
      }
      expect((await request('/api/entries', 'POST', foreignBody, auth.cookie)).status).toBe(400);
      expect(
        (
          await request(
            `/api/entries/${unlinked.id}`,
            'PUT',
            {
              ...unlinked,
              metadata: { ...unlinked.metadata, plannedTaskId: foreign.id },
            },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            '/api/import',
            'POST',
            {
              mode: 'merge',
              data: { ...backup([foreignBody]), evidenceVersion: 1 },
            },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
    }
    expect((await request(`/api/plan/${owned.id}`, 'DELETE', undefined, auth.cookie)).status).toBe(
      200,
    );
    const frozen = reviewEntry('delayed-review', owned.id);
    const delayed = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(delayed.status).toBe(201);
    const saved = ((await delayed.json()) as { entry: PracticeSession }).entry;
    expect(saved).toMatchObject({
      historicalPlannedTaskId: owned.id,
      metadata: { practicePurpose: 'review' },
    });
    expect(saved.metadata).not.toHaveProperty('plannedTaskId');
    const retry = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ duplicate: true, entry: saved });
    const linkedEdit = await request(
      `/api/entries/${retiredUnlinked.id}`,
      'PUT',
      {
        ...retiredUnlinked,
        metadata: { ...retiredUnlinked.metadata, plannedTaskId: owned.id },
      },
      auth.cookie,
    );
    expect(linkedEdit.status).toBe(200);
    expect(await linkedEdit.json()).toMatchObject({
      entry: {
        historicalPlannedTaskId: owned.id,
        metadata: { practicePurpose: 'review' },
      },
    });
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions.every((item) => getPracticePurpose(item) === 'review')).toBe(true);
    expect(exported.sessions.every((item) => item.historicalPlannedTaskId === owned.id)).toBe(true);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, other.cookie))
        .status,
    ).toBe(200);
    expect(
      db.sqlite
        .prepare('SELECT count(*) AS count FROM retired_plan_tasks WHERE user_id = ?')
        .get(other.user.id)?.count,
    ).toBe(0);
    expect(
      (
        await request(
          '/api/entries',
          'POST',
          { ...frozen, id: 'foreign-portable-claim' },
          other.cookie,
        )
      ).status,
    ).toBe(400);
  });

  it('preserves original legacy review flags, task links and archive through merge and exact export restore', async () => {
    const auth = await signIn('legacy-review-owner@example.test');
    const legacy = {
      exportedAt: entry().createdAt,
      snapshot: {
        course: {
          id: 'synthetic-course',
          timezone: 'UTC',
          assignments: [
            {
              session: 1,
              tasks: [
                {
                  id: 'source-task',
                  title: 'Synthetic original exercise',
                  kind: 'audio',
                },
              ],
            },
          ],
        },
        attempts: [
          {
            id: 'review-attempt',
            taskId: 'source-task',
            context: 'practice',
            review: true,
            completed: true,
            activeSeconds: 120,
            startedAt: entry().createdAt,
          },
        ],
      },
    };
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: legacy }, auth.cookie)).status,
    ).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.legacy?.data).toEqual(legacy);
    expect(exported.sessions[0]).toMatchObject({
      metadata: {
        plannedTaskId: 'legacy-task:source-task',
        practicePurpose: 'review',
        legacyAttempt: { review: true, completed: true },
      },
    });
    expect(exported.plan?.find((task) => task.id === 'legacy-task:source-task')?.done).toBe(false);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
        .status,
    ).toBe(200);
    const again = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(again.sessions).toEqual(exported.sessions);
    expect(again.legacy).toEqual(exported.legacy);
    const malformedSource = {
      ...legacy,
      snapshot: {
        ...legacy.snapshot,
        attempts: [
          {
            ...legacy.snapshot.attempts[0],
            review: 'true',
          },
        ],
      },
    };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: malformedSource },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      db.sqlite
        .prepare('SELECT count(*) AS count FROM practice_entries WHERE user_id = ?')
        .get(auth.user.id)?.count,
    ).toBe(1);
    const oldConverted = {
      ...exported.sessions[0],
      id: 'old-converted',
      metadata: {
        legacyAttempt: { review: true, taskId: 'source-task' },
      },
    };
    expect((await request('/api/entries', 'POST', oldConverted, auth.cookie)).status).toBe(201);
    expect(
      (
        await request(
          '/api/entries/old-converted',
          'PUT',
          {
            ...oldConverted,
            notes: 'Preserved legacy review',
          },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/entries/old-converted',
          'PUT',
          { ...oldConverted, metadata: {} },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
  });

  it('rejects malformed purpose before SQL writes and replacement import changes history', async () => {
    const auth = await signIn('malformed-purpose@example.test');
    expect((await request('/api/entries', 'POST', entry(), auth.cookie)).status).toBe(201);
    const invalidMetadata = [
      { practicePurpose: 'optional' },
      { practicePurpose: true },
      { practicePurpose: null },
      { legacyAttempt: { review: 'true' } },
      { practicePurpose: 'assigned', legacyAttempt: { review: true } },
      { practicePurpose: 'review', legacyAttempt: { review: false } },
    ];
    for (const metadata of invalidMetadata) {
      const invalid = { ...entry('invalid-purpose'), metadata };
      expect((await request('/api/entries', 'POST', invalid, auth.cookie)).status).toBe(400);
      expect(
        (
          await request(
            '/api/entries/test-entry',
            'PUT',
            { ...invalid, id: 'test-entry' },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            '/api/import',
            'POST',
            {
              mode: 'replace',
              data: backup([invalid]),
            },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      db.sqlite.prepare('SELECT id FROM practice_entries WHERE user_id = ?').all(auth.user.id),
    ).toEqual([{ id: 'test-entry' }]);
    expect(await getAccountSnapshot(env, auth.user.id)).toMatchObject({
      generation: 0,
      historyRevision: 1,
    });
  });

  it('applies dataset generation fences to review writes, edits and merge imports', async () => {
    const auth = await signIn('review-generation@example.test');
    const task = reviewTask();
    expect((await request('/api/plan', 'POST', task, auth.cookie)).status).toBe(201);
    const frozen = reviewEntry('before-reset', task.id);
    const created = await request('/api/entries', 'POST', frozen, auth.cookie);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(
      (await request('/api/reset', 'POST', { confirmation: 'RESET' }, auth.cookie)).status,
    ).toBe(200);
    const stale = { 'X-CWA-Generation': '0' };
    for (const response of [
      await request('/api/entries', 'POST', frozen, auth.cookie, { ...stale }),
      await request(
        '/api/entries/before-reset',
        'PUT',
        { ...saved, notes: 'Stale edit' },
        auth.cookie,
        { ...stale },
      ),
      await request('/api/import', 'POST', { mode: 'merge', data: backup([saved]) }, auth.cookie, {
        ...stale,
      }),
    ]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'dataset_retired',
        state: { generation: 1 },
      });
    }
    // The new generation does not inherit retired-task authority from the old one.
    expect((await request('/api/entries', 'POST', frozen, auth.cookie)).status).toBe(400);
    expect(
      db.sqlite
        .prepare('SELECT count(*) AS count FROM practice_entries WHERE user_id = ?')
        .get(auth.user.id)?.count,
    ).toBe(0);
  });
});

describe('account dataset lifecycle authority', () => {
  const task = (): PlannedTask => ({
    id: 'same-task',
    title: 'Practice',
    kind: 'sending',
    done: false,
    notes: '',
    source: 'manual',
    createdAt: '2026-09-30T12:00:00.000Z',
  });
  const state = async (cookie: string): Promise<AccountSnapshot> =>
    (
      (await (await request('/api/account-state', 'GET', undefined, cookie)).json()) as {
        state: AccountSnapshot;
      }
    ).state;
  const history = async (cookie: string) =>
    (await (await request('/api/entries', 'GET', undefined, cookie)).json()) as {
      entries: PracticeSession[];
      accountId: string;
      revision: number;
      generation: number;
    };
  function pauseBatch(match: (sql: string) => boolean, afterCommit = false) {
    let reached!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const actual = db.batch.bind(db);
    let held = false;
    vi.spyOn(db, 'batch').mockImplementation(async (statements) => {
      if (!held && statements.some((statement) => match(statement.sql))) {
        held = true;
        const results = afterCommit ? await actual(statements) : undefined;
        reached();
        await released;
        return results ?? actual(statements);
      }
      return actual(statements);
    });
    return { entered, release };
  }
  async function replace(
    cookie: string,
    accountId: string,
    data = { ...backup([entry('same-entry')]), plan: [task()] },
  ) {
    const payload = { mode: 'replace', data };
    const lifecycle = await lifecycleIdentity(accountId, 'replace', payload);
    return {
      payload,
      lifecycle,
      response: await request('/api/import', 'POST', { ...payload, lifecycle }, cookie),
    };
  }

  async function serverBackup(cookie: string): Promise<AccountLifecycleBackup> {
    const response = await request('/api/account-lifecycle/backup', 'GET', undefined, cookie);
    expect(response.status).toBe(200);
    return (await response.json()) as AccountLifecycleBackup;
  }

  it('returns one coherent, account-scoped recovery file and authority even when delivery is delayed', async () => {
    expect((await request('/api/account-lifecycle/backup')).status).toBe(401);
    const a = await signIn('coherent-backup-a@example.test');
    const b = await signIn('coherent-backup-b@example.test');
    await request('/api/entries', 'POST', entry('b-private'), b.cookie);
    await request(
      '/api/import',
      'POST',
      {
        mode: 'merge',
        data: {
          ...backup([entry('a-original')]),
          profile: { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' },
          plan: [task()],
          legacy: { source: 'rwjblue.com', data: { reminder: 'Synthetic archive' } },
        },
      },
      a.cookie,
    );
    const before = await state(a.cookie);
    const boundary = pauseBatch((sql) => sql.includes('SELECT source_json'), true);
    const pending = serverBackup(a.cookie);
    await boundary.entered;
    await request('/api/entries', 'POST', entry('a-new'), a.cookie);
    await request('/api/settings', 'PUT', DEFAULT_PROFILE, a.cookie);
    boundary.release();
    const captured = await pending;
    expect(captured.state).toEqual(before);
    expect(captured.state.historyRevision).toBe(1);
    expect(captured.data.sessions.map((session) => session.id)).toEqual(['a-original']);
    expect(captured.data.profile).toEqual(before.settings);
    expect(captured.data.plan).toEqual([task()]);
    expect(captured.data.legacy?.data).toEqual({ reminder: 'Synthetic archive' });
    expect(captured.state.plan).toContainEqual(task());
    expect(captured.state.plan.length).toBeGreaterThan(captured.data.plan!.length);
    for (const field of [
      'accountId',
      'revision',
      'historyRevision',
      'generation',
      'baseHistoryRevision',
      'payloadHash',
      'identity',
      'state',
    ])
      expect(captured.data).not.toHaveProperty(field);
    expect((await serverBackup(b.cookie)).data.sessions.map((session) => session.id)).toEqual([
      'b-private',
    ]);
    const portable = await (await request('/api/export', 'GET', undefined, a.cookie)).json();
    expect(portable).toMatchObject({ format: 'cwa-training-tracker', version: 1 });
    expect(portable).not.toHaveProperty('state');
    expect(portable).not.toHaveProperty('historyRevision');
  });

  it.each(
    (['reset', 'replace'] as const).flatMap((kind) =>
      (['post', 'put', 'delete'] as const).map((write) => [kind, write] as const),
    ),
  )(
    'blocks stale backup %s after ordinary %s before prepare and after reservation',
    async (kind, write) => {
      const auth = await signIn(`backup-${kind}-${write}@example.test`);
      await request('/api/entries', 'POST', entry('original'), auth.cookie);
      await request('/api/entries', 'POST', entry('retained'), auth.cookie);
      const captured = await serverBackup(auth.cookie);
      const payload =
        kind === 'reset'
          ? { confirmation: 'RESET' }
          : { mode: 'replace', data: backup([entry('replacement')]) };
      const lifecycle: LifecycleIdentity = {
        ...(await lifecycleIdentity(auth.user.id, kind, payload)),
        baseRevision: captured.state.revision,
        baseHistoryRevision: captured.state.historyRevision!,
        generation: captured.state.generation,
      };
      expect(
        (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
      ).toBe(200);
      const changed =
        write === 'post'
          ? await request('/api/entries', 'POST', entry('server-only'), auth.cookie)
          : write === 'put'
            ? await request(
                '/api/entries/original',
                'PUT',
                { ...entry('original'), notes: 'Server edit' },
                auth.cookie,
              )
            : await request('/api/entries/original', 'DELETE', undefined, auth.cookie);
      expect(changed.status).toBe(write === 'post' ? 201 : 200);
      const current = await state(auth.cookie);
      expect(current).toEqual({
        ...captured.state,
        historyRevision: captured.state.historyRevision! + 1,
      });
      expect(
        (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
      ).toBe(409);
      const unprepared = { ...lifecycle, id: 'never-prepared' };
      expect(
        (await request('/api/account-lifecycle/prepare', 'POST', unprepared, auth.cookie)).status,
      ).toBe(409);
      const beforeApply = (await history(auth.cookie)).entries;
      const rejected = await request(
        kind === 'reset' ? '/api/reset' : '/api/import',
        'POST',
        { ...payload, lifecycle },
        auth.cookie,
        {},
        false,
      );
      expect(rejected.status).toBe(409);
      expect((await history(auth.cookie)).entries).toEqual(beforeApply);
      expect(await state(auth.cookie)).toEqual(current);
      const canceled = await request(
        '/api/account-lifecycle/cancel',
        'POST',
        lifecycle,
        auth.cookie,
      );
      expect(await canceled.json()).toMatchObject({
        identity: lifecycle,
        outcome: 'canceled',
        state: current,
      });
      const fresh = await lifecycleIdentity(auth.user.id, kind, payload);
      expect(fresh.baseHistoryRevision).toBe(current.historyRevision);
      expect(
        (
          await request(
            kind === 'reset' ? '/api/reset' : '/api/import',
            'POST',
            { ...payload, lifecycle: fresh },
            auth.cookie,
          )
        ).status,
      ).toBe(200);
    },
  );

  it.each(['prepare', 'apply'] as const)(
    'rejects history committed after %s preflight at the actual SQL guard',
    async (phase) => {
      const auth = await signIn(`history-guard-${phase}@example.test`);
      await request('/api/entries', 'POST', entry('original'), auth.cookie);
      const captured = await serverBackup(auth.cookie);
      const payload = { confirmation: 'RESET' };
      const lifecycle = await lifecycleIdentity(auth.user.id, 'reset', payload);
      if (phase === 'apply')
        expect(
          (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
        ).toBe(200);
      const boundary = pauseBatch((sql) =>
        phase === 'prepare'
          ? sql.includes("'pending','{}'")
          : sql.includes('INSERT INTO account_lifecycle_guards'),
      );
      const pending =
        phase === 'prepare'
          ? request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)
          : request('/api/reset', 'POST', { ...payload, lifecycle }, auth.cookie, {}, false);
      await boundary.entered;
      expect(
        (await request('/api/entries', 'POST', entry('server-only'), auth.cookie)).status,
      ).toBe(201);
      boundary.release();
      const response = await pending;
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        state: {
          revision: captured.state.revision,
          historyRevision: captured.state.historyRevision! + 1,
          generation: 0,
        },
      });
      expect((await history(auth.cookie)).entries.map((session) => session.id).sort()).toEqual([
        'original',
        'server-only',
      ]);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_guards').get()?.count,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
      ).toBe(0);
      expect(
        await (
          await request('/api/account-lifecycle/outcome', 'POST', lifecycle, auth.cookie)
        ).json(),
      ).toMatchObject({ outcome: 'unknown', reserved: phase === 'apply' });
    },
  );

  it('keeps semantic outbox authority valid across entry changes and isolates history counters by account', async () => {
    const a = await signIn('history-semantic-a@example.test');
    const b = await signIn('history-semantic-b@example.test');
    const original = await state(a.cookie);
    const bOriginal = await state(b.cookie);
    const operation: AccountOperation = {
      version: 1,
      id: 'preserved-settings',
      accountId: a.user.id,
      baseRevision: original.revision,
      generation: original.generation,
      createdAt: '2026-09-30T12:00:00.000Z',
      change: { type: 'settings', changes: { callsign: 'N1KEEP' } },
    };
    await request('/api/entries', 'POST', entry('ordinary'), a.cookie);
    await request(
      '/api/entries/ordinary',
      'PUT',
      { ...entry('ordinary'), notes: 'Revised' },
      a.cookie,
    );
    await request('/api/entries/ordinary', 'DELETE', undefined, a.cookie);
    expect(await state(a.cookie)).toEqual({ ...original, historyRevision: 3 });
    expect(await state(b.cookie)).toEqual(bOriginal);
    expect((await request('/api/account-operations', 'POST', operation, a.cookie)).status).toBe(
      200,
    );
    expect(await state(a.cookie)).toMatchObject({
      revision: 1,
      historyRevision: 3,
      settings: { callsign: 'N1KEEP' },
    });
    expect((await request('/api/account-operations', 'POST', operation, a.cookie)).status).toBe(
      200,
    );
    expect(await state(a.cookie)).toMatchObject({ revision: 1, historyRevision: 3 });
  });

  it.each(['reset', 'replace'] as const)(
    'replays a lost %s acknowledgement without deleting later work or incrementing authority twice',
    async (kind) => {
      const auth = await signIn(`lost-${kind}@example.test`);
      await request('/api/entries', 'POST', entry('before'), auth.cookie);
      const payload =
        kind === 'reset'
          ? { confirmation: 'RESET' }
          : { mode: 'replace', data: backup([entry('replacement')]) };
      const lifecycle = await lifecycleIdentity(auth.user.id, kind, payload);
      const path = kind === 'reset' ? '/api/reset' : '/api/import';
      const applied = await request(path, 'POST', { ...payload, lifecycle }, auth.cookie);
      expect(applied.status).toBe(200);
      expect(await applied.json()).toMatchObject({
        outcome: 'applied',
        applied: { revision: 1, generation: 1 },
      });
      await request('/api/entries', 'POST', entry('fresh'), auth.cookie);
      await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, callsign: 'N1NEW' }, auth.cookie);
      const retry = await request(path, 'POST', { ...payload, lifecycle }, auth.cookie);
      expect(await retry.json()).toMatchObject({
        outcome: 'applied',
        applied: { revision: 1, generation: 1 },
        state: { revision: 2, generation: 1, settings: { callsign: 'N1NEW' } },
      });
      expect((await history(auth.cookie)).entries.map((item) => item.id)).toContain('fresh');
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_receipts').get()?.count,
      ).toBe(1);
    },
  );

  it('serializes concurrent exact replacement retries and rejects any changed identity or payload', async () => {
    const auth = await signIn('concurrent-lifecycle@example.test');
    const payload = { mode: 'replace', data: backup() };
    const lifecycle = await lifecycleIdentity(auth.user.id, 'replace', payload);
    const responses = await Promise.all([
      request('/api/import', 'POST', { ...payload, lifecycle }, auth.cookie),
      request('/api/import', 'POST', { ...payload, lifecycle }, auth.cookie),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await state(auth.cookie)).toMatchObject({ generation: 1, revision: 1 });
    expect((await history(auth.cookie)).entries).toHaveLength(1);
    const reordered = {
      data: {
        sessions: payload.data.sessions,
        exportedAt: payload.data.exportedAt,
        version: 1,
        format: payload.data.format,
      },
      mode: 'replace',
    };
    expect(
      (await request('/api/import', 'POST', { ...reordered, lifecycle }, auth.cookie)).status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { ...payload, data: backup([entry('changed')]), lifecycle },
          auth.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          '/api/account-lifecycle/outcome',
          'POST',
          { ...lifecycle, generation: 1 },
          auth.cookie,
        )
      ).status,
    ).toBe(409);
    for (const path of ['/api/account-lifecycle/outcome', '/api/account-lifecycle/cancel'])
      expect(
        (
          await request(
            path,
            'POST',
            { ...lifecycle, baseHistoryRevision: lifecycle.baseHistoryRevision + 1 },
            auth.cookie,
          )
        ).status,
      ).toBe(409);
    expect(
      (await request('/api/import', 'POST', { ...payload, lifecycle: null }, auth.cookie)).status,
    ).toBe(400);
  });

  it.each(['cancel-first', 'apply-first'] as const)(
    'safely resolves the %s race at the actual lifecycle batch',
    async (order) => {
      const auth = await signIn(`${order}@example.test`);
      await request('/api/entries', 'POST', entry('original'), auth.cookie);
      const payload = { confirmation: 'RESET' };
      const lifecycle = await lifecycleIdentity(auth.user.id, 'reset', payload);
      expect(
        await (
          await request('/api/account-lifecycle/outcome', 'POST', lifecycle, auth.cookie)
        ).json(),
      ).toMatchObject({ outcome: 'unknown' });
      const boundary = pauseBatch(
        (sql) => sql.includes("UPDATE account_lifecycle_receipts SET outcome = 'applied'"),
        order === 'apply-first',
      );
      const applying = request('/api/reset', 'POST', { ...payload, lifecycle }, auth.cookie);
      await boundary.entered;
      const cancel = await request('/api/account-lifecycle/cancel', 'POST', lifecycle, auth.cookie);
      expect(cancel.status).toBe(200);
      expect(await cancel.json()).toMatchObject({
        outcome: order === 'cancel-first' ? 'canceled' : 'applied',
      });
      boundary.release();
      const result = (await (await applying).json()) as LifecycleResult;
      expect(result.outcome).toBe(order === 'cancel-first' ? 'canceled' : 'applied');
      expect(await state(auth.cookie)).toMatchObject({
        generation: order === 'cancel-first' ? 0 : 1,
        revision: order === 'cancel-first' ? 0 : 1,
      });
      expect((await history(auth.cookie)).entries).toHaveLength(order === 'cancel-first' ? 1 : 0);
      expect(
        (await (
          await request('/api/reset', 'POST', { ...payload, lifecycle }, auth.cookie)
        ).json()) as LifecycleResult,
      ).toMatchObject({ outcome: result.outcome });
    },
  );

  const oldWrites = ['post', 'linked-post', 'put', 'delete', 'merge', 'account-operation'] as const;
  it.each(['reset', 'replace'].flatMap((kind) => oldWrites.map((write) => [kind, write] as const)))(
    'rejects old %s/%s work held before its guarded SQL executes',
    async (kind, write) => {
      const auth = await signIn(`race-${kind}-${write}@example.test`);
      await request('/api/plan', 'POST', task(), auth.cookie);
      await request('/api/entries', 'POST', entry('same-entry'), auth.cookie);
      const before = await state(auth.cookie);
      const operation: AccountOperation = {
        version: 1,
        id: 'old-edit',
        accountId: auth.user.id,
        generation: before.generation,
        baseRevision: before.revision,
        createdAt: '2026-09-30T12:00:00.000Z',
        change: { type: 'settings', changes: { callsign: 'N1OLD' } },
      };
      const match =
        write === 'put'
          ? 'UPDATE practice_entries'
          : write === 'delete'
            ? 'DELETE FROM practice_entries'
            : write === 'account-operation'
              ? 'INSERT INTO account_operation_receipts'
              : 'INSERT INTO practice_entries';
      const boundary = pauseBatch((sql) => sql.includes(match));
      const pending =
        write === 'post'
          ? request('/api/entries', 'POST', entry('old-pending'), auth.cookie)
          : write === 'linked-post'
            ? request(
                '/api/entries',
                'POST',
                { ...entry('old-pending'), metadata: { plannedTaskId: task().id } },
                auth.cookie,
              )
            : write === 'put'
              ? request(
                  '/api/entries/same-entry',
                  'PUT',
                  { ...entry('same-entry'), notes: 'Old edit' },
                  auth.cookie,
                )
              : write === 'delete'
                ? request('/api/entries/same-entry', 'DELETE', undefined, auth.cookie)
                : write === 'merge'
                  ? request(
                      '/api/import',
                      'POST',
                      { mode: 'merge', data: backup([entry('old-pending')]) },
                      auth.cookie,
                    )
                  : request('/api/account-operations', 'POST', operation, auth.cookie);
      await boundary.entered;
      if (kind === 'reset')
        expect(
          (await request('/api/reset', 'POST', { confirmation: 'RESET' }, auth.cookie)).status,
        ).toBe(200);
      else
        expect(
          (
            await replace(auth.cookie, auth.user.id, {
              ...backup([{ ...entry('same-entry'), notes: 'Replacement record' }]),
              plan: [task()],
            })
          ).response.status,
        ).toBe(200);
      boundary.release();
      const rejected = await pending;
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({
        retired: true,
        code: 'dataset_retired',
        state: { generation: 1 },
      });
      const saved = await history(auth.cookie);
      expect(saved.entries.map((item) => item.id)).not.toContain('old-pending');
      if (kind === 'replace') expect(saved.entries[0].notes).toBe('Replacement record');
      else expect(saved.entries).toHaveLength(0);
      expect((await state(auth.cookie)).settings.callsign).toBe('');
    },
  );

  it('keeps a saved-before-reset late acknowledgement tied to its retired generation and rejects identical duplicate retries', async () => {
    const auth = await signIn('late-practice-ack@example.test');
    const boundary = pauseBatch((sql) => sql.includes('INSERT INTO practice_entries'), true);
    const pending = request('/api/entries', 'POST', entry('same-entry'), auth.cookie);
    await boundary.entered;
    await replace(auth.cookie, auth.user.id);
    boundary.release();
    expect(await (await pending).json()).toMatchObject({ accountId: auth.user.id, generation: 0 });
    const retry = await request('/api/entries', 'POST', entry('same-entry'), auth.cookie, {
      'X-CWA-Generation': '0',
    });
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({ code: 'dataset_retired' });
    expect((await history(auth.cookie)).entries).toHaveLength(1);
  });

  it('retires account-operation receipts without reviving their old edits and keeps lifecycle receipts through subsequent resets', async () => {
    const auth = await signIn('retired-receipts@example.test');
    const before = await state(auth.cookie);
    const operation: AccountOperation = {
      version: 1,
      id: 'old-settings',
      accountId: auth.user.id,
      generation: 0,
      baseRevision: 0,
      createdAt: '2026-09-30T12:00:00.000Z',
      change: { type: 'settings', changes: { callsign: 'N1OLD' } },
    };
    expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(
      200,
    );
    const replaced = await replace(auth.cookie, auth.user.id);
    expect(replaced.response.status).toBe(200);
    const retry = await request('/api/account-operations', 'POST', operation, auth.cookie);
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({ retired: true });
    await request('/api/reset', 'POST', { confirmation: 'RESET' }, auth.cookie);
    expect(
      await (
        await request('/api/account-lifecycle/outcome', 'POST', replaced.lifecycle, auth.cookie)
      ).json(),
    ).toMatchObject({
      outcome: 'applied',
      applied: { generation: before.generation + 1 },
      state: { generation: 2 },
    });
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(1);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_receipts').get()?.count,
    ).toBe(2);
  });

  it.each(['entry', 'plan', 'archive', 'receipt', 'quota'] as const)(
    'rolls back replacement data, counters, receipts and byte accounting when %s fails',
    async (boundary) => {
      const auth = await signIn(`lifecycle-rollback-${boundary}@example.test`);
      await request('/api/entries', 'POST', entry('original'), auth.cookie);
      await request('/api/plan', 'POST', task(), auth.cookie);
      const before = await state(auth.cookie);
      const payload = {
        mode: 'replace',
        data: {
          ...backup([entry('replacement')]),
          plan: [{ ...task(), notes: 'new' }],
          legacy: { source: 'rwjblue.com', data: { note: 'Synthetic archived input' } },
        },
      };
      const lifecycle = await lifecycleIdentity(auth.user.id, 'replace', payload);
      expect(
        (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
      ).toBe(200);
      const bytes = db.sqlite
        .prepare('SELECT storage_bytes FROM users WHERE id = ?')
        .get(auth.user.id)?.storage_bytes;
      const table =
        boundary === 'entry'
          ? 'practice_entries'
          : boundary === 'plan'
            ? 'training_plan'
            : boundary === 'archive'
              ? 'import_sources'
              : 'account_lifecycle_receipts';
      db.sqlite.exec(
        `CREATE TRIGGER reject_lifecycle BEFORE ${table === 'account_lifecycle_receipts' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, '${boundary === 'quota' ? 'account_storage_limit' : 'synthetic_lifecycle_failure'}'); END;`,
      );
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = await request('/api/import', 'POST', { ...payload, lifecycle }, auth.cookie);
      expect(response.status).toBe(boundary === 'quota' ? 400 : 500);
      expect(await state(auth.cookie)).toEqual(before);
      expect((await history(auth.cookie)).entries.map((item) => item.id)).toEqual(['original']);
      expect(
        db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
          ?.storage_bytes,
      ).toBe(bytes);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_receipts').get()?.count,
      ).toBe(1);
      expect(
        await (
          await request('/api/account-lifecycle/outcome', 'POST', lifecycle, auth.cookie)
        ).json(),
      ).toMatchObject({ outcome: 'unknown', reserved: true });
      expect(db.sqlite.prepare('SELECT count(*) AS count FROM import_sources').get()?.count).toBe(
        0,
      );
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
      ).toBe(0);
      db.sqlite.exec('DROP TRIGGER reject_lifecycle');
      expect(
        (await request('/api/import', 'POST', { ...payload, lifecycle }, auth.cookie)).status,
      ).toBe(200);
    },
  );

  it('requires strict generation and ownership for every entry mutation, direct plan/settings edit and merge import', async () => {
    const a = await signIn('strict-authority-a@example.test');
    const b = await signIn('strict-authority-b@example.test');
    await request('/api/entries', 'POST', entry(), a.cookie);
    for (const [path, method, body] of [
      ['/api/entries', 'POST', entry('new')],
      ['/api/entries/test-entry', 'PUT', entry()],
      ['/api/entries/test-entry', 'DELETE', undefined],
      ['/api/settings', 'PUT', DEFAULT_PROFILE],
      ['/api/plan', 'POST', task()],
      ['/api/import', 'POST', { mode: 'merge', data: backup() }],
    ] as const) {
      for (const generation of ['', '-1', '01', 'NaN', '9007199254740992'])
        expect(
          (await request(path, method, body, a.cookie, { 'X-CWA-Generation': generation })).status,
        ).toBe(428);
      expect(
        (await request(path, method, body, b.cookie, { 'X-CWA-Account': a.user.id })).status,
      ).toBe(409);
    }
    const identity = await lifecycleIdentity(a.user.id, 'reset', { confirmation: 'RESET' });
    expect(
      (await request('/api/account-lifecycle/outcome', 'POST', identity, b.cookie)).status,
    ).toBe(409);
    expect(
      (await request('/api/account-lifecycle/cancel', 'POST', identity, b.cookie)).status,
    ).toBe(409);
    expect(
      (
        await request(
          '/api/reset',
          'POST',
          { confirmation: 'RESET', lifecycle: identity },
          b.cookie,
        )
      ).status,
    ).toBe(409);
    expect((await history(a.cookie)).entries).toHaveLength(1);
    expect(await state(b.cookie)).toMatchObject({ generation: 0, revision: 0 });
  });

  it('accounts for retained terminal receipt bytes and coherent history metadata without exporting runtime authority', async () => {
    const auth = await signIn('lifecycle-budget@example.test');
    const identity = await lifecycleIdentity(auth.user.id, 'reset', { confirmation: 'RESET' });
    await request('/api/account-lifecycle/cancel', 'POST', identity, auth.cookie);
    const before = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    expect(before).toBeGreaterThan(64);
    const reset = await request('/api/reset', 'POST', { confirmation: 'RESET' }, auth.cookie);
    expect(reset.status).toBe(200);
    expect(
      Number(
        db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
          ?.storage_bytes,
      ),
    ).toBeGreaterThan(before);
    expect(await history(auth.cookie)).toEqual({
      entries: [],
      accountId: auth.user.id,
      generation: 1,
      revision: 1,
      historyRevision: 0,
    });
    const exported = await (await request('/api/export', 'GET', undefined, auth.cookie)).json();
    expect(JSON.stringify(exported)).not.toContain('payloadHash');
    expect(exported).not.toHaveProperty('generation');
    expect(exported).not.toHaveProperty('accountId');
  });

  it('uses the real receipt quota trigger to roll back a full replacement at its final receipt write', async () => {
    const auth = await signIn('real-lifecycle-quota@example.test');
    await request('/api/entries', 'POST', entry('original'), auth.cookie);
    await request('/api/plan', 'POST', task(), auth.cookie);
    const before = await state(auth.cookie);
    const initialBytes = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    const target = 6 * 1024 * 1024 - 100;
    const receiptCount = Math.floor((target - initialBytes) / 264);
    // Synthetic compact receipts obey the actual 200-character ID/64-byte hash
    // contract and consume budget through production accounting triggers.
    db.sqlite
      .prepare(
        `WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ?)
      INSERT INTO account_operation_receipts (user_id,operation_id,payload_hash,revision,generation,created_at)
      SELECT ?, substr(printf('%0200d',value),1,200), ?, 1, 0, 1 FROM n`,
      )
      .run(receiptCount, auth.user.id, 'a'.repeat(64));
    const remainder = target - initialBytes - receiptCount * 264;
    if (remainder >= 65)
      db.sqlite
        .prepare('INSERT INTO account_operation_receipts VALUES (?,?,?,?,?,?)')
        .run(auth.user.id, 'q'.repeat(remainder - 64), 'b'.repeat(64), 1, 0, 1);
    const payloadBytes = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    const payload = {
      mode: 'replace',
      data: { ...backup([entry('replacement')]), plan: [task()] },
    };
    const lifecycle = await lifecycleIdentity(auth.user.id, 'replace', payload);
    expect(
      await (
        await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)
      ).json(),
    ).toMatchObject({ outcome: 'unknown', reserved: true });
    const bytes = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    expect(bytes).toBeGreaterThan(6 * 1024 * 1024);
    const response = await request('/api/import', 'POST', { ...payload, lifecycle }, auth.cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('storage limit'),
    });
    expect(await state(auth.cookie)).toEqual(before);
    expect((await history(auth.cookie)).entries.map((item) => item.id)).toEqual(['original']);
    expect(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    ).toBe(bytes);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_receipts').get()?.count,
    ).toBe(1);
    expect(
      await (await request('/api/account-lifecycle/cancel', 'POST', lifecycle, auth.cookie)).json(),
    ).toMatchObject({ outcome: 'canceled', state: before });
    expect(
      await (await request('/api/import', 'POST', { ...payload, lifecycle }, auth.cookie)).json(),
    ).toMatchObject({ outcome: 'canceled' });
    expect(await state(auth.cookie)).toEqual(before);
    const row = db.sqlite
      .prepare(
        'SELECT storage_bytes, lifecycle_control_bytes, lifecycle_control_slots FROM users WHERE id = ?',
      )
      .get(auth.user.id)!;
    expect(Number(row.storage_bytes) - Number(row.lifecycle_control_bytes)).toBe(payloadBytes);
    expect(row.lifecycle_control_slots).toBe(1);
    expect(Number(row.lifecycle_control_bytes)).toBeLessThanOrEqual(512);
    // The emergency control row does not expand ordinary payload capacity.
    expect((await request('/api/entries', 'POST', entry('over-budget'), auth.cookie)).status).toBe(
      400,
    );
  });

  it('refuses unprepared destructive requests before any private mutation', async () => {
    const auth = await signIn('unprepared-lifecycle@example.test');
    await request('/api/entries', 'POST', entry('original'), auth.cookie);
    const before = await state(auth.cookie);
    const payload = { confirmation: 'RESET' };
    const lifecycle = await lifecycleIdentity(auth.user.id, 'reset', payload);
    const response = await request(
      '/api/reset',
      'POST',
      { ...payload, lifecycle },
      auth.cookie,
      {},
      false,
    );
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({
      code: 'lifecycle_not_prepared',
      reserved: false,
      state: before,
    });
    expect(
      await (
        await request('/api/account-lifecycle/outcome', 'POST', lifecycle, auth.cookie)
      ).json(),
    ).toMatchObject({ outcome: 'unknown', reserved: false });
    expect((await history(auth.cookie)).entries).toHaveLength(1);
    expect(await state(auth.cookie)).toEqual(before);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_receipts').get()?.count,
    ).toBe(0);
  });

  it('bounds reservation admission while every admitted request can still cancel at full control capacity', async () => {
    const a = await signIn('reservation-capacity-a@example.test');
    const b = await signIn('reservation-capacity-b@example.test');
    await request('/api/entries', 'POST', entry('original'), a.cookie);
    const before = await state(a.cookie);
    const payload = { confirmation: 'RESET' };
    const operations: LifecycleIdentity[] = [];
    for (let index = 0; index < 8; index++) {
      const lifecycle = await lifecycleIdentity(a.user.id, 'reset', payload, `reserve-${index}`);
      operations.push(lifecycle);
      expect(
        await (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, a.cookie)).json(),
      ).toMatchObject({ outcome: 'unknown', reserved: true, state: before });
    }
    const ninth = await lifecycleIdentity(a.user.id, 'reset', payload, 'over-capacity');
    const denied = await request('/api/account-lifecycle/prepare', 'POST', ninth, a.cookie);
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({
      code: 'lifecycle_capacity',
      reserved: false,
      state: before,
    });
    expect(
      (await request('/api/reset', 'POST', { ...payload, lifecycle: ninth }, a.cookie, {}, false))
        .status,
    ).toBe(428);
    const absentCancel = await request('/api/account-lifecycle/cancel', 'POST', ninth, a.cookie);
    expect(absentCancel.status).toBe(409);
    expect(await absentCancel.json()).toMatchObject({
      code: 'lifecycle_capacity',
      reserved: false,
    });
    // Updating an existing reserved slot cannot require another allocation.
    expect(
      await (
        await request('/api/account-lifecycle/cancel', 'POST', operations[0], a.cookie)
      ).json(),
    ).toMatchObject({ outcome: 'canceled' });
    expect(
      await (
        await request(
          '/api/reset',
          'POST',
          { ...payload, lifecycle: operations[0] },
          a.cookie,
          {},
          false,
        )
      ).json(),
    ).toMatchObject({ outcome: 'canceled' });
    expect(await state(a.cookie)).toEqual(before);
    expect((await history(a.cookie)).entries.map((item) => item.id)).toEqual(['original']);
    const row = db.sqlite
      .prepare('SELECT lifecycle_control_bytes, lifecycle_control_slots FROM users WHERE id = ?')
      .get(a.user.id)!;
    expect(row.lifecycle_control_slots).toBe(7);
    expect(Number(row.lifecycle_control_bytes)).toBeLessThanOrEqual(4096);
    const independent = await lifecycleIdentity(b.user.id, 'reset', payload);
    expect(
      (await request('/api/account-lifecycle/prepare', 'POST', independent, b.cookie)).status,
    ).toBe(200);
  });

  it('transfers an applied reservation into ordinary accounted storage and never cancels a mismatched reserved identity', async () => {
    const auth = await signIn('reservation-accounting@example.test');
    const payload = { confirmation: 'RESET' };
    const lifecycle = await lifecycleIdentity(auth.user.id, 'reset', payload);
    expect(
      (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
    ).toBe(200);
    const before = db.sqlite
      .prepare(
        'SELECT storage_bytes, lifecycle_control_bytes, lifecycle_control_slots FROM users WHERE id = ?',
      )
      .get(auth.user.id)!;
    expect(before.storage_bytes).toBe(before.lifecycle_control_bytes);
    expect(before.lifecycle_control_slots).toBe(1);
    expect(
      (
        await request(
          '/api/account-lifecycle/cancel',
          'POST',
          { ...lifecycle, payloadHash: 'a'.repeat(64) },
          auth.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      await (
        await request('/api/account-lifecycle/outcome', 'POST', lifecycle, auth.cookie)
      ).json(),
    ).toMatchObject({ outcome: 'unknown', reserved: true });
    expect(
      (await request('/api/reset', 'POST', { ...payload, lifecycle }, auth.cookie, {}, false))
        .status,
    ).toBe(200);
    const after = db.sqlite
      .prepare(
        'SELECT storage_bytes, lifecycle_control_bytes, lifecycle_control_slots FROM users WHERE id = ?',
      )
      .get(auth.user.id)!;
    expect(after.lifecycle_control_bytes).toBe(0);
    expect(after.lifecycle_control_slots).toBe(0);
    expect(Number(after.storage_bytes)).toBeGreaterThan(0);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_lifecycle_guards').get()?.count,
    ).toBe(0);
  });

  it('preserves more than eight serial cancellations while promoting their storage out of the emergency reserve', async () => {
    const auth = await signIn('serial-cancellation-promotion@example.test');
    const payload = { confirmation: 'RESET' };
    const operations: LifecycleIdentity[] = [];
    for (let index = 0; index < 12; index++) {
      const lifecycle = await lifecycleIdentity(auth.user.id, 'reset', payload, `serial-${index}`);
      operations.push(lifecycle);
      expect(
        (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
      ).toBe(200);
      expect(
        await (
          await request('/api/account-lifecycle/cancel', 'POST', lifecycle, auth.cookie)
        ).json(),
      ).toMatchObject({ outcome: 'canceled' });
    }
    const row = db.sqlite
      .prepare(
        'SELECT storage_bytes, lifecycle_control_bytes, lifecycle_control_slots FROM users WHERE id = ?',
      )
      .get(auth.user.id)!;
    expect(row.lifecycle_control_slots).toBe(0);
    expect(row.lifecycle_control_bytes).toBe(0);
    expect(Number(row.storage_bytes)).toBeGreaterThan(0);
    expect(
      db.sqlite
        .prepare(
          'SELECT count(*) AS count FROM account_lifecycle_receipts WHERE outcome = ? AND control_budget = 0',
        )
        .get('canceled')?.count,
    ).toBe(12);
    for (const lifecycle of operations)
      expect(
        await (
          await request('/api/reset', 'POST', { ...payload, lifecycle }, auth.cookie, {}, false)
        ).json(),
      ).toMatchObject({ outcome: 'canceled' });
    expect(await state(auth.cookie)).toMatchObject({ revision: 0, generation: 0 });
  });

  it('recovers full control admission after deleting ordinary payload frees room for an immutable canceled receipt', async () => {
    const auth = await signIn('control-capacity-recovery@example.test');
    const original = { ...entry('original'), notes: 'Recoverable original work '.repeat(40) };
    expect((await request('/api/entries', 'POST', original, auth.cookie)).status).toBe(201);
    const initial = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    const target = 6 * 1024 * 1024;
    const receiptCount = Math.floor((target - initial) / 264);
    db.sqlite
      .prepare(
        `WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ?)
      INSERT INTO account_operation_receipts (user_id,operation_id,payload_hash,revision,generation,created_at)
      SELECT ?, substr(printf('%0200d',value),1,200), ?, 1, 0, 1 FROM n`,
      )
      .run(receiptCount, auth.user.id, 'a'.repeat(64));
    const remainder = target - initial - receiptCount * 264;
    if (remainder >= 65)
      db.sqlite
        .prepare('INSERT INTO account_operation_receipts VALUES (?,?,?,?,?,?)')
        .run(auth.user.id, 'q'.repeat(remainder - 64), 'b'.repeat(64), 1, 0, 1);
    const payload = { confirmation: 'RESET' };
    const canceled: LifecycleIdentity[] = [];
    for (let index = 0; index < 8; index++) {
      const lifecycle = await lifecycleIdentity(
        auth.user.id,
        'reset',
        payload,
        `full-${index}-`.padEnd(200, 'x'),
      );
      canceled.push(lifecycle);
      expect(
        (await request('/api/account-lifecycle/prepare', 'POST', lifecycle, auth.cookie)).status,
      ).toBe(200);
      expect(
        await (
          await request('/api/account-lifecycle/cancel', 'POST', lifecycle, auth.cookie)
        ).json(),
      ).toMatchObject({ outcome: 'canceled' });
    }
    expect(
      db.sqlite.prepare('SELECT lifecycle_control_slots FROM users WHERE id = ?').get(auth.user.id)
        ?.lifecycle_control_slots,
    ).toBe(8);
    const next = await lifecycleIdentity(auth.user.id, 'reset', payload, 'recovered-admission');
    expect(
      (await request('/api/account-lifecycle/prepare', 'POST', next, auth.cookie)).status,
    ).toBe(409);
    const bytesBefore = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    // Stop has already returned terminal canceled and permits ordinary deletion.
    expect((await request('/api/entries/original', 'DELETE', undefined, auth.cookie)).status).toBe(
      200,
    );
    const bytesAfterDelete = Number(
      db.sqlite.prepare('SELECT storage_bytes FROM users WHERE id = ?').get(auth.user.id)
        ?.storage_bytes,
    );
    expect(bytesAfterDelete).toBeLessThan(bytesBefore);
    expect(
      await (
        await request(
          '/api/account-lifecycle/prepare',
          'POST',
          await lifecycleIdentity(auth.user.id, 'reset', payload, next.id),
          auth.cookie,
        )
      ).json(),
    ).toMatchObject({ outcome: 'unknown', reserved: true });
    const promoted = db.sqlite
      .prepare(
        'SELECT count(*) AS count FROM account_lifecycle_receipts WHERE user_id = ? AND outcome = ? AND control_budget = 0',
      )
      .get(auth.user.id, 'canceled');
    expect(promoted?.count).toBe(1);
    const row = db.sqlite
      .prepare(
        'SELECT storage_bytes, lifecycle_control_bytes, lifecycle_control_slots FROM users WHERE id = ?',
      )
      .get(auth.user.id)!;
    expect(Number(row.storage_bytes) - Number(row.lifecycle_control_bytes)).toBeLessThanOrEqual(
      target,
    );
    expect(row.lifecycle_control_slots).toBe(8);
    for (const lifecycle of canceled)
      expect(
        await (
          await request('/api/account-lifecycle/outcome', 'POST', lifecycle, auth.cookie)
        ).json(),
      ).toMatchObject({ identity: lifecycle, outcome: 'canceled' });
  });
});
