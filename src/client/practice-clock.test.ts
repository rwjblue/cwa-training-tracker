import { describe, expect, it } from 'vitest';
import { PracticeClock } from './practice-clock';

describe('practice time', () => {
  it('owns word listening only during actual word media, through replay/rate/seek and recall boundaries', () => {
    const clock = new PracticeClock();
    clock.startMedia(0, 0, 1, undefined, true, true);
    clock.sample(480, 480_000);
    clock.suspendMedia();
    clock.startManual(480_000, true);
    for (let now = 481_000; now <= 600_000; now += 1000) clock.snapshot(now);
    clock.pause(600_000);
    expect(clock.snapshot(600_000)).toMatchObject({
      seconds: 600,
      recallSeconds: 120,
      wordListeningSeconds: 480,
    });
    clock.startMedia(0, 600_000, 2, undefined, true, true);
    clock.sample(10, 605_000, 2);
    clock.sample(100, 606_000, 2); // rejected seek
    clock.sample(104, 608_000, 2);
    clock.suspendMedia();
    clock.startMedia(0, 610_000); // QSO/free source
    clock.sample(10, 620_000);
    clock.startMedia(0, 620_000, 1, { url: 'https://example.test/audio.wav' }, true, true);
    clock.sample(10, 630_000); // recording cannot also claim words
    expect(clock.snapshot(630_000)).toMatchObject({
      seconds: 627,
      recallSeconds: 120,
      wordListeningSeconds: 487,
    });
    clock.reset();
    expect(clock.snapshot(640_000).wordListeningSeconds).toBe(0);
  });
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

  it('projects a pass from accepted listening time before any terminal event', () => {
    const clock = new PracticeClock();
    const recording = {
      url: 'https://example.org/pass.mp3',
      durationSeconds: 120,
      sourceId: 'one',
    };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(115, 115_000);
    const beforeEnd = clock.snapshot(115_000);
    expect(beforeEnd.recordings[0].passes).toEqual({
      version: 2,
      method: 'native-1x-time',
      durations: [{ durationSeconds: 120, completedPasses: 1 }],
    });
    expect(beforeEnd.recordingOutcome).toBeUndefined();
    clock.sample(120, 120_000);
    expect(clock.finalizeRecording(recording, true)).toMatchObject({ completed: true });
    expect(clock.finalizeRecording(recording, true)).toBeUndefined();
    expect(clock.snapshot(120_000)).toMatchObject({
      seconds: 120,
      recordingProgress: { listenedSeconds: 120 },
      recordings: [{ seconds: 120, passes: { durations: [{ completedPasses: 1 }] } }],
    });
  });

  it('shares the same clipped native-jitter credit between listening seconds and pass counting', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/jitter.mp3', durationSeconds: 120 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(60, 59_800); // The existing time guard admits 59.9 seconds.
    clock.sample(120, 119_800);
    expect(clock.snapshot(119_800)).toMatchObject({
      recordings: [{ passes: { durations: [{ completedPasses: 1 }] } }],
    });
    expect(clock.snapshot(119_800).recordingOutcome).toBeUndefined();
    expect(clock.snapshot(119_800).seconds).toBeCloseTo(119.9, 9);
    expect(clock.snapshot(119_800).recordingProgress?.listenedSeconds).toBeCloseTo(119.9, 9);
  });

  it('counts cumulative rehearing while spending tolerance once within a still-open owner', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/rehearing.mp3', durationSeconds: 120 };
    for (let index = 0; index < 3; index++) {
      clock.startMedia(0, index * 60_000, 1, recording);
      clock.sample(60, (index + 1) * 60_000);
      clock.suspendMedia(); // Native rewind supplies no time by itself.
    }
    expect(clock.snapshot(180_000).recordings[0].passes?.durations[0].completedPasses).toBe(1);
    expect(clock.snapshot(180_000).recordingProgress?.listenedSeconds).toBe(180);
    clock.startMedia(0, 180_000, 1, recording);
    clock.sample(55, 235_000);
    expect(clock.snapshot(235_000).recordings[0].passes?.durations[0].completedPasses).toBe(2);
  });

  it('retains each independently ended replay without duplicating native final observations', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/replay.mp3', durationSeconds: 120 };
    for (let index = 0; index < 2; index++) {
      clock.startMedia(0, index * 115_000, 1, recording);
      clock.sample(115, (index + 1) * 115_000);
      expect(clock.finalizeRecording(recording, true)?.completed).toBe(true);
      expect(clock.finalizeRecording(recording, true)).toBeUndefined();
    }
    expect(clock.snapshot(230_000)).toMatchObject({
      seconds: 230,
      recordings: [{ passes: { durations: [{ durationSeconds: 120, completedPasses: 2 }] } }],
    });
  });

  it('retains accepted hearing across pause, buffering, recall and inspection without crediting gaps', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/retained.mp3', durationSeconds: 120 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(20, 20_000);
    clock.suspendMedia();
    clock.startMedia(20.25, 25_000, 1, recording);
    clock.sample(40, 44_750);
    clock.startManual(44_750, true);
    clock.snapshot(45_750);
    clock.pause(46_750);
    clock.startMedia(40, 100_000, 1, recording);
    clock.sample(120, 180_000);
    expect(clock.snapshot(180_000)).toMatchObject({
      seconds: 121.75,
      recallSeconds: 2,
      recordingProgress: { listenedSeconds: 119.75 },
      recordings: [{ seconds: 119.75, passes: { durations: [{ completedPasses: 1 }] } }],
    });
  });

  it('keeps a substantially skipped source incomplete without adding seek time', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/seek.mp3', durationSeconds: 120 };
    clock.startMedia(0, 0, 1, recording);
    clock.sample(20, 20_000);
    clock.suspendMedia();
    clock.startMedia(110, 20_000, 1, recording);
    clock.sample(120, 30_000);
    expect(clock.finalizeRecording(recording, true)).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(clock.snapshot(30_000)).toMatchObject({
      seconds: 30,
      recordingProgress: { listenedSeconds: 30 },
      recordings: [{ seconds: 30, passes: { durations: [{ completedPasses: 0 }] } }],
    });
  });

  it('does not combine partial hearing from a same-URL replacement and ignores its retired owner', () => {
    const clock = new PracticeClock();
    const first = {
      url: 'https://example.org/reloaded.mp3',
      durationSeconds: 120,
      sourceId: 'one',
    };
    const next = { ...first, sourceId: 'two' };
    clock.startMedia(0, 0, 1, first);
    clock.sample(60, 60_000);
    clock.discardRecording(first);
    clock.startMedia(60, 60_000, 1, next);
    clock.sample(120, 120_000);
    expect(clock.finalizeRecording(first, true)).toBeUndefined();
    expect(clock.finalizeRecording(next, true)?.completed).toBe(false);
    expect(clock.snapshot(120_000)).toMatchObject({
      seconds: 120,
      recordings: [{ seconds: 120, passes: { durations: [{ completedPasses: 0 }] } }],
    });
  });

  it('revises projected counts while native MP3 metadata refines the same loaded source', () => {
    const clock = new PracticeClock();
    const estimated = {
      url: 'https://example.org/estimate.mp3',
      sourceId: 'one',
      durationSeconds: 100,
    };
    clock.startMedia(0, 0, 1, estimated);
    clock.sample(95, 95_000);
    expect(clock.snapshot(95_000).recordings[0].passes?.durations[0].completedPasses).toBe(1);
    const actual = { ...estimated, durationSeconds: 120 };
    clock.refineRecordingDuration(actual);
    clock.startMedia(95, 95_000, 1, actual);
    expect(clock.snapshot(95_000).recordings[0].passes?.durations).toEqual([
      { durationSeconds: 120, completedPasses: 0 },
    ]);
    clock.sample(115, 115_000);
    expect(clock.snapshot(115_000)).toMatchObject({
      seconds: 115,
      recordingProgress: { listenedSeconds: 115 },
      recordings: [{ passes: { durations: [{ durationSeconds: 120, completedPasses: 1 }] } }],
    });
  });

  it('keeps sparse real background movement eligible and other native rates time-only', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/background.mp3', durationSeconds: 120 };
    clock.startMedia(0, 0, 1, recording, false);
    clock.sample(119.8, 120_000);
    expect(clock.snapshot(120_000, false).recordings[0].passes?.durations[0].completedPasses).toBe(
      1,
    );
    const fast = { url: 'https://example.org/rate.mp3', durationSeconds: 10 };
    clock.startMedia(0, 120_000, 2, fast);
    clock.sample(10, 125_000, 2);
    expect(clock.finalizeRecording(fast, true)).toMatchObject({
      completed: false,
      reason: 'rate-unsupported',
    });
    expect(clock.snapshot(125_000).recordings).toMatchObject([
      { seconds: 119.8, passes: { durations: [{ completedPasses: 1 }] } },
      { seconds: 5 },
    ]);
    expect(clock.snapshot(125_000).recordings[1].passes).toBeUndefined();
  });

  it('publishes a subsecond pass crossing and detaches saved measurements', () => {
    const clock = new PracticeClock();
    const recording = { url: 'https://example.org/tiny.mp3', durationSeconds: 0.25 };
    clock.startMedia(0, 0, 1, recording);
    const before = clock.snapshot(0);
    clock.sample(0.25, 250);
    const after = clock.snapshot(250);
    expect(Math.floor(after.seconds)).toBe(Math.floor(before.seconds));
    expect(after.recordingRevision).toBeGreaterThan(before.recordingRevision);
    expect(after.recordings[0].passes?.durations[0].completedPasses).toBe(1);
    after.recordings[0].passes!.durations[0].completedPasses = 999;
    expect(clock.snapshot(250).recordings[0].passes?.durations[0].completedPasses).toBe(1);
    clock.reset();
    expect(clock.snapshot(250)).toMatchObject({ seconds: 0, recordings: [] });
    expect(clock.snapshot(250).recordingOutcome).toBeUndefined();
  });
});
