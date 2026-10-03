import { hash } from './security';
import { originalDeviceDrafts, sameReportValue } from '../shared/report-document';
import { validateReportDocument, type ReportDocument } from '../shared/report-document';
import { HttpError } from './http';

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
  return [...merged.values()];
}
