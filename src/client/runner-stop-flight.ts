/** One stop request waits for its engine acknowledgement or a bounded fallback. */
export class RunnerStopFlight {
  private pending?: {
    runId: string;
    promise: Promise<void>;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  };

  wait(runId: string, requestStop: () => void, interrupted: () => void): Promise<void> {
    if (this.pending?.runId === runId) return this.pending.promise;
    this.dispose();
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const timer = setTimeout(() => {
      if (this.pending?.runId !== runId) return;
      this.pending = undefined;
      interrupted();
      resolve();
    }, 2000);
    this.pending = { runId, promise, resolve, timer };
    requestStop();
    return promise;
  }

  settle(runId: string): void {
    if (this.pending?.runId !== runId) return;
    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve();
  }

  dispose(): void {
    if (this.pending) this.settle(this.pending.runId);
  }
}
