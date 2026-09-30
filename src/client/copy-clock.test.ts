import { describe, expect, it } from 'vitest';
import { CopyClock } from './copy-clock';

describe('copy practice time', () => {
  it('counts content movement, excludes countdown and idle time, and credits replay', () => {
    const clock = new CopyClock();
    clock.startAudio(0, 0);
    clock.sampleAudio(0, 2000); // countdown has no content position
    clock.sampleAudio(3, 5000);
    clock.pauseAudio();
    clock.startThinking('answer', 5000);
    clock.startAudio(0, 9000); // replay ends the answer interval
    clock.sampleAudio(3, 12000);
    clock.pause(12000);
    expect(clock.snapshot(100000)).toMatchObject({
      audioSeconds: 6,
      answerSeconds: 4,
      reviewSeconds: 0,
    });
  });

  it('caps unattended answering and restores measured fractions without restarting', () => {
    const clock = new CopyClock({ audioSeconds: 1.25, answerSeconds: 0.75, reviewSeconds: 2 });
    clock.startThinking('answer', 0);
    expect(clock.snapshot(90000)).toMatchObject({
      audioSeconds: 1.25,
      answerSeconds: 30.75,
      idle: true,
    });
    clock.touch(90000);
    clock.pause(91000);
    const restored = new CopyClock(clock.snapshot(92000));
    expect(restored.snapshot(999000)).toMatchObject({
      audioSeconds: 1.25,
      answerSeconds: 31.75,
      reviewSeconds: 2,
      thinking: undefined,
    });
  });

  it('does not credit seeks or overlap focused review with audio', () => {
    const clock = new CopyClock();
    clock.startThinking('review', 0);
    clock.startAudio(0, 2000);
    clock.sampleAudio(60, 2100); // missing seek event is still not practice
    clock.pauseAudio();
    clock.startAudio(60, 2200);
    clock.sampleAudio(62, 4200);
    clock.pause(4200);
    expect(clock.snapshot(10000)).toMatchObject({
      audioSeconds: 2,
      answerSeconds: 0,
      reviewSeconds: 2,
    });
  });
});
