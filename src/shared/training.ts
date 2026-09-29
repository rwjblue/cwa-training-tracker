import { legacyPlan, validatePlan, type PlannedTask } from './plan.ts';

/** Public domain model. Course instructions and personal records stay private. */
export type CourseLevel = 'beginner' | 'fundamental' | 'intermediate' | 'advanced';
export type PracticeKind =
  'listening' | 'sending' | 'head-copy' | 'icr' | 'simulator' | 'on-air' | 'other';

export interface Profile {
  displayName: string;
  callsign: string;
  /** Loading a Gravatar contacts its external provider; missing means no consent. */
  useGravatar?: boolean;
  level: CourseLevel;
  timezone: string;
  dailyGoalMinutes: number;
  firstClassDate: string;
  /** JavaScript weekdays: Sunday = 0, Monday = 1, Saturday = 6. */
  classDays: number[];
}

export interface PracticeSession {
  id: string;
  /** Calendar date in the learner's timezone, independent of upload time. */
  date: string;
  kind: PracticeKind;
  minutes: number;
  characterWpm?: number;
  effectiveWpm?: number;
  accuracy?: number;
  notes: string;
  lesson?: number;
  qsoCount?: number;
  context?: 'practice' | 'class';
  source?: 'manual' | 'timer' | 'morse' | 'legacy';
  sourceId?: string;
  createdAt: string;
  /** Original imported metrics remain available for future migrations. */
  metadata?: Record<string, unknown>;
}

export interface TrainingExport {
  format: 'cwa-training-tracker';
  version: 1;
  exportedAt: string;
  profile?: Profile;
  sessions: PracticeSession[];
  plan?: PlannedTask[];
  /** Retain privately and include in future exports; never publish this data. */
  legacy?: { source: 'rwjblue.com'; data: unknown };
}

export const DEFAULT_PROFILE: Profile = {
  displayName: '',
  callsign: '',
  useGravatar: false,
  level: 'beginner',
  timezone: 'UTC',
  dailyGoalMinutes: 60,
  firstClassDate: '',
  classDays: [1, 4],
};

export const COURSE_LEVELS: { id: CourseLevel; label: string; description: string }[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Build a foundation in characters, sending, and your first conversations.',
  },
  {
    id: 'fundamental',
    label: 'Fundamental',
    description: 'Make character recognition automatic and build comfortable QSOs.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    description: 'Hear words as sounds and grow your confidence on the air.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Develop fluent head copy and confident higher-speed operating.',
  },
];

export const PRACTICE_KINDS: { id: PracticeKind; label: string; description: string }[] = [
  {
    id: 'listening',
    label: 'Listening',
    description: 'Listen to recordings, stories, or practice audio.',
  },
  {
    id: 'sending',
    label: 'Sending',
    description: 'Practice clear rhythm and spacing on your key.',
  },
  {
    id: 'head-copy',
    label: 'Head copy',
    description: 'Recognize words and phrases without writing each character.',
  },
  {
    id: 'icr',
    label: 'Character recognition',
    description: "Connect a character's sound directly to its meaning.",
  },
  {
    id: 'simulator',
    label: 'Simulator',
    description: 'Practice callsigns and exchanges in a contest trainer.',
  },
  {
    id: 'on-air',
    label: 'On the air',
    description: 'Log conversations, events, or deliberate on-air listening.',
  },
  { id: 'other', label: 'Other practice', description: 'Capture any other focused CW practice.' },
];

/** Links, not copies of official assignments. Verified September 2026. */
export const PUBLIC_RESOURCES = [
  {
    id: 'curriculum',
    title: 'CW Academy student resources',
    description: 'Official assignments, practice recordings, and trainer guides for every level.',
    url: 'https://cwops.org/cw-academy/cw-academy-student-resources/',
    category: 'Official',
  },
  {
    id: 'academy',
    title: 'Find your CW Academy level',
    description: 'Explore the courses and register with CW Academy.',
    url: 'https://cwops.org/cw-academy/cw-academy-options/',
    category: 'Official',
  },
  {
    id: 'lcwo',
    title: 'Learn CW Online',
    description: 'Character, word, and callsign practice in your browser.',
    url: 'https://lcwo.net/',
    category: 'Practice',
  },
  {
    id: 'morse-world',
    title: 'Morse Code World',
    description: 'Morse tools and a configurable international Morse trainer.',
    url: 'https://morsecode.world/international/trainer/',
    category: 'Practice',
  },
  {
    id: 'ninja',
    title: 'Morse Code Ninja',
    description: 'Practice audio for listening and building head-copy fluency.',
    url: 'https://morsecode.ninja/practice/',
    category: 'Listening',
  },
  {
    id: 'cwt',
    title: 'CWops Tests',
    description: 'Find official CWT schedules, exchanges, and operating information.',
    url: 'https://cwops.org/cwops-tests/',
    category: 'On the air',
  },
] as const;

/** Original planning prompts, not a CW Academy syllabus or assigned homework. */
export const COURSE_ROADMAP = [
  {
    week: 1,
    title: 'Find your rhythm',
    description:
      "Set up your practice space, follow your advisor's first assignments, and record a starting point.",
    focus: ['Daily routine', 'Starting point'],
  },
  {
    week: 2,
    title: 'Build consistency',
    description:
      'Make room for short focused sessions. Notice which sounds and spacing need another pass.',
    focus: ['Recognition', 'Sending rhythm'],
  },
  {
    week: 3,
    title: 'Listen with intention',
    description:
      'Keep a note of what you hear comfortably and bring recurring difficulties to your advisor.',
    focus: ['Listening', 'Feedback'],
  },
  {
    week: 4,
    title: 'Take stock',
    description: 'Review your practice balance and compare how it feels with your first week.',
    focus: ['Reflection', 'Balanced practice'],
  },
  {
    week: 5,
    title: 'Connect the sounds',
    description:
      'Give familiar words and exchanges room to become automatic at your current level.',
    focus: ['Head copy', 'Fluency'],
  },
  {
    week: 6,
    title: 'Practice with purpose',
    description: 'Choose one useful improvement, then record what changed after practicing it.',
    focus: ['Focused repetition', 'Progress notes'],
  },
  {
    week: 7,
    title: 'Build confidence',
    description:
      "Apply your advisor's guidance to conversations and exercises suited to your experience.",
    focus: ['Conversations', 'Confidence'],
  },
  {
    week: 8,
    title: 'Keep the habit',
    description:
      'Celebrate the work you put in and choose a sustainable practice routine for what comes next.',
    focus: ['Reflection', 'Next steps'],
  },
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${label} must be text of at most ${max} characters.`);
  return value;
}

function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`,
    );
  }
  return value;
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateInTimezone(value: string | Date = new Date(), timezone = 'UTC'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day']
    .map((key) => parts.find((part) => part.type === key)!.value)
    .join('-');
}

export function addDays(date: string, count: number): string {
  if (!isCalendarDate(date) || !Number.isInteger(count))
    throw new Error('Invalid calendar date or day count.');
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function validateProfile(value: unknown): Profile {
  const input = record(value, 'Profile');
  const level = input.level ?? DEFAULT_PROFILE.level;
  if (!COURSE_LEVELS.some((item) => item.id === level))
    throw new Error('Choose a valid course level.');
  const timezone = text(input.timezone, 'Timezone', 100, DEFAULT_PROFILE.timezone);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new Error('Choose a valid timezone.');
  }
  const firstClassDate = text(input.firstClassDate, 'First class date', 10, '');
  if (firstClassDate && !isCalendarDate(firstClassDate))
    throw new Error('Choose a valid first class date.');
  const classDays = input.classDays ?? DEFAULT_PROFILE.classDays;
  if (!Array.isArray(classDays) || classDays.length < 1 || classDays.length > 7)
    throw new Error('Choose at least one class day.');
  classDays.forEach((day) => number(day, 'Class day', 0, 6, true));
  if (new Set(classDays).size !== classDays.length) throw new Error('Class days must be unique.');
  if (input.useGravatar !== undefined && typeof input.useGravatar !== 'boolean')
    throw new Error('The Gravatar preference must be true or false.');
  return {
    displayName: text(input.displayName, 'Display name', 100, '').trim(),
    callsign: text(input.callsign, 'Callsign', 30, '').trim().toUpperCase(),
    useGravatar: input.useGravatar === true,
    level: level as CourseLevel,
    timezone,
    dailyGoalMinutes: number(
      input.dailyGoalMinutes ?? DEFAULT_PROFILE.dailyGoalMinutes,
      'Daily goal',
      5,
      480,
      true,
    ),
    firstClassDate,
    classDays: [...classDays].sort((a, b) => a - b),
  };
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !isCalendarDate(result.slice(0, 10)) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error(`${label} must be an ISO timestamp with a timezone.`);
  return new Date(result).toISOString();
}

export function validatePracticeSession(value: unknown): PracticeSession {
  const input = record(value, 'Practice session');
  const id = text(input.id, 'Session ID', 200);
  if (!/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(id))
    throw new Error('Session ID contains unsupported characters.');
  if (!isCalendarDate(input.date)) throw new Error('Choose a valid practice date.');
  if (!PRACTICE_KINDS.some((item) => item.id === input.kind))
    throw new Error('Choose a valid practice activity.');
  const session: PracticeSession = {
    id,
    date: input.date,
    kind: input.kind as PracticeKind,
    minutes: number(input.minutes, 'Practice minutes', 0, 1440),
    notes: text(input.notes, 'Notes', 10000, ''),
    createdAt: timestamp(input.createdAt, 'Created time'),
  };
  if (input.characterWpm !== undefined)
    session.characterWpm = number(input.characterWpm, 'Character speed', 1, 150);
  if (input.effectiveWpm !== undefined)
    session.effectiveWpm = number(input.effectiveWpm, 'Effective speed', 1, 150);
  if (
    session.characterWpm !== undefined &&
    session.effectiveWpm !== undefined &&
    session.effectiveWpm > session.characterWpm
  )
    throw new Error('Effective speed cannot exceed character speed.');
  if (input.accuracy !== undefined) session.accuracy = number(input.accuracy, 'Accuracy', 0, 100);
  if (input.lesson !== undefined) session.lesson = number(input.lesson, 'Lesson', 1, 16, true);
  if (input.qsoCount !== undefined)
    session.qsoCount = number(input.qsoCount, 'QSO count', 0, 100000, true);
  if (input.context !== undefined) {
    if (input.context !== 'practice' && input.context !== 'class')
      throw new Error('Invalid practice context.');
    session.context = input.context;
  }
  if (input.source !== undefined) {
    if (!['manual', 'timer', 'morse', 'legacy'].includes(String(input.source)))
      throw new Error('Invalid practice source.');
    session.source = input.source as PracticeSession['source'];
  }
  if (input.sourceId !== undefined) session.sourceId = text(input.sourceId, 'Source ID', 200);
  if (input.metadata !== undefined) {
    const metadata = record(input.metadata, 'Session metadata');
    if (JSON.stringify(metadata).length > 200000) throw new Error('Session metadata is too large.');
    session.metadata = metadata;
  }
  return session;
}

export function validateTrainingExport(value: unknown): TrainingExport {
  const input = record(value, 'Import');
  if (input.format !== 'cwa-training-tracker' || input.version !== 1)
    throw new Error('Unsupported training export format or version.');
  if (!Array.isArray(input.sessions) || input.sessions.length > 20000)
    throw new Error('Import must contain up to 20,000 sessions.');
  const sessions = input.sessions.map(validatePracticeSession);
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length)
    throw new Error('Import contains duplicate session IDs.');
  const result: TrainingExport = {
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: timestamp(input.exportedAt, 'Exported time'),
    sessions,
  };
  if (input.profile !== undefined) result.profile = validateProfile(input.profile);
  if (input.plan !== undefined) result.plan = validatePlan(input.plan);
  if (input.legacy !== undefined) {
    const legacy = record(input.legacy, 'Legacy archive');
    if (legacy.source !== 'rwjblue.com' || legacy.data === undefined)
      throw new Error('Invalid legacy archive.');
    result.legacy = { source: 'rwjblue.com', data: legacy.data };
  }
  return result;
}

export function courseMeetings(
  profile: Pick<Profile, 'firstClassDate' | 'classDays'>,
  count = 16,
): { lesson: number; week: number; date: string }[] {
  if (!profile.firstClassDate) return [];
  if (
    !isCalendarDate(profile.firstClassDate) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !profile.classDays.length ||
    profile.classDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new Error('Invalid course schedule.');
  const meetings: { lesson: number; week: number; date: string }[] = [];
  let date = profile.firstClassDate;
  for (let offset = 0; meetings.length < count; offset += 1, date = addDays(date, 1)) {
    // The explicitly chosen first meeting is retained even for an exceptional day.
    if (offset === 0 || profile.classDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) {
      meetings.push({ lesson: meetings.length + 1, week: Math.floor(offset / 7) + 1, date });
    }
  }
  return meetings;
}

export function summarizePractice(sessions: readonly PracticeSession[], today: string, goal = 60) {
  if (!isCalendarDate(today)) throw new Error('Invalid summary date.');
  const daily = new Map<string, number>();
  const ids = new Set<string>();
  for (const session of sessions) {
    if (ids.has(session.id)) continue;
    ids.add(session.id);
    if (
      session.context === 'class' ||
      !isCalendarDate(session.date) ||
      !Number.isFinite(session.minutes) ||
      session.minutes <= 0 ||
      session.date > today
    )
      continue;
    daily.set(session.date, (daily.get(session.date) ?? 0) + session.minutes);
  }
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = addDays(today, -(weekday + 6) % 7);
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(weekStart, index),
    minutes: daily.get(addDays(weekStart, index)) ?? 0,
  }));
  let currentStreak = 0;
  let cursor = daily.has(today) ? today : addDays(today, -1);
  while (daily.has(cursor)) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }
  let bestStreak = 0,
    streak = 0,
    previous = '';
  for (const date of [...daily.keys()].sort()) {
    streak = previous && addDays(previous, 1) === date ? streak + 1 : 1;
    bestStreak = Math.max(bestStreak, streak);
    previous = date;
  }
  const todayMinutes = daily.get(today) ?? 0;
  return {
    todayMinutes,
    weekMinutes: days.reduce((total, day) => total + day.minutes, 0),
    totalMinutes: [...daily.values()].reduce((a, b) => a + b, 0),
    practiceDays: daily.size,
    currentStreak,
    bestStreak,
    todayGoalPercent: goal > 0 ? Math.min(100, Math.round((todayMinutes / goal) * 100)) : 0,
    days,
  };
}

function legacyKind(attempt: Record<string, unknown>, task: Record<string, unknown>): PracticeKind {
  const id = String(attempt.taskId ?? '');
  if (
    id === 'other:word-recognition' ||
    id.startsWith('word-practice') ||
    id.startsWith('qso-practice')
  )
    return 'head-copy';
  if (id === 'other:icr') return 'icr';
  if (['other:pota', 'other:cwt', 'other:on-air'].includes(id)) return 'on-air';
  const kinds: Record<string, PracticeKind> = {
    sending: 'sending',
    audio: 'listening',
    icr: 'icr',
    simulator: 'simulator',
    live: 'on-air',
    review: 'other',
  };
  return kinds[String(task.kind)] ?? 'other';
}

/** Convert a browser export or raw private snapshot without reading any network data. */
export function convertLegacyExport(value: unknown): TrainingExport {
  const input = record(value, 'Legacy export');
  if (input.format === 'cwa-training-tracker') return validateTrainingExport(input);
  const snapshot = record(input.snapshot ?? input, 'Legacy snapshot');
  const course = record(snapshot.course, 'Legacy course');
  if (!Array.isArray(snapshot.attempts))
    throw new Error('Legacy snapshot must contain an attempts array.');
  const timezone = typeof course.timezone === 'string' ? course.timezone : 'UTC';
  const assignments = Array.isArray(course.assignments) ? course.assignments : [];
  const tasks = new Map<string, { task: Record<string, unknown>; lesson?: number }>();
  for (const assignmentValue of assignments) {
    const assignment = record(assignmentValue, 'Legacy assignment');
    if (!Array.isArray(assignment.tasks)) continue;
    for (const taskValue of assignment.tasks) {
      const task = record(taskValue, 'Legacy task');
      tasks.set(String(task.id), {
        task,
        lesson: typeof assignment.session === 'number' ? assignment.session : undefined,
      });
    }
  }
  const pending = input.pending === undefined ? {} : record(input.pending, 'Pending legacy data');
  if (pending.attempts !== undefined && !Array.isArray(pending.attempts))
    throw new Error('Pending legacy attempts must be an array.');
  const attempts = new Map<string, Record<string, unknown>>();
  for (const value of [
    ...snapshot.attempts,
    ...(Array.isArray(pending.attempts) ? pending.attempts : []),
  ]) {
    const attempt = record(value, 'Legacy attempt');
    if (typeof attempt.id !== 'string' || !attempt.id)
      throw new Error('Legacy attempt is missing its ID.');
    attempts.set(attempt.id, attempt);
  }
  const sessions = [...attempts.values()].map((attempt) => {
    const found = tasks.get(String(attempt.taskId));
    const task = found?.task ?? {};
    const startedAt = timestamp(attempt.startedAt, 'Legacy attempt start');
    const activeSeconds = number(attempt.activeSeconds, 'Legacy practice seconds', 0, 86400);
    const lcwo =
      attempt.lcwoResult && typeof attempt.lcwoResult === 'object'
        ? (attempt.lcwoResult as Record<string, unknown>)
        : {};
    const runner =
      attempt.runnerResult && typeof attempt.runnerResult === 'object'
        ? (attempt.runnerResult as Record<string, unknown>)
        : {};
    const cwt =
      attempt.cwtResult && typeof attempt.cwtResult === 'object'
        ? (attempt.cwtResult as Record<string, unknown>)
        : {};
    const session: PracticeSession = {
      id: `legacy:${String(attempt.id)}`,
      sourceId: String(attempt.id),
      source: 'legacy',
      date: dateInTimezone(startedAt, timezone),
      kind: legacyKind(attempt, task),
      minutes: activeSeconds / 60,
      notes: typeof attempt.note === 'string' ? attempt.note : '',
      context: attempt.context === 'class' ? 'class' : 'practice',
      createdAt: startedAt,
      metadata: { legacyAttempt: attempt, legacyCourseId: course.id, legacyTask: task },
    };
    if (found?.lesson !== undefined) session.lesson = found.lesson;
    const wpm = lcwo.speedWpm ?? runner.wpm ?? task.speedWpm;
    if (typeof wpm === 'number' && wpm > 0 && wpm <= 150) session.characterWpm = wpm;
    if (typeof lcwo.errorPercent === 'number' && lcwo.errorPercent >= 0 && lcwo.errorPercent <= 100)
      session.accuracy = 100 - lcwo.errorPercent;
    const qsoCount = attempt.qsoCount ?? cwt.qsoCount ?? runner.qsoCount;
    if (typeof qsoCount === 'number') session.qsoCount = qsoCount;
    return validatePracticeSession(session);
  });
  const meetings = Array.isArray(course.meetings)
    ? course.meetings.map((value) => record(value, 'Legacy meeting'))
    : [];
  const meetingDates = meetings
    .filter((meeting) => typeof meeting.startsAt === 'string')
    .map((meeting) => dateInTimezone(String(meeting.startsAt), timezone));
  const title = String(course.title ?? '').toLowerCase();
  const level = COURSE_LEVELS.find((item) => title.includes(item.id))?.id ?? 'intermediate';
  return validateTrainingExport({
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : new Date().toISOString(),
    profile: {
      ...DEFAULT_PROFILE,
      level,
      timezone,
      dailyGoalMinutes: course.dailyGoalMinutes ?? 60,
      firstClassDate: meetingDates[0] ?? '',
      classDays: meetingDates.length
        ? [...new Set(meetingDates.map((date) => new Date(`${date}T12:00:00Z`).getUTCDay()))]
        : [1, 4],
    },
    sessions,
    plan: legacyPlan(
      course,
      [...attempts.values()],
      typeof input.exportedAt === 'string' ? input.exportedAt : new Date().toISOString(),
    ),
    legacy: { source: 'rwjblue.com', data: value },
  });
}
