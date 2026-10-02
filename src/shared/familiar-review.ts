import { curriculumForLevel } from './curriculum';
import { nativeCopyTask, taskDueDate, type PlannedTask } from './plan';
import { recordingVariants, RECORDING_URL_REPLACEMENTS } from './recordings';
import { sessionEvidence } from './practice-evidence';
import {
  courseMeetings,
  dateInTimezone,
  getPracticePurpose,
  type PracticeSession,
  type Profile,
} from './training';

export interface FamiliarReview {
  task: PlannedTask;
  introducedOn: string;
  reason: string;
}

/** Only verified groups identify alternate representations; private URLs stay exact. */
function recordingKey(url: string) {
  const variants = recordingVariants(url);
  return `audio:${
    variants.length
      ? variants
          .map((variant) => variant.url)
          .sort()
          .join('|')
      : (RECORDING_URL_REPLACEMENTS[url] ?? url)
  }`;
}
function resourceKey(task: PlannedTask) {
  const exercise = task.exercise;
  if (exercise?.type === 'audio' && exercise.url) return recordingKey(exercise.url);
  if (exercise?.type === 'morse-runner') return 'current-runner';
  if (task.kind === 'icr') return 'current-icr';
  if (exercise?.type === 'sending') return `sending:${exercise.url}:${exercise.sections.join(',')}`;
  return `task:${task.id}`;
}

/** Optional introduced material only; never a launch, credit or completion decision. */
export function familiarReviewSuggestions(
  tasks: readonly PlannedTask[],
  entries: readonly PracticeSession[],
  profile: Profile,
  now: number,
): FamiliarReview[] {
  if (!Number.isFinite(now)) throw new Error('Choose a valid planning clock.');
  const today = dateInTimezone(new Date(now), profile.timezone);
  const meetings = courseMeetings(profile);
  const curriculumId = curriculumForLevel(profile.level)?.id;
  const seenIds = new Set<string>();
  const introduced = tasks
    .flatMap((original) => {
      if (seenIds.has(original.id)) return [];
      seenIds.add(original.id);
      if (original.curriculum && original.curriculum.id !== curriculumId) return [];
      const date = taskDueDate(original, meetings);
      const task = nativeCopyTask(original);
      if (!date || date > today || task.kind === 'on-air' || task.exercise?.type === 'live-event')
        return [];
      if (task.exercise?.type === 'audio' && (!task.exercise.url || task.exercise.unresolved))
        return [];
      return [{ task, introducedOn: date }];
    })
    .sort(
      (a, b) => b.introducedOn.localeCompare(a.introducedOn) || a.task.id.localeCompare(b.task.id),
    );

  // Current computer recipes retain their latest reached source, even on a rest day.
  const runner = introduced.find(({ task }) => task.exercise?.type === 'morse-runner');
  const icr = introduced.find(({ task }) => task.kind === 'icr');
  const ordinary = introduced.filter(
    ({ task }) => task.exercise?.type !== 'morse-runner' && task.kind !== 'icr',
  );
  const recentDates = new Set([...new Set(ordinary.map((item) => item.introducedOn))].slice(0, 3));
  const pool = [
    ...ordinary.filter((item) => recentDates.has(item.introducedOn)),
    ...(runner ? [runner] : []),
    ...(icr ? [icr] : []),
  ];
  const seenResources = new Set<string>();
  const unique = pool.filter(({ task }) => {
    const key = resourceKey(task);
    if (seenResources.has(key)) return false;
    seenResources.add(key);
    return true;
  });
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (!task.curriculum) continue;
    const canonical = `curriculum:${task.curriculum.id}:${task.curriculum.exerciseId}`;
    if (!byId.has(canonical)) byId.set(canonical, task);
    const legacy = `legacy-task:${task.curriculum.exerciseId}`;
    if (task.curriculum.id.startsWith('cwa-intermediate-') && !byId.has(legacy))
      byId.set(legacy, task);
  }
  const lastUsed = new Map<string, string>();
  const reviewedToday = new Set<string>();
  const seenEntries = new Set<string>();
  for (const entry of entries) {
    if (seenEntries.has(entry.id)) continue;
    seenEntries.add(entry.id);
    if (
      entry.context === 'class' ||
      entry.minutes <= 0 ||
      entry.date > today ||
      !Number.isFinite(entry.minutes)
    )
      continue;
    const timestamp = Date.parse(entry.createdAt);
    if (!Number.isFinite(timestamp) || timestamp > now) continue;
    const id = entry.metadata?.plannedTaskId;
    const original = entry.metadata?.legacyAttempt;
    const legacyId =
      original &&
      typeof original === 'object' &&
      !Array.isArray(original) &&
      typeof (original as Record<string, unknown>).taskId === 'string'
        ? `legacy-task:${(original as Record<string, unknown>).taskId}`
        : undefined;
    const source = entry.historicalPlannedTaskId
      ? undefined
      : byId.get(typeof id === 'string' ? id : (legacyId ?? ''));
    const evidence = sessionEvidence(entry.metadata);
    // Actual heard sources govern native listening; selected, unplayed audio cannot rotate it.
    const keys =
      evidence?.type === 'timed'
        ? [
            ...evidence.recordings
              .filter((recording) => recording.seconds > 0)
              .map((recording) => recordingKey(recording.url)),
            ...(source && source.exercise?.type !== 'audio' ? [resourceKey(source)] : []),
          ]
        : source
          ? [resourceKey(source)]
          : [];
    for (const key of keys) {
      const used = `${entry.date}:${new Date(timestamp).toISOString()}`;
      if (used > (lastUsed.get(key) ?? '')) lastUsed.set(key, used);
      if (entry.date === today && getPracticePurpose(entry) === 'review') reviewedToday.add(key);
    }
  }
  const rotated = unique.sort((a, b) => {
    const aKey = resourceKey(a.task),
      bKey = resourceKey(b.task);
    return (
      Number(reviewedToday.has(aKey)) - Number(reviewedToday.has(bKey)) ||
      (lastUsed.get(aKey) ?? '').localeCompare(lastUsed.get(bKey) ?? '') ||
      b.introducedOn.localeCompare(a.introducedOn) ||
      a.task.id.localeCompare(b.task.id)
    );
  });
  // Current computer recipes stay discoverable without cycling through recordings.
  const recipeIds = new Set(
    unique
      .filter(({ task }) => task.exercise?.type === 'morse-runner' || task.kind === 'icr')
      .map(({ task }) => task.id),
  );
  const ordinaryIds = new Set(
    rotated
      .filter(({ task }) => !recipeIds.has(task.id))
      .slice(0, 3 - recipeIds.size)
      .map(({ task }) => task.id),
  );
  return rotated
    .filter(({ task }) => recipeIds.has(task.id) || ordinaryIds.has(task.id))
    .map((item) => ({
      ...item,
      reason: `${item.task.lesson ? `Session ${item.task.lesson}${item.task.curriculum ? `, Day ${item.task.curriculum.day}` : ''} · ` : ''}Introduced ${item.introducedOn}. ${item.task.exercise?.type === 'morse-runner' || item.task.kind === 'icr' ? 'Latest reached course recipe.' : 'From the three most recent dates with familiar material.'}`,
    }));
}
