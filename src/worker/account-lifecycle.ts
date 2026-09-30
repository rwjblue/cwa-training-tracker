import {
  hashLifecyclePayload,
  validateLifecycleIdentity,
  type LifecycleApplied,
  type LifecycleIdentity,
  type LifecycleKind,
  type LifecycleResult,
} from '../shared/account-lifecycle';
import type { AccountSnapshot } from '../shared/account-sync';
import { requireAuth } from './auth';
import {
  accountSnapshotStatements,
  assertAccountGeneration,
  conditionalAccountWrite,
  getAccountSnapshot,
  snapshotFromResults,
} from './account-sync';
import { HttpError, json, readJson } from './http';
import { rateLimit } from './security';

type Receipt = {
  lifecycle_id: string;
  kind: LifecycleKind;
  payload_hash: string;
  base_revision: number;
  base_history_revision: number;
  generation: number;
  outcome: 'pending' | 'applied' | 'canceled';
  result_json: string;
};

function identity(value: unknown, accountId: string): LifecycleIdentity {
  let operation: LifecycleIdentity;
  try {
    operation = validateLifecycleIdentity(value);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid account lifecycle.');
  }
  if (operation.accountId !== accountId)
    throw new HttpError(409, 'This lifecycle belongs to a different account.');
  return operation;
}

function receiptStatement(env: Env, operation: LifecycleIdentity): D1PreparedStatement {
  return env.DB.prepare(
    'SELECT * FROM account_lifecycle_receipts WHERE user_id = ? AND lifecycle_id = ?',
  ).bind(operation.accountId, operation.id);
}

/** Move one immutable canceled tombstone into ordinary quota when it fits.
 * One row is enough to free admission; its SQL quota trigger checks the actual
 * storage total, and the receipt's identity/outcome remain unchanged. */
function promoteCanceledControl(env: Env, accountId: string): D1PreparedStatement {
  return env.DB.prepare(
    `UPDATE account_lifecycle_receipts SET control_budget = 0
    WHERE user_id = ? AND lifecycle_id = (
      SELECT lifecycle_id FROM account_lifecycle_receipts
      WHERE user_id = ? AND outcome = 'canceled' AND control_budget = 1
        AND (SELECT storage_bytes - lifecycle_control_bytes FROM users WHERE id = ?)
          + length(CAST(lifecycle_id AS BLOB)) + length(CAST(kind AS BLOB))
          + length(CAST(payload_hash AS BLOB)) + length(CAST(outcome AS BLOB))
          + length(CAST(result_json AS BLOB)) + 72 <= 6291456
      ORDER BY created_at, lifecycle_id LIMIT 1
    )`,
  ).bind(accountId, accountId, accountId);
}

function resultFromReceipt(
  operation: LifecycleIdentity,
  receipt: Receipt | undefined,
  state: AccountSnapshot,
): LifecycleResult {
  if (!receipt) return { identity: operation, outcome: 'unknown', reserved: false, state };
  if (
    receipt.kind !== operation.kind ||
    receipt.payload_hash !== operation.payloadHash ||
    receipt.base_revision !== operation.baseRevision ||
    receipt.base_history_revision !== operation.baseHistoryRevision ||
    receipt.generation !== operation.generation
  )
    throw new HttpError(409, 'A different lifecycle already uses this lifecycle ID.', { state });
  if (receipt.outcome === 'pending')
    return { identity: operation, outcome: 'unknown', reserved: true, state };
  return {
    identity: operation,
    outcome: receipt.outcome,
    state,
    ...(receipt.outcome === 'applied'
      ? { applied: JSON.parse(receipt.result_json) as LifecycleApplied }
      : {}),
  };
}

export async function lifecycleOutcome(
  env: Env,
  operation: LifecycleIdentity,
): Promise<LifecycleResult> {
  const results = await env.DB.batch([
    receiptStatement(env, operation),
    ...accountSnapshotStatements(env, operation.accountId),
  ]);
  return resultFromReceipt(
    operation,
    results[0].results[0] as Receipt | undefined,
    snapshotFromResults(operation.accountId, results.slice(1)),
  );
}

export async function validateLifecycleRequest(
  env: Env,
  accountId: string,
  value: unknown,
  kind: LifecycleKind,
  payload: unknown,
): Promise<{ identity: LifecycleIdentity; prior: LifecycleResult }> {
  const operation = identity(value, accountId);
  if (
    operation.kind !== kind ||
    operation.payloadHash !== (await hashLifecyclePayload(kind, payload))
  )
    throw new HttpError(409, 'The lifecycle payload differs from the reviewed request.');
  return { identity: operation, prior: await lifecycleOutcome(env, operation) };
}

export async function applyLifecycle(
  env: Env,
  state: AccountSnapshot,
  operation: LifecycleIdentity,
  statements: D1PreparedStatement[],
  counts: Omit<LifecycleApplied, 'revision' | 'generation'> = {},
): Promise<LifecycleResult> {
  const prior = await lifecycleOutcome(env, operation);
  if (prior.outcome !== 'unknown') return prior;
  if (!prior.reserved)
    throw new HttpError(
      428,
      'Reserve safe cancellation before sending a reset or replacement request.',
      { code: 'lifecycle_not_prepared', reserved: false, state: prior.state },
    );
  assertAccountGeneration(state, operation.generation);
  if (
    state.revision !== operation.baseRevision ||
    state.historyRevision !== operation.baseHistoryRevision
  )
    throw new HttpError(
      409,
      'Your account changed. Review the newer state before resetting or replacing it.',
      { state },
    );
  const applied: LifecycleApplied = {
    revision: state.revision + 1,
    generation: state.generation + 1,
    ...counts,
  };
  try {
    const results = await conditionalAccountWrite(env, state, [
      env.DB.prepare(
        'INSERT INTO account_lifecycle_guards (user_id,lifecycle_id) VALUES (?,?)',
      ).bind(state.accountId, operation.id),
      ...statements,
      env.DB.prepare('DELETE FROM retired_plan_tasks WHERE user_id = ?').bind(state.accountId),
      env.DB.prepare(
        'UPDATE users SET account_revision = account_revision + 1, dataset_generation = dataset_generation + 1 WHERE id = ?',
      ).bind(state.accountId),
      env.DB.prepare(
        `UPDATE account_lifecycle_receipts SET outcome = 'applied', result_json = ?, control_budget = 0
        WHERE user_id = ? AND lifecycle_id = ? AND outcome = 'pending'`,
      ).bind(JSON.stringify(applied), state.accountId, operation.id),
      env.DB.prepare('DELETE FROM account_lifecycle_guards WHERE user_id = ?').bind(
        state.accountId,
      ),
      ...accountSnapshotStatements(env, state.accountId),
    ]);
    return {
      identity: operation,
      outcome: 'applied',
      applied,
      state: snapshotFromResults(state.accountId, results.slice(-2)),
    };
  } catch (error) {
    // The same unique identity resolves both exact concurrent retries and a
    // cancellation arriving before this guarded transaction executes.
    const outcome = await lifecycleOutcome(env, operation);
    if (outcome.outcome !== 'unknown') return outcome;
    if (
      error instanceof Error &&
      (error.message.includes('account_revision_conflict') ||
        error.message.includes('account_history_conflict'))
    ) {
      const current = await getAccountSnapshot(env, state.accountId);
      assertAccountGeneration(current, operation.generation);
      throw new HttpError(
        409,
        'Your account changed. Review the newer state before resetting or replacing it.',
        { state: current },
      );
    }
    throw error;
  }
}

export async function prepareLifecycle(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const operation = identity(await readJson(request, 2000), auth.user.id);
  const prior = await lifecycleOutcome(env, operation);
  if (prior.outcome !== 'unknown') return json(prior);
  assertAccountGeneration(prior.state, operation.generation);
  if (
    prior.state.revision !== operation.baseRevision ||
    prior.state.historyRevision !== operation.baseHistoryRevision
  )
    throw new HttpError(
      409,
      'Your account changed. Review it before preparing reset or replacement.',
      { state: prior.state },
    );
  if (prior.reserved) return json(prior);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  try {
    const results = await conditionalAccountWrite(env, prior.state, [
      promoteCanceledControl(env, operation.accountId),
      env.DB.prepare(
        `INSERT INTO account_lifecycle_receipts
        (user_id,lifecycle_id,kind,payload_hash,base_revision,base_history_revision,generation,outcome,result_json,created_at)
        VALUES (?,?,?,?,?,?,?,'pending','{}',?) ON CONFLICT(user_id,lifecycle_id) DO NOTHING`,
      ).bind(
        operation.accountId,
        operation.id,
        operation.kind,
        operation.payloadHash,
        operation.baseRevision,
        operation.baseHistoryRevision,
        operation.generation,
        Date.now(),
      ),
      receiptStatement(env, operation),
      ...accountSnapshotStatements(env, operation.accountId),
    ]);
    return json(
      resultFromReceipt(
        operation,
        results[2].results[0] as Receipt,
        snapshotFromResults(operation.accountId, results.slice(3)),
      ),
    );
  } catch (error) {
    const outcome = await lifecycleOutcome(env, operation);
    if (outcome.outcome !== 'unknown') return json(outcome);
    if (error instanceof Error && error.message.includes('lifecycle_capacity'))
      throw new HttpError(
        409,
        'Safe cancellation capacity is full. No reset or replacement request was admitted.',
        { code: 'lifecycle_capacity', reserved: false, state: outcome.state },
      );
    if (
      error instanceof Error &&
      (error.message.includes('account_revision_conflict') ||
        error.message.includes('account_history_conflict'))
    ) {
      assertAccountGeneration(outcome.state, operation.generation);
      throw new HttpError(
        409,
        'Your account changed. Review it before preparing reset or replacement.',
        { state: outcome.state },
      );
    }
    if (outcome.reserved) return json(outcome);
    throw error;
  }
}

export async function getLifecycleOutcome(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const operation = identity(await readJson(request, 2000), auth.user.id);
  return json(await lifecycleOutcome(env, operation));
}

export async function cancelLifecycle(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const operation = identity(await readJson(request, 2000), auth.user.id);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO account_lifecycle_receipts
      (user_id,lifecycle_id,kind,payload_hash,base_revision,base_history_revision,generation,outcome,result_json,created_at)
      VALUES (?,?,?,?,?,?,?,'canceled','{}',?) ON CONFLICT(user_id,lifecycle_id) DO NOTHING`,
      ).bind(
        operation.accountId,
        operation.id,
        operation.kind,
        operation.payloadHash,
        operation.baseRevision,
        operation.baseHistoryRevision,
        operation.generation,
        Date.now(),
      ),
      env.DB.prepare(
        `UPDATE account_lifecycle_receipts SET outcome = 'canceled'
      WHERE user_id = ? AND lifecycle_id = ? AND kind = ? AND payload_hash = ?
        AND base_revision = ? AND base_history_revision = ? AND generation = ? AND outcome = 'pending'`,
      ).bind(
        operation.accountId,
        operation.id,
        operation.kind,
        operation.payloadHash,
        operation.baseRevision,
        operation.baseHistoryRevision,
        operation.generation,
      ),
      promoteCanceledControl(env, operation.accountId),
      receiptStatement(env, operation),
      ...accountSnapshotStatements(env, operation.accountId),
    ]);
  } catch (error) {
    const outcome = await lifecycleOutcome(env, operation);
    if (outcome.outcome !== 'unknown' || outcome.reserved) return json(outcome);
    if (error instanceof Error && error.message.includes('lifecycle_capacity'))
      throw new HttpError(
        409,
        'No destructive request was admitted, and safe cancellation capacity is full.',
        { code: 'lifecycle_capacity', reserved: false, state: outcome.state },
      );
    throw error;
  }
  return json(
    resultFromReceipt(
      operation,
      results[3].results[0] as Receipt,
      snapshotFromResults(operation.accountId, results.slice(4)),
    ),
  );
}
