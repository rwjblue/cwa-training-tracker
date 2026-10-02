import { expect, it } from 'vitest';
import { dailyPlanSummary, validatePlannedTask, weeklyReport, type PlannedTask } from './plan';
import { applyAccountChange, validateAccountChange, type AccountSnapshot } from './account-sync';
import {
  DEFAULT_PROFILE,
  dateInTimezone,
  validateTrainingExport,
  type PracticeSession,
} from './training';
import { dailyPracticeGoals } from './practice-time';
import { nextPracticePlan } from './next-practice';
import { curriculumPlan, mergeCurriculumPlan } from './curriculum';

const today = '2026-10-07';
const profile = { ...DEFAULT_PROFILE, timezone: 'America/New_York' };
const task: PlannedTask = {
  id: 'older',
  title: 'Earlier sending',
  kind: 'sending',
  dueDate: '2026-10-05',
  done: false,
  dismissedFromToday: true,
  notes: 'Original instructions',
  createdAt: '2026-10-01T12:00:00.000Z',
};
const state = (plan = [task]): AccountSnapshot => ({
  accountId: 'synthetic-a',
  revision: 1,
  generation: 0,
  settings: profile,
  plan,
});
const pin = (date: string | null = today) =>
  validateAccountChange({ type: 'task-edit', id: task.id, changes: { pinnedForDate: date } });

it('pins dismissed earlier work without changing assignment, history, goals or reports; unpin restores dismissal', () => {
  const entry: PracticeSession = {
    id: 'saved',
    date: '2026-10-05',
    kind: 'sending',
    minutes: 3,
    notes: 'Earlier facts',
    createdAt: '2026-10-05T12:00:00.000Z',
    metadata: { plannedTaskId: task.id, practicePurpose: 'assigned' },
  };
  const original = structuredClone({ task, entry });
  const next = applyAccountChange(state(), pin());
  expect(next.plan).toEqual([{ ...task, pinnedForDate: today }]);
  const plan = dailyPlanSummary(next.plan, [], [entry], today);
  expect(plan.pinned).toMatchObject([
    { dueDate: task.dueDate, status: 'started', loggedMinutes: 3 },
  ]);
  expect(plan.earlier).toEqual([]);
  expect(plan.assignedToday).toEqual([]);
  expect(plan.currentCount).toBe(0);
  expect(dailyPracticeGoals(profile, next.plan, today)).toEqual(
    dailyPracticeGoals(profile, [task], today),
  );
  expect(weeklyReport([entry], profile, '2026-10-01', today)).toBe(
    weeklyReport([original.entry], profile, '2026-10-01', today),
  );
  expect(applyAccountChange(next, pin()).plan).toEqual(next.plan);
  const removed = applyAccountChange(next, pin(null));
  expect(removed.plan).toEqual([task]);
  expect(dailyPlanSummary(removed.plan, [], [entry], today).earlier).toEqual([]);
  const restored = applyAccountChange(removed, {
    type: 'task-status',
    ids: [task.id],
    dismissedFromToday: false,
  });
  expect(dailyPlanSummary(restored.plan, [], [entry], today).earlier).toHaveLength(1);
  expect({ task, entry }).toEqual(original);
});

it('expires at learner midnight and keeps the captured calendar date across valid timezone changes', () => {
  const next = applyAccountChange(state(), pin());
  const before = new Date('2026-10-08T03:59:59Z');
  const after = new Date('2026-10-08T04:00:00Z');
  expect(
    dailyPlanSummary(next.plan, [], [], dateInTimezone(before, profile.timezone)).pinned,
  ).toHaveLength(1);
  expect(
    dailyPlanSummary(next.plan, [], [], dateInTimezone(after, profile.timezone)).pinned,
  ).toEqual([]);
  const utc = applyAccountChange(next, { type: 'settings', changes: { timezone: 'UTC' } });
  expect(utc.plan[0].pinnedForDate).toBe(today);
  expect(
    dailyPlanSummary(utc.plan, [], [], dateInTimezone(before, utc.settings.timezone)).pinned,
  ).toEqual([]);
  expect(nextPracticePlan(next.plan, [], profile, before.getTime()).next?.task.id).toBe(task.id);
  expect(nextPracticePlan(next.plan, [], profile, after.getTime()).next).toBeUndefined();
});

it('prioritizes assigned work, then deliberate pins, then ordinary earlier work without duplication', () => {
  const pinned = { ...task, pinnedForDate: today };
  const tasks = [
    pinned,
    { ...task, id: 'oldest', dueDate: '2026-10-01', dismissedFromToday: false },
    { ...task, id: 'today', dueDate: today, dismissedFromToday: false },
  ];
  expect(
    nextPracticePlan(tasks, [], profile, Date.parse('2026-10-07T12:00Z')).eligible.map(
      ({ task }) => task.id,
    ),
  ).toEqual(['today', 'older', 'oldest']);
  const plan = dailyPlanSummary([pinned, pinned], [], [], today);
  expect(plan.pinned).toHaveLength(1);
  expect(dailyPlanSummary([{ ...pinned, done: true }], [], [], today).pinned).toEqual([]);
});

it.each(['', '2026-02-29', '2026-04-31', '2026-10-07T00:00Z', null, 7, true])(
  'rejects malformed dated pins %j',
  (pinnedForDate) => {
    expect(() => validatePlannedTask({ ...task, pinnedForDate })).toThrow('calendar date');
  },
);

it('validates new pin eligibility and known references without rejecting historical completed pins', () => {
  for (const candidate of [
    { ...task, done: true },
    { ...task, dueDate: today },
    { ...task, dueDate: undefined },
    { ...task, dueDate: '2026-10-08' },
  ])
    expect(() => applyAccountChange(state([candidate]), pin())).toThrow('earlier unfinished');
  expect(() => applyAccountChange(state([]), pin())).toThrow('not found');
  const completed = { ...task, pinnedForDate: today, done: true };
  expect(
    applyAccountChange(state([completed]), {
      type: 'task-edit',
      id: task.id,
      changes: { notes: 'Later note' },
    }).plan[0],
  ).toEqual({ ...completed, notes: 'Later note' });
  expect(applyAccountChange(state([completed]), pin(null)).plan[0]).not.toHaveProperty(
    'pinnedForDate',
  );
});

it('preserves curriculum pins through schedule changes and roundtrips old/new private backups', () => {
  const settings = { ...profile, firstClassDate: '2026-10-01' };
  const assigned = curriculumPlan(settings)[0];
  const captured = '2026-11-01';
  const current = { ...state(), settings, plan: [assigned] };
  const pinned = applyAccountChange(current, {
    type: 'task-edit',
    id: assigned.id,
    changes: { pinnedForDate: captured },
  }).plan[0];
  expect(pinned).toEqual({ ...assigned, pinnedForDate: captured });
  const moved = { ...settings, firstClassDate: '2026-12-01' };
  expect(mergeCurriculumPlan(moved, [pinned])[0]).toMatchObject({
    pinnedForDate: captured,
    dueDate: curriculumPlan(moved).find((item) => item.id === pinned.id)!.dueDate,
  });
  const backup = {
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: '2026-10-07T12:00:00.000Z',
    sessions: [],
    profile,
    plan: [task, { ...pinned, done: true }],
  };
  expect(validateTrainingExport(backup).plan).toEqual(backup.plan);
  expect(validateTrainingExport({ ...backup, plan: [task] }).plan?.[0]).not.toHaveProperty(
    'pinnedForDate',
  );
  expect(() =>
    validateTrainingExport({ ...backup, plan: [{ ...task, pinnedForDate: '2026-02-30' }] }),
  ).toThrow('calendar date');
});

it('a historical pin ceases affecting priority or dismissal after the assignment is rescheduled to today', () => {
  const historical = {
    ...task,
    id: 'today-fresh',
    dueDate: today,
    pinnedForDate: today,
    dismissedFromToday: false,
  };
  const started = { ...historical, id: 'today-started', pinnedForDate: undefined };
  const hidden = { ...historical, id: 'today-dismissed', dismissedFromToday: true };
  const saved: PracticeSession = {
    id: 'today-progress',
    date: today,
    kind: 'sending',
    minutes: 1,
    notes: '',
    createdAt: '2026-10-07T10:00:00.000Z',
    metadata: { plannedTaskId: started.id, practicePurpose: 'assigned' },
  };
  const plan = nextPracticePlan(
    [historical, hidden, started, { ...task, pinnedForDate: today }],
    [saved],
    profile,
    Date.parse('2026-10-07T12:00Z'),
  );
  expect(plan.eligible.map(({ task }) => task.id)).toEqual([started.id, historical.id, task.id]);
});
