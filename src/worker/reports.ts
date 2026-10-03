import { validateReportRelationships } from '../shared/report-handoff';
import { hash } from './security';
import { originalDeviceDrafts, sameReportValue } from '../shared/report-document';
import { validateReportDocument, type ReportDocument } from '../shared/report-document';
import { HttpError } from './http';
import { buildReportEvidence } from '../shared/report-evidence';
import type { PracticeSession } from '../shared/training';
import { lcwoRunDetails, type LcwoRun } from '../shared/lcwo';
import { getPlanData } from './plan';

/** New automatic claims must match owned saved facts. Historical imports retain their frozen snapshots. */
export async function requireCurrentReportProvenance(
  env: Env,
  accountId: string,
  report: ReportDocument,
) {
  if (!report.provenance) return; // Compatible older copies have no suggestion snapshot.
  // Validate the captured owned source set. Later practice must not invalidate
  // an immutable queued copy; explicit working-draft refresh selects newer facts.
  const entries: PracticeSession[] = [];
  const runs: LcwoRun[] = [];
  for (const kind of ['practice', 'lcwo'] as const) {
    const ids = report.evidence.filter((ref) => ref.kind === kind).map((ref) => ref.id);
    for (let offset = 0; offset < ids.length; offset += 80) {
      const chunk = ids.slice(offset, offset + 80);
      const column = kind === 'practice' ? 'entry_json' : 'run_json';
      const table = kind === 'practice' ? 'practice_entries' : 'lcwo_results';
      const rows = await env.DB.prepare(
        `SELECT ${column} AS value FROM ${table} WHERE user_id=? AND id IN (${chunk.map(() => '?').join(',')})`,
      )
        .bind(accountId, ...chunk)
        .all<{ value: string }>();
      for (const row of rows.results) {
        if (kind === 'practice') entries.push(JSON.parse(row.value) as PracticeSession);
        else runs.push(JSON.parse(row.value) as LcwoRun);
      }
    }
  }
  const tasks = await getPlanData(env, accountId);
  const expected = buildReportEvidence(report, entries, { runs, estimateSeconds: 0 }, tasks);
  const claims = report.provenance.fields.map((field) => ({
    key: field.key,
    mapping: field.mapping,
    value: field.value,
    warnings: field.warnings,
    evidence: field.references
      .map((index) => report.evidence[index])
      .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  }));
  const actual = expected.provenance.fields.map((field) => ({
    key: field.key,
    mapping: field.mapping,
    value: field.value,
    warnings: field.warnings,
    evidence: field.references
      .map((index) => expected.evidence[index])
      .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  }));
  const refs = (items: typeof report.evidence) =>
    [...items].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  if (
    !sameReportValue(refs(report.evidence), refs(expected.evidence)) ||
    !sameReportValue(claims, actual)
  )
    throw new HttpError(
      400,
      'The captured suggestion no longer matches its saved source results. Refresh the working draft; learner edits and intentional blanks are protected. Historical report copies remain unchanged.',
    );
  for (const source of report.provenance.sources) {
    const ref = report.evidence[source.reference];
    const matching = expected.provenance.sources.find((candidate) => {
      const actualRef = expected.evidence[candidate.reference];
      return actualRef?.kind === ref.kind && actualRef.id === ref.id;
    });
    // LCWO estimate explanation is a frozen learner assumption, not a source measurement.
    const detailCount =
      ref.kind === 'lcwo'
        ? lcwoRunDetails(runs.find((run) => run.id === ref.id)!).length
        : undefined;
    const measured = (snapshot: typeof source) => ({
      source: snapshot.source,
      date: snapshot.date,
      occurredAt: snapshot.occurredAt,
      label: snapshot.label,
      facts: detailCount === undefined ? snapshot.facts : snapshot.facts.slice(0, detailCount),
    });
    if (!matching || !sameReportValue(measured(source), measured(matching)))
      throw new HttpError(
        400,
        'A captured report source changed. Refresh preserves your edited answers; existing historical copies remain immutable.',
      );
  }
}

/** Reference IDs grant no authority: all lookups are scoped to the authenticated owner. */
export async function requireReportEvidence(
  env: Env,
  accountId: string,
  reports: ReportDocument[],
  incoming: { practice?: string[]; lcwo?: string[]; archive?: unknown } = {},
): Promise<void> {
  for (const report of reports) {
    const source = report.source;
    if (source?.kind !== 'original-device') continue;
    let archive: unknown;
    if (incoming.archive && (await hash(JSON.stringify(incoming.archive))) === source.archiveId)
      archive = (incoming.archive as { data?: unknown }).data;
    else {
      const rows = await env.DB.prepare(
        'SELECT source_json FROM import_sources WHERE user_id=? AND source_hash=? ORDER BY chunk',
      )
        .bind(accountId, source.archiveId)
        .all<{ source_json: string }>();
      if (rows.results.length)
        archive = JSON.parse(rows.results.map((row) => row.source_json).join('')).data;
    }
    if (
      !originalDeviceDrafts(archive).some(
        (draft) =>
          draft.id === source.id &&
          draft.status === 'draft' &&
          draft.session === report.window.session,
      )
    )
      throw new HttpError(
        400,
        'The original report draft provenance is missing from this private account archive. Include its original archive when importing.',
      );
  }
  const refs = reports.flatMap((report) => report.evidence);
  for (const kind of ['practice', 'lcwo'] as const) {
    const ids = [...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.id))];
    const supplied = new Set(incoming[kind] ?? []);
    const needed = ids.filter((id) => !supplied.has(id));
    for (let offset = 0; offset < needed.length; offset += 80) {
      const chunk = needed.slice(offset, offset + 80);
      const table = kind === 'practice' ? 'practice_entries' : 'lcwo_results';
      const found = await env.DB.prepare(
        `SELECT id FROM ${table} WHERE user_id=? AND id IN (${chunk.map(() => '?').join(',')})`,
      )
        .bind(accountId, ...chunk)
        .all<{ id: string }>();
      if (found.results.length !== chunk.length)
        throw new HttpError(
          400,
          'Report evidence is missing from this account. Upload the referenced results first, or refresh the draft.',
        );
    }
  }
}
export function reportInsertStatement(
  env: Env,
  accountId: string,
  report: ReportDocument,
): D1PreparedStatement {
  const checked = validateReportDocument(report, { fieldRules: true });
  return env.DB.prepare(
    'INSERT INTO advisor_reports(user_id,id,report_json) VALUES(?,?,?) ON CONFLICT(user_id,id) DO NOTHING',
  ).bind(accountId, checked.id, JSON.stringify(checked));
}
export function mergeReportCopies(
  existing: ReportDocument[],
  incoming: ReportDocument[],
): ReportDocument[] {
  const merged = new Map(existing.map((report) => [report.id, report]));
  for (const report of incoming) {
    const prior = merged.get(report.id);
    if (prior && !sameReportValue(prior, report))
      throw new HttpError(
        400,
        'A saved report ID already has different immutable contents. Keep both exports and reopen as a new draft.',
      );
    merged.set(report.id, report);
  }
  if (merged.size > 200)
    throw new HttpError(
      400,
      'Keep up to 200 saved report copies. Export before removing older data.',
    );
  const result = [...merged.values()];
  try {
    validateReportRelationships(result);
  } catch (error) {
    throw new HttpError(400, (error as Error).message);
  }
  return result;
}
