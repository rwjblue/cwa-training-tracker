import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  summarizePractice,
  validateTrainingExport,
  type PracticeSession,
} from './training';
import {
  legacyPlan,
  dailyPlanSummary,
  practiceForTask,
  taskDueDate,
  validatePlan,
  validatePlannedTask,
  weeklyReport,
  nativeCopyTask,
  type PlannedTask,
  savedTaskProgress,
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

describe('saved assigned recording passes', () => {
  const assignedUrl = 'https://cwa.cwops.org/wp-content/uploads/ING7_15.mp3';
  const fasterUrl = 'https://cwa.cwops.org/wp-content/uploads/ING7_18.mp3';
  const task = exercise({
    id: 'current-audio',
    dueDate: '2026-09-29',
    exercise: { type: 'audio', url: assignedUrl, minimumPasses: 4, maximumPasses: 6 },
    curriculum: {
      id: 'cwa-intermediate-v2.3',
      exerciseId: 's1-d1-t1',
      day: 1,
      sourceUrl: 'https://cwops.org/',
    },
  });
  const entry = (id = 'heard'): PracticeSession => ({
    id,
    date: '2026-09-29',
    kind: 'listening',
    minutes: 1,
    notes: '',
    createdAt: '2026-09-29T12:00:00.000Z',
    metadata: {
      plannedTaskId: task.id,
      evidence: {
        version: 1,
        type: 'timed',
        measurement: { seconds: 60, recallSeconds: 10 },
        recordings: [
          {
            url: assignedUrl,
            seconds: 20,
            passes: {
              version: 1,
              method: 'native-1x',
              durations: [{ durationSeconds: 10, completedPasses: 1 }],
            },
          },
          {
            url: fasterUrl,
            seconds: 20,
            passes: {
              version: 1,
              method: 'native-1x',
              durations: [{ durationSeconds: 10, completedPasses: 2 }],
            },
          },
        ],
      },
    },
  });
  it('counts distinct source passes once across direct/recognized aliases, and keeps completion separate', () => {
    const direct = entry();
    const alias = entry('curriculum-alias');
    alias.metadata!.plannedTaskId = 'curriculum:cwa-intermediate-v2.3:s1-d1-t1';
    const values = [direct, direct, alias];
    const original = structuredClone({ task, values });
    const result = savedTaskProgress([task], values, '2026-09-29').get(task.id)!;
    expect(result).toEqual({
      loggedMinutes: 2,
      todayMinutes: 2,
      completedPasses: 6,
      importedCompletedPasses: 0,
      remainingPasses: 0,
    });
    expect(savedTaskProgress([{ ...task, done: true }], values, '2026-09-29').get(task.id)).toEqual(
      result,
    );
    expect(
      savedTaskProgress([task], values, '2026-09-29', direct.id).get(task.id)?.completedPasses,
    ).toBe(3);
    expect(dailyPlanSummary([task], [], [direct], '2026-09-29').assignedToday[0]).toMatchObject({
      completedPasses: 3,
      remainingPasses: 1,
      status: 'started',
      task: { done: false },
    });
    expect({ task, values }).toEqual(original);
  });
  it('keeps exact owned placement ahead of an otherwise recognized compatibility alias', () => {
    const separate = {
      ...task,
      id: 'legacy-task:s1-d1-t1',
      source: 'legacy' as const,
      curriculum: undefined,
    };
    const directlyLinked = entry('separate-placement');
    directlyLinked.metadata!.plannedTaskId = separate.id;
    const compatible = entry('qualified-curriculum-alias');
    compatible.metadata!.plannedTaskId = 'curriculum:cwa-intermediate-v2.3:s1-d1-t1';
    const imported: PracticeSession = {
      ...entry('explicit-import'),
      source: 'legacy',
      metadata: { legacyAttempt: { taskId: 's1-d1-t1', completedPasses: 2 } },
    };
    const progress = savedTaskProgress(
      [task, separate],
      [directlyLinked, compatible, imported],
      '2026-09-29',
    );
    expect(progress.get(separate.id)).toMatchObject({
      loggedMinutes: 2,
      completedPasses: 5,
      importedCompletedPasses: 2,
      remainingPasses: 0,
    });
    expect(progress.get(task.id)).toMatchObject({
      loggedMinutes: 1,
      completedPasses: 3,
      importedCompletedPasses: 0,
      remainingPasses: 1,
    });
    expect(savedTaskProgress([task], [imported], '2026-09-29').get(task.id)).toMatchObject({
      completedPasses: 2,
      importedCompletedPasses: 2,
    });
  });
  it('excludes class/review/future/foreign/retired links and never derives passes from old seconds or another file', () => {
    const source = entry();
    const unknownSource = entry('different-source');
    unknownSource.metadata!.evidence = {
      version: 1,
      type: 'timed',
      measurement: { seconds: 20 },
      recordings: [
        {
          url: 'https://example.test/another.mp3',
          seconds: 20,
          passes: {
            version: 1,
            method: 'native-1x',
            durations: [{ durationSeconds: 10, completedPasses: 2 }],
          },
        },
      ],
    };
    const unmeasured = entry('unmeasured');
    unmeasured.metadata!.evidence = {
      version: 1,
      type: 'timed',
      measurement: { seconds: 20 },
      recordings: [{ url: assignedUrl, seconds: 20 }],
    };
    const values: PracticeSession[] = [
      { ...source, id: 'class', context: 'class' },
      { ...source, id: 'review', metadata: { ...source.metadata, practicePurpose: 'review' } },
      { ...source, id: 'future', date: '2026-09-30' },
      { ...source, id: 'foreign', metadata: { ...source.metadata, plannedTaskId: 'not-owned' } },
      {
        ...source,
        id: 'retired',
        historicalPlannedTaskId: task.id,
        metadata: { ...source.metadata, plannedTaskId: undefined },
      },
      {
        ...source,
        id: 'old-course',
        metadata: { ...source.metadata, plannedTaskId: 'curriculum:cwa-intermediate-v1:s1-d1-t1' },
      },
      { ...source, id: 'historical-raw', evidenceMode: 'historical' },
      unknownSource,
      unmeasured,
      {
        ...source,
        id: 'ordinary-recall',
        metadata: { plannedTaskId: task.id, elapsedSeconds: 60, recallSeconds: 60 },
      },
    ];
    expect(savedTaskProgress([task], values, '2026-09-29').get(task.id)).toMatchObject({
      completedPasses: 0,
      importedCompletedPasses: 0,
      remainingPasses: 4,
    });
    expect(savedTaskProgress([], values, '2026-09-29').size).toBe(0);
  });
  it('retains narrowly validated imported source counts without promoting them to native measurements', () => {
    const legacy: PracticeSession = {
      ...entry('imported'),
      source: 'legacy',
      metadata: { legacyAttempt: { taskId: 's1-d1-t1', completedPasses: 2, activeSeconds: 60 } },
    };
    const count = (values: PracticeSession[]) =>
      savedTaskProgress([task], values, '2026-09-29').get(task.id)!;
    expect(count([legacy, legacy])).toMatchObject({
      completedPasses: 2,
      importedCompletedPasses: 2,
      remainingPasses: 2,
    });
    expect(count([{ ...legacy, evidenceMode: 'historical' }])).toMatchObject({
      completedPasses: 2,
      importedCompletedPasses: 2,
      remainingPasses: 2,
    });
    const bad = [-1, 1.5, 101, NaN, Infinity, '2', undefined].map((completedPasses, index) => ({
      ...legacy,
      id: `invalid-${index}`,
      metadata: { legacyAttempt: { taskId: 's1-d1-t1', completedPasses } },
    }));
    const invalid: PracticeSession[] = [
      ...bad,
      { ...legacy, id: 'not-legacy', source: 'manual' },
      {
        ...legacy,
        id: 'review',
        metadata: { legacyAttempt: { taskId: 's1-d1-t1', completedPasses: 10, review: true } },
      },
      { ...legacy, id: 'class', context: 'class' },
      { ...legacy, id: 'future', date: '2026-09-30' },
      { ...legacy, id: 'retired', historicalPlannedTaskId: 'legacy-task:s1-d1-t1' },
      {
        ...legacy,
        id: 'foreign',
        metadata: { legacyAttempt: { taskId: 'another-task', completedPasses: 10 } },
      },
    ];
    expect(count(invalid)).toMatchObject({
      completedPasses: 0,
      importedCompletedPasses: 0,
      remainingPasses: 4,
    });
    const otherCatalog = {
      ...task,
      id: 'fundamental-task',
      curriculum: { ...task.curriculum!, id: 'cwa-fundamental-v2.0' },
    };
    expect(
      savedTaskProgress([otherCatalog], [legacy], '2026-09-29').get(otherCatalog.id)
        ?.completedPasses,
    ).toBe(0);
    expect(
      savedTaskProgress(
        [{ ...task, exercise: { type: 'external', url: assignedUrl } }],
        [legacy],
        '2026-09-29',
      ).get(task.id)?.completedPasses,
    ).toBe(0);
    expect(legacy.metadata).toEqual({
      legacyAttempt: { taskId: 's1-d1-t1', completedPasses: 2, activeSeconds: 60 },
    });
  });
});

describe('today’s private course plan', () => {
  const meetings = [
    { lesson: 1, date: '2026-09-28' },
    { lesson: 2, date: '2026-10-01' },
    { lesson: 3, date: '2026-10-05' },
  ];
  const ids = (items: ReturnType<typeof dailyPlanSummary>['assignedToday']) =>
    items.map((item) => item.task.id);

  it('keeps exact-date assignments first and future dated work out of today', () => {
    const tasks = [
      exercise({ id: 'earlier', dueDate: '2026-09-28' }),
      exercise({ id: 'today', dueDate: '2026-09-29', lesson: 2 }),
      exercise({ id: 'next-class-preparation', lesson: 2 }),
      exercise({ id: 'tomorrow', dueDate: '2026-09-30', lesson: 2 }),
      exercise({ id: 'later-lesson', lesson: 3 }),
      exercise({ id: 'independent' }),
    ];
    const result = dailyPlanSummary(tasks, meetings, [], '2026-09-29');
    expect(ids(result.assignedToday)).toEqual(['today']);
    expect(ids(result.preparation)).toEqual(['next-class-preparation']);
    expect(ids(result.earlier)).toEqual(['earlier']);
    expect(ids(result.unscheduled)).toEqual(['independent']);
    expect(ids(result.upcoming)).toEqual(['tomorrow']);
    expect(result.nextPracticeDate).toBe('2026-09-30');
    expect(result.nextMeeting).toEqual(meetings[1]);
    expect(result.pendingCount).toBe(2);
  });

  it('uses a practice-date override even when the class date is earlier', () => {
    const task = exercise({ lesson: 1, dueDate: '2026-09-30' });
    const result = dailyPlanSummary([task], meetings, [], '2026-09-29');
    expect(result.assignedToday).toEqual([]);
    expect(result.earlier).toEqual([]);
    expect(ids(result.upcoming)).toEqual([task.id]);
  });

  it('shows class-day work once, and never marks missed work complete on rollover', () => {
    const tasks = [
      exercise({ id: 'lesson-one', lesson: 1 }),
      exercise({ id: 'lesson-two', lesson: 2 }),
    ];
    const classDay = dailyPlanSummary(tasks, meetings, [], '2026-09-28');
    expect(ids(classDay.assignedToday)).toEqual(['lesson-one']);
    expect(classDay.preparation).toEqual([]);
    const nextDay = dailyPlanSummary(tasks, meetings, [], '2026-09-29');
    expect(ids(nextDay.earlier)).toEqual(['lesson-one']);
    expect(ids(nextDay.preparation)).toEqual(['lesson-two']);
    expect(tasks.every((task) => !task.done)).toBe(true);
  });

  it('dismisses only earlier unfinished tasks without changing completion or practice, and restores their progress', () => {
    const older = exercise({ id: 'older', dueDate: '2026-09-28', dismissedFromToday: true });
    const tasks = [
      older,
      exercise({ id: 'today', dueDate: '2026-09-29', dismissedFromToday: true }),
      exercise({ id: 'future', dueDate: '2026-09-30', dismissedFromToday: true }),
      exercise({ id: 'undated', dismissedFromToday: true }),
    ];
    const entries: PracticeSession[] = [
      {
        id: 'heard',
        date: '2026-09-28',
        kind: 'listening',
        minutes: 2.5,
        notes: '',
        createdAt: '2026-09-28T12:00:00Z',
        metadata: { plannedTaskId: older.id },
      },
    ];
    const original = structuredClone({ tasks, entries });
    const result = dailyPlanSummary(tasks, meetings, entries, '2026-09-29');
    expect(result.earlier).toEqual([]);
    expect(ids(result.assignedToday)).toEqual(['today']);
    expect(ids(result.upcoming)).toEqual(['future']);
    expect(ids(result.unscheduled)).toEqual(['undated']);
    expect(result.completedCount).toBe(0);
    expect({ tasks, entries }).toEqual(original);
    const restored = dailyPlanSummary(
      [{ ...older, dismissedFromToday: false }],
      meetings,
      entries,
      '2026-09-29',
    );
    expect(restored.earlier[0]).toMatchObject({
      status: 'started',
      loggedMinutes: 2.5,
      todayMinutes: 0,
    });
    const rescheduled = dailyPlanSummary(
      [{ ...older, dueDate: '2026-09-29' }],
      meetings,
      entries,
      '2026-09-29',
    );
    expect(rescheduled.assignedToday[0].task.id).toBe(older.id);
  });

  it('measures linked practice without counting class, future, duplicate, or unrelated entries', () => {
    const task = exercise({ dueDate: '2026-09-29' });
    const entry: PracticeSession = {
      id: 'entry-1',
      date: '2026-09-29',
      kind: 'listening',
      minutes: 5,
      notes: '',
      createdAt: '2026-09-29T12:00:00Z',
      metadata: { plannedTaskId: task.id },
    };
    const result = dailyPlanSummary(
      [task],
      meetings,
      [
        entry,
        entry,
        { ...entry, id: 'earlier', date: '2026-09-28', minutes: 2.5 },
        { ...entry, id: 'class', context: 'class', minutes: 60 },
        { ...entry, id: 'future', date: '2026-09-30', minutes: 10 },
        { ...entry, id: 'other', metadata: { plannedTaskId: 'another-task' }, minutes: 15 },
        { ...entry, id: 'unlinked', metadata: undefined, minutes: 15 },
      ],
      '2026-09-29',
    );
    expect(result.assignedToday[0]).toMatchObject({
      status: 'started',
      loggedMinutes: 7.5,
      todayMinutes: 5,
    });
    expect(result.pendingCount).toBe(1);
    expect(result.completedCount).toBe(0);
    expect(task.done).toBe(false);
  });

  it('recognizes privately imported attempts but excludes extra legacy review', () => {
    const task = exercise({ id: 'legacy-task:old-task', source: 'legacy', dueDate: '2026-09-29' });
    const entry: PracticeSession = {
      id: 'legacy:old-entry',
      date: '2026-09-29',
      kind: 'listening',
      minutes: 4,
      notes: '',
      createdAt: '2026-09-29T12:00:00Z',
      source: 'legacy',
      metadata: { legacyAttempt: { taskId: 'old-task', activeSeconds: 240 } },
    };
    const result = dailyPlanSummary(
      [task],
      meetings,
      [
        entry,
        {
          ...entry,
          id: 'legacy:review',
          minutes: 20,
          metadata: { legacyAttempt: { taskId: 'old-task', review: true } },
        },
      ],
      '2026-09-29',
    );
    expect(result.assignedToday[0]).toMatchObject({ status: 'started', loggedMinutes: 4 });
  });

  it.each([false, true])(
    'excludes review before direct and alias task matching without changing completion %s',
    (done) => {
      const task = exercise({
        id: 'scheduled-id',
        done,
        dueDate: '2026-09-29',
        curriculum: {
          id: 'cwa-intermediate-v2.3',
          exerciseId: 's1-d1-t1',
          day: 1,
          sourceUrl: 'https://cwops.org/',
        },
      });
      const base: PracticeSession = {
        id: 'review-direct',
        date: '2026-09-29',
        kind: 'listening',
        minutes: 5,
        notes: '',
        createdAt: '2026-09-29T12:00:00Z',
        metadata: { plannedTaskId: task.id, practicePurpose: 'review' },
      };
      const reviews: PracticeSession[] = [
        base,
        base,
        {
          ...base,
          id: 'review-alias',
          metadata: {
            plannedTaskId: 'curriculum:cwa-intermediate-v2.3:s1-d1-t1',
            practicePurpose: 'review',
          },
        },
        {
          ...base,
          id: 'legacy-linked-review',
          source: 'legacy',
          metadata: {
            plannedTaskId: 'legacy-task:s1-d1-t1',
            legacyAttempt: { taskId: 's1-d1-t1', review: true },
          },
        },
        {
          ...base,
          id: 'legacy-fallback-review',
          source: 'legacy',
          metadata: {
            legacyAttempt: { taskId: 's1-d1-t1', review: true },
          },
        },
        { ...base, id: 'class', context: 'class', minutes: 60 },
        { ...base, id: 'future', date: '2026-09-30', minutes: 60 },
      ];
      const original = structuredClone({ task, reviews });
      const result = dailyPlanSummary([task], meetings, reviews, '2026-09-29');
      expect([...result.assignedToday, ...result.completed][0]).toMatchObject({
        loggedMinutes: 0,
        todayMinutes: 0,
        status: done ? 'done' : 'ready',
        task: { done },
      });
      expect(summarizePractice(reviews, '2026-09-29').todayMinutes).toBe(20);
      const ordinary = [
        { ...base, id: 'ordinary-old', metadata: { plannedTaskId: task.id }, minutes: 2 },
        {
          ...base,
          id: 'ordinary-assigned',
          metadata: {
            plannedTaskId: task.id,
            practicePurpose: 'assigned' as const,
          },
          minutes: 3,
        },
      ];
      const advanced = dailyPlanSummary([task], meetings, [...reviews, ...ordinary], '2026-09-29');
      expect([...advanced.assignedToday, ...advanced.completed][0]).toMatchObject({
        loggedMinutes: 5,
        todayMinutes: 5,
        status: done ? 'done' : 'started',
        task: { done },
      });
      expect(summarizePractice([...reviews, ...ordinary], '2026-09-29').todayMinutes).toBe(25);
      expect({ task, reviews }).toEqual(original);
    },
  );

  it('separates checked exercises without requiring logged minutes', () => {
    const tasks = [
      exercise({ id: 'today-done', done: true, dueDate: '2026-09-29' }),
      exercise({ id: 'prep-done', done: true, lesson: 2 }),
      exercise({ id: 'earlier-done', done: true, dueDate: '2026-09-28' }),
    ];
    const result = dailyPlanSummary(tasks, meetings, [], '2026-09-29');
    expect(ids(result.completed)).toEqual(['today-done', 'prep-done']);
    expect(result.currentCount).toBe(2);
    expect(result.completedCount).toBe(2);
    expect(result.pendingCount).toBe(0);
    expect(result.earlier).toEqual([]);
    expect(
      result.completed.every((item) => item.status === 'done' && item.loggedMinutes === 0),
    ).toBe(true);
  });

  it('keeps old Intermediate practice credit out of another course with the same exercise ID', () => {
    const courses = ['cwa-intermediate-v2.3', 'cwa-fundamental-v2.0'];
    const tasks = courses.map((id) =>
      exercise({
        id: `curriculum:${id}:s1-d1-t1`,
        dueDate: '2026-09-29',
        curriculum: { id, exerciseId: 's1-d1-t1', day: 1, sourceUrl: 'https://cwops.org/' },
      }),
    );
    const result = dailyPlanSummary(
      tasks,
      meetings,
      [
        {
          id: 'old-attempt',
          date: '2026-09-29',
          kind: 'listening',
          minutes: 5,
          notes: '',
          createdAt: '2026-09-29T12:00:00Z',
          source: 'legacy',
          metadata: { legacyAttempt: { taskId: 's1-d1-t1' } },
        },
      ],
      '2026-09-29',
    );
    expect(
      result.assignedToday.find((item) => item.task.curriculum?.id === courses[0])?.loggedMinutes,
    ).toBe(5);
    expect(
      result.assignedToday.find((item) => item.task.curriculum?.id === courses[1])?.loggedMinutes,
    ).toBe(0);
  });

  it('keeps lessons undated until a course schedule exists and handles an empty or finished course', () => {
    const undated = dailyPlanSummary([exercise({ lesson: 2 })], [], [], '2026-09-29');
    expect(undated.assignedToday).toEqual([]);
    expect(undated.hasUndatedLessons).toBe(true);
    expect(undated.unscheduled).toHaveLength(1);
    const finished = dailyPlanSummary([exercise({ lesson: 2 })], meetings, [], '2026-11-01');
    expect(finished.nextMeeting).toBeUndefined();
    expect(finished.earlier).toHaveLength(1);
    expect(dailyPlanSummary([], [], [], '2026-09-29').pendingCount).toBe(0);
    expect(() => dailyPlanSummary([], [], [], '2026-02-30')).toThrow('valid date');
  });
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
    for (const value of ['true', 1, null]) {
      expect(() => validatePlannedTask({ ...exercise(), dismissedFromToday: value })).toThrow(
        'dismissal',
      );
      expect(() => validatePlannedTask({ ...exercise(), targetMinutesExplicit: value })).toThrow(
        'duration override',
      );
    }
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
      metadata: { plannedTaskId: task.id, practicePurpose: 'assigned' },
    });
    expect(practiceForTask(task, '2026-09-28', 'review').metadata).toEqual({
      plannedTaskId: task.id,
      practicePurpose: 'review',
    });
    expect(task.done).toBe(false);
    const untimed = exercise();
    delete untimed.targetMinutes;
    expect(validatePlannedTask(untimed)).toEqual(untimed);
    expect(practiceForTask(untimed, '2026-09-28')).not.toHaveProperty('minutes');
  });

  it('keeps plans in version1 backups alongside personal history', () => {
    const exported = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-09-28T12:00:00Z',
      sessions: [],
      plan: [
        exercise({
          targetMinutes: undefined,
          dismissedFromToday: true,
          targetMinutesExplicit: true,
        }),
        exercise({ id: 'restored', dismissedFromToday: false }),
      ],
    });
    expect(exported.plan?.[0]).not.toHaveProperty('targetMinutes');
    expect(exported.plan?.[0]).toMatchObject({
      dismissedFromToday: true,
      done: false,
      targetMinutesExplicit: true,
    });
    expect(exported.plan?.[1].dismissedFromToday).toBe(false);
    expect(validateTrainingExport(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
  });
});

describe('legacy homework migration', () => {
  it('adapts LCWO launch links without changing imported history, notes, identity or other websites', () => {
    for (const [path, mode] of [
      ['wordtraining', 'words'],
      ['callsigns', 'callsigns'],
      ['plaintext', 'plaintext'],
      ['groups', 'groups'],
    ] as const) {
      const task = exercise({
        id: 'legacy-task:copy',
        source: 'legacy',
        kind: 'icr',
        title: 'Private assignment',
        notes: 'Keep my original instructions',
        link: `https://lcwo.net/${path}`,
        done: true,
      });
      const original = structuredClone(task);
      expect(nativeCopyTask(task)).toMatchObject({
        ...task,
        exercise: { type: 'copy', recipe: { mode } },
      });
      expect(task).toEqual(original);
    }
    const unrelated = exercise({
      kind: 'icr',
      link: 'https://morsecode.world/international/trainer/',
    });
    expect(nativeCopyTask(unrelated)).toBe(unrelated);
    for (const path of ['koch', 'morsemachine', 'qtc', 'index.php?p=koch']) {
      const unsupported = exercise({
        kind: 'icr',
        title: 'Word practice',
        link: `https://lcwo.net/${path}`,
      });
      expect(nativeCopyTask(unsupported)).toBe(unsupported);
    }
    expect(
      nativeCopyTask(exercise({ kind: 'icr', link: 'https://lcwo.net/index.php?p=callsigns' }))
        .exercise,
    ).toMatchObject({ type: 'copy', recipe: { mode: 'callsigns' } });
    expect(
      nativeCopyTask(exercise({ kind: 'icr', link: 'https://lcwo.net/', title: 'Word copy' }))
        .exercise,
    ).toMatchObject({ type: 'copy', recipe: { mode: 'words' } });
    const imported = legacyPlan(
      {
        assignments: [
          {
            session: 1,
            tasks: [{ id: 'words', title: 'Word copy', kind: 'icr', resourceId: 'lcwo' }],
          },
        ],
        resources: [{ id: 'lcwo', url: 'https://lcwo.net/wordtraining' }],
      },
      [],
      '2026-09-28T12:00:00Z',
    );
    expect(imported[0]).toMatchObject({
      id: 'legacy-task:words',
      link: 'https://lcwo.net/wordtraining',
      exercise: { type: 'copy', recipe: { mode: 'words' } },
    });
  });
  it('derives Runner completion from unique required practice while retaining uninterrupted simulator rules', () => {
    const course = {
      assignments: [
        {
          session: 1,
          tasks: [
            { id: 'runner', title: 'Morse Runner', kind: 'simulator', minutes: 15 },
            { id: 'short-runner', title: 'Morse-Runner review', kind: 'simulator', minutes: 15 },
            {
              id: 'other-simulator',
              title: 'A different simulator',
              kind: 'simulator',
              minutes: 15,
            },
          ],
        },
      ],
    };
    const first = {
      id: 'first',
      taskId: 'runner',
      context: 'practice',
      activeSeconds: 300,
      completed: false,
    };
    const attempts = [
      first,
      first,
      { id: 'second', taskId: 'runner', context: 'practice', activeSeconds: 600, completed: false },
      {
        id: 'short',
        taskId: 'short-runner',
        context: 'practice',
        activeSeconds: 300,
        completed: true,
      },
      {
        id: 'review',
        taskId: 'short-runner',
        context: 'practice',
        activeSeconds: 600,
        completed: true,
        review: true,
      },
      {
        id: 'class',
        taskId: 'short-runner',
        context: 'class',
        activeSeconds: 900,
        completed: true,
      },
      {
        id: 'sim-a',
        taskId: 'other-simulator',
        context: 'practice',
        activeSeconds: 600,
        completed: true,
      },
      {
        id: 'sim-b',
        taskId: 'other-simulator',
        context: 'practice',
        activeSeconds: 600,
        completed: true,
      },
    ];
    const plan = legacyPlan(course, attempts, '2026-09-28T12:00:00Z');
    expect(plan.map((task) => task.done)).toEqual([true, false, false]);
    expect(legacyPlan(course, [first, first], '2026-09-28T12:00:00Z')[0].done).toBe(false);
  });

  it('opens the referenced exercise resource and safely falls back to the syllabus', () => {
    const tasks = legacyPlan(
      {
        assignments: [
          {
            session: 1,
            tasks: [
              {
                id: 'audio',
                title: 'Example audio',
                kind: 'audio',
                resourceId: 'recording',
                sourceUrl: 'https://example.org/syllabus',
              },
              {
                id: 'missing',
                title: 'Missing resource',
                kind: 'audio',
                resourceId: 'missing',
                sourceUrl: 'https://example.org/syllabus',
              },
              {
                id: 'unresolved',
                title: 'Advisor choice',
                kind: 'audio',
                resourceId: 'needs-choice',
                sourceUrl: 'https://example.org/syllabus',
              },
              {
                id: 'unsafe',
                title: 'Invalid resource',
                kind: 'audio',
                resourceId: 'unsafe',
                sourceUrl: 'https://example.org/syllabus',
              },
            ],
          },
        ],
        resources: [
          { id: 'recording', format: 'audio', url: 'https://example.org/recording.mp3' },
          {
            id: 'needs-choice',
            format: 'audio',
            url: 'https://example.org/alternate.mp3',
            unresolved: 'Check with the advisor.',
          },
          { id: 'unsafe', format: 'link', url: 'javascript:alert(1)' },
        ],
      },
      [],
      '2026-09-28T12:00:00Z',
    );
    expect(tasks[0].link).toBe('https://example.org/recording.mp3');
    expect(tasks.slice(1).map((task) => task.link)).toEqual([
      'https://example.org/syllabus',
      'https://example.org/syllabus',
      'https://example.org/syllabus',
    ]);
  });

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
  it('counts review once while labeling its evidence separately from assigned practice', () => {
    const review: PracticeSession = {
      id: 'review',
      date: '2026-09-28',
      kind: 'sending',
      minutes: 2,
      notes: 'Review notes',
      createdAt: '2026-09-28T12:00:00Z',
      metadata: { plannedTaskId: 'task', practicePurpose: 'review', elapsedSeconds: 120 },
    };
    const assigned = {
      ...review,
      id: 'assigned',
      minutes: 3,
      notes: 'Assigned notes',
      metadata: { plannedTaskId: 'task', elapsedSeconds: 180 },
    };
    const legacy = {
      ...review,
      id: 'legacy',
      minutes: 1,
      notes: 'Legacy review notes',
      metadata: { legacyAttempt: { review: true } },
    };
    const report = weeklyReport(
      [review, review, assigned, legacy],
      DEFAULT_PROFILE,
      '2026-09-28',
      '2026-10-04',
    );
    expect(report).toContain('6 independent-practice minutes across 1 days.');
    expect(report).toContain('2 min · sending · extra review (no required assignment credit)');
    expect(report).toContain('3 min · sending · assigned practice');
    expect(report.match(/2 min · sending/g)).toHaveLength(1);
    expect(report.match(/extra review \(no required assignment credit\)/g)).toHaveLength(2);
    expect(report).toContain('Measured 120.00 seconds');
    expect(report).toContain('Assigned notes');
  });

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
    expect(report).toContain('0 actual on-air QSOs (self-reported)');
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
