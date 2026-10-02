import { describe, expect, it } from 'vitest';
import { runnerAssignmentProgress, type CurrentRunnerProgress } from './runner-progress';
import { type PlannedTask } from './plan';
import { type PracticeSession } from './training';
import { createRunnerRun, RUNNER_REVISION, type RunnerSettings } from './runner';

const settings: RunnerSettings = {
  mode: 'SingleCall',
  wpm: 20,
  durationSeconds: 900,
  activity: 1,
  conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
};
const task: PlannedTask = {
  id: 'runner-task',
  title: 'Assigned Runner',
  kind: 'simulator',
  targetMinutes: 15,
  done: false,
  notes: '',
  createdAt: '2026-09-30T12:00:00.000Z',
  exercise: {
    type: 'morse-runner',
    url: 'https://fritzsche.github.io/WebMorseRunner/',
    settings,
  },
};
const entry = (id: string, seconds = 300): PracticeSession => ({
  id: `runner:${id}`,
  date: '2026-09-30',
  kind: 'simulator',
  minutes: seconds / 60,
  notes: '',
  createdAt: '2026-09-30T12:15:00.000Z',
  metadata: {
    plannedTaskId: task.id,
    practicePurpose: 'assigned',
    elapsedSeconds: seconds,
    runner: {
      ...(({ lastSequence: _, ...run }) => run)(createRunnerRun(id, settings)),
      status: 'stopped',
      elapsedSeconds: seconds,
      revision: RUNNER_REVISION,
      runStartedAt: '2026-09-30T12:00:00.000Z',
      runEndedAt: '2026-09-30T12:15:00.000Z',
      attribution: { version: 1, timezone: 'UTC' },
    },
  },
});
const current: CurrentRunnerProgress = {
  id: 'runner:current',
  taskId: task.id,
  date: '2026-09-30',
  seconds: 120,
  purpose: 'assigned',
  classTime: false,
};
const progress = (entries: PracticeSession[] = [], active = current, owned = task) =>
  runnerAssignmentProgress([owned], entries, '2026-09-30', active).get(task.id)!;

describe('cumulative Runner assignment progress', () => {
  it('combines unique validated saved runs and actual current seconds without deciding completion', () => {
    const first = entry('first');
    expect(progress([first, first, entry('second')])).toEqual({
      savedSeconds: 600,
      currentSeconds: 120,
      combinedSeconds: 720,
      requiredSeconds: 900,
      remainingSeconds: 180,
    });
    expect(task.done).toBe(false);
    expect(progress([first, entry('second'), entry('current', 120)])).toEqual({
      savedSeconds: 720,
      currentSeconds: 0,
      combinedSeconds: 720,
      requiredSeconds: 900,
      remainingSeconds: 180,
    });
  });
  it('excludes review/class, future/retired/foreign placement and invalid/nonpositive facts', () => {
    const review = entry('review');
    review.metadata!.practicePurpose = 'review';
    const classroom = { ...entry('class'), context: 'class' as const };
    const future = { ...entry('future'), date: '2026-10-01' };
    const retired = { ...entry('retired'), historicalPlannedTaskId: task.id };
    const foreign = entry('foreign');
    foreign.metadata!.plannedTaskId = 'other-task';
    const broken = entry('broken');
    broken.minutes = 100;
    const malformed = entry('malformed');
    (malformed.metadata!.runner as Record<string, unknown>).elapsedSeconds = NaN;
    const zero = entry('zero', 0);
    expect(
      progress([review, classroom, future, retired, foreign, broken, malformed, zero]).savedSeconds,
    ).toBe(0);
    for (const changed of [
      { ...current, purpose: 'review' as const },
      { ...current, classTime: true },
      { ...current, date: '2026-10-01' },
      { ...current, date: '2026-09-99' },
      { ...current, seconds: -1 },
      { ...current, seconds: 0 },
      { ...current, seconds: Infinity },
      { ...current, seconds: 6001 },
      { ...current, taskId: 'other-task' },
      { ...current, id: '' },
      { ...current, id: 'unmarked-current' },
    ])
      expect(progress([], changed).currentSeconds).toBe(0);
  });
  it('transfers a saved class/review result to its canonical classification without current credit', () => {
    const saved: PracticeSession = { ...entry('current', 120), context: 'class' as const };
    expect(progress([saved])).toMatchObject({
      savedSeconds: 0,
      currentSeconds: 0,
      remainingSeconds: 900,
    });
    delete saved.context;
    saved.metadata!.practicePurpose = 'review';
    expect(progress([saved])).toMatchObject({ savedSeconds: 0, currentSeconds: 0 });
  });
  it('keeps exact native fractions and shows a milestone without creating entries or completing the task', () => {
    const values = [entry('fraction', 899.75)];
    expect(progress(values, { ...current, seconds: 0.25 })).toMatchObject({
      combinedSeconds: 900,
      remainingSeconds: 0,
    });
    expect(progress(values, { ...current, seconds: 0.5 })).toMatchObject({
      combinedSeconds: 900.25,
      remainingSeconds: 0,
    });
    expect(task.done).toBe(false);
    expect(values).toHaveLength(1);
  });
  it('preserves manual/legacy credit and owned placement aliases without redirecting another task', () => {
    const legacy: PracticeSession = {
      id: 'legacy:first',
      date: '2026-09-30',
      kind: 'simulator',
      minutes: 5,
      notes: '',
      createdAt: '2026-09-30T12:00:00.000Z',
      source: 'legacy',
      metadata: {
        legacyAttempt: {
          id: 'first',
          taskId: 'old',
          context: 'practice',
          activeSeconds: 300,
          completed: false,
        },
      },
    };
    const owned = {
      ...task,
      curriculum: {
        id: 'cwa-intermediate-v2.3',
        exerciseId: 'old',
        day: 1 as const,
        sourceUrl: 'https://cwops.org/',
      },
    };
    const manual = {
      ...legacy,
      id: 'manual',
      source: 'manual' as const,
      metadata: { plannedTaskId: task.id },
    };
    expect(progress([legacy, manual], current, owned).savedSeconds).toBe(600);
    const other = { ...task, id: 'legacy-task:old' };
    expect(
      runnerAssignmentProgress([owned, other], [legacy], '2026-09-30').get(task.id)?.savedSeconds,
    ).toBe(0);
    expect(
      runnerAssignmentProgress([owned, other], [legacy], '2026-09-30').get(other.id)?.savedSeconds,
    ).toBe(300);
  });
  it('never supplies an implicit duration or changes another simulator policy', () => {
    expect(progress([], current, { ...task, targetMinutes: undefined })).toEqual({
      savedSeconds: 0,
      currentSeconds: 120,
      combinedSeconds: 120,
    });
    const external = {
      ...task,
      exercise: { type: 'external' as const, url: 'https://example.test/' },
    };
    expect(runnerAssignmentProgress([external], [entry('first')], '2026-09-30')).toEqual(new Map());
  });
});
