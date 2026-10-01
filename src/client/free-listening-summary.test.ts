import { expect, it } from 'vitest';
import { buildMorseTrack } from './audio';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';
import { freeListeningSummary } from './free-listening-summary';

it('describes the actual cleaned custom track without exposing text or stale generator settings', () => {
  const preferences = {
    ...DEFAULT_PRACTICE_PREFERENCES,
    mode: 'custom' as const,
    characterWpm: 25,
    effectiveWpm: 15,
  };
  const track = buildMorseTrack([{ text: 'E 🙂 E <AR>' }], {
    characterWpm: 25,
    effectiveWpm: 15,
    frequency: 600,
    volume: 0.4,
  });
  const summary = freeListeningSummary(track, preferences);
  expect(summary).toEqual({
    mode: 'free',
    contentMode: 'custom',
    entryCount: 3,
    characterWpm: 25,
    effectiveWpm: 15,
    toneHz: preferences.tone,
    customLabel: 'Your Morse text',
  });
  preferences.characterWpm = 30;
  expect(summary.characterWpm).toBe(25);
  expect(JSON.stringify(summary)).not.toContain('<AR>');
});

it('keeps the applied length setting only for the matching generator mode', () => {
  const preferences = { ...DEFAULT_PRACTICE_PREFERENCES, mode: 'numbers' as const, groupLength: 3 };
  const track = buildMorseTrack([{ text: '123 456' }], {
    characterWpm: 20,
    effectiveWpm: 10,
    frequency: 600,
    volume: 0.4,
  });
  expect(freeListeningSummary(track, preferences)).toMatchObject({
    contentMode: 'numbers',
    entryCount: 2,
    groupLength: 3,
  });
  expect(freeListeningSummary(track, preferences)).not.toHaveProperty('wordLength');
});
