import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunnerStopFlight } from './runner-stop-flight';

afterEach(() => vi.useRealTimers());

describe('runner inspection stop boundary', () => {
  it('waits for the matching terminal acknowledgement without sending duplicate stops', async () => {
    vi.useFakeTimers();
    const flight = new RunnerStopFlight();
    const stop = vi.fn();
    const interrupted = vi.fn();
    const pending = flight.wait('running-result', stop, interrupted);
    expect(flight.wait('running-result', stop, interrupted)).toBe(pending);
    expect(stop).toHaveBeenCalledOnce();
    let finished = false;
    void pending.then(() => {
      finished = true;
    });
    flight.settle('older-result');
    await Promise.resolve();
    expect(finished).toBe(false);
    flight.settle('running-result');
    await pending;
    expect(finished).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(interrupted).not.toHaveBeenCalled();
  });

  it('does not extend the fallback deadline when late progress repeats the stop request', async () => {
    vi.useFakeTimers();
    const flight = new RunnerStopFlight();
    const stop = vi.fn();
    const interrupted = vi.fn();
    const pending = flight.wait('running-result', stop, interrupted);
    await vi.advanceTimersByTimeAsync(1500);
    expect(flight.wait('running-result', stop, interrupted)).toBe(pending);
    await vi.advanceTimersByTimeAsync(499);
    expect(interrupted).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(interrupted).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('settles a disposed owner without running its later fallback', async () => {
    vi.useFakeTimers();
    const flight = new RunnerStopFlight();
    const interrupted = vi.fn();
    const pending = flight.wait('disposed-result', vi.fn(), interrupted);
    flight.dispose();
    await pending;
    await vi.advanceTimersByTimeAsync(3000);
    expect(interrupted).not.toHaveBeenCalled();
  });
});
