import { materialReference, originalMaterialCopy, type InstructorMaterial } from '../shared/instructor-material';
import { captureReportHandoff, confirmReportHandoff } from '../shared/report-handoff';
import {
  evidenceDefinition,
  evidenceProfile,
  evidenceSessions,
  evidenceRunner,
  evidenceLcwo,
} from '../../e2e/report-evidence-fixture';
import { createReportDocument, refreshReportDocument } from '../shared/report-document';
import { lcwoFixtureResponse } from '../../e2e/lcwo-fixture';
import {
  starterAdvisorReportDefinition,
  validateAdvisorReportDefinition,
} from '../shared/report-definition';
import { confirmedLearnedWordHistory } from '../shared/report-learned-words';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import {
  DEFAULT_PROFILE,
  getPracticePurpose,
  summarizePractice,
  validatePracticeSession,
  type PracticeSession,
  type TrainingExport,
} from '../shared/training';
import { dailyPlanSummary, type PlannedTask } from '../shared/plan';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';
import { getAuth } from './auth';
import { getAccountSnapshot, accountSnapshotStatements, snapshotFromResults } from './account-sync';
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
import type { PracticeEvidence, RecordingEvidence } from '../shared/practice-evidence';
import { createRunnerRun } from '../shared/runner';
import { finishedRunnerSession, captureRunnerPracticeAttribution } from '../client/runner-session';
import { timedClassMeetings, type ClassSchedule } from '../shared/class-schedule';
import { createManualTiming } from '../shared/external-practice';

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
      path === '/api/lcwo' ||
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
    ((path === '/api/lcwo' && method === 'POST') ||
      (path === '/api/settings' && method === 'PUT') ||
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

describe('external manual results and captured completion', () => {
  it('persists and edits on-air categories through backups while rejecting inconsistent writes and imports', async () => {
    const auth = await signIn('on-air-category-owner@example.test');
    const other = await signIn('on-air-category-other@example.test');
    const body = {
      ...entry('on-air-category'),
      kind: 'on-air',
      source: 'manual',
      metadata: { onAirCategory: 'pota' },
    };
    expect((await request('/api/entries', 'POST', body, auth.cookie)).status).toBe(201);
    expect((await request('/api/entries/on-air-category', 'PUT', body, other.cookie)).status).toBe(404);
    const edited = { ...body, metadata: { onAirCategory: 'sota' } };
    expect((await request('/api/entries/on-air-category', 'PUT', edited, auth.cookie)).status).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0].metadata?.onAirCategory).toBe('sota');
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie)).status,
    ).toBe(200);
    expect(
      ((await (await request('/api/export', 'GET', undefined, auth.cookie)).json()) as TrainingExport)
        .sessions,
    ).toEqual(exported.sessions);
    const before = await getAccountSnapshot(env, auth.user.id);
    const malformed = { ...edited, kind: 'listening' };
    expect((await request('/api/entries/on-air-category', 'PUT', malformed, auth.cookie)).status).toBe(
      400,
    );
    const invalid = { ...edited, id: 'invalid-on-air', metadata: { onAirCategory: 'invalid' } };
    expect((await request('/api/entries', 'POST', invalid, auth.cookie)).status).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'replace',
            data: { ...exported, sessions: [exported.sessions[0], malformed] },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
  });

  it('round-trips all external families, explicit zeros and captured start across profile changes with account isolation', async () => {
    const a = await signIn('external-owner@example.test');
    const b = await signIn('external-other@example.test');
    const timing = createManualTiming('2026-09-29T00:01:30', 'America/New_York', 120);
    const bodies = ['letters', 'figures', 'custom', 'words', 'callsign'].map((kind) => ({
      ...entry(`external-${kind}`),
      source: 'manual',
      minutes: 2,
      date: '2026-09-28',
      metadata: {
        manualTiming: timing,
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind,
          ...(kind === 'words'
            ? { speedWpm: 200, maximumLength: 12, errorCount: 0, score: 0 }
            : kind === 'callsign'
              ? { speedWpm: 35, errorCount: 0, score: 0 }
              : { speedWpm: 20, groupLength: 5, errorPercent: 0 }),
        },
      },
    }));
    const manualRunner = {
      ...entry('external-runner'),
      source: 'manual',
      kind: 'simulator',
      minutes: 2,
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'morse-runner',
          mode: 'WPX',
          elapsedSeconds: 120,
          startingWpm: 35,
          usedWpms: [35, 40],
          verifiedPoints: 0,
          score: 0,
          contacts: 0,
        },
      },
    };
    const timedExternal = {
      ...entry('external-timer'),
      source: 'timer',
      minutes: 2,
      metadata: {
        practiceTool: 'external',
        elapsedSeconds: 120,
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'words',
          score: 0,
        },
      },
    };
    for (const body of [...bodies, manualRunner, timedExternal])
      expect((await request('/api/entries', 'POST', body, a.cookie)).status).toBe(201);
    expect((await request('/api/entries', 'POST', bodies[0])).status).toBe(401);
    expect((await request('/api/entries/external-words', 'PUT', bodies[3], b.cookie)).status).toBe(
      404,
    );
    expect(
      ((await (await request('/api/export', 'GET', undefined, b.cookie)).json()) as TrainingExport)
        .sessions,
    ).toEqual([]);
    expect(
      (
        await request(
          '/api/settings',
          'PUT',
          { ...DEFAULT_PROFILE, timezone: 'Asia/Tokyo' },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    const first = await request('/api/entries', 'POST', bodies[0], a.cookie);
    expect(first.status).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(
      exported.sessions.find((value) => value.id === 'external-letters')!.metadata?.manualTiming,
    ).toEqual(timing);
    expect(exported.sessions.find((value) => value.id === 'external-words')!).not.toHaveProperty(
      'characterWpm',
    );
    expect(
      exported.sessions.find((value) => value.id === 'external-runner')!.metadata?.externalResult,
    ).toEqual(manualRunner.metadata.externalResult);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, a.cookie)).status,
    ).toBe(200);
    expect(
      ((await (await request('/api/export', 'GET', undefined, a.cookie)).json()) as TrainingExport)
        .sessions,
    ).toEqual(exported.sessions);
    const edited = {
      ...exported.sessions.find((value) => value.id === 'external-words')!,
      metadata: {
        ...exported.sessions.find((value) => value.id === 'external-words')!.metadata,
        externalResult: { ...bodies[3].metadata.externalResult, score: 125.5, errorCount: 2 },
      },
    };
    expect((await request('/api/entries/external-words', 'PUT', edited, a.cookie)).status).toBe(
      200,
    );
  });

  it('rejects mismatched write/import facts atomically and preserves native Copy evidence', async () => {
    const auth = await signIn('external-boundary@example.test');
    const base = {
      ...entry('external-word'),
      source: 'manual',
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'words',
          score: 0,
          errorCount: 0,
        },
      },
    };
    expect((await request('/api/entries', 'POST', base, auth.cookie)).status).toBe(201);
    const timed = {
      ...entry('native-external'),
      source: 'timer',
      minutes: 2,
      metadata: { practiceTool: 'external', elapsedSeconds: 120 },
    };
    expect((await request('/api/entries', 'POST', timed, auth.cookie)).status).toBe(201);
    expect(
      (
        await request(
          '/api/entries/native-external',
          'PUT',
          {
            ...timed,
            metadata: { ...timed.metadata, externalResult: base.metadata.externalResult },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          '/api/entries/native-external',
          'PUT',
          {
            ...timed,
            source: 'manual',
            metadata: { externalResult: base.metadata.externalResult },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);

    const before = await getAccountSnapshot(env, auth.user.id);
    for (const bad of [
      {
        ...base,
        metadata: { externalResult: { ...base.metadata.externalResult, errorPercent: 0 } },
      },
      { ...base, metadata: { externalResult: { ...base.metadata.externalResult, score: null } } },
      { ...base, accuracy: 100 },
      {
        ...base,
        metadata: {
          manualTiming: {
            ...createManualTiming('2026-09-28T13:00', 'UTC', 900),
            startedAt: '2026-09-28T12:45:01.000Z',
          },
        },
      },
    ]) {
      expect((await request('/api/entries/external-word', 'PUT', bad, auth.cookie)).status).toBe(
        400,
      );
      expect(
        (
          await request(
            '/api/import',
            'POST',
            { mode: 'replace', data: backup([entry('valid-prefix'), bad]) },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
      expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    }
    const attempt = submitCopyAnswer(
      createCopyAttempt(
        { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 1 },
        { id: 'external-copy', seed: 'external-copy-synthetic', now: '2026-09-28T12:00:00Z' },
      ),
      'E',
      { now: '2026-09-28T12:00:01Z' },
    );
    const copy = {
      ...entry('copy:external-copy'),
      ...copyAttemptSessionFields(attempt),
      notes: 'Native Copy',
      createdAt: '2026-09-28T12:00:01.000Z',
    };
    expect((await request('/api/entries', 'POST', copy, auth.cookie)).status).toBe(201);
    const saved = (
      (await (await request('/api/export', 'GET', undefined, auth.cookie)).json()) as TrainingExport
    ).sessions.find((value) => value.id === copy.id)!;
    expect(
      (
        await request(
          `/api/entries/${copy.id}`,
          'PUT',
          {
            ...saved,
            source: 'manual',
            metadata: { ...saved.metadata, externalResult: base.metadata.externalResult },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    const stripped = {
      ...saved,
      source: 'manual',
      metadata: { externalResult: base.metadata.externalResult },
    };
    for (const key of ['characterWpm', 'effectiveWpm', 'accuracy'] as const) delete stripped[key];
    expect((await request(`/api/entries/${copy.id}`, 'PUT', stripped, auth.cookie)).status).toBe(
      400,
    );
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, auth.cookie)
        ).json()) as TrainingExport
      ).sessions.find((value) => value.id === copy.id),
    ).toEqual(saved);
  });

  it('rolls back real SQL import failure without losing external evidence', async () => {
    const auth = await signIn('external-sql@example.test');
    const original = {
      ...entry('external-preserved'),
      source: 'manual',
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'callsign',
          score: 0,
        },
      },
    };
    expect((await request('/api/entries', 'POST', original, auth.cookie)).status).toBe(201);
    const before = await getAccountSnapshot(env, auth.user.id);
    db.sqlite.exec(
      "CREATE TRIGGER refuse_external BEFORE INSERT ON practice_entries WHEN NEW.id = 'external-refused' BEGIN SELECT RAISE(ABORT, 'synthetic external failure'); END;",
    );
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'replace',
            data: backup([
              { ...original, id: 'external-prefix' },
              { ...original, id: 'external-refused' },
            ]),
          },
          auth.cookie,
        )
      ).status,
    ).toBe(500);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
  });
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
    const answer = `${initial.targets[0]} XYZ`;
    const attempt = {
      ...submitCopyAnswer(initial, answer, { now: '2026-09-28T12:02:00.000Z' }),
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
    for (const copyAttempt of [
      { ...attempt, scoringVersion: 'native-copy-v3' },
      { ...attempt, scoringVersion: 'native-copy-v1' },
    ])
      expect(
        (
          await request(
            '/api/entries',
            'POST',
            { ...input, metadata: { copyAttempt } },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
    const first = await request('/api/entries', 'POST', input, auth.cookie);
    expect(first.status).toBe(201);
    const saved = (await first.json()) as { entry: PracticeSession };
    expect(saved.entry).toMatchObject({
      minutes: 53.75 / 60,
      characterWpm: 25,
      effectiveWpm: 10,
      accuracy: 50,
      metadata: { copyAttempt: attempt },
    });
    expect(attempt.trials[0].distance).toBe(3);
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
    const legacyAttempt = {
      ...submitCopyAnswer(
        { ...initial, id: 'native-api-v1', scoringVersion: 'native-copy-v1' },
        answer,
        { now: attempt.updatedAt },
      ),
      audioSeconds: attempt.audioSeconds,
      answerSeconds: attempt.answerSeconds,
      reviewSeconds: attempt.reviewSeconds,
    };
    const legacyInput = { ...input, ...copyAttemptSessionFields(legacyAttempt) };
    const legacyFirst = await request('/api/entries', 'POST', legacyInput, auth.cookie);
    expect(legacyFirst.status).toBe(201);
    const legacySaved = (await legacyFirst.json()) as { entry: PracticeSession };
    expect(legacySaved.entry).toMatchObject({
      accuracy: 33.4,
      metadata: { copyAttempt: legacyAttempt },
    });
    expect(legacyAttempt.trials[0].distance).toBe(4);
    const legacyRetry = await request('/api/entries', 'POST', legacyInput, auth.cookie);
    expect(legacyRetry.status).toBe(200);
    expect(await legacyRetry.json()).toEqual({ ...legacySaved, duplicate: true });
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
    expect(exported.sessions).toHaveLength(2);
    expect(exported.sessions).toEqual(expect.arrayContaining([saved.entry, legacySaved.entry]));
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
    const restoredRetry = await request('/api/entries', 'POST', legacyInput, auth.cookie);
    expect(restoredRetry.status).toBe(200);
    expect(await restoredRetry.json()).toMatchObject({
      entry: legacySaved.entry,
      duplicate: true,
    });
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

  it('persists dated presentation pins with exact retry, unchanged history, private ownership and reversible imports', async () => {
    const a = await signIn('task-pins-a@example.test');
    const b = await signIn('task-pins-b@example.test');
    const task = { ...customTask(), dismissedFromToday: true };
    expect((await request('/api/plan', 'POST', { task }, a.cookie)).status).toBe(201);
    expect((await request('/api/entries', 'POST', entry(), a.cookie)).status).toBe(201);
    const original = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    const op = operation(await snapshot(a.cookie), {
      type: 'task-edit',
      id: task.id,
      changes: { pinnedForDate: '2026-10-07' },
    });
    expect((await send(a.cookie, op)).status).toBe(200);
    const once = await snapshot(a.cookie);
    expect((await send(a.cookie, op)).status).toBe(200);
    expect(await snapshot(a.cookie)).toEqual(once);
    expect(once.plan).toEqual([{ ...task, pinnedForDate: '2026-10-07' }]);
    expect((await send(b.cookie, op)).status).toBe(409);
    expect((await send(b.cookie, operation(await snapshot(b.cookie), op.change))).status).toBe(400);
    expect(
      (
        await request(
          `/api/plan/${task.id}`,
          'PUT',
          { task: { ...task, pinnedForDate: '2026-10-07' } },
          b.cookie,
        )
      ).status,
    ).toBe(404);
    expect((await snapshot(b.cookie)).plan).toEqual([]);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions).toEqual(original.sessions);
    expect(exported.plan).toEqual(once.plan);
    for (const mode of ['merge', 'replace']) {
      expect(
        (await request('/api/import', 'POST', { mode, data: exported }, b.cookie)).status,
      ).toBe(200);
      expect(
        (await request('/api/import', 'POST', { mode, data: exported }, b.cookie)).status,
      ).toBe(200);
      expect((await snapshot(b.cookie)).plan).toEqual(once.plan);
    }
    const before = await snapshot(b.cookie);
    const invalid = { ...exported, plan: [{ ...task, pinnedForDate: '2026-02-30' }] };
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: invalid }, b.cookie)).status,
    ).toBe(400);
    expect(await snapshot(b.cookie)).toEqual(before);
    db.sqlite.exec(
      "CREATE TRIGGER reject_pin_import BEFORE INSERT ON training_plan BEGIN SELECT RAISE(ABORT, 'synthetic_pin_failure'); END;",
    );
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, b.cookie)).status,
    ).toBe(500);
    expect(await snapshot(b.cookie)).toEqual(before);
    expect(
      ((await (await request('/api/export', 'GET', undefined, b.cookie)).json()) as TrainingExport)
        .sessions,
    ).toEqual(exported.sessions);
    db.sqlite.exec('DROP TRIGGER reject_pin_import');
    expect(
      (
        await send(
          a.cookie,
          operation(await snapshot(a.cookie), {
            type: 'task-edit',
            id: task.id,
            changes: { pinnedForDate: null },
          }),
        )
      ).status,
    ).toBe(200);
    expect((await snapshot(a.cookie)).plan).toEqual([task]);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: original }, b.cookie)).status,
    ).toBe(200);
    expect((await snapshot(b.cookie)).plan[0]).not.toHaveProperty('pinnedForDate');
  });

  it('materializes an owned curriculum pin and preserves published assignment facts through direct edits and completion', async () => {
    const auth = await signIn('curriculum-pin@example.test');
    const settings = { ...DEFAULT_PROFILE, firstClassDate: '2026-10-01' };
    expect((await request('/api/settings', 'PUT', { settings }, auth.cookie)).status).toBe(200);
    const initial = await snapshot(auth.cookie);
    const task = initial.plan[0];
    const op = operation(initial, {
      type: 'task-edit',
      id: task.id,
      changes: { pinnedForDate: '2026-11-01' },
    });
    expect((await send(auth.cookie, op)).status).toBe(200);
    const pinned = (await snapshot(auth.cookie)).plan.find((item) => item.id === task.id)!;
    expect(pinned).toEqual({ ...task, pinnedForDate: '2026-11-01' });
    const row = db.sqlite
      .prepare('SELECT task_json FROM training_plan WHERE user_id = ? AND id = ?')
      .get(auth.user.id, task.id);
    expect(JSON.parse(String(row?.task_json))).toEqual(pinned);
    expect(
      (
        await request(
          `/api/plan/${task.id}`,
          'PUT',
          { task: { ...pinned, pinnedForDate: '2026-11-02', dueDate: '2026-10-31', lesson: 16 } },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await snapshot(auth.cookie)).plan.find((item) => item.id === task.id)).toEqual({
      ...task,
      pinnedForDate: '2026-11-02',
    });
    expect(
      (
        await send(
          auth.cookie,
          operation(await snapshot(auth.cookie), {
            type: 'task-status',
            ids: [task.id],
            done: true,
          }),
        )
      ).status,
    ).toBe(200);
    expect((await snapshot(auth.cookie)).plan.find((item) => item.id === task.id)).toEqual({
      ...task,
      pinnedForDate: '2026-11-02',
      done: true,
    });
    expect(
      (
        await send(
          auth.cookie,
          operation(await snapshot(auth.cookie), {
            type: 'task-edit',
            id: task.id,
            changes: { pinnedForDate: null },
          }),
        )
      ).status,
    ).toBe(200);
    expect((await snapshot(auth.cookie)).plan.find((item) => item.id === task.id)).toEqual({
      ...task,
      done: true,
    });
  });

  it('rejects malformed or ineligible new pins through direct and semantic writes without mutating rows or revisions', async () => {
    const auth = await signIn('invalid-task-pins@example.test');
    const task = customTask();
    expect((await request('/api/plan', 'POST', { task }, auth.cookie)).status).toBe(201);
    const before = await snapshot(auth.cookie);
    for (const pinnedForDate of ['2026-02-30', '2026-10-01']) {
      expect(
        (
          await request(
            `/api/plan/${task.id}`,
            'PUT',
            { task: { ...task, pinnedForDate } },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await send(
            auth.cookie,
            operation(before, { type: 'task-edit', id: task.id, changes: { pinnedForDate } }),
          )
        ).status,
      ).toBe(400);
      expect(await snapshot(auth.cookie)).toEqual(before);
    }
    expect(
      (
        await request(
          '/api/plan',
          'POST',
          { task: { ...task, id: 'new-invalid-pin', pinnedForDate: '2026-10-01' } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await snapshot(auth.cookie)).toEqual(before);
  });

  it('persists private mark-only edits with exact retry receipts, export/import fidelity and ownership fences', async () => {
    const auth = await signIn('marks-a@example.test');
    const other = await signIn('marks-b@example.test');
    const url = 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3';
    const task = {
      ...customTask(),
      kind: 'listening' as const,
      link: url,
      exercise: { type: 'audio' as const, url, characterWpm: 10 },
    };
    expect(
      (
        await send(
          auth.cookie,
          operation(await snapshot(auth.cookie), { type: 'task-create', task }),
        )
      ).status,
    ).toBe(200);
    const marks = [
      {
        taskId: task.id,
        url,
        speedWpm: 10,
        marks: [{ id: 'difficult-1', positionSeconds: 3.25, label: 'Synthetic private mark' }],
      },
    ];
    const edit = operation(
      await snapshot(auth.cookie),
      { type: 'task-edit', id: task.id, changes: { recordingMarks: marks } },
      'stable-mark-edit',
    );
    expect((await send(other.cookie, edit)).status).toBe(409);
    expect((await send('', edit)).status).toBe(401);
    expect((await send(auth.cookie, edit)).status).toBe(200);
    expect((await send(auth.cookie, edit)).status).toBe(200);
    expect(
      (await snapshot(auth.cookie)).plan.find((item) => item.id === task.id)?.recordingMarks,
    ).toEqual(marks);
    expect((await snapshot(other.cookie)).plan).not.toContainEqual(
      expect.objectContaining({ recordingMarks: marks }),
    );
    let data = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(data.sessions).toHaveLength(0);
    const heard = {
      ...entry('heard-with-marks'),
      minutes: 1,
      metadata: {
        plannedTaskId: task.id,
        evidence: {
          version: 1,
          type: 'timed',
          measurement: { seconds: 60, recallSeconds: 0 },
          recordings: [{ url, speedWpm: 10, seconds: 20, marks: marks[0] }],
        },
      },
    };
    expect((await request('/api/entries', 'POST', { entry: heard }, auth.cookie)).status).toBe(201);
    expect(
      (
        await send(
          auth.cookie,
          operation(await snapshot(auth.cookie), {
            type: 'task-edit',
            id: task.id,
            changes: { recordingMarks: [] },
          }),
        )
      ).status,
    ).toBe(200);
    data = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(
      (data.sessions[0].metadata?.evidence as { recordings: { marks: unknown }[] }).recordings[0]
        .marks,
    ).toEqual(marks[0]);
    data.plan!.find((item) => item.id === task.id)!.recordingMarks = marks;
    for (let n = 0; n < 2; n++)
      expect(
        (await request('/api/import', 'POST', { mode: 'merge', data }, other.cookie)).status,
      ).toBe(200);
    const imported = (await (
      await request('/api/export', 'GET', undefined, other.cookie)
    ).json()) as TrainingExport;
    expect(imported.sessions).toHaveLength(1);
    expect(imported.sessions).toEqual(data.sessions);
    expect(imported.plan?.find((item) => item.id === task.id)?.recordingMarks).toEqual(marks);
    const invalid = structuredClone(data);
    invalid.plan!.find((item) => item.id === task.id)!.recordingMarks![0].taskId = 'foreign';
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: invalid }, other.cookie)).status,
    ).toBe(400);
    expect((await snapshot(other.cookie)).plan).toEqual(imported.plan);
    expect(
      (await request('/api/reset', 'POST', { confirmation: 'RESET' }, auth.cookie)).status,
    ).toBe(200);
    expect((await send(auth.cookie, { ...edit, id: 'delayed-old-mark' })).status).toBe(409);
    expect((await snapshot(auth.cookie)).plan).not.toContainEqual(
      expect.objectContaining({ recordingMarks: marks }),
    );
  });

  it('retains private curriculum marks when the schedule refreshes and rejects malformed edits atomically', async () => {
    const auth = await signIn('curriculum-marks@example.test');
    expect(
      (
        await send(
          auth.cookie,
          operation(await snapshot(auth.cookie), {
            type: 'settings',
            changes: { level: 'intermediate', firstClassDate: '2026-10-08', timezone: 'UTC' },
          }),
        )
      ).status,
    ).toBe(200);
    const before = await snapshot(auth.cookie);
    const task = before.plan.find(
      (item) => item.source === 'curriculum' && item.exercise?.type === 'audio',
    )!;
    expect(task).toBeDefined();
    const exercise = task.exercise as { type: 'audio'; url: string; characterWpm?: number };
    const marks = [
      {
        taskId: task.id,
        url: exercise.url,
        speedWpm: exercise.characterWpm!,
        marks: [
          { id: 'curriculum-mark', positionSeconds: 3, label: 'Synthetic curriculum annotation' },
        ],
      },
    ];
    expect(
      (
        await send(
          auth.cookie,
          operation(before, { type: 'task-edit', id: task.id, changes: { recordingMarks: marks } }),
        )
      ).status,
    ).toBe(200);
    const saved = await snapshot(auth.cookie);
    for (const positionSeconds of [-1, 86401]) {
      const invalid = structuredClone(marks);
      invalid[0].marks[0].positionSeconds = positionSeconds;
      expect(
        (
          await send(
            auth.cookie,
            operation(saved, {
              type: 'task-edit',
              id: task.id,
              changes: { recordingMarks: invalid },
            }),
          )
        ).status,
      ).toBe(400);
      expect(await snapshot(auth.cookie)).toEqual(saved);
    }
    expect(
      (
        await send(
          auth.cookie,
          operation(saved, { type: 'settings', changes: { displayName: 'Synthetic learner' } }),
        )
      ).status,
    ).toBe(200);
    expect((await snapshot(auth.cookie)).plan.find((item) => item.id === task.id)).toMatchObject({
      recordingMarks: marks,
      exercise: task.exercise,
      curriculum: task.curriculum,
    });
    expect(
      (
        await send(
          auth.cookie,
          operation(await snapshot(auth.cookie), {
            type: 'task-edit',
            id: task.id,
            changes: { recordingMarks: null },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await snapshot(auth.cookie)).plan.find((item) => item.id === task.id),
    ).not.toHaveProperty('recordingMarks');
  });

  it('saves and round-trips curriculum-only official marks without fabricating speed measurements', async () => {
    const auth = await signIn('published-file-marks@example.test');
    for (const [level, exerciseId, speedWpm] of [
      ['fundamental', 's3-d1-t6', 7],
      ['advanced', 's13-d1-t2', 30],
    ] as const) {
      expect(
        (
          await send(
            auth.cookie,
            operation(await snapshot(auth.cookie), {
              type: 'settings',
              changes: { level, firstClassDate: '2026-10-08', timezone: 'UTC' },
            }),
          )
        ).status,
      ).toBe(200);
      const state = await snapshot(auth.cookie);
      const task = state.plan.find((item) => item.curriculum?.exerciseId === exerciseId)!;
      const url = (task.exercise as { url: string }).url;
      const marks = [
        {
          taskId: task.id,
          url,
          speedWpm,
          marks: [
            {
              id: `published-${speedWpm}`,
              positionSeconds: 0,
              label: 'Synthetic published source mark',
            },
          ],
        },
      ];
      expect(
        (
          await send(
            auth.cookie,
            operation(state, {
              type: 'task-edit',
              id: task.id,
              changes: { recordingMarks: marks },
            }),
          )
        ).status,
      ).toBe(200);
      const value = {
        ...entry(`published-${speedWpm}`),
        minutes: 4 / 60,
        metadata: {
          plannedTaskId: task.id,
          evidence: {
            version: 1,
            type: 'timed',
            measurement: { seconds: 4, recallSeconds: 0 },
            recordings: [{ url, speedWpm: Number(speedWpm), seconds: 4, marks: marks[0] }],
          },
        },
      };
      expect((await request('/api/entries', 'POST', { entry: value }, auth.cookie)).status).toBe(
        201,
      );
      const invalid = structuredClone(value);
      invalid.id += '-wrong-native';
      invalid.metadata.evidence.recordings[0].speedWpm = 99;
      expect((await request('/api/entries', 'POST', { entry: invalid }, auth.cookie)).status).toBe(
        400,
      );
    }
    const data = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(data.sessions).toHaveLength(2);
    for (const session of data.sessions) {
      const evidence = session.metadata?.evidence as { recordings: RecordingEvidence[] };
      expect(evidence.recordings[0].marks?.marks[0].label).toBe('Synthetic published source mark');
      expect(evidence.recordings[0]).not.toHaveProperty('characterWpm');
      expect(evidence.recordings[0]).not.toHaveProperty('effectiveWpm');
    }
    const other = await signIn('published-file-import@example.test');
    for (let n = 0; n < 2; n++)
      expect(
        (await request('/api/import', 'POST', { mode: 'merge', data }, other.cookie)).status,
      ).toBe(200);
    const copy = (await (
      await request('/api/export', 'GET', undefined, other.cookie)
    ).json()) as TrainingExport;
    expect(copy.sessions).toEqual(data.sessions);
    expect(copy.plan?.filter((item) => item.recordingMarks?.length)).toEqual(
      data.plan?.filter((item) => item.recordingMarks?.length),
    );
  });

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
  it('keeps daily word subtotals private, immutable, repeatable and portable with corrections', async () => {
    const auth = await signIn('daily-word-owner@example.test');
    const source = generated();
    const raw = {
      ...source.metadata.evidence,
      measurement: { seconds: 600, recallSeconds: 120 },
      wordListeningSeconds: 480,
    };
    const body = { ...source, metadata: { practicePurpose: 'review', evidence: raw } };
    const response = await request('/api/entries', 'POST', body, auth.cookie);
    expect(response.status).toBe(201);
    const saved = ((await response.json()) as { entry: PracticeSession }).entry;
    expect(saved).toMatchObject({
      minutes: 10,
      metadata: { evidence: raw, practicePurpose: 'review' },
    });
    expect((await request('/api/entries', 'POST', body, auth.cookie)).status).toBe(200);
    expect(
      (
        await request(
          `/api/entries/${saved.id}`,
          'PUT',
          {
            ...saved,
            metadata: { ...saved.metadata, evidence: { ...raw, wordListeningSeconds: 479 } },
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
          ...raw,
          correction: { seconds: 630, reason: 'Thirty seconds of additional manual practice' },
        },
      },
    };
    expect((await request(`/api/entries/${saved.id}`, 'PUT', corrected, auth.cookie)).status).toBe(
      200,
    );
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0]).toMatchObject({
      minutes: 10.5,
      metadata: { evidence: { ...raw, correction: { seconds: 630 } } },
    });
    const other = await signIn('daily-word-other@example.test');
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, other.cookie)).json()) as {
          entries: PracticeSession[];
        }
      ).entries,
    ).toEqual([]);
    expect((await request(`/api/entries/${saved.id}`, 'PUT', corrected, other.cookie)).status).toBe(
      404,
    );
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
  });

  it('rejects impossible word budgets through writes and transactional replacement without changing history', async () => {
    const auth = await signIn('daily-word-invalid@example.test');
    expect((await request('/api/entries', 'POST', generated(), auth.cookie)).status).toBe(201);
    const before = await getAccountSnapshot(env, auth.user.id);
    const source = generated();
    const malformed = {
      ...source,
      id: 'impossible-words',
      metadata: { evidence: { ...source.metadata.evidence, wordListeningSeconds: 61 } },
    };
    expect((await request('/api/entries', 'POST', malformed, auth.cookie)).status).toBe(400);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...exported, sessions: [malformed] } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
  });
  const words = (characterWpm = 20): Extract<GeneratedListeningSummary, { mode: 'words' }> => ({
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

  it('round trips public Story evidence privately and rejects forged sources atomically', async () => {
    const auth = await signIn('story-owner@example.test');
    const story: GeneratedListeningSummary = {
      mode: 'story',
      storyId: 'story-trail',
      characterWpm: 28,
      effectiveWpm: 14,
      toneHz: 650,
      sentenceGapSeconds: 2,
    };
    const source = generated([story]);
    const created = await request('/api/entries', 'POST', source, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(saved).toMatchObject({
      characterWpm: 28,
      effectiveWpm: 14,
      minutes: 1,
      metadata: { evidence: source.metadata.evidence },
    });
    expect(saved.qsoCount).toBeUndefined();
    expect((await request('/api/entries', 'POST', source, auth.cookie)).status).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
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
    const before = await getAccountSnapshot(env, auth.user.id);
    const malformed = generated([
      { ...story, storyId: 'restricted-course-story' } as unknown as GeneratedListeningSummary,
    ]);
    expect(
      (await request('/api/entries', 'POST', { ...malformed, id: 'invalid-story' }, auth.cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...exported, sessions: [malformed] } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    const other = await signIn('story-other@example.test');
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

  it('preserves distinct and historical equal QSO tones through private export/import without rewriting facts', async () => {
    const auth = await signIn('qso-pitch-owner@example.test');
    const qso: Extract<GeneratedListeningSummary, { mode: 'qso' }> = {
      mode: 'qso',
      scenarioId: 'short-contact',
      stations: ['W1DPN', 'K2MVR'],
      tonesHz: [1000, 950],
      characterWpm: 20,
      effectiveWpm: 10,
      transmissionGapSeconds: 2,
    };
    const source = generated([qso, { ...qso, tonesHz: [1000, 1000], characterWpm: 25 }]);
    expect((await request('/api/entries', 'POST', source, auth.cookie)).status).toBe(201);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0].metadata?.evidence).toMatchObject({
      generatedListening: source.metadata.evidence.generatedListening,
    });
    expect(exported.sessions[0].qsoCount).toBeUndefined();
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
    const before = await getAccountSnapshot(env, auth.user.id);
    const invalid = { ...generated([{ ...qso, tonesHz: [1000, 1050] }]), id: 'invalid-pitch' };
    expect((await request('/api/entries', 'POST', invalid, auth.cookie)).status).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...exported, sessions: [invalid] } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    const other = await signIn('qso-pitch-other@example.test');
    expect(
      (
        (await (await request('/api/entries', 'GET', undefined, other.cookie)).json()) as {
          entries: PracticeSession[];
        }
      ).entries,
    ).toEqual([]);
    expect(
      (
        await request(
          `/api/entries/${exported.sessions[0].id}`,
          'PUT',
          exported.sessions[0],
          other.cookie,
        )
      ).status,
    ).toBe(404);
  });

  it('retains precise 55/60 WPM evidence through private writes and transactional import', async () => {
    const auth = await signIn('precise-owner@example.test');
    const sources = [
      generated([{ ...words(55), effectiveWpm: 55, toneHz: 617, wordGapSeconds: 0.3 }]),
      {
        ...generated([
          {
            mode: 'story',
            storyId: 'story-trail',
            characterWpm: 60,
            effectiveWpm: 51,
            toneHz: 419,
            sentenceGapSeconds: 2,
          },
        ]),
        id: 'precise-story',
      },
    ];
    for (const source of sources) {
      expect((await request('/api/entries', 'POST', source, auth.cookie)).status).toBe(201);
    }
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(
      exported.sessions
        .map(({ characterWpm, effectiveWpm }) => [characterWpm, effectiveWpm])
        .sort(),
    ).toEqual([
      [55, 55],
      [60, 51],
    ]);
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
    const before = await getAccountSnapshot(env, auth.user.id);
    const invalid = generated([{ ...words(61), effectiveWpm: 61 }]);
    expect(
      (await request('/api/entries', 'POST', { ...invalid, id: 'invalid-precise' }, auth.cookie))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...exported, sessions: [invalid] } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
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

describe('assigned recording pass evidence', () => {
  const firstUrl = 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3';
  const secondUrl = 'https://cwa.cwops.org/wp-content/uploads/WD101_13.mp3';
  const measured = (id = 'recording-passes'): PracticeSession => {
    // Synthetic observed durations deliberately differ from the catalog estimate.
    const recordings: RecordingEvidence[] = [
      {
        url: firstUrl,
        speedWpm: 10,
        characterWpm: 25,
        effectiveWpm: 10,
        seconds: 36,
        passes: {
          version: 1,
          method: 'native-1x',
          durations: [
            { durationSeconds: 12, completedPasses: 2 },
            { durationSeconds: 6, completedPasses: 1 },
          ],
        },
      },
      {
        url: secondUrl,
        speedWpm: 13,
        characterWpm: 25,
        effectiveWpm: 13,
        seconds: 20.25,
        passes: {
          version: 1,
          method: 'native-1x',
          durations: [{ durationSeconds: 20, completedPasses: 1 }],
        },
      },
    ];
    const evidence: Extract<PracticeEvidence, { type: 'timed' }> = {
      version: 1,
      type: 'timed',
      measurement: { seconds: 66.25, recallSeconds: 10 },
      recordings,
    };
    return {
      ...entry(id),
      kind: 'listening',
      source: 'timer',
      minutes: 66.25 / 60,
      metadata: {
        practiceTool: 'audio',
        elapsedSeconds: 66.25,
        recallSeconds: 10,
        recordings,
        evidence,
      },
    };
  };
  const tinyPass = (
    id: string,
    recordingSeconds: number,
    measurement: { seconds: number; recallSeconds: number },
  ): PracticeSession => ({
    ...entry(id),
    kind: 'listening',
    source: 'timer',
    minutes: measurement.seconds / 60,
    metadata: {
      evidence: {
        version: 1,
        type: 'timed',
        measurement,
        recordings: [
          {
            url: firstUrl,
            speedWpm: 10,
            seconds: recordingSeconds,
            passes: {
              version: 1,
              method: 'native-1x',
              durations: [{ durationSeconds: 1e-20, completedPasses: Number.MAX_SAFE_INTEGER }],
            },
          },
        ],
      },
    },
  });
  const alterRecording = (
    input: PracticeSession,
    change: (recording: RecordingEvidence) => void,
  ): PracticeSession => {
    const changed = structuredClone(input);
    const evidence = changed.metadata!.evidence!;
    if (evidence.type !== 'timed') throw new Error('Expected timed fixture.');
    change(evidence.recordings[0]);
    changed.metadata!.recordings = structuredClone(evidence.recordings);
    return changed;
  };
  const stored = (owner: string) =>
    db.sqlite
      .prepare('SELECT id,entry_json FROM practice_entries WHERE user_id=? ORDER BY id')
      .all(owner);
  const exportFor = async (cookie: string) =>
    (await (await request('/api/export', 'GET', undefined, cookie)).json()) as TrainingExport;
  const task = (): PlannedTask => ({
    id: 'owned-recording-task',
    title: 'Assigned short words',
    kind: 'listening',
    done: false,
    notes: '',
    createdAt: '2026-09-28T12:00:00.000Z',
    dueDate: entry().date,
    exercise: { type: 'audio', url: firstUrl, minimumPasses: 4, maximumPasses: 5 },
  });

  it('retains mixed-file facts through exact retries, corrections, merge and replace backups', async () => {
    const auth = await signIn('recording-pass-roundtrip@example.test');
    const frozen = measured();
    const frozenBody = JSON.stringify(frozen);
    const created = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(saved.metadata?.evidence).toEqual(frozen.metadata?.evidence);
    expect(saved.metadata?.recordings).toEqual(frozen.metadata?.recordings);
    expect(saved.characterWpm).toBe(25);
    expect(saved.effectiveWpm).toBeUndefined();
    const originalSql = stored(auth.user.id);
    const retried = await request('/api/entries', 'POST', frozen, auth.cookie);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ duplicate: true, entry: saved });
    expect(JSON.stringify(frozen)).toBe(frozenBody);
    expect(stored(auth.user.id)).toEqual(originalSql);
    const changedRetry = alterRecording(frozen, (recording) => {
      recording.passes!.durations[0].completedPasses = 1;
    });
    expect((await request('/api/entries', 'POST', changedRetry, auth.cookie)).status).toBe(409);
    expect(stored(auth.user.id)).toEqual(originalSql);

    for (const change of [
      (recording: RecordingEvidence) => {
        recording.passes!.durations[0].durationSeconds = 13;
      },
      (recording: RecordingEvidence) => {
        recording.passes!.durations[0].completedPasses = 1;
      },
      (recording: RecordingEvidence) => {
        delete recording.passes;
      },
    ]) {
      const rejected = await request(
        `/api/entries/${saved.id}`,
        'PUT',
        alterRecording(saved, change),
        auth.cookie,
      );
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({
        error: expect.stringContaining('Measured source evidence cannot be changed'),
      });
      expect(stored(auth.user.id)).toEqual(originalSql);
    }
    const edited = {
      ...saved,
      notes: 'Retained passes; corrected recall interruption',
      metadata: {
        ...saved.metadata,
        evidence: {
          ...frozen.metadata!.evidence!,
          correction: { seconds: 61.25, recallSeconds: 5, reason: 'Recall interruption' },
        },
      },
    };
    const updated = await request(`/api/entries/${saved.id}`, 'PUT', edited, auth.cookie);
    expect(updated.status).toBe(200);
    const corrected = ((await updated.json()) as { entry: PracticeSession }).entry;
    expect(corrected.minutes).toBe(61.25 / 60);
    expect(corrected.metadata).toMatchObject({
      elapsedSeconds: 66.25,
      recallSeconds: 10,
      recordings: frozen.metadata!.recordings,
      evidence: {
        measurement: { seconds: 66.25, recallSeconds: 10 },
        recordings: frozen.metadata!.recordings,
        correction: { seconds: 61.25, recallSeconds: 5 },
      },
    });
    const exported = await exportFor(auth.cookie);
    expect(exported.sessions).toEqual([corrected]);
    for (const mode of ['merge', 'replace']) {
      const restored = await request('/api/import', 'POST', { mode, data: exported }, auth.cookie);
      expect(restored.status).toBe(200);
      expect((await exportFor(auth.cookie)).sessions).toEqual(exported.sessions);
    }
    expect(stored(auth.user.id)).toHaveLength(1);
  });

  it('rejects completed passes with no or insufficient actual listening without changing stored data', async () => {
    const auth = await signIn('recording-pass-time-bounds@example.test');
    expect((await request('/api/entries', 'POST', measured(), auth.cookie)).status).toBe(201);
    const originalSql = stored(auth.user.id);
    const originalAccount = await getAccountSnapshot(env, auth.user.id);
    const invalid = [
      tinyPass('zero-listening', 0, { seconds: 1, recallSeconds: 1 }),
      tinyPass('insufficient-positive-listening', 1e-10, { seconds: 1, recallSeconds: 0 }),
      tinyPass('all-recall-total', 0.0001, { seconds: 1, recallSeconds: 1 }),
    ];
    for (const input of invalid) {
      const response = await request('/api/entries', 'POST', input, auth.cookie);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/passes|recording.*recall/i),
      });
      expect(stored(auth.user.id)).toEqual(originalSql);
      expect(await getAccountSnapshot(env, auth.user.id)).toEqual(originalAccount);
    }
  });

  it.each(['merge', 'replace'] as const)(
    'preserves account rows and revisions when a %s import leaves no listening for completed passes',
    async (mode) => {
      const auth = await signIn(`recording-pass-import-time-bounds-${mode}@example.test`);
      expect((await request('/api/plan', 'POST', task(), auth.cookie)).status).toBe(201);
      expect((await request('/api/entries', 'POST', measured(), auth.cookie)).status).toBe(201);
      const originalSql = stored(auth.user.id);
      const originalAccount = await getAccountSnapshot(env, auth.user.id);
      const originalExport = await exportFor(auth.cookie);
      const response = await request(
        '/api/import',
        'POST',
        {
          mode,
          data: {
            ...originalExport,
            sessions: [
              measured('valid-import-prefix'),
              tinyPass('invalid-all-recall-import', 0.0001, { seconds: 1, recallSeconds: 1 }),
            ],
            plan: [],
            profile: { ...DEFAULT_PROFILE, callsign: 'N0CHANGED' },
          },
        },
        auth.cookie,
      );
      expect(response.status).toBe(400);
      expect(stored(auth.user.id)).toEqual(originalSql);
      expect(await getAccountSnapshot(env, auth.user.id)).toEqual(originalAccount);
      const after = await exportFor(auth.cookie);
      expect(after.sessions).toEqual(originalExport.sessions);
      expect(after.plan).toEqual(originalExport.plan);
      expect(after.profile).toEqual(originalExport.profile);
    },
  );

  it('rejects an all-recall correction while retaining the immutable measured pass facts', async () => {
    const auth = await signIn('recording-pass-corrected-time-bounds@example.test');
    const created = await request(
      '/api/entries',
      'POST',
      tinyPass('corrected-all-recall', 0.0001, { seconds: 1, recallSeconds: 0 }),
      auth.cookie,
    );
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    const originalSql = stored(auth.user.id);
    const originalAccount = await getAccountSnapshot(env, auth.user.id);
    const corrected = {
      ...saved,
      notes: 'Invalid correction cannot replace the original notes',
      metadata: {
        ...saved.metadata,
        evidence: {
          ...saved.metadata!.evidence!,
          correction: { recallSeconds: 1, reason: 'All time reclassified as recall' },
        },
      },
    };
    const response = await request(`/api/entries/${saved.id}`, 'PUT', corrected, auth.cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('Corrected total must include the measured recording time'),
    });
    expect(stored(auth.user.id)).toEqual(originalSql);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(originalAccount);
    expect((await exportFor(auth.cookie)).sessions).toEqual([saved]);
  });

  it('retains valid short listening beside long recall through correction and portable imports', async () => {
    const auth = await signIn('recording-pass-cancellation-bounds@example.test');
    const recordingSeconds = 1e-8;
    const recallSeconds = 80_000;
    const totalSeconds = recallSeconds + recordingSeconds;
    // Subtraction loses precision at this scale; the recording still has actual positive time.
    expect(totalSeconds - recallSeconds).toBeLessThan(recordingSeconds);
    const input = tinyPass('short-listening-long-recall', recordingSeconds, {
      seconds: totalSeconds,
      recallSeconds,
    });
    const evidence = input.metadata!.evidence!;
    if (evidence.type !== 'timed') throw new Error('Expected timed fixture.');
    evidence.recordings[0].passes!.durations = [
      { durationSeconds: recordingSeconds, completedPasses: 1 },
    ];
    const created = await request('/api/entries', 'POST', input, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    const updated = await request(
      `/api/entries/${saved.id}`,
      'PUT',
      {
        ...saved,
        metadata: {
          ...saved.metadata,
          evidence: {
            ...saved.metadata!.evidence!,
            correction: {
              seconds: totalSeconds,
              recallSeconds,
              reason: 'Confirmed measured listening and recall',
            },
          },
        },
      },
      auth.cookie,
    );
    expect(updated.status).toBe(200);
    const corrected = ((await updated.json()) as { entry: PracticeSession }).entry;
    expect(corrected.metadata?.evidence).toMatchObject({
      measurement: { seconds: totalSeconds, recallSeconds },
      recordings: evidence.recordings,
      correction: { seconds: totalSeconds, recallSeconds },
    });
    const exported = await exportFor(auth.cookie);
    for (const mode of ['merge', 'replace']) {
      expect(
        (await request('/api/import', 'POST', { mode, data: exported }, auth.cookie)).status,
      ).toBe(200);
      expect((await exportFor(auth.cookie)).sessions).toEqual([corrected]);
    }
    expect(stored(auth.user.id)).toHaveLength(1);
  });

  it('rejects malformed pass facts without writing entries or replacing private account data', async () => {
    const auth = await signIn('recording-pass-invalid@example.test');
    expect((await request('/api/plan', 'POST', task(), auth.cookie)).status).toBe(201);
    expect((await request('/api/entries', 'POST', measured(), auth.cookie)).status).toBe(201);
    const originalSql = stored(auth.user.id);
    const originalAccount = await getAccountSnapshot(env, auth.user.id);
    const originalExport = await exportFor(auth.cookie);
    const valid = measured().metadata!.evidence!;
    if (valid.type !== 'timed') throw new Error('Expected timed fixture.');
    const passes = valid.recordings[0].passes!;
    const malformed = [
      { ...passes, coverage: [[0, 12]] },
      { ...passes, method: 'wall-clock' },
      { ...passes, version: 2 },
      { ...passes, durations: [{ durationSeconds: 12, completedPasses: -1 }] },
      { ...passes, durations: [{ durationSeconds: 12, completedPasses: 1.5 }] },
      // Nonfinite values become null in HTTP JSON and must still be rejected.
      { ...passes, durations: [{ durationSeconds: Infinity, completedPasses: 1 }] },
      { ...passes, durations: [{ durationSeconds: 12, completedPasses: NaN }] },
      { ...passes, durations: [{ durationSeconds: 0, completedPasses: 0 }] },
      { ...passes, durations: [{ durationSeconds: 86401, completedPasses: 0 }] },
      { ...passes, durations: [...passes.durations, passes.durations[0]] },
      {
        ...passes,
        durations: Array.from({ length: 101 }, (_, index) => ({
          durationSeconds: index + 1,
          completedPasses: 0,
        })),
      },
      { ...passes, durations: [{ durationSeconds: 12, completedPasses: 4 }] },
    ];
    for (const value of malformed) {
      const invalid = {
        ...measured('invalid-passes'),
        metadata: {
          evidence: { ...valid, recordings: [{ ...valid.recordings[0], passes: value }] },
        },
      };
      const rejected = await request('/api/entries', 'POST', invalid, auth.cookie);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({
        error: expect.stringMatching(/pass|duration/i),
      });
      expect(stored(auth.user.id)).toEqual(originalSql);
      expect(await getAccountSnapshot(env, auth.user.id)).toEqual(originalAccount);
    }
    const invalidReplacement = {
      ...measured('bad-replacement'),
      metadata: {
        evidence: {
          ...valid,
          recordings: [{ ...valid.recordings[0], passes: malformed.at(-1) }],
        },
      },
    };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'replace',
            data: {
              ...originalExport,
              sessions: [measured('valid-replacement'), invalidReplacement],
              plan: [],
              profile: { ...DEFAULT_PROFILE, callsign: 'N0CHANGED' },
            },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(stored(auth.user.id)).toEqual(originalSql);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(originalAccount);
    const after = await exportFor(auth.cookie);
    expect(after.sessions).toEqual(originalExport.sessions);
    expect(after.plan).toEqual(originalExport.plan);
    expect(after.profile).toEqual(originalExport.profile);
  });

  it('rolls back pass evidence, history and plan if a later replacement SQL write fails', async () => {
    const auth = await signIn('recording-pass-sql-rollback@example.test');
    await request('/api/plan', 'POST', task(), auth.cookie);
    await request('/api/entries', 'POST', measured(), auth.cookie);
    const originalSql = stored(auth.user.id);
    const originalAccount = await getAccountSnapshot(env, auth.user.id);
    const originalExport = await exportFor(auth.cookie);
    db.sqlite.exec(
      `CREATE TRIGGER pass_failure BEFORE INSERT ON practice_entries WHEN NEW.id = 'broken-passes' BEGIN SELECT RAISE(ABORT, 'pass_failure'); END;`,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(
      '/api/import',
      'POST',
      {
        mode: 'replace',
        data: {
          ...originalExport,
          sessions: [measured('first-valid-passes'), measured('broken-passes')],
          plan: [],
          profile: { ...DEFAULT_PROFILE, callsign: 'N0CHANGED' },
        },
      },
      auth.cookie,
    );
    expect(response.status).toBe(500);
    expect(stored(auth.user.id)).toEqual(originalSql);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(originalAccount);
    const after = await exportFor(auth.cookie);
    expect(after.sessions).toEqual(originalExport.sessions);
    expect(after.plan).toEqual(originalExport.plan);
    expect(after.profile).toEqual(originalExport.profile);
  });

  it('keeps unmeasured old backups distinct from measured zero and admits more than 100 short passes', async () => {
    const auth = await signIn('recording-pass-compatible@example.test');
    const old = alterRecording(measured('old-unmeasured-passes'), (recording) => {
      delete recording.passes;
    });
    const evidence = old.metadata!.evidence!;
    if (evidence.type !== 'timed') throw new Error('Expected timed fixture.');
    delete evidence.recordings[1].passes;
    old.metadata!.recordings = structuredClone(evidence.recordings);
    const zero = alterRecording(measured('observed-zero-passes'), (recording) => {
      recording.passes!.durations = [{ durationSeconds: 12, completedPasses: 0 }];
    });
    const many = alterRecording(measured('many-short-passes'), (recording) => {
      recording.passes!.durations = [{ durationSeconds: 0.25, completedPasses: 101 }];
    });
    const imported = await request(
      '/api/import',
      'POST',
      { mode: 'merge', data: backup([old, zero, many]) },
      auth.cookie,
    );
    expect(imported.status).toBe(200);
    const exported = await exportFor(auth.cookie);
    const firstRecording = (id: string) => {
      const evidence = exported.sessions.find((session) => session.id === id)!.metadata!.evidence!;
      if (evidence.type !== 'timed') throw new Error('Expected timed fixture.');
      return evidence.recordings[0];
    };
    expect(firstRecording(old.id)).not.toHaveProperty('passes');
    expect(firstRecording(zero.id).passes?.durations[0].completedPasses).toBe(0);
    expect(firstRecording(many.id).passes?.durations[0].completedPasses).toBe(101);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, auth.cookie))
        .status,
    ).toBe(200);
    expect((await exportFor(auth.cookie)).sessions).toEqual(exported.sessions);
  });

  it.each(['omitted', 'zero'] as const)(
    'preserves historical correction tolerance for %s passes through save and portable imports',
    async (passState) => {
      const auth = await signIn(`recording-pass-old-correction-${passState}@example.test`);
      const recordingSeconds = 5 + 0.001 - 5;
      // The previously accepted addition comparison retains this v1 rounding boundary.
      expect(recordingSeconds).toBeGreaterThan(0.001);
      const recording: RecordingEvidence = {
        url: 'https://example.test/old.wav',
        seconds: recordingSeconds,
      };
      if (passState === 'zero') {
        recording.passes = {
          version: 1,
          method: 'native-1x',
          durations: [{ durationSeconds: 1, completedPasses: 0 }],
        };
      }
      const rawEvidence: Extract<PracticeEvidence, { type: 'timed' }> = {
        version: 1,
        type: 'timed',
        measurement: { seconds: 5.001, recallSeconds: 5 },
        recordings: [recording],
      };
      const input: PracticeSession = {
        ...entry(`old-correction-${passState}`),
        kind: 'listening',
        source: 'timer',
        minutes: 5.001 / 60,
        metadata: { evidence: rawEvidence },
      };
      const created = await request('/api/entries', 'POST', input, auth.cookie);
      expect(created.status).toBe(201);
      const saved = ((await created.json()) as { entry: PracticeSession }).entry;
      expect(saved.metadata?.evidence).toEqual(rawEvidence);
      const correction = { seconds: 5, recallSeconds: 5, reason: 'Historical correction' };
      const updated = await request(
        `/api/entries/${saved.id}`,
        'PUT',
        {
          ...saved,
          metadata: {
            ...saved.metadata,
            evidence: { ...rawEvidence, correction },
          },
        },
        auth.cookie,
      );
      expect(updated.status).toBe(200);
      const corrected = ((await updated.json()) as { entry: PracticeSession }).entry;
      expect(corrected.id).toBe(input.id);
      expect(corrected.minutes).toBe(5 / 60);
      expect(corrected.metadata?.evidence).toEqual({ ...rawEvidence, correction });
      if (passState === 'omitted') expect(recording).not.toHaveProperty('passes');
      else expect(recording.passes?.durations[0].completedPasses).toBe(0);
      const exported = await exportFor(auth.cookie);
      expect(exported.version).toBe(1);
      expect(exported.sessions).toEqual([corrected]);
      for (const mode of ['merge', 'replace']) {
        expect(
          (await request('/api/import', 'POST', { mode, data: exported }, auth.cookie)).status,
        ).toBe(200);
        expect((await exportFor(auth.cookie)).sessions).toEqual([corrected]);
        expect(stored(auth.user.id).map((row) => row.id)).toEqual([input.id]);
      }
    },
  );

  it('scopes pass-bearing saves and task attribution to the authenticated owner without completing tasks', async () => {
    const owner = await signIn('recording-pass-owner@example.test');
    const foreign = await signIn('recording-pass-foreign@example.test');
    const ownedTask = task();
    expect((await request('/api/plan', 'POST', ownedTask, owner.cookie)).status).toBe(201);
    const measuredEntry = measured();
    const linked = {
      ...measuredEntry,
      metadata: { ...measuredEntry.metadata, plannedTaskId: ownedTask.id },
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
    const created = await request('/api/entries', 'POST', linked, owner.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(saved.metadata?.plannedTaskId).toBe(ownedTask.id);
    expect(stored(foreign.user.id)).toEqual([]);
    expect((await request(`/api/entries/${saved.id}`, 'PUT', saved, foreign.cookie)).status).toBe(
      404,
    );
    const ownedSql = stored(owner.user.id);
    // Delete is idempotent for the caller's dataset, including an absent ID.
    expect(
      (await request(`/api/entries/${saved.id}`, 'DELETE', undefined, foreign.cookie)).status,
    ).toBe(200);
    expect(stored(owner.user.id)).toEqual(ownedSql);
    expect((await exportFor(foreign.cookie)).sessions).toEqual([]);
    const exported = await exportFor(owner.cookie);
    expect(exported.plan).toEqual([ownedTask]);
    expect(exported.plan![0].done).toBe(false);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, foreign.cookie))
        .status,
    ).toBe(200);
    const restored = await exportFor(foreign.cookie);
    expect(restored.sessions).toEqual(exported.sessions);
    expect(restored.plan).toEqual(exported.plan);
    expect(stored(owner.user.id)).toHaveLength(1);
    expect(stored(foreign.user.id)).toHaveLength(1);
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
  it('corrects audio recall without inflating total time or replacing raw source facts', async () => {
    const auth = await signIn('audio-recall-correction@example.test');
    const raw = {
      version: 1,
      type: 'timed',
      measurement: { seconds: 90.25, recallSeconds: 10 },
      recordings: [{ url: 'https://example.test/recall-source.wav', seconds: 80.25 }],
    };
    const source = {
      ...measured(),
      kind: 'listening',
      metadata: {
        ...measured().metadata,
        practiceTool: 'audio',
        recordings: raw.recordings,
        evidence: raw,
      },
    };
    const created = await request('/api/entries', 'POST', source, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    const stored = () =>
      db.sqlite
        .prepare('SELECT entry_json FROM practice_entries WHERE user_id=? AND id=?')
        .get(auth.user.id, saved.id)?.entry_json;
    const originalBytes = stored();
    const changedRawRecall = {
      ...saved,
      metadata: {
        ...saved.metadata,
        recallSeconds: 9,
        evidence: { ...raw, measurement: { ...raw.measurement, recallSeconds: 9 } },
      },
    };
    const changed = await request(`/api/entries/${saved.id}`, 'PUT', changedRawRecall, auth.cookie);
    expect(changed.status).toBe(400);
    expect(await changed.json()).toMatchObject({
      error: expect.stringContaining('Measured source evidence cannot be changed'),
    });
    const correction = (recallSeconds: number) => ({
      ...saved,
      metadata: {
        ...saved.metadata,
        evidence: {
          ...raw,
          correction: { recallSeconds, reason: 'Corrected interrupted recall' },
        },
      },
    });
    // Nonfinite JS values serialize to null; the HTTP boundary must reject them too.
    for (const recallSeconds of [-1, NaN, Infinity, 90.5, 10.25]) {
      const impossible = await request(
        `/api/entries/${saved.id}`,
        'PUT',
        correction(recallSeconds),
        auth.cookie,
      );
      expect(impossible.status).toBe(400);
      expect(await impossible.json()).toMatchObject({ error: expect.stringContaining('recall') });
      expect(stored()).toBe(originalBytes);
    }
    const updated = await request(`/api/entries/${saved.id}`, 'PUT', correction(0), auth.cookie);
    expect(updated.status).toBe(200);
    const corrected = ((await updated.json()) as { entry: PracticeSession }).entry;
    expect(corrected.minutes).toBe(raw.measurement.seconds / 60);
    expect(corrected.metadata).toMatchObject({
      elapsedSeconds: raw.measurement.seconds,
      recallSeconds: raw.measurement.recallSeconds,
      recordings: raw.recordings,
      evidence: {
        ...raw,
        correction: { recallSeconds: 0, reason: 'Corrected interrupted recall' },
      },
    });
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions).toEqual([corrected]);
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
    ).toEqual([corrected]);
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

describe('short measured practice and deliberate zero notes', () => {
  it('retains exact time and notes through idempotency, private history, restore and reports without completion', async () => {
    const auth = await signIn('short-notes-owner@example.test');
    const task: PlannedTask = {
      id: 'short-notes-task',
      title: 'Synthetic assigned listening',
      kind: 'listening',
      done: false,
      notes: '',
      dueDate: '2026-09-30',
      targetMinutes: 1,
      createdAt: '2026-09-30T12:00:00.000Z',
      exercise: { type: 'audio', url: 'https://example.test/synthetic.mp3', minimumPasses: 3 },
    };
    expect((await request('/api/plan', 'POST', task, auth.cookie)).status).toBe(201);
    const zero: PracticeSession = {
      ...entry('zero-useful-notes'),
      kind: 'listening',
      date: task.dueDate!,
      source: 'timer',
      minutes: 0,
      metadata: {
        elapsedSeconds: 0,
        recallSeconds: 0,
        scratchpad: '  Synthetic private notes\nretained exactly.  ',
        practiceTool: 'audio',
        assignedRecordingUrl: task.exercise!.type === 'audio' ? task.exercise!.url : '',
        plannedTaskId: task.id,
        practicePurpose: 'assigned',
      },
    };
    const partial: PracticeSession = {
      ...zero,
      id: 'twelve-second-partial',
      minutes: 12 / 60,
      metadata: {
        ...zero.metadata,
        elapsedSeconds: 12,
        scratchpad: 'Twelve actual seconds.',
        recordings: [
          {
            url: 'https://example.test/synthetic.mp3',
            seconds: 12,
            passes: {
              version: 1,
              method: 'native-1x',
              durations: [{ durationSeconds: 30, completedPasses: 0 }],
            },
          },
        ],
      },
    };
    const review: PracticeSession = {
      ...zero,
      id: 'zero-review-notes',
      metadata: { ...zero.metadata, practicePurpose: 'review', scratchpad: 'Extra review note.' },
    };
    const saved: PracticeSession[] = [];
    for (const input of [zero, partial, review]) {
      const created = await request('/api/entries', 'POST', input, auth.cookie);
      expect(created.status, JSON.stringify(await created.clone().json())).toBe(201);
      const result = ((await created.json()) as { entry: PracticeSession }).entry;
      saved.push(result);
      expect(result.minutes).toBe(input.minutes);
      expect(result.metadata?.scratchpad).toBe(input.metadata?.scratchpad);
      const retry = await request('/api/entries', 'POST', input, auth.cookie);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ duplicate: true, entry: result });
    }
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions).toHaveLength(3);
    expect(exported.plan).toEqual([task]);
    const progress = dailyPlanSummary(exported.plan!, [], exported.sessions, task.dueDate!);
    expect(progress.assignedToday[0]).toMatchObject({
      loggedMinutes: 0.2,
      status: 'started',
      task: { done: false },
    });
    const onlyNotes = summarizePractice([saved[0], saved[2]], task.dueDate!);
    expect(onlyNotes.todayMinutes).toBe(0);
    expect(onlyNotes.bestStreak).toBe(0);
    expect(
      dailyPlanSummary([task], [], [saved[0], saved[2]], task.dueDate!).assignedToday[0],
    ).toMatchObject({ loggedMinutes: 0, todayMinutes: 0, status: 'ready', task: { done: false } });
    expect(summarizePractice(saved, task.dueDate!).todayMinutes).toBe(0.2);
    const other = await signIn('short-notes-other@example.test');
    expect(
      (await request('/api/entries/zero-useful-notes', 'GET', undefined, other.cookie)).status,
    ).toBe(404);
    const privateHistory = (await (
      await request('/api/entries', 'GET', undefined, other.cookie)
    ).json()) as { entries: PracticeSession[] };
    expect(privateHistory.entries).toEqual([]);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, other.cookie))
        .status,
    ).toBe(200);
    const restored = (await (
      await request('/api/export', 'GET', undefined, other.cookie)
    ).json()) as TrainingExport;
    expect(restored.sessions).toEqual(exported.sessions);
    expect(restored.plan).toEqual(exported.plan);
  });
});

describe('start-attributed finished Runner results', () => {
  const measuredRunner = (
    id = 'midnight-run',
    start = '2026-10-01T03:59:59.000Z',
    end = '2026-10-01T04:00:12.000Z',
    task?: PlannedTask,
  ): PracticeSession & { metadata: NonNullable<PracticeSession['metadata']> } => {
    const entry = finishedRunnerSession(
      {
        ...createRunnerRun(id, {
          mode: 'SingleCall',
          wpm: 20,
          durationSeconds: 60,
          activity: 1,
          conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
        }),
        status: 'stopped',
        elapsedSeconds: 12.25,
        runStartedAt: start,
        runEndedAt: end,
        speedHistory: [
          { elapsedSeconds: 0, wpm: 20 },
          { elapsedSeconds: 6.25, wpm: 24 },
        ],
        speedChangeCount: 1,
        summary: { qsoCount: 2, verifiedPoints: 1, score: 1, nrErrors: 0, nilErrors: 0 },
      },
      captureRunnerPracticeAttribution(task, task ? 'review' : undefined),
      'America/New_York',
    );
    return {
      ...entry,
      metadata: { ...entry.metadata, runnerReviewedAt: '2026-11-02T12:00:00.000Z' },
    };
  };
  const storedRows = (owner: string) =>
    db.sqlite
      .prepare('SELECT id,date,entry_json FROM practice_entries WHERE user_id = ? ORDER BY id')
      .all(owner);

  it('preserves midnight/DST dates, mixed speeds, exact receipts and portable account history', async () => {
    const owner = await signIn('runner-dates@example.test');
    const runs = [
      measuredRunner(),
      measuredRunner('spring-dst', '2026-03-08T06:59:59.000Z', '2026-03-08T07:00:12.000Z'),
      measuredRunner('fall-dst', '2026-11-01T05:59:59.000Z', '2026-11-01T06:00:12.000Z'),
    ];
    for (const source of runs) {
      const created = await request('/api/entries', 'POST', source, owner.cookie);
      expect(created.status).toBe(201);
      const saved = ((await created.json()) as { entry: PracticeSession }).entry;
      expect(saved.date).toBe(source.date);
      expect(saved.createdAt).toBe(source.createdAt);
      expect(saved.metadata?.evidence).toEqual(source.metadata.evidence);
      expect(saved).not.toHaveProperty('characterWpm');
      expect(saved.qsoCount).toBe(2);
      expect((await request('/api/entries', 'POST', source, owner.cookie)).status).toBe(200);
      expect(
        (
          await request(
            '/api/entries',
            'POST',
            { ...source, notes: 'Changed retry body' },
            owner.cookie,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await request(
            `/api/entries/${source.id}`,
            'PUT',
            {
              ...saved,
              metadata: { ...saved.metadata, runnerReviewedAt: '2026-11-03T12:00:00.000Z' },
            },
            owner.cookie,
          )
        ).status,
      ).toBe(400);
    }
    expect(storedRows(owner.user.id)).toHaveLength(3);
    const exported = (await (
      await request('/api/export', 'GET', undefined, owner.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions.map((entry) => entry.date).sort()).toEqual([
      '2026-03-08',
      '2026-09-30',
      '2026-11-01',
    ]);
    const restored = await signIn('runner-restored@example.test');
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, restored.cookie))
        .status,
    ).toBe(200);
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, restored.cookie)
        ).json()) as TrainingExport
      ).sessions,
    ).toEqual(exported.sessions);
    expect(
      (
        await request(
          `/api/entries/${runs[0].id}`,
          'PUT',
          runs[0],
          (await signIn('runner-stranger@example.test')).cookie,
        )
      ).status,
    ).toBe(404);
  });

  it('rejects contradictory attributed facts and malformed imports without changing private history', async () => {
    const owner = await signIn('runner-invalid@example.test');
    const original = measuredRunner();
    expect((await request('/api/entries', 'POST', original, owner.cookie)).status).toBe(201);
    const prior = storedRows(owner.user.id);
    const changeRun = (change: Record<string, unknown>) => ({
      ...original,
      metadata: {
        ...original.metadata,
        runner: { ...(original.metadata.runner as object), ...change },
        evidence: {
          ...original.metadata.evidence!,
          run: {
            ...(original.metadata.evidence as Extract<PracticeEvidence, { type: 'runner' }>).run,
            ...change,
          },
        },
      },
    });
    for (const invalid of [
      { ...original, date: '2026-10-01' },
      { ...original, id: 'different-id' },
      { ...original, minutes: 4 },
      { ...original, qsoCount: 9 },
      { ...original, createdAt: '2026-10-02T12:00:00.000Z' },
      changeRun({ attribution: { version: 1, timezone: 'Fake/Zone' } }),
      changeRun({ runStartedAt: '2026-10-01T04:00:15.000Z' }),
      changeRun({
        summary: { qsoCount: 1, verifiedPoints: 2, score: 2, nrErrors: 0, nilErrors: 0 },
      }),
      changeRun({
        summary: { qsoCount: 2, verifiedPoints: 1, score: 7, nrErrors: 0, nilErrors: 0 },
      }),
      changeRun({
        speedHistory: [
          { elapsedSeconds: 0, wpm: 20 },
          { elapsedSeconds: 13, wpm: 24 },
        ],
      }),
      {
        ...original,
        metadata: { ...original.metadata, runnerReviewedAt: '2026-10-01T03:00:00.000Z' },
      },
    ]) {
      const rejected = await request('/api/entries', 'POST', invalid, owner.cookie);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({ error: expect.any(String) });
      expect(storedRows(owner.user.id)).toEqual(prior);
    }
    const malformed = { ...original, date: '2026-10-01' };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...backup([malformed]), evidenceVersion: 1 } },
          owner.cookie,
        )
      ).status,
    ).toBe(400);
    expect(storedRows(owner.user.id)).toEqual(prior);
  });

  it('keeps captured review assignment evidence private and old unmarked native results portable', async () => {
    const owner = await signIn('runner-task-owner@example.test');
    const foreign = await signIn('runner-task-foreign@example.test');
    const task: PlannedTask = {
      id: 'runner-private-task',
      title: 'Synthetic Runner assignment',
      kind: 'simulator',
      lesson: 3,
      notes: '',
      done: false,
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    expect((await request('/api/plan', 'POST', task, owner.cookie)).status).toBe(201);
    const linked = measuredRunner('private-run', undefined, undefined, task);
    expect((await request('/api/entries', 'POST', linked, foreign.cookie)).status).toBe(400);
    expect((await request('/api/entries', 'POST', linked, owner.cookie)).status).toBe(201);
    expect(
      (
        (await (await request('/api/plan', 'GET', undefined, owner.cookie)).json()) as {
          plan: PlannedTask[];
        }
      ).plan[0].done,
    ).toBe(false);
    expect(storedRows(foreign.user.id)).toEqual([]);
    const old = measuredRunner('older-run');
    const legacy = structuredClone(old) as PracticeSession;
    delete (legacy.metadata!.runner as Record<string, unknown>).attribution;
    delete (legacy.metadata!.evidence as Extract<PracticeEvidence, { type: 'runner' }>).run
      .attribution;
    delete legacy.metadata!.runnerReviewedAt;
    legacy.id = 'historical-run-id';
    legacy.date = '2026-10-02';
    expect((await request('/api/entries', 'POST', legacy, owner.cookie)).status).toBe(201);
    const exported = (await (
      await request('/api/export', 'GET', undefined, owner.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions.find((entry) => entry.id === legacy.id)?.date).toBe(legacy.date);
    expect(
      exported.sessions.find((entry) => entry.id === legacy.id)?.metadata?.evidence,
    ).not.toHaveProperty('run.attribution');
  });
});

describe('private advisor report definition persistence', () => {
  it('rejects impossible one-sided whole-number definitions through all writes atomically and accepts adjacent safe edges', async () => {
    const auth = await signIn('report-definition-integer-edge@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, auth.cookie)).status).toBe(
      200,
    );
    const saved = await getAccountSnapshot(env, auth.user.id);
    const whole = {
      key: 'wholeCount',
      label: 'Whole count',
      section: 'Practice',
      type: 'number' as const,
      required: true,
      source: 'manual' as const,
      integer: true,
    };
    for (const [index, limits] of [
      { minExclusive: Number.MAX_SAFE_INTEGER },
      { maxExclusive: Number.MIN_SAFE_INTEGER },
    ].entries()) {
      const bad = {
        ...reportDefinition,
        fields: [...reportDefinition.fields, { ...whole, ...limits }],
      };
      for (const response of [
        await request(
          '/api/settings',
          'PUT',
          { settings: { ...profile, displayName: 'Must not save', reportDefinition: bad } },
          auth.cookie,
        ),
        await request(
          '/api/account-operations',
          'POST',
          {
            version: 1,
            id: `impossible-integer-${index}`,
            accountId: auth.user.id,
            baseRevision: saved.revision,
            generation: saved.generation,
            createdAt: new Date().toISOString(),
            change: {
              type: 'settings',
              changes: { displayName: 'Must not save', reportDefinition: bad },
            },
          },
          auth.cookie,
        ),
        await request(
          '/api/import',
          'POST',
          {
            mode: 'merge',
            data: {
              format: 'cwa-training-tracker',
              version: 1,
              exportedAt: new Date().toISOString(),
              sessions: [],
              profile: { ...profile, displayName: 'Must not save', reportDefinition: bad },
            },
          },
          auth.cookie,
        ),
      ]) {
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: expect.stringContaining('at least one whole number'),
        });
      }
      expect(await getAccountSnapshot(env, auth.user.id)).toEqual(saved);
    }
    for (const limits of [
      { minExclusive: Number.MAX_SAFE_INTEGER - 1 },
      { maxExclusive: Number.MIN_SAFE_INTEGER + 1 },
    ]) {
      const valid = {
        ...reportDefinition,
        fields: [...reportDefinition.fields, { ...whole, ...limits }],
      };
      expect(
        (
          await request(
            '/api/settings',
            'PUT',
            { settings: { ...profile, reportDefinition: valid } },
            auth.cookie,
          )
        ).status,
      ).toBe(200);
      expect((await read(auth.cookie)).reportDefinition).toEqual(valid);
    }
  });

  it('accepts valid configuration beyond the old settings request cap and rejects encoded overflow without mutation', async () => {
    const auth = await signIn('report-definition-size@example.test');
    const large = {
      version: 1,
      title: 'Large synthetic definition',
      fields: Array.from({ length: 60 }, (_, index) => ({
        key: `field${index}`,
        label: 'a'.repeat(160),
        section: 'b'.repeat(80),
        type: 'textarea',
        required: false,
        source: 'manual',
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(16_384);
    expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(32_000);
    expect(
      (
        await request(
          '/api/settings',
          'PUT',
          { settings: { ...DEFAULT_PROFILE, reportDefinition: large } },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    const saved = await getAccountSnapshot(env, auth.user.id);
    expect(saved.settings.reportDefinition).toEqual(large);
    const overflow = {
      ...large,
      fields: large.fields.map((field) => ({
        ...field,
        label: '🟢'.repeat(80),
        section: '🟢'.repeat(40),
      })),
    };
    expect(
      (
        await request(
          '/api/settings',
          'PUT',
          { settings: { ...DEFAULT_PROFILE, reportDefinition: overflow } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(saved);
  });
  const reportDefinition = {
    ...starterAdvisorReportDefinition(),
    formUrl: 'https://forms.example.test/learner?course=synthetic',
    fields: [
      ...starterAdvisorReportDefinition().fields,
      {
        key: 'rating',
        label: 'Sending rating',
        section: 'Practice',
        type: 'rating' as const,
        source: 'manual' as const,
        required: false,
        options: ['Very Good', 'Good', 'Fair', 'Poor'],
        externalId: 'entry.42',
      },
    ],
  };
  const profile = { ...DEFAULT_PROFILE, reportDefinition };
  async function read(cookie: string) {
    const response = await request('/api/settings', 'GET', undefined, cookie);
    expect(response.status).toBe(200);
    return ((await response.json()) as { settings: typeof profile }).settings;
  }
  it('persists a private bounded definition in coherent snapshots and backups without exposing another account', async () => {
    const a = await signIn('report-definition-a@example.test');
    const b = await signIn('report-definition-b@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, a.cookie)).status).toBe(
      200,
    );
    expect((await read(a.cookie)).reportDefinition).toEqual(reportDefinition);
    expect((await read(b.cookie)).reportDefinition).toBeUndefined();
    const row = db.sqlite
      .prepare('SELECT profile_json,report_definition_json FROM users WHERE id = ?')
      .get(a.user.id)!;
    expect(JSON.parse(String(row.profile_json))).not.toHaveProperty('reportDefinition');
    expect(JSON.parse(String(row.report_definition_json))).toEqual(reportDefinition);
    const backup = (await (
      await request('/api/account-lifecycle/backup', 'GET', undefined, a.cookie)
    ).json()) as AccountLifecycleBackup;
    expect(backup.data.profile?.reportDefinition).toEqual(reportDefinition);
    expect(backup.state.settings.reportDefinition).toEqual(reportDefinition);
    expect((await request('/api/settings', 'GET')).status).toBe(401);
    expect(
      (
        await request('/api/settings', 'PUT', { settings: profile }, b.cookie, {
          'X-CWA-Account': a.user.id,
        })
      ).status,
    ).toBe(409);
    expect((await read(b.cookie)).reportDefinition).toBeUndefined();
  });
  it('reuses semantic exact retry and stale revision conflict without replacing another preference', async () => {
    const auth = await signIn('report-definition-operation@example.test');
    const before = await getAccountSnapshot(env, auth.user.id);
    const operation: AccountOperation = {
      version: 1,
      id: 'report-definition-save',
      accountId: auth.user.id,
      baseRevision: before.revision,
      generation: before.generation,
      createdAt: new Date().toISOString(),
      change: { type: 'settings', changes: { reportDefinition } },
    };
    expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(
      200,
    );
    const saved = await getAccountSnapshot(env, auth.user.id);
    expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(
      200,
    );
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(saved);
    expect(saved.settings.dailyGoalMinutes).toBe(before.settings.dailyGoalMinutes);
    expect(
      (
        await request(
          '/api/account-operations',
          'POST',
          { ...operation, id: 'stale-definition' },
          auth.cookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          '/api/account-operations',
          'POST',
          {
            ...operation,
            id: 'clear-definition',
            baseRevision: saved.revision,
            change: { type: 'settings', changes: { reportDefinition: null } },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await read(auth.cookie)).reportDefinition).toBeUndefined();
  });
  it('roundtrips privately, preserves new configuration when an old merge omits it, and clears it for replacement/reset', async () => {
    const a = await signIn('report-definition-roundtrip-a@example.test');
    const b = await signIn('report-definition-roundtrip-b@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, a.cookie)).status).toBe(
      200,
    );
    const backup = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: backup }, b.cookie)).status,
    ).toBe(200);
    expect((await read(b.cookie)).reportDefinition).toEqual(reportDefinition);
    const old = {
      ...backup,
      profile: { ...DEFAULT_PROFILE, displayName: 'Old synthetic profile' },
    };
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: old }, b.cookie)).status,
    ).toBe(200);
    expect((await read(b.cookie)).reportDefinition).toEqual(reportDefinition);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: old }, b.cookie)).status,
    ).toBe(200);
    expect((await read(b.cookie)).reportDefinition).toBeUndefined();
    expect((await read(a.cookie)).reportDefinition).toEqual(reportDefinition);
    expect((await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie)).status).toBe(
      200,
    );
    expect((await read(a.cookie)).reportDefinition).toBeUndefined();
  });
  it('rejects malformed configuration through direct settings, semantic operations and imports without partial mutations', async () => {
    const auth = await signIn('report-definition-invalid@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, auth.cookie)).status).toBe(
      200,
    );
    const saved = await getAccountSnapshot(env, auth.user.id);
    const bad = { ...reportDefinition, formUrl: 'https://secret:password@forms.example.test' };
    const operation = {
      version: 1,
      id: 'bad-definition',
      accountId: auth.user.id,
      baseRevision: saved.revision,
      generation: saved.generation,
      createdAt: new Date().toISOString(),
      change: { type: 'settings', changes: { reportDefinition: bad } },
    };
    for (const response of [
      await request(
        '/api/settings',
        'PUT',
        { settings: { ...profile, displayName: 'Must not save', reportDefinition: bad } },
        auth.cookie,
      ),
      await request('/api/account-operations', 'POST', operation, auth.cookie),
      await request(
        '/api/import',
        'POST',
        {
          mode: 'merge',
          data: {
            format: 'cwa-training-tracker',
            version: 1,
            exportedAt: new Date().toISOString(),
            sessions: [],
            profile: { ...profile, reportDefinition: { ...reportDefinition, accountId: 'other' } },
          },
        },
        auth.cookie,
      ),
    ])
      expect(response.status).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(saved);
  });
});

describe('private timed class schedule persistence', () => {
  const classSchedule: ClassSchedule = {
    version: 1,
    timezone: 'America/New_York',
    ordinary: { startTime: '19:00', endTime: '20:00', endsNextDay: false },
    exceptions: [
      { session: 2, date: '2026-11-04', startTime: '23:30', endTime: '00:30', endsNextDay: true },
    ],
    joinUrl: 'https://meeting.example.test/j/123?pwd=synthetic-access&token=required#join',
  };
  const profile = { ...DEFAULT_PROFILE, firstClassDate: '2026-10-29', classSchedule };
  async function read(cookie: string) {
    const response = await request('/api/settings', 'GET', undefined, cookie);
    expect(response.status).toBe(200);
    return ((await response.json()) as { settings: typeof profile }).settings;
  }
  it('stores schedule independently and scopes every read, write and backup to its authenticated owner', async () => {
    const a = await signIn('class-a@example.test');
    const b = await signIn('class-b@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, a.cookie)).status).toBe(
      200,
    );
    expect((await read(a.cookie)).classSchedule).toEqual(classSchedule);
    expect((await read(b.cookie)).classSchedule).toBeUndefined();
    const row = db.sqlite
      .prepare('SELECT profile_json,class_schedule_json FROM users WHERE id = ?')
      .get(a.user.id)!;
    expect(JSON.parse(String(row.profile_json))).not.toHaveProperty('classSchedule');
    expect(JSON.parse(String(row.class_schedule_json))).toEqual(classSchedule);
    for (const path of [
      '/api/settings',
      '/api/account-state',
      '/api/export',
      '/api/account-lifecycle/backup',
    ]) {
      expect((await request(path)).status).toBe(401);
      expect(
        (await request(path, 'GET', undefined, b.cookie, { 'X-CWA-Account': a.user.id })).status,
      ).toBe(409);
    }
    expect(
      (
        await request('/api/settings', 'PUT', { settings: profile }, b.cookie, {
          'X-CWA-Account': a.user.id,
        })
      ).status,
    ).toBe(409);
    expect((await read(b.cookie)).classSchedule).toBeUndefined();
    const state = await getAccountSnapshot(env, a.user.id);
    expect(state.settings.classSchedule).toEqual(classSchedule);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.profile?.classSchedule?.joinUrl).toBe(classSchedule.joinUrl);
    expect(timedClassMeetings(exported.profile!)).toHaveLength(16);
  });
  it('gives offline schedule edits exact receipts and validates the resulting full course before mutation', async () => {
    const auth = await signIn('class-outbox@example.test');
    expect(
      (
        await request(
          '/api/settings',
          'PUT',
          { settings: { ...profile, classSchedule: null } },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    const before = await getAccountSnapshot(env, auth.user.id);
    const operation: AccountOperation = {
      version: 1,
      id: 'class-operation',
      accountId: auth.user.id,
      baseRevision: before.revision,
      generation: before.generation,
      createdAt: '2026-10-01T00:00:00Z',
      change: { type: 'settings', changes: { classSchedule } },
    };
    expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(
      200,
    );
    const saved = await getAccountSnapshot(env, auth.user.id);
    expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(
      200,
    );
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(saved);
    const invalid: AccountOperation = {
      ...operation,
      id: 'class-invalid',
      baseRevision: saved.revision,
      change: { type: 'settings', changes: { firstClassDate: '' } },
    };
    expect((await request('/api/account-operations', 'POST', invalid, auth.cookie)).status).toBe(
      400,
    );
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(saved);
    expect(
      (
        await request(
          '/api/account-operations',
          'POST',
          {
            ...invalid,
            id: 'class-clear',
            change: { type: 'settings', changes: { classSchedule: null } },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await read(auth.cookie)).classSchedule).toBeUndefined();
  });
  it('roundtrips native schedule privately and leaves old date-only/original meeting references untimed', async () => {
    const a = await signIn('class-backup-a@example.test');
    const b = await signIn('class-backup-b@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, a.cookie)).status).toBe(
      200,
    );
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status,
    ).toBe(200);
    expect((await read(b.cookie)).classSchedule).toEqual(classSchedule);
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status,
    ).toBe(200);
    expect(timedClassMeetings(await read(b.cookie))).toEqual(timedClassMeetings(profile));
    const old = {
      ...exported,
      profile: { ...DEFAULT_PROFILE, firstClassDate: '2026-10-29' },
      legacy: {
        source: 'rwjblue.com',
        data: {
          course: {
            meetings: [
              { session: 1, startsAt: '2026-10-29T23:00:00Z', endsAt: '2026-10-30T00:00:00Z' },
            ],
          },
          preferences: { joinUrl: classSchedule.joinUrl },
        },
      },
    };
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: old }, b.cookie)).status,
    ).toBe(200);
    expect((await read(b.cookie)).classSchedule).toBeUndefined();
    const historical = (await (
      await request('/api/export', 'GET', undefined, b.cookie)
    ).json()) as TrainingExport;
    expect(historical.legacy?.data).toEqual(old.legacy.data);
    expect(timedClassMeetings(historical.profile!)).toEqual([]);
    expect((await read(a.cookie)).classSchedule).toEqual(classSchedule);
  });
  it('keeps invalid links and failed replacement transactions from altering settings, schedule or history', async () => {
    const auth = await signIn('class-rollback@example.test');
    expect((await request('/api/settings', 'PUT', { settings: profile }, auth.cookie)).status).toBe(
      200,
    );
    const before = await getAccountSnapshot(env, auth.user.id);
    for (const joinUrl of ['https://user:password@example.test/j', 'javascript:alert(1)']) {
      expect(
        (
          await request(
            '/api/settings',
            'PUT',
            { settings: { ...profile, classSchedule: { ...classSchedule, joinUrl } } },
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
              data: {
                ...backup([]),
                profile: { ...profile, classSchedule: { ...classSchedule, joinUrl } },
              },
            },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
    }
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    db.sqlite.exec(
      "CREATE TRIGGER reject_class_import BEFORE INSERT ON practice_entries BEGIN SELECT RAISE(ABORT, 'synthetic_class_failure'); END;",
    );
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'replace',
            data: {
              ...backup(),
              profile: {
                ...profile,
                classSchedule: {
                  ...classSchedule,
                  joinUrl: 'https://meeting.example.test/new?pwd=other',
                },
              },
            },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(500);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    expect((await read(auth.cookie)).classSchedule).toEqual(classSchedule);
    expect(
      db.sqlite
        .prepare('SELECT COUNT(*) AS count FROM practice_entries WHERE user_id = ?')
        .get(auth.user.id)?.count,
    ).toBe(0);
  });
  it('includes meeting details in coherent lifecycle backup and clears them only for the resetting owner', async () => {
    const a = await signIn('class-reset-a@example.test');
    const b = await signIn('class-reset-b@example.test');
    for (const auth of [a, b])
      expect(
        (await request('/api/settings', 'PUT', { settings: profile }, auth.cookie)).status,
      ).toBe(200);
    const saved = (await (
      await request('/api/account-lifecycle/backup', 'GET', undefined, a.cookie)
    ).json()) as AccountLifecycleBackup;
    expect(saved.data.profile?.classSchedule).toEqual(classSchedule);
    expect(saved.state.settings.classSchedule).toEqual(classSchedule);
    expect((await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie)).status).toBe(
      200,
    );
    expect((await read(a.cookie)).classSchedule).toBeUndefined();
    expect((await read(b.cookie)).classSchedule).toEqual(classSchedule);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: saved.data }, a.cookie))
        .status,
    ).toBe(200);
    expect((await read(a.cookie)).classSchedule).toEqual(classSchedule);
  });
});

describe('public calendar dispatch privacy', () => {
  it('reaches the real public handler without database, auth or assets access', async () => {
    const database = vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw new Error('Public feed queried private DB');
    });
    const assets = vi.spyOn(env.ASSETS, 'fetch');
    const response = await worker.fetch(
      new Request(`${origin}/api/live-practice/calendar.ics?account=private&token=private`, {
        headers: {
          Cookie: '__Host-cwa-session=synthetic-private',
          Authorization: 'Bearer synthetic-private',
        },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/synthetic-private|account=private|token=private/);
    expect(database).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const unsupported = await worker.fetch(
      new Request(`${origin}/api/live-practice/calendar.ics`, { method: 'POST' }),
      env,
    );
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('Allow')).toBe('GET, HEAD');
  });
});

describe('typed private live assignment metadata', () => {
  it('persists and exports owned event binding, rejects tampering and rolls back failed replacement', async () => {
    const a = await signIn('live-a@example.test');
    const b = await signIn('live-b@example.test');
    const profile = {
      ...DEFAULT_PROFILE,
      level: 'intermediate',
      firstClassDate: '2026-10-08',
      classDays: [1, 4],
      classSchedule: {
        version: 1,
        timezone: 'UTC',
        exceptions: [],
        ordinary: { startTime: '07:30', endTime: '09:00', endsNextDay: false },
        joinUrl: 'https://meeting.example.test/private?pwd=live-private',
      },
    };
    expect((await request('/api/settings', 'PUT', { settings: profile }, a.cookie)).status).toBe(
      200,
    );
    const task: PlannedTask = {
      id: 'private-live',
      title: 'Live objective',
      kind: 'on-air',
      lesson: 1,
      dueDate: '2026-10-07',
      createdAt: '2026-10-02T00:00:00Z',
      done: false,
      notes: 'Private radio notes',
      exercise: {
        type: 'live-event',
        eventId: 'cwt',
        url: 'https://cwops.org/cwops-tests/',
        deadline: 'associated-class',
      },
    };
    expect((await request('/api/plan', 'POST', task, a.cookie)).status).toBe(201);
    expect((await getAccountSnapshot(env, b.user.id)).plan).toEqual([]);
    expect(
      (await request('/api/plan/private-live', 'PUT', { ...task, done: true }, b.cookie)).status,
    ).toBe(404);
    const before = await getAccountSnapshot(env, a.user.id);
    const generated = before.plan.find(
      (item) => item.source === 'curriculum' && item.exercise?.type === 'live-event',
    )!;
    expect(generated.exercise).toMatchObject({ eventId: 'cwt', deadline: 'associated-class' });
    expect(
      (
        await request(
          '/api/account-operations',
          'POST',
          {
            version: 1,
            id: crypto.randomUUID(),
            accountId: a.user.id,
            baseRevision: before.revision,
            generation: before.generation,
            createdAt: '2026-10-02T00:00:00Z',
            change: {
              type: 'task-edit',
              id: generated.id,
              changes: { exercise: { ...generated.exercise, eventId: 'sst' } },
            },
          },
          a.cookie,
          { 'X-CWA-Account': a.user.id },
        )
      ).status,
    ).toBe(400);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.plan!.find((item) => item.id === task.id)!.exercise).toEqual(task.exercise);
    const invalid = {
      ...exported,
      plan: [{ ...task, exercise: { ...task.exercise, eventId: 'unknown' } }],
    };
    expect(
      (await request('/api/import', 'POST', { data: invalid, mode: 'replace' }, a.cookie)).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    db.sqlite.exec(
      "CREATE TRIGGER reject_live_import BEFORE INSERT ON training_plan WHEN NEW.id = 'private-live' BEGIN SELECT RAISE(ABORT, 'synthetic_live_failure'); END;",
    );
    expect(
      (await request('/api/import', 'POST', { data: exported, mode: 'replace' }, a.cookie)).status,
    ).toBe(500);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
    db.sqlite.exec('DROP TRIGGER reject_live_import');
    expect(
      (await request('/api/import', 'POST', { data: exported, mode: 'replace' }, a.cookie)).status,
    ).toBe(200);
    const restored = await getAccountSnapshot(env, a.user.id);
    expect(restored.plan.find((item) => item.id === task.id)!.exercise).toEqual(task.exercise);
    expect(restored.settings.classSchedule).toEqual(profile.classSchedule);
    expect(await (await request('/api/entries', 'GET', undefined, a.cookie)).json()).toEqual({
      entries: [],
      accountId: a.user.id,
      generation: restored.generation,
      revision: restored.revision,
      historyRevision: restored.historyRevision,
    });
    const feed = await request(
      '/api/live-practice/calendar.ics?class=private',
      'GET',
      undefined,
      a.cookie,
    );
    const body = await feed.text();
    expect(body).not.toMatch(/Private radio notes|live-private|meeting.example/);
    expect(body).toBe(
      await (await request('/api/live-practice/calendar.ics', 'GET', undefined, b.cookie)).text(),
    );
  });
});

describe('private native performance and CWT observations', () => {
  const assessment = {
    version: 1,
    source: 'self-reported',
    performanceRating: 'very-good',
    cwt: {
      heardCallsigns: 'W1SYN\nK2SYN',
      heardExchanges: 'SAM 001',
      workedCallsigns: 'K2SYN',
      workedNames: 'KIM',
      comments: 'Report-only synthetic comment',
    },
  };
  it('retains all fields, unknown/zero, exact retries and mutable judgments without changing measured facts', async () => {
    const auth = await signIn('native-assessment@example.test');
    const raw = { version: 1, type: 'timed', measurement: { seconds: 60 }, recordings: [] };
    const body = {
      ...entry('cwt-observations'),
      kind: 'on-air',
      source: 'timer',
      minutes: 1,
      notes: 'Private freeform note',
      metadata: { evidence: raw, assessment },
    };
    const created = await request('/api/entries', 'POST', body, auth.cookie);
    expect(created.status).toBe(201);
    const saved = ((await created.json()) as { entry: PracticeSession }).entry;
    expect(saved.qsoCount).toBeUndefined();
    expect(saved.metadata?.assessment).toEqual(assessment);
    expect((await request('/api/entries', 'POST', body, auth.cookie)).status).toBe(200);
    const updated = {
      ...saved,
      qsoCount: 0,
      metadata: {
        ...saved.metadata,
        assessment: { ...assessment, performanceRating: 'poor' },
        evidence: { ...raw, correction: { seconds: 90, reason: 'Extra deliberate practice' } },
      },
    };
    expect((await request(`/api/entries/${saved.id}`, 'PUT', updated, auth.cookie)).status).toBe(
      200,
    );
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0]).toMatchObject({
      qsoCount: 0,
      minutes: 1.5,
      notes: body.notes,
      metadata: { assessment: updated.metadata.assessment, evidence: updated.metadata.evidence },
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
    expect(
      (
        await request(
          `/api/entries/${saved.id}`,
          'PUT',
          {
            ...exported.sessions[0],
            metadata: {
              ...exported.sessions[0].metadata,
              evidence: { ...raw, measurement: { seconds: 59 } },
            },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    const other = await signIn('native-assessment-other@example.test');
    expect(
      (
        (await (
          await request('/api/export', 'GET', undefined, other.cookie)
        ).json()) as TrainingExport
      ).sessions,
    ).toEqual([]);
    expect(
      (await request(`/api/entries/${saved.id}`, 'PUT', exported.sessions[0], other.cookie)).status,
    ).toBe(404);
    expect((await request('/api/entries', 'POST', body)).status).toBe(401);
  });

  it('rejects bad enum/text/category/reference/count writes and imports atomically', async () => {
    const auth = await signIn('assessment-invalid@example.test');
    const valid = { ...entry('valid-cwt'), kind: 'on-air', metadata: { assessment } };
    expect((await request('/api/entries', 'POST', valid, auth.cookie)).status).toBe(201);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    const before = await getAccountSnapshot(env, auth.user.id);
    const invalid = [
      { ...valid, metadata: { assessment: { ...assessment, performanceRating: 'easy' } } },
      {
        ...valid,
        metadata: { assessment: { ...assessment, cwt: { comments: 'x'.repeat(4001) } } },
      },
      { ...valid, metadata: { assessment: { ...assessment, cwt: { comments: 'x\0y' } } } },
      { ...valid, metadata: { assessment: { ...assessment, cwt: { comments: null } } } },
      { ...valid, kind: 'listening' },
      { ...valid, source: 'morse' },
      { ...valid, metadata: { assessment: { ...assessment, sessionId: 'somebody-else' } } },
      { ...valid, qsoCount: -1 },
    ];
    for (const [index, malformed] of invalid.entries()) {
      const body = { ...malformed, id: `bad-cwt-${index}` };
      expect((await request('/api/entries', 'POST', body, auth.cookie)).status).toBe(400);
      expect(
        (
          await request(
            '/api/import',
            'POST',
            { mode: 'replace', data: { ...exported, sessions: [exported.sessions[0], body] } },
            auth.cookie,
          )
        ).status,
      ).toBe(400);
      expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    }
    expect(
      (
        await request(
          '/api/entries',
          'POST',
          {
            ...valid,
            id: 'foreign-task',
            metadata: { assessment, plannedTaskId: 'other-account-task' },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
  });

  it('rejects new actual-contact observations on archived sources while retaining exact old bodies and judgments', async () => {
    const auth = await signIn('assessment-archive-source@example.test');
    const original = {
      ...entry('archived-runner-count'),
      createdAt: new Date(entry('timestamp').createdAt).toISOString(),
      kind: 'simulator',
      source: 'legacy',
      qsoCount: 5,
      metadata: {
        legacyTask: { id: 'other:morse-runner', kind: 'simulator' },
        legacyAttempt: {
          taskId: 'other:morse-runner',
          runnerResult: { source: 'embedded', qsoCount: 5, verifiedPoints: 5, score: 25 },
        },
      },
    };
    const response = await request('/api/entries', 'POST', original, auth.cookie);
    expect(response.status).toBe(201);
    expect(((await response.json()) as { entry: PracticeSession }).entry).toEqual(original);
    expect((await request('/api/entries', 'POST', original, auth.cookie)).status).toBe(200);
    const before = await getAccountSnapshot(env, auth.user.id);
    const spoofed = {
      ...original,
      kind: 'on-air',
      qsoCount: 6,
      metadata: {
        ...original.metadata,
        assessment: {
          version: 1,
          source: 'self-reported',
          cwt: { comments: 'Simulator is not on-air evidence' },
        },
      },
    };
    expect((await request(`/api/entries/${original.id}`, 'PUT', spoofed, auth.cookie)).status).toBe(
      400,
    );
    const backup = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'replace', data: { ...backup, sessions: [spoofed] } },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, auth.user.id)).toEqual(before);
    const rated = {
      ...original,
      kind: 'on-air',
      metadata: {
        ...original.metadata,
        assessment: { version: 1, source: 'self-reported', performanceRating: 'fair' },
      },
    };
    expect(
      (await request(`/api/entries/${original.id}`, 'PUT', { ...rated, qsoCount: 6 }, auth.cookie))
        .status,
    ).toBe(400);
    expect((await request(`/api/entries/${original.id}`, 'PUT', rated, auth.cookie)).status).toBe(
      200,
    );
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0].qsoCount).toBe(5);
    expect(exported.sessions[0].metadata?.legacyAttempt).toEqual(original.metadata.legacyAttempt);
    expect(exported.sessions[0].metadata?.assessment?.performanceRating).toBe('fair');
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

  it('preserves original rating/CWT archives separately, and retains old synthetic counts without new contact credit', async () => {
    const auth = await signIn('assessment-history@example.test');
    const legacyAttempt = {
      performanceRating: 'poor',
      difficulty: 'easy',
      cwtResult: { qsoCount: 0, heardCallsigns: 'W1OLD', comments: 'Original report comment' },
    };
    const original = {
      ...entry('original-cwt'),
      kind: 'on-air',
      source: 'legacy',
      qsoCount: 0,
      metadata: { legacyAttempt },
    };
    expect((await request('/api/entries', 'POST', original, auth.cookie)).status).toBe(201);
    const synthetic = {
      ...entry('old-generated-count'),
      source: 'morse',
      qsoCount: 2,
      metadata: { practiceTool: 'qso' },
    };
    expect(
      (
        await request(
          '/api/entries',
          'POST',
          {
            ...synthetic,
            id: 'new-generated-count',
            metadata: {
              ...synthetic.metadata,
              assessment: { version: 1, source: 'self-reported', performanceRating: 'good' },
            },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
    const exported = (await (
      await request('/api/export', 'GET', undefined, auth.cookie)
    ).json()) as TrainingExport;
    expect(exported.sessions[0].metadata?.legacyAttempt).toEqual(legacyAttempt);
    expect(exported.sessions[0].metadata?.assessment).toBeUndefined();
    // Older valid pending bodies upload exactly without being promoted to actual contacts.
    const queued = {
      ...synthetic,
      id: 'older-queued-count',
      createdAt: new Date(synthetic.createdAt).toISOString(),
    };
    const queuedResponse = await request('/api/entries', 'POST', queued, auth.cookie);
    expect(queuedResponse.status).toBe(201);
    const queuedSaved = ((await queuedResponse.json()) as { entry: PracticeSession }).entry;
    expect(queuedSaved).toEqual(queued);
    expect((await request('/api/entries', 'POST', queued, auth.cookie)).status).toBe(200);

    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...exported, sessions: [...exported.sessions, synthetic] } },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    const preserved = (
      (await (await request('/api/export', 'GET', undefined, auth.cookie)).json()) as TrainingExport
    ).sessions.find((row) => row.id === synthetic.id)!;
    expect(preserved.qsoCount).toBe(2);
    expect(
      (
        await request(
          `/api/entries/${synthetic.id}`,
          'PUT',
          { ...preserved, notes: 'Edited historical note' },
          auth.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/entries/${synthetic.id}`,
          'PUT',
          {
            ...preserved,
            qsoCount: 3,
            metadata: {
              ...preserved.metadata,
              assessment: { version: 1, source: 'self-reported', performanceRating: 'good' },
            },
          },
          auth.cookie,
        )
      ).status,
    ).toBe(400);
  });
});

describe('private request-only LCWO linking and retained history', () => {
  const credentials = {
    action: 'link',
    consent: true,
    username: 'Student7',
    password: 'fixture-normal',
  };
  function upstream() {
    return vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => lcwoFixtureResponse(input, init));
  }
  async function retained(cookie: string) {
    return (await (await request('/api/lcwo', 'GET', undefined, cookie)).json()) as {
      data: import('../shared/lcwo').LcwoData | null;
      state: AccountSnapshot;
    };
  }
  it.each(['current', 'older boolean'])(
    'disconnects at the exact real 6 MiB limit without removing history (%s flag)',
    async (flag) => {
      const owner = await signIn('lcwo-full-disconnect@example.test');
      upstream();
      expect((await request('/api/lcwo', 'POST', credentials, owner.cookie)).status).toBe(200);
      const original = (await retained(owner.cookie)).data!;
      if (flag === 'older boolean') {
        const stored = JSON.parse(
          db.sqlite.prepare('SELECT link_json FROM lcwo_links WHERE user_id=?').get(owner.user.id)!
            .link_json as string,
        );
        db.sqlite
          .prepare('UPDATE lcwo_links SET link_json=? WHERE user_id=?')
          .run(JSON.stringify({ ...stored, connected: true }), owner.user.id);
      }
      const rows = Array.from({ length: 650 }, (_, index) =>
        validatePracticeSession({
          id: `quota-fixture:${index}`,
          date: '2026-09-29',
          kind: 'other',
          minutes: 0,
          notes: '',
          createdAt: '2026-09-29T12:00:00.000Z',
          source: 'manual',
          context: 'practice',
        }),
      );
      const capacity = 6 * 1024 * 1024;
      const initial = db.sqlite
        .prepare('SELECT storage_bytes,lifecycle_control_bytes FROM users WHERE id=?')
        .get(owner.user.id)!;
      let padding =
        capacity -
        Number(initial.storage_bytes) +
        Number(initial.lifecycle_control_bytes) -
        rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row)), 0);
      expect(padding).toBeGreaterThan(0);
      const insert = db.sqlite.prepare(
        'INSERT INTO practice_entries (user_id,id,date,entry_json) VALUES (?,?,?,?)',
      );
      for (const row of rows) {
        const size = Math.min(10000, padding);
        padding -= size;
        const entry = validatePracticeSession({ ...row, notes: 'x'.repeat(size) });
        insert.run(owner.user.id, entry.id, entry.date, JSON.stringify(entry));
      }
      expect(padding).toBe(0);
      const ordinaryBytes = () => {
        const row = db.sqlite
          .prepare('SELECT storage_bytes,lifecycle_control_bytes FROM users WHERE id=?')
          .get(owner.user.id)!;
        return Number(row.storage_bytes) - Number(row.lifecycle_control_bytes);
      };
      const independentBytes = () =>
        Number(
          db.sqlite
            .prepare(
              `SELECT coalesce((SELECT sum(length(CAST(entry_json AS BLOB))) FROM practice_entries WHERE user_id=?),0)
                +coalesce((SELECT length(CAST(link_json AS BLOB)) FROM lcwo_links WHERE user_id=?),0)
                +coalesce((SELECT sum(length(CAST(run_json AS BLOB))) FROM lcwo_results WHERE user_id=?),0) AS bytes`,
            )
            .get(owner.user.id, owner.user.id, owner.user.id)!.bytes,
        );
      expect(ordinaryBytes()).toBe(capacity);
      expect(independentBytes()).toBe(capacity);
      const response = await request('/api/lcwo', 'POST', { action: 'disconnect' }, owner.cookie);
      expect(response.status).toBe(200);
      expect((await retained(owner.cookie)).data).toEqual({ ...original, connected: false });
      expect(ordinaryBytes()).toBeLessThanOrEqual(capacity);
      expect(independentBytes()).toBe(ordinaryBytes());
      expect(
        db.sqlite
          .prepare('SELECT count(*) AS count FROM practice_entries WHERE user_id=?')
          .get(owner.user.id)!.count,
      ).toBe(rows.length);
      expect(
        (await request('/api/lcwo', 'POST', { ...credentials, action: 'refresh' }, owner.cookie))
          .status,
      ).toBe(409);
    },
  );
  it('atomically links all source families, retains missing rows and refreshes without duplicates or secrets', async () => {
    const owner = await signIn('lcwo-owner@example.test');
    const fetcher = upstream();
    expect((await request('/api/lcwo')).status).toBe(401);
    expect(
      (
        await request('/api/lcwo', 'POST', credentials, owner.cookie, {
          Origin: 'https://foreign.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (await request('/api/lcwo', 'POST', credentials, owner.cookie, { 'If-Match': '' })).status,
    ).toBe(428);
    expect(
      (await request('/api/lcwo', 'POST', { ...credentials, consent: false }, owner.cookie)).status,
    ).toBe(400);
    const linked = await request('/api/lcwo', 'POST', credentials, owner.cookie);
    expect(linked.status).toBe(200);
    expect(((await linked.json()) as { imported: number }).imported).toBe(4);
    const first = await retained(owner.cookie);
    expect(first.data).toMatchObject({
      connected: true,
      estimateSeconds: 0,
      identity: { username: 'Student7', sourceUserId: '7' },
    });
    expect(first.data?.runs).toHaveLength(4);
    const refreshed = await request(
      '/api/lcwo',
      'POST',
      { ...credentials, action: 'refresh' },
      owner.cookie,
    );
    expect(refreshed.status).toBe(200);
    expect(((await refreshed.json()) as { imported: number }).imported).toBe(0);
    const empty = await request(
      '/api/lcwo',
      'POST',
      { ...credentials, action: 'refresh', password: 'fixture-empty' },
      owner.cookie,
    );
    expect(empty.status).toBe(200);
    expect((await retained(owner.cookie)).data?.runs).toEqual(first.data?.runs);
    const exported = (await (
      await request('/api/export', 'GET', undefined, owner.cookie)
    ).json()) as TrainingExport;
    expect(exported.lcwo).toMatchObject({
      connected: false,
      identity: first.data!.identity,
      runs: first.data!.runs,
    });
    const persisted =
      JSON.stringify(db.sqlite.prepare('SELECT link_json FROM lcwo_links').all()) +
      JSON.stringify(db.sqlite.prepare('SELECT run_json FROM lcwo_results').all()) +
      JSON.stringify(exported);
    for (const secret of [
      'password',
      'fixture-normal',
      'fixture-empty',
      'PHPSESSID',
      'fixture-session',
    ])
      expect(persisted).not.toContain(secret);
    expect(fetcher).toHaveBeenCalledTimes(15);
    const actualBytes =
      Number(
        db.sqlite.prepare('SELECT sum(length(CAST(link_json AS BLOB))) AS n FROM lcwo_links').get()!
          .n,
      ) +
      Number(
        db.sqlite
          .prepare('SELECT sum(length(CAST(run_json AS BLOB))) AS n FROM lcwo_results')
          .get()!.n,
      );
    expect(
      db.sqlite
        .prepare('SELECT storage_bytes,history_revision FROM users WHERE id=?')
        .get(owner.user.id),
    ).toMatchObject({ storage_bytes: actualBytes, history_revision: 7 });
  });
  it('bad sign-in, partial/malformed/oversized exports and conflicting identities/facts leave last-success and results unchanged', async () => {
    const owner = await signIn('lcwo-failures@example.test');
    upstream();
    expect((await request('/api/lcwo', 'POST', credentials, owner.cookie)).status).toBe(200);
    const before = await retained(owner.cookie);
    for (const password of [
      'fixture-bad',
      'fixture-partial',
      'fixture-malformed',
      'fixture-oversized',
      'fixture-conflict',
    ]) {
      const response = await request(
        '/api/lcwo',
        'POST',
        { ...credentials, action: 'refresh', password },
        owner.cookie,
      );
      expect(response.status).toBe(password === 'fixture-conflict' ? 400 : 502);
      expect(JSON.stringify(await response.json())).not.toContain(password);
      expect(await retained(owner.cookie)).toEqual(before);
    }
    expect(
      (await request('/api/lcwo', 'POST', { ...credentials, username: 'Student8' }, owner.cookie))
        .status,
    ).toBe(400);
    expect(await retained(owner.cookie)).toEqual(before);
  });
  it('keeps other accounts isolated and disconnects without deleting retained source history', async () => {
    const owner = await signIn('lcwo-private@example.test');
    const other = await signIn('lcwo-other@example.test');
    const fetcher = upstream();
    await request('/api/lcwo', 'POST', credentials, owner.cookie);
    expect((await retained(other.cookie)).data).toBeNull();
    for (const action of ['link', 'refresh', 'disconnect', 'estimate'])
      expect(
        (
          await request('/api/lcwo', 'POST', { ...credentials, action }, other.cookie, {
            'X-CWA-Account': owner.user.id,
          })
        ).status,
      ).toBe(409);
    const before = (await retained(owner.cookie)).data!;
    expect(
      (await request('/api/lcwo', 'POST', { action: 'estimate', seconds: 60 }, owner.cookie))
        .status,
    ).toBe(200);
    expect(
      (await request('/api/lcwo', 'POST', { action: 'disconnect' }, owner.cookie)).status,
    ).toBe(200);
    const calls = fetcher.mock.calls.length;
    expect(
      (await request('/api/lcwo', 'POST', { ...credentials, action: 'refresh' }, owner.cookie))
        .status,
    ).toBe(409);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect((await retained(owner.cookie)).data).toMatchObject({
      connected: false,
      estimateSeconds: 60,
      runs: before.runs,
    });
    expect((await request('/api/lcwo', 'POST', credentials, owner.cookie)).status).toBe(200);
    expect((await retained(owner.cookie)).data?.connected).toBe(true);
  });
  it('round-trips portable facts/preferences privately without activating login and clears them on reset', async () => {
    const owner = await signIn('lcwo-backup@example.test');
    const other = await signIn('lcwo-restore@example.test');
    upstream();
    await request('/api/lcwo', 'POST', credentials, owner.cookie);
    await request('/api/lcwo', 'POST', { action: 'estimate', seconds: 60 }, owner.cookie);
    const exported = (await (
      await request('/api/export', 'GET', undefined, owner.cookie)
    ).json()) as TrainingExport;
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, other.cookie))
        .status,
    ).toBe(200);
    expect((await retained(other.cookie)).data).toEqual(exported.lcwo);
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, other.cookie))
        .status,
    ).toBe(200);
    expect((await retained(other.cookie)).data?.runs).toHaveLength(4);
    const conflicting = {
      ...exported,
      lcwo: { ...exported.lcwo, identity: { username: 'Student8', sourceUserId: '8' }, runs: [] },
      sessions: [entry('would-be-partial')],
    };
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: conflicting }, other.cookie))
        .status,
    ).toBe(400);
    expect(
      db.sqlite.prepare('SELECT id FROM practice_entries WHERE user_id=?').all(other.user.id),
    ).toEqual([]);
    expect(
      (await request('/api/reset', 'POST', { confirmation: 'RESET' }, other.cookie)).status,
    ).toBe(200);
    expect((await retained(other.cookie)).data).toBeNull();
    expect((await retained(owner.cookie)).data?.runs).toHaveLength(4);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: exported }, other.cookie))
        .status,
    ).toBe(200);
    expect((await retained(other.cookie)).data?.connected).toBe(false);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: backup([]) }, other.cookie))
        .status,
    ).toBe(200);
    expect((await retained(other.cookie)).data).toBeNull();
  });
  it('rolls back the whole refresh at quota failure and fences a refresh completing after disconnect', async () => {
    const owner = await signIn('lcwo-race@example.test');
    const fetcher = upstream();
    await request('/api/lcwo', 'POST', credentials, owner.cookie);
    const original = await retained(owner.cookie);
    const priorBytes = db.sqlite
      .prepare('SELECT storage_bytes FROM users WHERE id=?')
      .get(owner.user.id)!.storage_bytes as number;
    db.sqlite.prepare('UPDATE users SET storage_bytes=6291456 WHERE id=?').run(owner.user.id);
    expect(
      (await request('/api/lcwo', 'POST', { action: 'estimate', seconds: 300 }, owner.cookie))
        .status,
    ).toBe(400);
    expect(await retained(owner.cookie)).toEqual(original);
    db.sqlite.prepare('UPDATE users SET storage_bytes=? WHERE id=?').run(priorBytes, owner.user.id);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetcher.mockImplementation(async (input, init) => {
      if (new URL(String(input)).searchParams.get('type') === 'koch') {
        entered();
        await gate;
      }
      return lcwoFixtureResponse(input, init);
    });
    const refresh = request(
      '/api/lcwo',
      'POST',
      { ...credentials, action: 'refresh' },
      owner.cookie,
    );
    await reached;
    expect(
      (await request('/api/lcwo', 'POST', { action: 'disconnect' }, owner.cookie)).status,
    ).toBe(200);
    release();
    expect((await refresh).status).toBe(409);
    expect((await retained(owner.cookie)).data).toEqual({ ...original.data, connected: false });
  });
  it('fences a refresh finishing after reset and cascades source history on account deletion', async () => {
    const owner = await signIn('lcwo-reset-race@example.test');
    const fetcher = upstream();
    await request('/api/lcwo', 'POST', credentials, owner.cookie);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetcher.mockImplementation(async (input, init) => {
      if (new URL(String(input)).searchParams.get('type') === 'koch') {
        entered();
        await gate;
      }
      return lcwoFixtureResponse(input, init);
    });
    const refresh = request(
      '/api/lcwo',
      'POST',
      { ...credentials, action: 'refresh' },
      owner.cookie,
    );
    await reached;
    expect(
      (await request('/api/reset', 'POST', { confirmation: 'RESET' }, owner.cookie)).status,
    ).toBe(200);
    release();
    const late = await refresh;
    expect(late.status).toBe(409);
    expect((await late.json()) as object).toMatchObject({ code: 'dataset_retired' });
    expect((await retained(owner.cookie)).data).toBeNull();
    fetcher.mockImplementation(async (input, init) => lcwoFixtureResponse(input, init));
    expect((await request('/api/lcwo', 'POST', credentials, owner.cookie)).status).toBe(200);
    db.sqlite.prepare('DELETE FROM users WHERE id=?').run(owner.user.id);
    expect(db.sqlite.prepare('SELECT user_id FROM lcwo_links').all()).toEqual([]);
    expect(db.sqlite.prepare('SELECT user_id FROM lcwo_results').all()).toEqual([]);
  });
  it('a real transport timeout preserves SQL state and returns a fixed secret-free error', async () => {
    const owner = await signIn('lcwo-timeout@example.test');
    const fetcher = upstream();
    await request('/api/lcwo', 'POST', credentials, owner.cookie);
    const before = await retained(owner.cookie);
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetcher.mockImplementation(async () => {
      entered();
      return new Promise<Response>(() => {});
    });
    vi.useFakeTimers();
    try {
      const refresh = request(
        '/api/lcwo',
        'POST',
        { ...credentials, action: 'refresh' },
        owner.cookie,
      );
      await reached;
      await vi.advanceTimersByTimeAsync(10_001);
      const failed = await refresh;
      expect(failed.status).toBe(502);
      expect(await failed.json()).toEqual({
        code: 'lcwo_timeout',
        error: 'LCWO took too long to respond. Retained results are unchanged; try again later.',
      });
      expect(await retained(owner.cookie)).toEqual(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('private native advisor report copies', () => {
  const report = (): import('../shared/report-document').ReportDocument => ({
    version: 1,
    id: 'native-report-one',
    status: 'draft',
    definition: starterAdvisorReportDefinition(),
    window: {
      session: 1,
      reportDate: '2026-09-28',
      timezone: 'UTC',
      preparationDates: [],
      fromDate: '2026-09-26',
      toDate: '2026-09-28',
      empty: false,
      fallback: true,
      explanation: 'Two prior days through report date.',
    },
    answers: { callsign: '', name: 'Synthetic', session: '1', reportDate: '2026-09-28' },
    editedKeys: ['callsign'],
    evidence: [],
    createdAt: '2026-09-28T12:00:00Z',
    updatedAt: '2026-09-28T12:00:00Z',
  });
  async function op(
    auth: Awaited<ReturnType<typeof signIn>>,
    change: AccountChange,
    id: string = crypto.randomUUID(),
    state?: AccountSnapshot,
  ) {
    const before = state ?? (await getAccountSnapshot(env, auth.user.id));
    const body: AccountOperation = {
      version: 1,
      id,
      accountId: auth.user.id,
      baseRevision: before.revision,
      generation: before.generation,
      createdAt: '2026-09-28T12:00:00Z',
      change,
    };
    return { body, response: await request('/api/account-operations', 'POST', body, auth.cookie) };
  }
  async function arrangeEvidence(auth: Awaited<ReturnType<typeof signIn>>) {
    const sessions = evidenceSessions();
    const imported = await request(
      '/api/import',
      'POST',
      {
        mode: 'merge',
        data: {
          ...backup(sessions),
          profile: evidenceProfile,
          lcwo: evidenceLcwo,
        },
      },
      auth.cookie,
    );
    expect(imported.status, await imported.clone().text()).toBe(200);
    return createReportDocument(
      evidenceDefinition,
      evidenceProfile,
      [],
      1,
      '2026-10-03',
      sessions,
      evidenceLcwo,
    );
  }
  it('keeps explicit learned declarations eligible until the exact native confirmation and roundtrips owned history privately', async () => {
    const a = await signIn('learned-owner@example.test');
    const b = await signIn('learned-other@example.test');
    const definition = validateAdvisorReportDefinition({
      version: 1,
      title: 'Learned words',
      fields: [
        {
          key: 'words',
          label: 'Learned words',
          section: 'New words',
          source: 'learned:words',
          type: 'textarea',
          required: false,
        },
      ],
    });
    const profile = { ...DEFAULT_PROFILE, timezone: 'UTC', reportDefinition: definition };
    const source: PracticeSession = {
      id: 'learned-source',
      date: '2026-10-02',
      kind: 'listening',
      minutes: 0,
      notes: 'Private general note',
      createdAt: '2026-10-02T00:00:00Z',
      metadata: { scratchpad: 'CQ sounded familiar.\nLearned: Rig, QTH\nlearned: RIG' },
    };
    expect((await request('/api/settings', 'PUT', profile, a.cookie)).status).toBe(200);
    expect((await request('/api/entries', 'POST', source, a.cookie)).status).toBe(201);
    const draft = createReportDocument(definition, profile, [], 1, '2026-10-03', [source]);
    expect(draft.answers.words).toBe('Rig, QTH');
    expect((await op(a, { type: 'report-save', report: draft })).response.status).toBe(200);
    const chosen = { ...draft, answers: { words: 'Rig' }, editedKeys: ['words'] };
    const handoff = captureReportHandoff(chosen);
    expect((await op(a, { type: 'report-handoff', report: handoff })).response.status).toBe(200);
    const before = await getAccountSnapshot(env, a.user.id);
    expect(
      refreshReportDocument(
        { ...draft, id: 'prepared-not-submitted' },
        profile,
        [source],
        undefined,
        { reports: before.reports },
      ).answers.words,
    ).toBe('Rig, QTH');
    chosen.answers.words = 'QTH'; // The confirmation must still retire the actual handoff, Rig.
    const submitted = confirmReportHandoff(handoff, true);
    expect(
      (await op(b, { type: 'report-confirm', report: submitted, confirmed: true })).response.status,
    ).toBe(400);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([]);
    expect(
      (await op(a, { type: 'report-confirm', report: submitted, confirmed: true })).response.status,
    ).toBe(200);
    const state = await getAccountSnapshot(env, a.user.id);
    expect(
      (await op(a, { type: 'report-save', report: { ...draft, id: 'stale-learned-capture' } }))
        .response.status,
    ).toBe(400);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(state);
    const refreshed = refreshReportDocument(
      { ...draft, id: 'after-confirm' },
      profile,
      [source],
      undefined,
      { reports: state.reports },
    );
    expect(refreshed.answers.words).toBe('QTH');
    expect(refreshed.provenance?.fields[0].warnings.join('\n')).toContain(submitted.id);
    expect((await op(a, { type: 'report-save', report: refreshed })).response.status).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.reports?.find((row) => row.id === submitted.id)).toEqual(submitted);
    expect(JSON.stringify(submitted.provenance)).toContain('Explicit Learned: Rig, QTH');
    expect(JSON.stringify(submitted.provenance)).not.toContain('CQ sounded familiar');
    const reversed = { ...exported, reports: [...exported.reports!].reverse() };
    for (const mode of ['merge', 'merge', 'replace'] as const)
      expect(
        (await request('/api/import', 'POST', { mode, data: reversed }, b.cookie)).status,
      ).toBe(200);
    expect(
      confirmedLearnedWordHistory((await getAccountSnapshot(env, b.user.id)).reports!),
    ).toEqual(confirmedLearnedWordHistory(exported.reports!));
    const { confirmation: _confirmation, ...reference } = submitted;
    const importedReference = {
      ...reference,
      id: 'imported-reference-only',
      answers: { words: 'QTH' },
    };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...exported, reports: [importedReference] } },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      refreshReportDocument({ ...draft, id: 'reference-neutral' }, profile, [source], undefined, {
        reports: (await getAccountSnapshot(env, a.user.id)).reports,
      }).answers.words,
    ).toBe('QTH');
  });
  it('rejects forged learned-source claims and foreign references without partial report or receipt writes', async () => {
    const a = await signIn('learned-validation-owner@example.test');
    const b = await signIn('learned-validation-other@example.test');
    const definition = validateAdvisorReportDefinition({
      version: 1,
      title: 'Learned words',
      fields: [
        {
          key: 'words',
          label: 'Learned words',
          section: 'New words',
          source: 'learned:words',
          type: 'text',
          required: false,
        },
      ],
    });
    const profile = { ...DEFAULT_PROFILE, timezone: 'UTC', reportDefinition: definition };
    const source: PracticeSession = {
      id: 'learned-private-source',
      date: '2026-10-02',
      kind: 'listening',
      minutes: 1,
      notes: '',
      createdAt: '2026-10-02T00:00:00Z',
      metadata: { scratchpad: 'Learned: Rig' },
    };
    expect((await request('/api/entries', 'POST', source, a.cookie)).status).toBe(201);
    const draft = createReportDocument(definition, profile, [], 1, '2026-10-03', [source]);
    const forged = structuredClone(draft);
    forged.provenance!.fields[0].value = 'QTH';
    const before = await getAccountSnapshot(env, a.user.id);
    expect((await op(a, { type: 'report-save', report: forged })).response.status).toBe(400);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    for (const kind of ['report-save', 'report-handoff'] as const)
      expect(
        (
          await op(b, {
            type: kind,
            report: kind === 'report-save' ? draft : captureReportHandoff(draft),
          })
        ).response.status,
      ).toBe(400);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([]);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
    ).toBe(0);
    const edited = { ...source, metadata: { scratchpad: 'Ordinary prose: Rig' } };
    expect(
      (await request('/api/entries/learned-private-source', 'PUT', edited, a.cookie)).status,
    ).toBe(200);
    expect((await op(a, { type: 'report-save', report: draft })).response.status).toBe(400);
    expect((await getAccountSnapshot(env, a.user.id)).reports).toEqual([]);
    const fresh = refreshReportDocument(draft, profile, [edited]);
    expect(fresh.answers.words).toBe('');
    expect((await op(a, { type: 'report-save', report: fresh })).response.status).toBe(200);
  });
  it('validates the full owned source window and preserves frozen answers, deliberate blanks and source facts across exports and restores', async () => {
    const owner = await signIn('provenance-owner@example.test');
    const other = await signIn('provenance-other@example.test');
    const draft = await arrangeEvidence(owner);
    draft.answers.points = '77';
    draft.answers.groupLength = '';
    draft.editedKeys = ['points', 'groupLength'];
    expect(draft.provenance?.fields.find((field) => field.key === 'points')?.value).toBe('6');
    expect(draft.answers.groupError).toBe('10');
    expect(draft.evidence.map((ref) => ref.id)).not.toContain('class-evidence');
    const saved = await op(owner, { type: 'report-save', report: draft });
    expect(saved.response.status, await saved.response.clone().text()).toBe(200);
    const after = await getAccountSnapshot(env, owner.user.id);
    expect(after.reports).toEqual([draft]);
    // A mutable assessment can change later without rewriting the saved copy.
    const source = {
      ...evidenceSessions()[1],
      metadata: {
        ...evidenceSessions()[1].metadata,
        assessment: { version: 1, source: 'self-reported', performanceRating: 'poor' },
      },
    };
    expect((await request('/api/entries/audio-evidence', 'PUT', source, owner.cookie)).status).toBe(
      200,
    );
    expect(
      (await request('/api/account-operations', 'POST', saved.body, owner.cookie)).status,
    ).toBe(200);
    expect((await getAccountSnapshot(env, owner.user.id)).reports).toEqual([draft]);
    const stale = await op(owner, {
      type: 'report-save',
      report: { ...draft, id: 'stale-provenance' },
    });
    expect(stale.response.status).toBe(400);
    expect(await stale.response.text()).toContain('Refresh');
    const exported = (await (
      await request('/api/export', 'GET', undefined, owner.cookie)
    ).json()) as TrainingExport;
    expect(exported.reports).toEqual([draft]);
    for (let repeat = 0; repeat < 2; repeat++)
      expect(
        (await request('/api/import', 'POST', { mode: 'merge', data: exported }, other.cookie))
          .status,
      ).toBe(200);
    expect((await getAccountSnapshot(env, other.user.id)).reports).toEqual([draft]);
    const refreshed = refreshReportDocument(
      { ...draft, id: 'refreshed-provenance' },
      evidenceProfile,
      evidenceSessions().map((entry) =>
        entry.id === source.id ? validatePracticeSession(source) : entry,
      ),
      undefined,
      { lcwo: evidenceLcwo },
    );
    expect(refreshed.answers.points).toBe('77');
    expect(refreshed.answers.groupLength).toBe('');
    expect((await op(owner, { type: 'report-save', report: refreshed })).response.status).toBe(200);
  });
  it('rejects forged points, malformed facts and foreign ownership while preserving captures when later results arrive', async () => {
    const owner = await signIn('provenance-invalid@example.test');
    const other = await signIn('provenance-foreign@example.test');
    const draft = await arrangeEvidence(owner);
    expect(
      (await request('/api/entries', 'POST', evidenceRunner('foreign-runner', 10), other.cookie))
        .status,
    ).toBe(201);
    const before = await getAccountSnapshot(env, owner.user.id);
    const forged = structuredClone(draft);
    forged.provenance!.fields.find((field) => field.key === 'points')!.value = '999';
    const changed = structuredClone(draft);
    changed.provenance!.sources[0].facts[0] = 'Fictional source claim';
    const foreign = structuredClone(draft);
    foreign.evidence[0] = { kind: 'practice', id: 'runner:foreign-runner' };
    const malformed = structuredClone(draft);
    malformed.provenance!.fields[0].references = [9999];
    for (const invalid of [forged, changed, foreign, malformed]) {
      expect((await op(owner, { type: 'report-save', report: invalid })).response.status).toBe(400);
      expect(await getAccountSnapshot(env, owner.user.id)).toEqual(before);
    }
    // Invalid portable structure and another account's references must fail import atomically.
    for (const invalid of [malformed, foreign]) {
      expect(
        (
          await request(
            '/api/import',
            'POST',
            {
              mode: 'merge',
              data: {
                ...backup([]),
                reports: [invalid],
                profile: { ...evidenceProfile, displayName: 'must not save' },
              },
            },
            owner.cookie,
          )
        ).status,
      ).toBe(400);
      expect(await getAccountSnapshot(env, owner.user.id)).toEqual(before);
    }
    const better = evidenceRunner('better-owned', 10);
    expect((await request('/api/entries', 'POST', better, owner.cookie)).status).toBe(201);
    const capturedSave = await op(owner, { type: 'report-save', report: draft });
    expect(capturedSave.response.status, await capturedSave.response.clone().text()).toBe(200);
    expect((await getAccountSnapshot(env, owner.user.id)).reports).toEqual([draft]);
    const next = refreshReportDocument(
      { ...draft, id: 'new-evidence-capture' },
      evidenceProfile,
      [...evidenceSessions(), better],
      undefined,
      { lcwo: evidenceLcwo },
    );
    expect(next.answers.points).toBe('10');
    expect((await op(owner, { type: 'report-save', report: next })).response.status).toBe(200);
    expect(
      (await getAccountSnapshot(env, owner.user.id)).reports?.find((copy) => copy.id === draft.id),
    ).toEqual(draft);
  });
  it('rolls back a report and receipt if saved evidence changes between validation reads and the transaction', async () => {
    const owner = await signIn('provenance-race@example.test');
    const draft = await arrangeEvidence(owner);
    const originalBatch = db.batch.bind(db);
    const spy = vi.spyOn(db, 'batch').mockImplementation(async (statements) => {
      if (statements.some((statement) => statement.sql.startsWith('INSERT INTO advisor_reports'))) {
        db.sqlite
          .prepare('UPDATE users SET history_revision=history_revision+1 WHERE id=?')
          .run(owner.user.id);
      }
      return originalBatch(statements);
    });
    try {
      expect((await op(owner, { type: 'report-save', report: draft })).response.status).toBe(409);
      expect((await getAccountSnapshot(env, owner.user.id)).reports).toEqual([]);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_operation_receipts').get()?.count,
      ).toBe(0);
      expect(
        db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('preserves owned handoffs and explicit exact confirmations with stable retry receipts and linked corrections', async () => {
    const a = await signIn('report-handoff-a@example.test');
    const b = await signIn('report-handoff-b@example.test');
    const handoff = captureReportHandoff(report(), report().createdAt);
    expect((await op(a, { type: 'report-handoff', report: handoff })).response.status).toBe(200);
    const submitted = confirmReportHandoff(handoff, true, '2026-09-28T13:00:00Z');
    const before = await getAccountSnapshot(env, a.user.id);
    const future = {
      ...handoff,
      id: 'future-handoff',
      handoff: { submissionId: 'future-submission' },
      createdAt: '2099-01-01T00:00:00Z',
      updatedAt: '2099-01-01T00:00:00Z',
    };
    expect((await op(a, { type: 'report-handoff', report: future })).response.status).toBe(400);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    for (const invalid of [
      { ...submitted, answers: { ...submitted.answers, name: 'edited after open' } },
      { ...submitted, id: 'unreserved-confirmation' },
      { ...submitted, submittedAt: '2026-09-28T13:00:01Z' },
    ]) {
      expect(
        (await op(a, { type: 'report-confirm', report: invalid, confirmed: true })).response.status,
      ).toBe(400);
      expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    }
    expect(
      (await op(b, { type: 'report-confirm', report: submitted, confirmed: true })).response.status,
    ).toBe(400);
    const confirmed = await op(a, { type: 'report-confirm', report: submitted, confirmed: true });
    expect(confirmed.response.status).toBe(200);
    const after = await getAccountSnapshot(env, a.user.id);
    expect(
      (await request('/api/account-operations', 'POST', confirmed.body, a.cookie)).status,
    ).toBe(200);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(after);
    expect((await op(a, { type: 'report-delete', id: handoff.id })).response.status).toBe(400);
    expect((await op(a, { type: 'report-delete', id: submitted.id })).response.status).toBe(400);
    const correction = {
      ...report(),
      id: 'correction-draft',
      revisionOf: submitted.id,
      answers: { ...report().answers, name: 'Correction' },
    };
    const next = captureReportHandoff(correction, '2026-09-28T14:00:00Z');
    expect((await op(b, { type: 'report-handoff', report: next })).response.status).toBe(400);
    expect((await op(a, { type: 'report-handoff', report: next })).response.status).toBe(200);
    const final = confirmReportHandoff(next, true, '2026-09-28T15:00:00Z');
    expect(
      (await op(a, { type: 'report-confirm', report: final, confirmed: true })).response.status,
    ).toBe(200);
    expect(
      (await getAccountSnapshot(env, a.user.id)).reports?.find((row) => row.id === submitted.id),
    ).toEqual(submitted);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([]);
  });
  it('roundtrips reversed native handoff/submission corrections transactionally and rejects broken/forged relationships', async () => {
    const a = await signIn('report-handoff-import-a@example.test');
    const b = await signIn('report-handoff-import-b@example.test');
    const handoff = captureReportHandoff(report(), report().createdAt);
    const submitted = confirmReportHandoff(handoff, true, '2026-09-28T13:00:00Z');
    const next = captureReportHandoff(
      { ...report(), revisionOf: submitted.id },
      '2026-09-28T14:00:00Z',
    );
    const corrected = confirmReportHandoff(next, true, '2026-09-28T15:00:00Z');
    const reports = [corrected, next, submitted, handoff];
    const incoming = { ...backup([]), reports };
    for (const invalid of [
      [submitted],
      [handoff, { ...submitted, answers: { ...submitted.answers, name: 'Forged' } }],
      [next],
    ]) {
      const before = await getAccountSnapshot(env, a.user.id);
      expect(
        (
          await request(
            '/api/import',
            'POST',
            { mode: 'merge', data: { ...incoming, reports: invalid } },
            a.cookie,
          )
        ).status,
      ).toBe(400);
      expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    }
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: incoming }, a.cookie)).status,
    ).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.reports).toHaveLength(4);
    for (const row of reports)
      expect(exported.reports?.find((candidate) => candidate.id === row.id)).toEqual(row);
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status,
    ).toBe(200);
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status,
    ).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toHaveLength(4);
    const replacing = {
      mode: 'replace' as const,
      data: { ...exported, reports: [...exported.reports!].reverse() },
    };
    const lifecycle = await lifecycleIdentity(b.user.id, 'replace', replacing);
    expect(
      (await request('/api/import', 'POST', { ...replacing, lifecycle }, b.cookie)).status,
    ).toBe(200);
    for (const row of reports)
      expect(
        (await getAccountSnapshot(env, b.user.id)).reports?.find(
          (candidate) => candidate.id === row.id,
        ),
      ).toEqual(row);
    const insert = db.sqlite.prepare(
      'INSERT INTO advisor_reports(user_id,id,report_json) VALUES(?,?,?)',
    );
    expect(() =>
      insert.run(
        a.user.id,
        'missing-parent',
        JSON.stringify({
          ...submitted,
          id: 'missing-parent',
          confirmation: { handoffId: 'absent' },
        }),
      ),
    ).toThrow('report_handoff_missing');
  });
  it('uploads an offline preserved handoff and its exact confirmation after a referenced assessment changes', async () => {
    const a = await signIn('report-handoff-offline-source@example.test');
    const b = await signIn('report-handoff-offline-foreign@example.test');
    const draft = await arrangeEvidence(a);
    const handoff = captureReportHandoff(draft);
    const submitted = confirmReportHandoff(handoff, true);
    const first = evidenceSessions().find((entry) => entry.id === 'audio-evidence')!;
    const edited = {
      ...first,
      metadata: {
        ...first.metadata,
        assessment: { version: 1, source: 'self-reported', performanceRating: 'poor' },
      },
    };
    expect((await request('/api/entries/audio-evidence', 'PUT', edited, a.cookie)).status).toBe(
      200,
    );
    // A local reviewed copy may already have been handed off while its account
    // queue was offline. Its exact provenance is a historical capture, not a
    // claim about the mutable source's current assessment.
    expect((await op(b, { type: 'report-handoff', report: handoff })).response.status).toBe(400);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([]);
    const uploaded = await op(a, { type: 'report-handoff', report: handoff });
    expect(uploaded.response.status, await uploaded.response.clone().text()).toBe(200);
    expect(
      (await op(a, { type: 'report-confirm', report: submitted, confirmed: true })).response.status,
    ).toBe(200);
    expect(
      (await getAccountSnapshot(env, a.user.id)).reports?.find((row) => row.id === submitted.id),
    ).toEqual(submitted);
    expect((await request('/api/account-operations', 'POST', uploaded.body, a.cookie)).status).toBe(
      200,
    );
    // Ordinary new account draft copies still require current captured-source validation.
    expect(
      (await op(a, { type: 'report-save', report: { ...draft, id: 'stale-offline-draft' } }))
        .response.status,
    ).toBe(400);
  });
  it('confirms a captured source after later edits without recomputing frozen evidence and rolls back an acknowledgement failure', async () => {
    const a = await signIn('report-handoff-frozen@example.test');
    const draft = await arrangeEvidence(a);
    const handoff = captureReportHandoff(draft);
    expect((await op(a, { type: 'report-handoff', report: handoff })).response.status).toBe(200);
    const first = evidenceSessions().find((entry) => entry.id === 'audio-evidence')!;
    const corrected = {
      ...first,
      metadata: {
        ...first.metadata,
        assessment: { version: 1, source: 'self-reported', performanceRating: 'poor' },
      },
    };
    expect((await request('/api/entries/audio-evidence', 'PUT', corrected, a.cookie)).status).toBe(
      200,
    );
    // A real mutable assessment changes the captured source; confirmation must still
    // retain the already validated handoff instead of rebuilding today's suggestions.
    expect(
      (await op(a, { type: 'report-save', report: { ...draft, id: 'stale-after-handoff' } }))
        .response.status,
    ).toBe(400);
    const submitted = confirmReportHandoff(handoff, true);
    const before = await getAccountSnapshot(env, a.user.id);
    db.sqlite.exec(
      "CREATE TRIGGER synthetic_report_receipt_failure BEFORE INSERT ON account_operation_receipts BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END;",
    );
    const failed = await op(a, { type: 'report-confirm', report: submitted, confirmed: true });
    expect(failed.response.status).toBe(500);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    expect(
      db.sqlite.prepare('SELECT count(*) AS count FROM account_revision_guards').get()?.count,
    ).toBe(0);
    db.sqlite.exec('DROP TRIGGER synthetic_report_receipt_failure');
    expect((await request('/api/account-operations', 'POST', failed.body, a.cookie)).status).toBe(
      200,
    );
    expect(
      (await getAccountSnapshot(env, a.user.id)).reports?.find((row) => row.id === submitted.id),
    ).toEqual(submitted);
  });
  it('saves immutable owned snapshots, returns exact receipts and rejects stale writes or another owner', async () => {
    const a = await signIn('native-reports-a@example.test');
    const b = await signIn('native-reports-b@example.test');
    const before = await getAccountSnapshot(env, a.user.id);
    const first = await op(a, { type: 'report-save', report: report() });
    expect(first.response.status).toBe(200);
    const after = await getAccountSnapshot(env, a.user.id);
    expect(after.reports).toEqual([report()]);
    expect(after.revision).toBe(before.revision + 1);
    expect((await request('/api/account-operations', 'POST', first.body, a.cookie)).status).toBe(
      200,
    );
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(after);
    expect(
      (
        await op(
          a,
          { type: 'report-save', report: { ...report(), id: 'new-copy' } },
          'stale-report',
          before,
        )
      ).response.status,
    ).toBe(409);
    expect(
      (
        await op(a, {
          type: 'report-save',
          report: { ...report(), answers: { ...report().answers, name: 'changed' } },
        })
      ).response.status,
    ).toBe(400);
    expect((await request('/api/account-operations', 'POST', first.body, b.cookie)).status).toBe(
      409,
    );
    expect((await request('/api/account-state')).status).toBe(401);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([]);
    const reordered = {
      ...report(),
      answers: Object.fromEntries(Object.entries(report().answers).reverse()),
    };
    expect((await op(a, { type: 'report-save', report: reordered })).response.status).toBe(200);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...backup([]), reports: [reordered] } },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await getAccountSnapshot(env, a.user.id)).reports).toEqual([report()]);
  });
  it('reads and exports report history larger than a D1 value while keeping each SQL result row bounded', async () => {
    const a = await signIn('report-large-history@example.test');
    const definition = {
      ...report().definition,
      fields: [
        ...report().definition.fields,
        ...Array.from({ length: 20 }, (_, i) => ({
          key: `note${i}`,
          label: `Notes ${i}`,
          section: 'Questions',
          type: 'textarea' as const,
          required: false,
          source: 'manual' as const,
        })),
      ],
    };
    const answers = {
      ...report().answers,
      ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`note${i}`, 'x'.repeat(4000)])),
    };
    const copies = Array.from({ length: 28 }, (_, i) => ({
      ...report(),
      id: `large-report-${i}`,
      definition,
      answers,
    }));
    const insert = db.sqlite.prepare(
      'INSERT INTO advisor_reports(user_id,id,report_json) VALUES(?,?,?)',
    );
    for (const copy of copies) insert.run(a.user.id, copy.id, JSON.stringify(copy));
    expect(new TextEncoder().encode(JSON.stringify(copies)).length).toBeGreaterThan(2_000_000);
    const results = await env.DB.batch(accountSnapshotStatements(env, a.user.id));
    for (const result of results)
      for (const row of result.results)
        expect(new TextEncoder().encode(JSON.stringify(row)).length).toBeLessThan(2_000_000);
    expect(snapshotFromResults(a.user.id, results).reports).toHaveLength(28);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.reports).toHaveLength(28);
    expect(exported.reports?.find((copy) => copy.id === 'large-report-17')?.answers).toEqual(
      answers,
    );
  });
  it('retains imported submitted history as immutable and enforces the 200-copy bound in SQL', async () => {
    const a = await signIn('report-submitted-bound@example.test');
    const submitted = {
      ...report(),
      status: 'submitted' as const,
      submittedAt: '2026-09-28T12:00:00Z',
    };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...backup([]), reports: [submitted] } },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await op(a, { type: 'report-delete', id: submitted.id })).response.status).toBe(400);
    expect((await op(a, { type: 'report-save', report: submitted })).response.status).toBe(400);
    expect((await getAccountSnapshot(env, a.user.id)).reports).toEqual([submitted]);
    const insert = db.sqlite.prepare(
      'INSERT INTO advisor_reports(user_id,id,report_json) VALUES(?,?,?)',
    );
    for (let i = 1; i < 200; i++) {
      const copy = { ...report(), id: `bounded-${i}` };
      insert.run(a.user.id, copy.id, JSON.stringify(copy));
    }
    const before = await getAccountSnapshot(env, a.user.id);
    expect(
      (await op(a, { type: 'report-save', report: { ...report(), id: 'over-bound' } })).response
        .status,
    ).toBe(400);
    expect(() =>
      insert.run(a.user.id, 'over-bound', JSON.stringify({ ...report(), id: 'over-bound' })),
    ).toThrow('report_copy_limit');
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
  });
  it('rejects malformed and foreign evidence atomically through saved-copy and import paths', async () => {
    const a = await signIn('report-source-owner@example.test');
    const b = await signIn('report-source-other@example.test');
    expect(
      (await request('/api/entries', 'POST', entry('foreign-evidence'), b.cookie)).status,
    ).toBe(201);
    const before = await getAccountSnapshot(env, a.user.id);
    for (const invalid of [
      { ...report(), evidence: [{ kind: 'practice' as const, id: 'foreign-evidence' }] },
      { ...report(), editedKeys: ['unknown'] },
      { ...report(), answers: { ...report().answers, session: 'prose' } },
    ]) {
      expect((await op(a, { type: 'report-save', report: invalid })).response.status).toBe(400);
      expect(
        (
          await request(
            '/api/import',
            'POST',
            {
              mode: 'merge',
              data: {
                ...backup([]),
                profile: { ...DEFAULT_PROFILE, displayName: 'must not save' },
                reports: [invalid],
              },
            },
            a.cookie,
          )
        ).status,
      ).toBe(400);
      expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    }
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM advisor_reports').get()?.count).toBe(0);
  });
  it('roundtrips answers, blanks, edits and source references across accounts and handles old omitted reports', async () => {
    const a = await signIn('report-export-owner@example.test');
    const b = await signIn('report-export-other@example.test');
    expect((await request('/api/entries', 'POST', entry('owned-source'), a.cookie)).status).toBe(
      201,
    );
    const copy = { ...report(), evidence: [{ kind: 'practice' as const, id: 'owned-source' }] };
    expect((await op(a, { type: 'report-save', report: copy })).response.status).toBe(200);
    const exported = (await (
      await request('/api/export', 'GET', undefined, a.cookie)
    ).json()) as TrainingExport;
    expect(exported.reports).toEqual([copy]);
    for (let i = 0; i < 2; i++)
      expect(
        (await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status,
      ).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([copy]);
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: backup([]) }, b.cookie)).status,
    ).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([copy]);
    expect(
      (await request('/api/import', 'POST', { mode: 'replace', data: backup([]) }, b.cookie))
        .status,
    ).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([]);
    expect((await getAccountSnapshot(env, a.user.id)).reports).toEqual([copy]);
  });
  it('protects referenced history until draft-copy removal and keeps working identity separate', async () => {
    const a = await signIn('report-remove@example.test');
    expect((await request('/api/entries', 'POST', entry('owned-source'), a.cookie)).status).toBe(
      201,
    );
    const copy = { ...report(), evidence: [{ kind: 'practice' as const, id: 'owned-source' }] };
    expect((await op(a, { type: 'report-save', report: copy })).response.status).toBe(200);
    expect((await request('/api/entries/owned-source', 'DELETE', undefined, a.cookie)).status).toBe(
      409,
    );
    const removed = await op(a, { type: 'report-delete', id: copy.id });
    expect(removed.response.status).toBe(200);
    expect((await request('/api/account-operations', 'POST', removed.body, a.cookie)).status).toBe(
      200,
    );
    expect((await request('/api/entries/owned-source', 'DELETE', undefined, a.cookie)).status).toBe(
      200,
    );
    expect((await getAccountSnapshot(env, a.user.id)).reports).toEqual([]);
  });
  it('requires archive provenance to belong to the account and retains it in portable copies', async () => {
    const a = await signIn('report-original-owner@example.test');
    const b = await signIn('report-original-other@example.test');
    const legacy = {
      source: 'rwjblue.com' as const,
      data: {
        reportDrafts: {
          '1': { id: 'original-working', session: 1, status: 'draft', answers: { callsign: '' } },
        },
      },
    };
    expect(
      (
        await request(
          '/api/import',
          'POST',
          { mode: 'merge', data: { ...backup([]), legacy } },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    const archiveId = db.sqlite
      .prepare('SELECT source_hash FROM import_sources WHERE user_id=?')
      .get(a.user.id)?.source_hash as string;
    const original = {
      ...report(),
      source: { kind: 'original-device' as const, id: 'original-working', archiveId },
    };
    expect((await op(a, { type: 'report-save', report: original })).response.status).toBe(200);
    expect((await op(b, { type: 'report-save', report: original })).response.status).toBe(400);
    const exported = await (await request('/api/export', 'GET', undefined, a.cookie)).json();
    expect(
      (await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status,
    ).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).reports).toEqual([original]);
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'merge',
            data: { ...backup([]), legacy: { ...legacy, data: { reportDrafts: {} } } },
          },
          a.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      ((await (await request('/api/export', 'GET', undefined, a.cookie)).json()) as TrainingExport)
        .legacy,
    ).toEqual(legacy);
  });
  it('rolls back reports, profile and result inserts on storage refusal and reset retires pending copies', async () => {
    const a = await signIn('report-rollback@example.test');
    const before = await getAccountSnapshot(env, a.user.id);
    db.sqlite.exec(
      "CREATE TRIGGER reject_report BEFORE INSERT ON advisor_reports BEGIN SELECT RAISE(ABORT,'synthetic_report_failure'); END;",
    );
    expect(
      (
        await request(
          '/api/import',
          'POST',
          {
            mode: 'merge',
            data: {
              ...backup(),
              profile: { ...DEFAULT_PROFILE, displayName: 'must rollback' },
              reports: [report()],
            },
          },
          a.cookie,
        )
      ).status,
    ).toBe(500);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_entries').get()?.count).toBe(
      0,
    );
    db.sqlite.exec('DROP TRIGGER reject_report');
    const saved = await op(a, { type: 'report-save', report: report() });
    expect(saved.response.status).toBe(200);
    const stale = await getAccountSnapshot(env, a.user.id);
    expect((await request('/api/reset', 'POST', { confirmation: 'RESET' }, a.cookie)).status).toBe(
      200,
    );
    expect((await getAccountSnapshot(env, a.user.id)).reports).toEqual([]);
    expect(
      (
        await op(
          a,
          { type: 'report-save', report: { ...report(), id: 'retired-report' } },
          'retired-report-operation',
          stale,
        )
      ).response.status,
    ).toBe(409);
  });
  it('enforces ordinary encoded-byte quota and reference ownership within real SQL', async () => {
    const a = await signIn('report-quota@example.test');
    db.sqlite
      .prepare('UPDATE users SET storage_bytes=lifecycle_control_bytes+6291456 WHERE id=?')
      .run(a.user.id);
    const before = await getAccountSnapshot(env, a.user.id);
    expect((await op(a, { type: 'report-save', report: report() })).response.status).toBe(400);
    expect(await getAccountSnapshot(env, a.user.id)).toEqual(before);
    db.sqlite
      .prepare('UPDATE users SET storage_bytes=lifecycle_control_bytes WHERE id=?')
      .run(a.user.id);
    expect(() =>
      db.sqlite.prepare('INSERT INTO advisor_reports(user_id,id,report_json) VALUES(?,?,?)').run(
        a.user.id,
        'sql-missing',
        JSON.stringify({
          ...report(),
          id: 'sql-missing',
          evidence: [{ kind: 'practice', id: 'absent' }],
        }),
      ),
    ).toThrow('report_evidence_missing');
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM advisor_reports').get()?.count).toBe(0);
  });
});


describe('private immutable instructor materials', () => {
  const material = (id = 'material:first'): InstructorMaterial => ({ version: 1, id,
    course: { level: 'beginner', firstClassDate: '2026-09-28' }, session: 1,
    title: 'Synthetic sending preparation', text: '<script>plain text only</script> ABC DEF', usage: 'preparation',
    createdAt: '2026-09-28T12:00:00.000Z' });
  async function create(auth: Awaited<ReturnType<typeof signIn>>, row: InstructorMaterial) {
    const state = await getAccountSnapshot(env, auth.user.id);
    const operation: AccountOperation = { version: 1, id: crypto.randomUUID(), accountId: auth.user.id,
      baseRevision: state.revision, generation: state.generation, createdAt: '2026-09-28T12:00:00Z',
      change: { type: 'material-create', material: row } };
    return { operation, response: await request('/api/account-operations', 'POST', operation, auth.cookie) };
  }
  async function owner(email: string) {
    const auth = await signIn(email);
    expect((await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' }, auth.cookie)).status).toBe(200);
    return auth;
  }
  const attempt = (row: InstructorMaterial, id: string, context: 'practice' | 'class' = 'practice') => ({
    ...entry(id), kind: 'sending', lesson: row.session, context, source: 'timer',
    metadata: { elapsedSeconds: 900, recallSeconds: 0, instructorMaterial: materialReference(row),
      ...(context === 'practice' ? { materialCompleted: true } : {}) },
  });
  it('saves exact versions with equivalent retry, private ownership, class separation and portable reverse-ordered revision backups', async () => {
    const a = await owner('material-a@example.test'); const b = await owner('material-b@example.test');
    const first = material(); const saved = await create(a, first); expect(saved.response.status).toBe(200);
    expect((await request('/api/account-operations', 'POST', saved.operation, a.cookie)).status).toBe(200);
    expect((await getAccountSnapshot(env, a.user.id)).materials).toEqual([first]);
    expect((await getAccountSnapshot(env, b.user.id)).materials).toEqual([]);
    expect((await request('/api/entries', 'POST', attempt(first, 'material-attempt'), b.cookie)).status).toBe(400);
    expect((await request('/api/entries', 'POST', attempt(first, 'material-attempt'), a.cookie)).status).toBe(201);
    expect((await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, level: 'intermediate', firstClassDate: '2026-10-01' }, a.cookie)).status).toBe(200);
    const revision = { ...first, id: 'material:revision', title: 'Revised preparation', text: 'XYZ', supersedesId: first.id };
    expect((await create(a, revision)).response.status).toBe(200);
    expect((await request('/api/entries', 'POST', attempt(revision, 'class-attempt', 'class'), a.cookie)).status).toBe(201);
    const exported = await (await request('/api/export', 'GET', undefined, a.cookie)).json() as TrainingExport;
    expect(exported.materials).toEqual([first, revision]);
    expect(exported.sessions.find((session) => session.id === 'material-attempt')?.metadata?.instructorMaterial).toEqual(materialReference(first));
    expect(exported.sessions.filter((session) => session.context !== 'class').reduce((sum, session) => sum + session.minutes, 0)).toBe(15);
    const changed = await request('/api/entries/material-attempt', 'PUT', attempt(revision, 'material-attempt'), a.cookie);
    expect(changed.status).toBe(400);
    const restored = await request('/api/import', 'POST', { mode: 'merge', data: { ...exported, materials: [revision, first] } }, b.cookie);
    expect(restored.status).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).materials).toEqual([first, revision]);
    expect((await request('/api/import', 'POST', { mode: 'merge', data: exported }, b.cookie)).status).toBe(200);
    expect((await request('/api/reset', 'POST', { confirmation: 'RESET' }, b.cookie)).status).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).materials).toEqual([]);
    expect((await request('/api/import', 'POST', { mode: 'replace', data: exported }, b.cookie)).status).toBe(200);
    expect((await getAccountSnapshot(env, b.user.id)).materials).toEqual([first, revision]);
    expect((await request('/api/account-state', 'GET')).status).toBe(401);
  });
  it('rejects missing/foreign parents, overwritten versions, forged references, invalid payloads and rolls back failed imports', async () => {
    const a = await owner('material-validation@example.test'); const first = material();
    expect((await create(a, first)).response.status).toBe(200);
    const baseline = await getAccountSnapshot(env, a.user.id);
    for (const invalid of [ { ...first, text: 'changed' }, { ...first, id: 'new', supersedesId: 'foreign' },
      { ...first, id: 'other-session', session: 2, supersedesId: first.id }, { ...first, id: 'bad-text', text: 'null\0text' },
      { ...first, id: 'bad-url', url: 'https://username:password@example.test' } ])
      expect((await create(a, invalid)).response.status).toBe(400);
    expect((await getAccountSnapshot(env, a.user.id)).revision).toBe(baseline.revision);
    const forged = attempt(first, 'forged'); forged.metadata.instructorMaterial.title = 'Different version';
    expect((await request('/api/entries', 'POST', forged, a.cookie)).status).toBe(400);
    const missing = attempt({ ...first, id: 'missing' }, 'missing-attempt');
    expect((await request('/api/import', 'POST', { mode: 'merge', data: { ...backup([missing]), materials: [first] } }, a.cookie)).status).toBe(400);
    db.sqlite.exec("CREATE TRIGGER reject_material_result BEFORE INSERT ON practice_entries WHEN NEW.id='rollback-attempt' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    const added = material('rollback-material');
    expect((await request('/api/import', 'POST', { mode: 'merge', data: { ...backup([attempt(added, 'rollback-attempt')]), materials: [added] } }, a.cookie)).status).toBe(500);
    expect((await getAccountSnapshot(env, a.user.id)).materials).toEqual([first]);
    expect(db.sqlite.prepare('SELECT count(*) AS total FROM practice_entries WHERE user_id=?').get(a.user.id)?.total).toBe(0);
  });
  it('makes bounded copies of unmatched original revision chains without changing archive content and rejects substituted source facts', async () => {
    const a = await owner('original-material@example.test');
    const original = { course: { title: 'Unmatched synthetic course' }, materials: [
      { id: 'original:first', session: 17, title: 'Original preparation', text: 'KEEP THIS', usage: 'preparation', createdAt: '2026-09-27T12:00:00Z' },
      { id: 'original:revision', session: 17, title: 'Original revision', text: 'KEEP REVISION', usage: 'class', supersedesId: 'original:first', createdAt: '2026-09-28T12:00:00Z' },
    ], attempts: [] };
    expect((await request('/api/import', 'POST', { mode: 'merge', data: original }, a.cookie)).status).toBe(200);
    expect((await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' }, a.cookie)).status).toBe(200);
    const state = await getAccountSnapshot(env, a.user.id); expect(state.originalMaterials?.materials).toHaveLength(2);
    const copy = originalMaterialCopy(original.materials[1], state.originalMaterials!.archiveId, material().course, 1, material().createdAt);
    expect((await create(a, { ...copy, text: 'substituted' })).response.status).toBe(400);
    expect((await create(a, copy)).response.status).toBe(200);
    expect((await request('/api/entries', 'POST', attempt(copy, 'original-copy-attempt'), a.cookie)).status).toBe(201);
    const exported = await (await request('/api/export', 'GET', undefined, a.cookie)).json() as TrainingExport;
    expect(exported.legacy?.data).toEqual(original);
    expect(exported.materials?.[0].origin?.supersedesId).toBe('original:first');
    const other = await owner('material-archive-restore@example.test');
    expect((await request('/api/import', 'POST', { mode: 'replace', data: exported }, other.cookie)).status).toBe(200);
    expect((await getAccountSnapshot(env, other.user.id)).materials).toEqual(exported.materials);
    expect((await request('/api/import', 'POST', { mode: 'merge', data: { ...original, materials: [] } }, a.cookie)).status).toBe(400);
    expect((await (await request('/api/export', 'GET', undefined, a.cookie)).json() as TrainingExport).legacy?.data).toEqual(original);
  });
});


it('enforces material version and account byte quotas in actual SQL without partial account-operation receipts', async () => {
  const auth = await signIn('material-quota@example.test');
  expect((await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' }, auth.cookie)).status).toBe(200);
  const material: InstructorMaterial = { version: 1, id: 'quota-material', course: { level: 'beginner', firstClassDate: '2026-09-28' }, session: 1,
    title: 'Quota material', text: 'SYNTHETIC', usage: 'reference', createdAt: '2026-09-28T00:00:00.000Z' };
  for (let i = 0; i < 200; i++) db.sqlite.prepare('INSERT INTO instructor_materials(user_id,id,material_json) VALUES(?,?,?)')
    .run(auth.user.id, `quota:${i}`, JSON.stringify({ ...material, id: `quota:${i}` }));
  expect(() => db.sqlite.prepare('INSERT INTO instructor_materials(user_id,id,material_json) VALUES(?,?,?)').run(auth.user.id, material.id, JSON.stringify(material))).toThrow('material_version_limit');
  const state = await getAccountSnapshot(env, auth.user.id);
  const operation: AccountOperation = { version: 1, id: 'quota-operation', accountId: auth.user.id, baseRevision: state.revision,
    generation: state.generation, createdAt: material.createdAt, change: { type: 'material-create', material } };
  expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(400);
  expect((await getAccountSnapshot(env, auth.user.id)).revision).toBe(state.revision);
  db.sqlite.prepare('DELETE FROM instructor_materials WHERE user_id=?').run(auth.user.id);
  db.sqlite.prepare('UPDATE users SET storage_bytes=lifecycle_control_bytes+6291456 WHERE id=?').run(auth.user.id);
  expect((await request('/api/account-operations', 'POST', operation, auth.cookie)).status).toBe(400);
  expect(db.sqlite.prepare('SELECT count(*) AS total FROM instructor_materials WHERE user_id=?').get(auth.user.id)?.total).toBe(0);
  expect((await getAccountSnapshot(env, auth.user.id)).revision).toBe(state.revision);
});


it('preserves a large original material inventory through the real private account snapshot and native copy without converting its archive', async () => {
  const auth = await signIn('large-original-materials@example.test');
  const original = { course: { title: 'Synthetic original', resources: [{ url: 'https://example.test/private' }] }, attempts: [],
    materials: Array.from({ length: 1001 }, (_, i) => ({ id: `original-large:${i}`, session: 1, title: `Source ${i}`, text: 'PRIVATE SOURCE', usage: 'reference' })) };
  expect((await request('/api/import', 'POST', { mode: 'merge', data: original }, auth.cookie)).status).toBe(200);
  expect((await request('/api/settings', 'PUT', { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' }, auth.cookie)).status).toBe(200);
  const state = await getAccountSnapshot(env, auth.user.id);
  expect(state.originalMaterials?.materials).toHaveLength(1001);
  expect(state.originalMaterials?.course).not.toHaveProperty('resources');
  const material = originalMaterialCopy(state.originalMaterials!.materials[1000], state.originalMaterials!.archiveId,
    { level: 'beginner', firstClassDate: '2026-09-28' }, 1, '2026-09-28T00:00:00.000Z');
  const body: AccountOperation = { version: 1, id: 'large-source-copy', accountId: auth.user.id, baseRevision: state.revision,
    generation: state.generation, createdAt: material.createdAt, change: { type: 'material-create', material } };
  expect((await request('/api/account-operations', 'POST', body, auth.cookie)).status).toBe(200);
  const exported = await (await request('/api/export', 'GET', undefined, auth.cookie)).json() as TrainingExport;
  expect(exported.legacy?.data).toEqual(original); expect(exported.materials).toEqual([material]);
});
