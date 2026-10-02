import { expect, it } from 'vitest';
import type { PlannedTask, PracticeExercise } from '../shared/plan';
import { defaultCopyRecipe } from '../shared/copy-practice';
import { practiceActivityForLaunch, practiceLaunchForTask } from './practice-launch';

const task: PlannedTask = {
  id: 'task:purpose',
  title: 'Listen to the exchange',
  kind: 'listening',
  done: false,
  notes: '',
  createdAt: '2026-09-30T12:00:00.000Z',
  exercise: { type: 'audio', url: 'https://example.test/exchange.mp3' },
};

it('captures a deliberate assigned or review launch independently of completion', () => {
  for (const done of [false, true]) {
    const exercise = { ...task, done };
    expect(practiceLaunchForTask(exercise)).toEqual({
      task: exercise,
      activity: exercise.exercise,
      purpose: 'assigned',
    });
    expect(practiceLaunchForTask(exercise, 'review')).toEqual({
      task: exercise,
      activity: exercise.exercise,
      purpose: 'review',
    });
  }
});

it('keeps native Copy conversion and originating task identity for a review launch', () => {
  const launch = practiceLaunchForTask(
    { ...task, kind: 'icr', exercise: undefined, link: 'https://lcwo.net/index.php?p=callsigns' },
    'review',
  );
  expect(launch).toMatchObject({
    purpose: 'review',
    task: { id: task.id, exercise: { type: 'copy', recipe: { mode: 'callsigns' } } },
    activity: { type: 'copy', recipe: { mode: 'callsigns' } },
  });
});

it('follows current optional event add, change and clear while retaining manual launch identity', () => {
  const ordinary: PlannedTask = { ...task, kind: 'on-air', exercise: undefined };
  const cwt: PlannedTask = {
    ...ordinary,
    exercise: {
      type: 'live-event',
      eventId: 'cwt',
      url: 'https://cwops.org/cwops-tests/',
      deadline: 'associated-class',
    },
  };
  const sst: PlannedTask = {
    ...cwt,
    exercise: {
      type: 'live-event',
      eventId: 'sst',
      url: 'https://www.k1usn.com/sst_rules.html',
      deadline: 'practice-date',
    },
  };
  const manual = { id: 'same-manual-owner', ...practiceLaunchForTask(ordinary) };
  const live = { id: 'same-live-owner', ...practiceLaunchForTask(cwt) };
  const before = structuredClone({ manual, live, cwt, sst, ordinary });
  expect(practiceActivityForLaunch(manual, [cwt])).toBe(cwt.exercise);
  expect(practiceActivityForLaunch(live, [sst])).toBe(sst.exercise);
  expect(practiceActivityForLaunch(live, [ordinary])).toEqual({ type: 'timer' });
  const linked = { ...ordinary, link: 'https://example.test/private-preparation' };
  expect(practiceActivityForLaunch(live, [linked])).toEqual({ type: 'external', url: linked.link });
  expect(practiceActivityForLaunch(live, [])).toBe(live.activity);
  expect({ manual, live, cwt, sst, ordinary }).toEqual(before);
});

it('keeps captured native material and public owners independent of later event edits', () => {
  const live: PlannedTask = {
    ...task,
    kind: 'on-air',
    exercise: {
      type: 'live-event',
      eventId: 'cwt',
      url: 'https://cwops.org/cwops-tests/',
      deadline: 'associated-class',
    },
  };
  const nativeActivities: PracticeExercise[] = [
    { type: 'audio', url: 'https://example.test/exchange.mp3' },
    { type: 'sending', url: 'https://example.test/scales.pdf', sections: ['warm-up', 'drill'] },
    { type: 'copy', recipe: defaultCopyRecipe('words') },
    {
      type: 'morse-runner',
      url: '/vendor/web-morse-runner/index.html',
      settings: {
        mode: 'SingleCall',
        wpm: 20,
        durationSeconds: 60,
        activity: 1,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      },
    },
  ];
  for (const activity of nativeActivities) {
    const launch = { id: 'native', task, activity };
    expect(practiceActivityForLaunch(launch, [live])).toBe(activity);
  }
  const publicLaunch = { id: 'guest', activity: { type: 'timer' as const } };
  expect(practiceActivityForLaunch(publicLaunch, [live])).toBe(publicLaunch.activity);
  expect(practiceActivityForLaunch(undefined, [live])).toBeUndefined();
});
