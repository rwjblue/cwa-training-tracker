import { describe, expect, it } from 'vitest';
import { PracticeClock } from './practice-clock';

describe('practice time', () => {
  it('credits heard audio across native play/pause, buffering, and seeks without crediting breaks', () => {
    const clock = new PracticeClock();
    clock.startMedia(0, 0);
    clock.sample(10, 10_000);
    clock.suspendMedia();
    expect(clock.snapshot(60_000)).toMatchObject({ seconds: 10, running: false });
    clock.startMedia(10, 60_000);
    clock.sample(10, 65_000); // stalled playback
    clock.sample(90, 66_000); // unobserved seek must not inflate time
    clock.sample(92, 68_000);
    clock.suspendMedia(); // explicit seek clears the anchor
    clock.startMedia(2, 70_000);
    clock.sample(5, 73_000); // rehearing a section does count
    expect(clock.snapshot(73_000).seconds).toBe(15);
  });

  it('keeps long external practice separate from observed recall and heard audio', () => {
    const clock = new PracticeClock();
    clock.startManual(0);
    clock.startManual(20_000);
    expect(clock.snapshot(1_200_000, false).seconds).toBe(1200);
    clock.startMedia(0, 1_200_000, 1, undefined, false);
    clock.sample(10, 1_210_000);
    clock.suspendMedia();
    clock.startManual(1_220_000, true);
    for (let now = 1_221_000; now < 1_240_000; now += 1000) clock.snapshot(now);
    clock.pause(1_240_000);
    expect(clock.snapshot(1_300_000)).toMatchObject({
      seconds: 1230,
      recallSeconds: 20,
      running: false,
    });
    clock.reset();
    expect(clock.snapshot(1_400_000)).toMatchObject({ seconds: 0, recallSeconds: 0 });
  });

  it('settles consecutive observed recall chunks without projecting from the original start', () => {
    const clock = new PracticeClock();
    clock.startManual(0, true);
    expect(clock.snapshot(2000)).toMatchObject({ seconds: 2, recallSeconds: 2, recalling: true });
    clock.startManual(5000, true); // Same-mode Start also observes the next valid chunk.
    expect(clock.snapshot(5000)).toMatchObject({ seconds: 5, recallSeconds: 5, recalling: true });
    expect(clock.snapshot(5000).seconds).toBe(5); // Repeated reads cannot double-count.
    clock.pause(8000);
    expect(clock.snapshot(80_000)).toMatchObject({ seconds: 8, recallSeconds: 8, running: false });
  });

  it.each([3999, 4000, 4001])(
    'guards a recall interval of %i milliseconds at the four-second boundary',
    (elapsed) => {
      const clock = new PracticeClock();
      clock.startManual(1000, true);
      const valid = elapsed < 4000;
      expect(clock.snapshot(1000 + elapsed)).toMatchObject({
        seconds: valid ? elapsed / 1000 : 0,
        recallSeconds: valid ? elapsed / 1000 : 0,
        running: valid,
        recalling: valid,
        recallInterruption: valid ? undefined : 'delayed',
      });
    },
  );

  const recallBoundaries = [
    {
      name: 'snapshot',
      settle: (clock: PracticeClock, now: number, visible: boolean) => clock.snapshot(now, visible),
    },
    {
      name: 'Pause/review',
      settle: (clock: PracticeClock, now: number, visible: boolean) => clock.pause(now, visible),
    },
    {
      name: 'same-mode Start',
      settle: (clock: PracticeClock, now: number, visible: boolean) =>
        clock.startManual(now, true, visible),
    },
    {
      name: 'listening start',
      settle: (clock: PracticeClock, now: number, visible: boolean) =>
        clock.startMedia(0, now, 1, undefined, visible),
    },
    {
      name: 'Play request',
      settle: (clock: PracticeClock, now: number, visible: boolean) =>
        clock.stopRecall(now, visible),
    },
  ];

  it.each(recallBoundaries)('rejects a stalled final interval at $name', ({ settle }) => {
    const clock = new PracticeClock();
    clock.startManual(0, true);
    clock.snapshot(500);
    settle(clock, 4500, true);
    expect(clock.snapshot(4500)).toMatchObject({
      seconds: 0.5,
      recallSeconds: 0.5,
      recalling: false,
      recallInterruption: 'delayed',
    });
    clock.suspendMedia();
    expect(clock.snapshot(90_000)).toMatchObject({
      seconds: 0.5,
      recallSeconds: 0.5,
      running: false,
    });
  });

  it.each(recallBoundaries)(
    'rejects a hidden interval before any settlement at $name',
    ({ settle }) => {
      const clock = new PracticeClock();
      clock.startManual(0, true);
      clock.snapshot(500);
      settle(clock, 750, false);
      expect(clock.snapshot(750)).toMatchObject({
        seconds: 0.5,
        recallSeconds: 0.5,
        recalling: false,
        recallInterruption: 'hidden',
      });
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 999])(
    'retains prior finite recall credit when timestamp %s interrupts observation',
    (now) => {
      const clock = new PracticeClock();
      clock.startManual(0, true);
      clock.snapshot(1000);
      expect(clock.snapshot(now)).toMatchObject({
        seconds: 1,
        recallSeconds: 1,
        running: false,
        recallInterruption: 'invalid',
      });
      expect(clock.snapshot(100_000).seconds).toBe(1);
      clock.pause(now);
      expect(clock.snapshot(now).seconds).toBe(1);
      clock.startManual(100_000, true);
      expect(clock.snapshot(101_000)).toMatchObject({
        seconds: 2,
        recallSeconds: 2,
        recalling: true,
        recallInterruption: undefined,
      });
    },
  );

  it.each(recallBoundaries)('applies invalid timestamp guards at $name', ({ settle }) => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 999]) {
      const clock = new PracticeClock();
      clock.startManual(0, true);
      clock.snapshot(1000);
      settle(clock, invalid, true);
      expect(clock.snapshot(100_000)).toMatchObject({
        seconds: 1,
        recallSeconds: 1,
        running: false,
        recallInterruption: 'invalid',
      });
    }
  });

  it('requires deliberate resume after a redundant Start detects a stall', () => {
    const clock = new PracticeClock();
    clock.startManual(0, true);
    clock.snapshot(1000);
    clock.startManual(5000, true);
    expect(clock.snapshot(5000)).toMatchObject({ running: false, recallInterruption: 'delayed' });
    clock.startManual(10_000, true);
    clock.pause(11_000);
    expect(clock.snapshot(100_000)).toMatchObject({
      seconds: 2,
      recallSeconds: 2,
      running: false,
      recallInterruption: undefined,
    });
  });

  it('cannot start recall hidden or with a nonfinite timestamp, and resets the interruption deliberately', () => {
    const clock = new PracticeClock();
    clock.startManual(0, true, false);
    expect(clock.snapshot(1000)).toMatchObject({
      seconds: 0,
      running: false,
      recallInterruption: 'hidden',
    });
    clock.startManual(Number.NaN, true);
    expect(clock.snapshot(2000)).toMatchObject({
      seconds: 0,
      running: false,
      recallInterruption: 'invalid',
    });
    clock.startManual(2000, true);
    clock.snapshot(2500);
    clock.pause(3000, false);
    clock.reset();
    expect(clock.snapshot(10_000)).toMatchObject({
      seconds: 0,
      recallSeconds: 0,
      running: false,
      recallInterruption: undefined,
    });
  });

  it('keeps media and recall non-overlapping through immediate requests and late media suspension', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/assigned.mp3', speedWpm: 15 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(2, 2000);
    clock.startManual(2000, true);
    clock.sample(3, 3000); // An obsolete source no longer owns a media anchor.
    clock.suspendMedia(); // Late pause/waiting must leave the newer recall intact.
    expect(clock.snapshot(3000)).toMatchObject({ seconds: 3, recallSeconds: 1, recalling: true });
    clock.stopRecall(3500); // Request may buffer or fail without any heard audio.
    expect(clock.snapshot(20_000)).toMatchObject({
      seconds: 3.5,
      recallSeconds: 1.5,
      running: false,
    });
    clock.startMedia(2, 20_000, 1, recording);
    clock.sample(2, 21_000); // Buffering contributes no credit.
    clock.sample(4, 23_000);
    clock.pause(23_000);
    expect(clock.snapshot(90_000)).toMatchObject({
      seconds: 5.5,
      recallSeconds: 1.5,
      running: false,
      recordings: [{ ...recording, seconds: 4 }],
    });
  });

  it('preserves interruption feedback through listening and inspection until a fresh deliberate start', () => {
    const clock = new PracticeClock();
    clock.startManual(0, true);
    clock.snapshot(500);
    clock.pause(4500);
    clock.startMedia(0, 10_000);
    clock.sample(1, 11_000);
    clock.pause(11_000);
    clock.stopRecall(12_000);
    expect(clock.snapshot(20_000)).toMatchObject({ seconds: 1.5, recallInterruption: 'delayed' });
    clock.startManual(20_000, true);
    expect(clock.snapshot(20_000)).toMatchObject({
      seconds: 1.5,
      recalling: true,
      recallInterruption: undefined,
    });
  });

  it('does not interrupt intentional long external practice on a Play request or hidden page', () => {
    const clock = new PracticeClock();
    clock.startManual(0);
    clock.stopRecall(100_000, false);
    expect(clock.snapshot(1_200_000, false)).toMatchObject({
      seconds: 1200,
      running: true,
      recalling: false,
    });
    clock.pause(1_500_000, false);
    expect(clock.snapshot(1_600_000)).toMatchObject({
      seconds: 1500,
      recallSeconds: 0,
      running: false,
      recallInterruption: undefined,
    });
  });

  it('does not backfill a stalled recall interval when changing to ordinary manual practice', () => {
    const clock = new PracticeClock();
    clock.startManual(0, true);
    clock.snapshot(1000);
    clock.startManual(5000, false, false);
    clock.pause(15_000, false);
    expect(clock.snapshot(20_000)).toMatchObject({ seconds: 11, recallSeconds: 1, running: false });
  });

  it('retains finite observed manual credit and pauses on invalid or backward timestamps', () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 999]) {
      const clock = new PracticeClock();
      clock.startManual(0);
      clock.snapshot(1000);
      clock.pause(invalid);
      clock.startManual(Number.NaN);
      expect(clock.snapshot(100_000)).toMatchObject({
        seconds: 1,
        recallSeconds: 0,
        running: false,
      });
    }
  });

  it('does not start a new ordinary mode at a backward recall settlement timestamp', () => {
    const clock = new PracticeClock();
    clock.startManual(0, true);
    clock.snapshot(1000);
    clock.startManual(999);
    expect(clock.snapshot(2000)).toMatchObject({
      seconds: 1,
      recallSeconds: 1,
      running: false,
      recallInterruption: 'invalid',
    });
    clock.startManual(2000);
    clock.pause(3000);
    expect(clock.snapshot(4000)).toMatchObject({ seconds: 2, recallSeconds: 1 });
  });

  it('allows long actual background media movement without applying the recall guard', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/background.mp3', speedWpm: 20 };
    clock.startMedia(0, 0, 2, recording, false);
    clock.sample(2400, 1_200_000, 2);
    expect(clock.snapshot(1_200_000, false)).toMatchObject({
      seconds: 1200,
      recallSeconds: 0,
      running: true,
      recordings: [{ ...recording, seconds: 1200 }],
    });
  });

  it('rejects invalid media samples and starts without losing finite prior source credit', () => {
    const recording = { url: 'https://example.org/finite.mp3', speedWpm: 20 };
    const invalidSamples = [
      [Number.NaN, 2000, 1],
      [2, Number.NaN, 1],
      [2, Number.POSITIVE_INFINITY, 1],
      [2, 999, 1],
      [2, 2000, Number.POSITIVE_INFINITY],
    ];
    for (const [position, now, rate] of invalidSamples) {
      const clock = new PracticeClock();
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      clock.sample(position, now, rate);
      clock.startMedia(position, now, rate, recording);
      expect(clock.snapshot(10_000)).toMatchObject({
        seconds: 1,
        recallSeconds: 0,
        recordings: [{ ...recording, seconds: 1 }],
      });
    }
  });

  it('retains actual time and speed for every recording, including revisits and native rate changes', () => {
    const clock = new PracticeClock();
    const slow = { url: 'https://example.org/slow.mp3', speedWpm: 10 };
    const fast = { url: 'https://example.org/fast.mp3', speedWpm: 15 };
    clock.startMedia(0, 0, 1, slow);
    clock.sample(10, 10_000);
    clock.startMedia(0, 10_000, 2, fast);
    clock.sample(20, 20_000, 2);
    clock.startMedia(0, 20_000, 1, slow);
    clock.sample(5, 25_000);
    expect(clock.snapshot(25_000)).toMatchObject({
      seconds: 25,
      recordings: [
        { ...slow, seconds: 15 },
        { ...fast, seconds: 10 },
      ],
    });
  });

  it('keeps source coverage independent from repeated heard time and completes a final tail once', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/pass.mp3', durationSeconds: 10, sourceId: 'one' };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(5, 5000);
    clock.suspendMedia();
    clock.startMedia(0, 5000, 1, recording);
    clock.sample(9.8, 14_800);
    clock.sample(10, 15_000); // Last accepted native tail precedes terminal finalization.
    expect(clock.finalizeRecording(recording, true)).toMatchObject({ completed: true });
    const after = clock.snapshot(15_000);
    expect(after.seconds).toBe(15);
    expect(after.recordingProgress?.coveredSeconds).toBe(10);
    expect(after.recordings[0].passes?.durations[0].completedPasses).toBe(1);
    expect(clock.finalizeRecording(recording, true)).toBeUndefined();
    expect(clock.snapshot(15_000).recordingRevision).toBe(after.recordingRevision);
    clock.startMedia(0, 15_000, 1, recording);
    clock.sample(10, 25_000);
    clock.finalizeRecording(recording, true);
    expect(clock.snapshot(25_000).recordings[0].passes?.durations[0].completedPasses).toBe(2);
  });

  it('retains partial coverage across pause, buffering, recall and inspection without overlapping time', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/retained.mp3', durationSeconds: 10 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(2, 2000);
    clock.suspendMedia(); // Buffering/native seek does not retire the current pass.
    clock.startMedia(2, 7000, 1, recording);
    clock.sample(4, 9000);
    clock.startManual(9000, true);
    clock.snapshot(10_000);
    clock.pause(11_000); // Inspection pauses and retains the same source owner.
    clock.startMedia(4, 100_000, 1, recording);
    clock.sample(10, 106_000);
    clock.finalizeRecording(recording, true);
    expect(clock.snapshot(106_000)).toMatchObject({
      seconds: 12,
      recallSeconds: 2,
      recordingOutcome: { completed: true },
      recordings: [{ seconds: 10, passes: { durations: [{ completedPasses: 1 }] } }],
    });
  });

  it.each(['pause', 'buffer', 'recall'] as const)(
    'accepts the observed native pause-drain boundary after %s without crediting its gap',
    (boundary) => {
      const clock = new PracticeClock();
      const recording = {
        url: 'https://example.org/native-gap.mp3',
        durationSeconds: 4,
        sourceId: 'one',
      };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(0.852216, 1000);
      if (boundary === 'pause') clock.pause(1000);
      else if (boundary === 'buffer') clock.suspendMedia();
      else {
        clock.startManual(1000, true);
        clock.pause(1500);
      }
      clock.startMedia(0.951015, 2000, 1, recording);
      clock.sample(4, 5200);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(true);
      const snapshot = clock.snapshot(5200);
      expect(snapshot.recordingProgress?.coveredSeconds).toBeCloseTo(3.901201, 6);
      expect(snapshot.recordings[0].seconds).toBeCloseTo(3.901201, 6);
      expect(snapshot.seconds).toBeCloseTo(3.901201 + (boundary === 'recall' ? 0.5 : 0), 6);
      expect(snapshot.recordings[0].passes?.durations).toEqual([
        { durationSeconds: 4, completedPasses: 1 },
      ]);
      expect(Object.keys(snapshot.recordings[0].passes!)).toEqual([
        'version',
        'method',
        'durations',
      ]);
    },
  );

  it.each([0.000001, 0.01, 0.099])(
    'does not authorize a %s-second seek while the source is already paused',
    (gap) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/paused-seek.mp3', durationSeconds: 4 };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      clock.pause(1000);
      clock.suspendMedia(false); // Native seeking still invalidates a paused candidate.
      clock.startMedia(1 + gap, 2000, 1, recording);
      clock.sample(4, 5000);
      expect(clock.finalizeRecording(recording, true)).toMatchObject({
        completed: false,
        reason: 'incomplete',
      });
    },
  );

  it('rejects the observed oversized short-recording resume gap without inventing hearing', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/observed-gap.mp3', durationSeconds: 3.6 };
    clock.startMedia(0, 13760.2, 1, recording);
    clock.sample(1.726185, 15724.1);
    clock.pause(15724.4);
    clock.startMedia(1.984, 16193.3, 1, recording);
    clock.sample(2.037538, 16436.3);
    clock.sample(3.6, 18030);
    const beforeEnd = clock.snapshot(18030);
    expect(beforeEnd.seconds).toBeCloseTo(3.342185, 9);
    expect(beforeEnd.recordingProgress?.coveredSeconds).toBeCloseTo(3.342185, 9);
    expect(clock.finalizeRecording(recording, true)).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(clock.snapshot(18030).recordings[0].passes?.durations).toEqual([
      { durationSeconds: 3.6, completedPasses: 0 },
    ]);
  });

  it('retains the credible first native resume tail from the independent mobile capture', () => {
    const clock = new PracticeClock();
    const recording = {
      url: 'https://example.org/native-stabilization.mp3',
      durationSeconds: 3.6,
      sourceId: 'one',
    };
    clock.startMedia(0, 1179.5, 1, recording);
    clock.sample(0.839557, 2096.2000002861023);
    clock.pause(2096.2000002861023);
    clock.startMedia(0.856433, 2113.1000003814697, 1, recording);
    clock.sample(1.094035, 2308);
    const resumed = clock.snapshot(2308);
    // Keep the original measured credit; only wall + existing .036 jitter
    // supplies the resumed coverage tail. The missing head adds no coverage.
    expect(resumed.seconds).toBeCloseTo(1.077159, 9);
    expect(resumed.recordingProgress?.coveredSeconds).toBeCloseTo(1.07045699961853, 9);
    clock.sample(1.150395, 2364.4000000953674);
    clock.sample(3.6, 4860.700000286102);
    expect(clock.finalizeRecording(recording, true)).toMatchObject({ completed: true });
    clock.suspendMedia(); // Native pause may precede the duplicate ended callback.
    expect(clock.finalizeRecording(recording, true)).toBeUndefined();
    const final = clock.snapshot(4860.700000286102);
    expect(final.seconds).toBeCloseTo(3.583124, 9);
    expect(final.recordings[0].seconds).toBeCloseTo(3.583124, 9);
    expect(final.recordingProgress?.coveredSeconds).toBeCloseTo(3.57642199961853, 9);
    expect(final.recordings[0].passes?.durations).toEqual([
      { durationSeconds: 3.6, completedPasses: 1 },
    ]);
  });

  it.each([0, 0.01])(
    'stabilizes the first native resume sample after a bounded %s-second position gap',
    (gap) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/resume-tail.mp3', durationSeconds: 4 };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      clock.pause(1000);
      clock.startMedia(1 + gap, 2000, 1, recording);
      clock.sample(1.25 + gap, 2200);
      clock.sample(4, 5000);
      expect(clock.snapshot(5000).seconds).toBeCloseTo(4 - gap, 9);
      expect(clock.snapshot(5000).recordingProgress?.coveredSeconds).toBeCloseTo(3.99 - gap, 9);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(true);
    },
  );

  it.each([
    { duration: 4, gap: 0.18, completed: true },
    { duration: 4, gap: 0.195, completed: false },
    { duration: 9, gap: 0.239, completed: true },
    { duration: 9, gap: 0.249, completed: false },
  ])(
    'bounds combined resume and stabilization loss for duration $duration and gap $gap',
    ({ duration, gap, completed }) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/bounded-tail.mp3', durationSeconds: duration };
      const advance = 0.2 + Math.min(0.1, duration * 0.01) + 0.01;
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      clock.pause(1000);
      clock.startMedia(1 + gap, 2000, 1, recording);
      clock.sample(1 + gap + advance, 2200);
      clock.sample(duration, 10_000);
      expect(clock.snapshot(10_000).seconds).toBeCloseTo(duration - gap, 9);
      expect(clock.snapshot(10_000).recordingProgress?.coveredSeconds).toBeCloseTo(
        duration - gap - (completed ? 0.01 : advance),
        9,
      );
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(completed);
    },
  );

  it('shares the total missing budget across multiple stabilized native resumes', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/many-stabilizations.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(0.8, 800);
    for (const [paused, now] of [
      [0.8, 800],
      [1.14, 1200],
      [1.48, 1600],
    ]) {
      clock.pause(now);
      clock.startMedia(paused + 0.09, now + 200, 1, recording);
      clock.sample(paused + 0.34, now + 400);
    }
    clock.sample(4, 4180);
    expect(clock.snapshot(4180).seconds).toBeCloseTo(3.73, 9);
    expect(clock.snapshot(4180).recordingProgress?.coveredSeconds).toBeCloseTo(3.7, 9);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each(['ordinary movement', 'repeated playing', 'backward resume', 'seek/error'] as const)(
    'does not authorize strict-jitter rejection after %s',
    (boundary) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/unpermitted-tail.mp3', durationSeconds: 4 };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      if (boundary === 'ordinary movement') {
        clock.sample(1.25, 1200);
      } else {
        clock.pause(1000);
        if (boundary === 'seek/error') clock.suspendMedia(false);
        const resumed = boundary === 'backward resume' ? 0.9 : 1.01;
        clock.startMedia(resumed, 2000, 1, recording);
        if (boundary === 'repeated playing') clock.startMedia(resumed, 2000, 1, recording);
        clock.sample(resumed + 0.25, 2200);
      }
      clock.sample(4, 6000);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
    },
  );

  it.each([
    { label: 'stalled position', position: 1.01, now: 2100 },
    { label: 'zero wall', position: 1.011, now: 2000 },
    { label: 'ordinary accepted movement', position: 1.11, now: 2100 },
    { label: 'inadmissible jump', position: 2, now: 2000 },
  ])('consumes stabilization on the first $label sample', ({ position, now }) => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/consumed-tail.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    clock.startMedia(1.01, 2000, 1, recording);
    clock.sample(position, now);
    clock.sample(position + 0.25, now + 200);
    clock.sample(4, now + 5000);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each([
    { label: 'invalid position', position: NaN, now: 2100, rate: 1 },
    { label: 'invalid wall', position: 1.01, now: NaN, rate: 1 },
    { label: 'backward wall', position: 1.01, now: 1999, rate: 1 },
    { label: 'invalid rate', position: 1.01, now: 2100, rate: Infinity },
  ])('revokes stabilization after an $label observation', ({ position, now, rate }) => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/invalid-tail.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    clock.startMedia(1.01, 2000, 1, recording);
    clock.sample(position, now, rate);
    clock.startMedia(1.01, 2200, 1, recording);
    clock.sample(1.26, 2400);
    clock.sample(4, 6000);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each(['changed rate', 'metadata duration', 'discard', 'reset'] as const)(
    'revokes a pending stabilization through %s',
    (boundary) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/replaced-tail.mp3', durationSeconds: 4 };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      clock.pause(1000);
      clock.startMedia(1.01, 2000, 1, recording);
      if (boundary === 'metadata duration')
        clock.observeRecording({ ...recording, durationSeconds: 4.0000001 });
      else if (boundary === 'discard') {
        clock.discardRecording(recording);
        clock.observeRecording(recording);
      } else if (boundary === 'reset') {
        clock.reset();
        clock.startMedia(1.01, 2000, 1, recording);
      }
      clock.sample(1.26, 2200, boundary === 'changed rate' ? 2 : 1);
      clock.sample(4, 6000);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
    },
  );

  it.each([
    { label: 'another URL', source: { url: 'https://example.org/replacement.mp3' }, rate: 1 },
    { label: 'another element', source: { sourceId: 'replacement' }, rate: 1 },
    { label: 'another duration', source: { durationSeconds: 4.0000001 }, rate: 1 },
    { label: 'another native rate', source: {}, rate: 2 },
  ])('cannot create stabilization for $label', ({ source, rate }) => {
    const clock = new PracticeClock();
    const recording = {
      url: 'https://example.org/source-fenced-tail.mp3',
      sourceId: 'first',
      durationSeconds: 4,
    };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    const replacement = { ...recording, ...source };
    clock.startMedia(1.01, 2000, rate, replacement);
    clock.sample(1.26, 2200, rate);
    clock.sample(replacement.durationSeconds, 6000, rate);
    expect(clock.finalizeRecording(replacement, true)?.completed).toBe(false);
  });

  it('does not recover a time-clipped jump even immediately after a verified native resume', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/clipped-resume.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    clock.startMedia(1, 2000, 1, recording);
    clock.sample(1.35, 2200); // Actual time guard clips this to .3 seconds.
    clock.sample(4, 6000);
    expect(clock.snapshot(6000).seconds).toBeCloseTo(3.95, 9);
    expect(clock.snapshot(6000).recordingProgress?.coveredSeconds).toBeCloseTo(3.65, 9);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each(['suspended', 'resumed'] as const)(
    'revokes an observed duration replacement while %s, even if the duration returns',
    (boundary) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/observed-replacement.mp3', durationSeconds: 4 };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(1, 1000);
      clock.pause(1000);
      if (boundary === 'resumed') clock.startMedia(1.01, 2000, 1, recording);
      // Coverage permits negligible metadata roundoff, but the native resume
      // permission still requires the exact original observed denominator.
      clock.observeRecording({ ...recording, durationSeconds: 4.0000001 });
      clock.observeRecording(recording);
      if (boundary === 'suspended') clock.startMedia(1.01, 2000, 1, recording);
      clock.sample(1.26, 2200);
      clock.sample(4, 6000);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
    },
  );

  it.each([
    { label: 'invalid sample time', position: 1, now: NaN, rate: 1, pause: false },
    { label: 'invalid sample position', position: NaN, now: 1100, rate: 1, pause: false },
    { label: 'invalid sample rate', position: 1, now: 1100, rate: Infinity, pause: false },
    { label: 'invalid pause time', position: 1, now: NaN, rate: 1, pause: true },
  ])('revokes an already suspended candidate on $label', ({ position, now, rate, pause }) => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/invalid-suspension.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    if (pause) clock.pause(now);
    else clock.sample(position, now, rate);
    expect(clock.snapshot(1200).seconds).toBe(1);
    clock.startMedia(1.01, 2000, 1, recording);
    clock.sample(1.26, 2200);
    clock.sample(4, 6000);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each([NaN, Infinity, 999])('revokes continuity at an invalid active pause time %s', (now) => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/invalid-active-pause.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(now);
    expect(clock.snapshot(1200).seconds).toBe(1);
    clock.startMedia(1.01, 2000, 1, recording);
    clock.sample(1.26, 2200);
    clock.sample(4, 6000);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each([0, 1])(
    'cannot stabilize a tiny whole clip from %s milliseconds of wall time',
    (wall) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/tiny-resume.mp3', durationSeconds: 0.05 };
      clock.startMedia(0, 0, 1, recording);
      clock.pause(0);
      clock.startMedia(0, 1000, 1, recording);
      clock.sample(0.05, 1000 + wall);
      expect(clock.snapshot(1000 + wall).seconds).toBe(0.05);
      expect(clock.snapshot(1000 + wall).recordingProgress?.coveredSeconds).toBe(0);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
    },
  );

  it('does not manufacture native pause permission from a repeated playing anchor', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/reanchored.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.startMedia(1.01, 1100, 1, recording);
    clock.sample(4, 4200);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it('rejects many individually small native pause gaps when their actual missing sum exceeds the budget', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/many-pauses.mp3', durationSeconds: 4 };
    let position = 0;
    let now = 0;
    clock.startMedia(position, now, 1, recording);
    for (const endpoint of [0.8, 1.8, 2.8]) {
      now += 1000;
      clock.sample(endpoint, now);
      clock.pause(now);
      position = endpoint + 0.09;
      now += 1000;
      clock.startMedia(position, now, 1, recording);
    }
    clock.sample(4, now + 1200);
    expect(clock.snapshot(now + 1200).recordingProgress?.coveredSeconds).toBeCloseTo(3.73, 6);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it.each([
    { label: 'large gap', next: { durationSeconds: 4, sourceId: 'first' }, position: 1.21 },
    { label: 'new generation', next: { durationSeconds: 4, sourceId: 'second' }, position: 1.05 },
    {
      label: 'changed duration',
      next: { durationSeconds: 4.1, sourceId: 'first' },
      position: 1.05,
    },
  ])('does not transfer native pause tolerance through $label', ({ next, position }) => {
    const clock = new PracticeClock();
    const recording = {
      url: 'https://example.org/fenced-gap.mp3',
      durationSeconds: 4,
      sourceId: 'first',
    };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    const replacement = { ...recording, ...next };
    clock.startMedia(position, 2000, 1, replacement);
    clock.sample(replacement.durationSeconds, 5200);
    expect(clock.finalizeRecording(replacement, true)?.completed).toBe(false);
  });

  it('invalid media observations revoke a previously retained native continuity candidate', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/failed-gap.mp3', durationSeconds: 4 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(1, 1000);
    clock.pause(1000);
    clock.startMedia(1, NaN, 1, recording);
    clock.startMedia(1.05, 2000, 1, recording);
    clock.sample(4, 5000);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
  });

  it('never uses a clipped plausible jump as source coverage, including tiny recordings', () => {
    for (const duration of [0.5, 3]) {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/clipped.mp3', durationSeconds: duration };
      clock.startMedia(0, 0, 1, recording);
      const jump = Math.min(duration, 2.5);
      const wall = Math.max(0, jump - 0.5);
      clock.sample(jump, wall * 1000);
      clock.sample(duration, (wall + duration - jump) * 1000);
      expect(clock.snapshot(10_000).seconds).toBeGreaterThan(0);
      expect(clock.finalizeRecording(recording, true)).toMatchObject({ completed: false });
      expect(clock.snapshot(10_000).recordingProgress?.coveredSeconds).toBeCloseTo(duration - jump);
    }
  });

  it('retains a seek hole even when the destination is within the end tolerance', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/seek.mp3', durationSeconds: 10 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(5, 5000);
    clock.suspendMedia();
    clock.startMedia(9.95, 5000, 1, recording);
    clock.sample(10, 5050);
    expect(clock.finalizeRecording(recording, true)).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(clock.snapshot(5050).seconds).toBeCloseTo(5.05);
  });

  it.each([0, 1])(
    'does not supply a tiny whole clip from %s milliseconds of jitter allowance',
    (wall) => {
      const clock = new PracticeClock();
      const recording = { url: 'https://example.org/tiny-jump.mp3', durationSeconds: 0.05 };
      clock.startMedia(0, 0, 1, recording);
      clock.sample(0.05, wall);
      // Existing bounded time accounting stays compatible, but a missed tiny seek
      // cannot use that allowance as whole-source coverage.
      expect(clock.snapshot(wall).seconds).toBe(0.05);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(false);
      expect(clock.snapshot(wall).recordingProgress?.coveredSeconds).toBe(0);
    },
  );

  it('accepts actual short native movement with positive wall time and bounded sample jitter', () => {
    const clock = new PracticeClock();
    const tiny = { url: 'https://example.org/tiny-real.mp3', durationSeconds: 0.05 };
    clock.startMedia(0, 0, 1, tiny);
    clock.sample(0.05, 50);
    expect(clock.finalizeRecording(tiny, true)?.completed).toBe(true);
    const short = { url: 'https://example.org/short-real.mp3', durationSeconds: 0.25 };
    clock.startMedia(0, 50, 1, short);
    clock.sample(0.25, 299); // 1ms native position/wall sampling difference.
    expect(clock.finalizeRecording(short, true)?.completed).toBe(true);
  });

  it('keeps delayed real background media eligible and generic native rates time-only', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/background-pass.mp3', durationSeconds: 120 };
    clock.startMedia(0, 0, 1, recording, false);
    clock.sample(120, 120_000);
    expect(clock.finalizeRecording(recording, true)?.completed).toBe(true);
    const fast = { url: 'https://example.org/rate.mp3', durationSeconds: 10 };
    clock.startMedia(0, 120_000, 2, fast);
    clock.sample(10, 125_000, 2);
    expect(clock.finalizeRecording(fast, true)).toMatchObject({
      completed: false,
      reason: 'rate-unsupported',
    });
    expect(clock.snapshot(125_000).recordings).toMatchObject([
      { seconds: 120, passes: { durations: [{ completedPasses: 1 }] } },
      { seconds: 5 },
    ]);
    expect(clock.snapshot(125_000).recordings[1].passes).toBeUndefined();
  });

  it('publishes terminal changes below a whole second and detaches saved pass measurements', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/tiny.mp3', durationSeconds: 0.25 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(0.25, 250);
    const before = clock.snapshot(250);
    clock.finalizeRecording(recording, true);
    const after = clock.snapshot(250);
    expect(Math.floor(after.seconds)).toBe(Math.floor(before.seconds));
    expect(after.recordingRevision).toBeGreaterThan(before.recordingRevision);
    expect(after.recordingOutcome?.completed).toBe(true);
    after.recordings[0].passes!.durations[0].completedPasses = 999;
    expect(clock.snapshot(250).recordings[0].passes?.durations[0].completedPasses).toBe(1);
    clock.reset();
    expect(clock.snapshot(250)).toMatchObject({ seconds: 0, recordings: [] });
    expect(clock.snapshot(250).recordingOutcome).toBeUndefined();
  });
});
