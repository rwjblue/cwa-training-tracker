export interface MediaSessionPosition {
  duration: number;
  position: number;
  playbackRate?: number;
}

export interface MediaSessionOptions {
  title: string;
  artist?: string;
  album?: string;
  onPlay: () => void | Promise<void>;
  onPause: () => void;
  onStop?: () => void;
  onSeek: (seconds: number) => void;
  getPosition: () => MediaSessionPosition | undefined;
}

// Raster exports of public/favicon.svg. Prefer the large icon even on older
// platforms that pick the first artwork entry instead of inspecting its size.
export const CWA_MEDIA_ARTWORK = [
  { src: '/media/cwa-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/media/cwa-192.png', sizes: '192x192', type: 'image/png' },
] as const;

const ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'stop',
  'seekto',
  'seekbackward',
  'seekforward',
];
let owner: MediaSessionController | undefined;

function nativeSession(): MediaSession | undefined {
  try {
    return typeof navigator === 'undefined' ? undefined : navigator.mediaSession;
  } catch {
    return undefined;
  }
}

/** One active player owns the browser's shared lock-screen metadata and controls. */
export class MediaSessionController {
  private options: MediaSessionOptions | undefined;

  /** Call when playback actually starts; preparing or rejected play must not steal ownership. */
  claim(options: MediaSessionOptions) {
    this.options = options;
    if (owner !== this) {
      const previous = owner;
      // Revoke first: a synchronous pause callback can release its old controller.
      owner = this;
      try {
        previous?.options?.onPause();
      } catch {
        // A previous player failing to pause must not break the new controls.
      }
    }
    const session = nativeSession();
    if (!session || owner !== this) return;
    try {
      session.metadata =
        typeof MediaMetadata !== 'undefined'
          ? new MediaMetadata({
              title: options.title,
              artist: options.artist ?? 'CW Academy Companion',
              album: options.album ?? '',
              artwork: CWA_MEDIA_ARTWORK.map((image) => ({ ...image })),
            })
          : null;
    } catch {
      // Metadata support varies; playback and transport remain usable.
      try {
        session.metadata = null;
      } catch {
        /* Optional platform metadata. */
      }
    }
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => this.run(() => this.options?.onPlay()),
      pause: () => this.run(() => this.options?.onPause()),
      stop: options.onStop ? () => this.run(() => this.options?.onStop?.()) : undefined,
      seekto: (event) => {
        if (event.seekTime !== undefined) this.seek(event.seekTime);
      },
      seekbackward: (event) => this.seekBy(-(event.seekOffset ?? 10)),
      seekforward: (event) => this.seekBy(event.seekOffset ?? 10),
    };
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, handlers[action] ?? null);
      } catch {
        // Browsers may expose only a subset of Media Session actions.
      }
    }
    this.setPlaybackState('playing');
    this.updatePosition();
  }

  setPlaybackState(state: MediaSessionPlaybackState) {
    if (owner !== this) return;
    try {
      const session = nativeSession();
      if (session) session.playbackState = state;
    } catch {
      // Optional platform state, never a requirement for audio playback.
    }
  }

  updatePosition() {
    if (owner !== this) return;
    try {
      nativeSession()?.setPositionState?.(this.position());
    } catch {
      // Some platforms expose media controls without a seekable timeline.
    }
  }

  /** A detached player's cleanup cannot erase the next player's controls. */
  release() {
    if (owner !== this) return;
    owner = undefined;
    this.options = undefined;
    const session = nativeSession();
    if (!session) return;
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Optional platform action.
      }
    }
    try {
      session.metadata = null;
      session.playbackState = 'none';
      session.setPositionState?.();
    } catch {
      // Optional platform metadata or position support.
    }
  }

  private position(): MediaSessionPosition | undefined {
    try {
      const value = this.options?.getPosition();
      if (!value || !Number.isFinite(value.duration) || value.duration <= 0) return undefined;
      return {
        duration: value.duration,
        position: Math.min(
          value.duration,
          Math.max(0, Number.isFinite(value.position) ? value.position : 0),
        ),
        playbackRate:
          value.playbackRate !== undefined &&
          Number.isFinite(value.playbackRate) &&
          value.playbackRate > 0
            ? value.playbackRate
            : 1,
      };
    } catch {
      return undefined;
    }
  }

  private seek(seconds: number) {
    if (owner !== this || !Number.isFinite(seconds)) return;
    const duration = this.position()?.duration ?? Infinity;
    this.run(() => this.options?.onSeek(Math.min(duration, Math.max(0, seconds))));
    this.updatePosition();
  }

  private seekBy(offset: number) {
    if (owner !== this || !Number.isFinite(offset)) return;
    const position = this.position();
    if (position) this.seek(position.position + offset);
  }

  private run(callback: () => void | Promise<void>) {
    if (owner !== this) return;
    try {
      const result = callback();
      if (result) void result.catch(() => {});
    } catch {
      // The player reports errors; a platform action must not reject globally.
    }
  }
}
