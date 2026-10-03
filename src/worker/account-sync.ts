import {
  requireReportEvidence,
  requireCurrentReportProvenance,
  reportInsertStatement,
} from './reports';
import { validateReportDocuments } from '../shared/report-document';
import {
  applyAccountChange,
  validateAccountOperation,
  type AccountSnapshot,
} from '../shared/account-sync';
import { mergeCurriculumPlan } from '../shared/curriculum';
import type { PlannedTask } from '../shared/plan';
import { DEFAULT_PROFILE } from '../shared/training';
import { requireAuth } from './auth';
import { HttpError, json, readJson } from './http';
import { hash, rateLimit } from './security';
import { settingsStatement } from './settings';

type AccountRow = {
  profile_json: string;
  class_schedule_json: string | null;
  report_definition_json: string | null;
  account_revision: number;
  dataset_generation: number;
  history_revision: number;
};

export function accountSnapshotStatements(env: Env, accountId: string): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      'SELECT profile_json, class_schedule_json, report_definition_json, account_revision, dataset_generation, history_revision FROM users WHERE id = ?',
    ).bind(accountId),
    // Keep the coherent two-statement snapshot boundary used by lifecycle/export
    // batches. Return bounded individual rows: an aggregate JSON value could exceed
    // D1's 2 MB per-value limit before the ordinary 6 MiB account quota.
    env.DB.prepare(
      `SELECT 'task' AS record_kind, task_json, NULL AS report_json, id FROM training_plan WHERE user_id = ?
      UNION ALL SELECT 'report' AS record_kind, NULL AS task_json, report_json, id FROM advisor_reports WHERE user_id = ?
      ORDER BY record_kind, id`,
    ).bind(accountId, accountId),
  ];
}

export function snapshotFromResults(accountId: string, results: D1Result[]): AccountSnapshot {
  const row = results[0].results[0] as AccountRow;
  const settings = {
    ...DEFAULT_PROFILE,
    ...JSON.parse(row.profile_json),
    ...(row.class_schedule_json ? { classSchedule: JSON.parse(row.class_schedule_json) } : {}),
    ...(row.report_definition_json
      ? { reportDefinition: JSON.parse(row.report_definition_json) }
      : {}),
  };
  return {
    accountId,
    revision: row.account_revision,
    generation: row.dataset_generation,
    historyRevision: row.history_revision,
    reports: validateReportDocuments(
      results[1].results
        .filter((row) => (row as { record_kind: string }).record_kind === 'report')
        .map((row) => JSON.parse((row as { report_json: string }).report_json)),
    ),
    settings,
    plan: mergeCurriculumPlan(
      settings,
      results[1].results
        .filter((row) => (row as { record_kind: string }).record_kind === 'task')
        .map((row) => JSON.parse((row as { task_json: string }).task_json) as PlannedTask),
    ),
  };
}

export async function getAccountSnapshot(env: Env, accountId: string): Promise<AccountSnapshot> {
  return snapshotFromResults(
    accountId,
    await env.DB.batch(accountSnapshotStatements(env, accountId)),
  );
}

export async function getAccountState(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  return json({ state: await getAccountSnapshot(env, auth.user.id) });
}

export function retiredTaskIds(
  before: AccountSnapshot,
  nextPlan: readonly PlannedTask[],
): string[] {
  const available = new Set(nextPlan.map((task) => task.id));
  return before.plan.filter((task) => !available.has(task.id)).map((task) => task.id);
}

function retiredTaskStatements(
  env: Env,
  state: AccountSnapshot,
  ids: readonly string[],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  let chunk: string[] = [];
  let bytes = 0;
  const flush = () => {
    if (!chunk.length) return;
    statements.push(
      env.DB.prepare(
        `INSERT INTO retired_plan_tasks (user_id, task_id, generation, created_at)
      SELECT ?, value, ?, ? FROM json_each(?) WHERE true
      ON CONFLICT(user_id, task_id, generation) DO NOTHING`,
      ).bind(state.accountId, state.generation, Date.now(), JSON.stringify(chunk)),
    );
    chunk = [];
    bytes = 0;
  };
  // Only a captured, revision-guarded owned plan can establish retired ownership.
  const owned = new Set(state.plan.map((task) => task.id));
  for (const id of new Set(ids)) {
    if (!owned.has(id))
      throw new Error('Retired exercise ownership must come from the account plan.');
    if (bytes + id.length + 3 > 300_000) flush();
    chunk.push(id);
    bytes += id.length + 3;
  }
  flush();
  return statements;
}

/** Direct legacy editors must explicitly name the snapshot they are changing. */
export async function requireAccountRevision(
  request: Request,
  env: Env,
  accountId: string,
): Promise<AccountSnapshot> {
  const state = await getAccountSnapshot(env, accountId);
  requireRequestGeneration(request, state);
  const value = request.headers.get('If-Match');
  if (
    !value ||
    !/^(?:"(?:0|[1-9]\d*)"|(?:0|[1-9]\d*))$/.test(value) ||
    !Number.isSafeInteger(Number(value.replaceAll('"', '')))
  )
    throw new HttpError(
      428,
      'Load the current account state and send its revision with If-Match.',
      { state },
    );
  if (Number(value.replaceAll('"', '')) !== state.revision)
    throw new HttpError(
      409,
      'Your account changed in another tab. Review the newer state before applying this change.',
      { state },
    );
  return state;
}

export function assertAccountGeneration(state: AccountSnapshot, generation: number): void {
  if (state.generation !== generation)
    throw new HttpError(
      409,
      'This work belongs to history that has been reset or replaced. Keep a recovery export before discarding it.',
      {
        state,
        retired: true,
        code: 'dataset_retired',
      },
    );
}

/** Unknown legacy origins cannot acquire the current dataset on an automatic retry. */
export function requireRequestGeneration(request: Request, state: AccountSnapshot): number {
  if (!request.headers.has('X-CWA-Account'))
    throw new HttpError(428, 'Send the account that owns this work with X-CWA-Account.', { state });
  const value = request.headers.get('X-CWA-Generation');
  if (!value || !/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new HttpError(428, 'Send the original dataset generation with X-CWA-Generation.', {
      state,
    });
  const generation = Number(value);
  assertAccountGeneration(state, generation);
  return generation;
}

export function isAccountRevisionConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('account_revision_conflict');
}

/** Guard private writes against a captured snapshot without changing its revision. */
export async function conditionalAccountWrite(
  env: Env,
  state: AccountSnapshot,
  statements: D1PreparedStatement[],
  expectedHistoryRevision?: number,
): Promise<D1Result[]> {
  const results = await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO account_revision_guards (user_id, expected_revision, expected_generation, expected_history_revision) VALUES (?, ?, ?, ?)',
    ).bind(state.accountId, state.revision, state.generation, expectedHistoryRevision ?? null),
    ...statements,
    env.DB.prepare('DELETE FROM account_revision_guards WHERE user_id = ?').bind(state.accountId),
  ]);
  return results.slice(1, -1);
}

export async function mutateAccount(
  env: Env,
  state: AccountSnapshot,
  statements: D1PreparedStatement[],
  receipt?: { id: string; payloadHash: string },
  retiredIds: readonly string[] = [],
  expectedHistoryRevision?: number,
): Promise<{ state: AccountSnapshot; results: D1Result[] }> {
  const batch = [
    ...statements,
    ...retiredTaskStatements(env, state, retiredIds),
    env.DB.prepare('UPDATE users SET account_revision = account_revision + 1 WHERE id = ?').bind(
      state.accountId,
    ),
    ...(receipt
      ? [
          env.DB.prepare(
            `INSERT INTO account_operation_receipts (user_id,operation_id,payload_hash,revision,generation,created_at)
      SELECT id,?,?,account_revision,dataset_generation,? FROM users WHERE id = ?`,
          ).bind(receipt.id, receipt.payloadHash, Date.now(), state.accountId),
        ]
      : []),
    ...accountSnapshotStatements(env, state.accountId),
  ];
  try {
    const results = await conditionalAccountWrite(env, state, batch, expectedHistoryRevision);
    return {
      state: snapshotFromResults(state.accountId, results.slice(-2)),
      results: results.slice(0, statements.length),
    };
  } catch (error) {
    if (isAccountRevisionConflict(error)) {
      const current = await getAccountSnapshot(env, state.accountId);
      assertAccountGeneration(current, state.generation);
      throw new HttpError(
        409,
        'Your account changed in another tab. Review the newer state before applying this change.',
        { state: current },
      );
    }
    throw error;
  }
}

/** Object member order is immaterial; every supplied value is part of identity. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export async function applyAccountOperation(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson(request, 500_000);
  let operation;
  try {
    operation = validateAccountOperation(body);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid account operation.');
  }
  if (operation.accountId !== auth.user.id)
    throw new HttpError(409, 'This operation belongs to a different account.');
  const payloadHash = await hash(canonical(body));
  const acknowledged = async () => {
    const receipt = await env.DB.prepare(
      'SELECT payload_hash, generation FROM account_operation_receipts WHERE user_id = ? AND operation_id = ?',
    )
      .bind(auth.user.id, operation.id)
      .first<{ payload_hash: string; generation: number }>();
    if (!receipt) return null;
    if (receipt.payload_hash !== payloadHash)
      throw new HttpError(409, 'A different operation already uses this operation ID.');
    const state = await getAccountSnapshot(env, auth.user.id);
    assertAccountGeneration(state, receipt.generation);
    return json({ state, operationId: operation.id });
  };
  const prior = await acknowledged();
  if (prior) return prior;
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  const state = await getAccountSnapshot(env, auth.user.id);
  assertAccountGeneration(state, operation.generation);
  if (operation.baseRevision !== state.revision || operation.generation !== state.generation) {
    // The operation can have committed between the receipt read and this snapshot.
    const prior = await acknowledged();
    if (prior) return prior;
    throw new HttpError(
      409,
      'Your account changed in another tab. Review the newer state before applying this change.',
      { state },
    );
  }
  let next;
  try {
    next = applyAccountChange(state, operation.change);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid account change.');
  }
  const statements: D1PreparedStatement[] = [];
  const change = operation.change;
  if (change.type === 'report-delete')
    statements.push(
      env.DB.prepare('DELETE FROM advisor_reports WHERE user_id=? AND id=?').bind(
        auth.user.id,
        change.id,
      ),
    );
  else if (
    change.type === 'report-save' ||
    change.type === 'report-handoff' ||
    change.type === 'report-confirm'
  ) {
    if (
      (change.type === 'report-handoff' || change.type === 'report-confirm') &&
      Date.parse(change.report.updatedAt) > Date.now() + 300_000
    )
      throw new HttpError(
        400,
        'Report capture or confirmation cannot be in the future. Check your device clock.',
      );
    await requireReportEvidence(env, auth.user.id, [change.report]);
    // A reviewed handoff may already have left this device while its durable
    // account queue was offline. Like imported frozen history, it attributes
    // captured private facts; it does not claim the mutable sources still match.
    // Ownership/schema/atomic reference guards still apply to every entity.
    if (change.type === 'report-save')
      await requireCurrentReportProvenance(env, auth.user.id, change.report, state.reports);
    statements.push(reportInsertStatement(env, auth.user.id, change.report));
  } else if (change.type === 'settings')
    statements.push(settingsStatement(env, auth.user.id, next.settings));
  else if (change.type === 'task-delete')
    statements.push(
      env.DB.prepare('DELETE FROM training_plan WHERE user_id = ? AND id = ?').bind(
        auth.user.id,
        change.id,
      ),
    );
  else {
    const selected = new Set(
      change.type === 'task-status'
        ? change.ids
        : [change.type === 'task-create' ? change.task.id : change.id],
    );
    let chunk: PlannedTask[] = [];
    let bytes = 0;
    const flush = () => {
      if (!chunk.length) return;
      statements.push(
        env.DB.prepare(
          `INSERT INTO training_plan (user_id,id,task_json)
          SELECT ?, json_extract(value, '$.id'), value FROM json_each(?) WHERE true
          ON CONFLICT(user_id,id) DO UPDATE SET task_json=excluded.task_json`,
        ).bind(auth.user.id, JSON.stringify(chunk)),
      );
      chunk = [];
      bytes = 0;
    };
    for (const task of next.plan.filter((task) => selected.has(task.id))) {
      const size = new TextEncoder().encode(JSON.stringify(task)).length;
      if (bytes + size > 300_000) flush();
      chunk.push(task);
      bytes += size;
    }
    flush();
  }
  try {
    const applied = await mutateAccount(
      env,
      state,
      statements,
      { id: operation.id, payloadHash },
      retiredTaskIds(state, next.plan),
      (change.type === 'report-save' || change.type === 'report-handoff') &&
        change.report.provenance
        ? state.historyRevision
        : undefined,
    );
    return json({ state: applied.state, operationId: operation.id });
  } catch (error) {
    // A concurrent exact retry may have committed after the initial receipt read.
    if (error instanceof HttpError && error.status === 409) {
      const prior = await acknowledged();
      if (prior) return prior;
    }
    throw error;
  }
}
