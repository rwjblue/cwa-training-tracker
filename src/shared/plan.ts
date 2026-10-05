import { lcwoRunDetails, type LcwoBackup } from './lcwo.ts';
import { lcwoContributions, lcwoContributionDetails, estimatedLcwoSessions } from './lcwo-practice.ts';
import { practiceAssessmentDetails } from './practice-assessment.ts';
import { onAirCategoryLabel } from './on-air-practice.ts';
import {
  addDays,
  courseMeetings,
  getPracticePurpose,
  isRequiredPractice,
  type PracticeKind,
  type PracticePurpose,
  type PracticeSession,
  type Profile,
} from './training.ts';
import { taskPracticeMetadata } from './practice-attribution.ts';
import { isRunnerSettings, type RunnerSettings } from './runner.ts';
import { defaultCopyRecipe, validateCopyRecipe, type CopyRecipe } from './copy-practice.ts';
import { copyAttemptReportDetails, savedCopyAttempt } from './copy-report.ts';
import {
  practiceSessionEvidenceDetails,
  recordingCompletedPasses,
  sessionEvidence,
} from './practice-evidence.ts';
import { recordingVariants } from './recordings.ts';
import { validateTaskRecordingMarks, type RecordingMarkSet } from './recording-marks.ts';
import { CW_EVENT_SCHEDULE, type CwEventId } from './cw-events.ts';

export type SendingSection = 'warm-up' | 'drill' | 'exercise';
export type PracticeExercise =
  | {
      type: 'live-event';
      eventId: CwEventId;
      url: string;
      /** Resolve against the owned plan, never a stale copied meeting instant. */
      deadline: 'associated-class' | 'practice-date';
    }
  | {
      type: 'audio';
      url?: string;
      characterWpm?: number;
      minimumPasses?: number;
      maximumPasses?: number;
      unresolved?: string;
    }
  | { type: 'sending'; url: string; sections: SendingSection[] }
  | { type: 'morse-runner'; url: string; settings: RunnerSettings }
  | {
      type: 'copy';
      url?: string;
      recipe: CopyRecipe;
      alternatives?: CopyRecipe[];
      repetitions?: number;
      targetAccuracy?: number;
      maximumAttempts?: number;
      requiresCharacterSelection?: boolean;
    }
  | { type: 'external'; url: string; characterWpm?: number };

/** Private homework and progress, with links to optional curriculum metadata. */
export interface PlannedTask {
  id: string;
  title: string;
  kind: PracticeKind;
  lesson?: number;
  dueDate?: string;
  link?: string;
  /** Omitted when the exercise has no explicit duration recommendation. */
  targetMinutes?: number;
  /** Distinguishes a learner's curriculum duration override from old generated defaults. */
  targetMinutesExplicit?: boolean;
  done: boolean;
  /** Hide earlier unfinished work from Today without completing it. */
  dismissedFromToday?: boolean;
  /** Calendar-date presentation pin; never an assignment reschedule. */
  pinnedForDate?: string;
  notes: string;
  createdAt: string;
  source?: 'manual' | 'legacy' | 'curriculum';
  curriculum?: { id: string; exerciseId: string; day: 1 | 2 | 3; sourceUrl: string };
  exercise?: PracticeExercise;
  /** Retained private review annotations, separate from listening measurements. */
  recordingMarks?: RecordingMarkSet[];
}

export const MAX_PLAN_TASKS = 2000;

/** A launch adapter; the private source link and original imported evidence stay intact. */
export function nativeCopyTask(task: PlannedTask): PlannedTask {
  if (task.exercise && task.exercise.type !== 'external') return task;
  const link = task.exercise?.type === 'external' ? task.exercise.url : task.link;
  if (!link) return task;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return task;
  }
  if (
    !['lcwo.net', 'www.lcwo.net'].includes(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return task;
  const path = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const route = path === '' || path === 'index.php' ? (url.searchParams.get('p') ?? '') : path;
  const modes = {
    groups: 'groups',
    wordtraining: 'words',
    callsigns: 'callsigns',
    plaintext: 'plaintext',
  } as const;
  const namedMode = modes[route as keyof typeof modes];
  // A generic ICR assignment historically linked to the LCWO home page. Other
  // LCWO tools (Koch, MorseMachine, QTC, etc.) are not equivalent to Code Groups.
  if (!namedMode && (route !== '' || task.kind !== 'icr')) return task;
  const mode =
    namedMode ??
    (/callsign|call[ -]?sign/i.test(task.title)
      ? 'callsigns'
      : /plain.?text|proverb/i.test(task.title)
        ? 'plaintext'
        : /word/i.test(task.title)
          ? 'words'
          : 'groups');
  const recipe = defaultCopyRecipe(mode);
  return {
    ...task,
    exercise: {
      type: 'copy',
      url: link,
      recipe,
      ...(mode === 'groups' ? { alternatives: [defaultCopyRecipe('words')] } : {}),
    },
  };
}

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

function exerciseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('Enter a full http or https exercise link.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a full http or https exercise link.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Enter an http or https link without embedded credentials.');
  return url.href;
}

function exerciseResource(value: unknown): PracticeExercise {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid exercise resource.');
  const input = value as Record<string, unknown>;
  if (
    !['audio', 'sending', 'external', 'morse-runner', 'copy', 'live-event'].includes(
      String(input.type),
    )
  )
    throw new Error('Choose a valid exercise resource type.');
  if (input.type === 'live-event') {
    if (
      Object.keys(input).some((key) => !['type', 'eventId', 'url', 'deadline'].includes(key)) ||
      !CW_EVENT_SCHEDULE.events.some((event) => event.id === input.eventId) ||
      !['associated-class', 'practice-date'].includes(String(input.deadline))
    )
      throw new Error('Choose a verified live event and its class or practice-date deadline.');
    return {
      type: 'live-event',
      eventId: input.eventId as CwEventId,
      url: exerciseUrl(input.url),
      deadline: input.deadline as 'associated-class' | 'practice-date',
    };
  }
  if (input.type === 'copy') {
    const result: Extract<PracticeExercise, { type: 'copy' }> = {
      type: 'copy',
      recipe: validateCopyRecipe(input.recipe),
    };
    if (input.url !== undefined) result.url = exerciseUrl(input.url);
    if (input.alternatives !== undefined) {
      if (!Array.isArray(input.alternatives) || input.alternatives.length > 8)
        throw new Error('Choose up to eight alternative copy recipes.');
      result.alternatives = input.alternatives.map(validateCopyRecipe);
    }
    for (const field of ['repetitions', 'maximumAttempts'] as const) {
      if (input[field] === undefined) continue;
      if (!Number.isInteger(input[field]) || Number(input[field]) < 1 || Number(input[field]) > 100)
        throw new Error('Copy repetitions must be between 1 and 100.');
      result[field] = input[field] as number;
    }
    if (input.targetAccuracy !== undefined) {
      if (
        typeof input.targetAccuracy !== 'number' ||
        !Number.isFinite(input.targetAccuracy) ||
        input.targetAccuracy < 0 ||
        input.targetAccuracy > 100
      )
        throw new Error('Copy accuracy target must be between 0 and 100.');
      result.targetAccuracy = input.targetAccuracy;
    }
    if (input.requiresCharacterSelection !== undefined) {
      if (typeof input.requiresCharacterSelection !== 'boolean')
        throw new Error('Invalid custom character selection requirement.');
      result.requiresCharacterSelection = input.requiresCharacterSelection;
    }
    return result;
  }
  if (input.type === 'morse-runner') {
    if (!isRunnerSettings(input.settings)) throw new Error('Choose valid Morse Runner settings.');
    return {
      type: 'morse-runner',
      url: exerciseUrl(input.url),
      settings: { ...input.settings, conditions: { ...input.settings.conditions } },
    };
  }
  if (input.type === 'sending') {
    if (
      !Array.isArray(input.sections) ||
      input.sections.length < 1 ||
      input.sections.length > 3 ||
      input.sections.some((section) => !['warm-up', 'drill', 'exercise'].includes(section)) ||
      new Set(input.sections).size !== input.sections.length
    )
      throw new Error('Choose valid sending sections.');
    return {
      type: 'sending',
      url: exerciseUrl(input.url),
      sections: input.sections as SendingSection[],
    };
  }
  const output: Extract<PracticeExercise, { type: 'audio' | 'external' }> =
    input.type === 'external'
      ? { type: 'external', url: exerciseUrl(input.url) }
      : { type: 'audio' };
  if (input.characterWpm !== undefined) {
    if (
      typeof input.characterWpm !== 'number' ||
      !Number.isFinite(input.characterWpm) ||
      input.characterWpm < 1 ||
      input.characterWpm > 150
    )
      throw new Error('Choose a valid exercise speed.');
    output.characterWpm = input.characterWpm;
  }
  if (output.type === 'audio') {
    if (input.url !== undefined) output.url = exerciseUrl(input.url);
    if (input.unresolved !== undefined) {
      if (
        typeof input.unresolved !== 'string' ||
        !input.unresolved.trim() ||
        input.unresolved.length > 500
      )
        throw new Error('Invalid unavailable recording note.');
      output.unresolved = input.unresolved.trim();
    }
    if (!output.url && !output.unresolved)
      throw new Error('A recording needs a link or an unavailable note.');
    for (const key of ['minimumPasses', 'maximumPasses'] as const) {
      if (input[key] === undefined) continue;
      if (
        typeof input[key] !== 'number' ||
        !Number.isInteger(input[key]) ||
        input[key] < 1 ||
        input[key] > 100
      )
        throw new Error('Recording repetitions must be between 1 and 100.');
      output[key] = input[key];
    }
    if (output.minimumPasses && output.maximumPasses && output.minimumPasses > output.maximumPasses)
      throw new Error('Maximum repetitions must not be below the minimum.');
  }
  return output;
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
    input.targetMinutes !== undefined &&
    (typeof input.targetMinutes !== 'number' ||
      !Number.isFinite(input.targetMinutes) ||
      input.targetMinutes < 1 ||
      input.targetMinutes > 1440)
  )
    throw new Error('Suggested minutes must be between 1 and 1440.');
  if (typeof input.done !== 'boolean')
    throw new Error('Exercise completion must be true or false.');
  if (input.dismissedFromToday !== undefined && typeof input.dismissedFromToday !== 'boolean')
    throw new Error('Exercise dismissal must be true or false.');
  if (input.targetMinutesExplicit !== undefined && typeof input.targetMinutesExplicit !== 'boolean')
    throw new Error('Exercise duration override must be true or false.');
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
    done: input.done,
    notes: String(input.notes ?? ''),
    createdAt: new Date(input.createdAt).toISOString(),
  };
  if (input.targetMinutes !== undefined) task.targetMinutes = input.targetMinutes as number;
  if (input.targetMinutesExplicit !== undefined)
    task.targetMinutesExplicit = input.targetMinutesExplicit as boolean;
  if (input.dismissedFromToday !== undefined)
    task.dismissedFromToday = input.dismissedFromToday as boolean;
  if (input.pinnedForDate !== undefined) {
    if (!validDate(input.pinnedForDate))
      throw new Error('Choose a real calendar date for the Today pin.');
    task.pinnedForDate = input.pinnedForDate as string;
  }
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
    if (input.source !== 'manual' && input.source !== 'legacy' && input.source !== 'curriculum')
      throw new Error('Invalid exercise source.');
    task.source = input.source;
  }
  if (input.exercise !== undefined) task.exercise = exerciseResource(input.exercise);
  if (input.curriculum !== undefined) {
    if (
      !input.curriculum ||
      typeof input.curriculum !== 'object' ||
      Array.isArray(input.curriculum)
    )
      throw new Error('Invalid curriculum reference.');
    const reference = input.curriculum as Record<string, unknown>;
    if (
      typeof reference.id !== 'string' ||
      !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,99}$/.test(reference.id) ||
      typeof reference.exerciseId !== 'string' ||
      !/^s(?:[1-9]|1[0-6])-d[1-3]-t\d{1,2}$/.test(reference.exerciseId) ||
      ![1, 2, 3].includes(Number(reference.day)) ||
      typeof reference.day !== 'number'
    )
      throw new Error('Invalid curriculum reference.');
    task.curriculum = {
      id: reference.id,
      exerciseId: reference.exerciseId,
      day: reference.day as 1 | 2 | 3,
      sourceUrl: exerciseUrl(reference.sourceUrl),
    };
  }
  if (input.recordingMarks !== undefined)
    task.recordingMarks = validateTaskRecordingMarks(input.recordingMarks, task.id);
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

export interface DailyPlannedTask {
  task: PlannedTask;
  dueDate?: string;
  status: 'ready' | 'started' | 'done';
  /** Only practice explicitly linked to this task, excluding class time. */
  loggedMinutes: number;
  todayMinutes: number;
  /** Observed native passes plus separately labelled explicit imported source counts. */
  completedPasses: number;
  importedCompletedPasses: number;
  remainingPasses?: number;
}

export interface SavedTaskProgress {
  loggedMinutes: number;
  todayMinutes: number;
  completedPasses: number;
  importedCompletedPasses: number;
  remainingPasses?: number;
}

/** Account-scoped finished entries only. The caller supplies the current owned plan. */
export function savedTaskProgress(
  tasks: readonly PlannedTask[],
  entries: readonly PracticeSession[],
  today: string,
  excludedEntryId?: string,
) {
  if (!validDate(today)) throw new Error('Choose a valid date for today’s plan.');
  const progress = new Map<string, SavedTaskProgress>();
  const ownedTasks = new Map(tasks.map((task) => [task.id, task]));
  const aliases = new Map<string, string>();
  for (const task of tasks) {
    progress.set(task.id, {
      loggedMinutes: 0,
      todayMinutes: 0,
      completedPasses: 0,
      importedCompletedPasses: 0,
      ...(task.exercise?.type === 'audio' && task.exercise.minimumPasses !== undefined
        ? { remainingPasses: task.exercise.minimumPasses }
        : {}),
    });
    if (!task.curriculum) continue;
    aliases.set(`curriculum:${task.curriculum.id}:${task.curriculum.exerciseId}`, task.id);
    // Unqualified legacy IDs came from the Intermediate-only personal course.
    // Another catalog may reuse s1-d1-t1 without inheriting that practice credit.
    if (task.curriculum.id.startsWith('cwa-intermediate-'))
      aliases.set(`legacy-task:${task.curriculum.exerciseId}`, task.id);
  }
  const seenEntries = new Set<string>();
  for (const entry of entries) {
    if (entry.id === excludedEntryId || seenEntries.has(entry.id)) continue;
    seenEntries.add(entry.id);
    if (
      !isRequiredPractice(entry) ||
      entry.historicalPlannedTaskId !== undefined ||
      !validDate(entry.date) ||
      entry.date > today ||
      !Number.isFinite(entry.minutes) ||
      entry.minutes < 0
    )
      continue;
    let taskId = entry.metadata?.plannedTaskId;
    if (typeof taskId !== 'string' && entry.source === 'legacy') {
      const original = entry.metadata?.legacyAttempt;
      if (original && typeof original === 'object' && !Array.isArray(original)) {
        const attempt = original as Record<string, unknown>;
        if (typeof attempt.taskId === 'string') taskId = `legacy-task:${attempt.taskId}`;
      }
    }
    if (typeof taskId !== 'string') continue;
    // A real current placement is authoritative; compatibility aliases only
    // recover an otherwise unavailable ID and cannot redirect another owned task.
    const progressId = ownedTasks.has(taskId) ? taskId : (aliases.get(taskId) ?? taskId);
    const task = ownedTasks.get(progressId);
    if (!task) continue;
    const total = progress.get(progressId)!;
    total.loggedMinutes += entry.minutes;
    if (entry.date === today) total.todayMinutes += entry.minutes;
    if (task.exercise?.type !== 'audio') continue;
    const evidence = sessionEvidence(entry.metadata);
    const url = task.exercise.url;
    const allowedUrls = new Set([
      ...(url ? [url] : []),
      ...recordingVariants(url).map((item) => item.url),
    ]);
    if (evidence?.type === 'timed') {
      if (entry.evidenceMode === 'historical') continue;
      total.completedPasses += evidence.recordings
        .filter((recording) => allowedUrls.has(recording.url))
        .reduce((sum, recording) => sum + (recordingCompletedPasses(recording) ?? 0), 0);
    } else if (entry.source === 'legacy') {
      const original = entry.metadata?.legacyAttempt;
      if (original && typeof original === 'object' && !Array.isArray(original)) {
        const count = (original as Record<string, unknown>).completedPasses;
        if (
          typeof count === 'number' &&
          Number.isSafeInteger(count) &&
          count >= 0 &&
          count <= 100
        ) {
          total.completedPasses += count;
          total.importedCompletedPasses += count;
        }
      }
    }
  }
  for (const [id, total] of progress) {
    const task = ownedTasks.get(id)!;
    if (task.exercise?.type === 'audio' && task.exercise.minimumPasses !== undefined)
      total.remainingPasses = Math.max(0, task.exercise.minimumPasses - total.completedPasses);
  }
  return progress;
}

/** Keep today's assignments ahead of earlier work, without advancing future daily work. */
export function dailyPlanSummary(
  tasks: readonly PlannedTask[],
  meetings: readonly { lesson: number; date: string }[],
  entries: readonly PracticeSession[],
  today: string,
) {
  const progress = savedTaskProgress(tasks, entries, today);
  const nextMeeting = [...meetings]
    .filter((meeting) => meeting.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const assignedToday: DailyPlannedTask[] = [];
  const preparation: DailyPlannedTask[] = [];
  const earlier: DailyPlannedTask[] = [];
  const pinned: DailyPlannedTask[] = [];
  const unscheduled: DailyPlannedTask[] = [];
  const future: DailyPlannedTask[] = [];
  const seenTasks = new Set<string>();
  for (const task of tasks) {
    if (seenTasks.has(task.id)) continue;
    seenTasks.add(task.id);
    const dueDate = taskDueDate(task, meetings);
    const minutes = progress.get(task.id)!;
    const item: DailyPlannedTask = {
      task,
      dueDate,
      ...minutes,
      status: task.done ? 'done' : minutes.loggedMinutes > 0 ? 'started' : 'ready',
    };
    if (dueDate === today) assignedToday.push(item);
    else if (dueDate && dueDate < today) {
      if (!task.done && task.pinnedForDate === today) pinned.push(item);
      else if (!task.done && !task.dismissedFromToday) earlier.push(item);
    } else if (dueDate && !task.dueDate && nextMeeting && task.lesson === nextMeeting.lesson)
      preparation.push(item);
    else if (dueDate) {
      if (!task.done) future.push(item);
    } else if (!task.done) unscheduled.push(item);
  }
  const compare = (a: DailyPlannedTask, b: DailyPlannedTask) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
    (a.task.lesson ?? 0) - (b.task.lesson ?? 0) ||
    a.task.createdAt.localeCompare(b.task.createdAt) ||
    a.task.id.localeCompare(b.task.id, undefined, { numeric: true });
  for (const group of [assignedToday, preparation, pinned, earlier, unscheduled, future])
    group.sort(compare);
  const current = [...assignedToday, ...preparation];
  const completed = current.filter((item) => item.task.done);
  const nextPracticeDate = future[0]?.dueDate;
  return {
    assignedToday: assignedToday.filter((item) => !item.task.done),
    preparation: preparation.filter((item) => !item.task.done),
    completed,
    pinned,
    earlier,
    unscheduled,
    upcoming: future.filter((item) => item.dueDate === nextPracticeDate),
    liveUpcoming: future.filter(
      (item) => item.task.exercise?.type === 'live-event' && item.dueDate! <= addDays(today, 7),
    ),
    nextPracticeDate,
    nextMeeting,
    currentCount: current.length,
    completedCount: completed.length,
    pendingCount: current.length - completed.length,
    hasUndatedLessons: unscheduled.some((item) => item.task.lesson !== undefined),
  };
}

/** Only new pins need eligibility checks. Historical pins survive completion and schedule edits. */
export function validateNewTaskPin(
  previous: PlannedTask | undefined,
  next: PlannedTask,
  profile: Profile,
): void {
  if (!next.pinnedForDate || next.pinnedForDate === previous?.pinnedForDate) return;
  const due = taskDueDate(next, courseMeetings(profile));
  if (next.done || !due || due >= next.pinnedForDate)
    throw new Error('Only earlier unfinished exercises can be added to Today.');
}

/** Practice credit and completing homework are deliberately separate decisions. */
export function practiceForTask(
  task: PlannedTask,
  date: string,
  purpose: PracticePurpose = 'assigned',
): Partial<PracticeSession> {
  return {
    date,
    kind: task.kind,
    lesson: task.lesson,
    ...(task.targetMinutes !== undefined ? { minutes: task.targetMinutes } : {}),
    notes: task.title,
    source: 'manual',
    metadata: taskPracticeMetadata(task.id, purpose),
  };
}

export function weeklyReport(
  entries: readonly PracticeSession[],
  profile: Profile,
  fromDate: string,
  toDate: string,
  lcwo?: Pick<LcwoBackup, 'runs' | 'estimateSeconds'> | null,
): string {
  if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate)
    throw new Error('Choose valid report dates.');
  const sourceRows = lcwoContributions(lcwo, entries, profile.timezone).filter(
    (row) => row.date >= fromDate && row.date <= toDate,
  );
  const estimates = estimatedLcwoSessions(sourceRows);
  const seenEntries = new Set<string>();
  const all = [...entries, ...estimates]
    .filter((entry) => {
      if (seenEntries.has(entry.id)) return false;
      seenEntries.add(entry.id);
      return true;
    })
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
    `${profile.dailyGoalMinutes} minutes is the optional personal daily target. Required goals apply only to dates with assignments. Class time is listed separately.`,
    '',
  ];
  for (const date of [...new Set(all.map((entry) => entry.date))]) {
    lines.push(date);
    for (const entry of all.filter((entry) => entry.date === date)) {
      const details = [
        `${minutes(entry.minutes)} min`,
        entry.kind,
        ...(entry.kind === 'on-air' && onAirCategoryLabel(entry.metadata?.onAirCategory)
          ? [onAirCategoryLabel(entry.metadata?.onAirCategory)!]
          : []),
        ...(entry.context === 'class' ? ['class'] : []),
        ...(getPracticePurpose(entry) === 'review'
          ? ['extra review (no required assignment credit)']
          : typeof entry.metadata?.plannedTaskId === 'string' || entry.historicalPlannedTaskId
            ? ['assigned practice']
            : []),
        ...(entry.lesson ? [`session ${entry.lesson}`] : []),
        ...(entry.characterWpm !== undefined
          ? [
              `${entry.characterWpm}${entry.effectiveWpm !== undefined ? `/${entry.effectiveWpm}` : ''} WPM`,
            ]
          : []),
        ...(entry.accuracy !== undefined ? [`${entry.accuracy}% accuracy`] : []),
      ];
      lines.push(`- ${details.join(' · ')}${entry.notes ? ` — ${entry.notes}` : ''}`);
      const material = entry.metadata?.instructorMaterial;
      if (material) lines.push(`  Instructor material: ${material.title}; exact version ${material.id}; session ${material.session}; ${material.course.level} course starts ${material.course.firstClassDate}${material.supersedesId ? `; revises ${material.supersedesId}` : ''}${material.origin ? `; original ID ${material.origin.id}; archive ${material.origin.archiveId}` : ''}.`);
      for (const detail of practiceAssessmentDetails(entry)) lines.push(`  ${detail}`);
      const attempt = savedCopyAttempt(entry);
      if (attempt) {
        for (const detail of copyAttemptReportDetails(attempt)) lines.push(`  ${detail}`);
      }
      for (const detail of practiceSessionEvidenceDetails(
        entry.metadata,
        entry.evidenceMode,
        entry.minutes,
      ))
        lines.push(`  ${detail}`);
    }
    lines.push('');
  }
  if (sourceRows.length) {
    lines.push('Authenticated LCWO source evidence (external, read-only)');
    lines.push(
      `${Number((sourceRows.reduce((sum, row) => sum + row.additionalSeconds, 0) / 60).toFixed(2))} additional estimated group minutes included above; assumption ${lcwo!.estimateSeconds} seconds per completed group. No measured duration is inferred.`,
    );
    for (const row of sourceRows) {
      lines.push(`${row.date} — ${row.run.id}`);
      for (const fact of lcwoRunDetails(row.run)) lines.push(`  ${fact}`);
      lines.push(`  ${lcwoContributionDetails(row, lcwo!.estimateSeconds)}`);
    }
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
  const resources = Array.isArray(course.resources) ? course.resources : [];
  const practice = [
    ...new Map(attempts.map((attempt, index) => [attempt.id ?? index, attempt])).values(),
  ].filter((attempt) => attempt.review !== true && attempt.context !== 'class');
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
      const relevant = practice.filter((attempt) => attempt.taskId === task.id);
      const runner =
        task.kind === 'simulator' &&
        /\bmorse[\s-]+runner\b/i.test(`${task.title} ${String(task.instructions ?? '')}`);
      const seconds = (attempt: Record<string, unknown>) =>
        typeof attempt.activeSeconds === 'number' && Number.isFinite(attempt.activeSeconds)
          ? Math.max(0, attempt.activeSeconds)
          : 0;
      const done = runner
        ? relevant.reduce((total, attempt) => total + seconds(attempt), 0) >=
          (typeof task.minutes === 'number' ? task.minutes : 15) * 60
        : task.kind === 'simulator' && typeof task.minutes === 'number'
          ? relevant.some(
              (attempt) =>
                attempt.completed === true && seconds(attempt) >= Number(task.minutes) * 60,
            )
          : relevant.some((attempt) => attempt.completed === true);
      const result: PlannedTask = {
        id: `legacy-task:${task.id}`,
        title: task.title,
        kind: legacyKinds[String(task.kind)] ?? 'other',
        ...(typeof task.minutes === 'number' && task.minutes > 0
          ? { targetMinutes: task.minutes, targetMinutesExplicit: true }
          : {}),
        done,
        notes: typeof task.instructions === 'string' ? task.instructions : '',
        createdAt,
        source: 'legacy',
      };
      if (typeof assignment.session === 'number') result.lesson = assignment.session;
      if (typeof assignment.date === 'string') result.dueDate = assignment.date;
      if (task.kind === 'live')
        result.exercise = {
          type: 'live-event',
          eventId: 'cwt',
          url: CW_EVENT_SCHEDULE.events.find((event) => event.id === 'cwt')!.rulesUrl,
          deadline: 'associated-class',
        };
      if (typeof task.sourceUrl === 'string' && task.sourceUrl) result.link = task.sourceUrl;
      // A task's source is often the syllabus; its resource is the actual recording.
      // Read only the learner's supplied archive and retain a safe source fallback.
      if (typeof task.resourceId === 'string' && task.resourceId) {
        const resource = resources.find(
          (value): value is Record<string, unknown> =>
            Boolean(value) &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            (value as Record<string, unknown>).id === task.resourceId,
        );
        if (resource && !resource.unresolved && typeof resource.url === 'string') {
          try {
            const url = new URL(resource.url);
            if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
              result.link = url.href;
          } catch {
            // Missing or malformed legacy resource URLs retain the syllabus link.
          }
        }
      }
      output.set(result.id, nativeCopyTask(validatePlannedTask(result)));
    }
  }
  return validatePlan([...output.values()]);
}
