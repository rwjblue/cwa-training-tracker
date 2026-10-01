import { expect, it } from 'vitest';
import type { PlannedTask } from '../shared/plan';
import { createRunnerRun, type RunnerRunState } from '../shared/runner';
import { captureRunnerPracticeAttribution, runnerSession } from './runner-session';

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
