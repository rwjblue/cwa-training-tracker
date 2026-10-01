import { describe, expect, it } from 'vitest';
import { RecordingCoverage, type RecordingSource } from './recording-coverage';

const source = (durationSeconds = 10, sourceId = 'first'): RecordingSource => ({
  url: 'https://example.org/lesson.mp3',
  durationSeconds,
  sourceId,
});

describe('recording-local coverage', () => {
  it('unions heard overlap and exact adjacency without counting replay twice', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 6, 1);
    coverage.hear(recording, 2, 8, 1);
    coverage.hear(recording, 8, 10, 1);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBe(10);
    expect(coverage.finalize(recording, true)).toMatchObject({ completed: true });
    expect(coverage.measurements(recording.url)?.durations).toEqual([
      { durationSeconds: 10, completedPasses: 1 },
    ]);
  });

  it.each([0.000001, 0.01, 2])(
    'cannot spend endpoint tolerance on a missing middle of %s seconds',
    (gap) => {
      const coverage = new RecordingCoverage();
      const recording = source();
      coverage.observe(recording, true);
      coverage.hear(recording, 0, 5, 1);
      coverage.hear(recording, 5 + gap, 10, 1);
      expect(coverage.finalize(recording, true)).toMatchObject({
        completed: false,
        reason: 'incomplete',
      });
      expect(coverage.measurements(recording.url)?.durations[0].completedPasses).toBe(0);
    },
  );

  it('does not turn many tiny unobserved gaps into a whole recording', () => {
    const coverage = new RecordingCoverage();
    const recording = source(1);
    coverage.observe(recording, true);
    for (let index = 0; index < 100; index++)
      coverage.hear(recording, index / 100, (index + 1) / 100 - 0.000001, 1);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBeCloseTo(0.9999, 8);
    expect(coverage.finalize(recording, true)?.completed).toBe(false);
  });

  it.each([
    { paused: 0.852216, resumed: 0.951015, covered: 3.901201 },
    { paused: 0.858154, resumed: 0.96, covered: 3.898154 },
  ])(
    'permits only the observed native resume boundary $paused->$resumed without heard-gap credit',
    ({ paused, resumed, covered }) => {
      const coverage = new RecordingCoverage();
      const recording = source(4);
      coverage.observe(recording, true);
      coverage.hear(recording, 0, paused, 1);
      coverage.authorizeResumeGap(recording, paused, resumed);
      coverage.hear(recording, resumed, 4, 1);
      expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBeCloseTo(covered, 6);
      expect(coverage.finalize(recording, true)?.completed).toBe(true);
    },
  );

  it.each([
    { gap: 0.25, completed: true },
    { gap: 0.251, completed: false },
  ])('bounds a native gap of $gap seconds by one observation interval', ({ gap, completed }) => {
    const coverage = new RecordingCoverage();
    const recording = source(20);
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 5, 1);
    coverage.authorizeResumeGap(recording, 5, 5 + gap);
    coverage.hear(recording, 5 + gap, 20, 1);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBeCloseTo(20 - gap, 6);
    expect(coverage.finalize(recording, true)?.completed).toBe(completed);
  });

  it('does not let one native boundary authorize an unrelated tiny middle seek', () => {
    const coverage = new RecordingCoverage();
    const recording = source(4);
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 1, 1);
    coverage.authorizeResumeGap(recording, 1, 1.05);
    coverage.hear(recording, 1.05, 2, 1);
    coverage.hear(recording, 2.001, 4, 1);
    expect(coverage.finalize(recording, true)?.completed).toBe(false);
  });

  it('bounds native gaps relative to a tiny recording instead of supplying an unheard short pass', () => {
    const coverage = new RecordingCoverage();
    const recording = source(0.05);
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 0.001, 1);
    coverage.authorizeResumeGap(recording, 0.001, 0.049);
    coverage.hear(recording, 0.049, 0.05, 1);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBeCloseTo(0.002, 6);
    expect(coverage.finalize(recording, true)?.completed).toBe(false);
  });

  it('does not reuse native boundary permission in a fresh pass or a changed duration', () => {
    const coverage = new RecordingCoverage();
    const recording = source(4);
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 1, 1);
    coverage.authorizeResumeGap(recording, 1, 1.05);
    coverage.hear(recording, 1.05, 4, 1);
    expect(coverage.finalize(recording, true)?.completed).toBe(true);
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 1, 1);
    coverage.hear(recording, 1.05, 4, 1);
    expect(coverage.finalize(recording, true)?.completed).toBe(false);
    const changed = source(4.01);
    coverage.observe(changed, true);
    coverage.hear(changed, 0, 1, 1);
    coverage.hear(changed, 1.05, 4.01, 1);
    expect(coverage.finalize(changed, true)?.completed).toBe(false);
  });

  it.each([
    { duration: 10, from: 0.04, to: 9.96, completed: true },
    { duration: 10, from: 0.4, to: 9.8, completed: false },
    { duration: 200, from: 0.25, to: 199.5, completed: true },
    { duration: 200, from: 0.75, to: 199.5, completed: false },
    { duration: 0.5, from: 0.001, to: 0.499, completed: true },
    { duration: 0.5, from: 0.1, to: 0.5, completed: false },
  ])(
    'bounds combined endpoint loss for a $duration-second recording',
    ({ duration, from, to, completed }) => {
      const coverage = new RecordingCoverage();
      const recording = source(duration);
      coverage.observe(recording, true);
      coverage.hear(recording, from, to, 1);
      expect(coverage.finalize(recording, true)?.completed).toBe(completed);
    },
  );

  it.each([0.1, 0.5, 1])('cannot complete an unheard short recording of %s seconds', (duration) => {
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
    'does not manufacture a denominator from duration %s',
    (invalid) => {
      const coverage = new RecordingCoverage();
      const recording = { ...source(), durationSeconds: invalid };
      coverage.observe(recording, true);
      coverage.hear(recording, 0, 10, 1);
      expect(coverage.finalize(recording, true)).toMatchObject({
        completed: false,
        reason: 'duration-unavailable',
      });
      expect(coverage.measurements(recording.url)).toBeUndefined();
    },
  );

  it('only finishes an actual terminal boundary once and starts deliberate replay fresh', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 10, 1);
    expect(coverage.finalize(recording, false)).toBeUndefined();
    const first = coverage.finalize(recording, true);
    expect(first).toMatchObject({ id: 1, completed: true });
    expect(coverage.finalize(recording, true)).toBeUndefined();
    coverage.observe(recording); // Metadata refresh is not a replay.
    coverage.hear(recording, 0, 10, 1);
    expect(coverage.finalize(recording, true)).toBeUndefined();
    coverage.observe(recording, true);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBe(0);
    coverage.hear(recording, 0, 10, 1);
    expect(coverage.finalize(recording, true)).toMatchObject({ id: 2, completed: true });
    expect(coverage.measurements(recording.url)?.durations[0].completedPasses).toBe(2);
  });

  it('retains a partial pass during observations but abandons it for another source generation', () => {
    const coverage = new RecordingCoverage();
    const first = source();
    coverage.observe(first, true);
    coverage.hear(first, 0, 5, 1);
    coverage.observe(first, true); // Resume/seek/buffer recovery preserves this owner.
    coverage.hear(first, 5, 10, 1);
    expect(coverage.finalize(first, true)?.completed).toBe(true);
    coverage.observe(first, true);
    coverage.hear(first, 0, 5, 1);
    const second = source(10, 'replacement');
    coverage.observe(second, true);
    coverage.hear(first, 5, 10, 1); // A retired source cannot affect its replacement.
    expect(coverage.finalize(first, true)).toBeUndefined();
    coverage.hear(second, 5, 10, 1);
    expect(coverage.finalize(second, true)?.completed).toBe(false);
    expect(coverage.measurements(first.url)?.durations[0].completedPasses).toBe(1);
  });

  it('keeps independent files and completed exact-URL denominators across file/duration changes', () => {
    const coverage = new RecordingCoverage();
    const slow = source();
    coverage.observe(slow, true);
    coverage.hear(slow, 0, 10, 1);
    coverage.finalize(slow, true);
    coverage.observe(slow, true);
    coverage.hear(slow, 0, 5, 1);
    const fast = { ...source(6, 'fast'), url: 'https://example.org/fast.mp3' };
    coverage.observe(fast, true);
    coverage.hear(fast, 3, 6, 1);
    expect(coverage.finalize(fast, true)?.completed).toBe(false);
    const changed = source(12);
    coverage.observe(changed, true);
    coverage.hear(changed, 0, 12, 1);
    expect(coverage.finalize(changed, true)?.completed).toBe(true);
    expect(coverage.measurements(slow.url)?.durations).toEqual([
      { durationSeconds: 10, completedPasses: 1 },
      { durationSeconds: 12, completedPasses: 1 },
    ]);
    expect(coverage.measurements(fast.url)?.durations).toEqual([
      { durationSeconds: 6, completedPasses: 0 },
    ]);
  });

  it('can accept late valid metadata without inheriting hearing from the unknown duration', () => {
    const coverage = new RecordingCoverage();
    const unknown = { ...source(), durationSeconds: undefined };
    coverage.observe(unknown, true);
    coverage.hear(unknown, 0, 5, 1);
    const known = source();
    coverage.observe(known);
    coverage.hear(known, 5, 10, 1);
    expect(coverage.finalize(known, true)?.completed).toBe(false);
  });

  it('does not inherit coverage through a material relative change in a tiny denominator', () => {
    const coverage = new RecordingCoverage();
    const original = source(0.0001);
    coverage.observe(original, true);
    coverage.hear(original, 0, 0.0001, 1);
    const changed = source(0.0002);
    coverage.observe(changed);
    coverage.hear(changed, 0.0001, 0.0002, 1);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBeCloseTo(0.0001, 8);
    expect(coverage.finalize(changed, true)?.completed).toBe(false);
    expect(coverage.measurements(original.url)?.durations).toEqual([
      { durationSeconds: 0.0001, completedPasses: 0 },
      { durationSeconds: 0.0002, completedPasses: 0 },
    ]);
  });

  it('counts only fully heard 1x intervals while distinguishing unsupported rate movement', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 10, 2);
    expect(coverage.snapshot().recordingProgress?.status).toBe('rate-unsupported');
    expect(coverage.finalize(recording, true)).toMatchObject({
      completed: false,
      reason: 'rate-unsupported',
    });
    expect(coverage.measurements(recording.url)).toBeUndefined();
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 5, 1);
    coverage.hear(recording, 5, 10, 2);
    coverage.hear(recording, 5, 10, 1); // Actually rereading all missing content at 1x is valid.
    expect(coverage.finalize(recording, true)?.completed).toBe(true);
  });

  it('preserves all completed facts when the duration-group bound is exhausted', () => {
    const coverage = new RecordingCoverage();
    for (let index = 1; index <= 100; index++) {
      const recording = source(index);
      coverage.observe(recording, true);
      coverage.hear(recording, 0, index, 1);
      coverage.finalize(recording, true);
    }
    const novel = source(101);
    coverage.observe(novel, true);
    coverage.hear(novel, 0, 101, 1);
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
    coverage.hear(original, 0, 1, 1);
    expect(coverage.finalize(original, true)?.completed).toBe(true);
    expect(coverage.measurements(original.url)?.durations[0].completedPasses).toBe(2);
  });

  it('rejects malformed ranges, clamps source edges and detaches every returned fact', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    for (const [from, to] of [
      [Infinity, 10],
      [0, NaN],
      [5, 2],
      [0, 0],
    ])
      coverage.hear(recording, from, to, 1);
    expect(coverage.snapshot().recordingProgress?.coveredSeconds).toBe(0);
    coverage.hear(recording, -1, 11, 1);
    const outcome = coverage.finalize(recording, true)!;
    outcome.completed = false;
    const measurements = coverage.measurements(recording.url)!;
    measurements.durations[0].completedPasses = 999;
    const snapshot = coverage.snapshot();
    snapshot.recordingProgress!.coveredSeconds = 999;
    snapshot.recordingOutcome!.completed = false;
    expect(coverage.snapshot()).toMatchObject({
      recordingProgress: { coveredSeconds: 10 },
      recordingOutcome: { completed: true },
    });
    expect(coverage.measurements(recording.url)?.durations[0].completedPasses).toBe(1);
  });

  it('discards only the matching source and resets finished facts without reusing outcome identities', () => {
    const coverage = new RecordingCoverage();
    const recording = source();
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 10, 1);
    coverage.finalize(recording, true);
    coverage.discard(source(10, 'stale'));
    expect(coverage.snapshot().recordingProgress).toBeDefined();
    coverage.discard(recording);
    expect(coverage.snapshot().recordingProgress).toBeUndefined();
    expect(coverage.measurements(recording.url)?.durations[0].completedPasses).toBe(1);
    const before = coverage.snapshot().recordingRevision;
    coverage.reset();
    expect(coverage.snapshot().recordingRevision).toBeGreaterThan(before);
    expect(coverage.snapshot().recordingOutcome).toBeUndefined();
    expect(coverage.measurements(recording.url)).toBeUndefined();
    coverage.observe(recording, true);
    coverage.hear(recording, 0, 10, 1);
    expect(coverage.finalize(recording, true)?.id).toBe(2);
  });
});
