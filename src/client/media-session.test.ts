import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CWA_MEDIA_ARTWORK,
  MediaSessionController,
  type MediaSessionOptions,
} from './media-session';

const controllers: MediaSessionController[] = [];
const controller = () => {
  const value = new MediaSessionController();
  controllers.push(value);
  return value;
};
const native = () => {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: 'none',
    setPositionState: vi.fn(),
    setActionHandler: vi.fn((action: string, handler: MediaSessionActionHandler | null) =>
      handlers.set(action, handler),
    ),
  };
  vi.stubGlobal('navigator', { mediaSession: session });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(values: MediaMetadataInit) {
        Object.assign(this, values);
      }
    },
  );
  return { session, handlers };
};
const options = (overrides: Partial<MediaSessionOptions> = {}): MediaSessionOptions => ({
  title: 'WD101-13',
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onStop: vi.fn(),
  onSeek: vi.fn(),
  getPosition: () => ({ duration: 100, position: 30, playbackRate: 1 }),
  ...overrides,
});

afterEach(() => {
  for (const value of controllers.splice(0)) value.release();
  vi.unstubAllGlobals();
});

describe('shared lock-screen media session', () => {
  it('publishes lesson metadata, real PNG artwork, and current clamped transport positions', () => {
    const { session, handlers } = native();
    const value = controller();
    let position = 30;
    const claim = options({
      album: 'Intermediate · Session 1',
      getPosition: () => ({ duration: 100, position, playbackRate: 1 }),
      onSeek: (seconds) => {
        position = seconds;
      },
    });
    value.claim(claim);
    expect(session.metadata).toMatchObject({
      title: 'WD101-13',
      artist: 'CW Academy Companion',
      album: 'Intermediate · Session 1',
      artwork: CWA_MEDIA_ARTWORK,
    });
    expect(session.playbackState).toBe('playing');
    handlers.get('seekbackward')?.({ action: 'seekbackward' });
    expect(position).toBe(20);
    position = 90; // Read the live media position, not a previous UI checkpoint.
    handlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 30 });
    expect(position).toBe(100);
    handlers.get('seekto')?.({ action: 'seekto', seekTime: -5 });
    expect(position).toBe(0);
    value.setPlaybackState('paused');
    expect(session.playbackState).toBe('paused');
    expect(session.metadata?.title).toBe('WD101-13');
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 100,
      position: 0,
      playbackRate: 1,
    });
    handlers.get('play')?.({ action: 'play' });
    handlers.get('stop')?.({ action: 'stop' });
    expect(claim.onPlay).toHaveBeenCalledOnce();
    expect(claim.onStop).toHaveBeenCalledOnce();
  });

  it('pauses the previous owner and rejects stale handlers, updates, and cleanup', () => {
    const { session, handlers } = native();
    const first = controller();
    const next = controller();
    const old = options({ onPause: vi.fn(() => first.release()) });
    first.claim(old);
    const stalePlay = handlers.get('play');
    const staleSeek = handlers.get('seekforward');
    const current = options({ title: 'A first contact' });
    next.claim(current);
    expect(old.onPause).toHaveBeenCalledOnce();
    stalePlay?.({ action: 'play' });
    staleSeek?.({ action: 'seekforward' });
    first.setPlaybackState('none');
    first.updatePosition();
    first.release();
    expect(old.onPlay).not.toHaveBeenCalled();
    expect(old.onSeek).not.toHaveBeenCalled();
    expect(session.metadata?.title).toBe('A first contact');
    expect(session.playbackState).toBe('playing');
    handlers.get('pause')?.({ action: 'pause' });
    expect(current.onPause).toHaveBeenCalledOnce();
    next.release();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
  });

  it('tolerates partial platform support, invalid timelines, and rejected OS play requests', async () => {
    const { session, handlers } = native();
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor() {
          throw new Error('Unsupported artwork');
        }
      },
    );
    const original = session.setActionHandler.getMockImplementation()!;
    session.setActionHandler.mockImplementation((action, handler) => {
      if (action === 'seekto') throw new Error('Unsupported action');
      return original(action, handler);
    });
    const value = controller();
    const claim = options({
      onPlay: vi.fn(() => Promise.reject(new Error('Playback not permitted'))),
      getPosition: () => ({ duration: Infinity, position: NaN, playbackRate: 0 }),
    });
    expect(() => value.claim(claim)).not.toThrow();
    expect(session.metadata).toBeNull();
    expect(session.setPositionState).toHaveBeenLastCalledWith(undefined);
    expect(() => handlers.get('play')?.({ action: 'play' })).not.toThrow();
    await Promise.resolve();
    expect(claim.onPlay).toHaveBeenCalledOnce();
    session.setPositionState.mockImplementation(() => {
      throw new Error('No timeline');
    });
    expect(() => value.updatePosition()).not.toThrow();
    expect(() => value.release()).not.toThrow();
    vi.stubGlobal('navigator', {});
    expect(() => value.claim(options())).not.toThrow();
    expect(() => value.release()).not.toThrow();
  });
});
