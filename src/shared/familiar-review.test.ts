import { savedPracticeTime } from './practice-time';
import { expect, it } from 'vitest';
import { familiarReviewSuggestions } from './familiar-review';
import { nextPracticePlan } from './next-practice';
import { curriculumPlan } from './curriculum';
import { savedTaskProgress, type PlannedTask } from './plan';
import { DEFAULT_PROFILE, type PracticeSession } from './training';
import { defaultCopyRecipe } from './copy-practice';
import { recordingVariants } from './recordings';
import { practiceLaunchForTask } from '../client/practice-launch';
import { taskPracticeMetadata } from './practice-attribution';
const profile = { ...DEFAULT_PROFILE, timezone: 'UTC' };
const now = Date.parse('2026-10-07T12:00:00Z');
const task = (id: string, changes: Partial<PlannedTask> = {}): PlannedTask => ({
  id,
  title: id,
  dueDate: '2026-10-07',
  kind: 'sending',
  done: true,
  notes: 'Original instructions',
  createdAt: '2026-10-01T00:00:00Z',
  ...changes,
});
const entry = (id: string, changes: Partial<PracticeSession> = {}): PracticeSession => ({
  id: `saved-${id}`,
  date: '2026-10-07',
  kind: 'sending',
  minutes: 1,
  notes: '',
  createdAt: '2026-10-07T10:00:00Z',
  metadata: taskPracticeMetadata(id, 'review'),
  ...changes,
});
const suggestions = (tasks: PlannedTask[], entries: PracticeSession[] = []) =>
  familiarReviewSuggestions(tasks, entries, profile, now);
const ids = (items: ReturnType<typeof suggestions>) => items.map(({ task }) => task.id);

it('bounds ordinary suggestions to three recent introduced dates and three visible choices', () => {
  const tasks = [
    task('new'),
    task('yesterday', { dueDate: '2026-10-06' }),
    task('third', { dueDate: '2026-10-05' }),
    task('old', { dueDate: '2026-10-04' }),
    task('future', { dueDate: '2026-10-08' }),
    task('undated', { dueDate: undefined }),
  ];
  const before = structuredClone(tasks);
  expect(ids(suggestions(tasks))).toEqual(['new', 'yesterday', 'third']);
  expect(suggestions(tasks)[0].reason).toContain('three most recent dates');
  expect(tasks).toEqual(before);
  expect(() => familiarReviewSuggestions(tasks, [], profile, NaN)).toThrow('valid planning clock');
});
it('offers review only after required work is finished or unavailable and outside class', () => {
  const work = task('required', { done: false });
  const familiar = task('familiar');
  expect(nextPracticePlan([work, familiar], [], profile, now).reviews).toEqual([]);
  expect(
    ids(nextPracticePlan([{ ...work, done: true }, familiar], [], profile, now).reviews),
  ).toEqual(['familiar', 'required']);
  const unavailable = task('missing', {
    done: false,
    exercise: { type: 'audio', unresolved: 'Ask advisor.' },
  });
  expect(ids(nextPracticePlan([unavailable, familiar], [], profile, now).reviews)).toEqual([
    'familiar',
  ]);
  const timed = {
    ...profile,
    firstClassDate: '2026-10-07',
    classDays: [3, 6],
    classSchedule: {
      version: 1 as const,
      timezone: 'UTC',
      exceptions: [],
      ordinary: { startTime: '12:00', endTime: '13:00', endsNextDay: false },
    },
  };
  expect(nextPracticePlan([familiar], [], timed, now).reviews).toEqual([]);
});
it('rotates saved reviews within the bounded pool and cycles after all have been used', () => {
  const tasks = [task('a'), task('b'), task('c'), task('d')];
  expect(ids(suggestions(tasks))).toEqual(['a', 'b', 'c']);
  const saved = [entry('a')];
  expect(ids(suggestions(tasks, saved))).toEqual(['b', 'c', 'd']);
  saved.push(entry('b', { createdAt: '2026-10-07T11:00:00Z' }));
  expect(ids(suggestions(tasks, saved))).toEqual(['c', 'd', 'a']);
  saved.push(entry('c'), entry('d'));
  expect(ids(suggestions(tasks, saved))).toEqual(['a', 'c', 'd']);
});
it('ignores zero/class/future/duplicate evidence and rotates actual heard sources', () => {
  const tasks = [task('a'), task('b')];
  for (const change of [
    { minutes: 0 },
    { context: 'class' as const },
    { date: '2026-10-08' },
    { createdAt: '2026-10-07T13:00:00Z' },
  ])
    expect(ids(suggestions(tasks, [entry('a', change)]))[0]).toBe('a');
  const audio = task('a', {
    kind: 'listening',
    exercise: { type: 'audio', url: 'https://example.test/a.wav' },
  });
  const measured = entry('a', {
    metadata: {
      ...taskPracticeMetadata('a', 'review'),
      evidence: { version: 1, type: 'timed', measurement: { seconds: 60 }, recordings: [] },
    },
  });
  expect(ids(suggestions([audio, tasks[1]], [measured]))[0]).toBe('a');
  const heard = {
    ...measured,
    metadata: {
      ...measured.metadata,
      evidence: {
        version: 1 as const,
        type: 'timed' as const,
        measurement: { seconds: 60 },
        recordings: [{ url: audio.exercise!.url!, seconds: 60 }],
      },
    },
  };
  expect(ids(suggestions([audio, tasks[1]], [heard]))[0]).toBe('b');
  expect(ids(suggestions(tasks, [entry('a'), entry('a')]))).toEqual(['b', 'a']);
});
it('deduplicates exact private URLs and verified alternate speeds without filename guessing', () => {
  const catalog = curriculumPlan({
    ...profile,
    level: 'intermediate',
    firstClassDate: '2026-10-01',
  });
  const source = catalog.find(
    (task) => task.exercise?.type === 'audio' && recordingVariants(task.exercise.url).length > 1,
  )!;
  const urls = recordingVariants(source.exercise!.url).map((item) => item.url);
  const audio = (id: string, url: string, date = '2026-10-07') =>
    task(id, { dueDate: date, kind: 'listening', exercise: { type: 'audio', url } });
  expect(
    ids(
      suggestions([
        audio('latest', urls[0]),
        audio('same-recording', urls[1], '2026-10-06'),
        audio('private', 'https://example.test/a.mp3'),
        audio('duplicate-private', 'https://example.test/a.mp3', '2026-10-06'),
      ]),
    ),
  ).toEqual(['latest', 'private']);
  const privateSources = [
    audio('short', 'https://example.test/qso-short.mp3'),
    audio('long', 'https://example.test/qso-long.mp3'),
  ];
  expect(suggestions(privateSources)).toHaveLength(2);
});
it('retains the latest reached Runner and ICR recipes while rejecting future advancement', () => {
  const runner = (id: string, date: string, wpm: number) =>
    task(id, {
      dueDate: date,
      kind: 'simulator',
      exercise: {
        type: 'morse-runner',
        url: 'https://fritzsche.github.io/WebMorseRunner/',
        settings: {
          mode: 'SingleCall',
          wpm,
          durationSeconds: 60,
          activity: 2,
          conditions: { qrm: true, qrn: false, qsb: false, flutter: false, lids: false },
        },
      },
    });
  const icr = (id: string, date: string, effectiveWpm: number) =>
    task(id, {
      dueDate: date,
      kind: 'icr',
      exercise: { type: 'copy', recipe: { ...defaultCopyRecipe(), effectiveWpm } },
    });
  const tasks = [
    runner('runner-old', '2026-10-01', 15),
    runner('runner-current', '2026-10-06', 20),
    runner('runner-future', '2026-10-08', 30),
    icr('icr-old', '2026-10-01', 8),
    icr('icr-current', '2026-10-06', 12),
    icr('icr-future', '2026-10-08', 20),
  ];
  const reviews = suggestions(tasks);
  expect(ids(reviews)).toEqual(['icr-current', 'runner-current']);
  for (const review of reviews) {
    expect(review.task).toEqual(tasks.find((task) => task.id === review.task.id));
    expect(review.reason).toContain('Latest reached course recipe');
    expect(practiceLaunchForTask(review.task, 'review')).toMatchObject({
      task: review.task,
      purpose: 'review',
      activity: review.task.exercise,
    });
  }
  expect(suggestions(tasks.filter((task) => task.dueDate! > '2026-10-07'))).toEqual([]);
});
it('retains unsupported external ICR as external rather than inventing native code groups', () => {
  const external = task('unsupported', {
    kind: 'icr',
    exercise: { type: 'external', url: 'https://lcwo.net/?p=koch' },
  });
  const review = suggestions([external])[0];
  expect(review.task.exercise).toEqual(external.exercise);
  expect(practiceLaunchForTask(review.task, 'review').activity?.type).toBe('external');
});
it('uses current account local introduction dates and excludes inactive curricula and live work', () => {
  const tasks = [
    task('today'),
    task('live', { kind: 'on-air' }),
    task('event', {
      exercise: {
        type: 'live-event',
        eventId: 'cwt',
        url: 'https://cwops.org/cwops-tests/',
        deadline: 'practice-date',
      },
    }),
    task('other-course', {
      curriculum: {
        id: 'cwa-advanced-v2.1',
        exerciseId: 's1-d1-t1',
        day: 1,
        sourceUrl: 'https://example.test/source',
      },
    }),
  ];
  expect(ids(suggestions(tasks))).toEqual(['today']);
  const local = { ...profile, timezone: 'America/New_York' };
  expect(familiarReviewSuggestions(tasks, [], local, Date.parse('2026-10-07T03:59:59Z'))).toEqual(
    [],
  );
  expect(ids(familiarReviewSuggestions(tasks, [], local, Date.parse('2026-10-07T04:00Z')))).toEqual(
    ['today'],
  );
});
it('preserves original progress, completion and daily practice accounting for saved review', () => {
  const tasks = [task('original', { done: false, dismissedFromToday: true, lesson: 2 })];
  const before = structuredClone(tasks);
  const saved = [entry('original')];
  expect(suggestions(tasks, saved)[0].task).toEqual(before[0]);
  expect(savedTaskProgress(tasks, saved, '2026-10-07').get('original')?.loggedMinutes).toBe(0);
  expect(savedPracticeTime(saved, '2026-10-07').practice.savedSeconds / 60).toBe(1);
  expect(tasks).toEqual(before);
});
it('keeps private resource suggestions confined to the provided account data', () => {
  const first = task('first', {
    exercise: { type: 'audio', url: 'https://example.test/private-first.wav' },
  });
  const second = task('second', {
    exercise: { type: 'audio', url: 'https://example.test/private-second.wav' },
  });
  expect(suggestions([first]).map(({ task }) => task.exercise)).toEqual([first.exercise]);
  expect(ids(suggestions([second], [entry('first')]))).toEqual(['second']);
  expect(suggestions([], [entry('first')])).toEqual([]);
});

it('matches qualified legacy/current source aliases without redirecting a real owned task', () => {
  const curriculum = {
    id: 'cwa-intermediate-v2.3',
    exerciseId: 's1-d1-t1',
    day: 1 as const,
    sourceUrl: 'https://example.test/official',
  };
  const imported = task('imported', { curriculum });
  const peer = task('peer');
  const review = (tasks: PlannedTask[], saved: PracticeSession[]) =>
    familiarReviewSuggestions(tasks, saved, { ...profile, level: 'intermediate' }, now);
  expect(ids(review([imported, peer], [entry('legacy-task:s1-d1-t1')]))).toEqual([
    'peer',
    'imported',
  ]);
  const explicit = task('legacy-task:s1-d1-t1');
  expect(ids(review([imported, explicit, peer], [entry(explicit.id)]))).toEqual([
    'imported',
    'peer',
    explicit.id,
  ]);
});

it('keeps current Runner and ICR discoverable while ordinary recording choices rotate', () => {
  const runner = task('current-runner', {
    dueDate: '2026-10-01',
    kind: 'simulator',
    exercise: {
      type: 'morse-runner',
      url: 'https://fritzsche.github.io/WebMorseRunner/',
      settings: {
        mode: 'SingleCall',
        wpm: 20,
        durationSeconds: 60,
        activity: 2,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      },
    },
  });
  const icr = task('current-icr', {
    dueDate: '2026-10-01',
    kind: 'icr',
    exercise: { type: 'copy', recipe: defaultCopyRecipe() },
  });
  const recordings = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    task(id, {
      kind: 'listening',
      exercise: { type: 'audio', url: `https://example.test/${id}.wav` },
    }),
  );
  const tasks = [...recordings, runner, icr];
  expect(ids(suggestions(tasks))).toEqual(['a', 'current-icr', 'current-runner']);
  expect(ids(suggestions(tasks, [entry('a')]))).toEqual(['b', 'current-icr', 'current-runner']);
  expect(ids(suggestions(tasks, [entry('a'), entry('current-runner')]))).toEqual([
    'b',
    'current-icr',
    'current-runner',
  ]);
});
