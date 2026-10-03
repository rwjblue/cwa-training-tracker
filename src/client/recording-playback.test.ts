import { describe, expect, it, vi } from 'vitest';
import { RecordingPlayback } from './recording-playback';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}

function setup() {
  const completion = deferred();
  const audio = { play: vi.fn(() => completion.promise), pause: vi.fn() };
  const callbacks = {
    owns: vi.fn(() => true),
    pending: vi.fn(),
    start: vi.fn(),
    beforePlay: vi.fn(),
    failed: vi.fn(),
  };
  return { completion, audio, callbacks, playback: new RecordingPlayback() };
}

describe('recording native Play ownership', () => {
  it('stops a delayed automatic continuation canceled before native playback starts', async () => {
    const { completion, audio, callbacks, playback } = setup();
    const playing = playback.play(audio, true, callbacks);
    expect(playback.pending?.automatic).toBe(true);
    playback.cancel();
    expect(playback.allowsNativePlay).toBe(false);
    completion.resolve();
    await playing;
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(callbacks.failed).not.toHaveBeenCalled();
    expect(callbacks.pending.mock.calls).toEqual([[true], [false]]);
  });

  it('ignores a canceled rejection without stopping the newly selected practice mode', async () => {
    const { completion, audio, callbacks, playback } = setup();
    const playing = playback.play(audio, true, callbacks);
    playback.cancel();
    completion.reject(new Error('Late autoplay rejection'));
    await playing;
    expect(audio.pause).not.toHaveBeenCalled();
    expect(callbacks.failed).not.toHaveBeenCalled();
    expect(callbacks.pending.mock.calls).toEqual([[true], [false]]);
  });

  it('retains a newer deliberate Play on the same transport when an older request resolves', async () => {
    const { completion, audio, callbacks, playback } = setup();
    const newer = deferred();
    audio.play.mockReturnValueOnce(completion.promise).mockReturnValueOnce(newer.promise);
    const first = playback.play(audio, true, callbacks);
    playback.cancel();
    const second = playback.play(audio, false, callbacks);
    completion.resolve();
    await first;
    expect(audio.pause).not.toHaveBeenCalled();
    expect(playback.pending?.automatic).toBe(false);
    expect(callbacks.pending.mock.calls).toEqual([[true], [true]]);
    newer.resolve();
    await second;
    expect(callbacks.pending.mock.calls).toEqual([[true], [true], [false]]);
  });

  it('stops a replaced source without clearing the new source request', async () => {
    const { completion, audio, callbacks, playback } = setup();
    const newer = setup();
    const first = playback.play(audio, true, callbacks);
    playback.detach();
    callbacks.owns.mockReturnValue(false);
    const second = playback.play(newer.audio, false, newer.callbacks);
    completion.resolve();
    await first;
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(newer.audio.pause).not.toHaveBeenCalled();
    expect(newer.callbacks.pending.mock.calls).toEqual([[true]]);
    newer.completion.resolve();
    await second;
    expect(newer.callbacks.pending.mock.calls).toEqual([[true], [false]]);
  });

  it('rejects an ineligible owner before calling native Play and ignores later ownership loss', async () => {
    const { completion, audio, callbacks, playback } = setup();
    callbacks.owns.mockReturnValue(false);
    await playback.play(audio, true, callbacks);
    expect(audio.play).not.toHaveBeenCalled();
    expect(callbacks.pending).not.toHaveBeenCalled();
    callbacks.owns.mockReturnValue(true);
    const playing = playback.play(audio, true, callbacks);
    callbacks.owns.mockReturnValue(false);
    completion.reject(new Error('Owner retired'));
    await playing;
    expect(callbacks.failed).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it('reports a current native failure, pauses its transport, and permits deliberate retry', async () => {
    const { completion, audio, callbacks, playback } = setup();
    const denied = new Error('Autoplay denied');
    const first = playback.play(audio, true, callbacks);
    completion.reject(denied);
    await first;
    expect(callbacks.failed).toHaveBeenCalledExactlyOnceWith(denied);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(playback.intended).toBe(false);
    audio.play.mockResolvedValue(undefined);
    await playback.play(audio, false, callbacks);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(callbacks.pending.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('clears only the active pending request when native playing arrives', async () => {
    const { completion, audio, callbacks, playback } = setup();
    const playing = playback.play(audio, true, callbacks);
    expect(playback.clearCurrentPending()).toBe(true);
    expect(playback.clearCurrentPending()).toBe(false);
    completion.resolve();
    await playing;
    // The native playing handler already cleared its visible pending state.
    expect(callbacks.pending.mock.calls).toEqual([[true]]);
  });
});
