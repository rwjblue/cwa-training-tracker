import { expect, it } from 'vitest';
import type { PlannedTask } from '../shared/plan';
import { practiceLaunchForTask } from './practice-launch';

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
