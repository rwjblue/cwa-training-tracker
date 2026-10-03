import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../shared/training';
import { starterAdvisorReportDefinition } from '../shared/report-definition';
import { createReportDocument } from '../shared/report-document';
import {
  loadReportDraftStore,
  saveReportDraftStore,
  invalidateReportDraftMemory,
  reportDraftStoreKey,
  validateReportDraftStore,
} from './report-drafts';
import { invalidateDeviceScope } from './device-scope';
import {
  captureDeviceBackup,
  validateDeviceBackup,
  clearDeviceWork,
  restoreDeviceBackup,
} from './device-backup';
import { rememberAccount } from './account-outbox';
let values: Map<string, string>;
let storage: Storage;
const draft = () =>
  createReportDocument(starterAdvisorReportDefinition(), DEFAULT_PROFILE, [], 1, '2026-10-01', []);
beforeEach(() => {
  values = new Map();
  storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal(
    'CustomEvent',
    class<T> extends Event {
      detail: T;
      constructor(type: string, options: CustomEventInit<T>) {
        super(type);
        this.detail = options.detail!;
      }
    },
  );
  for (const scope of ['report-owner', 'report-other']) invalidateReportDraftMemory(scope);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('scoped device report drafts', () => {
  it('restores separate sessions and selected class with exact identity, edits and intentional blanks', () => {
    const first = draft();
    first.answers.callsign = '';
    first.editedKeys = ['callsign'];
    const second = { ...draft(), id: 'second', window: { ...first.window, session: 2 } };
    const initial = loadReportDraftStore('report-owner', 0);
    const saved = saveReportDraftStore('report-owner', 'initial', initial, {
      ...initial.value,
      selectedSession: 2,
      drafts: [first, second],
    });
    expect(saved.error).toBe('');
    invalidateReportDraftMemory('report-owner');
    expect(loadReportDraftStore('report-owner', 0).value).toEqual(saved.value);
    expect(loadReportDraftStore('report-other', 0).value.drafts).toEqual([]);
  });
  it('retains memory with truthful feedback after storage refusal and can retry exact state', () => {
    const initial = loadReportDraftStore('report-owner', 0);
    const set = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const next = saveReportDraftStore('report-owner', 'initial', initial, {
      ...initial.value,
      drafts: [draft()],
    });
    expect(next.error).toContain('page only');
    expect(values.has(reportDraftStoreKey('report-owner'))).toBe(false);
    expect(loadReportDraftStore('report-owner', 0).value).toEqual(next.value);
    expect(loadReportDraftStore('report-owner', 1).value.drafts).toEqual([]);
    set.mockRestore();
    const retried = saveReportDraftStore('report-owner', 'initial', next, next.value);
    expect(retried.error).toBe('');
    expect(JSON.parse(values.get(reportDraftStoreKey('report-owner'))!)).toEqual(next.value);
  });
  it('prevents stale tabs, unreadable state and retired owners from replacing stored drafts', () => {
    const initial = loadReportDraftStore('report-owner', 0);
    const current = { ...initial.value, drafts: [draft()] };
    values.set(reportDraftStoreKey('report-owner'), JSON.stringify(current));
    const attempt = saveReportDraftStore('report-owner', 'initial', initial, {
      ...initial.value,
      selectedSession: 2,
    });
    expect(attempt.error).toContain('Another tab');
    expect(JSON.parse(values.get(reportDraftStoreKey('report-owner'))!)).toEqual(current);
    invalidateReportDraftMemory('report-owner');
    values.set(reportDraftStoreKey('report-owner'), 'broken');
    const damaged = loadReportDraftStore('report-owner', 0);
    expect(damaged.error).toContain('could not be read');
    expect(saveReportDraftStore('report-owner', 'initial', damaged, current).error).toContain(
      'unreadable',
    );
    expect(values.get(reportDraftStoreKey('report-owner'))).toBe('broken');
    invalidateDeviceScope('report-owner');
    expect(() => saveReportDraftStore('report-owner', 'initial', initial, current)).toThrow(
      'changed',
    );
  });
  it('joins complete private backup, scoped clear and validated restore while preserving foreign drafts', () => {
    rememberAccount(
      { id: 'report-owner', email: 'synthetic@example.test' },
      {
        accountId: 'report-owner',
        revision: 0,
        generation: 0,
        settings: DEFAULT_PROFILE,
        plan: [],
      },
    );
    const initial = loadReportDraftStore('report-owner', 0);
    const saved = saveReportDraftStore('report-owner', 'initial', initial, {
      ...initial.value,
      drafts: [draft()],
    });
    values.set(reportDraftStoreKey('report-other'), JSON.stringify(saved.value));
    const backup = captureDeviceBackup('report-owner', 'Synthetic');
    expect(backup.stores.reportDrafts).toEqual(saved.value);
    expect(() => validateDeviceBackup(JSON.stringify(backup), 'report-other')).toThrow('belongs');
    clearDeviceWork('report-owner');
    expect(values.has(reportDraftStoreKey('report-owner'))).toBe(false);
    expect(values.has(reportDraftStoreKey('report-other'))).toBe(true);
    restoreDeviceBackup(backup, { expectedScope: 'report-owner' });
    invalidateReportDraftMemory('report-owner');
    expect(loadReportDraftStore('report-owner', 0).value).toEqual(saved.value);
  });
  it('rejects duplicate sessions, guest backups and generation mismatches', () => {
    const initial = loadReportDraftStore('report-owner', 0);
    expect(() =>
      validateReportDraftStore({ ...initial.value, drafts: [draft(), draft()] }),
    ).toThrow('distinct');
    values.set(
      reportDraftStoreKey('report-owner'),
      JSON.stringify({ ...initial.value, generation: 3, drafts: [draft()] }),
    );
    expect(loadReportDraftStore('report-owner', 4).error).toContain('retired');
    const guest = captureDeviceBackup('guest', 'Guest');
    guest.stores.reportDrafts = initial.value;
    expect(() => validateDeviceBackup(JSON.stringify(guest), 'guest')).toThrow('Guest');
  });
});
