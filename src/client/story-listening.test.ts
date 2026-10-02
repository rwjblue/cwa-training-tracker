import { describe, expect, it } from 'vitest';
import { PRACTICE_STORIES, practiceStory } from '../shared/listening-stories';
import { cleanMorseText } from './audio';
import { storyListeningSummary, storyListeningTrack } from './listening-configuration';
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
    expect(() => practiceStory('official-course-story')).toThrow('three public');
  });
  it('uses one narrator, two-second handoffs and no trailing handoff for every story', () => {
    const p = { ...DEFAULT_PRACTICE_PREFERENCES, tone: 725 };
    for (const story of PRACTICE_STORIES) {
      const track = storyListeningTrack(story, p);
      expect(track.items.map((item) => item.text)).toEqual(story.lines);
      expect(new Set(track.tones.map((tone) => tone.frequency))).toEqual(new Set([725]));
      for (let index = 1; index < track.items.length; index++)
        expect(track.items[index].start - track.items[index - 1].end).toBeCloseTo(2, 9);
      expect(track.duration).toBe(track.items.at(-1)!.end);
      expect(storyListeningSummary(story, p)).toMatchObject({
        mode: 'story',
        storyId: story.id,
        toneHz: 725,
        sentenceGapSeconds: 2,
      });
    }
  });
  it('retimes exact repeated-word occurrences and sentence gaps without matching by text', () => {
    const story = practiceStory('story-radio');
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
});

it('rejects a Story that exceeds the bounded native recording limit at very slow spacing', () => {
  expect(() =>
    storyListeningTrack(practiceStory('story-light'), {
      ...DEFAULT_PRACTICE_PREFERENCES,
      characterWpm: 5,
      effectiveWpm: 3,
    }),
  ).toThrow('20 minutes');
});
