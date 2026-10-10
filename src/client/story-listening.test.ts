import { describe, expect, it, vi } from 'vitest';
import {
  PRACTICE_STORIES,
  PRACTICE_PASSAGES,
  passageKind,
  practiceStory,
} from '../shared/listening-stories';
import { cleanMorseText } from './audio';
import {
  listeningStoryRound,
  storyListeningSummary,
  storyListeningTrack,
} from './listening-configuration';
import { retimedOccurrencePosition } from './listening-retiming';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';

describe('public authored story listening', () => {
  it('offers exactly the pinned fictional corpus with playable sentences', () => {
    expect(PRACTICE_STORIES.map((story) => [story.id, story.lines.length])).toEqual([
      ['story-trail', 5],
      ['story-radio', 12],
      ['story-light', 13],
    ]);
    expect(PRACTICE_STORIES.map((story) => story.title)).toEqual([
      'The trail marker (short)',
      'The quiet band (medium)',
      'A light across the lake (longer)',
    ]);
    expect(practiceStory('story-trail').lines[0]).toBe(
      'AT THE EDGE OF THE WOODS MAY FOUND A SMALL BLUE STONE.',
    );
    expect(practiceStory('story-light').lines.at(-1)).toBe(
      'THE LAKE WAS JUST AS WIDE AS BEFORE BUT THE FAR SHORE NO LONGER FELT SO FAR AWAY.',
    );
    for (const story of PRACTICE_STORIES)
      for (const sentence of story.lines) expect(cleanMorseText(sentence)).toBe(sentence);
    expect(() => practiceStory('official-course-story')).toThrow('public phrase');
  });
  it('uses one narrator, two-second handoffs and no trailing handoff for every story', () => {
    const p = {
      ...DEFAULT_PRACTICE_PREFERENCES,
      tone: 725,
      variableStoryPitch: false,
      storySettings: { ...DEFAULT_PRACTICE_PREFERENCES.storySettings, pauseAfterChunk: false },
    };
    for (const story of PRACTICE_STORIES) {
      const round = listeningStoryRound(story);
      const track = storyListeningTrack(round, p);
      expect(track.items.map((item) => item.text)).toEqual(story.lines);
      expect(new Set(track.tones.map((tone) => tone.frequency))).toEqual(new Set([725]));
      for (let index = 1; index < track.items.length; index++)
        expect(track.items[index].start - track.items[index - 1].end).toBeCloseTo(2, 9);
      expect(track.duration).toBe(track.items.at(-1)!.end);
      expect(storyListeningSummary(round, p)).toMatchObject({
        mode: 'story',
        storyId: story.id,
        toneHz: 725,
        sentenceGapSeconds: 2,
      });
    }
  });
  it('retimes exact repeated-word occurrences and sentence gaps without matching by text', () => {
    const story = listeningStoryRound(practiceStory('story-radio'));
    const first = storyListeningTrack(story, DEFAULT_PRACTICE_PREFERENCES);
    const next = storyListeningTrack(story, {
      ...DEFAULT_PRACTICE_PREFERENCES,
      characterWpm: 30,
      effectiveWpm: 17,
    });
    const repeated = first.words
      .map((word, index) => (word.text === 'THE' ? index : -1))
      .filter((index) => index >= 0);
    expect(repeated.length).toBeGreaterThan(2);
    for (const index of repeated)
      expect(retimedOccurrencePosition(first, next, first.words[index].start + 0.01)).toBe(
        next.words[index].start,
      );
    const end = first.items[2].end + 1;
    const lastWord = first.words.findLastIndex((word) => word.itemIndex === 2);
    expect(retimedOccurrencePosition(first, next, end)).toBe(next.words[lastWord].start);
    expect(retimedOccurrencePosition(first, next, first.duration)).toBe(next.duration);
  });
  it('samples one narrator pitch per generated story and retains it through replay and retiming', () => {
    const pitchRandom = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.999999);
    const story = practiceStory('story-trail');
    const round = listeningStoryRound(story, pitchRandom);
    const p = { ...DEFAULT_PRACTICE_PREFERENCES, variableStoryPitch: true, tone: 975 };
    const first = storyListeningTrack(round, p);
    const replay = storyListeningTrack(round, p);
    const faster = storyListeningTrack(round, { ...p, characterWpm: 30, effectiveWpm: 15 });
    expect(round.toneHz).toBe(500);
    expect(Object.isFrozen(round)).toBe(true);
    expect(replay).toEqual(first);
    for (const track of [first, faster]) {
      expect(track.items.map((item) => item.text)).toEqual(story.lines);
      expect(new Set(track.tones.map((tone) => tone.frequency))).toEqual(new Set([500]));
    }
    expect(storyListeningSummary(round, p)).toMatchObject({
      storyId: story.id,
      toneHz: 500,
    });
    expect(storyListeningSummary(round, p)).not.toHaveProperty('variablePitch');
    const fixed = storyListeningTrack(round, { ...p, variableStoryPitch: false });
    expect(new Set(fixed.tones.map((tone) => tone.frequency))).toEqual(new Set([975]));
    expect(fixed.words).toEqual(first.words);
    expect(fixed.items).toEqual(first.items);
    expect(fixed.duration).toBe(first.duration);
    expect(storyListeningTrack(round, p)).toEqual(first);
    expect(pitchRandom).toHaveBeenCalledTimes(1);
    const next = listeningStoryRound(story, pitchRandom);
    expect(next.toneHz).toBe(900);
    expect(round.toneHz).toBe(500);
    expect(pitchRandom).toHaveBeenCalledTimes(2);
  });
});

it('keeps bridge material playable, bounded by chunk length and uniquely addressable', () => {
  expect(new Set(PRACTICE_PASSAGES.map((item) => item.id)).size).toBe(PRACTICE_PASSAGES.length);
  for (const passage of PRACTICE_PASSAGES) {
    for (const line of passage.lines) {
      expect(cleanMorseText(line)).toBe(line);
      const count = line.split(' ').length;
      if (passageKind(passage.id) === 'phrases') expect(count).toBeLessThanOrEqual(3);
      if (passageKind(passage.id) === 'sentences') expect(count).toBeLessThanOrEqual(6);
    }
  }
});

it('renders a native chunk with no preceding/following material or trailing handoff', () => {
  const story = listeningStoryRound(practiceStory('sentences-radio'), () => 0);
  for (const index of [0, 3, story.lines.length - 1]) {
    const track = storyListeningTrack(story, DEFAULT_PRACTICE_PREFERENCES, index);
    expect(track.items).toHaveLength(1);
    expect(track.items[0].text).toBe(story.lines[index]);
    expect(track.items[0].start).toBe(0);
    expect(track.duration).toBe(track.items[0].end);
    expect(new Set(track.tones.map((tone) => tone.frequency))).toEqual(new Set([500]));
  }
  for (const index of [-1, 0.5, story.lines.length])
    expect(() => storyListeningTrack(story, DEFAULT_PRACTICE_PREFERENCES, index)).toThrow(
      'Choose a phrase',
    );
});

it('rejects a Story that exceeds the bounded native recording limit at very slow spacing', () => {
  expect(() =>
    storyListeningTrack(listeningStoryRound(practiceStory('story-light')), {
      ...DEFAULT_PRACTICE_PREFERENCES,
      characterWpm: 5,
      effectiveWpm: 3,
    }),
  ).toThrow('20 minutes');
});
