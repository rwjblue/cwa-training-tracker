/** Authenticated source facts; separate from user-entered results and native Copy. */
export const LCWO_EXPORT_TYPES = ['words', 'callsigns', 'groups', 'koch'] as const;
export type LcwoSourceType = (typeof LCWO_EXPORT_TYPES)[number];
export const MAX_LCWO_RESULTS = 10_000;
export interface LcwoIdentity {
  /** Canonical username returned by authenticated export headers, not typed input. */
  username: string;
  /** Unknown for an empty account until an authenticated row supplies its UID. */
  sourceUserId?: string;
}
export interface LcwoRun {
  version: 1;
  source: 'lcwo-export';
  id: string;
  kind: 'words' | 'callsign' | 'letters' | 'figures' | 'custom' | 'koch';
  sourceType: LcwoSourceType;
  sourceUserId: string;
  sourceResultId: string;
  /** Current authenticated exports retrieve MySQL TIMESTAMP columns in UTC. */
  recordedAt: string;
  sourceTime: string;
  maximumWpm?: number;
  score?: number;
  characterWpm?: number;
  effectiveWpm?: number;
  /** Retain the stored value; it is not the displayed error percentage. */
  accuracyPercent?: number;
  lesson?: number;
  competitive?: boolean;
}
export interface LcwoBackup {
  version: 1;
  identity: LcwoIdentity;
  /** Per completed group assumption, zero disables credit; never measured audio. */
  estimateSeconds: number;
  connected: false;
  syncedAt?: string;
  skippedMixed?: number;
  runs: LcwoRun[];
}
export type LcwoData = Omit<LcwoBackup, 'connected'> & { connected: boolean };

function object(value: unknown, label: string, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !keys.includes(key)))
    throw new Error(`${label} contains an unsupported field.`);
  return row;
}
export function lcwoSourceId(value: unknown): string {
  if (
    !['string', 'number'].includes(typeof value) ||
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^[1-9]\d{0,19}$/.test(String(value))
  )
    throw new Error('LCWO source identity must be a positive result/account ID.');
  return String(value);
}
function number(value: unknown, label: string, max: number, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? 'a whole number' : 'a number'} from 0 to ${max}.`,
    );
  return value;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('LCWO completion must be a valid UTC timestamp.');
  return value;
}
export function lcwoSourceTimestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    throw new Error('LCWO original timestamp is invalid.');
  return timestamp(`${value.replace(' ', 'T')}.000Z`);
}
export function validateLcwoIdentity(value: unknown): LcwoIdentity {
  const row = object(value, 'LCWO identity', ['username', 'sourceUserId']);
  if (typeof row.username !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(row.username))
    throw new Error('LCWO identity requires the verified canonical username.');
  return {
    username: row.username,
    ...(row.sourceUserId === undefined ? {} : { sourceUserId: lcwoSourceId(row.sourceUserId) }),
  };
}
/** Empty exports keep an established UID; first nonempty export can establish it. */
export function mergeLcwoIdentity(before: LcwoIdentity | undefined, incoming: LcwoIdentity) {
  const next = validateLcwoIdentity(incoming);
  if (!before) return next;
  const known = validateLcwoIdentity(before);
  if (
    known.username.toLowerCase() !== next.username.toLowerCase() ||
    (known.sourceUserId !== undefined &&
      next.sourceUserId !== undefined &&
      known.sourceUserId !== next.sourceUserId)
  )
    throw new Error(
      'This account retains a different LCWO identity. Export your data and use a separate Companion account, or explicitly reset before linking another identity.',
    );
  return {
    username: next.username,
    ...((known.sourceUserId ?? next.sourceUserId)
      ? { sourceUserId: known.sourceUserId ?? next.sourceUserId }
      : {}),
  };
}
const metricLimits = {
  // SQL stores zero defaults; preserve these source facts rather than inventing unknowns.
  maximumWpm: [20_000, true],
  score: [Number.MAX_SAFE_INTEGER, true],
  characterWpm: [20_000, false],
  effectiveWpm: [20_000, false],
  accuracyPercent: [100, false],
  lesson: [40, true],
} as const;
export function validateLcwoRun(value: unknown): LcwoRun {
  const row = object(value, 'LCWO result', [
    'version',
    'source',
    'id',
    'kind',
    'sourceType',
    'sourceUserId',
    'sourceResultId',
    'recordedAt',
    'sourceTime',
    'competitive',
    ...Object.keys(metricLimits),
  ]);
  if (
    row.version !== 1 ||
    row.source !== 'lcwo-export' ||
    !LCWO_EXPORT_TYPES.includes(row.sourceType as LcwoSourceType)
  )
    throw new Error('LCWO results require a supported versioned export source.');
  const sourceType = row.sourceType as LcwoSourceType;
  const kinds =
    sourceType === 'groups'
      ? ['letters', 'figures', 'custom']
      : [sourceType === 'callsigns' ? 'callsign' : sourceType];
  if (!kinds.includes(String(row.kind))) throw new Error('LCWO trainer and result kind disagree.');
  const sourceUserId = lcwoSourceId(row.sourceUserId);
  const sourceResultId = lcwoSourceId(row.sourceResultId);
  const id = `${sourceType}:${sourceUserId}:${sourceResultId}`;
  if (row.id !== id)
    throw new Error('LCWO result ID must match its trainer, account and source result.');
  const recordedAt = timestamp(row.recordedAt);
  if (recordedAt !== lcwoSourceTimestamp(row.sourceTime))
    throw new Error('LCWO original and UTC timestamps disagree.');
  const result: LcwoRun = {
    version: 1,
    source: 'lcwo-export',
    id,
    sourceType,
    kind: row.kind as LcwoRun['kind'],
    sourceUserId,
    sourceResultId,
    recordedAt,
    sourceTime: row.sourceTime as string,
  };
  const allowed =
    sourceType === 'words' || sourceType === 'callsigns'
      ? ['maximumWpm', 'score']
      : [
          'characterWpm',
          'effectiveWpm',
          'accuracyPercent',
          ...(sourceType === 'koch' ? ['lesson'] : []),
        ];
  for (const key of Object.keys(metricLimits) as (keyof typeof metricLimits)[]) {
    if (row[key] === undefined) continue;
    if (!allowed.includes(key)) throw new Error(`${key} does not belong to this LCWO trainer.`);
    const [maximum, integer] = metricLimits[key];
    result[key] = number(row[key], `LCWO ${key}`, maximum, integer);
  }
  if (row.competitive !== undefined) {
    if (typeof row.competitive !== 'boolean' || sourceType === 'koch')
      throw new Error('LCWO competitive status must be a boolean for a competitive trainer.');
    result.competitive = row.competitive;
  }
  return result;
}
export function mergeLcwoRuns(before: readonly LcwoRun[], incoming: readonly LcwoRun[]) {
  const known = new Map<string, LcwoRun>();
  for (const value of [...before, ...incoming]) {
    const run = validateLcwoRun(value);
    const old = known.get(run.id);
    if (old && JSON.stringify(old) !== JSON.stringify(run))
      throw new Error(
        'Conflicting LCWO measurements use the same source result ID. Retained results are unchanged.',
      );
    known.set(run.id, run);
  }
  if (known.size > MAX_LCWO_RESULTS)
    throw new Error(`Retain up to ${MAX_LCWO_RESULTS} LCWO results per account.`);
  return [...known.values()].sort(
    (a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id),
  );
}
export function validateLcwoBackup(value: unknown): LcwoBackup {
  const row = object(value, 'LCWO backup', [
    'version',
    'identity',
    'estimateSeconds',
    'connected',
    'syncedAt',
    'skippedMixed',
    'runs',
  ]);
  if (
    row.version !== 1 ||
    row.connected !== false ||
    !Array.isArray(row.runs) ||
    row.runs.length > MAX_LCWO_RESULTS
  )
    throw new Error('LCWO backup must be version 1, disconnected and within the result limit.');
  const identity = validateLcwoIdentity(row.identity);
  const runs = mergeLcwoRuns([], row.runs);
  if (runs.length !== row.runs.length)
    throw new Error('LCWO backup contains duplicate source results.');
  if (runs.some((run) => run.sourceUserId !== identity.sourceUserId))
    throw new Error('LCWO result account does not match its retained identity.');
  const result: LcwoBackup = {
    version: 1,
    identity,
    connected: false,
    estimateSeconds: number(row.estimateSeconds, 'Group estimate seconds', 300, true),
    runs,
  };
  if (row.syncedAt !== undefined) {
    // Refresh precision is milliseconds, independently of the source's second precision.
    if (
      typeof row.syncedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.syncedAt) ||
      !Number.isFinite(Date.parse(row.syncedAt)) ||
      new Date(row.syncedAt).toISOString() !== row.syncedAt
    )
      throw new Error('LCWO last successful refresh is invalid.');
    result.syncedAt = row.syncedAt;
  }
  if (row.skippedMixed !== undefined)
    result.skippedMixed = number(row.skippedMixed, 'Unsupported mixed-group count', 50_000, true);
  return result;
}
export const LCWO_RUN_LABELS: Record<LcwoRun['kind'], string> = {
  words: 'LCWO words',
  callsign: 'LCWO callsigns',
  letters: 'LCWO letter groups',
  figures: 'LCWO figure groups',
  custom: 'LCWO custom groups',
  koch: 'LCWO Koch lessons',
};
export function lcwoRunDetails(run: LcwoRun): string[] {
  const facts = [
    `${LCWO_RUN_LABELS[run.kind]} · authenticated external export, separate from native Copy and user-entered results.`,
    `Source account ${run.sourceUserId} · result ${run.sourceResultId} · original timestamp ${run.sourceTime} (UTC export) · completed ${run.recordedAt}.`,
  ];
  const fields =
    run.sourceType === 'words' || run.sourceType === 'callsigns'
      ? [
          ['maximumWpm', 'Maximum achieved speed (WPM)'],
          ['score', 'Trainer score'],
        ]
      : [
          ['characterWpm', 'Character speed (WPM)'],
          ['effectiveWpm', 'Effective speed (WPM)'],
          ['accuracyPercent', 'Stored accuracy (%) — not displayed errors'],
          ...(run.sourceType === 'koch' ? [['lesson', 'Koch lesson']] : []),
        ];
  for (const [key, label] of fields)
    facts.push(`${label}: ${run[key as keyof LcwoRun] ?? 'unknown (not recorded)'}`);
  facts.push(
    `Competitive result: ${run.competitive === undefined ? 'unknown (not recorded)' : run.competitive ? 'yes' : 'no'}`,
  );
  facts.push(
    'Actual run duration: unknown; any group contribution is an explicit estimate, never measured listening.',
  );
  return facts;
}
