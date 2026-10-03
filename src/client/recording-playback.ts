type RecordingTransport = { play(): Promise<void>; pause(): void };
type PlaybackCallbacks = {
  owns(): boolean;
  pending(value: boolean): void;
  start(): void;
  beforePlay(): void;
  failed(error: unknown): void;
};

/** Keep delayed native Play requests attached to their deliberate owner. */
export class RecordingPlayback {
  private request = 0;
  intended = false;
  pending: { request: number; automatic: boolean } | undefined;

  cancel() {
    this.request++;
    this.intended = false;
  }

  detach() {
    this.cancel();
    this.pending = undefined;
  }

  get allowsNativePlay() {
    return !this.pending || this.pending.request === this.request || this.intended;
  }

  clearCurrentPending(): boolean {
    if (this.pending?.request !== this.request) return false;
    this.pending = undefined;
    return true;
  }

  async play(audio: RecordingTransport, automatic: boolean, callbacks: PlaybackCallbacks) {
    if (!callbacks.owns()) return;
    const request = ++this.request;
    this.intended = true;
    this.pending = { request, automatic };
    callbacks.pending(true);
    callbacks.start();
    try {
      callbacks.beforePlay();
      await audio.play();
      if (request !== this.request || !callbacks.owns()) {
        // A newer deliberate request on the same element owns its playback.
        if (!callbacks.owns() || !this.intended) audio.pause();
      }
    } catch (error) {
      // An obsolete rejection must not stop recall, inspection or a newer Play.
      if (request !== this.request || !callbacks.owns()) return;
      this.intended = false;
      audio.pause();
      callbacks.failed(error);
    } finally {
      if (this.pending?.request === request) {
        this.pending = undefined;
        callbacks.pending(false);
      }
    }
  }
}
