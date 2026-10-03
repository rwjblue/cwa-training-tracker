import type { InstructorMaterial } from './instructor-material';
import { describe, expect, it } from 'vitest';
import {
  applyAccountChange,
  validateAccountChange,
  validateAccountOperation,
  validateAccountSnapshot,
  type AccountOperation,
  type AccountSnapshot,
} from './account-sync';
import { DEFAULT_PROFILE } from './training';
import type { PlannedTask } from './plan';
import { curriculumPlan } from './curriculum';

const task: PlannedTask = {
  id: 'private-task',
  title: 'Practice sending',
  kind: 'sending',
  dueDate: '2026-10-01',
  targetMinutes: 17,
  done: false,
  notes: 'Keep this reminder',
  createdAt: '2026-09-30T12:00:00.000Z',
  source: 'manual',
};
const state = (): AccountSnapshot => ({
  accountId: 'account-a',
  revision: 2,
  generation: 0,
  settings: { ...DEFAULT_PROFILE, displayName: 'A learner' },
  plan: [{ ...task }],
});
const operation = (): AccountOperation => ({
  version: 1,
  id: 'operation-a',
  accountId: 'account-a',
  baseRevision: 2,
  generation: 0,
  createdAt: '2026-09-30T12:00:00.000Z',
  change: { type: 'settings', changes: { callsign: 'n1rwj' } },
});

describe('account synchronization protocol', () => {
  it('normalizes only supplied profile fields and preserves unrelated current preferences', () => {
    const validated = validateAccountOperation(operation());
    expect(validated.change).toEqual({ type: 'settings', changes: { callsign: 'N1RWJ' } });
    const next = applyAccountChange(state(), validated.change);
    expect(next.settings).toEqual({ ...state().settings, callsign: 'N1RWJ' });
    expect(next.revision).toBe(2);
    expect(state().settings.callsign).toBe('');
  });

  it.each([
    { version: 2 },
    { accountId: '' },
    { id: '../../other' },
    { baseRevision: -1 },
    { baseRevision: 0.5 },
    { baseRevision: Number.MAX_SAFE_INTEGER + 1 },
    { generation: undefined },
    { createdAt: '2026-02-30T12:00:00Z' },
    { secret: 'unsupported' },
  ])('rejects malformed operation authority %j', (changes) => {
    expect(() => validateAccountOperation({ ...operation(), ...changes })).toThrow();
  });

  it.each([
    { type: 'settings', changes: {} },
    { type: 'settings', changes: { callsign: null } },
    { type: 'settings', changes: { dailyGoalMinutes: 4 } },
    { type: 'settings', changes: { classDays: [1, 1] } },
    { type: 'settings', changes: { password: 'private' } },
    { type: 'task-status', ids: [task.id] },
    { type: 'task-status', ids: [task.id, task.id], done: true },
    { type: 'task-status', ids: [task.id], done: 'true' },
    { type: 'task-edit', id: task.id, changes: { source: 'curriculum' } },
    { type: 'task-edit', id: task.id, changes: { title: null } },
    { type: 'task-edit', id: task.id, changes: { targetMinutes: 0 } },
    { type: 'task-create', task: { ...task, unexpected: true } },
  ])('rejects malformed semantic payload %j', (change) => {
    expect(() => validateAccountChange(change)).toThrow();
  });

  it('patches completion without replacing notes, time overrides, or placement', () => {
    expect(
      applyAccountChange(state(), { type: 'task-status', ids: [task.id], done: true }).plan,
    ).toEqual([{ ...task, done: true }]);
    expect(
      applyAccountChange(state(), { type: 'task-status', ids: [task.id], dismissedFromToday: true })
        .plan,
    ).toEqual([{ ...task, dismissedFromToday: true }]);
  });

  it('distinguishes an omitted field from explicitly clearing an optional field', () => {
    const change = validateAccountChange({
      type: 'task-edit',
      id: task.id,
      changes: { title: '  Revised title  ', dueDate: null, targetMinutes: null },
    });
    expect(applyAccountChange(state(), change).plan).toEqual([
      { ...task, title: 'Revised title', dueDate: undefined, targetMinutes: undefined },
    ]);
    expect(
      applyAccountChange(state(), {
        type: 'task-edit',
        id: task.id,
        changes: { notes: 'New note' },
      }).plan[0].targetMinutes,
    ).toBe(17);
  });

  it('protects published curriculum facts while retaining learner edits', () => {
    const settings = { ...DEFAULT_PROFILE, firstClassDate: '2026-09-28' };
    const assigned = curriculumPlan(settings)[0];
    const current = { ...state(), settings, plan: [assigned] };
    expect(() =>
      applyAccountChange(current, {
        type: 'task-edit',
        id: assigned.id,
        changes: { kind: 'other' },
      }),
    ).toThrow('curriculum');
    expect(() => applyAccountChange(current, { type: 'task-delete', id: assigned.id })).toThrow(
      'cannot be deleted',
    );
    expect(() => validateAccountChange({ type: 'task-create', task: assigned })).toThrow(
      'automatically',
    );
    expect(
      applyAccountChange(current, {
        type: 'task-edit',
        id: assigned.id,
        changes: { notes: 'Personal reminder' },
      }).plan[0],
    ).toEqual({ ...assigned, notes: 'Personal reminder' });
    const imported = { ...assigned, id: 'legacy-task:s1-d1-t1', source: 'legacy' as const };
    expect(() =>
      applyAccountChange(
        { ...current, plan: [imported] },
        { type: 'task-edit', id: imported.id, changes: { dueDate: '2026-10-01' } },
      ),
    ).toThrow('curriculum');
  });

  it('rejects missing tasks and duplicate creates without modifying the base snapshot', () => {
    const current = state();
    expect(() =>
      applyAccountChange(current, { type: 'task-status', ids: ['missing'], done: true }),
    ).toThrow('not found');
    expect(() => applyAccountChange(current, { type: 'task-create', task })).toThrow('already');
    expect(current).toEqual(state());
  });

  it('validates snapshot revision and duplicate task identities', () => {
    expect(validateAccountSnapshot(state())).toEqual(state());
    expect(validateAccountSnapshot({ ...state(), historyRevision: 9 })).toEqual({
      ...state(),
      historyRevision: 9,
    });
    for (const historyRevision of ['9', -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => validateAccountSnapshot({ ...state(), historyRevision })).toThrow();
    expect(() => validateAccountSnapshot({ ...state(), revision: '2' })).toThrow();
    expect(() => validateAccountSnapshot({ ...state(), settings: {} })).toThrow('missing');
    expect(() => validateAccountSnapshot({ ...state(), plan: [task, task] })).toThrow('duplicate');
  });
});


it('retains an owned material cohort when revising after course settings change, while rejecting new roots in unrelated cohorts', () => {
  const old: InstructorMaterial = { version: 1, id: 'old-course-material', course: { level: 'beginner', firstClassDate: '2026-09-28' },
    session: 1, title: 'Old cohort', text: 'Original', usage: 'reference', createdAt: '2026-09-28T00:00:00.000Z' };
  const before = { ...state(), settings: { ...DEFAULT_PROFILE, level: 'advanced' as const, firstClassDate: '2026-10-03' }, materials: [old] };
  const revision = { ...old, id: 'old-course-revision', text: 'Revision', supersedesId: old.id };
  expect(applyAccountChange(before, { type: 'material-create', material: revision }).materials).toEqual([old, revision]);
  expect(() => applyAccountChange(before, { type: 'material-create', material: { ...old, id: 'unrelated-root' } })).toThrow('current configured course');
  expect(() => applyAccountChange(before, { type: 'material-create', material: { ...revision, session: 2 } })).toThrow('same account');
});
