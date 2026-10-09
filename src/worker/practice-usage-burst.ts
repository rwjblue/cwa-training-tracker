/**
 * Modest per-isolate protection for a public, best-effort counter. This bucket
 * has no identity keys and persists nothing. It does not coordinate across
 * isolates; stronger protection belongs at the provider perimeter.
 */
export class PracticeUsageBurstLimiter {
  private tokens: number;
  private refilledAt: number | null = null;

  constructor(
    private readonly capacity = 120,
    private readonly refillPerSecond = 2,
  ) {
    this.tokens = capacity;
  }

  allow(now: number): boolean {
    if (!Number.isFinite(now)) return false;
    if (this.refilledAt === null) this.refilledAt = now;
    // Keep the refill watermark monotonic even if the wall clock moves back.
    if (now > this.refilledAt) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + ((now - this.refilledAt) / 1_000) * this.refillPerSecond,
      );
      this.refilledAt = now;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
