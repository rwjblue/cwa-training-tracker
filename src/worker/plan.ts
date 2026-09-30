import { validatePlannedTask, type PlannedTask } from '../shared/plan';
import { curriculumPlan, mergeCurriculumPlan } from '../shared/curriculum';
import { DEFAULT_PROFILE, type Profile } from '../shared/training';
import { requireAuth } from './auth';
import { HttpError, isRecord, json, readJson } from './http';
import { rateLimit } from './security';

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

async function assignedTasks(env: Env, userId: string): Promise<PlannedTask[]> {
  const row = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?')
    .bind(userId)
    .first<{ profile_json: string }>();
  const profile: Profile = { ...DEFAULT_PROFILE, ...JSON.parse(row?.profile_json ?? '{}') };
  return curriculumPlan(profile);
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
  return json({ plan: await getPlanData(env, auth.user.id) });
}

export async function updatePlanStatus(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
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
  const selected = (await getPlanData(env, auth.user.id)).filter((task) => ids.has(task.id));
  if (selected.length !== ids.size)
    throw new HttpError(404, 'One or more exercises were not found in your current plan.');

  // Materialize generated assignments and patch only status in the same transaction.
  // Existing task notes, duration overrides, and practice evidence are untouched.
  await env.DB.batch([
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
    tasks: (await getPlanData(env, auth.user.id)).filter((task) => ids.has(task.id)),
  });
}

export async function savePlan(request: Request, env: Env, id?: string): Promise<Response> {
  const auth = await requireAuth(request, env);
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
    const assigned = (await assignedTasks(env, auth.user.id)).find((item) => item.id === id);
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
    await env.DB.prepare(
      `INSERT INTO training_plan (user_id, id, task_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET task_json = excluded.task_json`,
    )
      .bind(auth.user.id, task.id, JSON.stringify(task))
      .run();
    return json({ task });
  }
  if (id) {
    const result = await env.DB.prepare(
      'UPDATE training_plan SET task_json = ? WHERE user_id = ? AND id = ? RETURNING id',
    )
      .bind(JSON.stringify(task), auth.user.id, id)
      .first();
    if (!result) throw new HttpError(404, 'This exercise was not found.');
  } else {
    const result = await env.DB.prepare(
      `INSERT INTO training_plan (user_id, id, task_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id, id) DO NOTHING RETURNING id`,
    )
      .bind(auth.user.id, task.id, JSON.stringify(task))
      .first();
    if (!result) throw new HttpError(409, 'This exercise is already in your plan.');
  }
  return json({ task }, id ? 200 : 201);
}

export async function deletePlan(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (id.startsWith('curriculum:'))
    throw new HttpError(
      400,
      'Course exercises follow your schedule. Mark an exercise complete or change your course dates.',
    );
  await env.DB.prepare('DELETE FROM training_plan WHERE user_id = ? AND id = ?')
    .bind(auth.user.id, id)
    .run();
  return json({ ok: true });
}
