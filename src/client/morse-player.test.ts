import { afterEach, describe, expect, it, vi } from 'vitest';
import { MorsePlayer, type MorseProgress } from './morse-player';
import { buildMorseTrack, renderMorseWav } from './morse-track';
import { MediaSessionController } from './media-session';

// Native media behavior is covered in Playwright. This small boundary fake lets us
// deterministically exercise permission rejection, metadata delays, and cleanup races.
class MediaElement extends EventTarget {
  currentTime = 0;
  readyState = 0;
  paused = true;
  ended = false;
  error: MediaError | null = null;
  src = '';
  preload = '';
  loop = false;
  playbackRate = 1;
  volume = 1;
  setAttribute() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  load() {
    this.readyState = 0;
    this.currentTime = 0;
    this.ended = false;
  }
  metadata() {
    this.readyState = 1;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
  });
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}
const track = () =>
  buildMorseTrack([{ text: 'CQ DE' }, { text: 'N1RWJ', frequency: 650 }], {
    characterWpm: 20,
    effectiveWpm: 10,
    frequency: 600,
    volume: 0.4,
  });
const attach = (player: MorsePlayer, audio: MediaElement) =>
  player.attach(audio as unknown as HTMLAudioElement);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native media playback boundary', () => {
  it('keeps previously claimed platform transport through a paused retiming without autoplay', async () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const session = {
      playbackState: 'none',
      metadata: null,
      setPositionState: vi.fn(),
      setActionHandler: (action: string, handler: MediaSessionActionHandler | null) =>
        handlers.set(action, handler),
    };
    vi.stubGlobal('navigator', { mediaSession: session });
    const player = new MorsePlayer();
    const audio = new MediaElement();
    attach(player, audio);
    player.prepare(track());
    audio.metadata();
    await player.resume();
    player.pause();
    const platformPlay = handlers.get('play');
    expect(platformPlay).toBeTypeOf('function');
    audio.playbackRate = 1.25;
    const at = player.prepare(track(), {}, { beforeReplace: () => 1.25 });
    expect(audio.playbackRate).toBe(1.25);
    player.seek(at as number);
    audio.metadata();
    expect(handlers.get('play')).toBe(platformPlay);
    expect(session.playbackState).toBe('paused');
    expect(player.position).toBe(1.25);
    expect(audio.paused).toBe(true);
    platformPlay?.({ action: 'play' });
    await Promise.resolve();
    expect(audio.paused).toBe(false);
    expect(player.position).toBe(1.25);
    player.dispose();
  });
  it('distinguishes native tail playback from a seek near the loop seam', () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    let end = 0;
    let duration = Number.NaN;
    Object.defineProperties(audio, {
      duration: { get: () => duration },
      played: { get: () => ({ length: end ? 1 : 0, end: () => end }) },
    });
    attach(player, audio);
    player.prepare(track());
    expect(player.playedToEnd).toBe(false);
    duration = player.track!.duration;
    end = duration - 0.35;
    player.seek(0);
    expect(player.playedToEnd).toBe(false);
    end = duration;
    expect(player.playedToEnd).toBe(true);
    player.clear();
    expect(player.playedToEnd).toBe(false);
    player.dispose();
  });

  it('changes native volume without reloading, seeking or interrupting playback', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    attach(player, audio);
    const load = vi.spyOn(audio, 'load');
    player.prepare(track());
    audio.metadata();
    await player.resume();
    audio.currentTime = 1.25;
    const source = audio.src;
    expect(player.supportsVolume).toBe(true);
    expect(audio.volume).toBe(0.4);
    player.setVolume(0);
    expect(audio.volume).toBe(0);
    player.setVolume(0.9);
    expect(audio.volume).toBe(0.9);
    expect(audio.paused).toBe(false);
    expect(player.position).toBe(1.25);
    expect(audio.src).toBe(source);
    expect(load).toHaveBeenCalledOnce();
    expect(() => player.setVolume(2)).toThrow('valid volume');
    player.dispose();
  });
  it('retains baked volume for native elements that leave volume under device control', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    Object.defineProperty(audio, 'volume', { get: () => 1, set: () => {} });
    attach(player, audio);
    const wav = vi.spyOn(URL, 'createObjectURL');
    player.prepare(track(), { volume: 0.2 });
    expect(player.supportsVolume).toBe(false);
    expect(player.setVolume(0.8)).toBe(false);
    expect(wav).toHaveBeenCalledOnce();
    const actual = wav.mock.calls[0][0] as Blob;
    expect(new Uint8Array(await actual.arrayBuffer())).toEqual(
      new Uint8Array(await renderMorseWav({ ...track(), volume: 0.2 }).arrayBuffer()),
    );
    expect(audio.volume).toBe(1);
    player.dispose();
  });
  it('rechecks the still-playing native boundary after rendering and settles only an accepted replacement', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    attach(player, audio);
    const prior = track();
    player.prepare(prior);
    audio.metadata();
    await player.resume();
    audio.currentTime = 1;
    const source = audio.src;
    const create = URL.createObjectURL;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      audio.currentTime = 1.5;
      return create(blob);
    });
    const settle = vi.fn((at: number) => at / 2);
    expect(
      player.prepare(track(), {}, { acceptsPosition: (at) => at < 1.4, beforeReplace: settle }),
    ).toBe(false);
    expect(settle).not.toHaveBeenCalled();
    expect(audio.paused).toBe(false);
    expect(audio.src).toBe(source);
    expect(player.track).toBe(prior);
    const at = player.prepare(
      track(),
      {},
      { acceptsPosition: (at) => at < 2, beforeReplace: settle },
    );
    expect(at).toBe(0.75);
    expect(settle).toHaveBeenCalledExactlyOnceWith(1.5);
    player.seek(at as number);
    audio.metadata();
    expect(player.position).toBe(0.75);
    expect(audio.paused).toBe(true);
    player.dispose();
  });
  it('rejects a late resume after an explicit pause, material replacement or disposal', async () => {
    for (const cancel of ['pause', 'native-pause', 'replace', 'dispose'] as const) {
      const player = new MorsePlayer();
      const audio = new MediaElement();
      attach(player, audio);
      player.prepare(track());
      let resolve!: () => void;
      audio.play.mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      );
      const pending = player.resume();
      if (cancel === 'pause') player.pause();
      else if (cancel === 'native-pause') audio.pause();
      else if (cancel === 'replace') player.prepare(track());
      else player.dispose();
      if (cancel !== 'dispose') {
        audio.paused = false;
        audio.dispatchEvent(new Event('playing'));
        expect(audio.paused).toBe(true);
      }
      resolve();
      await pending;
      player.dispose();
    }
  });
  it('retains its source and position while an inspected owner rejects platform transport', async () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    vi.stubGlobal('navigator', {
      mediaSession: {
        playbackState: 'none',
        metadata: null,
        setPositionState: vi.fn(),
        setActionHandler: (action: string, handler: MediaSessionActionHandler | null) =>
          handlers.set(action, handler),
      },
    });
    let visible = true;
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const load = vi.spyOn(audio, 'load');
    attach(player, audio);
    player.prepare(track(), { canPlay: () => visible });
    audio.metadata();
    await player.resume();
    audio.currentTime = 1.25;
    const source = audio.src;
    visible = false;
    player.pause();

    handlers.get('play')?.({ action: 'play' });
    handlers.get('seekto')?.({ action: 'seekto', seekTime: 3 });
    handlers.get('stop')?.({ action: 'stop' });
    await player.resume();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.paused).toBe(true);
    expect(player.position).toBe(1.25);
    expect(audio.src).toBe(source);
    expect(load).toHaveBeenCalledOnce();

    visible = true;
    expect(audio.paused).toBe(true); // Returning releases permission, not playback.
    expect(audio.play).toHaveBeenCalledOnce();
    await player.resume();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(player.position).toBe(1.25);
    expect(audio.src).toBe(source);
    player.dispose();
  });

  it('pauses a late native playing event after inspection without reporting an active owner', async () => {
    let visible = true;
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const onState = vi.fn();
    const onError = vi.fn();
    attach(player, audio);
    player.prepare(track(), { canPlay: () => visible, onState, onError });
    audio.metadata();
    let resolve!: () => void;
    audio.play.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const starting = player.resume();
    visible = false;
    player.pause();
    audio.paused = false;
    audio.dispatchEvent(new Event('playing'));
    resolve();
    await starting;
    expect(audio.paused).toBe(true);
    expect(onState).not.toHaveBeenCalledWith('playing');
    expect(onError).not.toHaveBeenCalled();
    expect(player.track).not.toBeNull();
    player.dispose();
  });

  it('replays a completed word without replacing its source or reporting a pause', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const onState = vi.fn();
    const onFinish = vi.fn();
    const load = vi.spyOn(audio, 'load');
    const recording = track();
    attach(player, audio);
    player.prepare(recording, { onState, onFinish });
    const source = audio.src;
    // Metadata delivery must not rewind media that has already started moving.
    audio.currentTime = 0.05;
    audio.metadata();
    expect(audio.currentTime).toBe(0.05);
    await player.resume();
    for (let repeat = 0; repeat < 3; repeat++) {
      if (repeat > 0) {
        await player.resume();
        expect(audio.currentTime).toBe(0);
        audio.ended = false;
      }
      audio.currentTime = recording.duration;
      audio.ended = true;
      audio.paused = true;
      audio.dispatchEvent(new Event('ended'));
    }
    expect(onFinish).toHaveBeenCalledTimes(3);
    expect(onState).not.toHaveBeenCalledWith('paused');
    expect(audio.src).toBe(source);
    expect(load).toHaveBeenCalledOnce();
    player.pause();
    expect(onState).toHaveBeenLastCalledWith('paused');
    player.dispose();
  });

  it('settles the prior position before clamped seeks without changing paused or playing state', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const positions: number[] = [];
    attach(player, audio);
    player.prepare(track(), { onBeforeSeek: () => positions.push(audio.currentTime) });
    audio.metadata();
    const source = audio.src;
    player.seek(1);
    expect(positions).toEqual([0]);
    expect(audio.paused).toBe(true);
    await player.resume();
    audio.currentTime = 1.2;
    player.seekWord(2);
    expect(positions.at(-1)).toBe(1.2);
    expect(audio.paused).toBe(false);
    expect(player.selectedWordIndex).toBe(2);
    player.seekBy(-10);
    expect(player.position).toBe(0);
    expect(audio.paused).toBe(false);
    const calls = positions.length;
    player.seek(0); // A no-op cannot suspend accounting waiting for a nonexistent seeked.
    player.seek(Number.NaN);
    player.seekWord(-1);
    expect(positions).toHaveLength(calls);
    player.pause();
    player.seek(Number.MAX_SAFE_INTEGER);
    expect(player.position).toBe(player.track!.duration);
    expect(player.selectedWordIndex).toBe(player.track!.words.length - 1);
    expect(audio.paused).toBe(true);
    expect(audio.src).toBe(source);
    player.dispose();
  });

  it('retains a duplicate occurrence before metadata and after ended until explicit resume', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const progress: MorseProgress[] = [];
    const recording = buildMorseTrack([{ text: 'E E E' }], {
      characterWpm: 30,
      effectiveWpm: 20,
      frequency: 600,
      volume: 0.4,
    });
    attach(player, audio);
    player.prepare(recording, { onProgress: (value) => progress.push(value) });
    player.seekWord(1);
    player.seekWord(2);
    audio.currentTime = 0;
    expect(player.selectedWordIndex).toBe(2);
    audio.metadata();
    audio.currentTime = Math.round(audio.currentTime * 1e6) / 1e6;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(progress.at(-1)).toMatchObject({ wordIndex: 2, state: 'ready' });
    expect(audio.paused).toBe(true);
    audio.currentTime = recording.duration;
    audio.ended = true;
    audio.dispatchEvent(new Event('ended'));
    player.seekWord(1);
    expect(progress.at(-1)).toMatchObject({ wordIndex: 1, state: 'paused' });
    // A native ended flag can remain stale until the pending seeked event.
    await player.resume();
    expect(player.position).toBe(recording.words[1].start);
    expect(audio.paused).toBe(false);
    player.dispose();
  });

  it('preserves a word seek before metadata, follows native time, and resumes without replacing audio', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const updates: MorseProgress[] = [];
    const finish = vi.fn();
    const recording = track();
    attach(player, audio);
    player.prepare(recording, { onProgress: (value) => updates.push(value), onFinish: finish });
    const url = audio.src;
    player.seekWord(2);
    expect(player.position).toBe(recording.words[2].start);
    audio.currentTime = 0; // A browser may ignore a seek until metadata is available.
    audio.metadata();
    expect(audio.currentTime).toBe(recording.words[2].start);
    await player.resume();
    audio.currentTime += 0.2;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(updates.at(-1)).toMatchObject({
      wordIndex: 2,
      itemIndex: 1,
      state: 'playing',
      position: audio.currentTime,
    });
    player.pause();
    const pausedAt = player.position;
    await player.resume();
    expect(player.position).toBe(pausedAt);
    expect(audio.src).toBe(url);
    expect(finish).not.toHaveBeenCalled();
    audio.currentTime = recording.duration;
    audio.ended = true;
    audio.dispatchEvent(new Event('ended'));
    expect(finish).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({ state: 'ended', wordIndex: -1 });
    player.dispose();
  });

  it('ignores an obsolete play rejection and releases old recordings without removing UI audio', async () => {
    const player = new MorsePlayer();
    const audio = new MediaElement();
    const error = vi.fn();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    attach(player, audio);
    player.prepare(track(), { onError: error });
    const firstUrl = audio.src;
    let reject!: (error: Error) => void;
    audio.play.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const starting = player.resume();
    player.prepare(track(), { onError: error });
    reject(new Error('Interrupted by replacing the recording'));
    await starting;
    expect(error).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(firstUrl);
    const secondUrl = audio.src;
    player.clear();
    expect(audio.src).toBe('');
    expect(player.track).toBeNull();
    expect(revoke).toHaveBeenCalledWith(secondUrl);
    player.prepare(track());
    expect(audio.src).toMatch(/^blob:/);
    player.dispose();
    // StrictMode's intentional cleanup/re-attach cycle can reuse the same player.
    attach(player, audio);
    player.prepare(track(), { onError: error });
    audio.play.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'));
    await expect(player.resume()).rejects.toThrow('Tap Play');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Tap Play'));
    player.dispose();
  });

  it('routes lock-screen seek/pause/resume to the active player and clears only its own handlers', async () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const mediaSession = {
      playbackState: 'none',
      metadata: null,
      setPositionState: vi.fn(),
      setActionHandler: (action: string, handler: MediaSessionActionHandler | null) =>
        handlers.set(action, handler),
    };
    vi.stubGlobal('navigator', { mediaSession });
    const first = new MorsePlayer();
    const second = new MorsePlayer();
    const firstAudio = new MediaElement();
    const secondAudio = new MediaElement();
    attach(first, firstAudio);
    attach(second, secondAudio);
    first.prepare(track());
    firstAudio.metadata();
    await first.resume();
    handlers.get('seekto')?.({ action: 'seekto', seekTime: 2 });
    expect(first.position).toBe(2);
    handlers.get('pause')?.({ action: 'pause' });
    expect(firstAudio.paused).toBe(true);
    second.prepare(track(), { loop: true });
    secondAudio.metadata();
    await second.resume();
    expect(secondAudio.loop).toBe(true);
    first.dispose();
    expect(handlers.get('play')).toBeTypeOf('function');
    handlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 1 });
    expect(second.position).toBe(1);
    second.dispose();
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
    expect(mediaSession.playbackState).toBe('none');
  });

  it('claims shared recording controls only after successful playback and preserves ownership on rejection', async () => {
    const mediaSession = {
      playbackState: 'none',
      metadata: null as MediaMetadata | null,
      setPositionState: vi.fn(),
      setActionHandler: vi.fn(),
    };
    vi.stubGlobal('navigator', { mediaSession });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(values: MediaMetadataInit) {
          Object.assign(this, values);
        }
      },
    );
    const official = new MediaSessionController();
    const pauseOfficial = vi.fn();
    official.claim({
      title: 'WD101-13',
      onPlay: vi.fn(),
      onPause: pauseOfficial,
      onSeek: vi.fn(),
      getPosition: () => ({ duration: 200, position: 10 }),
    });
    const player = new MorsePlayer();
    const audio = new MediaElement();
    attach(player, audio);
    player.prepare(track(), { title: 'A first contact' });
    expect(mediaSession.metadata?.title).toBe('WD101-13');
    audio.play.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await expect(player.resume()).rejects.toThrow('Tap Play');
    expect(pauseOfficial).not.toHaveBeenCalled();
    expect(mediaSession.metadata?.title).toBe('WD101-13');
    await player.resume();
    expect(pauseOfficial).toHaveBeenCalledOnce();
    expect(mediaSession.metadata?.title).toBe('A first contact');
    official.release();
    expect(mediaSession.metadata?.title).toBe('A first contact');
    player.dispose();
    expect(mediaSession.metadata).toBeNull();
  });
});
