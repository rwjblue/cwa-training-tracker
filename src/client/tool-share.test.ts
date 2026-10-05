import { describe, expect, it } from 'vitest';
import { createCopyAttempt, defaultCopyRecipe } from '../shared/copy-practice';
import type { RunnerSettings } from '../shared/runner';
import { publicCurriculumExercises } from '../shared/curriculum';
import type { PracticeExercise } from '../shared/plan';
import { COURSE_LEVELS } from '../shared/training';
import { publicLessonHash } from './curriculum-links';
import {
  copyRecipeFromRoute,
  copyRecipeRoute,
  copyDraftMatchesSharedRecipe,
  runnerFrameSettings,
  runnerSettingsFromRoute,
  runnerSettingsRoute,
  sendingSectionFromRoute,
  sendingSectionRoute,
} from './tool-share';

const runnerSettings: RunnerSettings = {
  mode: 'WPX',
  wpm: 35,
  durationSeconds: 180,
  activity: 5,
  conditions: { qrm: true, qrn: false, qsb: true, flutter: false, lids: true },
};

function publishedLesson(type: PracticeExercise['type']): string {
  for (const { id: level } of COURSE_LEVELS) {
    const item = publicCurriculumExercises(level).find(({ exercise }) => exercise?.type === type);
    if (item) return publicLessonHash(level, item.id)!;
  }
  throw new Error(`A published ${type} curriculum lesson is required for this sharing boundary.`);
}

describe('public Copy recipes', () => {
  it('reopens all recipe settings and strips private fields from shared input', () => {
    const recipe = {
      ...defaultCopyRecipe('callsigns'),
      characterWpm: 32,
      effectiveWpm: 18,
      toneMode: 'fixed' as const,
      toneHz: 750,
      callFilter: 'all' as const,
      blind: true,
      stopOnError: true,
      answer: 'PRIVATE ANSWER',
      notes: 'PRIVATE NOTES',
      taskId: 'private-task',
    };
    const route = copyRecipeRoute(recipe)!;
    const restored = copyRecipeFromRoute(route);
    expect(restored).toEqual({
      ...defaultCopyRecipe('callsigns'),
      characterWpm: 32,
      effectiveWpm: 18,
      toneMode: 'fixed',
      toneHz: 750,
      callFilter: 'all',
      blind: true,
      stopOnError: true,
    });
    expect(decodeURIComponent(route)).not.toMatch(/PRIVATE|taskId|notes|answer/);
    expect(copyRecipeRoute(restored!)).toBe(route);
  });

  it('keeps legacy fixed tone when sharing a recovered recipe', () => {
    const recipe = defaultCopyRecipe();
    delete recipe.toneMode;
    expect(copyRecipeFromRoute(copyRecipeRoute(recipe))).toEqual({ ...recipe, toneMode: 'fixed' });
  });

  it('uses complete shared settings rather than any saved device preferences', () => {
    const shared = {
      ...defaultCopyRecipe('groups'),
      groupKind: 'custom' as const,
      customCharacters: 'ESIHT',
    };
    expect(copyRecipeFromRoute(copyRecipeRoute(shared))).toEqual(shared);
    expect(copyRecipeFromRoute('#practice/copy')).toBeUndefined();
  });

  it('reopens adjusted public lesson recipes while rejecting unknown or other lesson types', () => {
    const recipe = {
      ...defaultCopyRecipe('words'),
      effectiveWpm: 12,
      wordCollection: 'short' as const,
      adaptive: false,
    };
    const query = copyRecipeRoute(recipe)!.split('?')[1];
    expect(copyRecipeFromRoute(`${publishedLesson('copy')}?${query}`)).toEqual(recipe);
    expect(copyRecipeFromRoute(`${publishedLesson('morse-runner')}?${query}`)).toBeUndefined();
    expect(
      copyRecipeFromRoute(`#practice/lesson/fundamental/private-task-id?${query}`),
    ).toBeUndefined();
    expect(copyRecipeFromRoute(publishedLesson('copy'))).toBeUndefined();
  });

  it.each([
    '#practice/copy?recipe=%7B',
    '#practice/copy?recipe=%7B%22mode%22%3A%22not-a-mode%22%7D',
    '#practice/runner?recipe=%7B%22mode%22%3A%22groups%22%7D',
    `#practice/copy?recipe=${'a'.repeat(8192)}`,
  ])('ignores malformed or misplaced settings: %s', (route) => {
    expect(copyRecipeFromRoute(route)).toBeUndefined();
  });

  it('does not replace a good URL with invalid intermediate settings', () => {
    expect(copyRecipeRoute({ ...defaultCopyRecipe(), characterWpm: 0 })).toBeUndefined();
    expect(copyRecipeRoute({ ...defaultCopyRecipe(), effectiveWpm: NaN })).toBeUndefined();
  });

  it('resumes matching unassigned local recipes but requires a choice for unrelated/private drafts', () => {
    const recipe = defaultCopyRecipe();
    const draft = { attempt: createCopyAttempt(recipe, { id: 'test-round', seed: 'test-seed' }) };
    expect(copyDraftMatchesSharedRecipe(draft, { ...recipe })).toBe(true);
    expect(copyDraftMatchesSharedRecipe(draft, { ...recipe, groupLength: 5 })).toBe(false);
    expect(copyDraftMatchesSharedRecipe({ ...draft, purpose: 'review' }, recipe)).toBe(false);
    expect(
      copyDraftMatchesSharedRecipe(
        {
          ...draft,
          task: {
            id: 'private-task',
            title: 'Private assignment',
            kind: 'icr',
            done: false,
            notes: '',
            createdAt: '2026-10-05T12:00:00.000Z',
          },
        },
        recipe,
      ),
    ).toBe(false);
    expect(
      copyDraftMatchesSharedRecipe(
        { ...draft, pending: { metadata: { plannedTaskId: 'private-task' } } },
        recipe,
      ),
    ).toBe(false);
    expect(copyDraftMatchesSharedRecipe(undefined, recipe)).toBe(false);
    const legacyRecipe = { ...recipe };
    delete legacyRecipe.toneMode;
    const legacyDraft = { attempt: { ...draft.attempt, recipe: legacyRecipe } };
    expect(copyDraftMatchesSharedRecipe(legacyDraft, { ...recipe, toneMode: 'fixed' })).toBe(true);
    expect(copyDraftMatchesSharedRecipe(legacyDraft, recipe)).toBe(false);
  });
});

describe('public Runner setup', () => {
  it('reopens adjusted public Runner lesson setup without accepting another curriculum activity', () => {
    const query = runnerSettingsRoute(runnerSettings)!.split('?')[1];
    expect(runnerSettingsFromRoute(`${publishedLesson('morse-runner')}?${query}`)).toEqual(
      runnerSettings,
    );
    expect(runnerSettingsFromRoute(`${publishedLesson('copy')}?${query}`)).toBeUndefined();
    expect(
      runnerSettingsFromRoute(`#practice/lesson/intermediate/private-task-id?${query}`),
    ).toBeUndefined();
    expect(runnerSettingsFromRoute(publishedLesson('morse-runner'))).toBeUndefined();
  });

  it('round-trips supported settings without run or station identity', () => {
    const route = runnerSettingsRoute(runnerSettings)!;
    expect(runnerSettingsFromRoute(route)).toEqual(runnerSettings);
    expect(route).toBe(
      '#practice/runner?mode=WPX&wpm=35&seconds=180&activity=5&conditions=qrm%2Cqsb%2Clids',
    );
    expect(runnerSettingsRoute(runnerSettingsFromRoute(route)!)).toBe(route);
    expect(
      runnerSettingsRoute({
        ...runnerSettings,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      }),
    ).toContain('conditions=');
  });

  it.each([
    '#practice/runner',
    '#practice/runner?mode=SingleCall&wpm=20&seconds=300&activity=2&conditions=unknown',
    '#practice/runner?mode=WPX&wpm=0&seconds=300&activity=2',
    '#practice/runner?mode=WPX&wpm=35&seconds=180',
    '#practice/copy?mode=WPX&wpm=35&seconds=180&activity=5',
  ])('ignores invalid or incomplete setup: %s', (route) => {
    expect(runnerSettingsFromRoute(route)).toBeUndefined();
  });

  it('reads only public iframe setup controls and rejects transient invalid input', () => {
    const inputs: Record<string, { value?: string; checked?: boolean }> = {
      mode: { value: 'wpx' },
      wpm: { value: '35' },
      time: { value: '3' },
      activity: { value: '5' },
      ...Object.fromEntries(
        Object.entries(runnerSettings.conditions).map(([key, checked]) => [key, { checked }]),
      ),
      my_call: { value: 'PRIVATE CALL' },
      call: { value: 'TYPED ANSWER' },
      transcript_content: { value: 'PRIVATE TRANSCRIPT' },
    };
    const accessed: string[] = [];
    const doc = {
      getElementById(id: string) {
        accessed.push(id);
        return inputs[id];
      },
    } as unknown as Document;
    expect(runnerFrameSettings(doc)).toEqual(runnerSettings);
    expect(accessed).not.toContain('my_call');
    expect(accessed).not.toContain('call');
    expect(accessed).not.toContain('transcript_content');
    inputs.wpm.value = '';
    expect(runnerFrameSettings(doc)).toBeUndefined();
  });
});

describe('public sending section', () => {
  it('reopens a selected public sending lesson section only for a sending activity', () => {
    expect(sendingSectionFromRoute(`${publishedLesson('sending')}?section=drill`)).toBe('drill');
    expect(sendingSectionFromRoute(`${publishedLesson('copy')}?section=drill`)).toBeUndefined();
  });

  it.each(['warm-up', 'exercise', 'drill'] as const)('reopens the %s scale', (section) => {
    expect(sendingSectionFromRoute(sendingSectionRoute(section))).toBe(section);
  });

  it('ignores invalid or misplaced scale selections', () => {
    expect(sendingSectionFromRoute('#practice/sending?section=private')).toBeUndefined();
    expect(sendingSectionFromRoute('#practice/copy?section=drill')).toBeUndefined();
  });
});
