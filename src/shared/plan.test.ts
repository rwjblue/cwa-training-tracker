import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, validateTrainingExport, type PracticeSession } from './training';
import {
  legacyPlan,
  practiceForTask,
  taskDueDate,
  validatePlan,
  validatePlannedTask,
  weeklyReport,
  type PlannedTask,
} from './plan';

const exercise = (extra: Partial<PlannedTask> = {}): PlannedTask => ({
  id: 'task-1',
  title: 'An original listening exercise',
  kind: 'listening',
  targetMinutes: 15,
  done: false,
  notes: '',
  createdAt: '2026-09-28T12:00:00.000Z',
  ...extra,
});

describe('private planned exercises', () => {
  it('validates original notes and requires meaningful bounded fields', () => {
    expect(
      validatePlannedTask(exercise({ title: '  Listen closely  ', notes: 'A private note' })).title,
    ).toBe('Listen closely');
    expect(() => validatePlannedTask(exercise({ title: '  ' }))).toThrow('title');
    expect(() => validatePlannedTask(exercise({ targetMinutes: 0 }))).toThrow('minutes');
    expect(() => validatePlannedTask(exercise({ targetMinutes: Infinity }))).toThrow('minutes');
    expect(() => validatePlannedTask(exercise({ lesson: 17 }))).toThrow('session');
    expect(() => validatePlannedTask(exercise({ dueDate: '2026-02-29' }))).toThrow('date');
  });

  it('allows useful web links and rejects executable links or embedded credentials', () => {
    expect(
      validatePlannedTask(exercise({ link: 'https://example.org/exercise?speed=20' })).link,
    ).toBe('https://example.org/exercise?speed=20');
    for (const link of [
      'javascript:alert(1)',
      'data:text/html,example',
      'https://name:secret@example.org/',
      'not-a-link',
    ]) {
      expect(() => validatePlannedTask(exercise({ link }))).toThrow();
    }
  });

  it('requires unique IDs and caps the number of exercises', () => {
    expect(() => validatePlan([exercise(), exercise()])).toThrow('duplicate');
    expect(() =>
      validatePlan(Array.from({ length: 2001 }, (_, index) => exercise({ id: `task-${index}` }))),
    ).toThrow('2000');
  });

  it('uses an explicit practice date ahead of the class calendar', () => {
    const meetings = [
      { lesson: 1, date: '2026-09-28' },
      { lesson: 2, date: '2026-10-01' },
    ];
    expect(taskDueDate(exercise({ lesson: 2 }), meetings)).toBe('2026-10-01');
    expect(taskDueDate(exercise({ lesson: 2, dueDate: '2026-09-29' }), meetings)).toBe(
      '2026-09-29',
    );
    expect(taskDueDate(exercise(), meetings)).toBeUndefined();
  });

  it('prefills a journal entry but does not mark an exercise complete', () => {
    const task = exercise({ lesson: 3 });
    expect(practiceForTask(task, '2026-09-28')).toMatchObject({
      lesson: 3,
      kind: 'listening',
      minutes: 15,
      date: '2026-09-28',
      metadata: { plannedTaskId: task.id },
    });
    expect(task.done).toBe(false);
  });

  it('keeps plans in version1 backups alongside personal history', () => {
    const exported = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-09-28T12:00:00Z',
      sessions: [],
      plan: [exercise()],
    });
    expect(exported.plan).toEqual([exercise()]);
    expect(validateTrainingExport(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
  });
});

describe('legacy homework migration', () => {
  it('imports only privately supplied tasks and respects explicit completion', () => {
    const tasks = legacyPlan(
      {
        assignments: [
          {
            session: 2,
            date: '2026-09-29',
            tasks: [
              {
                id: 'one',
                title: 'Private exercise 1',
                kind: 'audio',
                instructions: 'Original private note',
                sourceUrl: 'https://example.org/one',
              },
              { id: 'two', title: 'Private exercise 2', kind: 'sending', minutes: 10 },
              { id: 'three', title: 'Private exercise 3', kind: 'icr', minutes: 5 },
            ],
          },
        ],
      },
      [
        { taskId: 'one', completed: true, context: 'practice' },
        { taskId: 'two', completed: true, context: 'practice', review: true },
        { taskId: 'three', completed: true, context: 'class' },
      ],
      '2026-09-28T12:00:00Z',
    );
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      id: 'legacy-task:one',
      kind: 'listening',
      done: true,
      notes: 'Original private note',
      dueDate: '2026-09-29',
      lesson: 2,
      source: 'legacy',
    });
    expect(tasks[1].done).toBe(false);
    expect(tasks[2].done).toBe(false);
    expect(legacyPlan({}, [], '2026-09-28T12:00:00Z')).toEqual([]);
  });
});

describe('advisor practice reports', () => {
  it('excludes class minutes from the total while preserving zero results and notes', () => {
    const base: PracticeSession = {
      id: 'entry-1',
      date: '2026-09-28',
      kind: 'on-air',
      minutes: 9.5,
      notes: 'Listening only',
      qsoCount: 0,
      createdAt: '2026-09-28T12:00:00Z',
    };
    const report = weeklyReport(
      [
        base,
        { ...base, id: 'class-1', context: 'class', minutes: 60 },
        { ...base, id: 'outside', date: '2026-10-10', minutes: 100 },
      ],
      { ...DEFAULT_PROFILE, callsign: 'N0CALL' },
      '2026-09-28',
      '2026-10-04',
    );
    expect(report).toContain('N0CALL — practice report');
    expect(report).toContain('9.5 independent-practice minutes across 1 days.');
    expect(report).toContain('0 QSOs');
    expect(report).toContain('60 min · on-air · class');
    expect(report).toContain('Listening only');
    expect(report).not.toContain('100 min');
  });

  it('rejects backwards and malformed ranges and explains an empty period', () => {
    expect(() => weeklyReport([], DEFAULT_PROFILE, '2026-10-04', '2026-09-28')).toThrow(
      'report dates',
    );
    expect(() => weeklyReport([], DEFAULT_PROFILE, 'bad', '2026-09-28')).toThrow('report dates');
    expect(weeklyReport([], DEFAULT_PROFILE, '2026-09-28', '2026-10-04')).toContain(
      'No practice entries',
    );
  });
});
