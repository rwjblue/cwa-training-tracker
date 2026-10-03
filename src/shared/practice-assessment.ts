import type { PracticeSession } from './training.ts';
import { sessionEvidence } from './practice-evidence.ts';

export const PERFORMANCE_RATINGS = {
  'very-good': 'Very good',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
} as const;
export type PerformanceRating = keyof typeof PERFORMANCE_RATINGS;
export const CWT_OBSERVATION_FIELDS = {
  heardCallsigns: 'Callsigns heard',
  heardExchanges: 'Names and exchanges heard',
  workedCallsigns: 'Callsigns worked',
  workedNames: 'First names of people worked',
  comments: 'CWT comments for the report',
} as const;
export type CwtObservations = Partial<Record<keyof typeof CWT_OBSERVATION_FIELDS, string>>;

/** Explicit learner judgments, separate from immutable native measurements. */
export interface PracticeAssessment {
  version: 1;
  source: 'self-reported';
  performanceRating?: PerformanceRating;
  /** Presence explicitly identifies CWT; a blank contact count stays unknown. */
  cwt?: CwtObservations;
}

function fields(value: unknown, label: string, allowed: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error(`${label} contains an unknown field.`);
  return row;
}

export function validatePracticeAssessment(value: unknown): PracticeAssessment {
  const row = fields(value, 'Practice assessment', [
    'version',
    'source',
    'performanceRating',
    'cwt',
  ]);
  if (row.version !== 1 || row.source !== 'self-reported')
    throw new Error('Practice assessment must be version 1 and explicitly self-reported.');
  const result: PracticeAssessment = { version: 1, source: 'self-reported' };
  if (row.performanceRating !== undefined) {
    if (
      typeof row.performanceRating !== 'string' ||
      !Object.hasOwn(PERFORMANCE_RATINGS, row.performanceRating)
    )
      throw new Error('Choose a performance rating: Very good, Good, Fair or Poor.');
    result.performanceRating = row.performanceRating as PerformanceRating;
  }
  if (row.cwt !== undefined) {
    const cwt = fields(row.cwt, 'CWT observations', Object.keys(CWT_OBSERVATION_FIELDS));
    result.cwt = {};
    for (const key of Object.keys(CWT_OBSERVATION_FIELDS) as (keyof CwtObservations)[]) {
      if (cwt[key] === undefined) continue;
      const value = cwt[key];
      if (typeof value !== 'string' || value.length > 4000 || value.includes('\0'))
        throw new Error(
          `${CWT_OBSERVATION_FIELDS[key]} must be text of at most 4,000 characters without null characters.`,
        );
      result.cwt[key] = value;
    }
  }
  if (result.performanceRating === undefined && result.cwt === undefined)
    throw new Error('Choose a performance rating or CWT observations, or omit the assessment.');
  return result;
}

type PracticeSource = Partial<Pick<PracticeSession, 'kind' | 'source' | 'metadata'>>;

/** Inspect archived source facts without normalizing or promoting their contents. */
function archivedFields(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function hasArchivedSyntheticSource(metadata: PracticeSource['metadata']): boolean {
  const attempt = archivedFields(metadata?.legacyAttempt);
  const task = archivedFields(metadata?.legacyTask);
  const taskId = String(attempt.taskId ?? task.id ?? '');
  const historical = archivedFields(archivedFields(metadata?.historicalTiming).timing);
  return Boolean(
    metadata?.legacyLcwoRun !== undefined ||
    attempt.runnerResult !== undefined ||
    attempt.lcwoResult !== undefined ||
    (Array.isArray(attempt.audioResults) && attempt.audioResults.length) ||
    (Array.isArray(historical.recordings) && historical.recordings.length) ||
    ['audio', 'icr', 'simulator'].includes(String(task.kind)) ||
    ['other:morse-runner', 'other:word-recognition', 'other:icr', 'bob-77-words'].includes(
      taskId,
    ) ||
    taskId.startsWith('word-practice') ||
    taskId.startsWith('qso-practice'),
  );
}

/** Generated/recorded practice and simulator contacts are never on-air evidence. */
export function hasSyntheticContactSource(entry: PracticeSource): boolean {
  const evidence = sessionEvidence(entry.metadata);
  return Boolean(
    entry.source === 'morse' ||
    entry.metadata?.externalResult !== undefined ||
    hasArchivedSyntheticSource(entry.metadata) ||
    entry.metadata?.copyAttempt ||
    ['words', 'qso', 'stories', 'free', 'copy', 'morse-runner', 'audio'].includes(
      String(entry.metadata?.practiceTool),
    ) ||
    evidence?.type === 'runner' ||
    (evidence?.type === 'timed' && (evidence.generatedListening || evidence.recordings.length)),
  );
}

export function supportsOnAirObservations(entry: PracticeSource): boolean {
  return entry.kind === 'on-air' && !hasSyntheticContactSource(entry);
}

/** Old queued generic counts stay valid; new typed assessments cannot add synthetic contact claims. */
export function validateAssessedContactCount(
  entry: PracticeSession,
  previous?: PracticeSession,
): void {
  // Older exact queued bodies have no assessment marker. Retain those raw
  // counts; contactCountDetail still classifies them as historical/simulated.
  if (
    entry.metadata?.assessment !== undefined &&
    entry.qsoCount !== undefined &&
    hasSyntheticContactSource(entry) &&
    sessionEvidence(entry.metadata)?.type !== 'runner' &&
    entry.qsoCount !== previous?.qsoCount
  )
    throw new Error('Generated or recorded practice cannot record actual on-air QSO counts.');
}

export function contactCountDetail(entry: PracticeSession): string | undefined {
  if (entry.qsoCount === undefined) return undefined;
  if (supportsOnAirObservations(entry))
    return `${entry.qsoCount} actual on-air QSOs (self-reported)`;
  if (entry.kind === 'simulator') return `${entry.qsoCount} simulated QSOs`;
  return `${entry.qsoCount} historical count (not actual on-air QSOs)`;
}

/** IDs/date/category originate in the owned record, never from supplied references. */
export function practiceAssessmentEvidence(entry: PracticeSession) {
  const value = entry.metadata?.assessment;
  if (value === undefined) return undefined;
  const assessment = validatePracticeAssessment(value);
  return {
    sessionId: entry.id,
    date: entry.date,
    kind: entry.kind,
    context: entry.context ?? 'practice',
    ...assessment,
    ...(assessment.cwt && entry.qsoCount !== undefined ? { qsoCount: entry.qsoCount } : {}),
  };
}

export function practiceAssessmentDetails(entry: PracticeSession): string[] {
  const assessment = practiceAssessmentEvidence(entry);
  const count = contactCountDetail(entry);
  if (!assessment) return count ? [count] : [];
  return [
    `Self-reported observations · record ${assessment.sessionId} · ${assessment.date}`,
    ...(assessment.performanceRating
      ? [`Performance: ${PERFORMANCE_RATINGS[assessment.performanceRating]} (learner judgment)`]
      : []),
    ...(assessment.cwt
      ? [
          'CWops Tests (CWT) observations',
          count ?? 'Actual on-air QSO count: unknown (not recorded)',
          ...Object.entries(CWT_OBSERVATION_FIELDS).flatMap(([key, label]) => {
            const value = assessment.cwt![key as keyof CwtObservations];
            return value?.trim() ? [`${label}: ${value}`] : [];
          }),
        ]
      : count
        ? [count]
        : []),
  ];
}
