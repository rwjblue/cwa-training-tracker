import { assertReportConfirmation, validateReportRelationships } from './report-handoff';
import {
  sameReportValue,
  validateReportDocument,
  validateReportDocuments,
  MAX_ACCOUNT_REPORTS,
  type ReportDocument,
} from './report-document';
import { mergeCurriculumPlan } from './curriculum';
import { MAX_PLAN_TASKS, validatePlannedTask, validateNewTaskPin, type PlannedTask } from './plan';
import { DEFAULT_PROFILE, validateProfile, type Profile } from './training';

export interface AccountSnapshot {
  accountId: string;
  revision: number;
  generation: number;
  /** Present on fresh server state; older device snapshots may omit it. */
  historyRevision?: number;
  settings: Profile;
  plan: PlannedTask[];
  reports?: ReportDocument[];
}

/** null explicitly clears an optional task field; omitted fields keep their value. */
export type AccountTaskChanges = {
  [K in keyof PlannedTask]?: PlannedTask[K] | (undefined extends PlannedTask[K] ? null : never);
};
export type AccountChange =
  | { type: 'settings'; changes: Partial<Profile> }
  | { type: 'task-create'; task: PlannedTask }
  | { type: 'task-edit'; id: string; changes: AccountTaskChanges }
  | { type: 'task-status'; ids: string[]; done?: boolean; dismissedFromToday?: boolean }
  | { type: 'task-delete'; id: string }
  | { type: 'report-save'; report: ReportDocument }
  | { type: 'report-handoff'; report: ReportDocument }
  | { type: 'report-confirm'; report: ReportDocument; confirmed: true }
  | { type: 'report-delete'; id: string };

export interface AccountOperation {
  version: 1;
  id: string;
  accountId: string;
  baseRevision: number;
  generation: number;
  createdAt: string;
  change: AccountChange;
}

const profileFields = [
  'displayName',
  'callsign',
  'useGravatar',
  'level',
  'timezone',
  'dailyGoalMinutes',
  'firstClassDate',
  'classDays',
  'classSchedule',
  'reportDefinition',
] as const;
const editFields = [
  'title',
  'kind',
  'lesson',
  'dueDate',
  'link',
  'targetMinutes',
  'targetMinutesExplicit',
  'done',
  'dismissedFromToday',
  'pinnedForDate',
  'notes',
  'exercise',
  'recordingMarks',
] as const;
const clearFields = [
  'lesson',
  'dueDate',
  'link',
  'targetMinutes',
  'targetMinutesExplicit',
  'dismissedFromToday',
  'pinnedForDate',
  'exercise',
  'recordingMarks',
];
const curriculumEditFields = [
  'title',
  'targetMinutes',
  'targetMinutesExplicit',
  'done',
  'dismissedFromToday',
  'pinnedForDate',
  'notes',
  'recordingMarks',
];
const taskFields = [
  'id',
  'title',
  'kind',
  'lesson',
  'dueDate',
  'link',
  'targetMinutes',
  'targetMinutesExplicit',
  'done',
  'dismissedFromToday',
  'pinnedForDate',
  'notes',
  'createdAt',
  'source',
  'curriculum',
  'exercise',
  'recordingMarks',
];

function effectivePlan(value: unknown): PlannedTask[] {
  // A snapshot includes generated assignments in addition to the bounded stored rows.
  if (!Array.isArray(value) || value.length > MAX_PLAN_TASKS + 1000)
    throw new Error('The account snapshot contains too many exercises.');
  const plan = value.map(validatePlannedTask);
  if (new Set(plan.map((task) => task.id)).size !== plan.length)
    throw new Error('The account snapshot contains duplicate exercise IDs.');
  return plan;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an account sync object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported account sync field.');
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,199}$/.test(value))
    throw new Error('Invalid account sync ID.');
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid account revision or generation.');
  return value;
}

export function validateAccountChange(value: unknown): AccountChange {
  const input = record(value);
  switch (input.type) {
    case 'settings': {
      keys(input, ['type', 'changes']);
      const changes = record(input.changes);
      keys(changes, profileFields);
      if (
        !Object.keys(changes).length ||
        Object.entries(changes).some(
          ([key, value]) =>
            value === undefined ||
            (value === null && !['classSchedule', 'reportDefinition'].includes(key)),
        )
      )
        throw new Error('Choose profile fields to change.');
      // Partial operations cannot know existing course dates. Full projection
      // below and the Worker validate the resulting schedule before any write.
      const normalized = validateProfile(
        { ...DEFAULT_PROFILE, ...changes },
        { partialSchedule: true },
      );
      return {
        type: 'settings',
        changes: Object.fromEntries(
          Object.keys(changes).map((key) => [key, normalized[key as keyof Profile]]),
        ),
      };
    }
    case 'task-create': {
      keys(input, ['type', 'task']);
      keys(record(input.task), taskFields);
      const task = validatePlannedTask(input.task);
      if (task.source === 'curriculum' || task.curriculum || task.id.startsWith('curriculum:'))
        throw new Error('Course exercises are added automatically from your schedule.');
      return { type: 'task-create', task };
    }
    case 'task-edit': {
      keys(input, ['type', 'id', 'changes']);
      const changes = record(input.changes);
      keys(changes, editFields);
      if (
        !Object.keys(changes).length ||
        Object.values(changes).some((value) => value === undefined)
      )
        throw new Error('Choose exercise fields to change.');
      for (const [key, value] of Object.entries(changes))
        if (value === null && !clearFields.includes(key))
          throw new Error('This exercise field cannot be cleared.');
      const sample = {
        id: id(input.id),
        title: 'Exercise',
        kind: 'other',
        done: false,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const candidate = { ...sample, ...changes };
      for (const [key, value] of Object.entries(changes))
        if (value === null) delete candidate[key as keyof typeof candidate];
      const normalized = validatePlannedTask(candidate);
      return {
        type: 'task-edit',
        id: sample.id,
        changes: Object.fromEntries(
          Object.keys(changes).map((key) => [
            key,
            changes[key] === null ? null : (normalized[key as keyof PlannedTask] ?? null),
          ]),
        ) as AccountTaskChanges,
      };
    }
    case 'task-status': {
      keys(input, ['type', 'ids', 'done', 'dismissedFromToday']);
      if (
        !Array.isArray(input.ids) ||
        input.ids.length < 1 ||
        input.ids.length > 2000 ||
        new Set(input.ids).size !== input.ids.length
      )
        throw new Error('Choose between 1 and 2,000 distinct exercise IDs.');
      const change: Extract<AccountChange, { type: 'task-status' }> = {
        type: 'task-status',
        ids: input.ids.map(id),
      };
      for (const key of ['done', 'dismissedFromToday'] as const) {
        if (input[key] === undefined) continue;
        if (typeof input[key] !== 'boolean')
          throw new Error('Exercise status must be true or false.');
        change[key] = input[key];
      }
      if (change.done === undefined && change.dismissedFromToday === undefined)
        throw new Error('Choose an exercise status to change.');
      return change;
    }
    case 'report-delete':
      keys(input, ['type', 'id']);
      return { type: 'report-delete', id: id(input.id) };
    case 'report-handoff':
    case 'report-confirm':
    case 'report-save': {
      keys(
        input,
        input.type === 'report-confirm' ? ['type', 'report', 'confirmed'] : ['type', 'report'],
      );
      const report = validateReportDocument(input.report, { fieldRules: true });
      if (input.type === 'report-handoff') {
        if (report.status !== 'handoff') throw new Error('Prepare a captured handoff.');
        return { type: 'report-handoff', report };
      }
      if (input.type === 'report-confirm') {
        if (input.confirmed !== true || report.status !== 'submitted' || !report.confirmation)
          throw new Error('Submitted copies require an explicit confirmed handoff.');
        return { type: 'report-confirm', report, confirmed: true };
      }
      if (report.status !== 'draft')
        throw new Error('Submitted copies require an explicit confirmed handoff.');
      return { type: 'report-save', report };
    }
    case 'task-delete':
      keys(input, ['type', 'id']);
      return { type: 'task-delete', id: id(input.id) };
    default:
      throw new Error('Unsupported account change.');
  }
}

export function validateAccountOperation(value: unknown): AccountOperation {
  const input = record(value);
  keys(input, ['version', 'id', 'accountId', 'baseRevision', 'generation', 'createdAt', 'change']);
  if (input.version !== 1) throw new Error('Unsupported account operation version.');
  if (
    typeof input.createdAt !== 'string' ||
    input.createdAt.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.createdAt) ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    new Date(`${input.createdAt.slice(0, 10)}T12:00:00Z`).toISOString().slice(0, 10) !==
      input.createdAt.slice(0, 10)
  )
    throw new Error('Invalid account operation time.');
  return {
    version: 1,
    id: id(input.id),
    accountId: id(input.accountId),
    baseRevision: revision(input.baseRevision),
    generation: revision(input.generation),
    createdAt: input.createdAt,
    change: validateAccountChange(input.change),
  };
}

export function validateAccountSnapshot(value: unknown): AccountSnapshot {
  const input = record(value);
  keys(input, [
    'accountId',
    'revision',
    'generation',
    'historyRevision',
    'settings',
    'plan',
    'reports',
  ]);
  const settings = record(input.settings);
  keys(settings, profileFields);
  if (
    profileFields.some(
      (key) =>
        !['useGravatar', 'classSchedule', 'reportDefinition'].includes(key) &&
        settings[key] === undefined,
    )
  )
    throw new Error('The account snapshot is missing profile fields.');
  const reports = input.reports === undefined ? undefined : validateReportDocuments(input.reports);
  if (reports) validateReportRelationships(reports);
  return {
    accountId: id(input.accountId),
    revision: revision(input.revision),
    generation: revision(input.generation),
    ...(input.historyRevision === undefined
      ? {}
      : { historyRevision: revision(input.historyRevision) }),
    settings: validateProfile(settings),
    plan: effectivePlan(input.plan),
    ...(reports === undefined ? {} : { reports }),
  };
}

/** Shared semantic projection; revisions are assigned only by the Worker. */
export function applyAccountChange(state: AccountSnapshot, change: AccountChange): AccountSnapshot {
  if (change.type === 'report-delete') {
    const report = state.reports?.find((report) => report.id === change.id);
    if (!report) throw new Error('This saved report was not found.');
    if (report.status !== 'draft')
      throw new Error('Confirmed submitted history cannot be deleted as a draft.');
    return { ...state, reports: state.reports?.filter((report) => report.id !== change.id) };
  }
  if (
    change.type === 'report-save' ||
    change.type === 'report-handoff' ||
    change.type === 'report-confirm'
  ) {
    const reports = state.reports ?? [];
    if (change.type === 'report-confirm')
      assertReportConfirmation(
        change.report,
        reports.find((report) => report.id === change.report.confirmation?.handoffId),
      );
    const existing = reports.find((report) => report.id === change.report.id);
    if (existing && !sameReportValue(existing, change.report))
      throw new Error('Saved report copies are immutable. Reopen as a new draft.');
    if (!existing && reports.length >= MAX_ACCOUNT_REPORTS)
      throw new Error(
        'Keep up to 200 report copies, including handoffs and confirmations. Export a backup, remove older draft copies, or use reviewed account reset before adding more.',
      );
    const next = existing ? reports : [...reports, change.report];
    validateReportRelationships(next);
    return { ...state, reports: next };
  }
  if (change.type === 'settings') {
    const settings = validateProfile({ ...state.settings, ...change.changes });
    return { ...state, settings, plan: mergeCurriculumPlan(settings, state.plan) };
  }
  let plan = state.plan;
  if (change.type === 'task-create') {
    if (plan.some((task) => task.id === change.task.id))
      throw new Error('This exercise is already in your plan.');
    validateNewTaskPin(undefined, change.task, state.settings);
    plan = effectivePlan([...plan, change.task]);
  } else {
    const ids = change.type === 'task-status' ? change.ids : [change.id];
    if (ids.some((id) => !plan.some((task) => task.id === id)))
      throw new Error('One or more exercises were not found in your current plan.');
    if (change.type === 'task-delete') {
      if (plan.find((task) => task.id === change.id)?.source === 'curriculum')
        throw new Error('Course exercises follow your schedule and cannot be deleted.');
      plan = plan.filter((task) => task.id !== change.id);
    } else
      plan = plan.map((task) => {
        if (!ids.includes(task.id)) return task;
        const patch =
          change.type === 'task-status'
            ? {
                ...(change.done === undefined ? {} : { done: change.done }),
                ...(change.dismissedFromToday === undefined
                  ? {}
                  : { dismissedFromToday: change.dismissedFromToday }),
              }
            : change.changes;
        if (
          (task.source === 'curriculum' || task.curriculum) &&
          Object.keys(patch).some((key) => !curriculumEditFields.includes(key))
        )
          throw new Error('Course exercise facts are fixed by your curriculum.');
        const next = { ...task, ...patch };
        for (const [key, value] of Object.entries(patch))
          if (value === null) delete next[key as keyof typeof next];
        const validated = validatePlannedTask(next);
        validateNewTaskPin(task, validated, state.settings);
        return validated;
      });
  }
  return { ...state, plan };
}
