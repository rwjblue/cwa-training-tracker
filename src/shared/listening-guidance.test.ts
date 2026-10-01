import { expect, it } from 'vitest';
import { listeningGuidance } from './listening-guidance';
import type { PracticeExercise } from './plan';

const task = (title = 'Unidentified exercise', url?: string, notes = '') => ({
  title,
  notes,
  exercise: { type: 'audio', ...(url ? { url } : {}) } as PracticeExercise,
});

it.each([
  ['https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3', 'words'],
  ['https://cwa.cwops.org/wp-content/uploads/PR101_10.mp3', 'phrases'],
  ['https://cwa.cwops.org/wp-content/uploads/ING4_10.mp3', 'affixes'],
  ['https://cwops.org/wp-content/uploads/2022/07/qso201_10.mp3', 'qso'],
  ['https://cwa.cwops.org/wp-content/uploads/POTA101_10.mp3', 'pota'],
  ['https://cwops.org/wp-content/uploads/2020/06/CWT-201-20.mp3', 'cwt'],
  ['https://cwops.org/wp-content/uploads/2022/11/SS101_10.mp3', 'stories'],
])('selects the verified %s family despite a conflicting learner title', (url, family) => {
  const value = task('Short stories and prefixes', url, 'PR301-20');
  const before = JSON.stringify(value);
  const result = listeningGuidance(value)!;
  expect(result.family).toBe(family);
  expect(result.approach.length).toBeLessThan(180);
  expect(result.scratchpadPrompt).toMatch(/^Optional:/);
  expect(JSON.stringify(value)).toBe(before);
});

it.each([
  ['https://cwa.cwops.org/wp-content/uploads/QSO101_07.mp3', 'qso'],
  ['https://cwops.org/wp-content/uploads/2022/07/ss-09.111.mp3', 'stories'],
  ['https://cwops.org/wp-content/uploads/2022/07/ss-10.112.mp3', 'stories'],
  ['https://cwa.cwops.org/wp-content/uploads/PR303_30.mp3', 'phrases'],
])('uses public curriculum metadata for generic-title file %s', (url, family) => {
  expect(listeningGuidance(task('Copy 3: Official recording', url))?.family).toBe(family);
});

it.each(['DIS', 'IM', 'IN', 'IR', 'RE', 'UN', 'ED', 'ES', 'ING', 'LY'])(
  'recognizes the full %s affix reference, not a prose token',
  (code) => {
    expect(listeningGuidance(task(`${code.toLowerCase()}4 – 10`))?.family).toBe('affixes');
  },
);

it('uses conservative title/instruction references and a useful unknown fallback', () => {
  expect(listeningGuidance(task('PR101-10', undefined, 'WD101-10'))?.family).toBe('phrases');
  expect(listeningGuidance(task('Unidentified', undefined, 'Try QSO101_10'))?.family).toBe('qso');
  expect(listeningGuidance(task('Short stories'))?.family).toBe('stories');
  expect(listeningGuidance(task('Prefixes and suffixes'))?.family).toBe('affixes');
  for (const title of [
    'IN the park',
    'RE: homework',
    'Words learned',
    'PR 10',
    'storytelling',
    'Improve speed',
  ]) {
    const result = listeningGuidance(task(title, 'https://example.test/WD101_10.mp3'))!;
    expect(result.family).toBe('generic');
    expect(result.approach).toContain('exercise’s objective');
  }
});

it('supports meaning/fragments without overriding prescribed writing or reporting learned words', () => {
  const phrase = listeningGuidance(task('PR101-10'))!;
  const story = listeningGuidance(task('Short story'))!;
  expect(phrase.approach).toMatch(/meaning.*fragment/);
  expect(story.approach).toMatch(/meaning.*fragments/);
  expect(story.approach).toContain('when your instructions require it');
  expect(phrase.approach).toContain('if your exercise asks');
  expect(JSON.stringify([phrase, story])).not.toMatch(/Learned:|proficien|complet|passes/);
  phrase.approach = 'Caller mutation';
  expect(listeningGuidance(task('PR101-10'))?.approach).not.toBe('Caller mutation');
});

it.each(['sending', 'copy', 'morse-runner', 'external'])(
  'does not attach audio guidance to %s tools',
  (type) => {
    expect(
      listeningGuidance({
        title: 'PR101-10',
        notes: 'Short story',
        exercise: { type } as PracticeExercise,
      }),
    ).toBeUndefined();
  },
);
