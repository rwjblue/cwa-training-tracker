import type { PracticeExercise } from './plan';

export const RUNNER_CHANNEL = 'cw-training-runner';
export const RUNNER_PROTOCOL_VERSION = 2;
export const RUNNER_MAX_SECONDS = 6_000;
export const RUNNER_FRAME_URL = '/vendor/web-morse-runner/index.html';
export const RUNNER_REVISION = '847e9089ef379a065d1cf6807c09f0724bbe072e';
const MAX_SPEED_HISTORY = 256;

export interface RunnerSettings {
  mode: 'SingleCall' | 'WPX';
  wpm: number;
  durationSeconds: number;
  activity: number;
  conditions: { qrm: boolean; qrn: boolean; qsb: boolean; flutter: boolean; lids: boolean };
}

export interface RunnerSummary {
  qsoCount: number;
  verifiedPoints: number;
  /** Verified score, not the unverified/raw score. */
  score: number;
  nrErrors: number;
  nilErrors: number;
}

export type RunnerErrorCode = 'configuration' | 'audio' | 'engine' | 'interrupted';

interface RunnerEnvelope {
  channel: typeof RUNNER_CHANNEL;
  version: typeof RUNNER_PROTOCOL_VERSION;
  runId: string;
}

export type RunnerCommand = RunnerEnvelope &
  ({ type: 'configure'; settings: RunnerSettings } | { type: 'stop' });

interface RunnerEventEnvelope extends RunnerEnvelope {
  sequence: number;
  /** Audio-engine time since this run started; never parent wall-clock time. */
  elapsedSeconds: number;
}

export type RunnerEvent = RunnerEventEnvelope &
  (
    | { type: 'ready' | 'progress' }
    | { type: 'started'; settings: RunnerSettings }
    | { type: 'speed'; wpm: number }
    | { type: 'results'; reason: 'completed' | 'stopped'; summary: RunnerSummary }
    | { type: 'error'; code: RunnerErrorCode }
  );

export interface RunnerRunState {
  runId: string;
  /** Defaults until Run; then a snapshot of the settings actually used to start. */
  settings: RunnerSettings;
  status: 'loading' | 'ready' | 'running' | 'completed' | 'stopped' | 'error';
  lastSequence: number;
  elapsedSeconds: number;
  /** Audio-engine timestamps, including the starting speed at zero. Optional for older saved blocks. */
  speedHistory?: { elapsedSeconds: number; wpm: number }[];
  /** Includes changes omitted from the bounded recent history. */
  speedChangeCount?: number;
  summary?: RunnerSummary;
  errorCode?: RunnerErrorCode;
  /** Parent receipt time of the engine's accepted start/terminal event, separate from practice block/save dates. */
  runStartedAt?: string;
  runEndedAt?: string;
}

const conditionKeys = ['qrm', 'qrn', 'qsb', 'flutter', 'lids'];
const eventKeys = ['channel', 'version', 'runId', 'type', 'sequence', 'elapsedSeconds'];
const errorCodes = new Set(['configuration', 'audio', 'engine', 'interrupted']);
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number =>
  finite(value, min, max) && Number.isSafeInteger(value);
const validRunId = (value: unknown): value is string =>
  typeof value === 'string' && runIdPattern.test(value);

export function isRunnerSettings(value: unknown): value is RunnerSettings {
  return (
    record(value) &&
    exactKeys(value, ['mode', 'wpm', 'durationSeconds', 'activity', 'conditions']) &&
    (value.mode === 'SingleCall' || value.mode === 'WPX') &&
    integer(value.wpm, 10, 60) &&
    integer(value.durationSeconds, 60, RUNNER_MAX_SECONDS) &&
    integer(value.activity, 1, 9) &&
    record(value.conditions) &&
    exactKeys(value.conditions, conditionKeys) &&
    conditionKeys.every(
      (key) => typeof (value.conditions as Record<string, unknown>)[key] === 'boolean',
    )
  );
}

/** A typed recipe selects the engine; task titles and private notes never do. */
export function runnerSettings(exercise: PracticeExercise | undefined): RunnerSettings | undefined {
  if (exercise?.type !== 'morse-runner' || !isRunnerSettings(exercise.settings)) return undefined;
  return { ...exercise.settings, conditions: { ...exercise.settings.conditions } };
}

export function createRunnerRun(runId: string, settings: RunnerSettings): RunnerRunState {
  if (!validRunId(runId) || !isRunnerSettings(settings))
    throw new TypeError('Invalid runner configuration');
  return {
    runId,
    settings: { ...settings, conditions: { ...settings.conditions } },
    status: 'loading',
    lastSequence: -1,
    elapsedSeconds: 0,
  };
}

export function runnerConfigureCommand(state: RunnerRunState): RunnerCommand {
  return {
    channel: RUNNER_CHANNEL,
    version: RUNNER_PROTOCOL_VERSION,
    type: 'configure',
    runId: state.runId,
    settings: { ...state.settings, conditions: { ...state.settings.conditions } },
  };
}

export function runnerStopCommand(state: RunnerRunState): RunnerCommand {
  return {
    channel: RUNNER_CHANNEL,
    version: RUNNER_PROTOCOL_VERSION,
    type: 'stop',
    runId: state.runId,
  };
}

export function isRunnerSummary(value: unknown): value is RunnerSummary {
  return (
    record(value) &&
    exactKeys(value, ['qsoCount', 'verifiedPoints', 'score', 'nrErrors', 'nilErrors']) &&
    integer(value.qsoCount, 0, 100_000) &&
    integer(value.verifiedPoints, 0, value.qsoCount) &&
    integer(value.score, 0, 10_000_000_000) &&
    integer(value.nrErrors, 0, value.qsoCount) &&
    integer(value.nilErrors, 0, value.qsoCount) &&
    value.nrErrors + value.nilErrors <= value.qsoCount
  );
}

/** Validate message data only. The caller MUST first check iframe source and origin. */
export function parseRunnerEvent(value: unknown): RunnerEvent | undefined {
  if (
    !record(value) ||
    value.channel !== RUNNER_CHANNEL ||
    value.version !== RUNNER_PROTOCOL_VERSION ||
    !validRunId(value.runId) ||
    !integer(value.sequence, 0, 1_000_000) ||
    !finite(value.elapsedSeconds, 0, RUNNER_MAX_SECONDS)
  )
    return undefined;
  const base = {
    channel: RUNNER_CHANNEL,
    version: RUNNER_PROTOCOL_VERSION,
    runId: value.runId,
    sequence: value.sequence,
    elapsedSeconds: value.elapsedSeconds,
  } as const;
  if ((value.type === 'ready' || value.type === 'progress') && exactKeys(value, eventKeys))
    return { ...base, type: value.type };
  if (
    value.type === 'started' &&
    exactKeys(value, [...eventKeys, 'settings']) &&
    isRunnerSettings(value.settings)
  ) {
    return {
      ...base,
      type: 'started',
      settings: { ...value.settings, conditions: { ...value.settings.conditions } },
    };
  }
  if (
    value.type === 'speed' &&
    exactKeys(value, [...eventKeys, 'wpm']) &&
    integer(value.wpm, 10, 60)
  ) {
    return { ...base, type: 'speed', wpm: value.wpm };
  }
  if (
    value.type === 'results' &&
    exactKeys(value, [...eventKeys, 'reason', 'summary']) &&
    (value.reason === 'completed' || value.reason === 'stopped') &&
    isRunnerSummary(value.summary)
  ) {
    return { ...base, type: 'results', reason: value.reason, summary: { ...value.summary } };
  }
  if (
    value.type === 'error' &&
    exactKeys(value, [...eventKeys, 'code']) &&
    typeof value.code === 'string' &&
    errorCodes.has(value.code)
  ) {
    return { ...base, type: 'error', code: value.code as RunnerErrorCode };
  }
  return undefined;
}

/** One run only: duplicate/reordered messages and restarts cannot add practice time. */
export function reduceRunnerEvent(
  state: RunnerRunState,
  value: unknown,
  receivedAt?: string,
): RunnerRunState {
  const event = parseRunnerEvent(value);
  if (
    !event ||
    event.runId !== state.runId ||
    event.sequence <= state.lastSequence ||
    event.elapsedSeconds < state.elapsedSeconds ||
    event.elapsedSeconds > state.settings.durationSeconds ||
    ['completed', 'stopped', 'error'].includes(state.status)
  )
    return state;
  const next = { ...state, lastSequence: event.sequence, elapsedSeconds: event.elapsedSeconds };
  const receivedTime = typeof receivedAt === 'string' ? Date.parse(receivedAt) : NaN;
  const timestamp =
    Number.isFinite(receivedTime) && new Date(receivedTime).toISOString() === receivedAt
      ? receivedAt
      : undefined;
  const terminalTime =
    state.status === 'running' &&
    timestamp &&
    (!state.runStartedAt || receivedTime >= Date.parse(state.runStartedAt))
      ? timestamp
      : undefined;
  if (event.type === 'ready') {
    return state.status === 'loading' && event.sequence === 0 && event.elapsedSeconds === 0
      ? { ...next, status: 'ready' }
      : state;
  }
  if (event.type === 'started') {
    return state.status === 'ready' && event.elapsedSeconds === 0
      ? {
          ...next,
          status: 'running',
          settings: event.settings,
          speedHistory: [{ elapsedSeconds: 0, wpm: event.settings.wpm }],
          ...(timestamp ? { runStartedAt: timestamp } : {}),
        }
      : state;
  }
  if (event.type === 'progress') return state.status === 'running' ? next : state;
  if (event.type === 'speed') {
    if (state.status !== 'running') return state;
    const history = state.speedHistory ?? [{ elapsedSeconds: 0, wpm: state.settings.wpm }];
    if (history.at(-1)?.wpm === event.wpm) return { ...next, speedHistory: history };
    const recent = [...history, { elapsedSeconds: event.elapsedSeconds, wpm: event.wpm }];
    return {
      ...next,
      speedHistory:
        recent.length <= MAX_SPEED_HISTORY
          ? recent
          : [recent[0], ...recent.slice(1 - MAX_SPEED_HISTORY)],
      speedChangeCount: (state.speedChangeCount ?? history.length - 1) + 1,
    };
  }
  if (event.type === 'results') {
    if (
      state.status !== 'running' &&
      !(state.status === 'ready' && event.reason === 'stopped' && event.elapsedSeconds === 0)
    )
      return state;
    return {
      ...next,
      // Completion here describes the chosen run, not the original assignment.
      status:
        event.reason === 'completed' && event.elapsedSeconds === state.settings.durationSeconds
          ? 'completed'
          : 'stopped',
      summary: event.summary,
      ...(terminalTime ? { runEndedAt: terminalTime } : {}),
    };
  }
  if (event.type === 'error' && (state.status === 'running' || event.elapsedSeconds === 0)) {
    return {
      ...next,
      status: 'error',
      errorCode: event.code,
      ...(terminalTime ? { runEndedAt: terminalTime } : {}),
    };
  }
  return state;
}

export function runnerResultNote(state: RunnerRunState): string | undefined {
  if (!['completed', 'stopped', 'error'].includes(state.status)) return undefined;
  const status =
    state.status === 'completed'
      ? 'completed'
      : state.status === 'stopped'
        ? 'stopped (partial)'
        : state.errorCode === 'interrupted'
          ? 'interrupted (partial)'
          : `${state.errorCode ?? 'engine'} error (partial)`;
  const { mode, wpm, durationSeconds, activity, conditions } = state.settings;
  const enabled = Object.entries(conditions)
    .filter(([, on]) => on)
    .map(([name]) => name.toUpperCase());
  const parts = [
    `Web Morse Runner: ${status}`,
    `${Math.floor(state.elapsedSeconds)} seconds`,
    mode === 'WPX' ? 'WPX Contest' : 'Single Call',
    `${wpm} WPM starting speed`,
    `run duration ${durationSeconds} seconds`,
    ...(mode === 'WPX' ? [`Activity ${activity}`] : []),
    enabled.length ? `band conditions ${enabled.join(', ')}` : 'band conditions off',
  ];
  const changes = state.speedHistory?.slice(1) ?? [];
  if (changes.length) {
    const timestamp = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const describe = (change: { elapsedSeconds: number; wpm: number }) =>
      `${change.wpm} WPM at ${timestamp(change.elapsedSeconds)}`;
    // Keep automatic notes bounded even after a long run with many adjustments.
    // The run state retains the starting speed and a bounded recent history.
    const details =
      changes.length <= 24
        ? changes.map(describe)
        : [
            ...changes.slice(0, 12).map(describe),
            `${changes.length - 24} other changes`,
            ...changes.slice(-12).map(describe),
          ];
    const speeds = state.speedHistory!.map((change) => change.wpm);
    parts.push(`speed changes: ${details.join(', ')}`);
    const omitted = (state.speedChangeCount ?? changes.length) - changes.length;
    if (omitted > 0) parts.push(`${omitted} earlier speed changes omitted`);
    if (changes.length > 24)
      parts.push(`WPM used: ${[...new Set(speeds)].sort((a, b) => a - b).join(', ')}`);
  }
  if (state.summary) {
    const { qsoCount, verifiedPoints, score, nrErrors, nilErrors } = state.summary;
    parts.push(
      `${qsoCount} QSOs`,
      `Verified Pts ${verifiedPoints}`,
      `verified score ${score}`,
      `NR ${nrErrors}`,
      `NIL ${nilErrors}`,
    );
  } else parts.push('results unavailable');
  return `${parts.join('; ')}.`;
}
