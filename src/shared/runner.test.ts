import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createRunnerRun,
  isRunnerSettings,
  parseRunnerEvent,
  reduceRunnerEvent,
  runnerConfigureCommand,
  runnerResultNote,
  runnerStopCommand,
  RUNNER_CHANNEL,
  RUNNER_PROTOCOL_VERSION,
  RUNNER_REVISION,
  type RunnerSettings,
} from './runner';

// Exercise the actual static adapter without adding its browser JavaScript to tsc.
const adapterPath = '../../public/vendor/web-morse-runner/integration/bridge.js';
const { parseRunnerCommand, readRunnerSummary } = await import(adapterPath);
const settings: RunnerSettings = {
  mode: 'SingleCall',
  wpm: 13,
  durationSeconds: 900,
  activity: 2,
  conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
};
const summary = { qsoCount: 12, verifiedPoints: 10, score: 80, nrErrors: 1, nilErrors: 1 };
const event = (type: string, sequence: number, elapsedSeconds = 0, extra = {}) => ({
  channel: RUNNER_CHANNEL,
  version: RUNNER_PROTOCOL_VERSION,
  runId: 'synthetic-run-1',
  type,
  sequence,
  elapsedSeconds,
  ...extra,
});
const run = () => createRunnerRun('synthetic-run-1', settings);
const ready = () => reduceRunnerEvent(run(), event('ready', 0));

describe('embedded runner boundary', () => {
  it('accepts only exact bounded protocol data and numeric verified results', () => {
    const state = run();
    expect(parseRunnerCommand(runnerConfigureCommand(state))).toEqual(
      runnerConfigureCommand(state),
    );
    expect(parseRunnerCommand(runnerStopCommand(state))).toEqual(runnerStopCommand(state));
    for (const invalid of [
      { ...settings, mode: 'CWT' },
      { ...settings, wpm: NaN },
      { ...settings, durationSeconds: 6001 },
      { ...settings, conditions: { qrm: false } },
      { ...settings, identity: 'private' },
    ]) {
      expect(isRunnerSettings(invalid)).toBe(false);
      expect(
        parseRunnerCommand({ ...runnerConfigureCommand(state), settings: invalid }),
      ).toBeUndefined();
    }
    expect(parseRunnerCommand({ ...runnerStopCommand(state), type: 'start' })).toBeUndefined();
    for (const invalid of [
      event('progress', 2, Infinity),
      event('progress', 2, -1),
      event('ready', 0, 0, { privateNotes: 'not allowed' }),
      event('progress', 1.5),
      event('error', 2, 0, { code: 'arbitrary text' }),
      event('results', 2, 60, { reason: 'stopped', summary: { ...summary, verifiedPoints: 13 } }),
      event('results', 2, 60, { reason: 'stopped', summary: { ...summary, nrErrors: 12 } }),
      event('speed', 2, 1, { wpm: 61 }),
    ])
      expect(parseRunnerEvent(invalid)).toBeUndefined();
    expect(
      readRunnerSummary({
        data: [{ Check: '' }, { Check: 'NR' }, { Check: 'Nil' }, { Check: 'DUP' }],
        ConfCalls: new Set(['SYNTHETIC']),
        ConfPrefix: new Set(['K1']),
      }),
    ).toEqual({ qsoCount: 4, verifiedPoints: 1, score: 1, nrErrors: 1, nilErrors: 1 });
  });

  it('credits only one monotonic engine run using its actual chosen settings', () => {
    const selected = { ...settings, mode: 'WPX' as const, durationSeconds: 1200, wpm: 20 };
    expect(reduceRunnerEvent(run(), event('started', 1, 0, { settings: selected }))).toEqual(run());
    let state = reduceRunnerEvent(
      ready(),
      event('started', 1, 0, { settings: selected }),
      '2026-09-29T12:00:00.000Z',
    );
    state = reduceRunnerEvent(state, event('progress', 2, 123.5), '2026-09-29T12:10:00.000Z');
    expect(state.elapsedSeconds).toBe(123.5);
    expect(state.settings).toEqual(selected);
    for (const stale of [
      event('progress', 2, 500),
      event('progress', 3, 100),
      event('progress', 3, 1201),
      event('progress', 3, 500, { runId: 'other-run' }),
      event('started', 3, 0, { settings }),
    ])
      expect(reduceRunnerEvent(state, stale)).toBe(state);
    for (const terminal of [
      event('results', 3, 1200, { reason: 'completed', summary }),
      event('results', 3, 150, { reason: 'completed', summary }),
      event('results', 3, 150, { reason: 'stopped', summary }),
      event('error', 3, 150, { code: 'interrupted' }),
    ]) {
      const done = reduceRunnerEvent(state, terminal, '2026-09-29T12:30:00.000Z');
      expect(done.status).toBe(
        terminal.type === 'error'
          ? 'error'
          : terminal.elapsedSeconds === 1200
            ? 'completed'
            : 'stopped',
      );
      expect(done.elapsedSeconds).toBe(terminal.elapsedSeconds);
      expect(done.runStartedAt).toBe('2026-09-29T12:00:00.000Z');
      expect(done.runEndedAt).toBe('2026-09-29T12:30:00.000Z');
      expect(reduceRunnerEvent(done, event('progress', 4, 1200))).toBe(done);
      expect(reduceRunnerEvent(done, event('started', 5, 0, { settings }))).toBe(done);
      expect(runnerResultNote(done)).toContain('WPX Contest; 20 WPM starting speed');
    }
  });

  it('bounds speed metadata and automatic notes while preserving starting and latest speeds', () => {
    let state = reduceRunnerEvent(ready(), event('started', 1, 0, { settings }));
    for (let index = 0; index < 800; index++)
      state = reduceRunnerEvent(
        state,
        event('speed', index + 2, index + 1, { wpm: 10 + (index % 51) }),
      );
    state = reduceRunnerEvent(state, event('results', 802, 850, { reason: 'stopped', summary }));
    expect(state.speedHistory).toHaveLength(256);
    expect(state.speedHistory?.[0]).toEqual({ elapsedSeconds: 0, wpm: 13 });
    expect(state.speedHistory?.at(-1)).toEqual({ elapsedSeconds: 800, wpm: 44 });
    expect(state.speedChangeCount).toBe(800);
    expect(JSON.stringify(state).length).toBeLessThan(20_000);
    expect(runnerResultNote(state)!.length).toBeLessThan(2000);
    expect(runnerResultNote(state)).toContain('545 earlier speed changes omitted');
  });

  it('reproduces the pinned vendor bundle from its approved source hashes', async () => {
    const updaterPath = '../../scripts/web-morse-runner/update.mjs';
    const { checkBundle, vendorRoot } = await import(updaterPath);
    const approval = JSON.parse(
      await readFile(
        new URL('../../scripts/web-morse-runner/approved.json', import.meta.url),
        'utf8',
      ),
    );
    expect(approval.revision).toBe(RUNNER_REVISION);
    await checkBundle(vendorRoot, approval);
  });
});
