import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';
import { DEFAULT_PROFILE, validatePracticeSession } from '../shared/training';
import { rememberAccount } from './account-outbox';
import { autoSavePractice, loadPracticeSaveOrigin } from './practice-autosave';
import { captureDeviceBackup } from './device-backup';
import {
  claimCopyLease,
  clearCopyDraft,
  copyStorageKey,
  loadCopyDraft,
  loadCopyPreferences,
  ownsCopyLease,
  releaseCopyLease,
  saveCopyDraft,
  saveCopyPreferences,
  type CopyDraft,
} from './copy-storage';
import {
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  invalidateDeviceScope,
} from './device-scope';

function draft(id = 'recovery'): CopyDraft {
  const attempt = createCopyAttempt(
    { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 1 },
    { id, seed: 'recovery-fixture', now: '2026-09-29T12:00:00.000Z' },
  );
  return {
    attempt: {
      ...attempt,
      updatedAt: '2026-09-29T12:01:00.000Z',
      audioSeconds: 12.5,
      answerSeconds: 3,
    },
    answer: 'partial answer',
    position: 12.5,
    replayCount: 1,
    trialAnswerStartedAt: 0,
    heard: true,
    notes: 'Continue tomorrow',
    autoSkipAt: 5,
  };
}

function finishedDraft(id: string): CopyDraft {
  const current = draft(id);
  current.attempt = submitCopyAnswer(current.attempt, current.attempt.targets[0], {
    now: current.attempt.updatedAt,
  });
  current.pending = validatePracticeSession({
    ...copyAttemptSessionFields(current.attempt),
    date: '2026-09-29',
    kind: 'icr',
    notes: current.notes,
  });
  return current;
}
const account = (scope: string, generation: number) =>
  rememberAccount(
    { id: scope, email: 'synthetic@example.test' },
    { accountId: scope, generation, revision: 0, settings: DEFAULT_PROFILE, plan: [] },
  );

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('native copy recovery', () => {
  it('keeps recovery, preferences, and clearing scoped to the account and attempt', () => {
    const guest = draft();
    const account = draft('private');
    saveCopyDraft('guest', guest);
    saveCopyDraft('account', account);
    expect(loadCopyDraft('guest')).toMatchObject(guest);
    expect(loadCopyDraft('account')).toMatchObject(account);
    clearCopyDraft('guest', 'private');
    expect(loadCopyDraft('guest')).toBeDefined();
    clearCopyDraft('account', 'private');
    expect(loadCopyDraft('account')).toBeUndefined();
    expect(loadCopyDraft('guest')?.autoSkipAt).toBe(5);
    saveCopyPreferences('account', defaultCopyRecipe('words'));
    expect(loadCopyPreferences('guest', 'words')).toBeUndefined();
    expect(loadCopyPreferences('account', 'words')?.mode).toBe('words');
  });

  it('validates frozen retries and refuses pending evidence from a different result', () => {
    const current = draft();
    current.attempt = submitCopyAnswer(current.attempt, current.attempt.targets[0], {
      now: current.attempt.updatedAt,
    });
    current.pending = validatePracticeSession({
      ...copyAttemptSessionFields(current.attempt),
      date: '2026-09-29',
      kind: 'icr',
      notes: current.notes,
    });
    saveCopyDraft('account', current);
    expect(loadCopyDraft('account')?.pending).toEqual(current.pending);
    current.attempt = { ...current.attempt, reviewSeconds: 1 };
    saveCopyDraft('account', current);
    expect(loadCopyDraft('account')).toBeUndefined();
    localStorage.setItem(
      copyStorageKey('account'),
      JSON.stringify({
        ...current,
        pending: { id: 'copy:recovery', metadata: { copyAttempt: current.attempt } },
      }),
    );
    expect(loadCopyDraft('account')).toBeUndefined();
  });

  it('migrates future settings to duration and random tone without changing old drafts', () => {
    const legacy = draft();
    delete legacy.attempt.recipe.toneMode;
    saveCopyDraft('guest', legacy);
    saveCopyPreferences('guest', legacy.attempt.recipe);
    const settings = loadCopyPreferences('guest', 'groups');
    expect(settings).toMatchObject({ lengthMode: 'duration', toneMode: 'random' });
    expect(loadCopyDraft('guest')?.attempt).toEqual(legacy.attempt);
    expect(loadCopyDraft('guest')?.attempt.recipe).not.toHaveProperty('toneMode');
    saveCopyPreferences('guest', { ...settings!, toneMode: 'fixed', toneHz: 725 });
    expect(loadCopyPreferences('guest', 'groups')).toMatchObject({
      toneMode: 'fixed',
      toneHz: 725,
    });
  });

  it('retains a legacy pending save without adding random-tone metadata', () => {
    const current = draft();
    delete current.attempt.recipe.toneMode;
    current.attempt = submitCopyAnswer(current.attempt, current.attempt.targets[0], {
      now: current.attempt.updatedAt,
    });
    current.pending = validatePracticeSession({
      ...copyAttemptSessionFields(current.attempt),
      date: '2026-09-29',
      kind: 'icr',
      notes: current.notes,
    });
    saveCopyDraft('account', current);
    expect(loadCopyDraft('account')?.pending).toEqual(current.pending);
    expect(loadCopyDraft('account')?.attempt.recipe).not.toHaveProperty('toneMode');
  });

  it('freezes a new pending result’s original generation before its draft and preserves it in device export', () => {
    const scope = 'new-copy-origin';
    account(scope, 4);
    const current = finishedDraft('new-copy');
    expect(saveCopyDraft(scope, current)).toBe(true);
    expect(loadPracticeSaveOrigin(scope, current.pending!.id).generation).toBe(4);
    expect(loadCopyDraft(scope)?.pending).toEqual(current.pending);
    // Draft-only recovery synthesizes its body but uses the existing immutable origin.
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.practice[0].origin).toMatchObject({
      id: current.pending!.id,
      accountId: scope,
      generation: 4,
    });
    expect(saveCopyDraft(scope, { ...current, notes: 'Later review notes' })).toBe(true);
    expect(loadPracticeSaveOrigin(scope, current.pending!.id).generation).toBe(4);
  });

  it('never gives a loaded generation-less pending draft the current account generation', async () => {
    const scope = 'legacy-copy-origin';
    account(scope, 5);
    const current = finishedDraft('legacy-copy');
    localStorage.setItem(copyStorageKey(scope), JSON.stringify(current));
    expect(loadCopyDraft(scope)?.pending).toEqual(current.pending);
    expect(loadPracticeSaveOrigin(scope, current.pending!.id).generation).toBeUndefined();
    saveCopyDraft(scope, current);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await autoSavePractice(scope, current.pending!)).destination).toBe('device');
    expect(fetch).not.toHaveBeenCalled();
    expect(
      captureDeviceBackup(scope, 'Synthetic learner').stores.practice[0].origin,
    ).not.toHaveProperty('generation');
  });

  it('keeps a legacy pending origin unknown even when neither origin nor result can persist', async () => {
    const scope = 'unwritable-legacy-copy-origin';
    account(scope, 6);
    const current = finishedDraft('unwritable-legacy');
    localStorage.setItem(copyStorageKey(scope), JSON.stringify(current));
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    expect(loadCopyDraft(scope)?.pending).toEqual(current.pending);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(autoSavePractice(scope, current.pending!)).rejects.toThrow(
      'unknown original dataset',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(loadCopyDraft(scope)?.pending).toEqual(current.pending);
  });

  it('rejects malformed recovery, impossible answer origins, and settings for another mode', () => {
    for (const bad of [
      { ...draft(), trialAnswerStartedAt: 4 },
      { ...draft(), replayCount: 1.5 },
      { ...draft(), autoSkipAt: -1 },
      { ...draft(), answer: 'A'.repeat(2001) },
    ]) {
      localStorage.setItem(copyStorageKey('guest'), JSON.stringify(bad));
      expect(loadCopyDraft('guest')).toBeUndefined();
    }
    localStorage.setItem(
      `${copyStorageKey('guest')}:settings:groups`,
      JSON.stringify(defaultCopyRecipe('words')),
    );
    expect(loadCopyPreferences('guest', 'groups')).toBeUndefined();
  });

  it('requires explicit takeover while a lease is live, and releasing permits immediate reload', () => {
    expect(claimCopyLease('guest', 'tab-one')).toBe(true);
    expect(claimCopyLease('guest', 'tab-two')).toBe(false);
    expect(ownsCopyLease('guest', 'tab-two')).toBe(false);
    releaseCopyLease('guest', 'tab-two');
    expect(ownsCopyLease('guest', 'tab-one')).toBe(true);
    releaseCopyLease('guest', 'tab-one');
    expect(claimCopyLease('guest', 'reloaded-tab')).toBe(true);
    expect(claimCopyLease('guest', 'tab-two', true)).toBe(true);
    expect(ownsCopyLease('guest', 'reloaded-tab')).toBe(false);
    expect(claimCopyLease('another-account', 'reloaded-tab')).toBe(true);
  });

  it('keeps practice usable when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('unavailable');
      },
    });
    expect(loadCopyDraft('guest')).toBeUndefined();
    expect(saveCopyDraft('guest', draft())).toBe(false);
    expect(claimCopyLease('guest', 'tab')).toBe(true);
    expect(() => clearCopyDraft('guest', 'recovery')).not.toThrow();
  });

  it('prevents a stale copy owner or its cleanup from resurrecting a cleared draft', () => {
    const token = getDeviceScopeToken('cleared-account');
    const original = draft('cleared-copy');
    claimCopyLease('cleared-account', 'old-tab', false, token);
    saveCopyDraft('cleared-account', original, token);
    const next = invalidateDeviceScope('cleared-account');
    localStorage.removeItem(copyStorageKey('cleared-account'));
    localStorage.removeItem(`${copyStorageKey('cleared-account')}:lease`);
    completeDeviceScopeMutation('cleared-account', next);
    expect(ownsCopyLease('cleared-account', 'old-tab', token)).toBe(false);
    expect(claimCopyLease('cleared-account', 'old-tab', true, token)).toBe(false);
    expect(saveCopyDraft('cleared-account', original, token)).toBe(false);
    expect(loadCopyDraft('cleared-account')).toBeUndefined();
    const restored = { ...original, notes: 'Restored copy notes' };
    saveCopyDraft('cleared-account', restored, next);
    clearCopyDraft('cleared-account', original.attempt.id, token);
    expect(loadCopyDraft('cleared-account')?.notes).toBe(restored.notes);
    expect(saveCopyDraft('another-account', draft('other'))).toBe(true);
  });
});
