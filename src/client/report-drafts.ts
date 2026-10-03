import { validateReportDocument, type ReportDocument } from '../shared/report-document';
import { requireCurrentDeviceScope, getDeviceScopeToken } from './device-scope';

export const reportDraftStoreKey = (scope: string) =>
  `cwa.reports.drafts.v1:${encodeURIComponent(scope)}`;
export interface ReportDraftStore {
  version: 1;
  generation: number;
  selectedSession: number;
  drafts: ReportDocument[];
}
export interface ReportDraftState {
  value: ReportDraftStore;
  raw: string | null;
  error: string;
}
const memory = new Map<string, { token: string; state: ReportDraftState }>();
type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function validateReportDraftStore(value: unknown): ReportDraftStore {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Report device drafts must be an object.');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some(
      (key) => !['version', 'generation', 'selectedSession', 'drafts'].includes(key),
    ) ||
    row.version !== 1 ||
    !Number.isSafeInteger(row.generation) ||
    Number(row.generation) < 0 ||
    !Number.isInteger(row.selectedSession) ||
    Number(row.selectedSession) < 1 ||
    Number(row.selectedSession) > 16 ||
    !Array.isArray(row.drafts) ||
    row.drafts.length > 16
  )
    throw new Error('Invalid report device draft inventory.');
  const drafts = row.drafts.map((value) => validateReportDocument(value));
  if (
    drafts.some((draft) => draft.status !== 'draft') ||
    new Set(drafts.map((draft) => draft.window.session)).size !== drafts.length ||
    new Set(drafts.map((draft) => draft.id)).size !== drafts.length
  )
    throw new Error('Keep one distinct working draft per class session.');
  const result: ReportDraftStore = {
    version: 1,
    generation: Number(row.generation),
    selectedSession: Number(row.selectedSession),
    drafts,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1_200_000)
    throw new Error(
      'Device report drafts exceed their storage limit. Export them before clearing older work.',
    );
  return result;
}
export function readReportDraftStore(
  scope: string,
  storage: DraftStorage = localStorage,
): ReportDraftStore | undefined {
  const cached = memory.get(scope);
  if (storage === localStorage && cached?.token === getDeviceScopeToken(scope))
    return cached.state.value;
  const raw = storage.getItem(reportDraftStoreKey(scope));
  return raw === null ? undefined : validateReportDraftStore(JSON.parse(raw));
}
export function loadReportDraftStore(
  scope: string,
  generation: number,
  storage: DraftStorage = localStorage,
): ReportDraftState {
  const cached = memory.get(scope);
  if (
    storage === localStorage &&
    cached?.token === getDeviceScopeToken(scope) &&
    cached.state.value.generation === generation
  )
    return cached.state;
  const empty: ReportDraftStore = { version: 1, generation, selectedSession: 1, drafts: [] };
  try {
    const raw = storage.getItem(reportDraftStoreKey(scope));
    const value = raw === null ? empty : validateReportDraftStore(JSON.parse(raw));
    if (value.generation !== generation)
      throw new Error(
        'These drafts belong to retired account data. Keep a device recovery export and finish account recovery first.',
      );
    return { value, raw, error: '' };
  } catch (error) {
    return {
      value: empty,
      raw: null,
      error: `Report drafts could not be read. Existing stored work has not been changed. ${error instanceof Error ? error.message : ''}`,
    };
  }
}
export function saveReportDraftStore(
  scope: string,
  token: string,
  state: ReportDraftState,
  value: ReportDraftStore,
  storage: DraftStorage = localStorage,
): ReportDraftState {
  requireCurrentDeviceScope(scope, token);
  const checked = validateReportDraftStore(value);
  const next: ReportDraftState = { value: checked, raw: state.raw, error: '' };
  try {
    const current = storage.getItem(reportDraftStoreKey(scope));
    if (state.error.startsWith('Report drafts could not be read.'))
      throw new Error('Reopen after enabling storage before changing unreadable saved drafts.');
    if (current !== state.raw)
      throw new Error(
        'Another tab changed these report drafts. Download your current draft, then reopen the report to review the newer device copy.',
      );
    const raw = JSON.stringify(checked);
    storage.setItem(reportDraftStoreKey(scope), raw);
    if (storage.getItem(reportDraftStoreKey(scope)) !== raw)
      throw new Error('The browser did not retain the draft.');
    requireCurrentDeviceScope(scope, token);
    next.raw = raw;
  } catch (error) {
    next.error = `Draft retained in this page only. Retry device save or download it before closing. ${error instanceof Error ? error.message : ''}`;
  }
  if (storage === localStorage) memory.set(scope, { token, state: next });
  return next;
}
export function invalidateReportDraftMemory(scope: string): void {
  memory.delete(scope);
}
