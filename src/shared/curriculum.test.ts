import { describe, expect, it } from 'vitest';
import { curriculumPlan, INTERMEDIATE_CURRICULUM, mergeCurriculumPlan } from './curriculum';
import { dailyPlanSummary, validatePlan, validatePlannedTask, type PlannedTask } from './plan';
import { DEFAULT_PROFILE, courseMeetings, type PracticeSession, type Profile } from './training';

const profile: Profile = {
  ...DEFAULT_PROFILE,
  level: 'intermediate',
  timezone: 'America/New_York',
  firstClassDate: '2026-09-07',
  classDays: [1, 4],
};

describe('automatic curriculum plan', () => {
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
    expect(mergeCurriculumPlan({ ...moved, level: 'beginner' }, [saved, legacy, manual])).toEqual([
      legacy,
      manual,
    ]);
    expect(curriculumPlan({ ...profile, firstClassDate: '' })).toEqual([]);
    expect(initial[0].done).toBe(false);
  });

  it('rejects unsafe or inconsistent exercise recipes from private plan imports', () => {
    const task = curriculumPlan(profile)[1];
    for (const exercise of [
      { type: 'audio', url: 'javascript:alert(1)' },
      { type: 'audio' },
      { type: 'audio', url: 'https://example.org/audio.mp3', minimumPasses: 3, maximumPasses: 1 },
      { type: 'sending', url: 'https://example.org/scales', sections: ['invented'] },
      { type: 'external', url: 'https://name:secret@example.org/' },
    ])
      expect(() => validatePlannedTask({ ...task, exercise })).toThrow();
    expect(() =>
      validatePlannedTask({ ...task, curriculum: { ...task.curriculum, day: 4 } }),
    ).toThrow();
  });
});
