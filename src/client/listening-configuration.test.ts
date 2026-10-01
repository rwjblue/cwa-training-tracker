import { describe, expect, it } from 'vitest';
import {
  listeningWordRound,
  qsoListeningSummary,
  wordListeningSummary,
} from './listening-configuration';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';
import { generateQso } from './qso-content';

describe('applied listening configurations', () => {
  it('labels the actual published round while newer source preferences await generation', () => {
    const round = listeningWordRound('common-qso', '', false);
    const selected = {
      ...DEFAULT_PRACTICE_PREFERENCES,
      wordList: 'common-30' as const,
      shuffleWords: true,
    };
    const summary = wordListeningSummary(round, selected);
    expect(summary).toMatchObject({
      mode: 'words',
      listId: 'common-qso',
      entryCount: 70,
      shuffle: false,
    });
    expect(summary).not.toHaveProperty('customLabel');
    expect(round.words[0]).toBe('VVV');
    expect(Object.isFrozen(round)).toBe(true);
    expect(Object.isFrozen(round.words)).toBe(true);
    selected.characterWpm = 35;
    expect(summary.characterWpm).toBe(DEFAULT_PRACTICE_PREFERENCES.characterWpm);
    expect(Object.isFrozen(summary)).toBe(true);
  });

  it('retains exact custom occurrences across retiming without including text in the summary', () => {
    const round = listeningWordRound('custom', 'cq cq <AR>', false);
    const before = [...round.words];
    const first = wordListeningSummary(round, DEFAULT_PRACTICE_PREFERENCES);
    const second = wordListeningSummary(round, {
      ...DEFAULT_PRACTICE_PREFERENCES,
      characterWpm: 30,
      effectiveWpm: 15,
      wordList: 'common-30',
      shuffleWords: true,
    });
    expect(round.words).toEqual(before);
    expect(round.words).toEqual(['CQ', 'CQ', '<AR>']);
    expect(first).toMatchObject({
      mode: 'words',
      listId: 'custom',
      customLabel: 'Your word list',
      entryCount: 3,
      shuffle: false,
    });
    expect(second).toMatchObject({ listId: 'custom', characterWpm: 30, effectiveWpm: 15 });
    expect(first).not.toHaveProperty('words');
    expect(first).not.toHaveProperty('text');
  });

  it('captures the actual contact and rendered tone pair without mutating its script or answers', () => {
    const qso = generateQso('short-contact', () => 0.25);
    const exact = structuredClone(qso);
    const summary = qsoListeningSummary(qso, {
      ...DEFAULT_PRACTICE_PREFERENCES,
      qsoScenario: 'pota',
      tone: 975,
    });
    expect(summary).toMatchObject({
      mode: 'qso',
      scenarioId: 'short-contact',
      stations: qso.stations,
      tonesHz: [975, 1000],
      transmissionGapSeconds: 2,
    });
    qsoListeningSummary(qso, { ...DEFAULT_PRACTICE_PREFERENCES, characterWpm: 30 });
    expect(qso).toEqual(exact);
    expect(summary).not.toHaveProperty('lines');
    expect(summary).not.toHaveProperty('copyFields');
    if (summary.mode !== 'qso') throw new Error('Expected a QSO summary.');
    expect(summary.stations).not.toBe(qso.stations);
    expect(Object.isFrozen(summary.stations)).toBe(true);
    expect(Object.isFrozen(summary.tonesHz)).toBe(true);
    expect(qsoListeningSummary(qso, { ...DEFAULT_PRACTICE_PREFERENCES, tone: 1000 })).toMatchObject(
      { tonesHz: [1000, 1000] },
    );
  });
});
