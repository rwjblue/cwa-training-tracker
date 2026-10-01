import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRunnerRun } from '../shared/runner';
import { finishedRunnerSession } from './runner-session';
import {
  completeDeviceScopeMutation,
  deviceScopeKey,
  getDeviceScopeToken,
  invalidateDeviceScope,
} from './device-scope';
import { loadLocalPractice, loadPracticeSaveOrigin } from './practice-autosave';
import {
  clearRunnerResult,
  readRunnerResults,
  retainFinishedRunnerResult,
  retainRunnerReview,
  runnerResultKey,
  validateRunnerFinishedResult,
  readRunnerReview,
} from './runner-results';

const entry = (id = 'synthetic-run') =>
  finishedRunnerSession(
    {
      ...createRunnerRun(id, {
        mode: 'SingleCall',
        wpm: 20,
        durationSeconds: 60,
        activity: 1,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      }),
      status: 'stopped',
      elapsedSeconds: 12.25,
      runStartedAt: '2026-10-01T03:59:59.000Z',
      runEndedAt: '2026-10-01T04:00:12.000Z',
    },
    {},
    'America/New_York',
  );
let values: Map<string, string>;
beforeEach(() => {
  values = new Map(
    ['guest', 'account-a'].map((scope) => [
      deviceScopeKey(scope),
      JSON.stringify({ version: 1, token: crypto.randomUUID(), mutating: false }),
    ]),
  );
  vi.stubGlobal('localStorage', {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('retains distinct acknowledged results before review without exposing an upload or live engine', () => {
  const first = entry();
  const origin = { id: first.id, accountId: 'account-a', generation: 3 };
  retainFinishedRunnerResult('account-a', first, origin);
  retainFinishedRunnerResult('account-a', entry('second'), { ...origin, id: 'runner:second' });
  first.notes = 'Mutated caller';
  expect(readRunnerResults('account-a').results).toHaveLength(2);
  expect(readRunnerResults('account-a').results[0].entry.notes).not.toBe('Mutated caller');
  expect(readRunnerResults('account-b').results).toEqual([]);
  expect(readRunnerResults('guest').results).toEqual([]);
  expect(loadLocalPractice('account-a')).toEqual([]);
  expect(loadPracticeSaveOrigin('account-a', first.id).generation).toBe(3);
  expect(readRunnerResults('account-a').results[0].entry.date).toBe('2026-09-30');
  expect(readRunnerResults('account-a').results[0].reviewed).toBe(false);
});

it('retains canceled review edits and freezes the first submitted body across reopening', () => {
  const original = entry();
  const origin = { id: original.id, accountId: 'guest' };
  retainFinishedRunnerResult('guest', original, origin);
  const edited = {
    ...original,
    notes: 'Student notes',
    metadata: { ...original.metadata, scratchpad: 'Exact scratchpad' },
  };
  retainRunnerReview('guest', edited, false);
  // Repeated terminal retention cannot replace edited notes with its original snapshot.
  expect(retainFinishedRunnerResult('guest', original, origin).entry.notes).toBe('Student notes');
  const submitted = {
    ...edited,
    metadata: { ...edited.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
  };
  retainRunnerReview('guest', submitted, true);
  expect(readRunnerResults('guest').results[0]).toMatchObject({ reviewed: true, entry: submitted });
  retainRunnerReview('guest', submitted, true);
  expect(() => retainRunnerReview('guest', { ...submitted, notes: 'Later body' }, false)).toThrow(
    /exact retained/,
  );
  expect(() => retainRunnerReview('guest', { ...submitted, date: '2026-10-02' }, false)).toThrow(
    /practice date/,
  );
  expect(loadLocalPractice('guest')).toEqual([]);
});

it('rejects foreign scope, changed facts and unknown-generation promotion', () => {
  const original = entry();
  retainFinishedRunnerResult('account-a', original, { id: original.id, accountId: 'account-a' });
  expect(() =>
    retainFinishedRunnerResult('account-a', original, { id: original.id, accountId: 'account-b' }),
  ).toThrow(/different account/);
  expect(() =>
    retainFinishedRunnerResult('account-a', original, {
      id: original.id,
      accountId: 'account-a',
      generation: 8,
    }),
  ).toThrow(/identity/);
  expect(() =>
    retainFinishedRunnerResult('guest', original, {
      id: original.id,
      accountId: 'guest',
      generation: 1,
    }),
  ).toThrow(/Guest/);
  expect(() =>
    validateRunnerFinishedResult(
      { ...readRunnerResults('account-a').results[0], reviewed: true },
      'account-a',
    ),
  ).toThrow(/review timestamp/);
});

it('reports refused or silent storage failures and never claims a retained receipt', () => {
  const original = entry();
  const origin = { id: original.id, accountId: 'guest' };
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === runnerResultKey('guest', original.id)) throw new Error('quota');
    values.set(key, value);
  });
  expect(() => retainFinishedRunnerResult('guest', original, origin)).toThrow(
    /Keep this page open/,
  );
  expect(readRunnerResults('guest').results).toEqual([]);
  vi.mocked(localStorage.setItem).mockImplementation(() => {});
  expect(() => retainFinishedRunnerResult('guest', original, origin)).toThrow(/could not retain/);
});

it('fences late owners after device replacement and removes only the selected result', () => {
  const original = entry();
  const oldToken = getDeviceScopeToken('guest');
  retainFinishedRunnerResult('guest', original, { id: original.id, accountId: 'guest' }, oldToken);
  retainFinishedRunnerResult(
    'guest',
    entry('other'),
    { id: 'runner:other', accountId: 'guest' },
    oldToken,
  );
  const replacement = invalidateDeviceScope('guest');
  completeDeviceScopeMutation('guest', replacement);
  expect(() => clearRunnerResult('guest', original.id, oldToken)).toThrow(/changed/);
  expect(() => retainRunnerReview('guest', original, false, oldToken)).toThrow(/changed/);
  clearRunnerResult('guest', original.id, replacement);
  expect(readRunnerResults('guest').results.map(({ entry }) => entry.id)).toEqual(['runner:other']);
});

it('keeps malformed stored bytes while reporting damage separately from valid results', () => {
  const original = entry();
  retainFinishedRunnerResult('guest', original, { id: original.id, accountId: 'guest' });
  const key = runnerResultKey('guest', 'runner:damaged');
  values.set(key, '{damaged');
  const read = readRunnerResults('guest');
  expect(read.results).toHaveLength(1);
  expect(read.error).toContain('1 retained Runner');
  expect(values.get(key)).toBe('{damaged');
});

it.each(['completed', 'error'] as const)(
  'retains acknowledged %s terminal facts without estimating elapsed time',
  (status) => {
    const run = createRunnerRun(`terminal-${status}`, {
      mode: 'SingleCall',
      wpm: 20,
      durationSeconds: 60,
      activity: 1,
      conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
    });
    const elapsedSeconds = status === 'completed' ? 60 : 12.25;
    const result = finishedRunnerSession(
      {
        ...run,
        status,
        elapsedSeconds,
        runStartedAt: '2026-10-01T03:59:59.000Z',
        runEndedAt:
          status === 'completed' ? '2026-10-01T04:00:59.000Z' : '2026-10-01T04:00:12.000Z',
        ...(status === 'error' ? { errorCode: 'interrupted' as const } : {}),
      },
      {},
      'America/New_York',
    );
    retainFinishedRunnerResult('guest', result, { id: result.id, accountId: 'guest' });
    expect(readRunnerResults('guest').results[0].entry).toEqual(result);
    expect(result.minutes * 60).toBe(elapsedSeconds);
    expect(result.date).toBe('2026-09-30');
    expect(loadLocalPractice('guest')).toEqual([]);
  },
);

it('bounds the separate terminal inventory without evicting existing student results', () => {
  for (let index = 0; index < 100; index++) {
    const result = entry(`retained-${index}`);
    retainFinishedRunnerResult('guest', result, { id: result.id, accountId: 'guest' });
  }
  const overflow = entry('overflow');
  expect(() =>
    retainFinishedRunnerResult('guest', overflow, { id: overflow.id, accountId: 'guest' }),
  ).toThrow('100 retained Runner results');
  expect(readRunnerResults('guest').results).toHaveLength(100);
  expect(
    readRunnerResults('guest').results.some(({ entry }) => entry.id === 'runner:retained-0'),
  ).toBe(true);
  expect(loadLocalPractice('guest')).toEqual([]);
  const submitted = {
    ...overflow,
    notes: 'Online-only overflow',
    metadata: { ...overflow.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
  };
  expect(() => retainRunnerReview('guest', submitted, true)).toThrow('100 retained Runner results');
  expect(readRunnerReview('guest', overflow.id)).toMatchObject({
    reviewed: true,
    entry: submitted,
  });
  expect(readRunnerResults('guest').results).toHaveLength(100);
});

it('keeps canceled edits and the exact first submission in the open-page owner when storage refuses', () => {
  const original = entry('volatile-review');
  const origin = { id: original.id, accountId: 'guest' };
  const token = getDeviceScopeToken('guest');
  const real = localStorage.setItem.bind(localStorage);
  let refuse = true;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === runnerResultKey('guest', original.id) && refuse) throw new Error('quota');
    real(key, value);
  });
  expect(() => retainFinishedRunnerResult('guest', original, origin, token)).toThrow(
    /Keep this page open/,
  );
  const edited = { ...original, notes: 'Canceled offline notes' };
  expect(() => retainRunnerReview('guest', edited, false, token)).toThrow(/could not retain/);
  expect(readRunnerReview('guest', original.id, token)?.entry).toEqual(edited);
  const submitted = {
    ...edited,
    metadata: { ...edited.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
  };
  expect(() => retainRunnerReview('guest', submitted, true, token)).toThrow(/could not retain/);
  submitted.metadata.runnerReviewedAt = '2026-10-02T12:01:00.000Z';
  expect(readRunnerReview('guest', original.id, token)?.entry.metadata?.runnerReviewedAt).toBe(
    '2026-10-02T12:00:00.000Z',
  );
  submitted.metadata.runnerReviewedAt = '2026-10-02T12:00:00.000Z';
  expect(readRunnerResults('guest').results).toEqual([]);
  expect(readRunnerReview('guest', original.id, token)).toMatchObject({
    reviewed: true,
    origin,
    entry: submitted,
  });
  expect(() =>
    retainRunnerReview('guest', { ...submitted, notes: 'Different retry' }, true, token),
  ).toThrow(/exact retained/);
  expect(() => retainFinishedRunnerResult('guest', original, origin, token)).toThrow(
    /could not retain/,
  );
  refuse = false;
  expect(retainFinishedRunnerResult('guest', original, origin, token)).toMatchObject({
    reviewed: true,
    entry: submitted,
  });
  expect(readRunnerResults('guest').results[0].entry).toEqual(submitted);
  clearRunnerResult('guest', original.id, token);
  expect(readRunnerReview('guest', original.id, token)).toBeUndefined();
});

it('does not expose an open-page review to a replacement owner or another account', () => {
  const original = entry('volatile-replaced');
  const token = getDeviceScopeToken('guest');
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === runnerResultKey('guest', original.id)) throw new Error('quota');
    values.set(key, value);
  });
  expect(() =>
    retainFinishedRunnerResult('guest', original, { id: original.id, accountId: 'guest' }, token),
  ).toThrow();
  expect(readRunnerReview('account-a', original.id)).toBeUndefined();
  const replacement = invalidateDeviceScope('guest');
  completeDeviceScopeMutation('guest', replacement);
  expect(() => readRunnerReview('guest', original.id, token)).toThrow(/changed/);
  expect(readRunnerReview('guest', original.id, replacement)).toBeUndefined();
});

it('keeps an acknowledged open-page result when browser storage reads and writes are unavailable', () => {
  const original = entry('volatile-unavailable');
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  expect(() =>
    retainFinishedRunnerResult('guest', original, { id: original.id, accountId: 'guest' }),
  ).toThrow(/could not retain/);
  const submitted = {
    ...original,
    notes: 'Exact online body',
    metadata: { ...original.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
  };
  expect(() => retainRunnerReview('guest', submitted, true)).toThrow(/could not retain/);
  expect(readRunnerReview('guest', original.id)).toMatchObject({
    reviewed: true,
    entry: submitted,
  });
});

it('retains the current submitted body despite unrelated damaged inventory without publishing or overwriting damage', () => {
  const damaged = runnerResultKey('guest', 'runner:unrelated-damaged');
  values.set(damaged, '{unreadable');
  const original = entry('volatile-damaged-inventory');
  expect(() =>
    retainFinishedRunnerResult('guest', original, { id: original.id, accountId: 'guest' }),
  ).toThrow(/could not be read/);
  const submitted = {
    ...original,
    notes: 'Exact online-only body',
    metadata: { ...original.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
  };
  expect(() => retainRunnerReview('guest', submitted, true)).toThrow(/could not be read/);
  expect(readRunnerReview('guest', original.id)).toMatchObject({
    reviewed: true,
    entry: submitted,
  });
  expect(values.get(damaged)).toBe('{unreadable');
  expect(values.has(runnerResultKey('guest', original.id))).toBe(false);
  expect(loadLocalPractice('guest')).toEqual([]);
});
