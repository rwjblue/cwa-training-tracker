import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseAccessOptions,
  runStatsAccess,
  sqlLiteral,
} from '../../scripts/admin-stats-access.ts';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../../migrations/', import.meta.url)).sort()) {
    if (file.endsWith('.sql'))
      sqlite.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
  }
  sqlite
    .prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
    .run('ordinary-account', "o'connor@example.com", 0);
  const targets: string[] = [];
  const messages: string[] = [];
  const dependencies = {
    execute: async (sql: string, target: '--local' | '--remote') => {
      targets.push(target);
      return sqlite.prepare(sql).all() as Record<string, unknown>[];
    },
    now: () => 123_456,
    log: (message: string) => messages.push(message),
  };
  return { sqlite, dependencies, targets, messages };
}

describe('operator metrics access', () => {
  it('normalizes the email and requires an explicit database target', () => {
    expect(parseAccessOptions(['grant', " O'Connor@Example.com ", '--local'])).toEqual({
      operation: 'grant',
      email: "o'connor@example.com",
      target: '--local',
    });
    expect(parseAccessOptions(['revoke', '--remote', 'learner@example.com']).target).toBe(
      '--remote',
    );
  });

  it.each([
    ['grant', 'learner@example.com'],
    ['grant', 'learner@example.com', '--local', '--remote'],
    ['grant', 'learner@example.com', '--local', '--local'],
    ['grant', 'learner@example.com', '--remote', 'extra@example.com'],
    ['grant', 'learner@example.com', '--unexpected'],
    ['grant', 'learner@example.com', '--local', '--config'],
    ['grant', 'learner@example.com', '--local', '--config', '--persist-to'],
    ['grant', 'learner@example.com', '--local', '--config', 'a.json', '--config', 'b.json'],
    ['grant', 'learner@example.com', '--remote', '--persist-to', '.tmp/test-state'],
    ['create', 'learner@example.com', '--local'],
    ['grant', 'not-an-email', '--local'],
    ['grant', 'learner@example.com\0', '--local'],
  ])('rejects invalid operator arguments before accessing D1: %j', async (...args) => {
    let calls = 0;
    await expect(
      runStatsAccess(args, {
        execute: async () => {
          calls += 1;
          return [];
        },
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it('forwards isolated local configuration and persistence paths to each D1 operation', async () => {
    const calls: unknown[] = [];
    await runStatsAccess(
      [
        'grant',
        'learner@example.com',
        '--local',
        '--config',
        '.tmp/config.json',
        '--persist-to',
        '.tmp/isolated state',
      ],
      {
        execute: async (sql, target, options) => {
          calls.push({ target, options });
          return sql.startsWith('SELECT') ? [{ id: 'account' }] : [];
        },
        log: () => {},
      },
    );
    expect(calls).toEqual(
      Array(2).fill({
        target: '--local',
        options: { config: '.tmp/config.json', persistTo: '.tmp/isolated state' },
      }),
    );
  });

  it('quotes a SQL literal without allowing extra statements', () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const value = "x'); DROP TABLE users; --@example.com";
      expect(sqlite.prepare(`SELECT ${sqlLiteral(value)} AS email`).get()?.email).toBe(value);
      expect(() => sqlLiteral('email\0@example.com')).toThrow('null bytes');
    } finally {
      sqlite.close();
    }
  });

  it('grants by verified email against the permanent ID, preserves the first grant, and revokes idempotently', async () => {
    const { sqlite, dependencies, targets, messages } = database();
    try {
      const grant = ['grant', " O'Connor@Example.com ", '--local'];
      await runStatsAccess(grant, dependencies);
      await runStatsAccess(grant, { ...dependencies, now: () => 987_654 });
      expect(sqlite.prepare('SELECT * FROM account_roles').all()).toEqual([
        { user_id: 'ordinary-account', role: 'metrics_viewer', granted_at: 123_456 },
      ]);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get()?.count).toBe(1);

      await runStatsAccess(['revoke', "o'connor@example.com", '--local'], dependencies);
      await runStatsAccess(['revoke', "o'connor@example.com", '--local'], dependencies);
      expect(sqlite.prepare('SELECT * FROM account_roles').all()).toEqual([]);
      expect(targets).toEqual(Array(8).fill('--local'));
      expect(messages.at(-1)).toContain('(local development)');
    } finally {
      sqlite.close();
    }
  });

  it.each(['grant', 'revoke'])(
    'does not create or invite a missing account during %s',
    async (operation) => {
      const { sqlite, dependencies, targets } = database();
      try {
        await expect(
          runStatsAccess([operation, 'missing@example.com', '--remote'], dependencies),
        ).rejects.toThrow('No existing verified account');
        expect(targets).toEqual(['--remote']);
        expect(sqlite.prepare('SELECT * FROM account_roles').all()).toEqual([]);
        expect(sqlite.prepare('SELECT COUNT(*) AS count FROM users').get()?.count).toBe(1);
      } finally {
        sqlite.close();
      }
    },
  );

  it('does not log a successful grant after a database failure', async () => {
    let logged = false;
    await expect(
      runStatsAccess(['grant', 'learner@example.com', '--local'], {
        execute: async (sql) => {
          if (sql.startsWith('SELECT')) return [{ id: 'account' }];
          throw new Error('Database unavailable');
        },
        log: () => {
          logged = true;
        },
      }),
    ).rejects.toThrow('Database unavailable');
    expect(logged).toBe(false);
  });
});
