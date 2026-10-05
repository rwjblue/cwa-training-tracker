import { validateCopyRecipe, type CopyRecipe } from '../shared/copy-practice';
import { isRunnerSettings, type RunnerSettings } from '../shared/runner';
import type { SendingSection } from '../shared/plan';
import type { CopyDraft } from './copy-storage';
import { publicLaunchFromHash } from './curriculum-links';

function parameters(route: string | undefined, tool: string): URLSearchParams | undefined {
  if (!route || route.length > 8192) return;
  const [path, query] = route.split('?');
  if (!query) return;
  if (path !== `#practice/${tool}`) {
    const lesson = path.startsWith('#practice/lesson/') ? publicLaunchFromHash(path) : undefined;
    const expectedActivity = tool === 'runner' ? 'morse-runner' : tool;
    if (lesson?.activity?.type !== expectedActivity) return;
  }
  return new URLSearchParams(query);
}

/** The validator returns only public recipe fields, even if an input has private extras. */
export function copyRecipeRoute(recipe: CopyRecipe): string | undefined {
  try {
    const checked = validateCopyRecipe({ ...recipe, toneMode: recipe.toneMode ?? 'fixed' });
    return `#practice/copy?${new URLSearchParams({ recipe: JSON.stringify(checked) })}`;
  } catch {
    // Number controls can briefly contain an invalid value while being edited.
    return;
  }
}

export function copyRecipeFromRoute(route: string | undefined): CopyRecipe | undefined {
  const raw = parameters(route, 'copy')?.get('recipe');
  if (!raw) return;
  try {
    return validateCopyRecipe(JSON.parse(raw));
  } catch {
    return;
  }
}

/** A shared setup may resume only the same unassigned public recipe on this device. */
export function copyDraftMatchesSharedRecipe(
  draft:
    | (Pick<CopyDraft, 'attempt' | 'task' | 'purpose'> & {
        pending?: Pick<NonNullable<CopyDraft['pending']>, 'metadata'>;
      })
    | undefined,
  recipe: CopyRecipe,
): boolean {
  if (!draft || draft.task || draft.purpose || draft.pending?.metadata?.plannedTaskId) return false;
  const shared = copyRecipeRoute(recipe);
  return shared !== undefined && copyRecipeRoute(draft.attempt.recipe) === shared;
}

const conditionKeys = ['qrm', 'qrn', 'qsb', 'flutter', 'lids'] as const;

export function runnerSettingsRoute(settings: RunnerSettings): string | undefined {
  if (!isRunnerSettings(settings)) return;
  return `#practice/runner?${new URLSearchParams({
    mode: settings.mode,
    wpm: String(settings.wpm),
    seconds: String(settings.durationSeconds),
    activity: String(settings.activity),
    conditions: conditionKeys.filter((key) => settings.conditions[key]).join(','),
  })}`;
}

export function runnerSettingsFromRoute(route: string | undefined): RunnerSettings | undefined {
  const params = parameters(route, 'runner');
  if (!params) return;
  const conditions = params.get('conditions')?.split(',').filter(Boolean) ?? [];
  if (
    conditions.some(
      (condition) => !conditionKeys.includes(condition as (typeof conditionKeys)[number]),
    )
  )
    return;
  const settings = {
    mode: params.get('mode'),
    wpm: Number(params.get('wpm')),
    durationSeconds: Number(params.get('seconds')),
    activity: Number(params.get('activity')),
    conditions: Object.fromEntries(conditionKeys.map((key) => [key, conditions.includes(key)])),
  };
  return isRunnerSettings(settings) ? settings : undefined;
}

/** Read only the supported public controls, never station identity or contact input. */
export function runnerFrameSettings(doc: Document): RunnerSettings | undefined {
  const value = (id: string) =>
    (doc.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value;
  const mode = value('mode');
  const settings = {
    mode: mode === 'single' ? 'SingleCall' : mode === 'wpx' ? 'WPX' : undefined,
    wpm: Number(value('wpm')),
    durationSeconds: Number(value('time')) * 60,
    activity: Number(value('activity')),
    conditions: Object.fromEntries(
      conditionKeys.map((key) => [
        key,
        (doc.getElementById(key) as HTMLInputElement | null)?.checked,
      ]),
    ),
  };
  return isRunnerSettings(settings) ? settings : undefined;
}

const sendingSections: readonly SendingSection[] = ['warm-up', 'exercise', 'drill'];

export function sendingSectionFromRoute(route: string | undefined): SendingSection | undefined {
  const section = parameters(route, 'sending')?.get('section') as SendingSection | undefined;
  return section && sendingSections.includes(section) ? section : undefined;
}

export function sendingSectionRoute(section: SendingSection): string {
  return `#practice/sending?${new URLSearchParams({ section })}`;
}
