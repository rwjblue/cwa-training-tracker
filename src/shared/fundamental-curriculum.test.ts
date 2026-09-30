import { describe, expect, it } from 'vitest';
import { curriculumPlan } from './curriculum';
import { DEFAULT_PROFILE } from './training';

const tasks = curriculumPlan({
  ...DEFAULT_PROFILE,
  level: 'fundamental',
  timezone: 'America/New_York',
  firstClassDate: '2026-09-07',
  classDays: [1, 4],
});

function at(id: string) {
  const task = tasks.find((candidate) => candidate.curriculum?.exerciseId === id);
  if (!task) throw new Error(`Missing Fundamental occurrence ${id}`);
  return task;
}

describe('published Fundamental requirements', () => {
  it('repeats the shared session 15 letters recipe on all three days without changing occurrence identities', () => {
    for (const day of [1, 2, 3]) {
      expect(at(`s15-d${day}-t2`)).toMatchObject({
        id: `curriculum:cwa-fundamental-v2.0:s15-d${day}-t2`,
        exercise: {
          type: 'copy',
          recipe: {
            mode: 'groups',
            groupKind: 'letters',
            groupLength: 5,
            durationSeconds: 60,
            characterWpm: 25,
            effectiveWpm: 11,
            extraWordSpacing: 3,
          },
          targetAccuracy: 80,
          maximumAttempts: 5,
        },
      });
    }
    expect(tasks.filter((task) => task.kind === 'on-air' && task.lesson === 15)).toHaveLength(1);
    expect(tasks).toHaveLength(248);
  });

  it('keeps the first-day fourth round and missed-character follow-up together', () => {
    const task = at('s1-d1-t6');
    expect(task.exercise).toMatchObject({
      type: 'copy',
      repetitions: 1,
      requiresCharacterSelection: true,
      recipe: { groupKind: 'letters', groupLength: 2, durationSeconds: 60 },
      alternatives: [
        {
          groupKind: 'custom',
          groupLength: 2,
          durationSeconds: 60,
          customCharacters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        },
      ],
    });
    expect(task.notes).toContain('at least two more times');
  });

  it('requires learner selection for every difficult-character option, including alternatives', () => {
    const customTasks = tasks.filter((task) => {
      const exercise = task.exercise;
      return (
        exercise?.type === 'copy' &&
        [exercise.recipe, ...(exercise.alternatives ?? [])].some(
          (recipe) => recipe.mode === 'groups' && recipe.groupKind === 'custom',
        )
      );
    });
    expect(customTasks.length).toBeGreaterThan(0);
    for (const task of customTasks) {
      expect(task.exercise).toMatchObject({ requiresCharacterSelection: true });
      if (task.exercise?.type !== 'copy') throw new Error('Expected native copy');
      for (const recipe of [task.exercise.recipe, ...(task.exercise.alternatives ?? [])]) {
        if (recipe.mode !== 'groups' || recipe.groupKind !== 'custom') continue;
        expect(recipe.customCharacters).not.toBe('ESIHT');
      }
    }
    for (const id of ['s6-d1-t7', 's6-d3-t4']) {
      expect(at(id).exercise).toMatchObject({
        recipe: { customCharacters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' },
      });
      expect(at(id).notes).toContain('five other letters or figures');
    }
    expect(at('s6-d2-t6').notes).toContain('two other figures');
    expect(at('s3-d3-t4').notes).toContain('four at a time');
  });

  it('preserves explicit recording passes and leaves open-ended repetition uncapped', () => {
    for (const id of ['s11-d3-t6', 's12-d1-t6', 's12-d3-t6', 's13-d3-t4', 's14-d3-t4']) {
      expect(at(id).exercise).toMatchObject({
        type: 'audio',
        minimumPasses: 2,
        maximumPasses: 2,
      });
    }
    for (const id of ['s4-d3-t6', 's13-d1-t6', 's14-d1-t6']) {
      const exercise = at(id).exercise;
      expect(exercise).toMatchObject({ type: 'audio', minimumPasses: 2 });
      expect(exercise).not.toHaveProperty('maximumPasses');
    }
    expect(at('s11-d1-t6')).toMatchObject({ targetMinutes: 30 });
    expect(at('s12-d1-t6')).toMatchObject({ targetMinutes: 30 });
    expect(at('s14-d1-t6').targetMinutes).toBeUndefined();
    expect(at('s14-d1-t6').notes).toContain('twenty minutes');
  });

  it('preserves conflicting recording links and makes the discrepancy visible', () => {
    expect(at('s12-d1-t6').exercise).toMatchObject({
      url: 'https://cwops.org/wp-content/uploads/2022/07/ss-10.112.mp3',
    });
    expect(at('s12-d1-t6').exercise).not.toHaveProperty('characterWpm');
    expect(at('s12-d1-t6').notes).toContain('source text says 9 WPM');
    expect(at('s14-d3-t4').exercise).toMatchObject({
      url: 'https://cwa.cwops.org/wp-content/uploads/POTA203_12.mp3',
    });
    expect(at('s14-d3-t4').notes).toContain('source names QSO 105');
  });
});
