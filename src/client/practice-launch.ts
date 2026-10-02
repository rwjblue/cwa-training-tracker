import { nativeCopyTask, type PlannedTask } from '../shared/plan';
import {
  getPracticePurpose,
  validatePracticeSession,
  type PracticePurpose,
  type PracticeSession,
} from '../shared/training';
import { sessionEvidence } from '../shared/practice-evidence';
import type { RunnerSettings } from '../shared/runner';

export type PracticeActivity = NonNullable<PlannedTask['exercise']> | { type: 'timer' };

/** A deliberate start from Today or the studio's public tool shortcuts. */
export interface PracticeLaunch {
  id: string;
  task?: PlannedTask;
  purpose?: PracticePurpose;
  tool?: 'words' | 'qso' | 'free' | 'copy' | 'sending' | 'runner';
  activity?: PracticeActivity;
  runnerSettings?: RunnerSettings;
  runnerContext?: PracticeSession['context'];
}

/** Follow optional event edits for manual blocks without replacing native owners. */
export function practiceActivityForLaunch(
  launch: PracticeLaunch | undefined,
  tasks: readonly PlannedTask[],
): PracticeActivity | undefined {
  const captured = launch?.activity;
  if (!captured || !['timer', 'external', 'live-event'].includes(captured.type)) return captured;
  const task = tasks.find((task) => task.id === launch?.task?.id);
  if (!task) return captured;
  if (task.exercise?.type === 'live-event') return task.exercise;
  if (captured.type !== 'live-event') return captured;
  // Clearing an event restores ordinary manual work, retaining the same clock.
  if (task.exercise?.type === 'external') return task.exercise;
  return task.link ? { type: 'external', url: task.link } : { type: 'timer' };
}

/** An assignment always opens its own material, never the last unrelated studio mode. */
export function practiceLaunchForTask(
  task: PlannedTask,
  purpose: PracticePurpose = 'assigned',
): Omit<PracticeLaunch, 'id'> {
  const nativeTask = nativeCopyTask(task);
  return {
    task: nativeTask,
    purpose,
    activity:
      nativeTask.exercise ?? (task.link ? { type: 'external', url: task.link } : { type: 'timer' }),
  };
}

/** Prepare settings/context only. The save receipt must precede creating a fresh owner. */
export function nextRunnerLaunchForResult(
  input: unknown,
  tasks: readonly PlannedTask[],
): Omit<PracticeLaunch, 'id'> | undefined {
  let entry: PracticeSession;
  try {
    entry = validatePracticeSession(input);
  } catch {
    return undefined;
  }
  const evidence = sessionEvidence(entry.metadata);
  if (evidence?.type !== 'runner' || !evidence.run.attribution) return undefined;
  const taskId = entry.metadata?.plannedTaskId;
  const task = typeof taskId === 'string' ? tasks.find((task) => task.id === taskId) : undefined;
  // Never re-create a removed/private assignment from a recovered result's old title.
  if (taskId && task?.exercise?.type !== 'morse-runner') return undefined;
  const run = evidence.run;
  return {
    ...(task
      ? practiceLaunchForTask(task, getPracticePurpose(entry) ?? 'assigned')
      : { tool: 'runner' as const }),
    runnerSettings: {
      ...run.settings,
      wpm: run.speedHistory?.at(-1)?.wpm ?? run.settings.wpm,
      conditions: { ...run.settings.conditions },
    },
    runnerContext: entry.context,
  };
}
