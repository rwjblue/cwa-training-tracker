import { afterEach, describe, expect, it, vi } from 'vitest';
import { MorsePlayer, type MorseProgress } from './morse-player';
import { buildMorseTrack } from './morse-track';
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
