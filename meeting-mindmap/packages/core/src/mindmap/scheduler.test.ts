import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchScheduler } from "./scheduler";

describe("BatchScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs on the interval with everything pending", async () => {
    const run = vi.fn(async (_b: number[]) => {});
    const s = new BatchScheduler<number>({ intervalMs: 1000, maxBatch: 10, run });
    s.start();
    s.push(1);
    s.push(2);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledWith([1, 2]);
  });

  it("runs immediately when maxBatch is reached", () => {
    const run = vi.fn(async (_b: number[]) => {});
    const s = new BatchScheduler<number>({ intervalMs: 60_000, maxBatch: 2, run });
    s.push(1);
    s.push(2);
    expect(run).toHaveBeenCalledWith([1, 2]);
  });

  it("keeps one request in flight and batches the rest", async () => {
    let release!: () => void;
    const run = vi.fn((_b: number[]) => new Promise<void>((r) => (release = r)));
    const s = new BatchScheduler<number>({ intervalMs: 1000, maxBatch: 1, run });
    s.push(1); // starts request 1
    s.push(2);
    s.push(3);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith([2, 3]);
  });

  it("stop() drains everything", async () => {
    const seen: number[][] = [];
    const s = new BatchScheduler<number>({ intervalMs: 1000, maxBatch: 100, run: async (b) => void seen.push(b) });
    s.start();
    s.push(1);
    await s.stop();
    expect(seen).toEqual([[1]]);
  });

  it("reports errors and keeps going", async () => {
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const s = new BatchScheduler<number>({ intervalMs: 1000, maxBatch: 1, run, onError });
    await s.flush();
    s.push(1);
    await vi.advanceTimersByTimeAsync(0);
    s.push(2);
    await s.stop();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
