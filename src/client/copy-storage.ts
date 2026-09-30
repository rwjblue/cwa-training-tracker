import {
  validateCopyAttempt,
  validateCopyRecipe,
  type CopyAttempt,
  type CopyRecipe,
} from '../shared/copy-practice';
import { validatePlannedTask, type PlannedTask } from '../shared/plan';
import { validatePracticeSession, type PracticeSession } from '../shared/training';

export interface CopyDraft {
  attempt: CopyAttempt;
  answer: string;
  position: number;
  replayCount: number;
  trialAnswerStartedAt: number;
  heard: boolean;
  /** Cumulative answer seconds at which auto-skip becomes due; paused time is excluded. */
  autoSkipAt?: number;
  notes: string;
  task?: PlannedTask;
  pending?: PracticeSession;
}

export const copyStorageKey = (scope: string) => `cwa:copy:v1:${encodeURIComponent(scope)}`;

export function loadCopyDraft(scope: string): CopyDraft | undefined {
  try {
    const raw = localStorage.getItem(copyStorageKey(scope));
    if (!raw || raw.length > 300000) return;
    const value = JSON.parse(raw) as CopyDraft;
    const attempt = validateCopyAttempt(value.attempt);
    if (
      typeof value.answer !== 'string' ||
      value.answer.length > 2000 ||
      typeof value.notes !== 'string' ||
      value.notes.length > 10000
    )
      return;
    if (
      ![value.position, value.replayCount, value.trialAnswerStartedAt].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0,
      )
    )
      return;
    if (
      value.position > 1220 ||
      !Number.isInteger(value.replayCount) ||
      value.replayCount > 1000 ||
      value.trialAnswerStartedAt > attempt.answerSeconds
    )
      return;
    if (
      value.autoSkipAt !== undefined &&
      (typeof value.autoSkipAt !== 'number' ||
        !Number.isFinite(value.autoSkipAt) ||
        value.autoSkipAt < 0 ||
        value.autoSkipAt > 7260)
    )
      return;
    const pending = value.pending ? validatePracticeSession(value.pending) : undefined;
    if (pending && JSON.stringify(pending.metadata?.copyAttempt) !== JSON.stringify(attempt))
      return;
    return {
      ...value,
      attempt,
      pending,
      task: value.task ? validatePlannedTask(value.task) : undefined,
      heard: value.heard === true,
    };
  } catch {
    return;
  }
}

export function saveCopyDraft(scope: string, draft: CopyDraft): boolean {
  try {
    localStorage.setItem(copyStorageKey(scope), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Never remove another account's or another attempt's recovery record. */
export function clearCopyDraft(scope: string, attemptId: string) {
  try {
    if (loadCopyDraft(scope)?.attempt.id === attemptId)
      localStorage.removeItem(copyStorageKey(scope));
  } catch {
    /* Practice remains usable when browser storage is unavailable. */
  }
}

/** New rounds use current defaults; existing attempt recipes are never migrated. */
export function copySetupRecipe(recipe: CopyRecipe): CopyRecipe {
  return {
    ...recipe,
    toneMode: recipe.toneMode ?? 'random',
    ...(recipe.mode === 'groups' ? { lengthMode: 'duration' as const } : {}),
  };
}

export function loadCopyPreferences(
  scope: string,
  mode: CopyRecipe['mode'],
): CopyRecipe | undefined {
  try {
    const raw = localStorage.getItem(`${copyStorageKey(scope)}:settings:${mode}`);
    const recipe = raw ? validateCopyRecipe(JSON.parse(raw)) : undefined;
    return recipe?.mode === mode ? copySetupRecipe(recipe) : undefined;
  } catch {
    return;
  }
}
export function saveCopyPreferences(scope: string, recipe: CopyRecipe) {
  try {
    localStorage.setItem(
      `${copyStorageKey(scope)}:settings:${recipe.mode}`,
      JSON.stringify(recipe),
    );
  } catch {
    /* optional */
  }
}

interface Lease {
  owner: string;
  expires: number;
}
const leaseKey = (scope: string) => `${copyStorageKey(scope)}:lease`;
export function copyLease(scope: string): Lease | undefined {
  try {
    const raw = localStorage.getItem(leaseKey(scope));
    const value = raw ? (JSON.parse(raw) as Lease) : undefined;
    return value && typeof value.owner === 'string' && Number.isFinite(value.expires)
      ? value
      : undefined;
  } catch {
    return;
  }
}
export function claimCopyLease(scope: string, owner: string, force = false): boolean {
  const current = copyLease(scope);
  if (!force && current && current.owner !== owner && current.expires > Date.now()) return false;
  try {
    localStorage.setItem(leaseKey(scope), JSON.stringify({ owner, expires: Date.now() + 8000 }));
  } catch {
    /* Allow nonpersistent practice. */
  }
  return true;
}
export function ownsCopyLease(scope: string, owner: string) {
  const current = copyLease(scope);
  return !current || current.owner === owner;
}
export function releaseCopyLease(scope: string, owner: string) {
  try {
    if (copyLease(scope)?.owner === owner) localStorage.removeItem(leaseKey(scope));
  } catch {
    /* optional */
  }
}
