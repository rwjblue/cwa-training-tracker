import { describe, expect, it, vi } from 'vitest';
import {
  listeningWordRound,
  qsoListeningSummary,
  qsoListeningTrack,
  qsoStationTones,
  wordListeningSummary,
  wordListeningTrack,
} from './listening-configuration';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';
import { generateQso, QSO_TEMPLATES } from './qso-content';
import { MORSE_SAMPLE_RATE, renderMorseWav, wordAtTime } from './morse-track';
import { retimedOccurrencePosition } from './listening-retiming';
import { practiceStory } from '../shared/listening-stories';
import { storyListeningTrack } from './listening-configuration';

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
      tonesHz: [975, 925],
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
      { tonesHz: [1000, 950] },
    );
  });
});

describe('bounded two-station QSO pitch', () => {
  const boundaries = [
    [300, 350],
    [450, 500],
    [950, 1000],
    [975, 925],
    [1000, 950],
  ] as const;

  it.each(boundaries)(
    'keeps preferred %i Hz and a distinct %i Hz station across every scenario and retime',
    (preferred, second) => {
      expect(qsoStationTones(preferred)).toEqual([preferred, second]);
      expect(Object.isFrozen(qsoStationTones(preferred))).toBe(true);
      for (const scenario of QSO_TEMPLATES) {
        const qso = generateQso(scenario.id, () => 0.25);
        const original = structuredClone(qso);
        const p = { ...DEFAULT_PRACTICE_PREFERENCES, tone: preferred };
        const first = qsoListeningTrack(qso, p);
        const next = qsoListeningTrack(qso, { ...p, characterWpm: 30, effectiveWpm: 12 });
        expect(first.summary.tonesHz).toEqual([preferred, second]);
        expect(next.summary.stations).toEqual(qso.stations);
        expect(next.summary.tonesHz).toEqual(first.summary.tonesHz);
        expect(first.track.items.map((item) => item.text)).toEqual(
          next.track.items.map((item) => item.text),
        );
        for (const track of [first.track, next.track]) {
          for (const [index, item] of track.items.entries()) {
            const tones = track.tones.filter((tone) => tone.at >= item.start && tone.at < item.end);
            expect(tones.length).toBeGreaterThan(0);
            expect(new Set(tones.map((tone) => tone.frequency))).toEqual(
              new Set([index % 2 ? second : preferred]),
            );
            if (index) expect(item.start - track.items[index - 1].end).toBeCloseTo(2, 8);
          }
        }
        for (const [index, word] of first.track.words.entries()) {
          const at = retimedOccurrencePosition(first.track, next.track, word.start + 0.001);
          expect(at).toBe(next.track.words[index].start);
          expect(wordAtTime(next.track, at)).toBe(index);
          expect(next.track.words[index].itemIndex).toBe(word.itemIndex);
        }
        expect(qso).toEqual(original);
      }
    },
  );

  it.each([299, 1001, NaN, Infinity])(
    'rejects an invalid preferred pitch %s before rendering',
    (tone) => {
      expect(() =>
        qsoListeningTrack(
          generateQso('short-contact', () => 0.25),
          { ...DEFAULT_PRACTICE_PREFERENCES, tone },
        ),
      ).toThrow('300 to 1000');
    },
  );

  it.each(boundaries)(
    'renders both frequency bands at preferred %i Hz, with bounded edges and silent handoffs',
    async (preferred, second) => {
      const qso = {
        ...generateQso('short-contact', () => 0.25),
        lines: ['T E', 'T E', 'T E', 'T E'],
      };
      const { track, summary } = qsoListeningTrack(qso, {
        ...DEFAULT_PRACTICE_PREFERENCES,
        tone: preferred,
      });
      const data = new DataView(await renderMorseWav(track).arrayBuffer());
      const sample = (index: number) => data.getInt16(44 + index * 2, true);
      const measured: number[] = [];
      for (const [index, item] of track.items.entries()) {
        const tone = track.tones.find((tone) => tone.at >= item.start && tone.at < item.end)!;
        const first = Math.round(tone.at * MORSE_SAMPLE_RATE);
        const last = Math.round((tone.at + tone.duration) * MORSE_SAMPLE_RATE) - 1;
        expect(sample(first)).toBe(0);
        expect(sample(last)).toBe(0);
        const crossings: number[] = [];
        let maxDelta = 0;
        let peak = 0;
        for (let frame = first + 1; frame <= last; frame++) {
          const before = sample(frame - 1);
          const value = sample(frame);
          peak = Math.max(peak, Math.abs(value));
          maxDelta = Math.max(maxDelta, Math.abs(value - before));
          if (
            frame > first + MORSE_SAMPLE_RATE * 0.005 &&
            frame < last - MORSE_SAMPLE_RATE * 0.005 &&
            before <= 0 &&
            value > 0
          )
            crossings.push(frame - 1 - before / (value - before));
        }
        expect(crossings.length).toBeGreaterThan(10);
        const hz =
          ((crossings.length - 1) * MORSE_SAMPLE_RATE) / (crossings.at(-1)! - crossings[0]);
        measured.push(hz);
        expect(hz).toBeCloseTo(summary.tonesHz[index % 2], 0);
        expect(peak).toBeGreaterThan(1000);
        expect(maxDelta).toBeLessThan(
          (peak * 2 * Math.PI * tone.frequency) / MORSE_SAMPLE_RATE + 25,
        );
        expect(sample(Math.round((item.end + 1) * MORSE_SAMPLE_RATE))).toBe(0);
      }
      expect(Math.abs(measured[0] - measured[1])).toBeGreaterThan(49);
      expect(measured[2]).toBeCloseTo(preferred, 0);
      expect(measured[3]).toBeCloseTo(second, 0);
      for (const tone of track.tones) {
        const end = Math.round((tone.at + tone.duration) * MORSE_SAMPLE_RATE) - 1;
        expect(sample(Math.round(tone.at * MORSE_SAMPLE_RATE))).toBe(0);
        expect(sample(end)).toBe(0);
      }
    },
  );

  it('leaves words and Stories at their own single preferred pitch', () => {
    const p = { ...DEFAULT_PRACTICE_PREFERENCES, tone: 1000 };
    const words = wordListeningTrack(listeningWordRound('custom', 'E T', false), p).track;
    const story = storyListeningTrack(practiceStory('story-trail'), p);
    for (const track of [words, story])
      expect(new Set(track.tones.map((tone) => tone.frequency))).toEqual(new Set([1000]));
  });
});
