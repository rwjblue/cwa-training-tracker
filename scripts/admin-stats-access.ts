#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

type AccessOperation = 'grant' | 'revoke';
type DatabaseTarget = '--local' | '--remote';
type DatabaseOptions = { config?: string; persistTo?: string };
type AccessOptions = {
  operation: AccessOperation;
  email: string;
  target: DatabaseTarget;
} & DatabaseOptions;
type AccessDependencies = {
  execute: (
    sql: string,
    target: DatabaseTarget,
    options: DatabaseOptions,
  ) => Promise<Record<string, unknown>[]>;
  now: () => number;
  log: (message: string) => void;
};

const role = 'metrics_viewer';
const usage =
  'Usage: node scripts/admin-stats-access.ts <grant|revoke> <email> <--local|--remote> [--config <path>] [--persist-to <local-state-path>]';

export function parseAccessOptions(args: string[]): AccessOptions {
  const [operation, ...remaining] = args;
  if (operation !== 'grant' && operation !== 'revoke') throw new Error(usage);
  const targets: DatabaseTarget[] = [];
  const emails: string[] = [];
  const options: DatabaseOptions = {};
  for (let index = 0; index < remaining.length; index += 1) {
    const arg = remaining[index];
    if (arg === '--local' || arg === '--remote') {
      targets.push(arg);
    } else if (arg === '--config' || arg === '--persist-to') {
      const key = arg === '--config' ? 'config' : 'persistTo';
      const value = remaining[index + 1];
      if (options[key] || !value || value.startsWith('--') || value.includes('\0'))
        throw new Error(usage);
      options[key] = value;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(usage);
    } else {
      emails.push(arg);
    }
  }
  if (targets.length !== 1 || emails.length !== 1) throw new Error(usage);
  if (options.persistTo && targets[0] !== '--local')
    throw new Error('--persist-to is only supported with --local.');

  const email = emails[0].trim().toLowerCase();
  if (
    email.length > 254 ||
    /[\u0000-\u001f\u007f]/.test(email) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
  )
    throw new Error('Enter a valid account sign-in email address.');
  return { operation, email, target: targets[0], ...options };
}

// Wrangler's operator CLI accepts SQL text, not parameter bindings. Escape every
// literal here; the Worker API continues to use bound parameters throughout.
export function sqlLiteral(value: string): string {
  if (value.includes('\0')) throw new Error('SQL literals cannot contain null bytes.');
  return `'${value.replaceAll("'", "''")}'`;
}

export async function executeD1(
  sql: string,
  target: DatabaseTarget,
  options: DatabaseOptions = {},
): Promise<Record<string, unknown>[]> {
  const wrangler = fileURLToPath(
    new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      wrangler,
      'd1',
      'execute',
      'DB',
      target,
      ...(options.config ? ['--config', options.config] : []),
      ...(options.persistTo ? ['--persist-to', options.persistTo] : []),
      '--command',
      sql,
      '--json',
    ],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      'Wrangler D1 command failed. Check your Cloudflare login and apply migrations for the selected database.',
    );
  let response: unknown;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw new Error('Wrangler returned invalid D1 JSON. No access change was confirmed.');
  }
  if (
    !Array.isArray(response) ||
    response.length !== 1 ||
    !response[0] ||
    response[0].success !== true ||
    !Array.isArray(response[0].results) ||
    response[0].results.some(
      (row: unknown) => !row || typeof row !== 'object' || Array.isArray(row),
    )
  )
    throw new Error('Wrangler returned an unexpected D1 response. No access change was confirmed.');
  return response[0].results;
}

export async function runStatsAccess(
  args: string[],
  overrides: Partial<AccessDependencies> = {},
): Promise<void> {
  const { operation, email, target, ...options } = parseAccessOptions(args);
  const { execute, now, log }: AccessDependencies = {
    execute: executeD1,
    now: Date.now,
    log: console.log,
    ...overrides,
  };

  // Accounts are created only after email verification. This lookup never
  // creates an account, invites a recipient, or trusts profile/import data.
  const users = await execute(
    `SELECT id FROM users WHERE email = ${sqlLiteral(email)}`,
    target,
    options,
  );
  if (users.length === 0)
    throw new Error(
      'No existing verified account has that sign-in email. Ask them to sign in first.',
    );
  if (users.length !== 1 || typeof users[0].id !== 'string' || !users[0].id)
    throw new Error('The account lookup returned an unexpected result. No access was changed.');

  const accountId = sqlLiteral(users[0].id);
  if (operation === 'grant') {
    const grantedAt = now();
    if (!Number.isSafeInteger(grantedAt) || grantedAt < 0) throw new Error('Invalid grant time.');
    await execute(
      `INSERT INTO account_roles (user_id, role, granted_at)
       VALUES (${accountId}, ${sqlLiteral(role)}, ${grantedAt})
       ON CONFLICT (user_id, role) DO NOTHING`,
      target,
      options,
    );
  } else {
    await execute(
      `DELETE FROM account_roles WHERE user_id = ${accountId} AND role = ${sqlLiteral(role)}`,
      target,
      options,
    );
  }
  const label = target === '--local' ? 'local development' : 'production';
  log(`${role} access ${operation === 'grant' ? 'granted' : 'revoked'} for ${email} (${label}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    console.log(
      'Mise stats:grant and stats:revoke default to --remote; pass --local for development.',
    );
  } else {
    runStatsAccess(args).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'Access management failed.');
      process.exitCode = 1;
    });
  }
}
