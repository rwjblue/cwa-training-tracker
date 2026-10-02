import { describe, expect, it } from 'vitest';
import {
  GeneratedListeningCollector,
  generatedListeningDetails,
  generatedListeningSpeeds,
  validateGeneratedListeningEvidence,
  validateGeneratedListeningSummary,
  type GeneratedListeningSummary,
} from './generated-listening';

const words = (
  change: Partial<Extract<GeneratedListeningSummary, { mode: 'words' }>> = {},
): Extract<GeneratedListeningSummary, { mode: 'words' }> => ({
  mode: 'words',
  listId: 'common-30',
  entryCount: 30,
  characterWpm: 20,
  effectiveWpm: 10,
  toneHz: 600,
  wordGapSeconds: 1,
  shuffle: true,
  repeat: true,
  spokenAnswers: false,
  ...change,
});
const qso = (): Extract<GeneratedListeningSummary, { mode: 'qso' }> => ({
  mode: 'qso',
  scenarioId: 'short-contact',
  stations: ['W1DPN', 'K2MVR'],
  tonesHz: [1000, 1000],
  characterWpm: 20,
  effectiveWpm: 10,
  transmissionGapSeconds: 2,
});
const free = (): Extract<GeneratedListeningSummary, { mode: 'free' }> => ({
  mode: 'free',
  contentMode: 'groups',
  entryCount: 12,
  groupLength: 5,
  toneHz: 600,
  characterWpm: 20,
  effectiveWpm: 10,
});
const envelope = (
  summaries: readonly GeneratedListeningSummary[] = [words()],
  overflow = false,
) => ({
  version: 1 as const,
  summaries,
  overflow,
});

describe('generated listening summaries', () => {
  it('retains each supported applied mode, including historical equal-pitch QSO facts', () => {
    const { groupLength: _groupLength, ...freeBase } = free();
    const configurations: GeneratedListeningSummary[] = [
      words(),
      words({ listId: 'common-qso', entryCount: 70, spokenAnswers: true }),
      words({ listId: 'custom', customLabel: ' Your word list ', entryCount: 2 }),
      qso(),
      free(),
      { ...free(), contentMode: 'numbers' },
      { ...freeBase, contentMode: 'words', wordLength: 'mixed' },
      {
        mode: 'free',
        contentMode: 'callsigns',
        entryCount: 12,
        toneHz: 600,
        characterWpm: 20,
        effectiveWpm: 10,
      },
      {
        mode: 'free',
        contentMode: 'custom',
        customLabel: 'Your Morse text',
        entryCount: 3,
        toneHz: 600,
        characterWpm: 20,
        effectiveWpm: 10,
      },
    ];
    const result = validateGeneratedListeningEvidence(envelope(configurations));
    expect(result.summaries).toHaveLength(9);
    expect(result.summaries[2]).toMatchObject({ customLabel: 'Your word list' });
    expect(result.summaries[3]).toMatchObject({ tonesHz: [1000, 1000] });
    expect(generatedListeningDetails(result).join('\n')).toContain('three repeats + spoken answer');
    expect(generatedListeningDetails(result).join('\n')).toContain('W1DPN / K2MVR');
    expect(generatedListeningDetails(result).join('\n')).toContain('mixed 2–8-letter words');
  });

  it.each([
    { characterWpm: 4 },
    { characterWpm: 61 },
    { effectiveWpm: 2 },
    { effectiveWpm: 21 },
    { characterWpm: NaN },
    { effectiveWpm: Infinity },
    { characterWpm: '20' },
    { toneHz: 299 },
    { toneHz: 1001 },
    { wordGapSeconds: -0.1 },
    { wordGapSeconds: 5.1 },
    { entryCount: 0 },
    { entryCount: 201 },
    { entryCount: 1.5 },
    { entryCount: 29 },
    { listId: 'common-qso', entryCount: 30 },
    { listId: 'common' },
    { listId: ['common-30'] },
    { shuffle: 'true' },
    { repeat: 1 },
    { spokenAnswers: null },
    { customLabel: 'Unallowed published label' },
  ])('rejects malformed word facts %j', (change) => {
    expect(() => validateGeneratedListeningSummary({ ...words(), ...change })).toThrow();
  });

  it.each([
    { scenarioId: 'story' },
    { scenarioId: ['short-contact'] },
    { stations: ['W1DPN'] },
    { stations: ['W1DPN', 'W1DPN'] },
    { stations: ['W1DPN', 'script text'] },
    { stations: ['W1DPN', 'k2mvr'] },
    { tonesHz: [600] },
    { tonesHz: [600, 1001] },
    { tonesHz: [600, '650'] },
    { transmissionGapSeconds: Infinity },
    { transmissionGapSeconds: 6 },
    { lines: ['PRIVATE SCRIPT'] },
  ])('rejects malformed QSO facts %j', (change) => {
    expect(() => validateGeneratedListeningSummary({ ...qso(), ...change })).toThrow();
  });

  it('requires applicable free generation settings and rejects unrelated selections', () => {
    for (const change of [
      { contentMode: 'unsupported' },
      { contentMode: ['groups'] },
      { groupLength: 0 },
      { groupLength: 11 },
      { groupLength: 1.5 },
      { wordLength: 'mixed' },
      { listId: 'common-qso' },
      { entryCount: 51 },
      { wordLength: undefined },
    ])
      expect(() => validateGeneratedListeningSummary({ ...free(), ...change })).toThrow();
    const { groupLength: _groupLength, ...base } = free();
    expect(() => validateGeneratedListeningSummary({ ...base, contentMode: 'words' })).toThrow();
    expect(() =>
      validateGeneratedListeningSummary({ ...base, contentMode: 'words', wordLength: 9 }),
    ).toThrow();
    expect(() => validateGeneratedListeningSummary({ ...base, contentMode: 'custom' })).toThrow();
    expect(
      validateGeneratedListeningSummary({ ...base, contentMode: 'words', wordLength: 8 }),
    ).toMatchObject({ wordLength: 8 });
  });

  it.each(['', 'x'.repeat(81), 'PRIVATE\nLIST', 'PRIVATE\u0000LIST'])(
    'rejects malformed descriptive labels %j',
    (customLabel) => {
      expect(() =>
        validateGeneratedListeningSummary(words({ listId: 'custom', customLabel })),
      ).toThrow(/label/);
    },
  );

  it.each([
    'text',
    'customText',
    'script',
    'lines',
    'url',
    'notes',
    'contentHash',
    'seconds',
    'accuracy',
    'qsoCount',
  ])('rejects private or invented summary field %s instead of stripping it', (key) => {
    for (const summary of [words(), qso(), free()])
      expect(() => validateGeneratedListeningSummary({ ...summary, [key]: 'PRIVATE' })).toThrow(
        /unsupported field/,
      );
  });

  it('rejects invalid envelope versions, lookalike booleans, empty/oversized arrays and inconsistent overflow', () => {
    for (const input of [
      { ...envelope(), version: 2 },
      { ...envelope(), overflow: 'false' },
      { ...envelope(), summaries: [] },
      { ...envelope(), script: 'PRIVATE' },
      envelope([words(), words()]),
      envelope([words()], true),
      envelope(Array.from({ length: 16 }, (_, index) => words({ toneHz: 300 + index * 25 }))),
    ])
      expect(() => validateGeneratedListeningEvidence(input)).toThrow();
  });
});

describe('played configuration collector', () => {
  it('collects only explicit applied configurations and freezes the earlier save snapshot', () => {
    const collector = new GeneratedListeningCollector();
    expect(collector.snapshot()).toBeUndefined();
    const applied = words({ listId: 'custom', customLabel: ' Your word list ', entryCount: 2 });
    collector.record(applied);
    collector.record(words({ listId: 'custom', customLabel: 'Your word list', entryCount: 2 }));
    const firstSave = collector.snapshot()!;
    collector.record(words({ characterWpm: 25 }));
    const selectedButUnplayed = words({ characterWpm: 30 });
    expect(collector.snapshot()?.summaries).toHaveLength(2);
    expect(collector.snapshot()?.summaries).not.toContainEqual(selectedButUnplayed);
    expect(firstSave.summaries).toHaveLength(1);
    expect(Object.isFrozen(firstSave)).toBe(true);
    expect(Object.isFrozen(firstSave.summaries)).toBe(true);
    expect(Object.isFrozen(firstSave.summaries[0])).toBe(true);
    collector.reset();
    expect(collector.snapshot()).toBeUndefined();
    expect(firstSave.summaries).toHaveLength(1);
  });

  it('retains actual contact pairs without retaining scripts and detaches nested snapshots', () => {
    const collector = new GeneratedListeningCollector();
    const applied = qso();
    collector.record(applied);
    (applied.stations as [string, string])[0] = 'N3LHT';
    collector.record(applied);
    const saved = collector.snapshot()!;
    expect(saved.summaries).toHaveLength(2);
    expect(saved.summaries[0]).toMatchObject({ stations: ['W1DPN', 'K2MVR'] });
    const first = saved.summaries[0] as Extract<GeneratedListeningSummary, { mode: 'qso' }>;
    expect(Object.isFrozen(first.stations)).toBe(true);
    expect(Object.isFrozen(first.tonesHz)).toBe(true);
    expect(saved.summaries[0]).not.toHaveProperty('lines');
  });

  it('deduplicates replay at the limit and visibly records additional played configurations', () => {
    const collector = new GeneratedListeningCollector();
    for (let index = 0; index < 15; index++) collector.record(words({ toneHz: 300 + index * 25 }));
    collector.record(words({ toneHz: 300 }));
    expect(collector.snapshot()?.overflow).toBe(false);
    collector.record(words({ toneHz: 900 }));
    const saved = collector.snapshot()!;
    expect(saved.summaries).toHaveLength(15);
    expect(saved.overflow).toBe(true);
    expect(validateGeneratedListeningEvidence(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(generatedListeningDetails(saved).at(-1)).toContain(
      'Additional generated configurations were played',
    );
    expect(generatedListeningSpeeds(saved)).toEqual({});
  });

  it('derives both single speeds only from a complete uniform actual pair', () => {
    expect(generatedListeningSpeeds(envelope([words(), qso(), free()]))).toEqual({
      characterWpm: 20,
      effectiveWpm: 10,
    });
    expect(
      generatedListeningSpeeds(
        validateGeneratedListeningEvidence(envelope([words(), words({ effectiveWpm: 12 })])),
      ),
    ).toEqual({});
    expect(
      generatedListeningSpeeds(
        validateGeneratedListeningEvidence(envelope([words(), words({ characterWpm: 25 })])),
      ),
    ).toEqual({});
  });
});

it('keeps strict public Story identities separate from QSO stations and private scripts', () => {
  const story = {
    mode: 'story',
    storyId: 'story-trail',
    characterWpm: 28,
    effectiveWpm: 14,
    toneHz: 650,
    sentenceGapSeconds: 2,
  };
  const checked = validateGeneratedListeningSummary(story);
  expect(checked).toEqual(story);
  const collector = new GeneratedListeningCollector();
  collector.record(checked);
  expect(generatedListeningDetails(collector.snapshot()!)[0]).toContain('The trail marker (short)');
  expect(generatedListeningDetails(collector.snapshot()!)[0]).toContain('narrator 650 Hz');
  expect(generatedListeningSpeeds(collector.snapshot()!)).toEqual({
    characterWpm: 28,
    effectiveWpm: 14,
  });
  for (const change of [
    { storyId: 'official-story' },
    { stations: ['Narrator', 'Narrator'] },
    { script: 'PRIVATE' },
    { toneHz: 1001 },
    { sentenceGapSeconds: 6 },
    { effectiveWpm: 29 },
  ])
    expect(() => validateGeneratedListeningSummary({ ...story, ...change })).toThrow();
});

it('retains exact 51–60 WPM facts without rounding or dropping effective speed', () => {
  for (const speed of [51, 55, 60]) {
    const summary = {
      ...words(),
      characterWpm: speed,
      effectiveWpm: speed,
      toneHz: 617,
      wordGapSeconds: 0.3,
    };
    expect(validateGeneratedListeningSummary(summary)).toEqual(summary);
    expect(generatedListeningSpeeds(envelope([summary]))).toEqual({
      characterWpm: speed,
      effectiveWpm: speed,
    });
  }
});
