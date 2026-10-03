import { dateInTimezone, type PracticeSession } from './training.ts';
import type { LcwoBackup, LcwoRun } from './lcwo.ts';

type GroupKind = 'letters' | 'figures' | 'custom';
const groups = new Set(['letters', 'figures', 'custom']);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export type LcwoEstimateReason =
  | 'disabled'
  | 'duration-unknown'
  | 'historical-result'
  | 'logged-block'
  | 'block-time-unknown'
  | 'future-source'
  | 'estimate';
export interface LcwoContribution {
  run: LcwoRun;
  date: string;
  additionalSeconds: number;
  reason: LcwoEstimateReason;
  coveredBy?: string;
}
function interval(start: unknown, end: unknown): { start: number; end: number } | undefined {
  if (typeof start !== 'string' || typeof end !== 'string') return;
  const from = Date.parse(start),
    through = Date.parse(end);
  if (Number.isFinite(from) && Number.isFinite(through) && from <= through)
    return { start: from, end: through };
}
function coverage(entry: PracticeSession) {
  if (
    entry.context === 'class' ||
    entry.minutes <= 0 ||
    entry.metadata?.legacyLcwoRun ||
    isLcwoEstimate(entry)
  )
    return;
  const metadata = entry.metadata ?? {};
  const external = metadata.externalResult;
  const legacy = record(metadata.legacyAttempt);
  const legacyResult = record(legacy.lcwoResult);
  const legacyTask = record(metadata.legacyTask);
  const copy = metadata.copyAttempt;
  const wholeLegacy = legacy.taskId === 'other:icr' || legacyTask.kind === 'icr';
  if (external && (external.trainer !== 'lcwo' || !groups.has(external.kind))) return;
  if (copy && copy.recipe.mode !== 'groups') return;
  const family =
    external?.trainer === 'lcwo' && entry.source === 'manual'
      ? (external.kind as GroupKind)
      : !wholeLegacy && groups.has(String(legacyResult.kind))
        ? (legacyResult.kind as GroupKind)
        : undefined;
  if (entry.kind !== 'icr' && !family && !wholeLegacy) return;
  const timing = metadata.manualTiming;
  let observed = timing ? interval(timing.startedAt, timing.completedAt) : undefined;
  if (!observed && legacy.startedAt !== undefined)
    observed = interval(legacy.startedAt, legacy.endedAt);
  if (!observed && copy) observed = interval(copy.createdAt, copy.updatedAt);
  // Upload/review creation is not a completion timestamp. Never subtract minutes
  // from createdAt to manufacture an interval for an older manual/native timer.
  return { id: entry.id, date: entry.date, family, observed };
}
/** Recompute against all saved blocks, including blocks crossing the report window. */
export function lcwoContributions(
  data: Pick<LcwoBackup, 'runs' | 'estimateSeconds'> | null | undefined,
  entries: readonly PracticeSession[],
  timezone: string,
  now = Date.now(),
): LcwoContribution[] {
  if (!data) return [];
  const historic = new Set(
    entries.flatMap((entry) => {
      const run = record(entry.metadata?.legacyLcwoRun);
      return typeof run.id === 'string' ? [run.id] : [];
    }),
  );
  const blocks = [...new Map(entries.map((entry) => [entry.id, entry])).values()].flatMap(
    (entry) => {
      const block = coverage(entry);
      return block ? [block] : [];
    },
  );
  return [...new Map(data.runs.map((run) => [run.id, run])).values()].map((run) => {
    const date = dateInTimezone(run.recordedAt, timezone);
    const row: LcwoContribution = { run, date, additionalSeconds: 0, reason: 'duration-unknown' };
    if (run.sourceType !== 'groups' || !groups.has(run.kind)) return row;
    if (!data.estimateSeconds) return { ...row, reason: 'disabled' };
    if (historic.has(run.id)) return { ...row, reason: 'historical-result' };
    const completed = Date.parse(run.recordedAt);
    if (completed > now) return { ...row, reason: 'future-source' };
    const known = blocks.find(
      (block) =>
        (!block.family || block.family === run.kind) &&
        block.observed &&
        completed >= block.observed.start &&
        completed <= block.observed.end,
    );
    if (known) return { ...row, reason: 'logged-block', coveredBy: known.id };
    // A date-only ICR block cannot prove an exact overlap. Conservatively withhold
    // this extra estimate and explain uncertainty instead of double-crediting it.
    const uncertain = blocks.find(
      (block) =>
        !block.observed && block.date === date && (!block.family || block.family === run.kind),
    );
    if (uncertain) return { ...row, reason: 'block-time-unknown', coveredBy: uncertain.id };
    return { ...row, reason: 'estimate', additionalSeconds: data.estimateSeconds };
  });
}
export function lcwoContributionDetails(row: LcwoContribution, assumptionSeconds: number) {
  const reasons: Record<LcwoEstimateReason, string> = {
    disabled: 'Additional group time is disabled.',
    'duration-unknown': 'Duration is unknown; no time is guessed for this trainer.',
    'historical-result':
      'This source result already has retained historical practice; no extra credit.',
    'logged-block': 'Completion falls within a matching logged block; no extra credit.',
    'block-time-unknown':
      'Additional estimate withheld: a matching same-day block has unknown actual timestamps.',
    'future-source': 'Source timestamp is in the future; no additional estimate.',
    estimate: `Estimated ${assumptionSeconds} seconds for one completed code-group result. This is your explicit per-result assumption, not measured audio or an actual duration.`,
  };
  return reasons[row.reason] + (row.coveredBy ? ` Practice record: ${row.coveredBy}.` : '');
}
interface ComputedEstimate {
  version: 1;
  source: 'computed-lcwo-estimate';
  run: LcwoRun;
  assumptionSeconds: number;
}
/** Read-only projections for totals/reports; never returned by the practice API. */
export function estimatedLcwoSessions(
  contributions: readonly LcwoContribution[],
): PracticeSession[] {
  return contributions
    .filter((row) => row.additionalSeconds > 0)
    .map((row) => ({
      id: `lcwo-estimate:${row.run.id}`,
      date: row.date,
      kind: 'icr',
      minutes: row.additionalSeconds / 60,
      source: 'legacy',
      sourceId: row.run.id,
      context: 'practice',
      createdAt: row.run.recordedAt,
      notes: lcwoContributionDetails(row, row.additionalSeconds),
      metadata: {
        lcwoEstimate: {
          version: 1,
          source: 'computed-lcwo-estimate',
          run: row.run,
          assumptionSeconds: row.additionalSeconds,
        } satisfies ComputedEstimate,
      },
    }));
}
export function isLcwoEstimate(
  entry: Pick<PracticeSession, 'id' | 'source' | 'metadata'>,
): entry is PracticeSession & { metadata: { lcwoEstimate: ComputedEstimate } } {
  const row = record(entry.metadata?.lcwoEstimate);
  return (
    entry.source === 'legacy' &&
    row.version === 1 &&
    row.source === 'computed-lcwo-estimate' &&
    entry.id === `lcwo-estimate:${record(row.run).id}`
  );
}
