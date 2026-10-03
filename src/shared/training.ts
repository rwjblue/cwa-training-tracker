import { validateLcwoBackup, type LcwoBackup } from './lcwo.ts';
import {
  validateManualSessionDetails,
  type ExternalPractice,
  type ManualTiming,
} from './external-practice.ts';
import {
  supportsOnAirObservations,
  validatePracticeAssessment,
  type PracticeAssessment,
} from './practice-assessment.ts';
import { legacyPlan, validatePlan, type PlannedTask } from './plan.ts';
import { validateCopyAttempt, type CopyAttempt } from './copy-practice.ts';
import { copyAttemptSessionFields } from './copy-report.ts';
import { evidenceTime, sessionEvidence, type PracticeEvidence } from './practice-evidence.ts';
import { generatedListeningSpeeds } from './generated-listening.ts';
import { validateClassSchedule, type ClassSchedule } from './class-schedule.ts';

/** Public domain model. Course instructions and personal records stay private. */
export type CourseLevel = 'beginner' | 'fundamental' | 'intermediate' | 'advanced';
export type PracticeKind =
  'listening' | 'sending' | 'head-copy' | 'icr' | 'simulator' | 'on-air' | 'other';
export type PracticePurpose = 'assigned' | 'review';

export interface Profile {
  displayName: string;
  callsign: string;
  /** Enabled by default; an explicit false disables external avatar requests. */
  useGravatar?: boolean;
  level: CourseLevel;
  timezone: string;
  dailyGoalMinutes: number;
  firstClassDate: string;
  /** JavaScript weekdays: Sunday = 0, Monday = 1, Saturday = 6. */
  classDays: number[];
  /** Optional versioned private meeting details; null explicitly clears them. */
  classSchedule?: ClassSchedule | null;
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
  /** Compatibility accounting for earlier raw timed records that cannot be promoted. */
  evidenceMode?: 'historical';
  /** Unavailable task provenance, outside metadata's independently bounded payload. */
  historicalPlannedTaskId?: string;
  /** Validated native evidence and original imported metrics travel with backups. */
  metadata?: Record<string, unknown> & {
    copyAttempt?: CopyAttempt;
    evidence?: PracticeEvidence;
    practicePurpose?: PracticePurpose;
    assessment?: PracticeAssessment;
    externalResult?: ExternalPractice;
    manualTiming?: ManualTiming;
  };
}

/** Missing purpose retains ordinary accounting for older saved work. */
export function getPracticePurpose(entry: Pick<PracticeSession, 'metadata'>): PracticePurpose {
  if (entry.metadata?.practicePurpose !== undefined) return entry.metadata.practicePurpose;
  const original = entry.metadata?.legacyAttempt;
  return original &&
    typeof original === 'object' &&
    !Array.isArray(original) &&
    (original as Record<string, unknown>).review === true
    ? 'review'
    : 'assigned';
}

/** Review remains useful practice, but never supplies required exercise evidence. */
export function isRequiredPractice(entry: Pick<PracticeSession, 'metadata' | 'context'>): boolean {
  return entry.context !== 'class' && getPracticePurpose(entry) !== 'review';
}

function validateLegacyReview(attempt: Record<string, unknown>): void {
  if (attempt.review !== undefined && typeof attempt.review !== 'boolean')
    throw new Error('Legacy review must be a boolean.');
}

export interface TrainingExport {
  format: 'cwa-training-tracker';
  version: 1;
  /** Absent in older backups whose task links may need historical normalization. */
  evidenceVersion?: 1;
  exportedAt: string;
  profile?: Profile;
  sessions: PracticeSession[];
  /** Retained source facts and preferences; an imported link is always inactive. */
  lcwo?: LcwoBackup;
  plan?: PlannedTask[];
  /** Retain privately and include in future exports; never publish this data. */
  legacy?: {
    source: 'rwjblue.com';
    data: unknown;
    /** The archive is complete; only practice before this local date was converted. */
    importedBefore?: { date: string; timezone: string };
  };
}

export const DEFAULT_PROFILE: Profile = {
  displayName: '',
  callsign: '',
  useGravatar: true,
  level: 'beginner',
  timezone: 'UTC',
  dailyGoalMinutes: 60,
  firstClassDate: '',
  classDays: [1, 4],
};

export const COURSE_LEVELS: {
  id: CourseLevel;
  label: string;
  description: string;
  prerequisite: string;
  goal: string;
}[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Build a foundation in characters, sending, and your first conversations.',
    prerequisite: 'Little or no Morse experience.',
    goal: 'Recognize characters, head copy and send at 6 WPM or more, and prepare for a basic QSO.',
  },
  {
    id: 'fundamental',
    label: 'Fundamental',
    description: 'Make character recognition automatic and build comfortable QSOs.',
    prerequisite: 'Know the Morse characters and operate at 6 WPM or more.',
    goal: 'Build instant character recognition, conversational QSOs and introductory contest skills at 10 WPM or more.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    description: 'Hear words as sounds and grow your confidence on the air.',
    prerequisite: 'Operate at 10 WPM or more.',
    goal: 'Build head copy, sending and on-air experience for conversations, DX and contests at 20 WPM or more.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Develop fluent head copy and confident higher-speed operating.',
    prerequisite: 'Operate at 20 WPM or more.',
    goal: 'Recognize phrases, copy from behind and build higher-speed operating and contest skills toward 30 WPM or more.',
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

export function validateProfile(
  value: unknown,
  options: { partialSchedule?: boolean } = {},
): Profile {
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
  const profile: Profile = {
    displayName: text(input.displayName, 'Display name', 100, '').trim(),
    callsign: text(input.callsign, 'Callsign', 30, '').trim().toUpperCase(),
    useGravatar: input.useGravatar !== false,
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
  if (input.classSchedule !== undefined)
    profile.classSchedule =
      input.classSchedule === null
        ? null
        : validateClassSchedule(input.classSchedule, profile, !options.partialSchedule);
  return profile;
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

export function validatePracticeSession(
  value: unknown,
  options: { preserveHistoricalDuration?: boolean } = {},
): PracticeSession {
  const input = record(value, 'Practice session');
  const id = text(input.id, 'Session ID', 200);
  if (id.startsWith('lcwo-estimate:'))
    throw new Error('Computed LCWO estimates are read-only totals, not saved practice entries.');
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
  if (input.evidenceMode !== undefined) {
    if (input.evidenceMode !== 'historical')
      throw new Error('Unsupported evidence accounting mode.');
    session.evidenceMode = 'historical';
  }
  if (input.historicalPlannedTaskId !== undefined) {
    const taskId = text(input.historicalPlannedTaskId, 'Historical task ID', 200);
    if (!/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(taskId))
      throw new Error('Historical task ID contains unsupported characters.');
    session.historicalPlannedTaskId = taskId;
  }
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
    let metadata = record(input.metadata, 'Session metadata');
    if (JSON.stringify(metadata).length > 200000) throw new Error('Session metadata is too large.');
    session.metadata = metadata;
    if (
      metadata.plannedTaskId !== undefined &&
      (typeof metadata.plannedTaskId !== 'string' ||
        metadata.plannedTaskId.length > 200 ||
        !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(metadata.plannedTaskId))
    )
      throw new Error('Planned task ID contains unsupported characters.');
    if (
      metadata.practicePurpose !== undefined &&
      metadata.practicePurpose !== 'assigned' &&
      metadata.practicePurpose !== 'review'
    )
      throw new Error('Practice purpose must be assigned or review.');
    if (metadata.legacyAttempt !== undefined) {
      const original = record(metadata.legacyAttempt, 'Legacy attempt');
      validateLegacyReview(original);
      if (
        metadata.practicePurpose !== undefined &&
        metadata.practicePurpose !== (original.review === true ? 'review' : 'assigned')
      )
        throw new Error('Practice purpose contradicts the original legacy review flag.');
    }
    // Imported archives remain historical source records. They are not upgraded
    // to native measurements, whose recording/recall accounting differs.
    let evidence = sessionEvidence(metadata);
    if (session.evidenceMode === 'historical') {
      if (
        metadata.evidence !== undefined ||
        metadata.copyAttempt !== undefined ||
        metadata.runner !== undefined ||
        evidence?.type !== 'timed'
      )
        throw new Error(
          'Historical accounting requires raw timed evidence without native, copy or Runner results.',
        );
      evidence = undefined;
    }
    if (
      options.preserveHistoricalDuration &&
      metadata.evidence === undefined &&
      evidence?.type === 'timed' &&
      Math.abs(session.minutes * 60 - evidence.measurement.seconds) > 0.001
    ) {
      const savedSeconds = session.minutes * 60;
      const reason =
        'Historical duration edit retained; the earlier Companion did not record a correction reason.';
      if (
        savedSeconds + 0.001 <
        evidence.recordings.reduce((sum, item) => sum + item.seconds, 0) +
          (evidence.measurement.recallSeconds ?? 0)
      ) {
        // Earlier generic duration edits could contradict recording/recall
        // subtotals. Keep that historical accounting without inventing changes
        // to the raw fields or promoting it to valid current native evidence.
        const timing: Record<string, unknown> = {};
        for (const key of ['elapsedSeconds', 'recallSeconds', 'recordings']) {
          if (metadata[key] !== undefined) timing[key] = metadata[key];
        }
        metadata = { ...metadata, historicalTiming: { savedSeconds, timing, reason } };
        for (const key of ['elapsedSeconds', 'recallSeconds', 'recordings']) delete metadata[key];
        evidence = undefined;
      } else evidence = { ...evidence, correction: { seconds: savedSeconds, reason } };
    }
    session.metadata = metadata;
    if (metadata.runnerReviewedAt !== undefined) {
      if (evidence?.type !== 'runner' || !evidence.run.attribution)
        throw new Error('A Runner review timestamp requires its captured run attribution.');
      const reviewedAt = timestamp(metadata.runnerReviewedAt, 'Runner review time');
      if (Date.parse(reviewedAt) < Date.parse(evidence.run.runEndedAt!))
        throw new Error('Runner review cannot precede its acknowledged result.');
      metadata = { ...metadata, runnerReviewedAt: reviewedAt };
      session.metadata = metadata;
    }
    if (evidence) {
      if (
        evidence.type === 'timed' &&
        evidence.recordings.some(
          (item) =>
            item.marks &&
            item.marks.taskId !== (metadata.plannedTaskId ?? session.historicalPlannedTaskId),
        )
      )
        throw new Error(
          'Difficult recording marks must retain this practice entry’s task identity.',
        );
      session.metadata = { ...metadata, evidence };
      if (evidence.type === 'runner') {
        const run = evidence.run;
        if (run.attribution) {
          if (session.id !== `runner:${run.runId}`)
            throw new Error('The Runner entry ID must match its run.');
          if (session.date !== dateInTimezone(run.runStartedAt!, run.attribution.timezone))
            throw new Error(
              'The Runner practice date must match its start in the captured timezone.',
            );
          if (session.createdAt !== run.runEndedAt)
            throw new Error('The Runner result creation time must match its acknowledged end.');
          if (Math.abs(session.minutes * 60 - run.elapsedSeconds) > 0.001)
            throw new Error('Runner practice duration must match its engine seconds.');
          if (session.qsoCount !== undefined && session.qsoCount !== run.summary?.qsoCount)
            throw new Error('Runner contacts must match its engine result.');
        }
        session.kind = 'simulator';
        session.source = 'timer';
        session.minutes = evidence.run.elapsedSeconds / 60;
        delete session.characterWpm;
        delete session.effectiveWpm;
        delete session.accuracy;
        delete session.qsoCount;
        const speeds = evidence.run.speedHistory?.map((item) => item.wpm) ?? [
          evidence.run.settings.wpm,
        ];
        if (
          !evidence.run.speedChangeCount &&
          speeds.every((wpm) => wpm === evidence.run.settings.wpm)
        )
          session.characterWpm = evidence.run.settings.wpm;
        if (evidence.run.summary) session.qsoCount = evidence.run.summary.qsoCount;
      } else {
        session.minutes = evidenceTime(evidence).seconds / 60;
        if (evidence.generatedListening) {
          delete session.characterWpm;
          delete session.effectiveWpm;
          const speeds = generatedListeningSpeeds(evidence.generatedListening);
          if (
            speeds.characterWpm !== undefined &&
            speeds.effectiveWpm !== undefined &&
            evidence.recordings.every(
              (item) =>
                item.characterWpm === speeds.characterWpm &&
                item.effectiveWpm === speeds.effectiveWpm,
            )
          ) {
            session.characterWpm = speeds.characterWpm;
            session.effectiveWpm = speeds.effectiveWpm;
          }
        } else if (evidence.recordings.length) {
          delete session.characterWpm;
          delete session.effectiveWpm;
          for (const key of ['characterWpm', 'effectiveWpm'] as const) {
            const speed = evidence.recordings[0][key];
            if (
              speed !== undefined &&
              speed <= 150 &&
              evidence.recordings.every((item) => item[key] === speed)
            )
              session[key] = speed;
          }
        }
      }
    }
    if (session.metadata && JSON.stringify(session.metadata).length > 200000) {
      if (
        options.preserveHistoricalDuration &&
        input.metadata &&
        record(input.metadata, 'Session metadata').evidence === undefined &&
        sessionEvidence(record(input.metadata, 'Session metadata'))?.type === 'timed'
      ) {
        session.evidenceMode = 'historical';
        session.metadata = record(input.metadata, 'Session metadata');
        session.minutes = number(input.minutes, 'Practice minutes', 0, 1440);
        for (const key of ['characterWpm', 'effectiveWpm'] as const) {
          if (input[key] === undefined) delete session[key];
          else session[key] = number(input[key], 'Historical speed', 1, 150);
        }
      } else
        throw new Error(
          'Normalized session metadata is too large. Shorten the retained source notes.',
        );
    }
    if (metadata.copyAttempt !== undefined) {
      const attempt = validateCopyAttempt(metadata.copyAttempt);
      if (attempt.status === 'active')
        throw new Error('Finish or end the copy attempt before saving.');
      const measured = copyAttemptSessionFields(attempt);
      if (session.id !== measured.id) throw new Error('The copy entry ID must match its attempt.');
      // Generic form fields must not replace measured evidence with an unrelated
      // speed or manually rounded time. Adaptive trials often have no one speed.
      delete session.characterWpm;
      delete session.effectiveWpm;
      delete session.accuracy;
      Object.assign(session, measured);
      session.metadata = { ...metadata, ...measured.metadata };
    }
  }
  validateManualSessionDetails(session);
  if (session.metadata?.assessment !== undefined) {
    const assessment = validatePracticeAssessment(session.metadata.assessment);
    if (assessment.cwt !== undefined && !supportsOnAirObservations(session))
      throw new Error(
        'CWT observations require on-air practice, not generated audio, recordings or simulator results.',
      );
    session.metadata = { ...session.metadata, assessment };
  }
  if (session.evidenceMode === 'historical' && session.metadata === undefined)
    throw new Error('Historical accounting requires raw timed evidence.');
  if (session.metadata && JSON.stringify(session.metadata).length > 200000)
    throw new Error('Normalized session metadata is too large. Shorten the retained source notes.');
  return session;
}

export function validateTrainingExport(value: unknown): TrainingExport {
  const input = record(value, 'Import');
  if (input.format !== 'cwa-training-tracker' || input.version !== 1)
    throw new Error('Unsupported training export format or version.');
  if (!Array.isArray(input.sessions) || input.sessions.length > 20000)
    throw new Error('Import must contain up to 20,000 sessions.');
  const sessions = input.sessions.map((session) =>
    validatePracticeSession(session, {
      preserveHistoricalDuration: input.evidenceVersion === undefined,
    }),
  );
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length)
    throw new Error('Import contains duplicate session IDs.');
  const result: TrainingExport = {
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: timestamp(input.exportedAt, 'Exported time'),
    sessions,
  };
  if (input.evidenceVersion !== undefined) {
    if (input.evidenceVersion !== 1)
      throw new Error('Unsupported practice evidence export version.');
    result.evidenceVersion = 1;
  }
  if (input.lcwo !== undefined) result.lcwo = validateLcwoBackup(input.lcwo);
  if (input.profile !== undefined) result.profile = validateProfile(input.profile);
  if (input.plan !== undefined) result.plan = validatePlan(input.plan);
  if (input.legacy !== undefined) {
    const legacy = record(input.legacy, 'Legacy archive');
    if (legacy.source !== 'rwjblue.com' || legacy.data === undefined)
      throw new Error('Invalid legacy archive.');
    result.legacy = { source: 'rwjblue.com', data: legacy.data };
    if (legacy.importedBefore !== undefined) {
      const cutoff = record(legacy.importedBefore, 'Legacy import cutoff');
      if (!isCalendarDate(cutoff.date)) throw new Error('Choose a valid import cutoff date.');
      const timezone = text(cutoff.timezone, 'Import cutoff timezone', 100);
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      } catch {
        throw new Error('Choose a valid import cutoff timezone.');
      }
      result.legacy.importedBefore = { date: cutoff.date, timezone };
    }
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
  if (id === 'bob-77-words' && attempt.assignmentId === 'daily-listening') return 'listening';
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

function legacyResult(value: unknown, label: string): Record<string, unknown> {
  return value === undefined ? {} : record(value, label);
}

/** Only known empty dismissal markers are bookkeeping; zero-valued results are evidence. */
function legacyDismissal(attempt: Record<string, unknown>): boolean {
  const note = typeof attempt.note === 'string' ? attempt.note.trim() : '';
  return (
    ['[Left missed]', '[Practiced elsewhere]'].includes(note) &&
    attempt.activeSeconds === 0 &&
    attempt.completed !== true &&
    !(typeof attempt.completedPasses === 'number' && attempt.completedPasses > 0) &&
    !(typeof attempt.scratchpad === 'string' && attempt.scratchpad.trim()) &&
    attempt.difficulty === undefined &&
    attempt.performanceRating === undefined &&
    attempt.qsoCount === undefined &&
    attempt.cwtResult === undefined &&
    attempt.lcwoResult === undefined &&
    attempt.runnerResult === undefined &&
    !(Array.isArray(attempt.audioResults) && attempt.audioResults.length)
  );
}

/** A single displayed speed must describe what was practiced, never just the assignment. */
function legacySpeeds(
  attempt: Record<string, unknown>,
): Pick<PracticeSession, 'characterWpm' | 'effectiveWpm'> {
  const lcwo = legacyResult(attempt.lcwoResult, 'Legacy LCWO result');
  const runner = legacyResult(attempt.runnerResult, 'Legacy Runner result');
  const valid = (value: unknown): value is number =>
    typeof value === 'number' && value >= 1 && value <= 150;
  if (valid(lcwo.speedWpm)) {
    return ['letters', 'figures', 'custom'].includes(String(lcwo.kind))
      ? { effectiveWpm: lcwo.speedWpm }
      : { characterWpm: lcwo.speedWpm };
  }
  if (valid(runner.wpm)) {
    const speeds = Array.isArray(runner.speeds) ? runner.speeds : [runner.wpm];
    return speeds.length && speeds.every((speed) => speed === runner.wpm)
      ? { characterWpm: runner.wpm }
      : {};
  }
  if (attempt.audioResults !== undefined) {
    if (!Array.isArray(attempt.audioResults))
      throw new Error('Legacy audio results must be an array.');
    const results = attempt.audioResults.map((value) => record(value, 'Legacy audio result'));
    const speed = results[0]?.speedWpm;
    return valid(speed) && results.every((result) => result.speedWpm === speed)
      ? { characterWpm: speed }
      : {};
  }
  // Older attempts stored actual audio variants in generated notes before typed results existed.
  const lines =
    typeof attempt.note === 'string'
      ? attempt.note.split('\n').filter((line) => line.startsWith('Audio recording: '))
      : [];
  const speeds = lines.map(
    (line) => /^Audio recording: .+? \((\d+) WPM\); assigned /.exec(line)?.[1],
  );
  const speed = Number(speeds[0]);
  return speeds.length && valid(speed) && speeds.every((value) => Number(value) === speed)
    ? { characterWpm: speed }
    : {};
}

export interface LegacyImportOptions {
  /** Exclusive calendar date in the source course timezone. */
  beforeDate?: string;
}

/** Convert a browser export or raw private snapshot without reading any network data. */
export function convertLegacyExport(
  value: unknown,
  options: LegacyImportOptions = {},
): TrainingExport {
  if (options.beforeDate !== undefined && !isCalendarDate(options.beforeDate))
    throw new Error('Choose a valid import cutoff date.');
  const input = record(value, 'Legacy export');
  if (input.format === 'cwa-training-tracker') {
    if (options.beforeDate !== undefined)
      throw new Error('A date cutoff requires the original legacy source export.');
    return validateTrainingExport(input);
  }
  const snapshot = record(input.snapshot ?? input, 'Legacy snapshot');
  const course = record(snapshot.course, 'Legacy course');
  if (!Array.isArray(snapshot.attempts))
    throw new Error('Legacy snapshot must contain an attempts array.');
  const timezone = typeof course.timezone === 'string' ? course.timezone : 'UTC';
  const assignments = Array.isArray(course.assignments) ? course.assignments : [];
  const tasks = new Map<
    string,
    { task: Record<string, unknown>; lesson?: number; planned?: boolean }
  >();
  for (const assignmentValue of assignments) {
    const assignment = record(assignmentValue, 'Legacy assignment');
    if (!Array.isArray(assignment.tasks)) continue;
    for (const taskValue of assignment.tasks) {
      const task = record(taskValue, 'Legacy task');
      tasks.set(String(task.id), {
        task,
        lesson: typeof assignment.session === 'number' ? assignment.session : undefined,
        planned: true,
      });
    }
  }
  const dailyListening = legacyResult(snapshot.dailyListening, 'Legacy daily listening');
  if (!tasks.has('bob-77-words')) {
    tasks.set('bob-77-words', {
      task: {
        id: 'bob-77-words',
        kind: 'audio',
        title:
          typeof dailyListening.title === 'string' ? dailyListening.title : 'Daily word listening',
      },
    });
  }
  const pending = input.pending === undefined ? {} : record(input.pending, 'Pending legacy data');
  if (pending.attempts !== undefined && !Array.isArray(pending.attempts))
    throw new Error('Pending legacy attempts must be an array.');
  for (const materialValue of [
    ...(Array.isArray(snapshot.materials) ? snapshot.materials : []),
    ...(Array.isArray(pending.materials) ? pending.materials : []),
  ]) {
    const material = record(materialValue, 'Legacy material');
    if (typeof material.id !== 'string') continue;
    tasks.set(material.id, {
      task: { id: material.id, title: material.title, kind: 'sending' },
      lesson: typeof material.session === 'number' ? material.session : undefined,
    });
  }
  const attempts = new Map<string, Record<string, unknown>>();
  for (const value of [
    ...snapshot.attempts,
    ...(Array.isArray(pending.attempts) ? pending.attempts : []),
  ]) {
    const attempt = record(value, 'Legacy attempt');
    validateLegacyReview(attempt);
    if (typeof attempt.id !== 'string' || !attempt.id)
      throw new Error('Legacy attempt is missing its ID.');
    attempts.set(attempt.id, attempt);
  }
  // Validate and date every saved record before excluding it; bad data must not disappear silently.
  const datedAttempts = [...attempts.values()].map((attempt) => ({
    attempt,
    startedAt: timestamp(attempt.startedAt, 'Legacy attempt start'),
    activeSeconds: number(attempt.activeSeconds, 'Legacy practice seconds', 0, 86400),
    date: dateInTimezone(timestamp(attempt.startedAt, 'Legacy attempt start'), timezone),
  }));
  const historical = datedAttempts.filter(
    ({ date }) => !options.beforeDate || date < options.beforeDate,
  );
  const sessions = historical
    .filter(({ attempt }) => !legacyDismissal(attempt))
    .map(({ attempt, startedAt, activeSeconds, date }) => {
      const found = tasks.get(String(attempt.taskId));
      const task = found?.task ?? {};
      const lcwo = legacyResult(attempt.lcwoResult, 'Legacy LCWO result');
      const runner = legacyResult(attempt.runnerResult, 'Legacy Runner result');
      const cwt = legacyResult(attempt.cwtResult, 'Legacy CWT result');
      const session: PracticeSession = {
        id: `legacy:${String(attempt.id)}`,
        sourceId: String(attempt.id),
        source: 'legacy',
        date,
        kind: legacyKind(attempt, task),
        minutes: activeSeconds / 60,
        notes: typeof attempt.note === 'string' ? attempt.note : '',
        context: attempt.context === 'class' ? 'class' : 'practice',
        createdAt: startedAt,
        metadata: {
          legacyAttempt: attempt,
          legacyCourseId: course.id,
          legacyTask: task,
          ...(attempt.review === true ? { practicePurpose: 'review' as const } : {}),
          ...(typeof attempt.scratchpad === 'string' ? { scratchpad: attempt.scratchpad } : {}),
          ...(found?.planned && attempt.context !== 'class'
            ? { plannedTaskId: `legacy-task:${String(attempt.taskId)}` }
            : {}),
        },
        ...legacySpeeds(attempt),
      };
      if (found?.lesson !== undefined) session.lesson = found.lesson;
      if (
        typeof lcwo.errorPercent === 'number' &&
        lcwo.errorPercent >= 0 &&
        lcwo.errorPercent <= 100
      )
        session.accuracy = 100 - lcwo.errorPercent;
      const qsoCount = attempt.qsoCount ?? cwt.qsoCount ?? runner.qsoCount;
      if (typeof qsoCount === 'number') session.qsoCount = qsoCount;
      return validatePracticeSession(session);
    });
  const lcwo = legacyResult(snapshot.lcwo, 'Legacy LCWO history');
  if (lcwo.runs !== undefined && !Array.isArray(lcwo.runs))
    throw new Error('Legacy LCWO runs must be an array.');
  const runs = new Map<string, Record<string, unknown>>();
  for (const value of Array.isArray(lcwo.runs) ? lcwo.runs : []) {
    const run = record(value, 'Legacy LCWO run');
    if (typeof run.id !== 'string' || !run.id)
      throw new Error('Legacy LCWO run is missing its ID.');
    runs.set(run.id, run);
  }
  // The old trainer estimated one minute per code-group run, except when a saved block covered it.
  // Check all blocks, including ones crossing a date boundary and extra-review blocks.
  const coverage = datedAttempts.flatMap(({ attempt, startedAt, activeSeconds }) => {
    const wholeIcrBlock =
      attempt.taskId === 'other:icr' || tasks.get(String(attempt.taskId))?.task.kind === 'icr';
    if (
      attempt.context === 'class' ||
      activeSeconds <= 0 ||
      (!wholeIcrBlock && !attempt.lcwoResult)
    )
      return [];
    const result = legacyResult(attempt.lcwoResult, 'Legacy LCWO result');
    const end = timestamp(attempt.endedAt, 'Legacy ICR block end');
    if (Date.parse(end) < Date.parse(startedAt))
      throw new Error('Legacy ICR block ends before it starts.');
    return [
      {
        start: Date.parse(startedAt),
        end: Date.parse(end),
        kind: wholeIcrBlock ? undefined : result.kind,
      },
    ];
  });
  for (const run of runs.values()) {
    const recordedAt = timestamp(run.recordedAt, 'Legacy LCWO run time');
    const date = dateInTimezone(recordedAt, timezone);
    if (
      (options.beforeDate && date >= options.beforeDate) ||
      run.sourceType !== 'groups' ||
      !['letters', 'figures', 'custom'].includes(String(run.kind))
    )
      continue;
    const instant = Date.parse(recordedAt);
    if (
      coverage.some(
        (block) =>
          (!block.kind || block.kind === run.kind) &&
          instant >= block.start &&
          instant <= block.end,
      )
    )
      continue;
    sessions.push(
      validatePracticeSession({
        id: `legacy-lcwo-estimate:${String(run.id)}`,
        sourceId: run.id,
        source: 'legacy',
        kind: 'icr',
        date,
        minutes: 1,
        notes: `LCWO ${String(run.kind)}: estimated one minute for a completed code-group exercise; no saved practice block covers this result.`,
        context: 'practice',
        createdAt: recordedAt,
        ...(typeof run.characterWpm === 'number' ? { characterWpm: run.characterWpm } : {}),
        ...(typeof run.effectiveWpm === 'number' ? { effectiveWpm: run.effectiveWpm } : {}),
        ...(typeof run.accuracyPercent === 'number' ? { accuracy: run.accuracyPercent } : {}),
        metadata: {
          legacyLcwoRun: run,
          legacyCourseId: course.id,
          estimatedMinutes: true,
          estimateMethod: 'one-minute-code-group',
        },
      }),
    );
  }
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
      historical.map(({ attempt }) => attempt),
      typeof input.exportedAt === 'string' ? input.exportedAt : new Date().toISOString(),
    ),
    legacy: {
      source: 'rwjblue.com',
      data: value,
      ...(options.beforeDate ? { importedBefore: { date: options.beforeDate, timezone } } : {}),
    },
  });
}
