import { describe, expect, it } from 'vitest';
import { RecordingCoverage, type RecordingSource } from './recording-coverage';

const source = (durationSeconds = 100, sourceId = 'first'): RecordingSource => ({
  url: 'https://example.org/lesson.mp3',
  durationSeconds,
  sourceId,
});

const count = (coverage: RecordingCoverage, recording: RecordingSource) =>
  coverage
    .measurements(recording.url)
    ?.durations.reduce((sum, item) => sum + item.completedPasses, 0);

describe('recording-local listening passes', () => {
  it('counts accumulated 1x hearing immediately, including repeated portions without an end event', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 50, 1);
    coverage.hear(recording, 50, 1);
    expect(coverage.snapshot().recordingProgress?.listenedSeconds).toBe(100);
    expect(coverage.snapshot().recordingOutcome).toBeUndefined();
    expect(coverage.measurements(recording.url)).toEqual({
      version: 2,
      method: 'native-1x-time',
      durations: [{ durationSeconds: 100, completedPasses: 1 }],
    });
  });

  it.each([
    { duration: 120, listened: 114.999, completed: 0 },
    { duration: 120, listened: 115, completed: 1 },
    { duration: 60, listened: 54.999, completed: 0 },
    { duration: 60, listened: 55, completed: 1 },
    { duration: 10, listened: 4.999, completed: 0 },
    { duration: 10, listened: 5, completed: 1 },
    { duration: 0.5, listened: 0.249, completed: 0 },
    { duration: 0.5, listened: 0.25, completed: 1 },
  ])('bounds tolerance for $listened of $duration seconds', ({ duration, listened, completed }) => {
    const coverage = new RecordingCoverage();
    const recording = source(duration);
    coverage.observe(recording, true);
    coverage.hear(recording, listened, 1);
    expect(count(coverage, recording)).toBe(completed);
  });

  it('spends tolerance once against cumulative hearing within a still-open source', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 95, 1);
    expect(count(coverage, recording)).toBe(1);
    coverage.observe(recording, true); // Reanchor, seek and resume preserve this owner.
    coverage.hear(recording, 95, 1);
    expect(count(coverage, recording)).toBe(1);
    coverage.hear(recording, 5, 1);
    expect(count(coverage, recording)).toBe(2);
  });

  it('finalizes once and gives a deliberate independent replay its own tolerance', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 95, 1);
    expect(coverage.finalize(recording, false)).toBeUndefined();
    expect(count(coverage, recording)).toBe(1);
    expect(coverage.finalize(recording, true)).toMatchObject({ id: 1, completed: true });
    expect(coverage.finalize(recording, true)).toBeUndefined();
    coverage.observe(recording); // Metadata refresh cannot start replay.
    coverage.hear(recording, 100, 1);
    expect(count(coverage, recording)).toBe(1);
    coverage.observe(recording, true);
    expect(coverage.snapshot().recordingProgress?.listenedSeconds).toBe(0);
    coverage.hear(recording, 95, 1);
    expect(count(coverage, recording)).toBe(2);
    expect(coverage.finalize(recording, true)).toMatchObject({ id: 2, completed: true });
    expect(count(coverage, recording)).toBe(2);
  });

  it('retains measured zero for partial hearing and commits earned passes on source discard', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 50, 1);
    expect(count(coverage, recording)).toBe(0);
    coverage.discard(recording);
    expect(count(coverage, recording)).toBe(0);
    coverage.observe(recording, true);
    coverage.hear(recording, 95, 1);
    coverage.discard(recording);
    expect(count(coverage, recording)).toBe(1);
    expect(coverage.snapshot().recordingProgress).toBeUndefined();
  });

  it.each([0.1, 0.5, 1])('cannot complete an unheard short source of %s seconds', (duration) => {
    const coverage = new RecordingCoverage();
    const recording = source(duration);
    coverage.observe(recording, true);
    expect(coverage.finalize(recording, true)).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(coverage.measurements(recording.url)).toBeUndefined();
  });

  it.each([undefined, 0, -1, Number.NaN, Infinity, 86401])(
    'cannot manufacture a denominator from duration %s',
    (invalid) => {
      const coverage = new RecordingCoverage();
      const recording = { ...source(), durationSeconds: invalid };
      coverage.observe(recording, true);
      coverage.hear(recording, 100, 1);
      expect(coverage.finalize(recording, true)).toMatchObject({
        completed: false,
        reason: 'duration-unavailable',
      });
      expect(coverage.measurements(recording.url)).toBeUndefined();
    },
  );

  it('does not combine partial hearing across loaded source generations or accept a retired source', () => {
    const coverage = new RecordingCoverage();
    const first = source();
    coverage.observe(first, true);
    coverage.hear(first, 50, 1);
    const second = source(100, 'replacement');
    coverage.observe(second, true);
    coverage.hear(first, 50, 1);
    expect(coverage.finalize(first, true)).toBeUndefined();
    coverage.hear(second, 50, 1);
    expect(coverage.finalize(second, true)).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(count(coverage, first)).toBe(0);
  });

  it('keeps independent URLs and committed exact-duration groups across replacements', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 100, 1);
    coverage.finalize(recording, true);
    const other = { ...source(60, 'other'), url: 'https://example.org/other.mp3' };
    coverage.observe(other, true);
    coverage.hear(other, 30, 1);
    const changed = source(120);
    coverage.observe(changed, true);
    coverage.hear(changed, 115, 1);
    expect(coverage.measurements(recording.url)?.durations).toEqual([
      { durationSeconds: 100, completedPasses: 1 },
      { durationSeconds: 120, completedPasses: 1 },
    ]);
    expect(coverage.measurements(other.url)?.durations).toEqual([
      { durationSeconds: 60, completedPasses: 0 },
    ]);
  });

  it('revises provisional pass counts with native duration estimates and freezes only final facts', () => {
    const coverage = new RecordingCoverage();
    let recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 96, 1);
    const provisional = coverage.measurements(recording.url)!;
    expect(count(coverage, recording)).toBe(1);
    recording = source(120);
    coverage.refineDuration(recording);
    coverage.observe(recording, true);
    expect(coverage.snapshot().recordingProgress?.listenedSeconds).toBe(96);
    expect(coverage.measurements(recording.url)?.durations).toEqual([
      { durationSeconds: 120, completedPasses: 0 },
    ]);
    coverage.hear(recording, 19, 1);
    expect(count(coverage, recording)).toBe(1);
    coverage.finalize(recording, true);
    coverage.refineDuration(source(130));
    expect(coverage.measurements(recording.url)?.durations).toContainEqual({
      durationSeconds: 120,
      completedPasses: 1,
    });
    expect(provisional.durations).toEqual([{ durationSeconds: 100, completedPasses: 1 }]);
  });

  it('retains actual listened time through downward duration refinement and prior immutable facts', () => {
    const coverage = new RecordingCoverage();
    const final = source();
    coverage.observe(final, true);
    coverage.hear(final, 100, 1);
    coverage.finalize(final, true);
    const estimated = source(120);
    coverage.observe(estimated, true);
    coverage.hear(estimated, 110, 1);
    coverage.refineDuration(final);
    expect(coverage.snapshot().recordingProgress?.listenedSeconds).toBe(110);
    expect(coverage.finalize(final, true)?.completed).toBe(true);
    expect(coverage.measurements(final.url)?.durations).toEqual([
      { durationSeconds: 100, completedPasses: 2 },
    ]);
  });

  it.each(['another element', 'another URL', 'unknown duration', 'invalid duration'])(
    'does not inherit partial hearing through metadata for %s',
    (change) => {
      const coverage = new RecordingCoverage();
      const initial = source();
      coverage.observe(initial, true);
      coverage.hear(initial, 90, 1);
      const next = {
        ...initial,
        ...(change === 'another element' ? { sourceId: 'replacement' } : {}),
        ...(change === 'another URL' ? { url: 'https://example.org/other.mp3' } : {}),
        ...(change === 'unknown duration' ? { durationSeconds: undefined } : {}),
        ...(change === 'invalid duration' ? { durationSeconds: Infinity } : {}),
      };
      coverage.refineDuration(next);
      const known = { ...next, durationSeconds: 100 };
      coverage.refineDuration(known);
      coverage.hear(known, 10, 1);
      expect(coverage.finalize(known, true)?.completed).toBe(false);
    },
  );

  it('does not inherit hearing through an ordinary duration replacement', () => {
    const coverage = new RecordingCoverage();
    const original = source();
    coverage.observe(original, true);
    coverage.hear(original, 90, 1);
    const changed = source(120);
    coverage.observe(changed);
    coverage.hear(changed, 30, 1);
    expect(coverage.finalize(changed, true)?.completed).toBe(false);
  });

  it('counts only native 1x seconds and keeps unsupported rate feedback until valid rehearing', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 100, 2);
    expect(coverage.snapshot().recordingProgress?.status).toBe('rate-unsupported');
    expect(coverage.finalize(recording, true)).toMatchObject({
      completed: false,
      reason: 'rate-unsupported',
    });
    expect(coverage.measurements(recording.url)).toBeUndefined();
    coverage.observe(recording, true);
    coverage.hear(recording, 50, 1);
    coverage.hear(recording, 50, 2);
    expect(count(coverage, recording)).toBe(0);
    coverage.hear(recording, 50, 1);
    expect(coverage.finalize(recording, true)?.completed).toBe(true);
  });

  it('preserves all completed facts at the duration-group bound and can revisit a known duration', () => {
    const coverage = new RecordingCoverage();
    for (let index = 1; index <= 100; index++) {
      const recording = source(index);
      coverage.observe(recording, true);
      coverage.hear(recording, index, 1);
      coverage.finalize(recording, true);
    }
    const novel = source(101);
    coverage.observe(novel, true);
    coverage.hear(novel, 101, 1);
    expect(coverage.snapshot().recordingProgress?.status).toBe('duration-limit');
    expect(coverage.finalize(novel, true)).toMatchObject({
      completed: false,
      reason: 'duration-limit',
    });
    expect(coverage.measurements(novel.url)?.durations).toHaveLength(100);
    expect(
      coverage.measurements(novel.url)?.durations.every((item) => item.completedPasses === 1),
    ).toBe(true);
    const original = source(1);
    coverage.observe(original, true);
    coverage.hear(original, 1, 1);
    expect(coverage.finalize(original, true)?.completed).toBe(true);
    expect(coverage.measurements(original.url)?.durations[0].completedPasses).toBe(2);
  });

  it('rejects malformed credit and detaches every returned measurement and outcome', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    for (const seconds of [Infinity, NaN, -1, 0]) coverage.hear(recording, seconds, 1);
    expect(coverage.snapshot().recordingProgress?.listenedSeconds).toBe(0);
    coverage.hear(recording, 100, 1);
    const outcome = coverage.finalize(recording, true)!;
    outcome.completed = false;
    const measurements = coverage.measurements(recording.url)!;
    measurements.durations[0].completedPasses = 999;
    const snapshot = coverage.snapshot();
    snapshot.recordingProgress!.listenedSeconds = 999;
    snapshot.recordingOutcome!.completed = false;
    expect(coverage.snapshot()).toMatchObject({
      recordingProgress: { listenedSeconds: 100 },
      recordingOutcome: { completed: true },
    });
    expect(count(coverage, recording)).toBe(1);
  });

  it('discards only the matching source and resets facts without reusing outcome identities', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 100, 1);
    coverage.finalize(recording, true);
    coverage.discard(source(100, 'stale'));
    expect(coverage.snapshot().recordingProgress).toBeDefined();
    coverage.discard(recording);
    expect(coverage.snapshot().recordingProgress).toBeUndefined();
    expect(count(coverage, recording)).toBe(1);
    const before = coverage.snapshot().recordingRevision;
    coverage.reset();
    expect(coverage.snapshot().recordingRevision).toBeGreaterThan(before);
    expect(coverage.snapshot().recordingOutcome).toBeUndefined();
    expect(coverage.measurements(recording.url)).toBeUndefined();
    coverage.observe(recording, true);
    coverage.hear(recording, 100, 1);
    expect(coverage.finalize(recording, true)?.id).toBe(2);
  });
});
