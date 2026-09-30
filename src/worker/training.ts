import {
  DEFAULT_PROFILE,
  convertLegacyExport,
  validatePracticeSession,
  validateProfile,
  validateTrainingExport,
  type PracticeSession,
  type Profile,
  type TrainingExport,
} from '../shared/training';
import { requireAuth } from './auth';
import { HttpError, isRecord, json, readJson } from './http';
import { hash, rateLimit } from './security';
import { deletePlanStatement, planStatementsForImport } from './plan';
import type { PlannedTask } from '../shared/plan';

const MAX_ENTRIES = 20_000;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

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

function validated<T>(validate: (value: unknown) => T, value: unknown): T {
  try {
    return validate(value);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid training data.');
  }
}

async function profile(env: Env, userId: string): Promise<Profile> {
  const row = await env.DB.prepare('SELECT profile_json FROM users WHERE id = ?')
    .bind(userId)
    .first<{ profile_json: string }>();
  return row ? { ...DEFAULT_PROFILE, ...JSON.parse(row.profile_json) } : { ...DEFAULT_PROFILE };
}

async function entries(env: Env, userId: string): Promise<PracticeSession[]> {
  const result = await env.DB.prepare(
    'SELECT entry_json FROM practice_entries WHERE user_id = ? ORDER BY date DESC, id DESC',
  )
    .bind(userId)
    .all<{ entry_json: string }>();
  return result.results.map((row) => JSON.parse(row.entry_json) as PracticeSession);
}

export async function listEntries(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  return json({ entries: await entries(env, auth.user.id) });
}

export async function saveEntry(request: Request, env: Env, id?: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await rateLimit(env, `write:${auth.user.id}`, 120, 60);
  const body = await readJson(request, 250_000);
  const input = isRecord(body.entry) ? body.entry : body;
  const entry = validated(validatePracticeSession, {
    ...input,
    id: id ?? input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  if (id) {
    const updated = await env.DB.prepare(
      'UPDATE practice_entries SET date = ?, entry_json = ? WHERE user_id = ? AND id = ? RETURNING id',
    )
      .bind(entry.date, JSON.stringify(entry), auth.user.id, id)
      .first<{ id: string }>();
    if (!updated) throw new HttpError(404, 'This practice entry was not found.');
  } else {
    const inserted = await env.DB.prepare(
      `INSERT INTO practice_entries (user_id, id, date, entry_json)
      SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM practice_entries WHERE user_id = ?) < ?
      ON CONFLICT(user_id, id) DO NOTHING RETURNING id`,
    )
      .bind(auth.user.id, entry.id, entry.date, JSON.stringify(entry), auth.user.id, MAX_ENTRIES)
      .first<{ id: string }>();
    if (!inserted) {
      // The insert resolves races. A retry after a lost response acknowledges only
      // an equivalent record owned by this account; it never overwrites edits.
      const row = await env.DB.prepare(
        'SELECT entry_json FROM practice_entries WHERE user_id = ? AND id = ?',
      )
        .bind(auth.user.id, entry.id)
        .first<{ entry_json: string }>();
      if (row) {
        const saved = JSON.parse(row.entry_json) as PracticeSession;
        const retried =
          input.createdAt === undefined ? { ...entry, createdAt: saved.createdAt } : entry;
        if (equivalentEntry(saved, retried)) return json({ entry: saved, duplicate: true });
      }
      throw new HttpError(
        409,
        'This entry already exists, or your log has reached its 20,000-entry limit.',
      );
    }
  }
  return json({ entry }, id ? 200 : 201);
}

export async function deleteEntry(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await env.DB.prepare('DELETE FROM practice_entries WHERE user_id = ? AND id = ?')
    .bind(auth.user.id, id)
    .run();
  return json({ ok: true });
}

export async function getSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  return json({ settings: await profile(env, auth.user.id) });
}

export async function saveSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const body = await readJson(request);
  const settings = validated(validateProfile, body.settings ?? body);
  await env.DB.prepare('UPDATE users SET profile_json = ? WHERE id = ?')
    .bind(JSON.stringify(settings), auth.user.id)
    .run();
  return json({ settings });
}

export async function exportData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  // D1 batches are transactions, so an export sees one coherent snapshot even
  // when another browser edits a profile or replaces its data concurrently.
  const [settings, sessions, archive, plan] = await env.DB.batch<Record<string, string>>([
    env.DB.prepare('SELECT profile_json FROM users WHERE id = ?').bind(auth.user.id),
    env.DB.prepare(
      'SELECT entry_json FROM practice_entries WHERE user_id = ? ORDER BY date DESC, id DESC',
    ).bind(auth.user.id),
    env.DB.prepare(
      `SELECT source_json FROM import_sources WHERE user_id = ? AND source_hash =
      (SELECT source_hash FROM import_sources WHERE user_id = ? ORDER BY created_at DESC LIMIT 1) ORDER BY chunk`,
    ).bind(auth.user.id, auth.user.id),
    env.DB.prepare('SELECT task_json FROM training_plan WHERE user_id = ? ORDER BY id').bind(
      auth.user.id,
    ),
  ]);
  const exported: TrainingExport = {
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: { ...DEFAULT_PROFILE, ...JSON.parse(settings.results[0].profile_json) },
    sessions: sessions.results.map((row) => JSON.parse(row.entry_json) as PracticeSession),
    plan: plan.results.map((row) => JSON.parse(row.task_json) as PlannedTask),
    ...(archive.results.length
      ? {
          legacy: JSON.parse(
            archive.results.map((row) => row.source_json).join(''),
          ) as TrainingExport['legacy'],
        }
      : {}),
  };
  return json(exported, 200, {
    'Content-Disposition': `attachment; filename="cw-academy-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  });
}

export async function importData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await rateLimit(env, `import:${auth.user.id}`, 10, 60 * 60);
  const input = await readJson(request, MAX_IMPORT_BYTES);
  if (input.mode !== 'merge' && input.mode !== 'replace')
    throw new HttpError(400, 'Choose merge or replace for this import.');
  const data = validated(
    isRecord(input.data) && input.data.format === 'cwa-training-tracker'
      ? validateTrainingExport
      : convertLegacyExport,
    input.data,
  );
  const uniqueEntries = new Map(data.sessions.map((entry) => [entry.id, entry]));
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
  if (input.mode === 'replace') {
    statements.push(
      env.DB.prepare('DELETE FROM practice_entries WHERE user_id = ?').bind(auth.user.id),
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
  if (data.profile) {
    const settings = { ...data.profile };
    if (!isRecord(input.data) || input.data.format !== 'cwa-training-tracker') {
      const existing = await profile(env, auth.user.id);
      settings.callsign ||= existing.callsign;
      settings.displayName ||= existing.displayName;
    }
    statements.push(
      env.DB.prepare('UPDATE users SET profile_json = ? WHERE id = ?').bind(
        JSON.stringify(settings),
        auth.user.id,
      ),
    );
  }
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
  const results = statements.length ? await env.DB.batch(statements) : [];
  // D1's meta.changes includes quota-accounting trigger writes. RETURNING counts
  // only actual new entries and also handles concurrent merge conflicts.
  const imported = entryStatementIndexes.reduce(
    (sum, index) => sum + results[index].results.length,
    0,
  );
  return json({ imported, skipped: data.sessions.length - imported });
}

export async function resetData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const input = await readJson(request);
  if (input.confirmation !== 'RESET')
    throw new HttpError(400, 'Type RESET to confirm clearing your practice data.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM practice_entries WHERE user_id = ?').bind(auth.user.id),
    env.DB.prepare('DELETE FROM import_sources WHERE user_id = ?').bind(auth.user.id),
    deletePlanStatement(env, auth.user.id),
    env.DB.prepare('UPDATE users SET profile_json = ? WHERE id = ?').bind(
      JSON.stringify(DEFAULT_PROFILE),
      auth.user.id,
    ),
  ]);
  return json({ ok: true });
}
