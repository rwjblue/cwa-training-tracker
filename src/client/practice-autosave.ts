import { validatePracticeSession, type PracticeSession } from '../shared/training';
import { api } from './api';

export const PRACTICE_SAVED_EVENT = 'cwa:practice-saved';
export const PRACTICE_UPLOADED_EVENT = 'cwa:practice-uploaded';
const prefix = (scope: string) => `cwa:practice:pending:v1:${encodeURIComponent(scope)}:`;
const key = (scope: string, id: string) => `${prefix(scope)}${encodeURIComponent(id)}`;
const changed = () => window.dispatchEvent(new Event(PRACTICE_SAVED_EVENT));

/** Guest history and signed-in uploads waiting for acknowledgement stay account scoped. */
export function loadLocalPractice(scope: string): PracticeSession[] {
  const entries: PracticeSession[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (!name?.startsWith(prefix(scope))) continue;
      try {
        entries.push(validatePracticeSession(JSON.parse(localStorage.getItem(name)!)));
      } catch {
        // A damaged record must not hide the other locally saved rounds.
      }
    }
  } catch {
    // Practice remains available when browser storage is disabled.
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function removeLocalPractice(scope: string, id: string) {
  try {
    localStorage.removeItem(key(scope, id));
    changed();
  } catch {
    // A retained acknowledged record is safe to retry with the same id.
  }
}

export interface PracticeSaveReceipt {
  entry: PracticeSession;
  destination: 'history' | 'device';
}
const uploads = new Map<string, Promise<PracticeSaveReceipt>>();
const UPLOAD_TIMEOUT_MS = 10_000;
const LOCAL_RECEIPT_DELAY_MS = 750;

/** Freeze before uploading: a lost response or navigation can retry the exact same entry. */
export async function autoSavePractice(
  scope: string,
  input: PracticeSession,
): Promise<PracticeSaveReceipt> {
  const entryKey = key(scope, input.id);
  const uploading = uploads.get(entryKey);
  if (uploading) return uploading;
  let entry = validatePracticeSession(input);
  let durable = false;
  try {
    const previous = localStorage.getItem(entryKey);
    if (previous) entry = validatePracticeSession(JSON.parse(previous));
    else localStorage.setItem(entryKey, JSON.stringify(entry));
    durable = true;
    changed();
  } catch {
    // Still try the server if local storage is unavailable.
  }
  if (scope === 'guest') {
    if (!durable)
      throw new Error(
        'This browser could not save your result. Download it before starting another round.',
      );
    return { entry, destination: 'device' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error('The upload timed out. Please try saving again.'));
  }, UPLOAD_TIMEOUT_MS);
  const upload = (async (): Promise<PracticeSaveReceipt> => {
    try {
      const response = await api<{ entry: PracticeSession }>(
        '/entries',
        entry,
        'POST',
        controller.signal,
      );
      const acknowledged = validatePracticeSession(response.entry);
      if (acknowledged.id !== entry.id)
        throw new Error('The server did not acknowledge this result.');
      removeLocalPractice(scope, entry.id);
      window.dispatchEvent(
        new CustomEvent(PRACTICE_UPLOADED_EVENT, { detail: { scope, entry: acknowledged } }),
      );
      return { entry: acknowledged, destination: 'history' };
    } catch (error) {
      if (!durable) throw error;
      return { entry, destination: 'device' };
    } finally {
      clearTimeout(timeout);
      uploads.delete(entryKey);
    }
  })();
  // Navigation need not wait for the network once its exact retry body is durable.
  // Keep the upload running; its acknowledgement event updates history later.
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;
  const receipt = durable
    ? Promise.race([
        upload,
        new Promise<PracticeSaveReceipt>((resolve) => {
          receiptTimer = setTimeout(
            () => resolve({ entry, destination: 'device' }),
            LOCAL_RECEIPT_DELAY_MS,
          );
        }),
      ]).finally(() => clearTimeout(receiptTimer))
    : upload;
  uploads.set(entryKey, receipt);
  return receipt;
}

export async function flushPracticeSaves(
  scope: string,
  onSaved: (entry: PracticeSession) => void,
  isCurrentAccount: () => boolean = () => true,
) {
  if (scope === 'guest') return;
  for (const entry of loadLocalPractice(scope)) {
    if (!isCurrentAccount()) return;
    const result = await autoSavePractice(scope, entry);
    if (result.destination !== 'history') break;
    if (isCurrentAccount()) onSaved(result.entry);
  }
}
