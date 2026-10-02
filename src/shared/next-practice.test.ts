import { expect, it } from 'vitest';
import { nextPracticePlan, blockedPracticeExplanation } from './next-practice';
import { DEFAULT_PROFILE, type PracticeSession, type Profile } from './training';
import type { PlannedTask } from './plan';
import { taskPracticeMetadata } from './practice-attribution';

const profile: Profile = { ...DEFAULT_PROFILE, timezone: 'UTC' };
const now = Date.parse('2026-10-07T12:00Z');
const task = (id: string, overrides: Partial<PlannedTask> = {}): PlannedTask => ({
  id,
  title: id,
  kind: 'listening',
  dueDate: '2026-10-07',
  done: false,
  notes: '',
  createdAt: '2026-10-02T00:00:00Z',
  ...overrides,
});
const entry = (id: string, overrides: Partial<PracticeSession> = {}): PracticeSession => ({
  id: `entry-${id}`,
  date: '2026-10-07',
  kind: 'listening',
  minutes: 1,
  notes: '',
  source: 'timer',
  createdAt: '2026-10-07T10:00:00Z',
  metadata: taskPracticeMetadata(id, 'assigned'),
  ...overrides,
});

it('selects today before earlier work, dates before started priority, and stable ties', () => {
  const tasks = [
    task('earlier-started', { dueDate: '2026-10-06' }),
    task('today-fresh'),
    task('today-started'),
    task('oldest-fresh', { dueDate: '2026-10-05' }),
    task('today-another'),
  ];
  const saved = [entry('earlier-started'), entry('today-started')];
  const before = structuredClone({ tasks, saved });
  const plan = nextPracticePlan(tasks, saved, profile, now);
  expect(plan.eligible.map(({ task }) => task.id)).toEqual([
    'today-started',
    'today-another',
    'today-fresh',
    'oldest-fresh',
    'earlier-started',
  ]);
  expect(plan.next?.task.id).toBe('today-started');
  expect({ tasks, saved }).toEqual(before);
});

it('excludes completed, dismissed, future and unscheduled work without implicit advancement', () => {
  const tasks = [
    task('complete', { done: true }),
    task('dismissed', { dismissedFromToday: true }),
    task('future', { dueDate: '2026-10-08' }),
    task('undated', { dueDate: undefined }),
  ];
  const plan = nextPracticePlan(tasks, [], profile, now);
  expect(plan.next).toBeUndefined();
  expect(plan.nextPracticeDate).toBe('2026-10-08');
  expect(plan.unscheduled.map(({ task }) => task.id)).toEqual(['undated']);
  expect(plan.allComplete).toBe(false);
  expect(nextPracticePlan(tasks.slice(0, 2), [], profile, now).allComplete).toBe(false);
  expect(nextPracticePlan([], [], profile, now).allComplete).toBe(false);
  expect(
    nextPracticePlan(
      tasks.map((item) => ({ ...item, done: true })),
      [],
      profile,
      now,
    ).allComplete,
  ).toBe(true);
});

it('offers undated upcoming-session preparation separately from automatic required work', () => {
  const dated = { ...profile, firstClassDate: '2026-10-08', classDays: [1, 4] };
  const plan = nextPracticePlan(
    [task('prepare', { dueDate: undefined, lesson: 1 })],
    [],
    dated,
    now,
  );
  expect(plan.next).toBeUndefined();
  expect(plan.preparation.map(({ task }) => task.id)).toEqual(['prepare']);
});

it('skips unavailable audio with guidance and preserves usable material and manual work', () => {
  const missing = task('missing', {
    exercise: { type: 'audio', unresolved: 'Ask your advisor for this recording.' },
  });
  const listening = task('playable', {
    exercise: { type: 'audio', url: 'https://example.test/synthetic.mp3' },
  });
  const manual = task('manual');
  const plan = nextPracticePlan([missing, listening, manual], [], profile, now);
  expect(plan.eligible.map(({ task }) => task.id)).toEqual(['manual', 'playable']);
  expect(plan.blocked).toMatchObject([{ item: { task: { id: 'missing' } }, reason: 'recording' }]);
  expect(blockedPracticeExplanation(plan.blocked[0], profile, now)).toBe(
    'Ask your advisor for this recording.',
  );
});

it('uses shared live eligibility at exact starts and ends without adding attendance or credit', () => {
  const live = task('live', {
    kind: 'on-air',
    exercise: {
      type: 'live-event',
      eventId: 'cwt',
      url: 'https://cwops.org/cwops-tests/',
      deadline: 'practice-date',
    },
  });
  const start = Date.parse('2026-10-07T13:00Z');
  expect(nextPracticePlan([live], [], profile, start - 1).blocked[0].reason).toBe('live-window');
  expect(nextPracticePlan([live], [], profile, start).next?.task).toBe(live);
  expect(nextPracticePlan([live], [], profile, start + 3_599_999).next?.status).toBe('ready');
  expect(nextPracticePlan([live], [], profile, start + 3_600_000).next).toBeUndefined();
  expect(live.done).toBe(false);
});

it('suppresses new recommendations during private class and refreshes at exact boundaries', () => {
  const timed: Profile = {
    ...profile,
    firstClassDate: '2026-10-07',
    classDays: [3, 6],
    classSchedule: {
      version: 1,
      timezone: 'UTC',
      exceptions: [],
      ordinary: {
        startTime: '13:00',
        endTime: '14:00',
        endsNextDay: false,
      },
    },
  };
  const tasks = [task('practice')];
  expect(
    nextPracticePlan(tasks, [], timed, Date.parse('2026-10-07T12:59:59.999Z')).next,
  ).toBeDefined();
  const during = nextPracticePlan(tasks, [], timed, Date.parse('2026-10-07T13:00Z'));
  expect(during.activeClass?.session).toBe(1);
  expect(during.next).toBeUndefined();
  expect(during.eligible).toHaveLength(1);
  expect(nextPracticePlan(tasks, [], timed, Date.parse('2026-10-07T14:00Z')).next).toBeDefined();
});

it('changes today at the learner midnight instead of UTC and rejects invalid clocks', () => {
  const local = { ...profile, timezone: 'America/New_York' };
  const tasks = [task('old'), task('new', { dueDate: '2026-10-08' })];
  expect(
    nextPracticePlan(tasks, [], local, Date.parse('2026-10-08T03:59:59.999Z')).next?.task.id,
  ).toBe('old');
  expect(nextPracticePlan(tasks, [], local, Date.parse('2026-10-08T04:00Z')).next?.task.id).toBe(
    'new',
  );
  expect(() => nextPracticePlan(tasks, [], local, NaN)).toThrow('valid planning clock');
});

it('started priority uses required saved facts, excludes review/class/future and never completes a task', () => {
  const tasks = [task('a'), task('b'), task('c'), task('d')];
  const saved = [
    entry('b', { metadata: taskPracticeMetadata('b', 'review') }),
    entry('c', { context: 'class' }),
    entry('d', { date: '2026-10-08' }),
  ];
  expect(nextPracticePlan(tasks, saved, profile, now).next?.task.id).toBe('a');
  const afterSave = nextPracticePlan(
    tasks,
    [...saved, entry('d', { id: 'current-d' })],
    profile,
    now,
  );
  expect(afterSave.next?.task.id).toBe('d');
  expect(afterSave.next?.task.done).toBe(false);
  expect(
    nextPracticePlan(
      tasks.map((item) => ({ ...item, done: item.id === 'd' })),
      [...saved, entry('d', { id: 'current-d' })],
      profile,
      now,
    ).next?.task.id,
  ).toBe('a');
});
