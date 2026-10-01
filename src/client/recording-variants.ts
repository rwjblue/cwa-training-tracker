import {
  recordingVariants,
  RECORDING_URL_REPLACEMENTS,
  type RecordingVariant,
  type RecordingSpeedPreference,
} from '../shared/recordings';
export {
  recordingVariants,
  recordingSpeeds,
  RECORDING_URL_REPLACEMENTS,
  RECORDING_CATALOG_SOURCE,
  type RecordingVariant,
  type RecordingSpeedPreference,
} from '../shared/recordings';
export const RECORDING_SPEED_STORAGE_KEY = 'cw-academy.recording-speed.v1';
const currentUrl = (url: string) => RECORDING_URL_REPLACEMENTS[url] ?? url;

export function eligibleRecordingVariants(
  assignedUrl: string | undefined,
  assignedWpm: number | undefined,
): RecordingVariant[] {
  if (!Number.isFinite(assignedWpm) || assignedWpm! <= 0) return [];
  return recordingVariants(assignedUrl).filter((variant) => variant.speedWpm >= assignedWpm!);
}

/** Keep the assigned source unless a verified, permitted choice is available. */
export function selectRecordingVariant(
  assignedUrl: string | undefined,
  assignedWpm: number | undefined,
  preference: RecordingSpeedPreference = 'assigned',
  overrideWpm?: number,
): RecordingVariant | undefined {
  if (!assignedUrl) return undefined;
  const variants = recordingVariants(assignedUrl);
  const assigned = variants.find((variant) => variant.url === currentUrl(assignedUrl));
  const eligible = eligibleRecordingVariants(assignedUrl, assignedWpm);
  const selected =
    overrideWpm !== undefined
      ? eligible.find((variant) => variant.speedWpm === overrideWpm)
      : preference === 'next'
        ? eligible.find((variant) => variant.speedWpm > assignedWpm!)
        : assigned;
  return selected ?? assigned;
}

export function loadRecordingSpeedPreference(
  storage?: Pick<Storage, 'getItem'>,
): RecordingSpeedPreference {
  try {
    const saved = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return saved?.getItem(RECORDING_SPEED_STORAGE_KEY) === 'next' ? 'next' : 'assigned';
  } catch {
    return 'assigned';
  }
}

export function saveRecordingSpeedPreference(
  preference: RecordingSpeedPreference,
  storage?: Pick<Storage, 'setItem' | 'getItem'>,
): boolean {
  try {
    const saved = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!saved) return false;
    const value = preference === 'next' ? 'next' : 'assigned';
    saved.setItem(RECORDING_SPEED_STORAGE_KEY, value);
    return saved.getItem(RECORDING_SPEED_STORAGE_KEY) === value;
  } catch {
    return false;
  }
}

/** Initialize a newly opened exercise, retaining its separate prescribed speed. */
export function preferredRecording(
  assignedUrl: string | undefined,
  assignedWpm: number | undefined,
): RecordingVariant | undefined {
  return selectRecordingVariant(assignedUrl, assignedWpm, loadRecordingSpeedPreference());
}
