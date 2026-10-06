import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PRACTICE_STORIES, practiceStory } from '../shared/listening-stories';
import {
  listeningQsoRound,
  listeningStoryRound,
  listeningWordRound,
  qsoListeningTrack,
  storyListeningTrack,
  wordListeningTrack,
} from './listening-configuration';
import { listeningShareRoute, readListeningShare } from './listening-share';
import { DEFAULT_PRACTICE_PREFERENCES, listeningPreferences } from './practice-preferences';
import {
  generateQso,
  qsoFromRecipe,
  QSO_CALLSIGNS,
  QSO_NAMES,
  QSO_LOCATIONS,
  QSO_RADIOS,
  QSO_ANTENNAS,
  QSO_REPORTS,
  QSO_TEMPLATES,
} from './qso-content';
import { WORD_LISTS } from './word-content';

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const defaults = DEFAULT_PRACTICE_PREFERENCES;
const recipe = '1.1.0.0.0.0.0.0.0.0.19.0.1.1.1.1.0.1.1.1t.1';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('public listening URLs', () => {
  it('shares only the validated public QSO workspace, without copy answers or reveal state', () => {
    const qso = listeningQsoRound(qsoFromRecipe(recipe), () => 0.5);
    const url = listeningShareRoute({ ...defaults, tool: 'qso' }, { qso, copyMode: true });
    expect(url).toContain('view=copy');
    const shared = readListeningShare(`${url}&answers=SYNTHETICPRIVATE&revealed=1`);
    expect(shared.copyMode).toBe(true);
    expect(shared.qso).toEqual(qso);
    expect(listeningShareRoute(shared.preferences, shared)).toBe(url);
    expect(shared).not.toHaveProperty('answers');
    expect(shared).not.toHaveProperty('revealed');
    for (const view of ['', 'listen', 'COPY', 'unknown', '1'])
      expect(readListeningShare(`#practice/qso?view=${view}`).copyMode).toBe(false);
    expect(readListeningShare('#practice/words?view=copy').copyMode).toBeUndefined();
  });
  it('replays every exact generated exchange, including prior-call exclusion, season and station pitches', () => {
    const random = seededRandom(2026);
    let previous: readonly string[] = [];
    for (const scenario of QSO_TEMPLATES) {
      for (let round = 0; round < 8; round++) {
        const qso = listeningQsoRound(generateQso(scenario.id, random, previous), random);
        const p = {
          ...defaults,
          tool: 'qso' as const,
          qsoScenario: scenario.id,
          qsoSettings: {
            ...defaults.qsoSettings,
            characterWpm: 27,
            effectiveWpm: 13,
            tone: 975,
            hideTrainerText: false,
          },
          variableQsoPitch: round % 2 === 0,
          volume: 73,
        };
        const url = listeningShareRoute(p, { qso });
        const shared = readListeningShare(url, { ...defaults, qsoScenario: 'repeat', volume: 1 });
        expect(shared.error).toBeUndefined();
        expect(shared.qso).toEqual(qso);
        expect(qsoListeningTrack(shared.qso!, listeningPreferences(shared.preferences))).toEqual(
          qsoListeningTrack(qso, listeningPreferences(p)),
        );
        expect(listeningShareRoute(shared.preferences, { qso: shared.qso })).toBe(url);
        expect(qso.stations.some((call) => previous.includes(call))).toBe(false);
        previous = qso.stations;
      }
    }
  });

  it('replays built-in word order and occurrence pitches while retaining the next-round shuffle choice', () => {
    for (const list of ['common-qso', 'common-30'] as const) {
      for (const shuffle of [false, true]) {
        const words = listeningWordRound(list, '', shuffle, seededRandom(99), seededRandom(123));
        const p = {
          ...defaults,
          tool: 'words' as const,
          wordList: list,
          shuffleWords: !shuffle,
          variableWordPitch: shuffle,
          wordGap: 1.7,
          repeatList: false,
          spokenAnswers: true,
          characterWpm: 29,
          effectiveWpm: 14,
          tone: 987,
          volume: 52,
          voiceVolume: 27,
          hideTrainerText: false,
        };
        const url = listeningShareRoute(p, { words });
        const shared = readListeningShare(url, { ...defaults, wordList: 'custom' });
        expect(shared.error).toBeUndefined();
        expect(shared.words).toEqual(words);
        expect(shared.preferences).toMatchObject(p);
        expect(wordListeningTrack(shared.words!, shared.preferences)).toEqual(
          wordListeningTrack(words, p),
        );
        expect(listeningShareRoute(shared.preferences, { words: shared.words })).toBe(url);
      }
    }
  });

  it('shares every story identity, narrator pitch and independently remembered sound settings', () => {
    for (const item of PRACTICE_STORIES) {
      const story = listeningStoryRound(practiceStory(item.id), () => 0.999);
      const p = {
        ...defaults,
        tool: 'stories' as const,
        variableStoryPitch: false,
        storySettings: {
          ...defaults.storySettings,
          storyId: item.id,
          characterWpm: 31,
          effectiveWpm: 17,
          tone: 933,
          hideTrainerText: false,
        },
      };
      const shared = readListeningShare(listeningShareRoute(p, { story }));
      expect(shared.error).toBeUndefined();
      expect(shared.story).toEqual(story);
      expect(storyListeningTrack(shared.story!, listeningPreferences(shared.preferences))).toEqual(
        storyListeningTrack(story, listeningPreferences(p)),
      );
    }
  });

  it('keeps custom text out of links and opens an explicit public fallback on other devices', () => {
    const words = listeningWordRound('custom', 'PRIVATE NOTE N1RWJ TEST', true, seededRandom(99));
    const p = { ...defaults, wordList: 'custom' as const };
    const url = listeningShareRoute(p, { words });
    expect(url).not.toMatch(/PRIVATE|NOTE|N1RWJ|order=|pitches=|sourceText|answer|seconds|user/i);
    const shared = readListeningShare(url, p);
    expect(shared.preferences.wordList).toBe('common-qso');
    expect(shared.words).toBeUndefined();
    expect(shared.error).toContain('Custom words stay private');
  });

  it('retains scoped device preferences for bare links and bounds only whitelisted public options', () => {
    const current = {
      ...defaults,
      wordGap: 2.3,
      characterWpm: 33,
      effectiveWpm: 15,
      qsoSettings: { ...defaults.qsoSettings, characterWpm: 37 },
      volume: 75,
      wordList: 'custom' as const,
    };
    expect(readListeningShare('#practice/words', current).preferences).toEqual(current);
    expect(readListeningShare('#practice/qso', current).preferences).toEqual({
      ...current,
      tool: 'qso',
    });
    expect(
      readListeningShare(
        '#practice/words?cwpm=10&ewpm=20&tone=9000&volume=-1&gap=NaN&customText=PRIVATE&tool=qso&userId=bad',
        current,
      ).preferences,
    ).toMatchObject({
      tool: 'words',
      characterWpm: 10,
      effectiveWpm: 10,
      tone: current.tone,
      volume: 75,
      wordGap: 2.3,
      wordList: 'custom',
    });
  });

  it('reports malformed or unsupported exact recipes instead of silently replaying another recording', () => {
    const qso = listeningQsoRound(qsoFromRecipe(recipe), () => 0.5);
    const valid = listeningShareRoute({ ...defaults, tool: 'qso' }, { qso });
    for (const bad of [
      valid.replace('v=1', 'v=2'),
      valid.replace('qso=1.', 'qso=2.'),
      valid.replace('scenario=ragchew', 'scenario=pota'),
      valid.replace(/pitches=[^&]+/, 'pitches=0.0'),
      '#practice/qso?v=1&qso=oops',
      '#practice/stories?v=1&pitch=oops',
      '#practice/stories?v=1&story=unknown&pitch=jk',
      '#practice/stories?v=1&pitch=jk',
    ]) {
      const parsed = readListeningShare(bad);
      expect(parsed.error).toContain('prepared instead');
      expect(parsed.qso).toBeUndefined();
      expect(parsed.story).toBeUndefined();
    }
    const words = listeningWordRound(
      'common-30',
      '',
      false,
      () => 0.5,
      () => 0.5,
    );
    const wordLink = listeningShareRoute({ ...defaults, wordList: 'common-30' }, { words });
    const duplicate = wordLink.replace('order=0.1.', 'order=0.0.');
    expect(readListeningShare(duplicate).error).toContain('invalid list order');
    expect(readListeningShare(duplicate).words).toBeUndefined();
    for (const bad of [
      wordLink.replace('list=common-30', 'list=unknown'),
      wordLink.replace('list=common-30&', ''),
    ]) {
      expect(readListeningShare(bad).error).toContain('unknown public list');
      expect(readListeningShare(bad).words).toBeUndefined();
    }
    expect(() => qsoFromRecipe(recipe.replace('1.1.0.', '01.1.0.'))).toThrow('invalid');
    expect(() => qsoFromRecipe(recipe.replace('.19.', '.1.'))).toThrow('invalid');
  });

  it('keeps v1 public pool positions, authored text and templates compatible with published links', () => {
    // Existing entries/templates need a retained v1 renderer before these hashes change.
    // This is an authored compatibility fixture, not an expected random sequence.
    expect({
      pools: digest([
        QSO_CALLSIGNS,
        QSO_NAMES,
        QSO_LOCATIONS,
        QSO_RADIOS,
        QSO_ANTENNAS,
        QSO_REPORTS,
      ]),
      templates: digest(
        QSO_TEMPLATES.map((_, index) => qsoFromRecipe(recipe.replace(/^1\.1\./, `1.${index}.`))),
      ),
      words: digest(WORD_LISTS),
      stories: digest(PRACTICE_STORIES),
    }).toMatchInlineSnapshot(`
      {
        "pools": "d1385bbd7d0579824e979ac9d540a0ab65ee040f60c752bd68283ee64e47942b",
        "stories": "d0d9f0309758d57f974cc90b5ecc40141a6079d08cdbca7355e51f4bab4104d3",
        "templates": "c5dd417ec2a02fc3e31967d4ffa2a7b2eccd1f55e35672f960c3d4af85814f45",
        "words": "a1be5e33eacbe8fb46870a237a67d5816d60018b288d78555963eb6b34fe547e",
      }
    `);
  });
});
