import { describe, expect, it } from 'vitest';
import { isRunnerTelemetry } from './runner-telemetry';
import {
  createRunnerRun,
  reduceRunnerEvent,
  RUNNER_CHANNEL,
  RUNNER_PROTOCOL_VERSION,
} from './runner';

const adapter = '../../public/vendor/web-morse-runner/integration/telemetry.js';
const { createRunnerTelemetry } = await import(adapter);
const receive = (stationId = 1, call = 'K1TEST', part = 'call', startTime = 11, endTime = 14) => ({
  stationId,
  call,
  part,
  startTime,
  endTime,
});

describe('private Runner diagnostic collection', () => {
  it('counts commands and native repeats and measures idle gaps and overlap on the audio clock', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.receive('cwa_receive_start', receive(), 10);
    telemetry.receive('cwa_receive', receive(), 10);
    telemetry.send({ type: 'send_msg', data: 'Qm' }, 4.5);
    telemetry.receive('cwa_receive_start', receive(1, 'K1TEST', 'call', 15, 18), 10);
    telemetry.receive('cwa_receive', receive(1, 'K1TEST', 'call', 15, 18), 10);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 8.75);
    telemetry.send({ type: 'send_msg', data: 'NR' }, 8.75);
    telemetry.receive('cwa_receive_start', receive(1, 'K1TEST', 'exchange', 21, 24), 10);
    telemetry.send({ type: 'send_msg', data: 'Qm' }, 12);
    // The learner sends his call before the current exchange finishes.
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 12.25);
    telemetry.receive('cwa_receive', receive(1, 'K1TEST', 'exchange', 21, 24), 10);
    const result = telemetry.snapshot(15);
    expect(result).toMatchObject({
      incomplete: false,
      questionMarkCount: 2,
      callRepeatRequestCount: 1,
      exchangeRepeatRequestCount: 1,
      callSendCount: 2,
      repeatedCallSendCount: 1,
      receivedCallCount: 2,
      receivedExchangeCount: 1,
      repeatedReceiveCount: 1,
      responseDelay: { count: 2, totalSeconds: 0.75, maxSeconds: 0.75 },
      callResponseDelay: { count: 1, totalSeconds: 0.75, maxSeconds: 0.75 },
      overlappingResponseCount: 1,
      unmatchedCallResponseCount: 0,
    });
    expect(isRunnerTelemetry(result, 15)).toBe(true);
    expect(result.events.map((event: { elapsedSeconds: number }) => event.elapsedSeconds)).toEqual([
      4, 4.5, 8, 8.75, 8.75, 12, 12.25, 14,
    ]);
  });

  it('excludes ambiguous or mistyped callers from latency and keeps abandoned actions', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.receive('cwa_receive_start', receive(), 10);
    telemetry.receive('cwa_receive_start', receive(2), 10);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 5);
    telemetry.send({ type: 'send_his', data: 'K1TST' }, 6);
    telemetry.send({ type: 'send_his', data: 'K1?' }, 6.5);
    telemetry.send({ type: 'send_msg', data: 'TU' }, 7);
    // TU/CQ starts a new exchange, so stale station identities are no match.
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 8);
    telemetry.send({ type: 'send_msg', data: 'CQ' }, 9);
    telemetry.send({ type: 'send_msg', data: 'Qm' }, 10);
    expect(telemetry.snapshot(10)).toMatchObject({
      callSendCount: 4,
      repeatedCallSendCount: 2,
      unmatchedCallResponseCount: 4,
      callRepeatRequestCount: 1,
      responseDelay: { count: 0, totalSeconds: 0, maxSeconds: 0 },
    });
    telemetry.resetContact(11);
    telemetry.send({ type: 'send_msg', data: 'Qm' }, 11);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 12);
    expect(telemetry.snapshot(12).events).toContainEqual({
      kind: 'send',
      elapsedSeconds: 6.5,
      action: 'call',
      phase: 'exchange',
      call: 'K1?',
    });
    expect(telemetry.snapshot(12)).toMatchObject({
      callRepeatRequestCount: 2,
      repeatedCallSendCount: 2,
    });
  });

  it('retains bounded chronological events and aggregate totals without private station settings', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.send({ type: 'config', data: { my_call: 'PRIVATE', notes: 'PRIVATE' } }, 0);
    for (let index = 0; index < 300; index++)
      telemetry.send({ type: 'send_msg', data: 'Qm' }, index / 10);
    const result = telemetry.snapshot(30);
    expect(result).toMatchObject({
      eventCount: 300,
      droppedEventCount: 44,
      questionMarkCount: 300,
    });
    expect(result.events).toHaveLength(256);
    expect(result.events[0].elapsedSeconds).toBe(4.4);
    expect(isRunnerTelemetry(result, 30)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('does not count a source-buffer boundary until playback reaches it and identifies partial capture', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.receive('cwa_receive_start', receive(), 10);
    telemetry.receive('cwa_receive', receive(), 10);
    expect(telemetry.snapshot(3.99)).toMatchObject({ events: [], receivedCallCount: 0 });
    expect(telemetry.snapshot(4)).toMatchObject({ receivedCallCount: 1, eventCount: 1 });
    telemetry.receive('cwa_telemetry_error', { code: 'clock' }, 10);
    expect(telemetry.snapshot(5).incomplete).toBe(true);
  });

  it('uses the prior reply when a repeated transmission is announced ahead of its audio start', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.receive('cwa_receive_start', receive(1, 'K1TEST', 'call', 11, 14), 10);
    telemetry.receive('cwa_receive', receive(1, 'K1TEST', 'call', 11, 14), 10);
    telemetry.receive('cwa_receive_start', receive(1, 'K1TEST', 'call', 18, 20), 10);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 7.99);
    expect(telemetry.snapshot(7.99)).toMatchObject({
      unmatchedCallResponseCount: 0,
      responseDelay: { count: 1, totalSeconds: 3.99, maxSeconds: 3.99 },
      receivedCallCount: 1,
    });
  });

  it('times only the first response to a transmission instead of counting the same gap again on a resend', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.receive('cwa_receive_start', receive(), 10);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 5);
    // Late completion must preserve the already-measured response marker.
    telemetry.receive('cwa_receive', receive(), 10);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 6);
    expect(telemetry.snapshot(6)).toMatchObject({
      callSendCount: 2,
      repeatedCallSendCount: 1,
      unmatchedCallResponseCount: 1,
      responseDelay: { count: 1, totalSeconds: 1, maxSeconds: 1 },
    });
    expect(isRunnerTelemetry(telemetry.snapshot(6), 6)).toBe(true);
  });

  it('keeps a late completion as an event without matching it to the next contact', () => {
    const telemetry = createRunnerTelemetry();
    telemetry.receive('cwa_receive_start', receive(), 10);
    telemetry.send({ type: 'send_msg', data: 'TU' }, 3);
    telemetry.receive('cwa_receive', receive(), 10);
    telemetry.send({ type: 'send_his', data: 'K1TEST' }, 5);
    const result = telemetry.snapshot(5);
    expect(result).toMatchObject({
      receivedCallCount: 1,
      unmatchedCallResponseCount: 1,
      responseDelay: { count: 0, totalSeconds: 0, maxSeconds: 0 },
    });
    expect(result.events).toContainEqual({
      kind: 'receive',
      elapsedSeconds: 4,
      stationId: 1,
      call: 'K1TEST',
      part: 'call',
      startSeconds: 1,
    });
    // Clearing/saving fields can reset attribution without transmitting TU/CQ.
    telemetry.resetContact(5.5);
    telemetry.receive('cwa_receive_start', receive(2, 'N2TEST', 'call', 16, 17), 10);
    telemetry.send({ type: 'send_his', data: 'N2TEST' }, 8);
    expect(telemetry.snapshot(8)).toMatchObject({
      repeatedCallSendCount: 0,
      responseDelay: { count: 1, totalSeconds: 1, maxSeconds: 1 },
    });
    telemetry.send({ type: 'send_msg', data: 'Nil' }, 9);
    telemetry.receive('cwa_receive_start', receive(3, 'W3TEST', 'call', 20, 21), 10);
    telemetry.send({ type: 'send_his', data: 'W3TEST' }, 12);
    expect(telemetry.snapshot(12)).toMatchObject({
      repeatedCallSendCount: 0,
      responseDelay: { count: 2, totalSeconds: 2, maxSeconds: 1 },
    });
  });

  it('validates and freezes diagnostics at the terminal protocol boundary', () => {
    const settings = {
      mode: 'SingleCall' as const,
      wpm: 20,
      durationSeconds: 60,
      activity: 1,
      conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
    };
    const event = (type: string, sequence: number, elapsedSeconds = 0, extra = {}) => ({
      channel: RUNNER_CHANNEL,
      version: RUNNER_PROTOCOL_VERSION,
      runId: 'diagnostics',
      type,
      sequence,
      elapsedSeconds,
      ...extra,
    });
    let run = createRunnerRun('diagnostics', settings);
    run = reduceRunnerEvent(run, event('ready', 0));
    run = reduceRunnerEvent(run, event('started', 1, 0, { settings }));
    const diagnostics = createRunnerTelemetry();
    diagnostics.send({ type: 'send_msg', data: 'Qm' }, 2);
    const telemetry = diagnostics.snapshot(5);
    const summary = { qsoCount: 0, verifiedPoints: 0, score: 0, nrErrors: 0, nilErrors: 0 };
    expect(
      reduceRunnerEvent(
        run,
        event('results', 2, 5, {
          reason: 'stopped',
          summary,
          telemetry: { ...telemetry, version: 2 },
        }),
      ),
    ).toBe(run);
    const done = reduceRunnerEvent(
      run,
      event('results', 2, 5, { reason: 'stopped', summary, telemetry }),
    );
    telemetry.questionMarkCount = 99;
    expect(done.telemetry?.questionMarkCount).toBe(1);
    expect(
      reduceRunnerEvent(done, event('results', 3, 6, { reason: 'stopped', summary, telemetry })),
    ).toBe(done);
    expect(
      reduceRunnerEvent(
        run,
        event('error', 2, 5, { code: 'interrupted', telemetry: diagnostics.snapshot(5) }),
      ).telemetry?.questionMarkCount,
    ).toBe(1);
  });
});
