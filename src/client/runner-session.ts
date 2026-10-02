import type { PlannedTask } from '../shared/plan';
import { taskPracticeMetadata } from '../shared/practice-attribution';
import { runnerResultNote, RUNNER_REVISION, type RunnerRunState } from '../shared/runner';
import {
  dateInTimezone,
  validatePracticeSession,
  type PracticePurpose,
  type PracticeSession,
} from '../shared/training';

export interface RunnerPracticeAttribution {
  task?: Pick<PlannedTask, 'id' | 'title' | 'lesson'>;
  purpose?: PracticePurpose;
  context?: PracticeSession['context'];
}

/** New results retain the timezone accepted at Run, never the later review day. */
export function finishedRunnerSession(
  run: RunnerRunState,
  attribution: RunnerPracticeAttribution,
  timezone: string,
): PracticeSession {
  if (!run.runStartedAt || !run.runEndedAt)
    throw new Error(
      'The Runner result is missing its accepted start or acknowledged end. Keep this page open before starting another run.',
    );
  if (run.elapsedSeconds < 1)
    throw new Error('Stop the run and retain at least one confirmed engine second before review.');
  const session = runnerSession(run, attribution, {
    createdAt: run.runEndedAt,
    date: dateInTimezone(run.runStartedAt, timezone),
  });
  const result = session.metadata!.runner as Record<string, unknown>;
  return validatePracticeSession({
    ...session,
    metadata: {
      ...session.metadata,
      runner: { ...result, attribution: { version: 1, timezone } },
    },
  });
}

/** A run keeps its original task/purpose while completion and other live props change. */
export function captureRunnerPracticeAttribution(
  task?: PlannedTask,
  purpose?: PracticePurpose,
  context?: PracticeSession['context'],
): RunnerPracticeAttribution {
  return {
    context,
    task: task ? { id: task.id, title: task.title, lesson: task.lesson } : undefined,
    purpose: task ? (purpose ?? 'assigned') : undefined,
  };
}

/** Engine time and its captured attribution form the reviewed result together. */
export function runnerSession(
  run: RunnerRunState,
  attribution: RunnerPracticeAttribution,
  identity: Pick<PracticeSession, 'createdAt' | 'date'>,
): Partial<PracticeSession> {
  const { lastSequence: _sequence, ...result } = run;
  return {
    id: `runner:${run.runId}`,
    createdAt: identity.createdAt,
    date: identity.date,
    kind: 'simulator',
    minutes: run.elapsedSeconds / 60,
    characterWpm: run.settings.wpm,
    lesson: attribution.task?.lesson,
    qsoCount: run.summary?.qsoCount,
    notes: [attribution.task?.title, runnerResultNote(run)].filter(Boolean).join('\n'),
    source: 'timer',
    ...(attribution.context ? { context: attribution.context } : {}),
    metadata: {
      practiceTool: 'morse-runner',
      elapsedSeconds: run.elapsedSeconds,
      runner: { ...result, revision: RUNNER_REVISION },
      ...taskPracticeMetadata(attribution.task?.id, attribution.purpose),
    },
  };
}
