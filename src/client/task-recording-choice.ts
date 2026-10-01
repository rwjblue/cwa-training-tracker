import { requireCurrentDeviceScope } from './device-scope';
import type { PlannedTask } from '../shared/plan';
import {
  eligibleRecordingVariants,
  loadRecordingSpeedPreference,
  RECORDING_URL_REPLACEMENTS,
  selectRecordingVariant,
  type RecordingVariant,
} from './recording-variants';

export const TASK_RECORDING_CHOICE_PREFIX = 'cwa.recording.choice.v1:';
export const MAX_TASK_RECORDING_CHOICES = 1000;
export interface TaskRecordingContext {
  taskId: string;
  assignedUrl: string;
  assignedWpm?: number;
}
export interface TaskRecordingChoice extends TaskRecordingContext {
  version: 1;
  assignedWpm: number;
  selectedUrl: string;
}
export interface TaskRecordingSelection {
  recording?: RecordingVariant;
  choice?: TaskRecordingChoice;
  status: 'default' | 'override' | 'invalid';
}
type ChoiceStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export function recordingContextForTask(
  task: PlannedTask | undefined,
): TaskRecordingContext | undefined {
  const exercise = task?.exercise;
  return task && exercise?.type === 'audio' && exercise.url
    ? { taskId: task.id, assignedUrl: exercise.url, assignedWpm: exercise.characterWpm }
    : undefined;
}
const currentUrl = (url: string) => RECORDING_URL_REPLACEMENTS[url] ?? url;
const validTaskId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 200 &&
  /^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(value);

export const taskRecordingChoiceKey = (scope: string, taskId: string) =>
  `${TASK_RECORDING_CHOICE_PREFIX}${JSON.stringify([scope, taskId])}`;

/** Exact registered scope, including damaged values, for inventory and retirement. */
export function taskRecordingChoiceTaskId(key: string, scope: string): string | undefined {
  if (!key.startsWith(TASK_RECORDING_CHOICE_PREFIX)) return undefined;
  try {
    const tuple: unknown = JSON.parse(key.slice(TASK_RECORDING_CHOICE_PREFIX.length));
    if (
      Array.isArray(tuple) &&
      tuple.length === 2 &&
      tuple[0] === scope &&
      validTaskId(tuple[1]) &&
      key === taskRecordingChoiceKey(scope, tuple[1])
    )
      return tuple[1];
  } catch {
    /* An unrelated key never selects a private scope. */
  }
  return undefined;
}

/** Strict portable preferences; only explicit catalog replacements are normalized. */
export function validateTaskRecordingChoice(value: unknown): TaskRecordingChoice {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A remembered recording choice must be an object.');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['version', 'taskId', 'assignedUrl', 'assignedWpm', 'selectedUrl'].includes(key),
    ) ||
    input.version !== 1 ||
    !validTaskId(input.taskId) ||
    typeof input.assignedUrl !== 'string' ||
    input.assignedUrl.length > 2000 ||
    typeof input.selectedUrl !== 'string' ||
    input.selectedUrl.length > 2000 ||
    typeof input.assignedWpm !== 'number' ||
    !Number.isFinite(input.assignedWpm) ||
    input.assignedWpm <= 0 ||
    input.assignedWpm > 100
  )
    throw new Error('A remembered recording choice has invalid fields.');
  const selectedUrl = currentUrl(input.selectedUrl);
  if (
    !eligibleRecordingVariants(input.assignedUrl, input.assignedWpm).some(
      (variant) => variant.url === selectedUrl,
    )
  )
    throw new Error(
      'A remembered recording must be a verified, prescribed-or-faster file from the same exercise.',
    );
  return {
    version: 1,
    taskId: input.taskId,
    assignedUrl: currentUrl(input.assignedUrl),
    assignedWpm: input.assignedWpm,
    selectedUrl,
  };
}

/** Read only on a new launch; an inspected block retains its own actual source. */
export function resolveTaskRecordingChoice(
  scope: string,
  context: TaskRecordingContext,
  storage?: Pick<Storage, 'getItem'>,
): TaskRecordingSelection {
  const fallback = selectRecordingVariant(
    context.assignedUrl,
    context.assignedWpm,
    loadRecordingSpeedPreference(storage),
  );
  try {
    const target = storage ?? window.localStorage;
    const raw = target.getItem(taskRecordingChoiceKey(scope, context.taskId));
    if (raw === null) return { recording: fallback, status: 'default' as const };
    if (raw.length > 6000) throw new Error('Oversized choice');
    const choice = validateTaskRecordingChoice(JSON.parse(raw));
    if (
      choice.taskId !== context.taskId ||
      choice.assignedWpm !== context.assignedWpm ||
      choice.assignedUrl !== currentUrl(context.assignedUrl)
    )
      throw new Error('Changed assignment');
    return {
      recording: eligibleRecordingVariants(context.assignedUrl, context.assignedWpm).find(
        (variant) => variant.url === choice.selectedUrl,
      ),
      choice,
      status: 'override' as const,
    };
  } catch {
    // Unknown, malformed or unreadable data never becomes an implicit override.
    return { recording: fallback, status: 'invalid' as const };
  }
}

/** Per-task writes cannot overwrite another task's choice or a retired owner's work. */
export function saveTaskRecordingChoice(
  scope: string,
  token: string,
  choice: TaskRecordingChoice,
  storage?: ChoiceStorage,
): boolean {
  try {
    requireCurrentDeviceScope(scope, token);
    const target = storage ?? window.localStorage;
    const checked = validateTaskRecordingChoice(choice);
    const key = taskRecordingChoiceKey(scope, checked.taskId);
    if (target.getItem(key) === null) {
      let count = 0;
      for (let index = 0; index < target.length; index++) {
        const name = target.key(index);
        if (name !== null && taskRecordingChoiceTaskId(name, scope)) count++;
      }
      if (count >= MAX_TASK_RECORDING_CHOICES) return false;
    }
    const raw = JSON.stringify(checked);
    target.setItem(key, raw);
    return target.getItem(key) === raw;
  } catch {
    return false;
  }
}

export function clearTaskRecordingChoice(
  scope: string,
  token: string,
  taskId: string,
  storage?: Pick<Storage, 'removeItem' | 'getItem'>,
): boolean {
  try {
    requireCurrentDeviceScope(scope, token);
    const target = storage ?? window.localStorage;
    if (!validTaskId(taskId)) return false;
    const key = taskRecordingChoiceKey(scope, taskId);
    target.removeItem(key);
    return target.getItem(key) === null;
  } catch {
    return false;
  }
}
