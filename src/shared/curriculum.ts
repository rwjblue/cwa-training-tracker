import intermediate from './curriculum/intermediate-v2.3.json';
import { addDays, courseMeetings, type Profile } from './training';
import { type PlannedTask, type PracticeExercise, type SendingSection } from './plan';

interface CatalogExercise {
  id: string;
  session: number;
  day: number;
  kind: string;
  recording?: string;
  url?: string;
  sections?: string[];
  characterWpm?: number;
  minimumPasses?: number;
  maximumPasses?: number;
  minutes?: number;
  count?: number;
  mode?: string;
  optional?: boolean;
  unresolved?: string;
}

export const INTERMEDIATE_CURRICULUM = {
  id: intermediate.id,
  title: 'CW Academy Intermediate',
  version: intermediate.version,
  sourceUrl: intermediate.sourceUrl,
  resourcesUrl: intermediate.resourcesUrl,
  verifiedAt: intermediate.verifiedAt,
  sessions: 16,
  practiceDays: 48,
  exerciseCount: intermediate.exercises.filter((task) => !task.optional).length,
} as const;

const SCALES_URL = 'https://cwops.org/wp-content/uploads/2024/08/Everyday-Send-Code-Web.htm';
const RUNNER_URL = 'https://fritzsche.github.io/WebMorseRunner/';
const ICR_URL = 'https://lcwo.net/';
const CWT_URL = 'https://cwops.org/cwops-tests/';

/** Original UI labels and concise directions; the official documents stay at CWops. */
function practiceDetails(
  row: CatalogExercise,
): Pick<PlannedTask, 'title' | 'kind' | 'notes' | 'exercise'> {
  if (row.kind === 'audio') {
    const exercise: Extract<PracticeExercise, { type: 'audio' }> = { type: 'audio' };
    if (row.url) exercise.url = row.url;
    if (row.characterWpm) exercise.characterWpm = row.characterWpm;
    if (row.minimumPasses) exercise.minimumPasses = row.minimumPasses;
    if (row.maximumPasses) exercise.maximumPasses = row.maximumPasses;
    if (row.unresolved)
      exercise.unresolved = `${row.recording} is currently unavailable from the official source. Ask your advisor for an alternative.`;
    const repetitions = row.minimumPasses
      ? row.maximumPasses === row.minimumPasses
        ? `${row.minimumPasses} full play${row.minimumPasses === 1 ? '' : 's'}`
        : row.maximumPasses
          ? `${row.minimumPasses}–${row.maximumPasses} full plays`
          : `at least ${row.minimumPasses} full plays`
      : 'repeat as needed';
    return {
      title: row.recording!,
      kind: 'listening',
      notes: `${row.characterWpm} WPM · ${repetitions}. Listen to the official recording and use the linked curriculum for the exercise objective.`,
      exercise,
    };
  }
  if (row.kind === 'sending') {
    const sections = row.sections as SendingSection[];
    return {
      title: `Sending scales: ${sections.join(' + ')}`,
      kind: 'sending',
      notes:
        'Open the sending scales and practice the listed sections on your key. Time your practice here.',
      exercise: { type: 'sending', url: SCALES_URL, sections },
    };
  }
  if (row.kind === 'icr')
    return {
      title: 'Character recognition',
      kind: 'icr',
      notes: `Start at ${row.characterWpm} WPM. Use your advisor’s character-recognition settings and the linked curriculum.`,
      exercise: { type: 'external', url: ICR_URL, characterWpm: row.characterWpm },
    };
  if (row.kind === 'simulator')
    return {
      title: row.mode === 'wpx' ? 'Morse Runner: WPX' : 'Morse Runner: single calls',
      kind: 'simulator',
      notes: `${row.minutes} minutes at ${row.characterWpm} WPM in ${row.mode === 'wpx' ? 'WPX mode, activity 2' : 'single-call mode'}. Check the official curriculum for the remaining settings.`,
      exercise: { type: 'external', url: RUNNER_URL, characterWpm: row.characterWpm },
    };
  return {
    title: row.mode === 'contacts' ? 'CWT: contacts or exchange copy' : 'CWT: listen to exchanges',
    kind: 'on-air',
    notes: `Aim for ${row.count} ${row.mode === 'contacts' ? 'contacts, or copy exchanges' : 'copied station exchanges'}. Check the event schedule and your advisor’s directions.`,
    exercise: { type: 'external', url: CWT_URL },
  };
}

/** Dates may move; a session/day/exercise identity and its saved progress do not. */
export function curriculumPlan(profile: Profile): PlannedTask[] {
  if (profile.level !== 'intermediate' || !profile.firstClassDate) return [];
  const meetings = courseMeetings(profile);
  return (intermediate.exercises as CatalogExercise[])
    .filter((row) => !row.optional)
    .map((row) => {
      const details = practiceDetails(row);
      const sourceUrl =
        intermediate.sessionLinks[String(row.session) as keyof typeof intermediate.sessionLinks];
      return {
        id: `curriculum:${intermediate.id}:${row.id}`,
        ...details,
        lesson: row.session,
        dueDate: addDays(meetings[row.session - 1].date, row.day - 3),
        targetMinutes: row.minutes ?? 15,
        done: false,
        createdAt: `${intermediate.verifiedAt}T00:00:00.000Z`,
        source: 'curriculum',
        curriculum: {
          id: intermediate.id,
          exerciseId: row.id,
          day: row.day as 1 | 2 | 3,
          sourceUrl,
        },
        link: details.exercise?.url ?? sourceUrl,
      };
    });
}

/** Saved rows are progress/overrides; the shared catalog is never copied into every account. */
export function mergeCurriculumPlan(
  profile: Profile,
  stored: readonly PlannedTask[],
): PlannedTask[] {
  const generated = curriculumPlan(profile);
  const byId = new Map(stored.map((task) => [task.id, task]));
  const consumed = new Set<string>();
  const result = generated.map((task) => {
    const override = byId.get(task.id);
    const legacyId = `legacy-task:${task.curriculum!.exerciseId}`;
    const imported = byId.get(legacyId);
    const legacy = imported?.source === 'legacy' ? imported : undefined;
    if (override) consumed.add(override.id);
    if (legacy) consumed.add(legacy.id);
    const saved = override ?? legacy;
    if (!saved) return task;
    return {
      ...task,
      ...saved,
      id: legacy?.id ?? task.id,
      source: legacy ? ('legacy' as const) : ('curriculum' as const),
      dueDate: task.dueDate,
      lesson: task.lesson,
      curriculum: task.curriculum,
      exercise: task.exercise,
      kind: task.kind,
      link: task.link,
    };
  });
  // Inactive generated rows stay in the private backup and return if the course is reselected.
  return [
    ...result,
    ...stored.filter(
      (task) =>
        !consumed.has(task.id) &&
        task.source !== 'curriculum' &&
        !task.id.startsWith('curriculum:'),
    ),
  ];
}
