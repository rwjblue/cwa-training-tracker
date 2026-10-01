import { sessionEvidence } from '../shared/practice-evidence';
import { validatePracticeSession, type PracticeSession } from '../shared/training';
import { getDeviceScopeToken, requireCurrentDeviceScope } from './device-scope';
import { freezePracticeSaveOrigin, type PracticeSaveOrigin } from './practice-autosave';

export const RUNNER_RESULTS_EVENT = 'cwa:runner-results';
export const MAX_RUNNER_RESULTS = 100;
export class RunnerResultStorageError extends Error {}
type ResultStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export interface RunnerFinishedResult {
  version: 1;
  origin: PracticeSaveOrigin;
  entry: PracticeSession;
  /** The first submitted body is immutable even when its upload/receipt fails. */
  reviewed: boolean;
}
export const runnerResultsPrefix = (scope: string) =>
  `cwa:runner:result:v1:${encodeURIComponent(scope)}:`;
const prefix = runnerResultsPrefix;
export const runnerResultKey = (scope: string, id: string) =>
  prefix(scope) + encodeURIComponent(id);
export function runnerResultId(key: string, scope: string): string | undefined {
  if (!key.startsWith(prefix(scope))) return;
  try {
    const id = decodeURIComponent(key.slice(prefix(scope).length));
    if (/^runner:[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) && runnerResultKey(scope, id) === key)
      return id;
  } catch {
    /* Malformed names cannot select another account. */
  }
}

/** A terminal draft never participates in the uploader until the learner submits it. */
export function validateRunnerFinishedResult(value: unknown, scope: string): RunnerFinishedResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A retained Runner result must be an object.');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !['version', 'origin', 'entry', 'reviewed'].includes(key)) ||
    input.version !== 1 ||
    typeof input.reviewed !== 'boolean'
  )
    throw new Error('Unsupported retained Runner result.');
  const entry = validatePracticeSession(input.entry);
  const evidence = sessionEvidence(entry.metadata);
  if (evidence?.type !== 'runner' || !evidence.run.attribution || evidence.run.elapsedSeconds < 1)
    throw new Error('Retain only an acknowledged finished Runner result with its start timezone.');
  const origin = input.origin as PracticeSaveOrigin | undefined;
  if (
    !origin ||
    typeof origin !== 'object' ||
    Array.isArray(origin) ||
    Object.keys(origin).some((key) => !['id', 'accountId', 'generation'].includes(key)) ||
    origin.id !== entry.id ||
    origin.accountId !== scope ||
    (origin.generation !== undefined &&
      (!Number.isSafeInteger(origin.generation) || origin.generation < 0))
  )
    throw new Error('The retained Runner result belongs to a different account or dataset.');
  if (scope === 'guest' && origin.generation !== undefined)
    throw new Error('Guest Runner results cannot carry account authority.');
  if (input.reviewed && typeof entry.metadata?.runnerReviewedAt !== 'string')
    throw new Error('A submitted Runner result requires its retained review timestamp.');
  return { version: 1, origin: { ...origin }, entry, reviewed: input.reviewed };
}

export function readRunnerResults(
  scope: string,
  storage: ResultStorage = localStorage,
): {
  results: RunnerFinishedResult[];
  error: string;
} {
  const results: RunnerFinishedResult[] = [];
  let damaged = 0;
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix(scope))) continue;
      try {
        const id = runnerResultId(key, scope);
        const raw = storage.getItem(key);
        if (!id || !raw || raw.length > 300_000) throw new Error('Invalid retained result.');
        const result = validateRunnerFinishedResult(JSON.parse(raw), scope);
        if (result.entry.id !== id) throw new Error('Runner result identity changed.');
        results.push(result);
      } catch {
        damaged++;
      }
    }
  } catch {
    return {
      results,
      error:
        'This browser cannot read retained Runner results. Enable storage before reopening them.',
    };
  }
  return {
    results: results.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt)),
    error: damaged
      ? `${damaged} retained Runner result(s) could not be read. Their stored data remains on this device; keep a recovery file before clearing it.`
      : '',
  };
}
const changed = () => window.dispatchEvent(new CustomEvent(RUNNER_RESULTS_EVENT));
function write(scope: string, result: RunnerFinishedResult, token: string): RunnerFinishedResult {
  requireCurrentDeviceScope(scope, token);
  const checked = validateRunnerFinishedResult(result, scope);
  const raw = JSON.stringify(checked);
  if (raw.length > 300_000) throw new Error('The retained Runner result is too large.');
  try {
    localStorage.setItem(runnerResultKey(scope, checked.entry.id), raw);
    if (localStorage.getItem(runnerResultKey(scope, checked.entry.id)) !== raw)
      throw new Error('Result readback failed.');
  } catch {
    throw new RunnerResultStorageError(
      'This browser could not retain this finished Runner result. Keep this page open, enable storage or free space, then retry; you can also review and save online.',
    );
  }
  requireCurrentDeviceScope(scope, token);
  changed();
  return checked;
}
function retained(scope: string, id: string): RunnerFinishedResult | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(runnerResultKey(scope, id));
  } catch {
    throw new RunnerResultStorageError(
      'This browser cannot read retained Runner results. Keep this page open and enable storage, or save online.',
    );
  }
  if (raw === null) return;
  if (raw.length > 300_000) throw new Error('The retained Runner result is too large.');
  return validateRunnerFinishedResult(JSON.parse(raw), scope);
}
export function sameRunnerResultFacts(a: PracticeSession, b: PracticeSession): boolean {
  return (
    a.id === b.id &&
    a.createdAt === b.createdAt &&
    a.date === b.date &&
    a.metadata?.plannedTaskId === b.metadata?.plannedTaskId &&
    a.metadata?.practicePurpose === b.metadata?.practicePurpose &&
    JSON.stringify(sessionEvidence(a.metadata)) === JSON.stringify(sessionEvidence(b.metadata))
  );
}

export function retainFinishedRunnerResult(
  scope: string,
  entry: PracticeSession,
  origin: PracticeSaveOrigin,
  token = getDeviceScopeToken(scope),
): RunnerFinishedResult {
  requireCurrentDeviceScope(scope, token);
  const checked = validateRunnerFinishedResult(
    { version: 1, entry, origin, reviewed: false },
    scope,
  );
  const previous = retained(scope, entry.id);
  if (previous) {
    if (
      !sameRunnerResultFacts(previous.entry, checked.entry) ||
      JSON.stringify(previous.origin) !== JSON.stringify(origin)
    )
      throw new Error(
        'A different Runner result already uses this identity. Keep it before starting over.',
      );
    return previous;
  }
  const loaded = readRunnerResults(scope);
  if (loaded.error) throw new Error(loaded.error);
  if (loaded.results.length >= MAX_RUNNER_RESULTS)
    throw new Error(
      `Review, export or discard some of the ${MAX_RUNNER_RESULTS} retained Runner results before retaining another.`,
    );
  freezePracticeSaveOrigin(scope, entry.id, origin.generation, token);
  return write(scope, checked, token);
}

/** Canceling review retains edits; the first submit freezes them for exact retry. */
export function retainRunnerReview(
  scope: string,
  entry: PracticeSession,
  freeze: boolean,
  token = getDeviceScopeToken(scope),
): void {
  requireCurrentDeviceScope(scope, token);
  const previous = retained(scope, entry.id);
  if (!previous) return;
  const checked = validatePracticeSession(entry);
  if (!sameRunnerResultFacts(previous.entry, checked))
    throw new Error('Runner review cannot change the captured run facts.');
  if (previous.reviewed) {
    if (JSON.stringify(previous.entry) !== JSON.stringify(checked))
      throw new Error(
        'This Runner review has already been submitted. Retry its exact retained body.',
      );
    return;
  }
  write(scope, { ...previous, entry: checked, reviewed: freeze }, token);
}

export function clearRunnerResult(
  scope: string,
  id: string,
  token = getDeviceScopeToken(scope),
): void {
  requireCurrentDeviceScope(scope, token);
  try {
    localStorage.removeItem(runnerResultKey(scope, id));
    if (localStorage.getItem(runnerResultKey(scope, id)) !== null)
      throw new Error('Removal readback failed.');
  } catch {
    throw new Error(
      'This browser could not remove the retained Runner result. Free storage or enable browser storage, then retry.',
    );
  }
  changed();
}
