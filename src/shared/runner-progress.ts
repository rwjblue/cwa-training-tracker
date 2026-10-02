import { RUNNER_MAX_SECONDS } from './runner';
import { savedTaskProgress, type PlannedTask } from './plan';
import { validatePracticeSession, type PracticePurpose, type PracticeSession } from './training';

/** A projection from the current engine owner, never a clock or reload checkpoint. */
export interface CurrentRunnerProgress {
  id: string;
  taskId: string;
  date: string;
  seconds: number;
  purpose: PracticePurpose;
  classTime: boolean;
}
export interface RunnerAssignmentProgress {
  savedSeconds: number;
  currentSeconds: number;
  combinedSeconds: number;
  requiredSeconds?: number;
  remainingSeconds?: number;
}

/** Use the same owned placement/review rules as Today, with validated native facts. */
export function runnerAssignmentProgress(
  tasks: readonly PlannedTask[],
  entries: readonly PracticeSession[],
  today: string,
  current?: CurrentRunnerProgress,
): Map<string, RunnerAssignmentProgress> {
  if (!tasks.some((task) => task.exercise?.type === 'morse-runner')) return new Map();
  const valid = entries.flatMap((entry) => {
    try {
      const checked = validatePracticeSession(entry);
      return checked.minutes > 0 ? [checked] : [];
    } catch {
      return [];
    }
  });
  const saved = savedTaskProgress(tasks, valid, today);
  // A local/server receipt transfers ownership to saved evidence, including an
  // edited class/review entry. A repeated acknowledgement cannot add this run twice.
  const acknowledged = entries.some((entry) => entry.id === current?.id);
  const result = new Map<string, RunnerAssignmentProgress>();
  for (const task of tasks) {
    if (task.exercise?.type !== 'morse-runner') continue;
    const savedSeconds = (saved.get(task.id)?.loggedMinutes ?? 0) * 60;
    result.set(
      task.id,
      runnerProgressWithCurrent(task, savedSeconds, today, current, acknowledged),
    );
  }
  return result;
}

function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}

/** Combine a cached saved total with the existing engine owner's observation. */
export function runnerProgressWithCurrent(
  task: PlannedTask,
  savedSeconds: number,
  today: string,
  current?: CurrentRunnerProgress,
  acknowledged = false,
): RunnerAssignmentProgress {
  const currentSeconds =
    !acknowledged &&
    current?.taskId === task.id &&
    current.purpose === 'assigned' &&
    /^runner:[A-Za-z0-9][A-Za-z0-9_-]*$/.test(current.id) &&
    !current.classTime &&
    validDate(current.date) &&
    current.date <= today &&
    Number.isFinite(current.seconds) &&
    current.seconds > 0 &&
    current.seconds <= RUNNER_MAX_SECONDS
      ? current.seconds
      : 0;
  const combinedSeconds = savedSeconds + currentSeconds;
  const requiredSeconds =
    task.targetMinutes !== undefined &&
    Number.isFinite(task.targetMinutes) &&
    task.targetMinutes > 0
      ? task.targetMinutes * 60
      : undefined;
  return {
    savedSeconds,
    currentSeconds,
    combinedSeconds,
    ...(requiredSeconds === undefined
      ? {}
      : { requiredSeconds, remainingSeconds: Math.max(0, requiredSeconds - combinedSeconds) }),
  };
}
