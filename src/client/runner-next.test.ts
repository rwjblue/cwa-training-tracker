import { expect, it } from 'vitest';
import type { PlannedTask } from '../shared/plan';
import { createRunnerRun, type RunnerSettings } from '../shared/runner';
import { nextRunnerLaunchForResult } from './practice-launch';
import { captureRunnerPracticeAttribution, finishedRunnerSession } from './runner-session';

const settings: RunnerSettings = {
  mode: 'WPX',
  wpm: 20,
  durationSeconds: 300,
  activity: 4,
  conditions: { qrm: true, qrn: false, qsb: true, flutter: false, lids: true },
};
const task: PlannedTask = {
  id: 'next-run-task',
  title: 'Private assigned Runner',
  kind: 'simulator',
  lesson: 4,
  done: false,
  notes: '',
  createdAt: '2026-10-01T12:00:00.000Z',
  targetMinutes: 0.1,
  exercise: { type: 'morse-runner', url: 'https://fritzsche.github.io/WebMorseRunner/', settings },
};
const original = (
  purpose: 'assigned' | 'review' = 'assigned',
  context: 'class' | 'practice' = 'practice',
  assigned = true,
) =>
  finishedRunnerSession(
    {
      ...createRunnerRun('old-run', settings),
      status: 'stopped',
      elapsedSeconds: 41.5,
      runStartedAt: '2026-10-01T12:00:00.000Z',
      runEndedAt: '2026-10-01T12:00:42.000Z',
      speedHistory: [
        { elapsedSeconds: 0, wpm: 20 },
        { elapsedSeconds: 12.25, wpm: 24 },
      ],
      speedChangeCount: 1,
      summary: { qsoCount: 0, verifiedPoints: 0, score: 0, nrErrors: 0, nilErrors: 0 },
    },
    captureRunnerPracticeAttribution(assigned ? task : undefined, purpose, context),
    'UTC',
  );

it('retains selected settings and latest actual speed without carrying a prior run or shortening its duration', () => {
  const entry = original();
  const before = structuredClone(entry);
  const launch = nextRunnerLaunchForResult(entry, [task])!;
  expect(launch.task?.id).toBe(task.id);
  expect(launch.purpose).toBe('assigned');
  expect(launch.runnerSettings).toEqual({ ...settings, wpm: 24 });
  expect(launch).not.toHaveProperty('id');
  const next = createRunnerRun('new-run', launch.runnerSettings!);
  expect(next).toMatchObject({
    runId: 'new-run',
    status: 'loading',
    elapsedSeconds: 0,
    lastSequence: -1,
  });
  for (const field of ['summary', 'runStartedAt', 'runEndedAt', 'speedHistory'])
    expect(next).not.toHaveProperty(field);
  launch.runnerSettings!.conditions.qrm = false;
  expect(entry).toEqual(before);
});

it('retains deliberate review/class placement without converting a reached assignment into review', () => {
  for (const purpose of ['assigned', 'review'] as const) {
    for (const context of ['practice', 'class'] as const) {
      const launch = nextRunnerLaunchForResult(original(purpose, context), [
        { ...task, done: true },
      ])!;
      expect(launch.purpose).toBe(purpose);
      expect(launch.runnerContext).toBe(context);
      const nextResult = finishedRunnerSession(
        {
          ...createRunnerRun('next-context', launch.runnerSettings!),
          status: 'stopped',
          elapsedSeconds: 2,
          runStartedAt: '2026-10-02T12:00:00.000Z',
          runEndedAt: '2026-10-02T12:00:03.000Z',
        },
        captureRunnerPracticeAttribution(launch.task, launch.purpose, launch.runnerContext),
        'UTC',
      );
      expect(nextResult).toMatchObject({
        date: '2026-10-02',
        context,
        metadata: { practicePurpose: purpose, plannedTaskId: task.id },
      });
      expect(nextResult.id).not.toBe(original().id);
    }
  }
});

it('keeps public continuation public and refuses old/deleted/non-Runner or malformed assignments', () => {
  const guest = nextRunnerLaunchForResult(original('review', 'practice', false), [])!;
  expect(guest.tool).toBe('runner');
  expect(guest.task).toBeUndefined();
  expect(guest.purpose).toBeUndefined();
  expect(nextRunnerLaunchForResult(original(), [])).toBeUndefined();
  expect(
    nextRunnerLaunchForResult(original(), [
      { ...task, exercise: { type: 'external', url: 'https://example.test/' } },
    ]),
  ).toBeUndefined();
  expect(nextRunnerLaunchForResult({ ...original(), minutes: 100 }, [task])).toBeUndefined();
  expect(nextRunnerLaunchForResult({ notes: 'No native evidence' }, [task])).toBeUndefined();
});
