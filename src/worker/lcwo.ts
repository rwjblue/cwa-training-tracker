import {
  mergeLcwoIdentity,
  mergeLcwoRuns,
  validateLcwoBackup,
  type LcwoData,
  type LcwoRun,
} from '../shared/lcwo';
import { requireAuth } from './auth';
import {
  accountSnapshotStatements,
  mutateAccount,
  requireAccountRevision,
  snapshotFromResults,
} from './account-sync';
import { HttpError, json, readJson } from './http';
import { rateLimit } from './security';
import { fetchLcwoExports, LcwoTransportError } from './lcwo-transport';

export function lcwoReadStatements(env: Env, accountId: string) {
  return [
    env.DB.prepare('SELECT link_json FROM lcwo_links WHERE user_id = ?').bind(accountId),
    env.DB.prepare('SELECT run_json FROM lcwo_results WHERE user_id = ? ORDER BY id').bind(
      accountId,
    ),
  ];
}
export function lcwoFromResults(results: D1Result[]): LcwoData | null {
  const row = results[0].results[0] as { link_json: string } | undefined;
  if (!row) return null;
  const link = JSON.parse(row.link_json);
  const portable = validateLcwoBackup({
    ...link,
    connected: false,
    runs: results[1].results.map((row) => JSON.parse((row as { run_json: string }).run_json)),
  });
  if (typeof link.connected !== 'boolean') throw new Error('Invalid retained LCWO connection.');
  return { ...portable, connected: link.connected };
}
export async function readLcwo(env: Env, accountId: string) {
  return lcwoFromResults(await env.DB.batch(lcwoReadStatements(env, accountId)));
}
export function clearLcwoStatements(env: Env, accountId: string) {
  return ['lcwo_results', 'lcwo_links'].map((table) =>
    env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(accountId),
  );
}
export function lcwoWriteStatements(
  env: Env,
  accountId: string,
  data: LcwoData,
  additions: readonly LcwoRun[],
) {
  const { runs: _runs, ...link } = data;
  const statements = [
    env.DB.prepare(
      'INSERT INTO lcwo_links (user_id, link_json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET link_json=excluded.link_json',
    ).bind(accountId, JSON.stringify(link)),
  ];
  let chunk: LcwoRun[] = [],
    bytes = 0;
  const flush = () => {
    if (!chunk.length) return;
    statements.push(
      env.DB.prepare(
        `INSERT INTO lcwo_results (user_id,id,run_json)
      SELECT ?, json_extract(value,'$.id'), value FROM json_each(?) WHERE true
      ON CONFLICT(user_id,id) DO NOTHING`,
      ).bind(accountId, JSON.stringify(chunk)),
    );
    chunk = [];
    bytes = 0;
  };
  for (const run of additions) {
    const size = new TextEncoder().encode(JSON.stringify(run)).length + 1;
    if (bytes + size > 300_000) flush();
    chunk.push(run);
    bytes += size;
  }
  flush();
  return statements;
}
function valid<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid LCWO result.');
  }
}
export async function getLcwo(request: Request, env: Env) {
  const auth = await requireAuth(request, env);
  const results = await env.DB.batch([
    ...accountSnapshotStatements(env, auth.user.id),
    ...lcwoReadStatements(env, auth.user.id),
  ]);
  return json({
    state: snapshotFromResults(auth.user.id, results.slice(0, 2)),
    data: lcwoFromResults(results.slice(2)),
  });
}
/** The captured account revision fences all upstream work from reset/disconnect. */
export async function changeLcwo(request: Request, env: Env) {
  const auth = await requireAuth(request, env);
  const state = await requireAccountRevision(request, env, auth.user.id);
  const body = await readJson(request, 5000);
  const action = body.action;
  const keys =
    action === 'link' || action === 'refresh'
      ? ['action', 'consent', 'username', 'password']
      : action === 'estimate'
        ? ['action', 'seconds']
        : ['action'];
  if (
    Object.keys(body).some((key) => !keys.includes(key)) ||
    !['link', 'refresh', 'disconnect', 'estimate'].includes(String(action))
  )
    throw new HttpError(400, 'Choose a supported LCWO operation.');
  const before = await readLcwo(env, auth.user.id);
  let data: LcwoData;
  let additions: LcwoRun[] = [];
  if (action === 'disconnect' || action === 'estimate') {
    if (!before) throw new HttpError(409, 'Link an LCWO account before changing its preferences.');
    if (
      action === 'estimate' &&
      (typeof body.seconds !== 'number' ||
        !Number.isInteger(body.seconds) ||
        body.seconds < 0 ||
        body.seconds > 300)
    )
      throw new HttpError(400, 'Choose a whole group estimate from 0 to 300 seconds.');
    data = {
      ...before,
      ...(action === 'disconnect'
        ? { connected: false }
        : { estimateSeconds: body.seconds as number }),
    };
  } else {
    if (body.consent !== true)
      throw new HttpError(400, 'Review and consent to this request-only LCWO sign-in.');
    if (action === 'refresh' && !before?.connected)
      throw new HttpError(
        409,
        'This LCWO link is disconnected. Review consent and link again to refresh.',
      );
    await rateLimit(env, `lcwo:${auth.user.id}`, 10, 600);
    let fetched;
    try {
      fetched = await fetchLcwoExports(body, { signal: request.signal });
    } catch (error) {
      if (error instanceof LcwoTransportError)
        throw new HttpError(error.code === 'credentials' ? 400 : 502, error.message, {
          code: `lcwo_${error.code}`,
        });
      throw error;
    }
    const identity = valid(() => mergeLcwoIdentity(before?.identity, fetched.identity));
    const runs = valid(() => mergeLcwoRuns(before?.runs ?? [], fetched.runs));
    const known = new Set(before?.runs.map((run) => run.id));
    additions = runs.filter((run) => !known.has(run.id));
    data = {
      version: 1,
      identity,
      connected: true,
      estimateSeconds: before?.estimateSeconds ?? 0,
      syncedAt: new Date().toISOString(),
      skippedMixed: fetched.skippedMixed,
      runs,
    };
    if (request.signal.aborted)
      throw new HttpError(409, 'Refresh was interrupted. Check retained results before retrying.');
  }
  const applied = await mutateAccount(
    env,
    state,
    lcwoWriteStatements(env, auth.user.id, data, additions),
  );
  return json({ state: applied.state, data, imported: additions.length });
}
