import { describe, expect, it } from 'vitest';
import { pendingListeningPasses } from './listening-progress';
import type { CurrentPracticeTime } from './practice-time';
import type { PracticeSession } from './training';

const today = '2026-10-13';
const current: CurrentPracticeTime = {
  id: 'studio:current',
  date: today,
  seconds: 60,
  listening: { taskId: 'assigned-recording', completedPasses: 2, purpose: 'assigned' },
};
const receipt: PracticeSession = {
  id: current.id,
  date: today,
  minutes: 1,
  kind: 'listening',
  notes: '',
  createdAt: `${today}T12:00:00Z`,
};

describe('unsaved listening progress', () => {
  it('retains observed counts and assignment attribution while inspecting, including earlier blocks', () => {
    expect(pendingListeningPasses([], current, today)).toEqual(current.listening);
    expect(pendingListeningPasses([], { ...current, date: '2026-10-12' }, today)).toEqual(
      current.listening,
    );
    expect(
      pendingListeningPasses(
        [],
        {
          ...current,
          listening: { ...current.listening!, purpose: 'review' },
        },
        today,
      ),
    ).toMatchObject({ completedPasses: 2, purpose: 'review' });
  });

  it('retires pending listens as soon as the same ID has a device or server receipt', () => {
    for (const saved of [
      receipt,
      { ...receipt, minutes: 0 },
      { ...receipt, context: 'class' as const },
      { ...receipt, date: '2026-10-12', metadata: { practicePurpose: 'review' as const } },
    ])
      expect(pendingListeningPasses([saved, saved], current, today)).toBeUndefined();
    expect(pendingListeningPasses([receipt], { ...current, id: 'studio:next' }, today)).toEqual(
      current.listening,
    );
  });

  it('does not project class, absent, future, or malformed observations as pending listens', () => {
    expect(pendingListeningPasses([], undefined, today)).toBeUndefined();
    expect(pendingListeningPasses([], current, '2026-02-30')).toBeUndefined();
    for (const changes of [
      { id: '' },
      { listening: undefined },
      { classTime: true },
      { date: '2026-10-14' },
      { date: '2026-02-30' },
      { seconds: 0 },
      { seconds: -1 },
      { seconds: Infinity },
      { seconds: 86401 },
    ])
      expect(pendingListeningPasses([], { ...current, ...changes }, today)).toBeUndefined();
    for (const completedPasses of [0, -1, 0.5, Infinity, NaN])
      expect(
        pendingListeningPasses(
          [],
          {
            ...current,
            listening: { ...current.listening!, completedPasses },
          },
          today,
        ),
      ).toBeUndefined();
  });
});
