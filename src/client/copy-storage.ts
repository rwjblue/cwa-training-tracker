import { validateCopyRecipe, type CopyAttempt, type CopyRecipe } from '../shared/copy-practice';
import type { PlannedTask } from '../shared/plan';
import type { PracticePurpose, PracticeSession } from '../shared/training';
import { validateCopyDraft } from './copy-draft-validator';
import { getDeviceScopeToken, isDeviceScopeCurrent } from './device-scope';
import { getConfirmedAccountGeneration } from './account-outbox';
import { freezePracticeSaveOrigin } from './practice-autosave';

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
  /** Captured with this round; absent on legacy drafts and never inferred from the next launch. */
  purpose?: PracticePurpose;
  pending?: PracticeSession;
}

export const copyStorageKey = (scope: string) => `cwa:copy:v1:${encodeURIComponent(scope)}`;

export function loadCopyDraft(scope: string): CopyDraft | undefined {
  try {
    const raw = localStorage.getItem(copyStorageKey(scope));
    if (!raw || raw.length > 300000) return;
    const draft = validateCopyDraft(JSON.parse(raw));
    if (draft.pending) freezePracticeSaveOrigin(scope, draft.pending.id, undefined);
    return draft;
  } catch {
    return;
  }
}

export function saveCopyDraft(
  scope: string,
  draft: CopyDraft,
  deviceToken = getDeviceScopeToken(scope),
): boolean {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
  try {
    if (draft.pending) {
      const previous = localStorage.getItem(copyStorageKey(scope));
      const retained = previous
        ? (JSON.parse(previous) as CopyDraft).pending?.id === draft.pending.id
        : false;
      freezePracticeSaveOrigin(
        scope,
        draft.pending.id,
        scope === 'guest' || retained ? undefined : getConfirmedAccountGeneration(scope),
        deviceToken,
      );
    }
    const raw = JSON.stringify(draft);
    localStorage.setItem(copyStorageKey(scope), raw);
    return localStorage.getItem(copyStorageKey(scope)) === raw;
  } catch {
    return false;
  }
}

/** Never remove another account's or another attempt's recovery record. */
export function clearCopyDraft(
  scope: string,
  attemptId: string,
  deviceToken = getDeviceScopeToken(scope),
) {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return;
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

/** Legacy drafts have ordinary assigned meaning without rewriting their saved body. */
export function copyDraftMatchesRequest(
  draft: CopyDraft,
  task?: PlannedTask,
  purpose?: PracticePurpose,
): boolean {
  return (
    draft.task?.id === task?.id &&
    (!task || (draft.purpose ?? 'assigned') === (purpose ?? 'assigned'))
  );
}

/** An explicit new round adopts the requested attribution and, for a different task, its recipe. */
export function nextCopyRoundContext(
  current: CopyDraft | undefined,
  requested: { task?: PlannedTask; purpose?: PracticePurpose; recipe?: CopyRecipe },
  selectedRecipe: CopyRecipe,
  detachAssignment = false,
): { task?: PlannedTask; purpose?: PracticePurpose; recipe: CopyRecipe } {
  const task = detachAssignment ? undefined : requested.task;
  return {
    task: task ? structuredClone(task) : undefined,
    purpose: task ? (requested.purpose ?? 'assigned') : undefined,
    recipe: copySetupRecipe(
      !detachAssignment && current && current.task?.id !== task?.id && requested.recipe
        ? requested.recipe
        : selectedRecipe,
    ),
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
export function saveCopyPreferences(
  scope: string,
  recipe: CopyRecipe,
  deviceToken = getDeviceScopeToken(scope),
) {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return;
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
export function claimCopyLease(
  scope: string,
  owner: string,
  force = false,
  deviceToken = getDeviceScopeToken(scope),
): boolean {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
  const current = copyLease(scope);
  if (!force && current && current.owner !== owner && current.expires > Date.now()) return false;
  try {
    localStorage.setItem(leaseKey(scope), JSON.stringify({ owner, expires: Date.now() + 8000 }));
  } catch {
    /* Allow nonpersistent practice. */
  }
  return true;
}
export function ownsCopyLease(
  scope: string,
  owner: string,
  deviceToken = getDeviceScopeToken(scope),
) {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
  const current = copyLease(scope);
  return !current || current.owner === owner;
}
export function releaseCopyLease(
  scope: string,
  owner: string,
  deviceToken = getDeviceScopeToken(scope),
) {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return;
  try {
    if (copyLease(scope)?.owner === owner) localStorage.removeItem(leaseKey(scope));
  } catch {
    /* optional */
  }
}
