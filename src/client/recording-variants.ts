import catalog from './recording-catalog.json';

export interface RecordingVariant {
  title: string;
  url: string;
  speedWpm: number;
  characterWpm: number;
  effectiveWpm: number;
  durationSeconds?: number;
}
export type RecordingSpeedPreference = 'assigned' | 'next';
export const RECORDING_SPEED_STORAGE_KEY = 'cw-academy.recording-speed.v1';

/**
 * Public link metadata only; no recordings or curriculum text are distributed.
 * The personal site's 2026-09-24 catalog supplied exact groups and durations.
 * Every retained URL was rechecked against the current official index; newly
 * published QSO207 files were HEAD-checked and measured with ffprobe. Existing
 * exact-URL durations retain their original verification date in the catalog.
 * Long/short QSO groups deliberately stay separate, despite similar filenames.
 */
export const RECORDING_CATALOG_SOURCE = {
  url: catalog.sourceUrl,
  indexCheckedAt: catalog.indexCheckedAt,
  inheritedDurationsCheckedAt: catalog.inheritedDurationsCheckedAt,
};

/** Explicit verified replacements, never a filename-derived URL or speed guess. */
export const RECORDING_URL_REPLACEMENTS: Readonly<Record<string, string>> = {
  'https://cwops.org/wp-content/uploads/2022/07/qso207_10.mp3':
    'https://cwops.org/wp-content/uploads/2026/09/qso207_10.mp3',
  'https://cwops.org/wp-content/uploads/2022/07/qso207_13.mp3':
    'https://cwops.org/wp-content/uploads/2026/09/qso207_13.mp3',
  'https://cwops.org/wp-content/uploads/2022/07/qso207_15.mp3':
    'https://cwops.org/wp-content/uploads/2026/09/qso207_15.mp3',
  'https://cwops.org/wp-content/uploads/2022/07/qso207_18.mp3':
    'https://cwops.org/wp-content/uploads/2026/09/qso207_18.mp3',
  'https://cwops.org/wp-content/uploads/2022/07/qso207_20.mp3':
    'https://cwops.org/wp-content/uploads/2026/09/qso207_20.mp3',
  'https://cwops.org/wp-content/uploads/2022/07/qso207_25.mp3':
    'https://cwops.org/wp-content/uploads/2026/09/qso207_25.mp3',
};

const groupsByUrl = new Map<string, readonly RecordingVariant[]>();
for (const group of catalog.groups) {
  // Published WPM labels describe effective speed. The practice families use
  // 25 WPM character timing; CWT recordings use normal spacing at their label.
  // See docs/recording-speeds.md for official links and timing measurements.
  const variants = group.variants.map((variant) => ({
    ...variant,
    characterWpm: group.id.startsWith('cwt-') ? variant.speedWpm : 25,
    effectiveWpm: variant.speedWpm,
  }));
  for (const variant of variants) groupsByUrl.set(variant.url, variants);
}
const currentUrl = (url: string) => RECORDING_URL_REPLACEMENTS[url] ?? url;

/** Only exact published URLs and the explicit superseded URLs above identify a group. */
export function recordingVariants(assignedUrl: string | undefined): RecordingVariant[] {
  return (assignedUrl ? (groupsByUrl.get(currentUrl(assignedUrl)) ?? []) : []).map((item) => ({
    ...item,
  }));
}

/** Timing metadata is available only for exact catalog URLs and verified replacements. */
export function recordingSpeeds(
  url: string | undefined,
): Pick<RecordingVariant, 'characterWpm' | 'effectiveWpm'> | undefined {
  if (!url) return undefined;
  const variant = groupsByUrl.get(currentUrl(url))?.find((item) => item.url === currentUrl(url));
  return variant
    ? { characterWpm: variant.characterWpm, effectiveWpm: variant.effectiveWpm }
    : undefined;
}

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
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const saved = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!saved) return false;
    saved.setItem(RECORDING_SPEED_STORAGE_KEY, preference === 'next' ? 'next' : 'assigned');
    return true;
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
