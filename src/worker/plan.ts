import { validatePlannedTask, validateNewTaskPin, type PlannedTask } from '../shared/plan';
import { curriculumPlan, mergeCurriculumPlan } from '../shared/curriculum';
import { DEFAULT_PROFILE } from '../shared/training';
import { requireAuth } from './auth';
import { HttpError, isRecord, json, readJson } from './http';
import { rateLimit } from './security';
import {
  getAccountSnapshot,
  mutateAccount,
  requireAccountRevision,
  retiredTaskIds,
} from './account-sync';

export async function getPlanData(env: Env, userId: string): Promise<PlannedTask[]> {
  const [settings, rows] = await env.DB.batch<Record<string, string>>([
    env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(userId),
    env.DB.prepare('SELECT task_json FROM training_plan WHERE user_id = ? ORDER BY id').bind(
      userId,
    ),
  ]);
  const profile = { ...DEFAULT_PROFILE, ...JSON.parse(settings.results[0]?.profile_json ?? '{}') };
  return mergeCurriculumPlan(
    profile,
    rows.results.map((row) => JSON.parse(row.task_json) as PlannedTask),
  );
}

export function deletePlanStatement(env: Env, userId: string): D1PreparedStatement {
  return env.DB.prepare('DELETE FROM training_plan WHERE user_id = ?').bind(userId);
}

export function planStatementsForImport(
  env: Env,
  userId: string,
  tasks: PlannedTask[] | undefined,
  replace: boolean,
): D1PreparedStatement[] {
  const statements = replace ? [deletePlanStatement(env, userId)] : [];
  let chunk: PlannedTask[] = [],
    bytes = 0;
  const flush = () => {
    if (!chunk.length) return;
    statements.push(
      env.DB.prepare(
        `INSERT INTO training_plan (user_id, id, task_json)
      SELECT ?, json_extract(value, '$.id'), value FROM json_each(?) WHERE true
      ON CONFLICT(user_id, id) DO NOTHING`,
      ).bind(userId, JSON.stringify(chunk)),
    );
    chunk = [];
    bytes = 0;
  };
  for (const task of tasks ?? []) {
    const size = new TextEncoder().encode(JSON.stringify(task)).length;
    if (bytes + size > 300_000) flush();
    chunk.push(task);
    bytes += size;
  }
  flush();
  return statements;
}

export async function listPlan(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await getAccountSnapshot(env, auth.user.id);
  return json({ plan: state.plan, revision: state.revision, generation: state.generation });
}

export async function updatePlanStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await requireAccountRevision(request, env, auth.user.id);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  const body = await readJson(request, 420_000);
  if (Object.keys(body).some((key) => !['ids', 'done', 'dismissedFromToday'].includes(key)))
    throw new HttpError(
      400,
      'Only exercise IDs and completion or dismissal status may be changed.',
    );
  if (
    !Array.isArray(body.ids) ||
    body.ids.length < 1 ||
    body.ids.length > 2000 ||
    body.ids.some(
      (id) =>
        typeof id !== 'string' || id.length > 200 || !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(id),
    ) ||
    new Set(body.ids).size !== body.ids.length
  )
    throw new HttpError(400, 'Choose between 1 and 2,000 distinct valid exercise IDs.');
  const changes: Partial<Pick<PlannedTask, 'done' | 'dismissedFromToday'>> = {};
  for (const key of ['done', 'dismissedFromToday'] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean')
      throw new HttpError(400, 'Exercise completion and dismissal must be true or false.');
    changes[key] = body[key];
  }
  if (!Object.keys(changes).length)
    throw new HttpError(400, 'Choose a completion or dismissal status to change.');

  const ids = new Set<string>(body.ids);
  const selected = state.plan.filter((task) => ids.has(task.id));
  if (selected.length !== ids.size)
    throw new HttpError(404, 'One or more exercises were not found in your current plan.');

  // Materialize generated assignments and patch only status in the same transaction.
  // Existing task notes, duration overrides, and practice evidence are untouched.
  const applied = await mutateAccount(env, state, [
    ...planStatementsForImport(
      env,
      auth.user.id,
      selected.filter((task) => task.source === 'curriculum'),
      false,
    ),
    env.DB.prepare(
      `UPDATE training_plan SET task_json = json_patch(task_json, ?)
      WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(changes), auth.user.id, JSON.stringify([...ids])),
  ]);
  return json({
    tasks: applied.state.plan.filter((task) => ids.has(task.id)),
    revision: applied.state.revision,
    generation: applied.state.generation,
  });
}

export async function savePlan(request: Request, env: Env, id?: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await requireAccountRevision(request, env, auth.user.id);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  const body = await readJson(request, 80_000);
  const input = isRecord(body.task) ? body.task : body;
  let task: PlannedTask;
  try {
    task = validatePlannedTask({
      ...input,
      id: id ?? input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid exercise.');
  }
  if (task.source === 'curriculum' || task.id.startsWith('curriculum:')) {
    if (!id)
      throw new HttpError(400, 'Course exercises are added automatically from your schedule.');
    const assigned = curriculumPlan(state.settings).find((item) => item.id === id);
    if (!assigned) throw new HttpError(404, 'This exercise is not in your current course.');
    task = {
      ...task,
      source: 'curriculum',
      kind: assigned.kind,
      lesson: assigned.lesson,
      dueDate: assigned.dueDate,
      curriculum: assigned.curriculum,
      exercise: assigned.exercise,
      link: assigned.link,
    };
    try {
      validateNewTaskPin(
        state.plan.find((item) => item.id === task.id),
        task,
        state.settings,
      );
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    const applied = await mutateAccount(env, state, [
      env.DB.prepare(
        `INSERT INTO training_plan (user_id, id, task_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET task_json = excluded.task_json`,
      ).bind(auth.user.id, task.id, JSON.stringify(task)),
    ]);
    return json({ task, revision: applied.state.revision, generation: applied.state.generation });
  }
  try {
    validateNewTaskPin(
      state.plan.find((item) => item.id === task.id),
      task,
      state.settings,
    );
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  let statement: D1PreparedStatement;
  if (id) {
    if (!state.plan.some((task) => task.id === id))
      throw new HttpError(404, 'This exercise was not found.');
    statement = env.DB.prepare(
      'UPDATE training_plan SET task_json = ? WHERE user_id = ? AND id = ? RETURNING id',
    ).bind(JSON.stringify(task), auth.user.id, id);
  } else {
    if (state.plan.some((item) => item.id === task.id))
      throw new HttpError(409, 'This exercise is already in your plan.');
    statement = env.DB.prepare(
      `INSERT INTO training_plan (user_id, id, task_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, id) DO NOTHING RETURNING id`,
    ).bind(auth.user.id, task.id, JSON.stringify(task));
  }
  const applied = await mutateAccount(env, state, [statement]);
  return json(
    { task, revision: applied.state.revision, generation: applied.state.generation },
    id ? 200 : 201,
  );
}

export async function deletePlan(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const state = await requireAccountRevision(request, env, auth.user.id);
  if (id.startsWith('curriculum:'))
    throw new HttpError(
      400,
      'Course exercises follow your schedule. Mark an exercise complete or change your course dates.',
    );
  const applied = await mutateAccount(
    env,
    state,
    [
      env.DB.prepare('DELETE FROM training_plan WHERE user_id = ? AND id = ?').bind(
        auth.user.id,
        id,
      ),
    ],
    undefined,
    retiredTaskIds(
      state,
      state.plan.filter((task) => task.id !== id),
    ),
  );
  return json({ ok: true, revision: applied.state.revision, generation: applied.state.generation });
}
