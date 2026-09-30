import { nativeCopyTask, type PlannedTask } from '../shared/plan';

export type PracticeActivity = NonNullable<PlannedTask['exercise']> | { type: 'timer' };

/** A deliberate start from Today or the studio's public tool shortcuts. */
export interface PracticeLaunch {
  id: string;
  task?: PlannedTask;
  tool?: 'words' | 'qso' | 'free' | 'copy' | 'sending';
  activity?: PracticeActivity;
}

/** An assignment always opens its own material, never the last unrelated studio mode. */
export function practiceLaunchForTask(task: PlannedTask): Omit<PracticeLaunch, 'id'> {
  const nativeTask = nativeCopyTask(task);
  return {
    task: nativeTask,
    activity:
      nativeTask.exercise ?? (task.link ? { type: 'external', url: task.link } : { type: 'timer' }),
  };
}
