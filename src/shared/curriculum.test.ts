import { describe, expect, it } from 'vitest';
import {
  curriculumForLevel,
  curriculumPlan,
  INTERMEDIATE_CURRICULUM,
  mergeCurriculumPlan,
  sessionSyllabusUrl,
} from './curriculum';
import {
  dailyPlanSummary,
  legacyPlan,
  validatePlan,
  validatePlannedTask,
  type PlannedTask,
} from './plan';
import { DEFAULT_PROFILE, courseMeetings, type PracticeSession, type Profile } from './training';

const profile: Profile = {
  ...DEFAULT_PROFILE,
  level: 'intermediate',
  timezone: 'America/New_York',
  firstClassDate: '2026-09-07',
  classDays: [1, 4],
};

describe('automatic curriculum plan', () => {
  it('preserves a newly imported explicit 15-minute recommendation without inventing one for untimed legacy work', () => {
    const imported = legacyPlan(
      {
        assignments: [
          {
            session: 1,
            tasks: [
              {
                id: 's1-d1-t1',
                title: 'My assigned sending practice',
                kind: 'sending',
                minutes: 15,
              },
              { id: 's1-d1-t2', title: 'Untimed listening practice', kind: 'audio' },
            ],
          },
        ],
      },
      [],
      '2026-09-28T12:00:00.000Z',
    );
    expect(imported[0]).toMatchObject({ targetMinutes: 15, targetMinutesExplicit: true });
    expect(imported[1]).not.toHaveProperty('targetMinutes');
    expect(imported[1]).not.toHaveProperty('targetMinutesExplicit');
    const merged = mergeCurriculumPlan(profile, imported);
    expect(merged.find((task) => task.id === imported[0].id)).toMatchObject({
      targetMinutes: 15,
      targetMinutesExplicit: true,
      source: 'legacy',
      done: false,
    });
    expect(merged.find((task) => task.id === imported[1].id)).not.toHaveProperty('targetMinutes');
  });

  it('uses only authored duration recommendations and retires the old universal 15-minute placeholder', () => {
    const initial = curriculumPlan(profile);
    expect(initial.find((task) => task.title === 'WD101-10')?.targetMinutes).toBeUndefined();
    expect(
      initial
        .filter((task) => task.kind === 'simulator')
        .every((task) => task.targetMinutes === 15),
    ).toBe(true);
    expect(initial.filter((task) => task.targetMinutes !== undefined)).toHaveLength(23);
    expect(
      curriculumPlan({ ...profile, level: 'beginner' }).every(
        (task) => task.targetMinutes === undefined,
      ),
    ).toBe(true);
    expect(
      curriculumPlan({ ...profile, level: 'advanced' }).every(
        (task) => task.targetMinutes === undefined,
      ),
    ).toBe(true);
    const unknown = initial.filter((task) => task.targetMinutes === undefined);
    const stored: PlannedTask[] = [
      { ...unknown[0], targetMinutes: 15, dismissedFromToday: true },
      { ...unknown[1], targetMinutes: 12 },
      { ...unknown[2], targetMinutes: 15, targetMinutesExplicit: true },
      {
        ...initial.find((task) => task.kind === 'simulator')!,
        targetMinutes: undefined,
        targetMinutesExplicit: true,
      },
      {
        ...unknown[0],
        id: 'manual:15',
        source: 'manual',
        curriculum: undefined,
        targetMinutes: 15,
      },
    ];
    const merged = mergeCurriculumPlan(profile, stored);
    expect(merged.find((task) => task.id === stored[0].id)).toMatchObject({
      dismissedFromToday: true,
      done: false,
    });
    expect(merged.find((task) => task.id === stored[0].id)).not.toHaveProperty('targetMinutes');
    expect(merged.find((task) => task.id === stored[1].id)?.targetMinutes).toBe(12);
    expect(merged.find((task) => task.id === stored[2].id)?.targetMinutes).toBe(15);
    expect(merged.find((task) => task.id === stored[3].id)).not.toHaveProperty('targetMinutes');
    expect(merged.find((task) => task.id === 'manual:15')?.targetMinutes).toBe(15);
    expect(
      mergeCurriculumPlan(profile, [{ ...stored[0], dismissedFromToday: false }]).find(
        (task) => task.id === stored[0].id,
      )?.dismissedFromToday,
    ).toBe(false);
  });

  it('links all 64 sessions to verified sections, including missing-bookmark and final-session exceptions', () => {
    for (const level of ['beginner', 'fundamental', 'intermediate', 'advanced'] as const) {
      const links = Array.from({ length: 16 }, (_, index) => sessionSyllabusUrl(level, index + 1)!);
      expect(new Set(links).size).toBe(16);
      expect(
        links.every((url) => /^https:\/\/(?:cwa\.)?cwops\.org\/.+#(?:_Toc\d+|page=11)$/.test(url)),
      ).toBe(true);
      for (const invalid of [0, 17, 1.5, NaN])
        expect(sessionSyllabusUrl(level, invalid)).toBeUndefined();
    }
    expect(sessionSyllabusUrl('beginner', 2)).toBe(
      'https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.pdf#page=11',
    );
    expect(sessionSyllabusUrl('fundamental', 1)).toContain('#_Toc173138629');
    expect(sessionSyllabusUrl('fundamental', 16)).toContain('#_Toc173138673');
    expect(sessionSyllabusUrl('intermediate', 8)).toContain('#_Toc172984031');
    expect(sessionSyllabusUrl('advanced', 16)).toContain('#_Toc197333306');
  });

  it('dates all required Intermediate exercises and keeps official resource constraints intact', () => {
    const plan = curriculumPlan(profile);
    expect(plan).toHaveLength(213);
    expect(INTERMEDIATE_CURRICULUM.exerciseCount).toBe(plan.length);
    expect(validatePlan(plan)).toEqual(plan);
    expect(new Set(plan.map((task) => task.dueDate)).size).toBe(48);
    const first = plan.filter((task) => task.lesson === 1);
    expect([...new Set(first.map((task) => task.dueDate))]).toEqual([
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ]);
    expect([
      ...new Set(plan.filter((task) => task.lesson === 2).map((task) => task.dueDate)),
    ]).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
    expect(plan.some((task) => new Date(`${task.dueDate}T12:00:00Z`).getUTCDay() === 5)).toBe(
      false,
    );
    const recording = first.find((task) => task.title === 'WD101-10')!;
    expect(recording.exercise).toMatchObject({ type: 'audio', characterWpm: 10, minimumPasses: 2 });
    for (const task of plan) {
      expect(task.curriculum?.sourceUrl).toMatch(/^https:\/\/cwa\.cwops\.org\//);
      if (task.exercise?.type === 'audio' && task.exercise.url)
        expect(new URL(task.exercise.url).hostname).toMatch(/^(?:cwa\.)?cwops\.org$/);
    }
    const unavailable = plan.filter(
      (task) => task.exercise?.type === 'audio' && task.exercise.unresolved,
    );
    expect(unavailable.map((task) => task.title)).toEqual(['WD405-25']);
    expect(unavailable[0].exercise?.url).toBeUndefined();
    for (const title of ['CWT208-20', 'CWT212-25'])
      expect(plan.find((task) => task.title === title)?.exercise?.url).toMatch(/\.mp3$/);
    const simulators = plan.filter((task) => task.kind === 'simulator');
    expect(simulators).toHaveLength(23);
    expect(new Set(simulators.map((task) => task.exercise?.type))).toEqual(
      new Set(['morse-runner']),
    );
    const settings = simulators.map((task) =>
      task.exercise?.type === 'morse-runner' ? task.exercise.settings : undefined,
    );
    expect(new Set(settings.map((value) => value?.mode))).toEqual(new Set(['SingleCall', 'WPX']));
    expect(settings.every((value) => value?.durationSeconds === 900 && value.activity === 2)).toBe(
      true,
    );
  });

  it('preserves saved completion and private legacy detail through rescheduling without duplicate tasks or lost minutes', () => {
    const initial = curriculumPlan(profile);
    const saved = { ...initial[0], done: true, notes: 'My private reminder' };
    const legacy: PlannedTask = {
      ...initial[1],
      id: `legacy-task:${initial[1].curriculum!.exerciseId}`,
      source: 'legacy',
      notes: 'Imported private instructions',
      done: true,
    };
    const manual: PlannedTask = {
      ...initial[2],
      id: 'my-extra',
      source: 'manual',
      curriculum: undefined,
      exercise: undefined,
      title: 'An extra activity',
      dueDate: '2026-09-20',
    };
    const moved = { ...profile, firstClassDate: '2026-09-14' };
    const merged = mergeCurriculumPlan(moved, [saved, legacy, manual]);
    expect(merged).toHaveLength(initial.length + 1);
    expect(new Set(merged.map((task) => task.id)).size).toBe(merged.length);
    expect(merged.find((task) => task.id === saved.id)).toMatchObject({
      done: true,
      dueDate: '2026-09-12',
      notes: saved.notes,
    });
    expect(merged.find((task) => task.id === legacy.id)).toMatchObject({
      done: true,
      dueDate: '2026-09-12',
      notes: legacy.notes,
      curriculum: { id: INTERMEDIATE_CURRICULUM.id },
    });
    expect(merged.find((task) => task.id === manual.id)).toEqual(manual);
    const entry: PracticeSession = {
      id: 'auto-attempt',
      date: '2026-09-12',
      kind: 'listening',
      minutes: 3,
      notes: '',
      createdAt: '2026-09-12T12:00:00Z',
      metadata: { plannedTaskId: initial[1].id },
    };
    const summary = dailyPlanSummary(
      merged,
      courseMeetings(moved),
      [
        entry,
        {
          ...entry,
          id: 'old-attempt',
          minutes: 2,
          source: 'legacy',
          metadata: { legacyAttempt: { taskId: legacy.curriculum!.exerciseId } },
        },
      ],
      '2026-09-12',
    );
    expect(summary.completed.find((item) => item.task.id === legacy.id)?.loggedMinutes).toBe(5);
    const beginner = mergeCurriculumPlan({ ...moved, level: 'beginner' }, [saved, legacy, manual]);
    expect(beginner.filter((task) => task.source !== 'curriculum')).toEqual([legacy, manual]);
    expect(
      beginner.filter((task) => task.source === 'curriculum').every((task) => !task.done),
    ).toBe(true);
    expect(curriculumPlan({ ...profile, firstClassDate: '' })).toEqual([]);
    expect(initial[0].done).toBe(false);
  });

  it('launches every Intermediate ICR assignment with separate character and effective speeds', () => {
    const tasks = curriculumPlan(profile).filter((task) => task.kind === 'icr');
    expect(tasks).toHaveLength(20);
    const speeds = tasks.map((task) => {
      expect(task.exercise?.type).toBe('copy');
      if (task.exercise?.type !== 'copy') throw new Error('Expected a native copy recipe');
      const effectiveWpm = task.exercise.recipe.effectiveWpm;
      expect(task.exercise.recipe).toMatchObject({
        characterWpm: 25,
        groupLength: 3,
        durationSeconds: 60,
      });
      expect(
        task.exercise.alternatives?.map((recipe) => [
          recipe.mode,
          recipe.groupKind,
          recipe.maxWordLength,
        ]),
      ).toEqual([
        ['groups', 'figures', 3],
        ['groups', 'custom', 3],
        ['words', 'letters', 3],
      ]);
      expect(
        task.exercise.alternatives?.every((recipe) => recipe.effectiveWpm === effectiveWpm),
      ).toBe(true);
      return [task.lesson, task.curriculum!.day, task.exercise.recipe.effectiveWpm];
    });
    expect(speeds).toEqual([
      [1, 1, 10],
      [1, 3, 10],
      [2, 2, 10],
      [3, 1, 13],
      [3, 3, 13],
      [4, 2, 13],
      [5, 1, 13],
      [5, 3, 13],
      [6, 2, 13],
      [7, 1, 15],
      [7, 3, 15],
      [8, 2, 15],
      [9, 1, 15],
      [9, 3, 15],
      [10, 2, 15],
      [11, 1, 18],
      [11, 2, 18],
      [13, 1, 18],
      [13, 3, 15],
      [15, 3, 20],
    ]);
  });

  it('supports published courses without mistaking other-course tasks for legacy Intermediate work', () => {
    const legacy = {
      ...curriculumPlan(profile)[0],
      id: 'legacy-task:s1-d1-t1',
      source: 'legacy' as const,
      done: true,
    };
    for (const level of ['beginner', 'fundamental', 'advanced'] as const) {
      const plan = curriculumPlan({ ...profile, level });
      expect(validatePlan(plan)).toEqual(plan);
      expect(new Set(plan.map((task) => task.id)).size).toBe(plan.length);
      expect(new Set(plan.map((task) => task.lesson)).size).toBe(16);
      expect(curriculumForLevel(level)?.exerciseCount).toBe(plan.length);
      expect(curriculumForLevel(level)?.id).not.toMatch(/proto/i);
      const merged = mergeCurriculumPlan({ ...profile, level }, [legacy]);
      expect(
        merged.filter((task) => task.source === 'curriculum').every((task) => !task.done),
      ).toBe(true);
      expect(merged.find((task) => task.id === legacy.id)).toEqual(legacy);
    }
    expect(
      curriculumPlan({ ...profile, level: 'advanced' }).filter(
        (task) => task.exercise?.type === 'audio',
      ),
    ).toHaveLength(114);
    expect(
      curriculumPlan({ ...profile, level: 'beginner' }).some(
        (task) => task.exercise?.type === 'copy',
      ),
    ).toBe(false);
  });

  it('preserves Fundamental group durations, four trainer modes, weak-character choices and conditional work', () => {
    const tasks = curriculumPlan({ ...profile, level: 'fundamental' });
    const native = tasks.filter((task) => task.exercise?.type === 'copy');
    expect(native).toHaveLength(98);
    const recipes = native.flatMap((task) =>
      task.exercise?.type === 'copy' ? [task.exercise.recipe] : [],
    );
    expect(new Set(recipes.map((recipe) => recipe.mode))).toEqual(
      new Set(['groups', 'words', 'callsigns', 'plaintext']),
    );
    expect(
      new Set(
        recipes
          .filter((recipe) => recipe.mode === 'groups')
          .map((recipe) => recipe.durationSeconds),
      ),
    ).toEqual(new Set([60, 120, 180]));
    expect(recipes.every((recipe) => recipe.characterWpm === 25)).toBe(true);
    const at = (session: number, day: number, title: string) =>
      tasks.find(
        (task) =>
          task.lesson === session && task.curriculum?.day === day && task.title.startsWith(title),
      )!;
    expect(at(1, 1, 'Copy 1').exercise).toMatchObject({
      type: 'copy',
      recipe: { groupLength: 2, effectiveWpm: 6 },
      repetitions: 1,
    });
    expect(at(1, 2, 'Copy 2').exercise).toMatchObject({
      type: 'copy',
      requiresCharacterSelection: true,
      recipe: { groupKind: 'custom' },
    });
    expect(at(8, 3, 'Copy 3').exercise).toMatchObject({
      type: 'copy',
      recipe: { groupLength: 5, durationSeconds: 120 },
    });
    expect(at(9, 1, 'Copy 1').exercise).toMatchObject({ targetAccuracy: 80, maximumAttempts: 5 });
    expect(at(9, 1, 'Copy 1').notes).toContain('80% accuracy within 5 attempts');
    expect(at(10, 1, 'Copy 2').exercise).toMatchObject({
      recipe: { mode: 'callsigns' },
      alternatives: [{ mode: 'groups' }],
    });
    expect(at(6, 3, 'Copy 3').exercise).toMatchObject({
      recipe: { wordCollection: 'abbreviations' },
      alternatives: [{ wordCollection: 'qcodes' }],
    });
    expect(at(15, 3, 'Copy 1').exercise).toMatchObject({
      recipe: { effectiveWpm: 11, extraWordSpacing: 3 },
    });
    expect(native.every((task) => !task.exercise?.url?.includes('lcwo.net'))).toBe(true);
  });

  it('rejects unsafe or inconsistent exercise recipes from private plan imports', () => {
    const task = curriculumPlan(profile)[1];
    for (const exercise of [
      { type: 'audio', url: 'javascript:alert(1)' },
      { type: 'audio' },
      { type: 'audio', url: 'https://example.org/audio.mp3', minimumPasses: 3, maximumPasses: 1 },
      { type: 'sending', url: 'https://example.org/scales', sections: ['invented'] },
      { type: 'external', url: 'https://name:secret@example.org/' },
      { type: 'morse-runner', url: 'https://example.org/', settings: { mode: 'SingleCall' } },
      { type: 'copy', recipe: { mode: 'groups', characterWpm: 10, effectiveWpm: 25 } },
      { type: 'copy', recipe: { mode: 'groups' }, alternatives: Array(9).fill({ mode: 'groups' }) },
      { type: 'copy', recipe: { mode: 'groups' }, targetAccuracy: Number.NaN },
      { type: 'copy', recipe: { mode: 'groups' }, requiresCharacterSelection: 'yes' },
    ])
      expect(() => validatePlannedTask({ ...task, exercise })).toThrow();
    expect(() =>
      validatePlannedTask({ ...task, curriculum: { ...task.curriculum, day: 4 } }),
    ).toThrow();
  });
});
