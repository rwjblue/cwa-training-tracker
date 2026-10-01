import { recordingVariants } from './recordings.ts';

export interface RecordingMark {
  id: string;
  positionSeconds: number;
  label?: string;
}
/** Private annotations; their timestamps belong only to this exact native file. */
export interface RecordingMarkSet {
  taskId: string;
  url: string;
  speedWpm: number;
  marks: RecordingMark[];
}
export const MAX_RECORDING_MARKS = 50;
export const MAX_TASK_RECORDING_MARKS = 200;
export const MAX_RECORDING_MARK_LABEL = 120;

const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 200 &&
  /^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(value);

function record(value: unknown, fields: string[], label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new Error(`${label} contains invalid or unsupported fields.`);
  return value as Record<string, unknown>;
}

export function validateRecordingMarkSet(value: unknown): RecordingMarkSet {
  const row = record(value, ['taskId', 'url', 'speedWpm', 'marks'], 'Difficult recording marks');
  const variant =
    typeof row.url === 'string'
      ? recordingVariants(row.url).find((item) => item.url === row.url)
      : undefined;
  if (!validId(row.taskId) || !variant || row.speedWpm !== variant.speedWpm)
    throw new Error('Difficult marks require their task and exact verified native recording/WPM.');
  if (!Array.isArray(row.marks) || !row.marks.length || row.marks.length > MAX_RECORDING_MARKS)
    throw new Error(`Keep between 1 and ${MAX_RECORDING_MARKS} difficult marks per recording.`);
  const marks = row.marks.map((value): RecordingMark => {
    const mark = record(value, ['id', 'positionSeconds', 'label'], 'Difficult mark');
    if (
      !validId(mark.id) ||
      typeof mark.positionSeconds !== 'number' ||
      !Number.isFinite(mark.positionSeconds) ||
      mark.positionSeconds < 0 ||
      mark.positionSeconds > Math.min(86400, variant.durationSeconds ?? 86400)
    )
      throw new Error('A difficult mark needs an ID and a finite position inside its recording.');
    if (
      mark.label !== undefined &&
      (typeof mark.label !== 'string' || mark.label.length > MAX_RECORDING_MARK_LABEL)
    )
      throw new Error(
        `A difficult mark label must be at most ${MAX_RECORDING_MARK_LABEL} characters.`,
      );
    const label = typeof mark.label === 'string' ? mark.label.trim() : '';
    return { id: mark.id, positionSeconds: mark.positionSeconds, ...(label ? { label } : {}) };
  });
  if (new Set(marks.map((mark) => mark.id)).size !== marks.length)
    throw new Error('Difficult mark IDs must be distinct.');
  return { taskId: row.taskId, url: variant.url, speedWpm: variant.speedWpm, marks };
}

export function validateTaskRecordingMarks(value: unknown, taskId: string): RecordingMarkSet[] {
  if (!Array.isArray(value) || value.length > MAX_TASK_RECORDING_MARKS)
    throw new Error('Task difficult marks must be a bounded list of exact recordings.');
  const sets = value.map(validateRecordingMarkSet);
  if (
    sets.some((set) => set.taskId !== taskId) ||
    new Set(sets.map((set) => set.url)).size !== sets.length
  )
    throw new Error('Difficult marks must belong to this task and distinct exact recordings.');
  const ids = sets.flatMap((set) => set.marks.map((mark) => mark.id));
  if (ids.length > MAX_TASK_RECORDING_MARKS || new Set(ids).size !== ids.length)
    throw new Error(`Keep at most ${MAX_TASK_RECORDING_MARKS} distinct difficult marks per task.`);
  return sets;
}

export function recordingMarkTimestamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** A relative replay deliberately starts playback; generated Back 10 sec is separate. */
export function recordingReplayPosition(position: number, duration: number): number | undefined {
  return Number.isFinite(position) &&
    position >= 0 &&
    Number.isFinite(duration) &&
    duration > 0 &&
    duration <= 86400
    ? Math.max(0, Math.min(position, duration) - 8)
    : undefined;
}

export function recordingMarkSetDetails(set: RecordingMarkSet): string {
  return `${set.speedWpm} WPM (${set.url}): ${set.marks.map((mark) => `${recordingMarkTimestamp(mark.positionSeconds)}${mark.label ? ` — ${mark.label}` : ''}`).join('; ')}`;
}
