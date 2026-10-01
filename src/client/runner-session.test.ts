import { expect, it } from 'vitest';
import { validatePracticeSession } from '../shared/training';
import { practiceSessionEvidenceDetails } from '../shared/practice-evidence';
import type { PlannedTask } from '../shared/plan';
import { createRunnerRun, type RunnerRunState } from '../shared/runner';
import {
  captureRunnerPracticeAttribution,
  finishedRunnerSession,
  runnerSession,
} from './runner-session';

const task: PlannedTask = {
  id: 'task:runner',
  title: 'Morse Runner assignment',
  lesson: 3,
  kind: 'simulator',
  done: false,
  notes: '',
  createdAt: '2026-09-30T12:00:00.000Z',
};
const run: RunnerRunState = {
  ...createRunnerRun('captured-run', {
    mode: 'SingleCall',
    wpm: 20,
    durationSeconds: 300,
    activity: 2,
    conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
  }),
  status: 'stopped',
  elapsedSeconds: 41.5,
  runStartedAt: '2026-09-30T12:00:00.000Z',
  runEndedAt: '2026-09-30T12:00:42.000Z',
};
const identity = { createdAt: run.runEndedAt!, date: '2026-09-30' };

it('retains the captured review task and engine time when live task completion changes', () => {
  const liveTask = { ...task };
  const attribution = captureRunnerPracticeAttribution(liveTask, 'review');
  liveTask.done = true;
  liveTask.title = 'Later edited title';
  const resultIdentity = { ...identity, runId: run.runId };
  const result = runnerSession(run, attribution, resultIdentity);
  expect(result).toMatchObject({
    id: 'runner:captured-run',
    minutes: 41.5 / 60,
    lesson: 3,
    metadata: {
      elapsedSeconds: 41.5,
      plannedTaskId: task.id,
      practicePurpose: 'review',
      runner: { runId: run.runId, elapsedSeconds: 41.5 },
    },
  });
  expect(result).not.toHaveProperty('runId');
  expect(runnerSession(run, attribution, identity).notes).toContain(task.title);
  expect(attribution.purpose).toBe('review');
  expect(captureRunnerPracticeAttribution(liveTask).purpose).toBe('assigned');
});

it('keeps public runs independent of task purpose and does not stamp old attribution', () => {
  const publicResult = runnerSession(
    run,
    captureRunnerPracticeAttribution(undefined, 'review'),
    identity,
  );
  expect(publicResult.metadata).not.toHaveProperty('plannedTaskId');
  expect(publicResult.metadata).not.toHaveProperty('practicePurpose');
  const historicalAttribution = { task };
  expect(runnerSession(run, historicalAttribution, identity).metadata).toMatchObject({
    plannedTaskId: task.id,
  });
  expect(runnerSession(run, historicalAttribution, identity).metadata).not.toHaveProperty(
    'practicePurpose',
  );
});

it.each([
  ['2026-10-01T03:59:59.000Z', '2026-10-01T04:00:41.000Z', '2026-09-30'],
  ['2026-03-08T06:59:30.000Z', '2026-03-08T07:00:12.000Z', '2026-03-08'],
  ['2026-11-01T05:59:30.000Z', '2026-11-01T06:00:12.000Z', '2026-11-01'],
])(
  'retains the accepted start date across midnight/DST and delayed review (%s)',
  (start, end, date) => {
    const result = finishedRunnerSession(
      { ...run, runStartedAt: start, runEndedAt: end },
      captureRunnerPracticeAttribution(task, 'review'),
      'America/New_York',
    );
    expect(result).toMatchObject({
      id: 'runner:captured-run',
      date,
      createdAt: end,
      minutes: 41.5 / 60,
      metadata: {
        practicePurpose: 'review',
        evidence: { run: { attribution: { version: 1, timezone: 'America/New_York' } } },
      },
    });
    expect(
      validatePracticeSession({
        ...result,
        metadata: { ...result.metadata, runnerReviewedAt: '2026-11-02T12:00:00.000Z' },
      }).date,
    ).toBe(date);
    expect(result.metadata).not.toHaveProperty('runnerReviewedAt');
  },
);

it('exposes starting speed and actual segments without a mixed generic WPM', () => {
  const result = finishedRunnerSession(
    {
      ...run,
      speedHistory: [
        { elapsedSeconds: 0, wpm: 20 },
        { elapsedSeconds: 12.25, wpm: 24 },
      ],
      speedChangeCount: 1,
    },
    captureRunnerPracticeAttribution(task),
    'UTC',
  );
  expect(result).not.toHaveProperty('characterWpm');
  expect(practiceSessionEvidenceDetails(result.metadata).join('\n')).toContain(
    '20 WPM starting speed',
  );
  expect(practiceSessionEvidenceDetails(result.metadata).join('\n')).toContain('24 WPM at 12.25s');
  expect(finishedRunnerSession(run, {}, 'UTC').characterWpm).toBe(20);
});

it('rejects contradictory newly attributed identity, date, creation, duration and review timestamps', () => {
  const result = finishedRunnerSession(run, {}, 'UTC');
  for (const change of [
    { id: 'other' },
    { date: '2026-10-01' },
    { createdAt: run.runStartedAt },
    { minutes: 2 },
    { qsoCount: 3 },
  ])
    expect(() => validatePracticeSession({ ...result, ...change })).toThrow();
  expect(() =>
    validatePracticeSession({
      ...result,
      metadata: { ...result.metadata, runnerReviewedAt: run.runStartedAt },
    }),
  ).toThrow(/review cannot precede/);
  expect(() => finishedRunnerSession({ ...run, status: 'running' }, {}, 'UTC')).toThrow(/stop/);
  expect(() => finishedRunnerSession({ ...run, runStartedAt: undefined }, {}, 'UTC')).toThrow(
    /start/,
  );
  expect(() => finishedRunnerSession(run, {}, 'Not/A_Timezone')).toThrow();
  // Older unmarked result identities and dates remain valid; missing facts stay absent.
  const old = runnerSession(
    { ...run, runStartedAt: undefined, runEndedAt: undefined },
    {},
    identity,
  );
  expect(
    validatePracticeSession({ ...old, id: 'older-id', date: '2026-10-01' }).metadata?.evidence,
  ).not.toHaveProperty('run.attribution');
});

it('discloses speed history that exceeded the bounded retained timeline', () => {
  const entry = finishedRunnerSession(
    {
      ...run,
      speedHistory: [
        { elapsedSeconds: 0, wpm: 20 },
        { elapsedSeconds: 3, wpm: 24 },
      ],
      speedChangeCount: 300,
    },
    {},
    'America/New_York',
  );
  const details = practiceSessionEvidenceDetails(entry.metadata);
  expect(details.some((line) => line.includes('299 earlier speed changes omitted'))).toBe(true);
  expect(entry.characterWpm).toBeUndefined();
});
