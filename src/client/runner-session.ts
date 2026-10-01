import type { PlannedTask } from '../shared/plan';
import { taskPracticeMetadata } from '../shared/practice-attribution';
import { runnerResultNote, RUNNER_REVISION, type RunnerRunState } from '../shared/runner';
import type { PracticePurpose, PracticeSession } from '../shared/training';

export interface RunnerPracticeAttribution {
  task?: Pick<PlannedTask, 'id' | 'title' | 'lesson'>;
  purpose?: PracticePurpose;
}

/** A run keeps its original task/purpose while completion and other live props change. */
export function captureRunnerPracticeAttribution(
  task?: PlannedTask,
  purpose?: PracticePurpose,
): RunnerPracticeAttribution {
  return {
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
    metadata: {
      practiceTool: 'morse-runner',
      elapsedSeconds: run.elapsedSeconds,
      runner: { ...result, revision: RUNNER_REVISION },
      ...taskPracticeMetadata(attribution.task?.id, attribution.purpose),
    },
  };
}
