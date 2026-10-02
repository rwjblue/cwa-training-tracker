import type { PracticePurpose } from './training.ts';

/** Serialize captured block attribution without restamping older result bodies. */
export function taskPracticeMetadata(taskId?: string, purpose?: PracticePurpose) {
  return {
    ...(taskId ? { plannedTaskId: taskId } : {}),
    ...(purpose !== undefined ? { practicePurpose: purpose } : {}),
  };
}
