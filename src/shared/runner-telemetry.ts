/** Bounded client observations, separate from the engine's contact verification. */
export interface RunnerResponseDelay {
  count: number;
  totalSeconds: number;
  maxSeconds: number;
}

export type RunnerTelemetryEvent =
  | ({
      kind: 'send';
      elapsedSeconds: number;
      phase: 'call' | 'exchange';
    } & (
      | { action: 'call'; call?: string }
      | { action: 'question' | 'exchange' | 'cq' | 'tu' | 'other'; call?: never }
    ))
  | {
      kind: 'receive';
      elapsedSeconds: number;
      stationId: number;
      call: string;
      part: 'call' | 'exchange' | 'other';
      startSeconds: number;
    };

export interface RunnerTelemetry {
  version: 1;
  incomplete: boolean;
  events: RunnerTelemetryEvent[];
  eventCount: number;
  droppedEventCount: number;
  questionMarkCount: number;
  callSendCount: number;
  callRepeatRequestCount: number;
  exchangeRepeatRequestCount: number;
  repeatedCallSendCount: number;
  receivedCallCount: number;
  receivedExchangeCount: number;
  repeatedReceiveCount: number;
  responseDelay: RunnerResponseDelay;
  callResponseDelay: RunnerResponseDelay;
  overlappingResponseCount: number;
  unmatchedCallResponseCount: number;
}

export const RUNNER_MAX_TELEMETRY_EVENTS = 256;
const MAX_COUNT = 1_000_000;
const telemetryKeys = [
  'version',
  'incomplete',
  'events',
  'eventCount',
  'droppedEventCount',
  'questionMarkCount',
  'callSendCount',
  'callRepeatRequestCount',
  'exchangeRepeatRequestCount',
  'repeatedCallSendCount',
  'receivedCallCount',
  'receivedExchangeCount',
  'repeatedReceiveCount',
  'responseDelay',
  'callResponseDelay',
  'overlappingResponseCount',
  'unmatchedCallResponseCount',
];
const countKeys = [
  'eventCount',
  'droppedEventCount',
  'questionMarkCount',
  'callSendCount',
  'callRepeatRequestCount',
  'exchangeRepeatRequestCount',
  'repeatedCallSendCount',
  'receivedCallCount',
  'receivedExchangeCount',
  'repeatedReceiveCount',
  'overlappingResponseCount',
  'unmatchedCallResponseCount',
] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const finite = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const count = (value: unknown): value is number =>
  finite(value, MAX_COUNT) && Number.isSafeInteger(value);
const call = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z0-9/]{1,32}$/.test(value);

function isDelay(
  value: unknown,
  elapsedSeconds: number,
  callSendCount: number,
): value is RunnerResponseDelay {
  if (
    !record(value) ||
    !exactKeys(value, ['count', 'totalSeconds', 'maxSeconds']) ||
    !count(value.count) ||
    value.count > callSendCount ||
    !finite(value.totalSeconds, elapsedSeconds * value.count) ||
    !finite(value.maxSeconds, elapsedSeconds) ||
    value.maxSeconds > value.totalSeconds ||
    value.totalSeconds > value.maxSeconds * value.count + 0.000001
  )
    return false;
  // A matched response can overlap reception and therefore have zero idle time.
  return value.count > 0 || (value.totalSeconds === 0 && value.maxSeconds === 0);
}

function isEvent(value: unknown, elapsedSeconds: number): value is RunnerTelemetryEvent {
  if (!record(value) || !finite(value.elapsedSeconds, elapsedSeconds)) return false;
  if (value.kind === 'send')
    return (
      exactKeys(value, [
        'kind',
        'elapsedSeconds',
        'action',
        'phase',
        ...(Object.hasOwn(value, 'call') ? ['call'] : []),
      ]) &&
      typeof value.action === 'string' &&
      ['question', 'call', 'exchange', 'cq', 'tu', 'other'].includes(value.action) &&
      (value.phase === 'call' || value.phase === 'exchange') &&
      (!Object.hasOwn(value, 'call') ||
        (value.action === 'call' &&
          typeof value.call === 'string' &&
          /^[A-Z0-9/?]{1,32}$/.test(value.call)))
    );
  return (
    value.kind === 'receive' &&
    exactKeys(value, ['kind', 'elapsedSeconds', 'stationId', 'call', 'part', 'startSeconds']) &&
    count(value.stationId) &&
    value.stationId >= 1 &&
    call(value.call) &&
    (value.part === 'call' || value.part === 'exchange' || value.part === 'other') &&
    finite(value.startSeconds, value.elapsedSeconds)
  );
}

/** Validate both bridge messages and saved evidence against the acknowledged engine duration. */
export function isRunnerTelemetry(
  value: unknown,
  elapsedSeconds: number,
): value is RunnerTelemetry {
  if (
    !record(value) ||
    !exactKeys(value, telemetryKeys) ||
    value.version !== 1 ||
    typeof value.incomplete !== 'boolean' ||
    !finite(elapsedSeconds, 6_000) ||
    !countKeys.every((key) => count(value[key])) ||
    !Array.isArray(value.events) ||
    value.events.length > RUNNER_MAX_TELEMETRY_EVENTS ||
    value.droppedEventCount !== (value.eventCount as number) - value.events.length ||
    !value.events.every((event) => isEvent(event, elapsedSeconds)) ||
    value.events.some(
      (event, index, all) => index > 0 && event.elapsedSeconds < all[index - 1].elapsedSeconds,
    )
  )
    return false;
  const callSendCount = value.callSendCount as number;
  if (
    callSendCount > (value.eventCount as number) ||
    (value.questionMarkCount as number) >
      (value.callRepeatRequestCount as number) + (value.exchangeRepeatRequestCount as number) ||
    (value.callRepeatRequestCount as number) + (value.exchangeRepeatRequestCount as number) >
      (value.eventCount as number) ||
    (value.receivedCallCount as number) + (value.receivedExchangeCount as number) >
      (value.eventCount as number) ||
    (value.repeatedReceiveCount as number) > (value.eventCount as number) ||
    (value.repeatedCallSendCount as number) > callSendCount ||
    (value.overlappingResponseCount as number) > callSendCount ||
    (value.unmatchedCallResponseCount as number) > callSendCount ||
    !isDelay(value.responseDelay, elapsedSeconds, callSendCount) ||
    !isDelay(value.callResponseDelay, elapsedSeconds, callSendCount) ||
    value.callResponseDelay.count > value.responseDelay.count ||
    value.responseDelay.count + (value.unmatchedCallResponseCount as number) !== callSendCount ||
    (value.overlappingResponseCount as number) > value.responseDelay.count
  )
    return false;
  return true;
}

export function runnerTelemetryDetails(telemetry: RunnerTelemetry): string[] {
  const delay = (label: string, value: RunnerResponseDelay) =>
    value.count
      ? `${label}: ${(value.totalSeconds / value.count).toFixed(2)}s average, ${value.totalSeconds.toFixed(2)}s total, ${value.maxSeconds.toFixed(2)}s maximum across ${value.count} matched call sends.`
      : `${label}: no matched call sends measured.`;
  return [
    ...(telemetry.incomplete
      ? ['Runner diagnostics are incomplete; counts and timings cover only captured observations.']
      : []),
    `Question marks: ${telemetry.questionMarkCount}; Repeat requests before a call send: ${telemetry.callRepeatRequestCount}; Repeat requests after a call send: ${telemetry.exchangeRepeatRequestCount}.`,
    `Call sends: ${telemetry.callSendCount}; Extra call sends: ${telemetry.repeatedCallSendCount}.`,
    `Caller transmissions with callsigns: ${telemetry.receivedCallCount}; Caller exchanges: ${telemetry.receivedExchangeCount}; Repeated caller transmissions: ${telemetry.repeatedReceiveCount}. Repeats within one transmission are not counted separately.`,
    delay('Call response delay', telemetry.callResponseDelay),
    delay('Response delay', telemetry.responseDelay),
    `Delays measure the first call send after each caller transmission. ${telemetry.overlappingResponseCount} timed sends overlapped the caller; ${telemetry.unmatchedCallResponseCount} sends had no new, unambiguous caller transmission to time. Overlaps have zero gap. Local sending can mask callers; device latency is not removed. Gap totals describe these responses, not total wasted time or recognition versus typing. Request counts do not prove which information was missed. Question-mark counts cover standalone ? requests; partial calls are retained in the event history.`,
    `Retained ${telemetry.events.length} of ${telemetry.eventCount} observed send/receive events${telemetry.droppedEventCount ? `; ${telemetry.droppedEventCount} earlier events omitted from the bounded timeline` : ''}. Aggregate counts include omitted events.`,
  ];
}
