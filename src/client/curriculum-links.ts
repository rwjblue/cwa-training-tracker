import { curriculumForLevel, publicCurriculumExercises } from '../shared/curriculum';
import {
  officialRecordingCode,
  officialRecordingIdentity,
  RECORDING_URL_REPLACEMENTS,
  recordingVariants,
} from '../shared/recordings';
import { COURSE_LEVELS, type CourseLevel } from '../shared/training';
import catalog from './recording-catalog.json';
import type { PracticeLaunch } from './practice-launch';

type PublicLaunch = Omit<PracticeLaunch, 'id'>;
export interface PublicRecording {
  id: string;
  title: string;
  url: string;
  speedWpm?: number;
}

const levels = COURSE_LEVELS.map(({ id }) => id);
const recordings = new Map<string, PublicRecording>();
const ambiguousRecordingIds = new Set<string>();
const canonicalRecordingUrl = (url: string) => RECORDING_URL_REPLACEMENTS[url] ?? url;

function recordingId(url: string): string | undefined {
  try {
    const basename = new URL(url).pathname
      .split('/')
      .at(-1)
      ?.replace(/\.(?:mp3|wav)$/i, '');
    return basename && /^[a-z0-9][a-z0-9_-]*$/i.test(basename) ? basename.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

const urls = new Set(catalog.groups.flatMap((group) => group.variants.map(({ url }) => url)));
for (const level of levels) {
  for (const item of publicCurriculumExercises(level)) {
    if (item.exercise?.type === 'audio' && item.exercise.url) urls.add(item.exercise.url);
  }
}
for (const originalUrl of urls) {
  const url = canonicalRecordingUrl(originalUrl);
  const id = recordingId(url);
  if (!id) continue;
  const existing = recordings.get(id);
  if (existing && existing.url !== url) {
    ambiguousRecordingIds.add(id);
    continue;
  }
  recordings.set(id, {
    id,
    title: officialRecordingCode(url) ?? id.toUpperCase(),
    url,
    speedWpm: officialRecordingIdentity(url)?.speedWpm,
  });
}

/** Resolve only a published, unambiguous filename; never build an arbitrary source URL. */
export function publicRecordingFromId(id: string): PublicRecording | undefined {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return undefined;
  const canonical = id.toLowerCase();
  return ambiguousRecordingIds.has(canonical) ? undefined : recordings.get(canonical);
}

export function publicRecordingHash(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const canonical = canonicalRecordingUrl(url);
  const id = recordingId(canonical);
  const recording = id ? publicRecordingFromId(id) : undefined;
  return recording?.url === canonical ? `#practice/recording/${recording.id}` : undefined;
}

export function publicLessonHash(level: CourseLevel, exerciseId: string): string | undefined {
  return publicCurriculumExercises(level).some(({ id }) => id === exerciseId)
    ? `#practice/lesson/${level}/${exerciseId}`
    : undefined;
}

/** Publish the curriculum identity and public resource, without private assignment metadata. */
export function publicPracticeHash(options: PublicLaunch): string | undefined {
  if (options.material) return undefined;
  const curriculum = options.task?.curriculum;
  if (curriculum) {
    const level = levels.find((level) => curriculumForLevel(level)?.id === curriculum.id);
    const hash = level ? publicLessonHash(level, curriculum.exerciseId) : undefined;
    if (hash) return hash;
  }
  return options.activity?.type === 'audio' ? publicRecordingHash(options.activity.url) : undefined;
}

/** A recipient starts public practice, never the sender's task, context, dates, or progress. */
export function publicLaunchFromHash(hash: string): PublicLaunch | undefined {
  const [path, search = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(search);
  if (params.getAll('recording').length > 1) return undefined;
  const recordingMatch = /^practice\/recording\/([a-z0-9][a-z0-9_-]*)$/i.exec(path);
  if (recordingMatch) {
    if (params.has('recording')) return undefined;
    const recording = publicRecordingFromId(recordingMatch[1]);
    if (!recording) return undefined;
    return {
      publicTitle: recording.title,
      publicRoute: `#practice/recording/${recording.id}`,
      activity: {
        type: 'audio',
        url: recording.url,
        ...(recording.speedWpm ? { characterWpm: recording.speedWpm } : {}),
      },
    };
  }
  const lessonMatch = /^practice\/lesson\/([a-z]+)\/([a-z0-9][a-z0-9-]*)$/.exec(path);
  const level = lessonMatch && levels.find((level) => level === lessonMatch[1]);
  if (!lessonMatch || !level) return undefined;
  const item = publicCurriculumExercises(level).find(({ id }) => id === lessonMatch[2]);
  if (!item?.exercise) return undefined;
  const activity = structuredClone(item.exercise);
  let publicRecordingUrl: string | undefined;
  const overrideId = params.get('recording');
  if (overrideId !== null) {
    if (activity.type !== 'audio' || !activity.url) return undefined;
    const recording = publicRecordingFromId(overrideId);
    const variants = recordingVariants(activity.url);
    const variant = variants.find(({ url }) => url === recording?.url);
    if (
      !variant ||
      (activity.characterWpm !== undefined && variant.speedWpm < activity.characterWpm)
    )
      return undefined;
    publicRecordingUrl = variant.url;
  }
  const publicParams = new URLSearchParams();
  const publicKeys =
    activity.type === 'audio'
      ? ['recording']
      : activity.type === 'copy'
        ? ['recipe']
        : activity.type === 'morse-runner'
          ? ['mode', 'wpm', 'seconds', 'activity', 'conditions']
          : activity.type === 'sending'
            ? ['section']
            : [];
  for (const key of publicKeys) {
    const value = params.get(key);
    if (value !== null) publicParams.set(key, value);
  }
  return {
    publicTitle: `Session ${item.session} · ${item.title}`,
    publicSourceUrl: item.sourceUrl,
    publicRoute: `#${path}${publicParams.size ? `?${publicParams}` : ''}`,
    ...(publicRecordingUrl ? { publicRecordingUrl } : {}),
    activity,
  };
}
