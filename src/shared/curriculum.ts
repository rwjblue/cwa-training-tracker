import intermediate from './curriculum/intermediate-v2.3.json';
import fundamental from './curriculum/fundamental-v2.0.json';
import beginner from './curriculum/beginner-v4.8.json';
import advanced from './curriculum/advanced-v2.1.json';
import { addDays, courseMeetings, type PracticeKind, type Profile } from './training';
import {
  nativeCopyTask,
  type PlannedTask,
  type PracticeExercise,
  type SendingSection,
} from './plan';
import { defaultCopyRecipe, validateCopyRecipe, type CopyRecipe } from './copy-practice';

interface CatalogExercise {
  id: string;
  session: number;
  day: number;
  kind: string;
  recording?: string;
  url?: string;
  sections?: string[];
  characterWpm?: number;
  effectiveWpm?: number;
  minimumPasses?: number;
  maximumPasses?: number;
  minutes?: number;
  count?: number;
  mode?: string;
  optional?: boolean;
  unresolved?: string;
  sourceUrl?: string;
  title?: string;
  notes?: string;
  practiceKind?: PracticeKind;
  recipe?: Partial<CopyRecipe>;
  alternatives?: Partial<CopyRecipe>[];
  repetitions?: number;
  targetAccuracy?: number;
  maximumAttempts?: number;
  requiresCharacterSelection?: boolean;
}

interface Catalog {
  id: string;
  version: string;
  sourceUrl: string;
  resourcesUrl: string;
  verifiedAt: string;
  sessionLinks?: Record<string, string>;
  exercises: CatalogExercise[];
}

const catalogs: Partial<Record<Profile['level'], Catalog>> = {
  intermediate: intermediate as Catalog,
  fundamental: fundamental as Catalog,
  beginner: beginner as Catalog,
  advanced: advanced as Catalog,
};

/** Published catalogs only; prototype curricula require a separate opted-in identity. */
export function curriculumForLevel(level: Profile['level']) {
  const catalog = catalogs[level];
  if (!catalog) return undefined;
  return {
    id: catalog.id,
    title: `CW Academy ${level[0].toUpperCase()}${level.slice(1)}`,
    version: catalog.version,
    sourceUrl: catalog.sourceUrl,
    resourcesUrl: catalog.resourcesUrl,
    verifiedAt: catalog.verifiedAt,
    sessions: 16,
    practiceDays: new Set(
      catalog.exercises.filter((row) => !row.optional).map((row) => `${row.session}-${row.day}`),
    ).size,
    exerciseCount: catalog.exercises.filter((row) => !row.optional).length,
  };
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
const CWT_URL = 'https://cwops.org/cwops-tests/';

/** Original UI labels and concise directions; the official documents stay at CWops. */
function practiceDetails(
  row: CatalogExercise,
  sourceUrl: string,
): Pick<PlannedTask, 'title' | 'kind' | 'notes' | 'exercise'> {
  if (row.kind === 'copy' || row.kind === 'icr') {
    const recipe =
      row.kind === 'icr'
        ? {
            ...defaultCopyRecipe('groups'),
            characterWpm: row.characterWpm ?? 25,
            effectiveWpm: row.effectiveWpm!,
            groupLength: 3,
            durationSeconds: 60,
            startDelaySeconds: 2,
          }
        : validateCopyRecipe(row.recipe);
    const alternatives =
      row.kind === 'icr'
        ? [
            { ...recipe, groupKind: 'figures' as const },
            { ...recipe, groupKind: 'custom' as const, groupLength: 2 },
            {
              ...defaultCopyRecipe('words'),
              characterWpm: recipe.characterWpm,
              effectiveWpm: recipe.effectiveWpm,
              maxWordLength: 3,
              adaptive: false,
            },
          ]
        : row.alternatives?.map(validateCopyRecipe);
    const exercise: Extract<PracticeExercise, { type: 'copy' }> = {
      type: 'copy',
      url: sourceUrl,
      recipe,
      ...(alternatives?.length ? { alternatives } : {}),
      ...(row.repetitions ? { repetitions: row.repetitions } : {}),
      ...(row.targetAccuracy !== undefined ? { targetAccuracy: row.targetAccuracy } : {}),
      ...(row.maximumAttempts ? { maximumAttempts: row.maximumAttempts } : {}),
      ...(row.requiresCharacterSelection ? { requiresCharacterSelection: true } : {}),
    };
    const repetition = row.repetitions
      ? ` ${row.repetitions} round${row.repetitions === 1 ? '' : 's'}.`
      : '';
    const progression =
      row.targetAccuracy !== undefined
        ? ` Aim for ${row.targetAccuracy}% accuracy${row.maximumAttempts ? ` within ${row.maximumAttempts} attempts` : ''}.`
        : row.maximumAttempts
          ? ` Try up to ${row.maximumAttempts} attempts.`
          : '';
    const guidance =
      row.kind === 'icr'
        ? 'For groups, repeat one-minute rounds at least five times and use about 90% accuracy to guide progression. For words, the progression target is fewer than three errors in a round. Choose groups or words and follow your advisor’s progression.'
        : '';
    return {
      title: row.title ?? 'Character recognition: groups and words',
      kind: 'icr',
      notes: `${recipe.characterWpm} character / ${recipe.effectiveWpm} effective WPM.${repetition}${progression} ${row.notes ?? (guidance || 'Results and practice time stay here.')}`,
      exercise,
    };
  }
  if (row.kind === 'manual')
    return {
      title: row.title!,
      kind: row.practiceKind ?? 'other',
      notes: row.notes ?? 'Use the linked official curriculum and record this practice here.',
      exercise: { type: 'external', url: row.url ?? sourceUrl },
    };
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
      title: row.title ?? row.recording!,
      kind: row.practiceKind ?? 'listening',
      notes: `${row.characterWpm ? `${row.characterWpm} WPM · ` : ''}${repetitions}. ${row.notes ?? 'Listen to the official recording and use the linked curriculum for the exercise objective.'}`,
      exercise,
    };
  }
  if (row.kind === 'sending') {
    const sections = row.sections as SendingSection[];
    return {
      title: row.title ?? `Sending scales: ${sections.join(' + ')}`,
      kind: 'sending',
      notes:
        'Open the sending scales and practice the listed sections on your key. Time your practice here.',
      exercise: { type: 'sending', url: SCALES_URL, sections },
    };
  }
  if (row.kind === 'simulator')
    return {
      title: row.mode === 'wpx' ? 'Morse Runner: WPX' : 'Morse Runner: single calls',
      kind: 'simulator',
      notes: `${row.minutes} minutes at ${row.characterWpm} WPM in ${row.mode === 'wpx' ? 'WPX mode, activity 2' : 'single-call mode'}. Check the official curriculum for the remaining settings.`,
      exercise: {
        type: 'morse-runner',
        url: RUNNER_URL,
        settings: {
          mode: row.mode === 'wpx' ? 'WPX' : 'SingleCall',
          wpm: row.characterWpm!,
          durationSeconds: row.minutes! * 60,
          activity: 2,
          conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
        },
      },
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
  const catalog = catalogs[profile.level];
  if (!catalog || !profile.firstClassDate) return [];
  const meetings = courseMeetings(profile);
  return catalog.exercises
    .filter((row) => !row.optional)
    .map((row) => {
      const sourceUrl =
        row.sourceUrl ?? catalog.sessionLinks?.[String(row.session)] ?? catalog.sourceUrl;
      const details = practiceDetails(row, sourceUrl);
      return {
        id: `curriculum:${catalog.id}:${row.id}`,
        ...details,
        lesson: row.session,
        dueDate: addDays(meetings[row.session - 1].date, row.day - 3),
        targetMinutes: row.minutes ?? 15,
        done: false,
        createdAt: `${catalog.verifiedAt}T00:00:00.000Z`,
        source: 'curriculum',
        curriculum: {
          id: catalog.id,
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
    const legacy =
      imported?.source === 'legacy' &&
      (imported.curriculum?.id === task.curriculum!.id ||
        (!imported.curriculum && task.curriculum!.id === INTERMEDIATE_CURRICULUM.id))
        ? imported
        : undefined;
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
    ...stored
      .filter(
        (task) =>
          !consumed.has(task.id) &&
          task.source !== 'curriculum' &&
          !task.id.startsWith('curriculum:'),
      )
      .map(nativeCopyTask),
  ];
}
