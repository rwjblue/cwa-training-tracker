import { describe, expect, it, vi } from 'vitest';
import {
  listeningWordRound,
  qsoListeningSummary,
  wordListeningSummary,
  wordListeningTrack,
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

  it('generates each next round from the validated source with independent shuffle draws', () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValue(0.75);
    const first = listeningWordRound('custom', 'cq e cq <AR>', true, random);
    const retained = [...first.words];
    const second = listeningWordRound('custom', 'cq e cq <AR>', true, random);
    expect(random).toHaveBeenCalledTimes(6);
    for (const round of [first, second]) {
      expect([...round.words].sort()).toEqual(['<AR>', 'CQ', 'CQ', 'E']);
      expect(round.shuffle).toBe(true);
      expect(Object.isFrozen(round.words)).toBe(true);
    }
    expect(first.words).toEqual(retained);
    expect(second).not.toBe(first);
    expect(listeningWordRound('custom', 'cq e cq <AR>', false).words).toEqual([
      'CQ',
      'E',
      'CQ',
      '<AR>',
    ]);
    const opening = listeningWordRound('common-qso', '', true, random);
    expect(opening.words[0]).toBe('VVV');
    expect(opening.words).toHaveLength(70);
  });

  it('builds bounded next-round timelines from actual occurrence order and current speed', () => {
    const round = listeningWordRound('custom', 'e e <AR>', false);
    const p = {
      ...DEFAULT_PRACTICE_PREFERENCES,
      characterWpm: 50,
      effectiveWpm: 50,
      wordGap: 0,
      repeatList: true,
      shuffleWords: true,
    };
    const result = wordListeningTrack(round, p);
    expect(result.track.items.map((item) => item.text)).toEqual(['E', 'E', '<AR>']);
    expect(result.track.words.map((word) => word.itemIndex)).toEqual([0, 1, 2]);
    expect(result.track.items[1].start).toBeGreaterThan(result.track.words[0].end);
    expect(result.summary).toMatchObject({
      shuffle: false,
      repeat: true,
      characterWpm: 50,
      entryCount: 3,
    });
    expect(() =>
      wordListeningTrack(listeningWordRound('custom', 'PARIS '.repeat(200), false), {
        ...p,
        characterWpm: 5,
        effectiveWpm: 5,
        wordGap: 5,
      }),
    ).toThrow('20 minutes');
  });

  it('retains exact custom source identity without putting private text in played summaries', () => {
    const source = ' e\tE <AR> ';
    const round = listeningWordRound('custom', source, true, () => 0);
    expect(round.sourceText).toBe(source);
    expect([...round.words].sort()).toEqual(['<AR>', 'E', 'E']);
    expect(Object.isFrozen(round)).toBe(true);
    expect(listeningWordRound('custom', 'E E <AR> T', true, () => 0).sourceText).not.toBe(
      round.sourceText,
    );
    expect(wordListeningSummary(round, DEFAULT_PRACTICE_PREFERENCES)).not.toHaveProperty(
      'sourceText',
    );
    expect(listeningWordRound('common-qso', source, false)).not.toHaveProperty('sourceText');
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
