import { describe, expect, it } from 'vitest';
import {
  copyToneHz,
  createCopyAttempt,
  defaultCopyRecipe,
  submitCopyAnswer,
} from './copy-practice';
import { copyAttemptReportDetails, copyAttemptSessionFields } from './copy-report';
import { weeklyReport } from './plan';
import { DEFAULT_PROFILE, validatePracticeSession } from './training';

describe('native copy report evidence', () => {
  it('carries the selected group score and both comparisons while preserving legacy reports', () => {
    const initial = createCopyAttempt(
      { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 2 },
      { id: 'group-score', seed: 'group-score', now: '2026-09-28T12:00:00.000Z' },
    );
    const answer = `${initial.targets[0]} XYZ`;
    for (const scoringVersion of ['native-copy-v1', 'native-copy-v2'] as const) {
      const attempt = submitCopyAnswer({ ...initial, scoringVersion }, answer, {
        now: '2026-09-28T12:01:00.000Z',
      });
      const entry = validatePracticeSession({
        ...copyAttemptSessionFields(attempt),
        date: '2026-09-28',
        kind: 'icr',
        notes: '',
      });
      const current = scoringVersion === 'native-copy-v2';
      expect(entry.accuracy).toBe(current ? 50 : 33.4);
      const report = weeklyReport([entry], DEFAULT_PROFILE, entry.date, entry.date);
      expect(report).toContain(
        current
          ? 'Native copy: 3 edits · 50% errors · 50% accuracy'
          : 'Native copy: 4 edits · 66.6% errors · 33.4% accuracy',
      );
      if (current)
        expect(report).toContain(
          'Scoring comparisons: 3 grouped edits · 4 whole-text edits · lower count used',
        );
      else expect(report).not.toContain('Scoring comparisons:');
    }
  });

  it('reports reproducible group and submitted-trial pitches while legacy tones stay fixed', () => {
    const groups = createCopyAttempt(
      { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 2 },
      { id: 'group-tones', seed: 'group-tones', now: '2026-09-28T12:00:00.000Z' },
    );
    expect(copyAttemptReportDetails(groups)).toContain(
      `Tone: random 500–900 Hz per group · recording group tones (Hz): ${copyToneHz(groups, 0, 0)}, ${copyToneHz(groups, 0, 1)}`,
    );
    let words = createCopyAttempt(defaultCopyRecipe('words'), {
      id: 'word-tones',
      seed: 'word-tones',
      now: '2026-09-28T12:00:00.000Z',
    });
    words = submitCopyAnswer(words, words.targets[0], { now: '2026-09-28T12:00:01.000Z' });
    expect(copyAttemptReportDetails(words)).toContain(
      `Tone: random 500–900 Hz per word · submitted trial tones (Hz): ${copyToneHz(words, 0)}`,
    );
    const { toneMode: _toneMode, ...legacyRecipe } = groups.recipe;
    expect(copyAttemptReportDetails({ ...groups, recipe: legacyRecipe })).toContain(
      'Tone: fixed 600 Hz',
    );
  });

  it('prints individual whole attempts, their actual speeds and explicit partial status', () => {
    const recipe = {
      ...defaultCopyRecipe('words'),
      wordCollection: 'short' as const,
      maxWordLength: 1,
    };
    let first = createCopyAttempt(recipe, {
      id: 'first',
      seed: 'report-first',
      now: '2026-09-28T12:00:00.000Z',
    });
    first = submitCopyAnswer(first, first.targets[0], { now: '2026-09-28T12:00:10.000Z' });
    first = submitCopyAnswer(first, first.targets[1], {
      replayCount: 1,
      now: '2026-09-28T12:00:20.000Z',
    });
    first = {
      ...first,
      status: 'abandoned',
      audioSeconds: 8,
      answerSeconds: 5,
      interruptionCount: 1,
    };
    let second = createCopyAttempt(
      { ...recipe, characterWpm: 30, effectiveWpm: 20 },
      {
        id: 'second',
        seed: 'report-second',
        now: '2026-09-28T13:00:00.000Z',
      },
    );
    second = submitCopyAnswer(second, '?', { now: '2026-09-28T13:00:10.000Z' });
    second = { ...second, status: 'abandoned', audioSeconds: 4, answerSeconds: 2 };
    const entries = [first, second].map((attempt) =>
      validatePracticeSession({
        ...copyAttemptSessionFields(attempt),
        date: '2026-09-28',
        kind: 'icr',
        notes: '',
      }),
    );
    const report = weeklyReport(entries, DEFAULT_PROFILE, '2026-09-28', '2026-09-28');
    expect(report).toContain('Word copy · partial · attempt first');
    expect(report).toContain('Actual character/effective WPM: 25/10, 25/11');
    expect(report).toContain(
      '2/2 submitted answers correct · 2/25 trials answered · 23 points · 11 WPM highest correctly copied',
    );
    expect(report).toContain('1 correct without replay · 1 replays');
    expect(report).toContain('Interrupted 1 time(s).');
    expect(report).toContain('Word copy · partial · attempt second');
    expect(report).toContain('Actual character/effective WPM: 30/20');
    expect(report).toContain(
      '0/1 submitted answers correct · 1/25 trials answered · 0 points · no correctly copied speed',
    );
    expect(report).toContain('Measured time: 8s audio + 5s answering + 0s review');
    expect(report).not.toContain('20 WPM highest correctly copied');
    expect(weeklyReport(entries, DEFAULT_PROFILE, '2026-09-29', '2026-09-29')).not.toContain(
      'attempt first',
    );
  });

  it('labels revealed group evidence and does not manufacture unanswered accuracy', () => {
    const initial = createCopyAttempt(
      { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 1 },
      {
        id: 'groups',
        seed: 'report-group',
        now: '2026-09-28T12:00:00.000Z',
      },
    );
    const completed = {
      ...submitCopyAnswer(initial, initial.targets[0], { now: '2026-09-28T12:01:00.000Z' }),
      revealCount: 1,
    };
    expect(copyAttemptReportDetails(completed).join('\n')).toContain(
      '0 edits · 0% errors · 100% accuracy',
    );
    expect(copyAttemptReportDetails(completed)).toContain('Answers revealed 1 time(s).');
    expect(copyAttemptReportDetails({ ...initial, status: 'abandoned' })).toContain(
      'No answers submitted; no accuracy or copied-speed result.',
    );
  });
});
