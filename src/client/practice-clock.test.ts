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

  it('keeps manual/recall time separate, starts idempotently, and never caps a long exercise', () => {
    const clock = new PracticeClock();
    clock.startManual(0);
    clock.startManual(20_000);
    expect(clock.snapshot(1_200_000).seconds).toBe(1200);
    clock.startMedia(0, 1_200_000);
    clock.sample(10, 1_210_000);
    clock.suspendMedia();
    clock.startManual(1_220_000, true);
    clock.pause(1_240_000);
    expect(clock.snapshot(1_300_000)).toMatchObject({
      seconds: 1230,
      recallSeconds: 20,
      running: false,
    });
    clock.reset();
    expect(clock.snapshot(1_400_000)).toMatchObject({ seconds: 0, recallSeconds: 0 });
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
});
