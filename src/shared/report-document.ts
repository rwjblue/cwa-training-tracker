import {
  validateAdvisorReportDefinition,
  validateAdvisorReportAnswers,
  type AdvisorReportDefinition,
} from './report-definition.ts';
import { isCalendarDate, dateInTimezone, type PracticeSession, type Profile } from './training.ts';
import { advisorReportWindow, type AdvisorReportWindow } from './report-window.ts';
import type { PlannedTask } from './plan.ts';
import type { LcwoBackup } from './lcwo.ts';
import { buildReportEvidence, reportablePractice } from './report-evidence.ts';
import { validateReportProvenance, type ReportProvenance } from './report-provenance.ts';

export const MAX_REPORT_DOCUMENT_BYTES = 96_000;
export const MAX_ACCOUNT_REPORTS = 200;
export interface ReportReference {
  kind: 'practice' | 'lcwo';
  id: string;
}
export interface ReportDocument {
  version: 1;
  id: string;
  status: 'draft' | 'handoff' | 'submitted';
  /** Native handoffs reserve one immutable confirmation identity. */
  handoff?: { submissionId: string };
  confirmation?: { handoffId: string };
  /** A correction is a new linked record, never an edit of submitted history. */
  revisionOf?: string;
  definition: AdvisorReportDefinition;
  window: AdvisorReportWindow;
  answers: Record<string, string>;
  editedKeys: string[];
  evidence: ReportReference[];
  /** Optional on older saved copies; captured suggestions do not replace learner edits. */
  provenance?: ReportProvenance;
  createdAt: string;
  updatedAt: string;
  /** A copy never acquires its source identity. */
  source?: { kind: 'native' | 'original-device'; id: string; archiveId?: string };
  submittedAt?: string;
}
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error(`Unsupported ${label} field.`);
  return row;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,199}$/.test(value))
    throw new Error('Invalid report identity.');
  return value;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    !isCalendarDate(value.slice(0, 10))
  )
    throw new Error('Invalid report timestamp.');
  return value;
}
export function validateReportDocument(
  value: unknown,
  options: { fieldRules?: boolean } = {},
): ReportDocument {
  const row = object(
    value,
    [
      'version',
      'id',
      'status',
      'definition',
      'window',
      'answers',
      'editedKeys',
      'evidence',
      'provenance',
      'createdAt',
      'updatedAt',
      'source',
      'submittedAt',
      'handoff',
      'confirmation',
      'revisionOf',
    ],
    'report document',
  );
  if (row.version !== 1 || !['draft', 'handoff', 'submitted'].includes(String(row.status)))
    throw new Error('Unsupported report version or status.');
  const definition = validateAdvisorReportDefinition(row.definition);
  const w = object(
    row.window,
    [
      'session',
      'reportDate',
      'timezone',
      'preparationDates',
      'meetingDate',
      'meetingStartsAt',
      'fromDate',
      'toDate',
      'empty',
      'fallback',
      'explanation',
    ],
    'report window',
  );
  if (
    !Number.isInteger(w.session) ||
    Number(w.session) < 1 ||
    Number(w.session) > 16 ||
    ![w.reportDate, w.fromDate, w.toDate].every(isCalendarDate) ||
    String(w.toDate) > String(w.reportDate) ||
    typeof w.empty !== 'boolean' ||
    w.empty !== String(w.fromDate) > String(w.toDate) ||
    typeof w.fallback !== 'boolean'
  )
    throw new Error('Invalid report session or inclusive window.');
  if (typeof w.timezone !== 'string' || w.timezone.length > 100)
    throw new Error('Invalid report timezone.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: w.timezone });
  } catch {
    throw new Error('Invalid report timezone.');
  }
  if (
    !Array.isArray(w.preparationDates) ||
    w.preparationDates.length > 100 ||
    !w.preparationDates.every(isCalendarDate) ||
    new Set(w.preparationDates).size !== w.preparationDates.length ||
    typeof w.explanation !== 'string' ||
    w.explanation.length > 1500 ||
    /[\u0000-\u0008\u007f]/.test(w.explanation)
  )
    throw new Error('Invalid report window explanation or preparation dates.');
  if (w.meetingDate !== undefined && !isCalendarDate(w.meetingDate))
    throw new Error('Invalid report class date.');
  if (w.meetingStartsAt !== undefined) timestamp(w.meetingStartsAt);
  const window: AdvisorReportWindow = {
    session: Number(w.session),
    reportDate: String(w.reportDate),
    timezone: w.timezone,
    preparationDates: w.preparationDates as string[],
    fromDate: String(w.fromDate),
    toDate: String(w.toDate),
    empty: w.empty,
    fallback: w.fallback,
    explanation: w.explanation,
    ...(w.meetingDate === undefined ? {} : { meetingDate: String(w.meetingDate) }),
    ...(w.meetingStartsAt === undefined ? {} : { meetingStartsAt: String(w.meetingStartsAt) }),
  };
  const keys = definition.fields.map((field) => field.key);
  const answers = object(row.answers, keys, 'report answers');
  if (
    Object.values(answers).some(
      (answer) =>
        typeof answer !== 'string' ||
        answer.length > 4000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(answer),
    )
  )
    throw new Error('Report answers must be bounded text.');
  if (
    !Array.isArray(row.editedKeys) ||
    row.editedKeys.length > keys.length ||
    row.editedKeys.some((key) => typeof key !== 'string' || !keys.includes(key)) ||
    new Set(row.editedKeys).size !== row.editedKeys.length
  )
    throw new Error('Invalid edited report keys.');
  if (!Array.isArray(row.evidence) || row.evidence.length > 2000)
    throw new Error('Too many report evidence references.');
  const evidence: ReportReference[] = row.evidence.map((value) => {
    const ref = object(value, ['kind', 'id'], 'report evidence');
    if (ref.kind !== 'practice' && ref.kind !== 'lcwo')
      throw new Error('Unsupported report evidence kind.');
    return { kind: ref.kind, id: id(ref.id) };
  });
  if (new Set(evidence.map((ref) => `${ref.kind}:${ref.id}`)).size !== evidence.length)
    throw new Error('Duplicate report evidence.');
  const result: ReportDocument = {
    version: 1,
    id: id(row.id),
    status: row.status as ReportDocument['status'],
    definition,
    window,
    answers: answers as Record<string, string>,
    editedKeys: row.editedKeys as string[],
    evidence,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
  if (Date.parse(result.updatedAt) < Date.parse(result.createdAt))
    throw new Error('Report update precedes creation.');
  if (row.provenance !== undefined)
    result.provenance = validateReportProvenance(row.provenance, definition, evidence);
  if (row.source !== undefined) {
    const source = object(row.source, ['kind', 'id', 'archiveId'], 'report source');
    if (source.kind !== 'native' && source.kind !== 'original-device')
      throw new Error('Unsupported report source.');
    result.source = {
      kind: source.kind,
      id: id(source.id),
      ...(source.archiveId === undefined ? {} : { archiveId: id(source.archiveId) }),
    };
    if ((source.kind === 'original-device') !== (source.archiveId !== undefined))
      throw new Error('Original draft provenance requires its archive identity.');
  }
  if (row.revisionOf !== undefined) {
    result.revisionOf = id(row.revisionOf);
    if (result.revisionOf === result.id) throw new Error('A report cannot revise itself.');
  }
  if (result.status === 'handoff') {
    const handoff = object(row.handoff, ['submissionId'], 'report handoff');
    result.handoff = { submissionId: id(handoff.submissionId) };
    if (result.handoff.submissionId === result.id)
      throw new Error('Use distinct handoff and submission identities.');
  } else if (row.handoff !== undefined)
    throw new Error('Only a captured handoff reserves a submission identity.');
  if (row.confirmation !== undefined) {
    if (result.status !== 'submitted')
      throw new Error('Only submitted history has a confirmation.');
    const confirmation = object(row.confirmation, ['handoffId'], 'report confirmation');
    result.confirmation = { handoffId: id(confirmation.handoffId) };
    if (result.confirmation.handoffId === result.id)
      throw new Error('Use distinct handoff and submission identities.');
  }
  if (result.status === 'submitted') {
    result.submittedAt = timestamp(row.submittedAt);
    if (
      result.confirmation &&
      (Date.parse(result.submittedAt) < Date.parse(result.createdAt) ||
        Date.parse(result.updatedAt) !== Date.parse(result.submittedAt))
    )
      throw new Error('Submission confirmation must match its update and follow creation.');
  } else if (row.submittedAt !== undefined)
    throw new Error('A draft cannot have a submission timestamp.');
  if (options.fieldRules) {
    const errors = validateAdvisorReportAnswers(
      definition,
      result.answers,
      result.status !== 'draft',
    );
    if (errors.length)
      throw new Error(errors.map((error) => `${error.key}: ${error.message}`).join(' '));
  }
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_REPORT_DOCUMENT_BYTES)
    throw new Error(
      'A report document exceeds 96,000 bytes. Narrow the report date window or reduce configured fields before refreshing; existing drafts and saved copies are unchanged.',
    );
  return result;
}
export function validateReportDocuments(value: unknown): ReportDocument[] {
  if (!Array.isArray(value) || value.length > MAX_ACCOUNT_REPORTS)
    throw new Error(`Keep up to ${MAX_ACCOUNT_REPORTS} saved report copies.`);
  const reports = value.map((value) => validateReportDocument(value, { fieldRules: true }));
  if (new Set(reports.map((report) => report.id)).size !== reports.length)
    throw new Error('Duplicate saved report identities.');
  return reports;
}
export function reportSuggestions(
  document: ReportDocument,
  profile: Profile,
  entries: readonly PracticeSession[],
  options: {
    lcwo?: Pick<LcwoBackup, 'runs' | 'estimateSeconds'> | null;
    tasks?: readonly PlannedTask[];
    now?: number;
  } = {},
): { answers: Record<string, string>; evidence: ReportReference[]; provenance: ReportProvenance } {
  const { window } = document;
  const unique = reportablePractice(document, entries, options.now);
  const selected = buildReportEvidence(document, entries, options.lcwo, options.tasks, options.now);
  const context = {
    callsign: profile.callsign,
    displayName: profile.displayName,
    session: String(window.session),
    reportDate: window.reportDate,
    practiceSummary: `${unique.length} saved practice ${unique.length === 1 ? 'result' : 'results'}; ${Number(unique.reduce((sum, entry) => sum + entry.minutes, 0).toFixed(3))} minutes (independent practice; inclusive window).`,
  };
  return {
    answers: Object.fromEntries(
      document.definition.fields.map((field) => [
        field.key,
        field.source === 'manual'
          ? ''
          : Object.hasOwn(context, field.source)
            ? context[field.source as keyof typeof context]
            : (selected.values[field.key] ?? ''),
      ]),
    ),
    evidence: selected.evidence,
    provenance: selected.provenance,
  };
}
export function refreshReportDocument(
  document: ReportDocument,
  profile: Profile,
  entries: readonly PracticeSession[],
  now = new Date().toISOString(),
  options: {
    lcwo?: Pick<LcwoBackup, 'runs' | 'estimateSeconds'> | null;
    tasks?: readonly PlannedTask[];
  } = {},
): ReportDocument {
  const suggestions = reportSuggestions(document, profile, entries, {
    ...options,
    now: Date.parse(now),
  });
  return validateReportDocument({
    ...document,
    answers: {
      ...suggestions.answers,
      ...Object.fromEntries(
        Object.entries(document.answers).filter(([key]) => document.editedKeys.includes(key)),
      ),
    },
    evidence: suggestions.evidence,
    provenance: suggestions.provenance,
    updatedAt: now,
  });
}
export function createReportDocument(
  definition: AdvisorReportDefinition,
  profile: Profile,
  tasks: PlannedTask[],
  session: number,
  date: string,
  entries: PracticeSession[],
  lcwo?: Pick<LcwoBackup, 'runs' | 'estimateSeconds'> | null,
): ReportDocument {
  const now = new Date().toISOString();
  return refreshReportDocument(
    {
      version: 1,
      id: crypto.randomUUID(),
      status: 'draft',
      definition: structuredClone(definition),
      window: advisorReportWindow(profile, tasks, session, date),
      answers: {},
      editedKeys: [],
      evidence: [],
      createdAt: now,
      updatedAt: now,
    },
    profile,
    entries,
    now,
    { lcwo, tasks },
  );
}
export function copyReportDocument(document: ReportDocument): ReportDocument {
  const now = new Date().toISOString();
  const {
    submittedAt: _submittedAt,
    handoff: _handoff,
    confirmation: _confirmation,
    ...draft
  } = structuredClone(document);
  return {
    ...draft,
    id: crypto.randomUUID(),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    source:
      document.source?.kind === 'original-device'
        ? structuredClone(document.source)
        : { kind: 'native', id: document.id },
  };
}
export function reportDocumentText(document: ReportDocument): string {
  return [
    document.definition.title,
    `Session ${document.window.session}; report date ${document.window.reportDate}`,
    `Course timezone: ${document.window.timezone}`,
    `Window: ${document.window.empty ? 'empty' : `${document.window.fromDate} through ${document.window.toDate} (inclusive)`}`,
    ...document.definition.fields.map(
      (field) => `${field.section} — ${field.label}: ${document.answers[field.key] ?? ''}`,
    ),
  ].join('\n');
}

export interface OriginalDeviceDraft {
  id: string;
  session: unknown;
  reportDate: unknown;
  answers: unknown;
  editedKeys: unknown;
  status: unknown;
  sourceAttemptIds: unknown;
  sourceLcwoIds: unknown;
}
export function originalDeviceDrafts(value: unknown): OriginalDeviceDraft[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  const perSession =
    row.reportDrafts && typeof row.reportDrafts === 'object' && !Array.isArray(row.reportDrafts)
      ? Object.values(row.reportDrafts)
      : [];
  const inputs = [...perSession, ...(row.reportDraft ? [row.reportDraft] : [])];
  const edits =
    row.reportEditsBySession && typeof row.reportEditsBySession === 'object'
      ? (row.reportEditsBySession as Record<string, unknown>)
      : {};
  const found = new Map<string, OriginalDeviceDraft>();
  for (const input of inputs.slice(0, 32)) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
    const draft = input as Record<string, unknown>;
    if (typeof draft.id !== 'string' || found.has(draft.id)) continue;
    found.set(draft.id, {
      id: draft.id,
      session: draft.session,
      reportDate: draft.reportDate,
      answers: draft.answers,
      editedKeys:
        edits[String(draft.session)] ??
        (input === row.reportDraft ? row.reportEditedKeys : undefined) ??
        draft.editedAnswerKeys ??
        [],
      status: draft.status,
      sourceAttemptIds: draft.sourceAttemptIds,
      sourceLcwoIds: draft.sourceLcwoIds,
    });
  }
  return [...found.values()];
}
export function copyOriginalDeviceDraft(
  original: OriginalDeviceDraft,
  archiveId: string,
  definition: AdvisorReportDefinition,
  profile: Profile,
  tasks: PlannedTask[],
  session: number,
): ReportDocument {
  if (original.status !== 'draft')
    throw new Error(
      'Submitted snapshots remain historical references. Only a preserved device draft can be copied.',
    );
  if (original.session !== session)
    throw new Error(
      `This original draft belongs to session ${String(original.session)}. Select its matching class session before copying.`,
    );
  const keys = definition.fields.map((field) => field.key);
  const answers = object(original.answers, keys, 'original draft answer mapping');
  if (Object.values(answers).some((value) => typeof value !== 'string'))
    throw new Error('Original draft answers require compatible text values.');
  const errors = validateAdvisorReportAnswers(definition, answers as Record<string, string>, false);
  if (errors.length)
    throw new Error(
      `Configure compatible original field keys and rules first: ${errors.map((error) => `${error.key}: ${error.message}`).join(' ')}`,
    );
  if (
    !Array.isArray(original.editedKeys) ||
    original.editedKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw new Error('Original edited keys require matching configured field keys.');
  const result = createReportDocument(
    definition,
    profile,
    tasks,
    session,
    String(original.reportDate),
    [],
  );
  result.answers = { ...result.answers, ...answers } as Record<string, string>;
  result.editedKeys = [...new Set(original.editedKeys)] as string[];
  result.source = { kind: 'original-device', id: id(original.id), archiveId: id(archiveId) };
  // Original evidence stays in the unchanged source archive, never native ownership.
  return validateReportDocument(result, { fieldRules: true });
}

/** Object-member order carries no report meaning; field/evidence arrays stay ordered. */
export function sameReportValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameReportValue(value, right[index]))
    );
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => Object.hasOwn(b, key) && sameReportValue(a[key], b[key]))
    );
  }
  return false;
}
