import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminStats } from '../shared/admin-stats';
import { DEFAULT_PROFILE } from '../shared/training';
import {
  cleanupAdminStats,
  getAdminStats,
  recordAccountActivity,
  recordPracticeUsage,
} from './admin-stats';
import { hash } from './security';
import { getAccountSnapshot } from './account-sync';
import worker from './index';

// The transport adapter executes every production migration and real SQLite SQL.
class SQLiteDatabase {
  readonly sqlite = new DatabaseSync(':memory:');
  private batches = Promise.resolve();
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
}

class SQLiteStatement {
  private values: SQLInputValue[] = [];
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
  ) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.values);
    return (row ? (column ? row[column] : row) : null) as T | null;
  }
  async all<T>(): Promise<D1Result<T>> {
    const before = Number(this.sqlite.prepare('SELECT total_changes() AS count').get()?.count ?? 0);
    const results = this.sqlite.prepare(this.sql).all(...this.values) as T[];
    return {
      success: true,
      results,
      meta: {
        changes:
          Number(this.sqlite.prepare('SELECT total_changes() AS count').get()?.count ?? 0) - before,
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
      },
    };
  }
  async run<T>() {
    return this.all<T>();
  }
}

const origin = 'https://cwa.example.test';
const now = Date.parse('2026-10-09T12:00:00.000Z');
const token = 'a'.repeat(43);
let db: SQLiteDatabase;
let env: Env;

const usageRequest = (body: unknown, extraHeaders?: HeadersInit) =>
  new Request(`${origin}/api/practice-usage`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
const statsRequest = (query = '', signedIn = true) =>
  new Request(`${origin}/api/admin/stats${query}`, {
    headers: signedIn ? { Cookie: `__Host-cwa-session=${token}` } : {},
  });

beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  db = new SQLiteDatabase();
  env = {
    DB: db as unknown as D1Database,
    APP_ORIGIN: origin,
    AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    ENVIRONMENT: 'test',
    EMAIL_FROM: 'signin@example.test',
    EMAIL: { send: async () => undefined } as unknown as SendEmail,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
  };
  db.sqlite
    .prepare('INSERT INTO users(id, email, created_at) VALUES (?, ?, ?)')
    .run('viewer', 'private-viewer@example.test', now);
  db.sqlite
    .prepare(
      'INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .run(await hash(token), 'viewer', now, now + 60_000);
  db.sqlite
    .prepare('UPDATE admin_stats_metadata SET practice_collection_started_day = ?')
    .run('2026-10-01');
});

afterEach(() => {
  db.sqlite.close();
  vi.restoreAllMocks();
});

describe('anonymous practice counters', () => {
  it('atomically counts guests and accounts using only day, tool, audience, and count', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        recordPracticeUsage(
          usageRequest(
            { tool: 'words', audience: i < 13 ? 'guest' : 'account' },
            { Cookie: 'unrelated-private-cookie' },
          ),
          env,
        ),
      ),
    );
    expect(db.sqlite.prepare('SELECT * FROM practice_usage ORDER BY audience').all()).toEqual([
      { day: '2026-10-09', tool: 'words', audience: 'account', count: 7 },
      { day: '2026-10-09', tool: 'words', audience: 'guest', count: 13 },
    ]);
    expect(
      db.sqlite
        .prepare('PRAGMA table_info(practice_usage)')
        .all()
        .map((column) => column.name),
    ).toEqual(['day', 'tool', 'audience', 'count']);
    expect(
      db.sqlite.prepare('SELECT last_activity_day FROM users').get()?.last_activity_day,
    ).toBeNull();
    const queries = vi.spyOn(env.DB, 'prepare');
    expect(
      (await recordPracticeUsage(usageRequest({ tool: 'runner', audience: 'account' }), env))
        .status,
    ).toBe(204);
    expect(queries.mock.calls).toHaveLength(1);
    expect(queries.mock.calls[0][0]).toMatch(/^INSERT INTO practice_usage/);
  });

  it('rejects personal fields, unsupported values, oversized bodies, and cross-origin reporting without writes', async () => {
    for (const body of [
      { tool: 'words', audience: 'guest', accountId: 'private-id' },
      { tool: 'words', audience: 'guest', date: '2026-01-01' },
      { tool: 'private custom practice', audience: 'guest' },
      { tool: 'words', audience: 'instructor' },
      { tool: 'words' },
    ]) {
      await expect(recordPracticeUsage(usageRequest(body), env)).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(
      recordPracticeUsage(usageRequest({ tool: 'x'.repeat(300), audience: 'guest' }), env),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      recordPracticeUsage(
        usageRequest(
          { tool: 'words', audience: 'guest' },
          { Origin: 'https://other.example.test' },
        ),
        env,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_usage').get()?.count).toBe(0);
    expect(
      (await worker.fetch(usageRequest({ tool: 'copy', audience: 'guest' }), env)).status,
    ).toBe(204);
  });

  it('rejects excess reports before database writes and accepts reports after the local bucket refills', async () => {
    let accepted = 0;
    let rejected = false;
    for (let attempt = 0; attempt <= 120; attempt++) {
      const response = await worker.fetch(usageRequest({ tool: 'words', audience: 'guest' }), env);
      if (response.status === 429) {
        rejected = true;
        break;
      }
      expect(response.status).toBe(204);
      accepted += 1;
    }
    expect(rejected).toBe(true);
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThanOrEqual(120);
    expect(db.sqlite.prepare('SELECT count FROM practice_usage').get()?.count).toBe(accepted);
    const queries = vi.spyOn(env.DB, 'prepare');
    expect(
      (await worker.fetch(usageRequest({ tool: 'copy', audience: 'account' }), env)).status,
    ).toBe(429);
    expect(queries).not.toHaveBeenCalled();
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    expect(
      (await worker.fetch(usageRequest({ tool: 'words', audience: 'guest' }), env)).status,
    ).toBe(204);
    expect(db.sqlite.prepare('SELECT count FROM practice_usage').get()?.count).toBe(accepted + 1);
  });

  it('retains exactly 180 UTC days and records cleanup only after its transaction succeeds', async () => {
    const cutoff = new Date(Date.parse('2026-10-09T00:00:00Z') - 179 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const expired = new Date(Date.parse(`${cutoff}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const day of [expired, cutoff, '2026-10-09']) {
      db.sqlite
        .prepare('INSERT INTO practice_usage(day,tool,audience,count) VALUES (?, ?, ?, ?)')
        .run(day, 'copy', 'guest', 1);
    }
    await cleanupAdminStats(env, now);
    expect(db.sqlite.prepare('SELECT day FROM practice_usage ORDER BY day').all()).toEqual([
      { day: cutoff },
      { day: '2026-10-09' },
    ]);
    expect(
      db.sqlite.prepare('SELECT last_cleanup_at FROM admin_stats_metadata').get()?.last_cleanup_at,
    ).toBe('2026-10-09T12:00:00.000Z');
    db.sqlite.exec(
      `CREATE TRIGGER fail_usage_cleanup BEFORE DELETE ON practice_usage BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;`,
    );
    await expect(cleanupAdminStats(env, now + 180 * 86_400_000)).rejects.toThrow(
      'synthetic failure',
    );
    expect(
      db.sqlite.prepare('SELECT last_cleanup_at FROM admin_stats_metadata').get()?.last_cleanup_at,
    ).toBe('2026-10-09T12:00:00.000Z');
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM practice_usage').get()?.count).toBe(2);
  });
});

describe('read-only maintainer statistics', () => {
  const grant = () =>
    db.sqlite
      .prepare('INSERT INTO account_roles(user_id,role,granted_at) VALUES (?, ?, ?)')
      .run('viewer', 'metrics_viewer', now);

  it('checks the server grant each time, including direct access and revocation during an existing session', async () => {
    expect((await worker.fetch(statsRequest('', false), env)).status).toBe(401);
    expect((await worker.fetch(statsRequest(), env)).status).toBe(403);
    grant();
    expect((await worker.fetch(statsRequest(), env)).status).toBe(200);
    db.sqlite.prepare('DELETE FROM account_roles WHERE user_id = ?').run('viewer');
    expect((await worker.fetch(statsRequest(), env)).status).toBe(403);
    expect(
      db.sqlite.prepare('SELECT last_activity_day FROM users').get()?.last_activity_day,
    ).toBeNull();
    grant();
    db.sqlite.prepare('DELETE FROM users WHERE id = ?').run('viewer');
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM account_roles').get()?.count).toBe(0);
  });

  it('returns aggregate counts, marks days before collection unavailable, and never returns private account fields', async () => {
    grant();
    for (const [id, created, active] of [
      ['recent', '2026-10-03', '2026-10-08'],
      ['older', '2026-09-10', '2026-09-10'],
      ['inactive', '2026-08-01', null],
    ] as const) {
      db.sqlite
        .prepare('INSERT INTO users(id,email,created_at,last_activity_day) VALUES (?, ?, ?, ?)')
        .run(id, `${id}-private@example.test`, Date.parse(`${created}T00:00:00Z`), active);
    }
    await recordAccountActivity(env, 'viewer');
    db.sqlite.prepare('UPDATE users SET storage_bytes = 321 WHERE id = ?').run('viewer');
    await recordPracticeUsage(usageRequest({ tool: 'words', audience: 'guest' }), env);
    await recordPracticeUsage(usageRequest({ tool: 'copy', audience: 'account' }), env);
    const response = await getAdminStats(statsRequest('?days=30'), env);
    const body = await response.text();
    const stats = JSON.parse(body) as AdminStats;
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).not.toContain('private@example.test');
    expect(body).not.toContain('private-viewer');
    expect(stats.accounts).toEqual({
      total: 4,
      created7: 2,
      created30: 3,
      activeToday: 1,
      active7: 2,
      active30: 3,
    });
    expect(stats.practice.series).toHaveLength(30);
    expect(stats.practice.series[0]).toEqual({ day: '2026-09-10', guest: null, account: null });
    expect(stats.practice.series.find((day) => day.day === '2026-10-01')).toEqual({
      day: '2026-10-01',
      guest: 0,
      account: 0,
    });
    expect(stats.practice.series.at(-1)).toEqual({ day: '2026-10-09', guest: 1, account: 1 });
    expect(stats.practice.tools.find((tool) => tool.tool === 'copy')).toEqual({
      tool: 'copy',
      guest: 0,
      account: 1,
    });
    expect(stats.practice.totals).toEqual({ guest: 1, account: 1, total: 2 });
    expect(stats.operations).toMatchObject({
      databaseReachable: true,
      accountStorageBytes: 321,
      databaseStorageBytes: null,
      lastCleanupAt: null,
    });
    expect(stats.timezone).toBe('UTC');
    for (const days of ['7', '180']) {
      expect(
        ((await (await getAdminStats(statsRequest(`?days=${days}`), env)).json()) as AdminStats)
          .practice.series,
      ).toHaveLength(Number(days));
    }
    await expect(getAdminStats(statsRequest('?days=90'), env)).rejects.toMatchObject({
      status: 400,
    });
    await expect(getAdminStats(statsRequest('?days=7&days=180'), env)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('keeps one account activity day without repeated same-day writes, and measurement failures do not break use', async () => {
    const changes = () =>
      Number(db.sqlite.prepare('SELECT total_changes() AS count').get()?.count ?? 0);
    await recordAccountActivity(env, 'viewer');
    const afterFirst = changes();
    await recordAccountActivity(env, 'viewer');
    expect(changes()).toBe(afterFirst);
    vi.mocked(Date.now).mockReturnValue(now + 86_400_000);
    await recordAccountActivity(env, 'viewer');
    expect(
      db.sqlite.prepare('SELECT last_activity_day FROM users WHERE id = ?').get('viewer')
        ?.last_activity_day,
    ).toBe('2026-10-10');
    vi.spyOn(env.DB, 'prepare').mockImplementation(() => {
      throw new Error('synthetic database failure');
    });
    await expect(recordAccountActivity(env, 'viewer')).resolves.toBeUndefined();
  });

  it('updates activity only after successful private workspace use, excluding authentication and statistics requests', async () => {
    grant();
    const activityDay = () =>
      db.sqlite.prepare('SELECT last_activity_day FROM users WHERE id = ?').get('viewer')
        ?.last_activity_day;
    const clearActivity = () =>
      db.sqlite.prepare('UPDATE users SET last_activity_day = NULL WHERE id = ?').run('viewer');
    const call = (path: string, method = 'GET', body?: unknown) =>
      worker.fetch(
        new Request(`${origin}${path}`, {
          method,
          headers: {
            Origin: origin,
            Cookie: `__Host-cwa-session=${token}`,
            'Content-Type': 'application/json',
            'X-CWA-Account': 'viewer',
            'X-CWA-Generation': '0',
            'If-Match': String(
              db.sqlite.prepare('SELECT account_revision FROM users WHERE id = ?').get('viewer')
                ?.account_revision,
            ),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
      );
    for (const path of [
      '/api/me',
      '/api/account-state',
      '/api/admin/access',
      '/api/admin/stats',
      '/api/auth/passkeys',
    ]) {
      expect((await call(path)).status).toBe(200);
      expect(activityDay()).toBeNull();
    }
    expect(
      (await call('/api/auth/email/request', 'POST', { email: 'unregistered@example.test' }))
        .status,
    ).toBe(200);
    expect(
      (await call('/api/practice-usage', 'POST', { tool: 'words', audience: 'account' })).status,
    ).toBe(204);
    expect(activityDay()).toBeNull();
    expect((await call('/api/entries', 'POST', { kind: 'invalid' })).status).toBe(400);
    expect(activityDay()).toBeNull();
    for (const path of ['/api/entries', '/api/plan', '/api/settings']) {
      expect((await call(path)).status).toBe(200);
      expect(activityDay()).toBe('2026-10-09');
      clearActivity();
    }
    const task = {
      id: 'activity-task',
      title: 'Practice',
      kind: 'sending',
      done: false,
      notes: '',
      createdAt: new Date(now).toISOString(),
    };
    const writes: [string, string, unknown][] = [
      [
        '/api/entries',
        'POST',
        {
          id: 'activity-result',
          date: '2026-10-09',
          kind: 'listening',
          minutes: 5,
          notes: '',
          createdAt: new Date(now).toISOString(),
        },
      ],
      ['/api/plan', 'POST', task],
      ['/api/plan/activity-task', 'PUT', { ...task, title: 'Updated practice' }],
      ['/api/settings', 'PUT', { settings: DEFAULT_PROFILE }],
    ];
    for (const [path, method, body] of writes) {
      expect((await call(path, method, body)).ok).toBe(true);
      expect(activityDay()).toBe('2026-10-09');
      clearActivity();
    }
    const state = await getAccountSnapshot(env, 'viewer');
    expect(
      (
        await call('/api/account-operations', 'POST', {
          version: 1,
          id: 'activity-operation',
          accountId: 'viewer',
          baseRevision: state.revision,
          generation: state.generation,
          createdAt: new Date(now).toISOString(),
          change: { type: 'settings', changes: { displayName: 'Viewer' } },
        })
      ).status,
    ).toBe(200);
    expect(activityDay()).toBe('2026-10-09');
  });

  it('returns the successful workspace response when optional activity storage fails', async () => {
    const originalPrepare = env.DB.prepare.bind(env.DB);
    vi.spyOn(env.DB, 'prepare').mockImplementation((sql) => {
      if (sql.includes('UPDATE users SET last_activity_day'))
        throw new Error('synthetic measurement failure');
      return originalPrepare(sql);
    });
    const response = await worker.fetch(
      new Request(`${origin}/api/entries`, {
        headers: { Cookie: `__Host-cwa-session=${token}` },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entries: [] });
    expect(
      db.sqlite.prepare('SELECT last_activity_day FROM users').get()?.last_activity_day,
    ).toBeNull();
  });
});
