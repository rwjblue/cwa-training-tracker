import { materialInsertStatement, mergeInstructorMaterials, requireOwnedOriginalMaterials } from './instructor-materials';
import { orderInstructorMaterials, originalMaterialRecords, requireMaterialReference } from '../shared/instructor-material';
import { orderReportCopies } from '../shared/report-handoff';
import { requireReportEvidence, reportInsertStatement, mergeReportCopies } from './reports';
import {
  clearLcwoStatements,
  lcwoReadStatements,
  lcwoFromResults,
  lcwoWriteStatements,
  readLcwo,
} from './lcwo';
import { mergeLcwoIdentity, mergeLcwoRuns } from '../shared/lcwo';
import { validateAssessedContactCount } from '../shared/practice-assessment';
import {
  DEFAULT_PROFILE,
  convertLegacyExport,
  getPracticePurpose,
  validatePracticeSession,
  validateProfile,
  validateTrainingExport,
  type PracticeSession,
  type TrainingExport,
} from '../shared/training';
import { requireAuth } from './auth';
import { settingsStatement } from './settings';
import { HttpError, isRecord, json, readJson } from './http';
import { hash, rateLimit } from './security';
import { deletePlanStatement, getPlanData, planStatementsForImport } from './plan';
import type { PlannedTask } from '../shared/plan';
import { mergeCurriculumPlan } from '../shared/curriculum';
import { sessionEvidence } from '../shared/practice-evidence';
import {
  conditionalAccountWrite,
  accountSnapshotStatements,
  assertAccountGeneration,
  getAccountSnapshot,
  isAccountRevisionConflict,
  mutateAccount,
  requireAccountRevision,
  requireRequestGeneration,
  retiredTaskIds,
  snapshotFromResults,
} from './account-sync';
import { applyLifecycle, validateLifecycleRequest } from './account-lifecycle';
import type { AccountLifecycleBackup } from '../shared/account-lifecycle';

const MAX_ENTRIES = 20_000;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const MAX_PLACEMENT_ATTEMPTS = 3;

/** JSON key order is not part of a saved record's identity. Arrays remain ordered. */
function equivalentEntry(left: unknown, right: unknown): boolean {
  const pending: [unknown, unknown][] = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (a === b) continue;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      a.forEach((value, index) => pending.push([value, b[index]]));
    } else if (isRecord(a) && isRecord(b)) {
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!Object.hasOwn(b, key)) return false;
        pending.push([a[key], b[key]]);
      }
    } else return false;
  }
  return true;
}

function historicalPlacement(entry: PracticeSession, taskId: string): PracticeSession {
  const metadata = { ...entry.metadata };
  delete metadata.plannedTaskId;
  return { ...entry, metadata, historicalPlannedTaskId: taskId };
}

/** Retry normalization is justified only by this account's already saved provenance. */
function equivalentRetry(
  saved: PracticeSession,
  candidate: PracticeSession,
  omittedCreatedAt: boolean,
): boolean {
  let retried = omittedCreatedAt ? { ...candidate, createdAt: saved.createdAt } : candidate;
  if (
    saved.historicalPlannedTaskId &&
    saved.metadata?.plannedTaskId === undefined &&
    retried.metadata?.plannedTaskId === saved.historicalPlannedTaskId &&
    (retried.historicalPlannedTaskId === undefined ||
      retried.historicalPlannedTaskId === saved.historicalPlannedTaskId)
  )
    retried = historicalPlacement(retried, saved.historicalPlannedTaskId);
  return equivalentEntry(saved, retried);
}

function validated<T>(validate: (value: unknown) => T, value: unknown): T {
  try {
    return validate(value);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid training data.');
  }
}

async function storedEntry(
  env: Env,
  userId: string,
  id: string,
  generation: number,
): Promise<PracticeSession | undefined> {
  const results = await env.DB.batch([
    ...accountSnapshotStatements(env, userId),
    env.DB.prepare('SELECT entry_json FROM practice_entries WHERE user_id = ? AND id = ?').bind(
      userId,
      id,
    ),
  ]);
  assertAccountGeneration(snapshotFromResults(userId, results.slice(0, 2)), generation);
  const row = results[2].results[0] as { entry_json: string } | undefined;
  return row
    ? validated(
        (value) => validatePracticeSession(value, { preserveHistoricalDuration: true }),
        JSON.parse(row.entry_json),
      )
    : undefined;
}

function insertEntryStatement(
  env: Env,
  userId: string,
  entry: PracticeSession,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO practice_entries (user_id, id, date, entry_json)
    SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM practice_entries WHERE user_id = ?) < ?
    ON CONFLICT(user_id, id) DO NOTHING RETURNING id`,
  ).bind(userId, entry.id, entry.date, JSON.stringify(entry), userId, MAX_ENTRIES);
}

/** Re-evaluate only unsaved placement; an earlier durable result keeps its original facts. */
async function saveNewLinkedEntry(
  env: Env,
  userId: string,
  frozen: PracticeSession,
  taskId: string,
  omittedCreatedAt: boolean,
  generation: number,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    if (attempt) {
      const saved = await storedEntry(env, userId, frozen.id, generation);
      if (saved) {
        if (equivalentRetry(saved, frozen, omittedCreatedAt))
          return json({ entry: saved, duplicate: true, accountId: userId, generation });
        throw new HttpError(409, 'A different practice entry already uses this session ID.');
      }
    }
    const state = await getAccountSnapshot(env, userId);
    assertAccountGeneration(state, generation);
    let entry = frozen;
    if (!state.plan.some((task) => task.id === taskId)) {
      const retired = await env.DB.prepare(
        'SELECT 1 AS owned FROM retired_plan_tasks WHERE user_id = ? AND task_id = ? AND generation = ?',
      )
        .bind(userId, taskId, state.generation)
        .first();
      if (!retired) throw new HttpError(400, 'The linked exercise is not in your account’s plan.');
      if (entry.historicalPlannedTaskId !== undefined && entry.historicalPlannedTaskId !== taskId)
        throw new HttpError(
          400,
          'A practice entry can have only one historical exercise placement.',
        );
      entry = historicalPlacement(frozen, taskId);
    }
    try {
      const [inserted] = await conditionalAccountWrite(env, state, [
        insertEntryStatement(env, userId, entry),
      ]);
      if (inserted.results.length) return json({ entry, accountId: userId, generation }, 201);
    } catch (error) {
      if (isAccountRevisionConflict(error)) {
        assertAccountGeneration(await getAccountSnapshot(env, userId), generation);
        continue;
      }
      throw error;
    }
    const saved = await storedEntry(env, userId, frozen.id, generation);
    if (saved && equivalentRetry(saved, frozen, omittedCreatedAt))
      return json({ entry: saved, duplicate: true, accountId: userId, generation });
    throw new HttpError(
      409,
      'This entry already exists, or your log has reached its 20,000-entry limit.',
    );
  }
  throw new HttpError(
    503,
    'Your account changed while this result was uploading. Your result can be retried.',
  );
}

export async function listEntries(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const [authority, entries] = await env.DB.batch([
    env.DB.prepare(
      'SELECT account_revision, dataset_generation, history_revision FROM users WHERE id = ?',
    ).bind(auth.user.id),
    env.DB.prepare(
      'SELECT entry_json FROM practice_entries WHERE user_id = ? ORDER BY date DESC, id DESC',
    ).bind(auth.user.id),
  ]);
  const row = authority.results[0] as {
    account_revision: number;
    dataset_generation: number;
    history_revision: number;
  };
  return json({
    accountId: auth.user.id,
    revision: row.account_revision,
    generation: row.dataset_generation,
    historyRevision: row.history_revision,
    entries: entries.results.map((row) =>
      validatePracticeSession(JSON.parse((row as { entry_json: string }).entry_json), {
        preserveHistoricalDuration: true,
      }),
    ),
  });
}

export async function saveEntry(request: Request, env: Env, id?: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await getAccountSnapshot(env, auth.user.id);
  const generation = requireRequestGeneration(request, state);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  const body = await readJson(request, 250_000);
  const input = isRecord(body.entry) ? body.entry : body;
  let entry = validated(validatePracticeSession, {
    ...input,
    id: id ?? input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  const previous = await storedEntry(env, auth.user.id, entry.id, generation);
  if (id && !previous) throw new HttpError(404, 'This practice entry was not found.');
  if (!id && previous) {
    if (equivalentRetry(previous, entry, input.createdAt === undefined))
      return json({ entry: previous, duplicate: true, accountId: auth.user.id, generation });
    throw new HttpError(409, 'A different practice entry already uses this session ID.');
  }
  validated(() => requireMaterialReference(entry, state.materials ?? []), undefined);
  if (previous && (!equivalentEntry(previous.metadata?.instructorMaterial, entry.metadata?.instructorMaterial) ||
      (previous.metadata?.instructorMaterial && previous.context !== entry.context)))
    throw new HttpError(400, 'The material version and practice/class context actually used cannot be changed.');
  validated(() => validateAssessedContactCount(entry, previous), undefined);
  if (!id && typeof entry.metadata?.plannedTaskId === 'string')
    return saveNewLinkedEntry(
      env,
      auth.user.id,
      entry,
      entry.metadata.plannedTaskId,
      input.createdAt === undefined,
      generation,
    );
  const previousEvidence = sessionEvidence(previous?.metadata);
  const nextEvidence = sessionEvidence(entry.metadata);
  if (
    previous?.metadata?.runnerReviewedAt !== undefined &&
    previous.metadata.runnerReviewedAt !== entry.metadata?.runnerReviewedAt
  )
    throw new HttpError(400, 'The original Runner review timestamp cannot be changed or removed.');
  if (
    previous &&
    (getPracticePurpose(previous) !== getPracticePurpose(entry) ||
      (previous.metadata?.practicePurpose !== undefined &&
        entry.metadata?.practicePurpose === undefined))
  )
    throw new HttpError(400, 'Saved practice purpose cannot be changed or removed.');
  if (
    previous &&
    previous.evidenceMode !== entry.evidenceMode &&
    (previous.evidenceMode === 'historical' || entry.evidenceMode === 'historical')
  )
    throw new HttpError(400, 'Historical evidence accounting cannot be changed or removed.');
  // Notes, placement and declared corrections are editable. Raw source facts
  // remain immutable even if a client removes or replaces the metadata object.
  if (
    previous?.metadata?.copyAttempt !== undefined &&
    !equivalentEntry(previous.metadata.copyAttempt, entry.metadata?.copyAttempt)
  )
    throw new HttpError(
      400,
      'Native Copy measurements cannot be changed or replaced with manual results.',
    );
  if (previousEvidence) {
    const raw = (value: typeof previousEvidence | undefined) => {
      if (value?.type === 'timed') {
        const { correction: _correction, ...measurement } = value;
        return measurement;
      }
      return value;
    };
    if (!equivalentEntry(raw(previousEvidence), raw(nextEvidence)))
      throw new HttpError(
        400,
        'Measured source evidence cannot be changed or removed. Use a declared time correction.',
      );
  }
  if (
    previous?.metadata?.historicalTiming !== undefined &&
    !equivalentEntry(previous.metadata.historicalTiming, entry.metadata?.historicalTiming)
  )
    throw new HttpError(400, 'Historical timing evidence cannot be changed or removed.');
  const taskId = entry.metadata?.plannedTaskId;
  if (
    typeof taskId === 'string' &&
    taskId !== previous?.metadata?.plannedTaskId &&
    !(await getPlanData(env, auth.user.id)).some((task) => task.id === taskId)
  ) {
    const retired = await env.DB.prepare(
      `SELECT 1 AS owned FROM retired_plan_tasks
      JOIN users ON users.id = retired_plan_tasks.user_id
      WHERE user_id = ? AND task_id = ? AND generation = users.dataset_generation`,
    )
      .bind(auth.user.id, taskId)
      .first();
    if (!retired) throw new HttpError(400, 'The linked exercise is not in your account’s plan.');
    if (entry.historicalPlannedTaskId !== undefined && entry.historicalPlannedTaskId !== taskId)
      throw new HttpError(400, 'A practice entry can have only one historical exercise placement.');
    entry = historicalPlacement(entry, taskId);
  }
  if (id) {
    let results;
    try {
      results = await conditionalAccountWrite(env, state, [
        env.DB.prepare(
          'UPDATE practice_entries SET date = ?, entry_json = ? WHERE user_id = ? AND id = ? RETURNING id',
        ).bind(entry.date, JSON.stringify(entry), auth.user.id, id),
      ]);
    } catch (error) {
      if (isAccountRevisionConflict(error)) {
        const current = await getAccountSnapshot(env, auth.user.id);
        assertAccountGeneration(current, generation);
        throw new HttpError(
          409,
          'Your account changed while this entry was editing. Review the current history.',
          { state: current },
        );
      }
      throw error;
    }
    if (!results[0].results.length) throw new HttpError(404, 'This practice entry was not found.');
  } else {
    let writeState = state;
    let inserted = false;
    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      try {
        const [result] = await conditionalAccountWrite(env, writeState, [
          insertEntryStatement(env, auth.user.id, entry),
        ]);
        inserted = !!result.results.length;
        break;
      } catch (error) {
        if (!isAccountRevisionConflict(error)) throw error;
        writeState = await getAccountSnapshot(env, auth.user.id);
        assertAccountGeneration(writeState, generation);
        if (attempt === MAX_PLACEMENT_ATTEMPTS - 1)
          throw new HttpError(
            503,
            'Your account changed while this result was uploading. Your result can be retried.',
          );
      }
    }
    if (!inserted) {
      // The insert resolves races. A retry after a lost response acknowledges only
      // an equivalent record owned by this account; it never overwrites edits.
      const saved = await storedEntry(env, auth.user.id, entry.id, generation);
      if (saved) {
        if (equivalentRetry(saved, entry, input.createdAt === undefined))
          return json({ entry: saved, duplicate: true, accountId: auth.user.id, generation });
      }
      throw new HttpError(
        409,
        'This entry already exists, or your log has reached its 20,000-entry limit.',
      );
    }
  }
  return json({ entry, accountId: auth.user.id, generation }, id ? 200 : 201);
}

export async function deleteEntry(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await getAccountSnapshot(env, auth.user.id);
  const generation = requireRequestGeneration(request, state);
  if (
    state.reports?.some((report) =>
      report.evidence.some((ref) => ref.kind === 'practice' && ref.id === id),
    )
  )
    throw new HttpError(
      409,
      'A saved advisor report references this result. Export your data and remove its saved draft copies before deleting the result.',
    );
  try {
    await conditionalAccountWrite(env, state, [
      env.DB.prepare('DELETE FROM practice_entries WHERE user_id = ? AND id = ?').bind(
        auth.user.id,
        id,
      ),
    ]);
  } catch (error) {
    if (isAccountRevisionConflict(error)) {
      const current = await getAccountSnapshot(env, auth.user.id);
      assertAccountGeneration(current, generation);
      throw new HttpError(
        409,
        'Your account changed while this entry was deleting. Review the current history.',
        { state: current },
      );
    }
    throw error;
  }
  return json({ ok: true, accountId: auth.user.id, generation });
}

export async function getSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await getAccountSnapshot(env, auth.user.id);
  return json({ settings: state.settings, revision: state.revision, generation: state.generation });
}

export async function saveSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await requireAccountRevision(request, env, auth.user.id);
  const body = await readJson(request, 64_000);
  const settings = validated(validateProfile, body.settings ?? body);
  const applied = await mutateAccount(
    env,
    state,
    [settingsStatement(env, auth.user.id, settings)],
    undefined,
    retiredTaskIds(state, mergeCurriculumPlan(settings, state.plan)),
  );
  return json({ settings, revision: applied.state.revision, generation: applied.state.generation });
}

async function readAccountBackup(env: Env, accountId: string): Promise<AccountLifecycleBackup> {
  // D1 batches are transactions, so an export sees one coherent snapshot even
  // when another browser edits a profile or replaces its data concurrently.
  const results = await env.DB.batch([
    ...accountSnapshotStatements(env, accountId),
    env.DB.prepare(
      'SELECT entry_json FROM practice_entries WHERE user_id = ? ORDER BY date DESC, id DESC',
    ).bind(accountId),
    env.DB.prepare(
      `SELECT source_json FROM import_sources WHERE user_id = ? AND source_hash =
      (SELECT source_hash FROM import_sources WHERE user_id = ? ORDER BY created_at DESC LIMIT 1) ORDER BY chunk`,
    ).bind(accountId, accountId),
    ...lcwoReadStatements(env, accountId),
  ]);
  const state = snapshotFromResults(accountId, results.slice(0, 2));
  const [plan, sessions, archive] = results.slice(1) as D1Result<Record<string, string>>[];
  const lcwo = lcwoFromResults(results.slice(4));
  const exported: TrainingExport = {
    format: 'cwa-training-tracker',
    version: 1,
    evidenceVersion: 1,
    reports: state.reports ?? [],
    materials: state.materials ?? [],
    ...(lcwo ? { lcwo: { ...lcwo, connected: false as const } } : {}),
    exportedAt: new Date().toISOString(),
    profile: state.settings,
    sessions: sessions.results.map((row) =>
      validated(
        (value) => validatePracticeSession(value, { preserveHistoricalDuration: true }),
        JSON.parse(row.entry_json),
      ),
    ),
    plan: plan.results
      .filter((row) => row.record_kind === 'task')
      .map((row) => JSON.parse(row.task_json) as PlannedTask),
    ...(archive.results.length
      ? {
          legacy: JSON.parse(
            archive.results.map((row) => row.source_json).join(''),
          ) as TrainingExport['legacy'],
        }
      : {}),
  };
  // Deleted exercises and former course dates are historical provenance, not
  // authority to credit a task absent from this portable account snapshot.
  const availableTasks = new Set(
    mergeCurriculumPlan(exported.profile!, exported.plan ?? []).map((task) => task.id),
  );
  for (const entry of exported.sessions) {
    const taskId = entry.metadata?.plannedTaskId;
    if (typeof taskId === 'string' && !availableTasks.has(taskId)) {
      entry.historicalPlannedTaskId = taskId;
      entry.metadata = { ...entry.metadata };
      delete entry.metadata.plannedTaskId;
    }
  }
  const data = validated(validateTrainingExport, exported);
  return {
    data,
    state: {
      ...state,
      settings: data.profile!,
      plan: mergeCurriculumPlan(data.profile!, data.plan ?? []),
    },
  };
}

export async function exportLifecycleBackup(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  return json(await readAccountBackup(env, auth.user.id));
}

export async function exportData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const { data } = await readAccountBackup(env, auth.user.id);
  return json(data, 200, {
    'Content-Disposition': `attachment; filename="cw-academy-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  });
}

export async function importData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await getAccountSnapshot(env, auth.user.id);
  const input = await readJson(request, MAX_IMPORT_BYTES);
  if (input.mode !== 'merge' && input.mode !== 'replace')
    throw new HttpError(400, 'Choose merge or replace for this import.');
  if (
    Object.keys(input).some(
      (key) => !['mode', 'data', ...(input.mode === 'replace' ? ['lifecycle'] : [])].includes(key),
    )
  )
    throw new HttpError(400, 'Unsupported import request field.');
  const lifecycle =
    input.mode === 'replace'
      ? await validateLifecycleRequest(env, auth.user.id, input.lifecycle, 'replace', {
          mode: 'replace',
          data: input.data,
        })
      : undefined;
  if (lifecycle && lifecycle.prior.outcome !== 'unknown') return json(lifecycle.prior);
  if (!lifecycle) requireRequestGeneration(request, state);
  await rateLimit(env, `import:${auth.user.id}`, 10, 60 * 60);
  const data = validated(
    isRecord(input.data) && input.data.format === 'cwa-training-tracker'
      ? validateTrainingExport
      : convertLegacyExport,
    input.data,
  );
  const uniqueEntries = new Map(data.sessions.map((entry) => [entry.id, entry]));
  const resultingMaterials = mergeInstructorMaterials(input.mode === 'replace' ? [] : (state.materials ?? []), data.materials ?? []);
  const materialInventory = data.legacy
    ? { archiveId: await hash(JSON.stringify(data.legacy)), ...originalMaterialRecords(data.legacy.data) }
    : input.mode === 'replace' ? undefined : state.originalMaterials;
  requireOwnedOriginalMaterials(resultingMaterials, materialInventory);
  for (const entry of data.sessions)
    validated(() => requireMaterialReference(entry, resultingMaterials), undefined);

  const resultingReports = mergeReportCopies(
    input.mode === 'replace' ? [] : (state.reports ?? []),
    data.reports ?? [],
  );
  if (data.legacy) {
    const archiveId = await hash(JSON.stringify(data.legacy));
    if (
      resultingReports.some(
        (report) =>
          report.source?.kind === 'original-device' && report.source.archiveId !== archiveId,
      )
    )
      throw new HttpError(
        400,
        'Saved draft copies reference the current original archive. Export and remove those draft copies before replacing it with a different archive.',
      );
  }
  await requireReportEvidence(env, auth.user.id, data.reports ?? [], {
    practice: data.sessions.map((entry) => entry.id),
    lcwo: data.lcwo?.runs.map((run) => run.id),
    archive: data.legacy,
  });
  if (input.mode === 'replace') {
    // Replacement must carry every reference; old account data will be retired.
    for (const report of data.reports ?? [])
      for (const ref of report.evidence)
        if (
          !(ref.kind === 'practice' ? data.sessions : (data.lcwo?.runs ?? [])).some(
            (item) => item.id === ref.id,
          )
        )
          throw new HttpError(
            400,
            'Replacement reports require their referenced results in the same backup.',
          );
  }
  const ownedPlan = input.mode === 'merge' ? state.plan : [];
  const resultingProfile = { ...(data.profile ?? state.settings) };
  if (
    input.mode === 'merge' &&
    data.profile?.reportDefinition === undefined &&
    state.settings.reportDefinition
  )
    resultingProfile.reportDefinition = state.settings.reportDefinition;
  if (input.mode === 'replace' && data.profile?.reportDefinition === undefined)
    delete resultingProfile.reportDefinition;
  const resultingPlan = mergeCurriculumPlan(resultingProfile, [
    ...ownedPlan,
    ...(data.plan ?? []).filter((task) => !ownedPlan.some((item) => item.id === task.id)),
  ]);
  const taskIds = new Set(resultingPlan.map((task) => task.id));
  const historicalLinkIds = new Set<string>();
  for (const entry of data.sessions) {
    const taskId = entry.metadata?.plannedTaskId;
    if (typeof taskId !== 'string' || taskIds.has(taskId)) continue;
    // Pre-evidence backups retained deleted/former-course IDs verbatim. Preserve
    // their provenance without granting a missing exercise any assignment credit.
    if (data.evidenceVersion === undefined) {
      entry.historicalPlannedTaskId = taskId;
      entry.metadata = { ...entry.metadata };
      delete entry.metadata.plannedTaskId;
      historicalLinkIds.add(entry.id);
    } else
      throw new HttpError(
        400,
        'An imported practice entry links an exercise missing from the resulting account plan. Include that plan in the backup.',
      );
  }
  const current =
    input.mode === 'replace'
      ? []
      : (
          await env.DB.prepare('SELECT id FROM practice_entries WHERE user_id = ?')
            .bind(auth.user.id)
            .all<{ id: string }>()
        ).results;
  const known = new Set(current.map((row) => row.id));
  const additions = [...uniqueEntries.values()].filter((entry) => !known.has(entry.id));
  if (known.size + additions.length > MAX_ENTRIES)
    throw new HttpError(400, 'An account can hold up to 20,000 practice entries.');
  const statements: D1PreparedStatement[] = [];
  const priorLcwo = input.mode === 'merge' ? await readLcwo(env, auth.user.id) : null;
  if (input.mode === 'replace') statements.push(...clearLcwoStatements(env, auth.user.id));
  let lcwoRetained: number | undefined;
  if (data.lcwo) {
    const identity = validated(
      () => mergeLcwoIdentity(priorLcwo?.identity, data.lcwo!.identity),
      undefined,
    );
    const runs = validated(() => mergeLcwoRuns(priorLcwo?.runs ?? [], data.lcwo!.runs), undefined);
    lcwoRetained = runs.length;
    // Portable source history cannot authorize an external login, including merge.
    statements.push(
      ...lcwoWriteStatements(
        env,
        auth.user.id,
        { ...data.lcwo, identity, runs, connected: false },
        runs,
      ),
    );
  }
  if (input.mode === 'replace') {
    statements.push(
      env.DB.prepare('DELETE FROM advisor_reports WHERE user_id = ?').bind(auth.user.id),
    );
    statements.push(
      env.DB.prepare('DELETE FROM practice_entries WHERE user_id = ?').bind(auth.user.id),
      env.DB.prepare('DELETE FROM instructor_materials WHERE user_id = ?').bind(auth.user.id),
    );
    statements.push(
      env.DB.prepare('DELETE FROM import_sources WHERE user_id = ?').bind(auth.user.id),
    );
    statements.push(deletePlanStatement(env, auth.user.id));
  } else if (data.legacy) {
    // Keep the latest complete source so there is no invisible archive history
    // consuming storage that the user's portable export cannot restore.
    statements.push(
      env.DB.prepare('DELETE FROM import_sources WHERE user_id = ?').bind(auth.user.id),
    );
  }
  if (data.profile || input.mode === 'replace') {
    const settings = { ...resultingProfile };
    if (!isRecord(input.data) || input.data.format !== 'cwa-training-tracker') {
      const existing = state.settings;
      settings.callsign ||= existing.callsign;
      settings.displayName ||= existing.displayName;
    }
    statements.push(settingsStatement(env, auth.user.id, settings));
  }
  const incomingMaterialIds = new Set((data.materials ?? []).map((material) => material.id));
  for (const material of orderInstructorMaterials(resultingMaterials))
    if (incomingMaterialIds.has(material.id)) statements.push(materialInsertStatement(env, auth.user.id, material));
  const entryStatementIndexes: number[] = [];
  // Chunk bound JSON rather than issuing a database round trip for every row.
  let chunk: PracticeSession[] = [];
  let chunkBytes = 0;
  const flush = () => {
    if (!chunk.length) return;
    entryStatementIndexes.push(statements.length);
    statements.push(
      env.DB.prepare(
        `INSERT INTO practice_entries (user_id, id, date, entry_json)
      SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.date'), value FROM json_each(?) WHERE true
      ON CONFLICT(user_id, id) DO NOTHING RETURNING id`,
      ).bind(auth.user.id, JSON.stringify(chunk)),
    );
    chunk = [];
    chunkBytes = 0;
  };
  // Let SQLite decide which IDs already exist inside the transaction. A stale
  // preflight read must not skip records deleted by another browser meanwhile.
  for (const entry of uniqueEntries.values()) {
    const bytes = new TextEncoder().encode(JSON.stringify(entry)).length;
    if (chunkBytes + bytes > 400_000) flush();
    chunk.push(entry);
    chunkBytes += bytes;
  }
  flush();
  statements.push(...planStatementsForImport(env, auth.user.id, data.plan, false));
  for (const report of orderReportCopies(data.reports ?? []))
    statements.push(reportInsertStatement(env, auth.user.id, report));
  if (data.legacy) {
    const archive = JSON.stringify(data.legacy);
    const sourceHash = await hash(archive);
    // Keep each SQLite row comfortably under D1's row size bound, including Unicode.
    for (let offset = 0, part = 0; offset < archive.length; part++) {
      let end = Math.min(offset + 100_000, archive.length);
      if (
        end < archive.length &&
        archive.charCodeAt(end - 1) >= 0xd800 &&
        archive.charCodeAt(end - 1) <= 0xdbff
      )
        end--;
      statements.push(
        env.DB.prepare(
          `INSERT INTO import_sources (user_id, source_hash, chunk, source_json, created_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, source_hash, chunk) DO NOTHING`,
        ).bind(auth.user.id, sourceHash, part, archive.slice(offset, end), Date.now()),
      );
      offset = end;
    }
  }
  if (lifecycle) {
    return json(
      await applyLifecycle(env, state, lifecycle.identity, statements, {
        imported: uniqueEntries.size,
        ...(lcwoRetained === undefined ? {} : { lcwoRetained }),
        skipped: data.sessions.length - uniqueEntries.size,
        ...(historicalLinkIds.size ? { historicalLinks: historicalLinkIds.size } : {}),
      }),
    );
  }
  const applied = await mutateAccount(
    env,
    state,
    statements,
    undefined,
    input.mode === 'merge' ? retiredTaskIds(state, resultingPlan) : [],
  );
  const results = applied.results;
  // D1's meta.changes includes quota-accounting trigger writes. RETURNING counts
  // only actual new entries and also handles concurrent merge conflicts.
  const imported = entryStatementIndexes.reduce(
    (sum, index) => sum + results[index].results.length,
    0,
  );
  const historicalLinks = entryStatementIndexes.reduce(
    (sum, index) =>
      sum +
      results[index].results.filter((row) =>
        historicalLinkIds.has(String((row as { id: string }).id)),
      ).length,
    0,
  );
  return json({
    imported,
    ...(lcwoRetained === undefined ? {} : { lcwoRetained }),
    skipped: data.sessions.length - imported,
    ...(historicalLinks ? { historicalLinks } : {}),
  });
}

export async function resetData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await getAccountSnapshot(env, auth.user.id);
  const input = await readJson(request, 2000);
  if (Object.keys(input).some((key) => !['confirmation', 'lifecycle'].includes(key)))
    throw new HttpError(400, 'Unsupported reset request field.');
  if (input.confirmation !== 'RESET')
    throw new HttpError(400, 'Type RESET to confirm clearing your practice data.');
  const lifecycle = await validateLifecycleRequest(env, auth.user.id, input.lifecycle, 'reset', {
    confirmation: 'RESET',
  });
  if (lifecycle.prior.outcome !== 'unknown') return json(lifecycle.prior);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  return json(
    await applyLifecycle(env, state, lifecycle.identity, [
      env.DB.prepare('DELETE FROM advisor_reports WHERE user_id = ?').bind(auth.user.id),
      env.DB.prepare('DELETE FROM practice_entries WHERE user_id = ?').bind(auth.user.id),
      env.DB.prepare('DELETE FROM instructor_materials WHERE user_id = ?').bind(auth.user.id),
      env.DB.prepare('DELETE FROM import_sources WHERE user_id = ?').bind(auth.user.id),
      deletePlanStatement(env, auth.user.id),
      ...clearLcwoStatements(env, auth.user.id),
      settingsStatement(env, auth.user.id, DEFAULT_PROFILE),
    ]),
  );
}
