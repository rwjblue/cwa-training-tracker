import type { PracticeKind, PracticeSession, Profile } from './training';

/** Personal homework, not a preloaded copy of an official curriculum. */
export interface PlannedTask {
  id: string;
  title: string;
  kind: PracticeKind;
  lesson?: number;
  dueDate?: string;
  link?: string;
  targetMinutes: number;
  done: boolean;
  notes: string;
  createdAt: string;
  source?: 'manual' | 'legacy';
}

export const MAX_PLAN_TASKS = 2000;
const kinds: PracticeKind[] = [
  'listening',
  'sending',
  'head-copy',
  'icr',
  'simulator',
  'on-air',
  'other',
];

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePlannedTask(value: unknown): PlannedTask {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A planned exercise must be an object.');
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== 'string' ||
    input.id.length > 200 ||
    !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(input.id)
  )
    throw new Error('Invalid exercise ID.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200)
    throw new Error('Give this exercise a title of up to 200 characters.');
  if (!kinds.includes(input.kind as PracticeKind))
    throw new Error('Choose a valid exercise activity.');
  if (
    typeof input.targetMinutes !== 'number' ||
    !Number.isFinite(input.targetMinutes) ||
    input.targetMinutes < 1 ||
    input.targetMinutes > 1440
  )
    throw new Error('Suggested minutes must be between 1 and 1440.');
  if (typeof input.done !== 'boolean')
    throw new Error('Exercise completion must be true or false.');
  if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 10000))
    throw new Error('Exercise notes must be at most 10,000 characters.');
  if (
    typeof input.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.createdAt) ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    !validDate(input.createdAt.slice(0, 10))
  )
    throw new Error('Invalid exercise creation time.');
  const task: PlannedTask = {
    id: input.id,
    title: input.title.trim(),
    kind: input.kind as PracticeKind,
    targetMinutes: input.targetMinutes,
    done: input.done,
    notes: String(input.notes ?? ''),
    createdAt: new Date(input.createdAt).toISOString(),
  };
  if (input.lesson !== undefined) {
    if (
      typeof input.lesson !== 'number' ||
      !Number.isInteger(input.lesson) ||
      input.lesson < 1 ||
      input.lesson > 16
    )
      throw new Error('Class session must be between 1 and 16.');
    task.lesson = input.lesson;
  }
  if (input.dueDate !== undefined && input.dueDate !== '') {
    if (!validDate(input.dueDate)) throw new Error('Choose a valid exercise date.');
    task.dueDate = input.dueDate;
  }
  if (input.link !== undefined && input.link !== '') {
    if (typeof input.link !== 'string' || input.link.length > 2048)
      throw new Error('Exercise link is too long.');
    let url: URL;
    try {
      url = new URL(input.link);
    } catch {
      throw new Error('Enter a full http or https exercise link.');
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Enter an http or https link without embedded credentials.');
    task.link = url.href;
  }
  if (input.source !== undefined) {
    if (input.source !== 'manual' && input.source !== 'legacy')
      throw new Error('Invalid exercise source.');
    task.source = input.source;
  }
  return task;
}

export function validatePlan(value: unknown): PlannedTask[] {
  if (!Array.isArray(value) || value.length > MAX_PLAN_TASKS)
    throw new Error(`A plan may contain up to ${MAX_PLAN_TASKS} exercises.`);
  const tasks = value.map(validatePlannedTask);
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
    throw new Error('The plan contains duplicate exercise IDs.');
  return tasks;
}

export function taskDueDate(
  task: PlannedTask,
  meetings: readonly { lesson: number; date: string }[],
): string | undefined {
  return task.dueDate ?? meetings.find((meeting) => meeting.lesson === task.lesson)?.date;
}

/** Practice credit and completing homework are deliberately separate decisions. */
export function practiceForTask(task: PlannedTask, date: string): Partial<PracticeSession> {
  return {
    date,
    kind: task.kind,
    lesson: task.lesson,
    minutes: task.targetMinutes,
    notes: task.title,
    source: 'manual',
    metadata: { plannedTaskId: task.id },
  };
}

export function weeklyReport(
  entries: readonly PracticeSession[],
  profile: Profile,
  fromDate: string,
  toDate: string,
): string {
  if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate)
    throw new Error('Choose valid report dates.');
  const all = entries
    .filter((entry) => entry.date >= fromDate && entry.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const practice = all.filter((entry) => entry.context !== 'class');
  const minutes = (value: number) => Number(value.toFixed(2)).toString();
  const total = practice.reduce((sum, entry) => sum + entry.minutes, 0);
  const label = profile.callsign || profile.displayName || 'CW practice';
  const lines = [
    `${label} — practice report`,
    `${fromDate} through ${toDate} (${profile.timezone})`,
    '',
    `${minutes(total)} independent-practice minutes across ${new Set(practice.filter((entry) => entry.minutes > 0).map((entry) => entry.date)).size} days.`,
    `${profile.dailyGoalMinutes} minutes is the daily target. Class time is listed separately.`,
    '',
  ];
  for (const date of [...new Set(all.map((entry) => entry.date))]) {
    lines.push(date);
    for (const entry of all.filter((entry) => entry.date === date)) {
      const details = [
        `${minutes(entry.minutes)} min`,
        entry.kind,
        ...(entry.context === 'class' ? ['class'] : []),
        ...(entry.lesson ? [`session ${entry.lesson}`] : []),
        ...(entry.characterWpm !== undefined
          ? [
              `${entry.characterWpm}${entry.effectiveWpm !== undefined ? `/${entry.effectiveWpm}` : ''} WPM`,
            ]
          : []),
        ...(entry.accuracy !== undefined ? [`${entry.accuracy}% accuracy`] : []),
        ...(entry.qsoCount !== undefined ? [`${entry.qsoCount} QSOs`] : []),
      ];
      lines.push(`- ${details.join(' · ')}${entry.notes ? ` — ${entry.notes}` : ''}`);
    }
    lines.push('');
  }
  if (!all.length) lines.push('No practice entries in this date range.');
  return lines.join('\n');
}

/** Convert only data supplied by the learner, preserving source instructions privately. */
export function legacyPlan(
  course: Record<string, unknown>,
  attempts: readonly Record<string, unknown>[],
  createdAt: string,
): PlannedTask[] {
  const assignments = Array.isArray(course.assignments) ? course.assignments : [];
  const completion = new Set(
    attempts
      .filter(
        (attempt) =>
          attempt.completed === true && attempt.review !== true && attempt.context !== 'class',
      )
      .map((attempt) => String(attempt.taskId)),
  );
  const legacyKinds: Record<string, PracticeKind> = {
    sending: 'sending',
    audio: 'listening',
    icr: 'icr',
    simulator: 'simulator',
    live: 'on-air',
    review: 'other',
  };
  const output = new Map<string, PlannedTask>();
  for (const value of assignments) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const assignment = value as Record<string, unknown>;
    if (!Array.isArray(assignment.tasks)) continue;
    for (const value of assignment.tasks) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const task = value as Record<string, unknown>;
      if (typeof task.id !== 'string' || typeof task.title !== 'string')
        throw new Error('A legacy course exercise is missing its ID or title.');
      const result: PlannedTask = {
        id: `legacy-task:${task.id}`,
        title: task.title,
        kind: legacyKinds[String(task.kind)] ?? 'other',
        targetMinutes: typeof task.minutes === 'number' && task.minutes > 0 ? task.minutes : 15,
        done: completion.has(task.id),
        notes: typeof task.instructions === 'string' ? task.instructions : '',
        createdAt,
        source: 'legacy',
      };
      if (typeof assignment.session === 'number') result.lesson = assignment.session;
      if (typeof assignment.date === 'string') result.dueDate = assignment.date;
      if (typeof task.sourceUrl === 'string' && task.sourceUrl) result.link = task.sourceUrl;
      output.set(result.id, validatePlannedTask(result));
    }
  }
  return validatePlan([...output.values()]);
}
