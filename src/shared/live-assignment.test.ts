import { describe, expect, it } from 'vitest';
import {
  liveAssignmentDeadline,
  liveAssignmentStatus,
  availableForImmediatePractice,
} from './live-assignment';
import { validatePlannedTask, legacyPlan, dailyPlanSummary, type PlannedTask } from './plan';
import { DEFAULT_PROFILE, type Profile } from './training';
import { curriculumPlan, mergeCurriculumPlan } from './curriculum';
import { validateAccountChange, validateAccountSnapshot } from './account-sync';
import { cwEventOccurrences } from './cw-events';

const time = Date.parse;
const profile: Profile = {
  ...DEFAULT_PROFILE,
  timezone: 'America/New_York',
  firstClassDate: '2026-10-08',
  classDays: [1, 4],
  level: 'intermediate',
  classSchedule: {
    version: 1,
    timezone: 'America/New_York',
    exceptions: [],
    ordinary: { startTime: '20:00', endTime: '21:00', endsNextDay: false },
  },
};
const task: PlannedTask = {
  id: 'live-one',
  title: 'Renamed radio objective',
  kind: 'on-air',
  lesson: 1,
  dueDate: '2026-10-07',
  createdAt: '2026-10-02T00:00:00Z',
  done: false,
  notes: '',
  exercise: {
    type: 'live-event',
    eventId: 'cwt',
    url: 'https://cwops.org/cwops-tests/',
    deadline: 'associated-class',
  },
};

describe('private live assignment windows', () => {
  it('previews only unfinished typed live work within seven days without creating today goals', () => {
    const tasks = [
      { ...task, id: 'next-day', dueDate: '2026-10-08' },
      { ...task, id: 'seventh-day', dueDate: '2026-10-14' },
      { ...task, id: 'eighth-day', dueDate: '2026-10-15' },
      { ...task, id: 'finished', dueDate: '2026-10-09', done: true },
      { ...task, id: 'generic', dueDate: '2026-10-10', exercise: undefined },
    ];
    const before = structuredClone(tasks);
    const summary = dailyPlanSummary(tasks, [], [], '2026-10-07');
    expect(summary.liveUpcoming.map((item) => item.task.id)).toEqual(['next-day', 'seventh-day']);
    expect(summary.currentCount).toBe(0);
    expect(summary.pendingCount).toBe(0);
    expect(summary.completedCount).toBe(0);
    expect(summary.assignedToday).toEqual([]);
    expect(tasks).toEqual(before);
  });
  it('agrees with shared occurrences before, during and at the end of CWT', () => {
    const start = time('2026-10-07T13:00Z');
    expect(liveAssignmentStatus(task, profile, start - 1)).toMatchObject({
      state: 'upcoming',
      next: { start },
    });
    expect(availableForImmediatePractice(task, profile, start - 1)).toBe(false);
    for (const now of [start, start + 3_599_999]) {
      expect(liveAssignmentStatus(task, profile, now)).toMatchObject({
        state: 'active',
        current: { start },
      });
      expect(availableForImmediatePractice(task, profile, now)).toBe(true);
    }
    const after = liveAssignmentStatus(task, profile, start + 3_600_000)!;
    expect(after.state).toBe('upcoming');
    expect(after.next).toEqual(cwEventOccurrences(start + 3_600_000, time('2026-10-09'), 'cwt')[0]);
    expect(after.next!.start).toBe(time('2026-10-07T19:00Z'));
  });
  it('strict start-before due includes an end after class and excludes exact due start', () => {
    const adjusted = (startTime: string): Profile => ({
      ...profile,
      classSchedule: {
        ...profile.classSchedule!,
        timezone: 'UTC',
        ordinary: { startTime, endTime: '09:00', endsNextDay: false },
      },
    });
    expect(liveAssignmentStatus(task, adjusted('07:00'), time('2026-10-08T06:59Z'))!.state).toBe(
      'unavailable',
    );
    const status = liveAssignmentStatus(task, adjusted('07:30'), time('2026-10-08T07:45Z'))!;
    expect(status.state).toBe('active');
    expect(status.current!.end).toBe(time('2026-10-08T08:00Z'));
    expect(status.deadline!.at).toBe(time('2026-10-08T07:30Z'));
    expect(liveAssignmentStatus(task, adjusted('07:30'), time('2026-10-08T08:00Z'))!.state).toBe(
      'unavailable',
    );
  });
  it('resolves dated class exceptions in meeting zone, independent of display and practice date', () => {
    const changed = {
      ...profile,
      timezone: 'Asia/Tokyo',
      classSchedule: {
        ...profile.classSchedule!,
        exceptions: [
          {
            session: 1,
            date: '2026-10-07',
            timezone: 'UTC',
            startTime: '13:30',
            endTime: '14:30',
            endsNextDay: false,
          },
        ],
      },
    };
    expect(liveAssignmentDeadline(task, changed)).toEqual({
      at: time('2026-10-07T13:30Z'),
      source: 'class-start',
      timezone: 'UTC',
    });
    expect(
      liveAssignmentStatus({ ...task, dueDate: '2026-10-06' }, changed, time('2026-10-07T13:15Z'))!
        .current!.start,
    ).toBe(time('2026-10-07T13:00Z'));
    expect(task.id).toBe('live-one');
    expect(task.done).toBe(false);
  });
  it('uses explicit conservative date-only and practice-date fallbacks or requests a deadline', () => {
    const untimed = { ...profile, classSchedule: undefined };
    expect(liveAssignmentDeadline(task, untimed)).toEqual({
      at: time('2026-10-08T04:00Z'),
      source: 'class-date-start',
      timezone: 'America/New_York',
    });
    expect(liveAssignmentStatus(task, untimed, time('2026-10-08T04:00Z'))!.state).toBe(
      'unavailable',
    );
    const dated = {
      ...task,
      exercise: {
        ...task.exercise!,
        type: 'live-event' as const,
        eventId: 'cwt' as const,
        url: 'https://cwops.org/cwops-tests/',
        deadline: 'practice-date' as const,
      },
    };
    expect(liveAssignmentDeadline(dated, profile)).toEqual({
      at: time('2026-10-08T04:00Z'),
      source: 'practice-date-end',
      timezone: 'America/New_York',
    });
    expect(liveAssignmentDeadline({ ...dated, dueDate: '2026-10-08' }, profile)!.at).toBe(
      time('2026-10-09T04:00Z'),
    );
    expect(
      liveAssignmentStatus({ ...dated, dueDate: undefined }, profile, time('2026-10-07')),
    ).toEqual({ state: 'needs-deadline' });
    expect(
      availableForImmediatePractice({ ...task, exercise: undefined }, profile, time('2026-10-07')),
    ).toBe(true);
  });
  it('retains UTC recurrence through DST, local midnight and year rollover with bounded distant deadlines', () => {
    for (const [date, expected] of [
      ['2026-11-02', '2026-11-03T01:00Z'],
      ['2026-10-26', '2026-10-27T00:00Z'],
    ]) {
      const selected = {
        ...profile,
        firstClassDate: date,
        classSchedule: {
          ...profile.classSchedule!,
          ordinary: { startTime: '20:00', endTime: '21:00', endsNextDay: false },
        },
      };
      expect(liveAssignmentDeadline(task, selected)!.at).toBe(time(expected));
    }
    const far = { ...task, lesson: undefined, dueDate: '2028-01-01' };
    expect(liveAssignmentStatus(far, profile, time('2026-12-31T03:30Z'))!.current!.start).toBe(
      time('2026-12-31T03:00Z'),
    );
    expect(liveAssignmentStatus(far, profile, time('2026-12-31T08:00Z'))!.next!.start).toBe(
      time('2027-01-06T13:00Z'),
    );
    expect(() => liveAssignmentStatus(task, profile, NaN)).toThrow();
  });
  it('validates typed identity/deadline and preserves manual metadata in account snapshots and edits', () => {
    expect(validatePlannedTask(task).exercise).toEqual(task.exercise);
    const snapshot = validateAccountSnapshot({
      accountId: 'a',
      revision: 1,
      generation: 0,
      settings: profile,
      plan: [task],
    });
    expect(snapshot.plan[0].exercise).toEqual(task.exercise);
    expect(
      validateAccountChange({
        type: 'task-edit',
        id: task.id,
        changes: { exercise: task.exercise },
      }),
    ).toMatchObject({ changes: { exercise: task.exercise } });
    for (const patch of [
      { eventId: 'other' },
      { deadline: 'after-class' },
      { startsAt: '2026-10-07' },
      { url: 'https://user:password@example.com/' },
    ])
      expect(() =>
        validatePlannedTask({ ...task, exercise: { ...task.exercise, ...patch } }),
      ).toThrow();
  });
  it('uses catalog and imported typed live identity without matching titles or rewriting saved completion', () => {
    const generated = curriculumPlan(profile).filter(
      (item) => item.exercise?.type === 'live-event',
    );
    expect(generated.length).toBeGreaterThan(0);
    expect(
      generated.every(
        (item) => item.exercise?.type === 'live-event' && item.exercise.eventId === 'cwt',
      ),
    ).toBe(true);
    const completed = { ...generated[0], done: true, title: 'Learner renamed objective' };
    const merged = mergeCurriculumPlan(profile, [completed]).find(
      (item) => item.id === completed.id,
    )!;
    expect(merged.done).toBe(true);
    expect(merged.title).toBe(completed.title);
    expect(merged.exercise).toEqual(generated[0].exercise);
    const imported = legacyPlan(
      {
        assignments: [
          {
            session: 1,
            date: '2026-10-07',
            tasks: [
              { id: 'old', kind: 'live', title: 'Renamed original', instructions: 'Keep private.' },
            ],
          },
        ],
      },
      [],
      '2026-10-02T00:00:00Z',
    );
    expect(imported[0].exercise).toMatchObject({
      type: 'live-event',
      eventId: 'cwt',
      deadline: 'associated-class',
    });
    expect(imported[0].notes).toBe('Keep private.');
    expect(imported[0].done).toBe(false);
  });
});
