import catalog from '../client/recording-catalog.json' with { type: 'json' };
import beginner from './curriculum/beginner-v4.8.json' with { type: 'json' };
import fundamental from './curriculum/fundamental-v2.0.json' with { type: 'json' };
import intermediate from './curriculum/intermediate-v2.3.json' with { type: 'json' };
import advanced from './curriculum/advanced-v2.1.json' with { type: 'json' };

export interface RecordingVariant {
  title: string;
  url: string;
  speedWpm: number;
  characterWpm: number;
  effectiveWpm: number;
  durationSeconds?: number;
}
export type RecordingSpeedPreference = 'assigned' | 'next';

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

const curriculumFileWpms = new Map<string, number>();
const ambiguousCurriculumFiles = new Set<string>();
for (const source of [beginner, fundamental, intermediate, advanced]) {
  for (const row of source.exercises as {
    kind: string;
    url?: string;
    characterWpm?: number;
    recordingLabelWpm?: number;
  }[]) {
    // An explicit recording label can differ from the session heading/filename.
    // It identifies the published file without claiming measured native timing.
    const fileWpm = row.recordingLabelWpm ?? row.characterWpm;
    if (
      row.kind !== 'audio' ||
      !row.url ||
      !Number.isFinite(fileWpm) ||
      fileWpm! <= 0 ||
      fileWpm! > 200
    )
      continue;
    const previous = curriculumFileWpms.get(row.url);
    if (previous !== undefined && previous !== fileWpm)
      ambiguousCurriculumFiles.add(row.url);
    curriculumFileWpms.set(row.url, fileWpm!);
  }
}

/** Exact published file labels for annotations, not guessed character/effective timing.
 * Some Fundamental and Advanced files are linked by the curriculum but have no
 * speed-variant group. Keep those exact URLs usable without inventing alternatives.
 */
export function officialRecordingIdentity(
  url: string | undefined,
): Pick<RecordingVariant, 'url' | 'speedWpm' | 'durationSeconds'> | undefined {
  if (!url || RECORDING_URL_REPLACEMENTS[url]) return;
  const variant = recordingVariants(url).find((item) => item.url === url);
  if (variant)
    return {
      url,
      speedWpm: variant.speedWpm,
      ...(variant.durationSeconds !== undefined
        ? { durationSeconds: variant.durationSeconds }
        : {}),
    };
  const speedWpm = curriculumFileWpms.get(url);
  if (speedWpm !== undefined && !ambiguousCurriculumFiles.has(url)) return { url, speedWpm };
}
