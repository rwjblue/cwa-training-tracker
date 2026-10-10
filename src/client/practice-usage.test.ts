import { afterEach, expect, it, vi } from 'vitest';
import { createCopyAttempt, defaultCopyRecipe } from '../shared/copy-practice';
import type { InstructorMaterial } from '../shared/instructor-material';
import type { PracticeActivity } from './practice-launch';
import { validatePracticeSession } from '../shared/training';
import {
  captureCopyPracticeUsage,
  capturePracticeUsage,
  reportPracticeUsage,
  studioUsageTool,
} from './practice-usage';

afterEach(() => vi.unstubAllGlobals());

it('reports one bounded aggregate event without account credentials or private data', () => {
  const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const usage = capturePracticeUsage('words', 'private-account-id');
  expect(usage).toEqual({ tool: 'words', audience: 'account' });
  expect(reportPracticeUsage(usage)).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/practice-usage', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: '{"tool":"words","audience":"account"}',
  });
  expect(capturePracticeUsage('words', 'guest')).toEqual({ tool: 'words', audience: 'guest' });
});

it('ignores failed responses, rejected requests and synchronous fetch failures without retrying', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockRejectedValueOnce(new Error('Offline'))
    .mockImplementationOnce(() => {
      throw new Error('Fetch is disabled');
    });
  vi.stubGlobal('fetch', fetchMock);
  for (let index = 0; index < 3; index++)
    expect(() => reportPracticeUsage(capturePracticeUsage('free', 'guest'))).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('excludes already-finished Copy recovery while allowing continued and fresh practice', () => {
  const attempt = createCopyAttempt(defaultCopyRecipe(), {
    id: 'recovered-round',
    seed: 'synthetic-seed',
    now: '2026-10-09T12:00:00Z',
  });
  const pending = validatePracticeSession({
    id: 'copy:recovered-round',
    date: '2026-10-09',
    kind: 'icr',
    minutes: 1,
    createdAt: '2026-10-09T12:00:00Z',
  });
  const usage = { tool: 'copy', audience: 'guest' };
  expect(captureCopyPracticeUsage('guest', { attempt })).toEqual(usage);
  expect(captureCopyPracticeUsage('guest', { attempt, pending })).toBeUndefined();
  expect(
    captureCopyPracticeUsage('guest', { attempt: { ...attempt, status: 'completed' } }),
  ).toBeUndefined();
  expect(
    captureCopyPracticeUsage('guest', { attempt: { ...attempt, status: 'abandoned' } }),
  ).toBeUndefined();
  expect(captureCopyPracticeUsage('guest')).toEqual(usage);
});

it('classifies native tools and assigned activities from their actual launch context', () => {
  for (const tool of ['words', 'qso', 'stories', 'copy', 'sending', 'free', 'runner'] as const)
    expect(studioUsageTool({ id: `launch:${tool}`, tool }, undefined, tool)).toBe(tool);

  const activities: [PracticeActivity, string][] = [
    [{ type: 'audio', url: 'https://example.test/private-recording.mp3' }, 'recording'],
    [{ type: 'copy', recipe: defaultCopyRecipe() }, 'copy'],
    [{ type: 'sending', url: 'https://example.test/scales.pdf', sections: ['warm-up'] }, 'sending'],
    [
      {
        type: 'morse-runner',
        url: '/vendor/runner',
        settings: {
          mode: 'SingleCall',
          wpm: 20,
          durationSeconds: 60,
          activity: 1,
          conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
        },
      },
      'runner',
    ],
    [{ type: 'timer' }, 'manual'],
    [{ type: 'external', url: 'https://example.test/private-resource' }, 'manual'],
    [
      { type: 'live-event', eventId: 'cwt', url: 'https://cwops.org/', deadline: 'practice-date' },
      'manual',
    ],
  ];
  for (const [activity, expected] of activities)
    expect(studioUsageTool({ id: 'private-launch', activity }, activity, 'free')).toBe(expected);

  const material: InstructorMaterial = {
    version: 1,
    id: 'private-material',
    course: { level: 'beginner', firstClassDate: '2026-10-01' },
    session: 1,
    title: 'Private exercise',
    text: 'Private text',
    usage: 'preparation',
    createdAt: '2026-10-01T12:00:00Z',
  };
  expect(studioUsageTool({ id: 'private-launch', material }, undefined, 'free')).toBe('sending');
});
