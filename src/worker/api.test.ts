import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import { DEFAULT_PROFILE, type PracticeSession, type TrainingExport } from '../shared/training';
import type { PlannedTask } from '../shared/plan';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';

// Run production SQL against SQLite, including D1's transactional batch behavior.
// The cast bridges only the D1 transport API; SQL and schema are not mocked.
class SQLiteDatabase {
  sqlite = new DatabaseSync(':memory:');
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
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
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
    private sql: string,
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

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookies = '',
  headers: Record<string, string> = {},
) {
  return worker.fetch(
    new Request(`${origin}${path}`, {
      method,
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookies, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
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
    expect(await (await request('/api/entries', 'GET', undefined, b.cookie)).json()).toEqual({
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
    expect(await (await request('/api/entries', 'GET', undefined, a.cookie)).json()).toEqual({
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
    vi.spyOn(db, 'batch').mockImplementationOnce(async (statements) => {
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
    });
    await request('/api/plan', 'POST', task, a.cookie);
    await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie);
    expect(await (await request('/api/plan', 'GET', undefined, a.cookie)).json()).toEqual({
      plan: [],
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
      });
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM training_plan WHERE user_id = ?')
          .get(auth.user.id)?.count,
      ).toBe(3);
      expect(await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()).toEqual({
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
      });
      expect((await plan(auth.cookie)).find((item) => item.id === generated.id)).toMatchObject({
        done: true,
        dismissedFromToday: true,
      });
      expect(await (await request('/api/entries', 'GET', undefined, other.cookie)).json()).toEqual({
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
    expect(await (await request('/api/entries', 'GET', undefined, auth.cookie)).json()).toEqual({
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
