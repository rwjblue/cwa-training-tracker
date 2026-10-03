import { civilTimeCandidates } from './civil-time.ts';
import { dateInTimezone, isCalendarDate, type PracticeSession } from './training.ts';
import { sessionEvidence } from './practice-evidence.ts';

export const LCWO_FIELDS = {
  speedWpm: 'Actual trainer speed (WPM)',
  groupLength: 'Group length',
  maximumLength: 'Maximum word length',
  errorCount: 'Number of errors',
  errorPercent: 'Errors (%)',
  score: 'LCWO score',
} as const;
/** One numeric contract supplies the form and browser/Worker validators. */
export const LCWO_METRIC_LIMITS: Record<
  keyof typeof LCWO_FIELDS,
  { min: number; max: number; integer: boolean }
> = {
  speedWpm: { min: 1, max: 200, integer: false },
  groupLength: { min: 1, max: 1000, integer: true },
  maximumLength: { min: 1, max: 1000, integer: true },
  errorCount: { min: 0, max: 1e6, integer: true },
  errorPercent: { min: 0, max: 100, integer: false },
  score: { min: 0, max: 1e12, integer: false },
};
export const LCWO_KINDS = {
  letters: 'LCWO letter groups',
  figures: 'LCWO figure groups',
  custom: 'LCWO custom characters / Koch',
  words: 'LCWO words',
  callsign: 'LCWO callsigns',
} as const;
type LcwoKind = keyof typeof LCWO_KINDS;
export const LCWO_KIND_FIELDS: Record<LcwoKind, readonly (keyof typeof LCWO_FIELDS)[]> = {
  letters: ['speedWpm', 'groupLength', 'errorPercent'],
  figures: ['speedWpm', 'groupLength', 'errorPercent'],
  custom: ['speedWpm', 'groupLength', 'errorPercent'],
  words: ['speedWpm', 'maximumLength', 'errorCount', 'score'],
  callsign: ['speedWpm', 'errorCount', 'score'],
};
export type ExternalPractice = { version: 1; source: 'user-entered' } & (
  | ({ trainer: 'lcwo'; kind: LcwoKind } & Partial<Record<keyof typeof LCWO_FIELDS, number>>)
  | {
      trainer: 'morse-runner';
      mode: 'SingleCall' | 'WPX';
      elapsedSeconds: number;
      startingWpm?: number;
      usedWpms?: number[];
      verifiedPoints?: number;
      score?: number;
      contacts?: number;
    }
);
export interface ManualTiming {
  version: 1;
  source: 'user-entered';
  timezone: string;
  completedLocal: string;
  /** Explicit occurrence for repeated civil times; zero is the earlier instant. */
  occurrence?: 0 | 1;
  startedAt: string;
  completedAt: string;
}
function record(value: unknown, label: string, allowed: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error(`${label} contains an unsupported field.`);
  return row;
}
function numeric(value: unknown, label: string, min: number, max: number, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`,
    );
  return value;
}
export function validateExternalPractice(value: unknown): ExternalPractice {
  const trainer = (value as { trainer?: unknown } | null)?.trainer;
  const allowed =
    trainer === 'lcwo'
      ? ['version', 'source', 'trainer', 'kind', ...Object.keys(LCWO_FIELDS)]
      : [
          'version',
          'source',
          'trainer',
          'mode',
          'elapsedSeconds',
          'startingWpm',
          'usedWpms',
          'verifiedPoints',
          'score',
          'contacts',
        ];
  const row = record(value, 'External result', allowed);
  if (row.version !== 1 || row.source !== 'user-entered')
    throw new Error('External results must be version 1 and user-entered.');
  if (trainer === 'lcwo') {
    if (typeof row.kind !== 'string' || !Object.hasOwn(LCWO_KINDS, row.kind))
      throw new Error('Choose an LCWO drill.');
    const result: ExternalPractice = {
      version: 1,
      source: 'user-entered',
      trainer: 'lcwo',
      kind: row.kind as LcwoKind,
    };
    for (const key of Object.keys(LCWO_FIELDS) as (keyof typeof LCWO_FIELDS)[]) {
      if (row[key] === undefined) continue;
      if (!LCWO_KIND_FIELDS[result.kind].includes(key))
        throw new Error(`${LCWO_FIELDS[key]} does not belong to this LCWO drill.`);
      const range = LCWO_METRIC_LIMITS[key];
      result[key] = numeric(row[key], LCWO_FIELDS[key], range.min, range.max, range.integer);
    }
    return result;
  }
  if (trainer !== 'morse-runner' || !['SingleCall', 'WPX'].includes(String(row.mode)))
    throw new Error('Choose the external Runner mode.');
  const result: ExternalPractice = {
    version: 1,
    source: 'user-entered',
    trainer: 'morse-runner',
    mode: row.mode as 'SingleCall' | 'WPX',
    elapsedSeconds: numeric(row.elapsedSeconds, 'Actual Runner time', 0, 86400),
  };
  if (row.startingWpm !== undefined)
    result.startingWpm = numeric(row.startingWpm, 'Runner starting speed', 1, 200);
  if (row.usedWpms !== undefined) {
    if (!Array.isArray(row.usedWpms) || !row.usedWpms.length || row.usedWpms.length > 200)
      throw new Error('Record 1 to 200 distinct used Runner speeds, or leave them unknown.');
    result.usedWpms = row.usedWpms.map((value) => numeric(value, 'Used Runner speed', 1, 200));
    if (
      new Set(result.usedWpms).size !== result.usedWpms.length ||
      (result.startingWpm !== undefined && !result.usedWpms.includes(result.startingWpm))
    )
      throw new Error(
        'Used Runner speeds must be distinct and include the starting speed when recorded.',
      );
  }
  for (const key of ['verifiedPoints', 'score', 'contacts'] as const)
    if (row[key] !== undefined)
      result[key] = numeric(
        row[key],
        key === 'verifiedPoints'
          ? 'Runner verified points'
          : key === 'contacts'
            ? 'Runner simulated contacts'
            : 'Runner score',
        0,
        1e12,
        true,
      );
  if (
    result.verifiedPoints !== undefined &&
    result.contacts !== undefined &&
    result.verifiedPoints > result.contacts
  )
    throw new Error('Verified points cannot exceed simulated contacts.');
  return result;
}
export function manualCompletionCandidates(local: string, zone: string): number[] {
  if (
    !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(local) ||
    !isCalendarDate(local.slice(0, 10))
  )
    throw new Error('Choose a valid local completion date and time.');
  if (!zone || zone.length > 100 || /^[+-]/.test(zone))
    throw new Error('Choose a valid IANA practice timezone.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
  } catch {
    throw new Error('Choose a valid IANA practice timezone.');
  }
  return civilTimeCandidates(local.slice(0, 10), local.slice(11), zone);
}
export function createManualTiming(
  local: string,
  zone: string,
  seconds: number,
  occurrence?: 0 | 1,
): ManualTiming {
  numeric(seconds, 'Actual practice seconds', 0, 86400);
  const candidates = manualCompletionCandidates(local, zone);
  if (!candidates.length)
    throw new Error(
      `This completion time does not exist in ${zone} because the clock changes. Choose another time.`,
    );
  if (candidates.length > 1 && occurrence === undefined)
    throw new Error('This completion time occurs twice. Choose the earlier or later occurrence.');
  if (
    occurrence !== undefined &&
    (candidates.length !== 2 || (occurrence !== 0 && occurrence !== 1))
  )
    throw new Error('Choose an occurrence only for a repeated completion time.');
  const end = candidates[occurrence ?? 0];
  if (end > Date.now()) throw new Error('Completion time must be no later than now.');
  return {
    version: 1,
    source: 'user-entered',
    timezone: zone,
    completedLocal: local,
    ...(occurrence === undefined ? {} : { occurrence }),
    startedAt: new Date(end - seconds * 1000).toISOString(),
    completedAt: new Date(end).toISOString(),
  };
}
export function validateManualTiming(value: unknown, seconds: number, date: string): ManualTiming {
  const row = record(value, 'Manual timing', [
    'version',
    'source',
    'timezone',
    'completedLocal',
    'occurrence',
    'startedAt',
    'completedAt',
  ]);
  if (
    row.version !== 1 ||
    row.source !== 'user-entered' ||
    typeof row.timezone !== 'string' ||
    typeof row.completedLocal !== 'string'
  )
    throw new Error('Manual timing must capture its local completion time and timezone.');
  const timing = createManualTiming(
    row.completedLocal,
    row.timezone,
    seconds,
    row.occurrence as 0 | 1 | undefined,
  );
  if (
    row.startedAt !== timing.startedAt ||
    row.completedAt !== timing.completedAt ||
    date !== dateInTimezone(timing.startedAt, timing.timezone)
  )
    throw new Error(
      'Actual start, completion, duration and practiced date must agree in the captured timezone.',
    );
  return timing;
}
/** The external assignment owns measured time; only trainer metrics are user-entered. */
export function isExternalPracticeTimer(entry: Partial<PracticeSession>): boolean {
  const evidence = sessionEvidence(entry.metadata);
  return (
    entry.source === 'timer' &&
    entry.metadata?.practiceTool === 'external' &&
    evidence?.type === 'timed' &&
    !evidence.recordings.length &&
    !evidence.generatedListening
  );
}
export function validateManualSessionDetails(session: PracticeSession): void {
  const metadata = session.metadata;
  if (metadata?.externalResult === undefined && metadata?.manualTiming === undefined) return;
  const manualOnly =
    session.source === 'manual' &&
    !metadata?.copyAttempt &&
    !sessionEvidence(metadata) &&
    !session.evidenceMode &&
    !metadata?.historicalTiming &&
    metadata?.legacyAttempt === undefined &&
    metadata?.legacyLcwoRun === undefined;
  if (
    (metadata.externalResult !== undefined && !manualOnly && !isExternalPracticeTimer(session)) ||
    (metadata.manualTiming !== undefined && !manualOnly)
  )
    throw new Error(
      'Manual external results and timestamps cannot replace native or historical source measurements.',
    );
  if (metadata.externalResult !== undefined) {
    const result = validateExternalPractice(metadata.externalResult);
    if (result.trainer === 'morse-runner' && !manualOnly)
      throw new Error(
        'Use Log practice for a manually entered Runner run; this block retains its measured timer.',
      );
    if (
      session.characterWpm !== undefined ||
      session.effectiveWpm !== undefined ||
      session.accuracy !== undefined
    )
      throw new Error(
        'Use the external trainer fields instead of generic speed or accuracy for this result.',
      );
    if (
      result.trainer === 'morse-runner' &&
      (session.kind !== 'simulator' ||
        Math.abs(result.elapsedSeconds - session.minutes * 60) > 0.001)
    )
      throw new Error('Manual Runner requires simulator activity and its actual run duration.');
    if (session.kind === 'on-air')
      throw new Error('External trainer results are practice, not actual on-air contacts.');
    metadata.externalResult = result;
  }
  if (metadata.manualTiming !== undefined)
    metadata.manualTiming = validateManualTiming(
      metadata.manualTiming,
      session.minutes * 60,
      session.date,
    );
}
export function manualPracticeDetails(metadata?: PracticeSession['metadata']): string[] {
  const result = metadata?.externalResult;
  const timing = metadata?.manualTiming;
  if (!result && !timing) return [];
  const details: string[] = [];
  if (timing)
    details.push(
      `Actual practice start: ${timing.startedAt} · completion: ${timing.completedAt} · ${timing.timezone} (${timing.completedLocal}${timing.occurrence === undefined ? '' : timing.occurrence === 0 ? ', earlier occurrence' : ', later occurrence'}). Duration is user-entered; upload time is separate.`,
    );
  else details.push('Actual start and completion: unknown (not recorded).');
  if (result?.trainer === 'lcwo') {
    details.push(
      `${LCWO_KINDS[result.kind]} · user-entered external evidence, not native Copy measurements.`,
    );
    for (const key of LCWO_KIND_FIELDS[result.kind]) {
      const label =
        key === 'speedWpm'
          ? ['letters', 'figures', 'custom'].includes(result.kind)
            ? 'Actual effective speed (WPM)'
            : 'Actual trainer speed (WPM)'
          : LCWO_FIELDS[key];
      details.push(`${label}: ${result[key] ?? 'unknown (not recorded)'}`);
    }
  } else if (result?.trainer === 'morse-runner')
    details.push(
      `External Morse Runner · ${result.mode} · user-entered, not an acknowledged native engine result.`,
      `Actual run time: ${result.elapsedSeconds} seconds`,
      `Starting speed: ${result.startingWpm ?? 'unknown'} WPM · actual used speeds: ${result.usedWpms?.join(', ') ?? 'unknown'} (not a measured timeline)`,
      `Verified points: ${result.verifiedPoints ?? 'unknown'} · score: ${result.score ?? 'unknown'} · simulated contacts: ${result.contacts ?? 'unknown'}`,
    );
  return details;
}
