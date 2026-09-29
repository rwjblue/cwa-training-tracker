import { spawn, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { parse } from 'jsonc-parser';

// Use a separate config and state directory so tests cannot read or mutate
// the developer's local database, credentials, or any remote resources.
const root = process.cwd();
mkdirSync(join(root, '.tmp'), { recursive: true });
const temporary = mkdtempSync(join(root, '.tmp', 'e2e-'));
const configErrors = [];
const configuration = parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'), configErrors, {
  allowTrailingComma: true,
});
if (configErrors.length) throw new Error('The Worker configuration contains invalid JSONC.');
configuration.name = 'cwa-e2e';
configuration.main = join(root, 'src/worker/index.ts');
configuration.assets.directory = join(root, 'dist');
configuration.routes = [];
configuration.d1_databases = [
  {
    binding: 'DB',
    database_name: 'cwa-e2e',
    database_id: 'local-e2e',
    migrations_dir: join(root, 'migrations'),
  },
];
configuration.send_email = [{ name: 'EMAIL' }];
configuration.vars = {
  APP_ORIGIN: 'http://localhost:8791',
  EMAIL_FROM: 'signin@cwa.n1rwj.com',
  ENVIRONMENT: 'development',
};
delete configuration.triggers;
const configPath = join(temporary, 'wrangler.json');
writeFileSync(configPath, JSON.stringify(configuration));
writeFileSync(join(temporary, '.dev.vars'), `AUTH_SECRET=${randomBytes(32).toString('hex')}\n`, {
  mode: 0o600,
});
const logPath = join(root, '.tmp/e2e-server.log');
writeFileSync(logPath, '');
const wrangler = resolve(root, 'node_modules/.bin/wrangler');
const common = ['--config', configPath];
const state = join(temporary, 'state');
const migration = spawnSync(
  wrangler,
  ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state, ...common],
  { stdio: 'inherit' },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const child = spawn(
  wrangler,
  ['dev', '--local', '--ip', '127.0.0.1', '--port', '8791', '--persist-to', state, ...common],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    appendFileSync(logPath, chunk);
    process.stdout.write(chunk);
  });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  rmSync(temporary, { recursive: true, force: true });
  process.exit(code ?? 0);
});
