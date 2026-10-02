import { buildMorseTrack, renderMorseWav, wordAtTime, type MorseTrack } from './morse-track';
import { MediaSessionController } from './media-session';

export type MorsePlaybackState = 'idle' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
export interface MorseProgress {
  position: number;
  duration: number;
  wordIndex: number;
  itemIndex: number;
  state: MorsePlaybackState;
}
export interface MorsePlayerOptions {
  title?: string;
  loop?: boolean;
  /** Native volume where supported; otherwise retained in the rendered WAV. */
  volume?: number;
  /** The current in-app owner may pause transport without replacing this source. */
  canPlay?: () => boolean;
  onProgress?: (progress: MorseProgress) => void;
  onState?: (state: MorsePlaybackState) => void;
  onFinish?: () => void;
  onError?: (message: string) => void;
}

/** A persistent native media element owns playback, including every pause in a round. */
export class MorsePlayer {
  private audio: HTMLAudioElement | null = null;
  private ownsAudio = false;
  private objectUrl: string | null = null;
  private recording: MorseTrack | null = null;
  private options: MorsePlayerOptions = {};
  private status: MorsePlaybackState = 'idle';
  private generation = 0;
  private rejectLatePlay = false;
  private nativeVolume = false;
  private pendingSeek: number | undefined;
  private frame: number | undefined;
  private lastFrame = 0;
  private disposed = false;
  private listeners: [string, EventListener][] = [];
  private mediaSession = new MediaSessionController();

  get paused() {
    return this.audio?.paused ?? true;
  }
  /** A natural loop reaches the native tail; an explicit rewind does not. */
  get playedToEnd() {
    const audio = this.audio;
    return Boolean(
      this.recording &&
      audio &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0 &&
      audio.played.length &&
      audio.played.end(audio.played.length - 1) >= audio.duration,
    );
  }

  get supportsVolume() {
    return this.nativeVolume;
  }
  setVolume(volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error('Choose a valid volume.');
    if (this.audio && this.nativeVolume) this.audio.volume = volume;
    return this.nativeVolume;
  }

  get track() {
    return this.recording;
  }
  get position() {
    const at = this.pendingSeek ?? this.audio?.currentTime ?? 0;
    return Math.max(0, Math.min(this.recording?.duration ?? 0, Number.isFinite(at) ? at : 0));
  }

  /** Attach a visible <audio controls> supplied by the UI. Its DOM remains owned by React. */
  attach(audio: HTMLAudioElement) {
    // React StrictMode can replay effect/ref cleanup before attaching the same player again.
    this.disposed = false;
    if (audio === this.audio) return;
    this.releaseAudio();
    this.audio = audio;
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    const priorVolume = audio.volume;
    audio.volume = 0.5;
    this.nativeVolume = audio.volume === 0.5;
    audio.volume = priorVolume;
    this.listen('play', () => {
      if (!audio.paused) this.rejectLatePlay = false;
    });
    this.listen('playing', () => {
      if (!this.recording || audio.paused) return;
      if (this.rejectLatePlay || this.options.canPlay?.() === false) {
        this.pause();
        return;
      }
      this.claimMediaSession();
      this.setState('playing');
      this.startFrames();
    });
    this.listen('pause', () => {
      if (audio.paused) this.rejectLatePlay = true;
      if (audio.paused && !audio.ended && this.status === 'playing') {
        this.generation++;
        this.cancelFrames();
        this.setState('paused');
      }
    });
    this.listen('timeupdate', () => this.progress());
    this.listen('seeking', () => this.progress());
    this.listen('seeked', () => {
      if (this.status === 'ended' && this.position < (this.recording?.duration ?? 0))
        this.setState(audio.paused ? 'paused' : 'playing');
      else this.progress();
    });
    this.listen('ratechange', () => this.progress());
    this.listen('loadedmetadata', () => {
      if (this.pendingSeek !== undefined) {
        const at = this.pendingSeek;
        this.pendingSeek = undefined;
        audio.currentTime = at;
      }
      this.progress();
    });
    this.listen('ended', () => {
      if (!this.recording || !audio.ended || this.status === 'ended') return;
      this.cancelFrames();
      this.setState('ended');
      this.options.onFinish?.();
    });
    this.listen('error', () => {
      if (this.recording && audio.error)
        this.fail('The recording could not play. Press Play to try again.');
    });
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.visible);
  }

  prepare(
    track: MorseTrack,
    options: MorsePlayerOptions = {},
    replacement?: {
      /** Recheck a word boundary after synchronous PCM rendering. */
      acceptsPosition?: (position: number) => boolean;
      /** Settle the still-playing old source and map its final native position. */
      beforeReplace: (position: number) => number;
    },
  ): number | false {
    this.disposed = false;
    this.ensureAudio();
    const volume = options.volume ?? track.volume;
    const wav = renderMorseWav({ ...track, volume: this.nativeVolume ? 1 : volume });
    const url = URL.createObjectURL(wav);
    const playbackRate = replacement && this.recording ? this.audio!.playbackRate : 1;
    const previousPosition = this.position;
    if (replacement?.acceptsPosition?.(previousPosition) === false) {
      URL.revokeObjectURL(url);
      return false;
    }
    let start: number;
    try {
      start = replacement?.beforeReplace(previousPosition) ?? 0;
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    this.generation++;
    this.cancelFrames();
    if (!replacement || !this.recording) this.mediaSession.release();
    this.status = 'idle';
    this.options = {};
    this.audio!.pause();
    const previousUrl = this.objectUrl;
    this.objectUrl = url;
    this.recording = track;
    this.options = options;
    // Loading a new source already starts at zero. Only defer an explicit seek;
    // seeking again during loadedmetadata can disrupt a pending native play.
    this.pendingSeek = undefined;
    this.setVolume(volume);
    this.rejectLatePlay = true;
    this.audio!.loop = options.loop === true;
    this.audio!.src = url;
    this.audio!.load();
    this.audio!.playbackRate = playbackRate;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    this.setState('ready');
    return start;
  }

  /** Call directly from a click or media-session action to retain browser playback permission. */
  async resume(): Promise<void> {
    if (this.disposed || !this.audio || !this.recording) return;
    if (this.options.canPlay?.() === false) return;
    if (this.position >= this.recording.duration || this.audio.ended) {
      // Replaying an ended recording is a new start, not a user pause. In
      // particular, foreground spoken sequences must survive this rewind.
      if (this.status === 'ended') this.setState('ready');
      this.seek(0);
    }
    const run = ++this.generation;
    this.rejectLatePlay = false;
    try {
      // No await, async render, context.resume(), or timer before this native play call.
      await this.audio.play();
    } catch (error) {
      if (this.disposed || run !== this.generation) return;
      const message =
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Your browser paused audio. Tap Play to continue.'
          : 'Audio was interrupted. Press Play to try again.';
      this.fail(message);
      throw new Error(message);
    }
    if (this.disposed || run !== this.generation || this.audio.paused) return;
    if (this.options.canPlay?.() === false) {
      this.pause();
      return;
    }
    this.claimMediaSession();
    this.setState('playing');
    this.startFrames();
  }

  pause() {
    this.rejectLatePlay = true;
    this.generation++;
    this.cancelFrames();
    this.audio?.pause();
    if (this.recording) this.setState('paused');
  }

  seek(seconds: number) {
    if (!this.audio || !this.recording || !Number.isFinite(seconds)) return;
    const at = Math.min(this.recording.duration, Math.max(0, seconds));
    this.pendingSeek = this.audio.readyState === 0 ? at : undefined;
    try {
      this.audio.currentTime = at;
    } catch {
      // Safari can defer seeks until metadata is available. loadedmetadata applies this target.
      this.pendingSeek = at;
    }
    if (this.status === 'ended' && at < this.recording.duration) this.setState('paused');
    else this.progress();
  }

  seekWord(index: number) {
    const word = this.recording?.words[index];
    if (word) this.seek(word.start);
  }

  stop() {
    this.pause();
    this.seek(0);
  }

  /** Invalidate a recording without detaching the UI-owned native controls. */
  clear() {
    this.generation++;
    this.cancelFrames();
    const onState = this.options.onState;
    this.options = {};
    this.recording = null;
    this.pendingSeek = undefined;
    this.status = 'idle';
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.mediaSession.release();
    onState?.('idle');
  }

  /** Compatibility for short free-practice and foreground spoken-answer sequences. */
  async play(
    text: string,
    characterWpm: number,
    effectiveWpm: number,
    frequency: number,
    volume: number,
    onFinish: () => void,
  ): Promise<number> {
    const track = buildMorseTrack([{ text }], { characterWpm, effectiveWpm, frequency, volume });
    this.prepare(track, { onFinish });
    await this.resume();
    return track.duration;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseAudio();
  }

  private ensureAudio() {
    if (this.audio) return;
    const audio = document.createElement('audio');
    audio.hidden = true;
    audio.setAttribute('aria-label', 'Morse practice audio');
    this.attach(audio);
    this.ownsAudio = true;
    document.body.appendChild(audio);
  }

  private listen(name: string, listener: EventListener) {
    this.listeners.push([name, listener]);
    this.audio!.addEventListener(name, listener);
  }

  private releaseAudio() {
    this.generation++;
    this.cancelFrames();
    this.options = {};
    for (const [name, listener] of this.listeners) this.audio?.removeEventListener(name, listener);
    this.listeners = [];
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.visible);
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      if (this.ownsAudio) this.audio.remove();
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.audio = null;
    this.ownsAudio = false;
    this.recording = null;
    this.pendingSeek = undefined;
    this.status = 'idle';
    this.mediaSession.release();
  }

  private setState(state: MorsePlaybackState) {
    const changed = this.status !== state;
    this.status = state;
    if (changed) this.options.onState?.(state);
    this.progress();
  }

  private fail(message: string) {
    this.generation++;
    this.cancelFrames();
    this.audio?.pause();
    this.setState('error');
    this.options.onError?.(message);
  }

  private progress() {
    if (!this.recording) return;
    const position = this.position;
    const wordIndex = wordAtTime(this.recording, position);
    this.options.onProgress?.({
      position,
      duration: this.recording.duration,
      wordIndex,
      itemIndex: this.recording.words[wordIndex]?.itemIndex ?? -1,
      state: this.status,
    });
    this.updateMediaPosition();
  }

  // This animation updates only the visible transcript; native media owns all audio timing.
  private visible = () => {
    this.progress();
    if (document.hidden) this.cancelFrames();
    else this.startFrames();
  };

  private startFrames() {
    if (
      this.frame !== undefined ||
      this.status !== 'playing' ||
      typeof requestAnimationFrame === 'undefined' ||
      document.hidden
    )
      return;
    const tick = (at: number) => {
      this.frame = undefined;
      if (this.status !== 'playing' || document.hidden) return;
      if (at - this.lastFrame >= 50) {
        this.lastFrame = at;
        this.progress();
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private cancelFrames() {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private claimMediaSession() {
    this.mediaSession.claim({
      title: this.options.title ?? 'Morse practice',
      onPlay: () => this.resume(),
      onPause: () => this.pause(),
      onStop: () => {
        if (this.options.canPlay?.() !== false) this.stop();
      },
      onSeek: (seconds) => {
        if (this.options.canPlay?.() !== false) this.seek(seconds);
      },
      getPosition: () =>
        this.recording
          ? {
              duration: this.recording.duration,
              position: this.position,
              playbackRate: this.audio?.playbackRate || 1,
            }
          : undefined,
    });
  }

  private updateMediaPosition() {
    this.mediaSession.setPlaybackState(this.status === 'playing' ? 'playing' : 'paused');
    this.mediaSession.updatePosition();
  }
}
