import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyntheticEvent } from 'react';
import { PracticeClock } from './practice-clock';
import { usePracticeClock } from './usePracticeClock';

const effects = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));

// Native event delivery belongs to Playwright. This single-mount hook harness
// keeps the actual clock and deterministic event ordering without a DOM runtime.
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));

class NativeAudio extends EventTarget {
  dataset = { recording: 'true', speed: '18' };
  src = 'https://example.org/ING-18.mp3';
  currentSrc = this.src;
  duration = 10;
  currentTime = 0;
  playbackRate = 1;
  readyState = 4;
  paused = false;
  ended = false;
  seeking = false;
  error: MediaError | null = null;
}

function setup() {
  let now = 0;
  const document = Object.assign(new EventTarget(), { hidden: false });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('document', document);
  vi.stubGlobal('HTMLAudioElement', NativeAudio);
  const hook = usePracticeClock();
  const audio = new NativeAudio();
  const emit = (type: string) => hook.onMedia({ type, target: audio } as unknown as SyntheticEvent);
  const move = (position: number, at: number) => {
    audio.currentTime = position;
    now = at;
  };
  const tick = () => vi.advanceTimersByTime(250);
  const show = () => {
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  emit('playing');
  return { hook, audio, document, emit, move, tick, show };
}

const passes = (hook: ReturnType<typeof usePracticeClock>) =>
  hook.snapshot().recordings[0]?.passes?.durations[0]?.completedPasses;

afterEach(() => {
  for (const cleanup of effects.cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native recording event reconciliation', () => {
  it.each(['pause', 'waiting', 'error'])(
    'ignores a queued %s event once the native owner is playing again',
    (type) => {
      const { hook, audio, emit, move } = setup();
      move(2, 2000);
      emit('timeupdate');
      // The native element has already resumed. Capture handlers see current
      // element state even when this event was queued by the previous playback.
      emit(type);
      expect(hook.snapshot().running).toBe(true);
      move(10, 10_000);
      audio.paused = true;
      audio.ended = true;
      emit('ended');
      expect(hook.snapshot().seconds).toBe(10);
      expect(passes(hook)).toBe(1);
    },
  );

  it.each(['tick', 'visibility', 'snapshot', 'pause', 'pauseMedia', 'startManual'] as const)(
    'finalizes the retained ended owner through %s after the movement anchor was paused',
    (observer) => {
      const finalized = vi.spyOn(PracticeClock.prototype, 'finalizeRecording');
      const { hook, audio, document, emit, move, tick, show } = setup();
      move(9.9, 9900);
      emit('timeupdate');
      audio.paused = true;
      emit('pause');
      expect(finalized).not.toHaveBeenCalled();
      // Background playback can reach its terminal state before the queued
      // ended callback is delivered. Unlock/save must settle the surviving owner.
      document.hidden = true;
      move(10, 10_000);
      audio.ended = true;
      if (observer === 'tick') tick();
      else if (observer === 'visibility') show();
      else if (observer === 'snapshot') hook.snapshot();
      else if (observer === 'pause') hook.pause();
      else if (observer === 'pauseMedia') hook.pauseMedia();
      else hook.startManual();
      expect(finalized.mock.results.some((result) => result.value?.completed === true)).toBe(true);
      expect(passes(hook)).toBe(1);
      // Repeated terminal observations and the eventual native callback cannot
      // earn another pass or add time while the source is paused.
      const seconds = hook.snapshot().seconds;
      emit('ended');
      show();
      tick();
      hook.pause();
      expect(passes(hook)).toBe(1);
      expect(hook.snapshot().seconds).toBe(seconds);
    },
  );

  it('keeps a genuine buffer boundary paused and recovers its terminal owner', () => {
    const { hook, audio, emit, move, show } = setup();
    move(9.9, 9900);
    emit('timeupdate');
    audio.readyState = 2;
    emit('waiting');
    expect(hook.snapshot().running).toBe(false);
    move(10, 10_000);
    audio.readyState = 4;
    audio.paused = true;
    audio.ended = true;
    show();
    expect(passes(hook)).toBe(1);
  });

  it('keeps a genuine native error suspended and revokes its resume-gap permission', () => {
    const { hook, audio, emit, move } = setup();
    move(2, 2000);
    emit('timeupdate');
    audio.error = { code: 2, message: 'Network error' } as MediaError;
    emit('error');
    expect(hook.snapshot().running).toBe(false);
    audio.error = null;
    move(2.05, 2500);
    emit('playing');
    move(10, 10_450);
    audio.paused = true;
    audio.ended = true;
    emit('ended');
    expect(passes(hook)).toBe(0);
    expect(hook.snapshot().recordingOutcome).toMatchObject({ completed: false });
  });

  it('retires a same-URL reloaded owner before a late ended event and keeps the new source isolated', () => {
    const { hook, audio, emit, move } = setup();
    move(5, 5000);
    emit('timeupdate');
    audio.paused = true;
    emit('pause');
    emit('emptied');
    move(10, 10_000);
    audio.ended = true;
    emit('ended');
    expect(hook.snapshot().recordingOutcome).toBeUndefined();
    expect(passes(hook)).toBe(0);

    // A reload of this exact URL creates a new generation. Hearing its second
    // half cannot join the first generation's first half into a full pass.
    move(5, 20_000);
    audio.paused = false;
    audio.ended = false;
    emit('playing');
    move(10, 25_000);
    audio.paused = true;
    audio.ended = true;
    emit('ended');
    expect(hook.snapshot().seconds).toBe(10);
    expect(passes(hook)).toBe(0);
    expect(hook.snapshot().recordingOutcome).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
  });

  it('does not turn a paused partial source reaching ended into a full pass', () => {
    const { hook, audio, emit, move } = setup();
    move(3, 3000);
    emit('timeupdate');
    audio.paused = true;
    emit('pause');
    move(10, 10_000);
    audio.ended = true;
    hook.pause();
    expect(passes(hook)).toBe(0);
    expect(hook.snapshot().recordingOutcome).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(hook.snapshot().seconds).toBe(3);
  });

  it('preserves a deliberate seek hole when later terminal observations recover completion', () => {
    const { hook, audio, emit, move } = setup();
    move(3, 3000);
    emit('timeupdate');
    audio.seeking = true;
    move(9.8, 3000);
    emit('seeking');
    audio.seeking = false;
    emit('seeked');
    move(10, 3200);
    audio.paused = true;
    audio.ended = true;
    hook.snapshot();
    expect(passes(hook)).toBe(0);
    expect(hook.snapshot().recordingOutcome).toMatchObject({
      completed: false,
      reason: 'incomplete',
    });
    expect(hook.snapshot().seconds).toBeCloseTo(3.2);
  });
});
