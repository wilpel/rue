import { describe, it, expect, vi, beforeEach } from "vitest";
import { LaneQueue } from "../../src/agents/lanes.js";
import type { Lane } from "../../src/shared/types.js";

describe("LaneQueue", () => {
  let queue: LaneQueue;

  beforeEach(() => {
    queue = new LaneQueue({ main: 1, sub: 2, cron: 1, skill: 1 });
  });

  it("executes tasks immediately when lane has capacity", async () => {
    const result = await queue.enqueue("main", async () => "done");
    expect(result).toBe("done");
  });

  it("respects per-lane concurrency limit", async () => {
    const order: string[] = [];
    const slow = queue.enqueue("main", async () => {
      await sleep(50);
      order.push("first");
      return "first";
    });
    const fast = queue.enqueue("main", async () => {
      order.push("second");
      return "second";
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["first", "second"]);
  });

  it("allows parallel execution up to lane limit", async () => {
    const running: number[] = [];
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 4 }, (_, i) =>
      queue.enqueue("sub", async () => {
        running.push(i);
        maxConcurrent = Math.max(maxConcurrent, running.length);
        await sleep(30);
        running.splice(running.indexOf(i), 1);
        return i;
      }),
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBe(2);
  });

  it("reports queue depth per lane", async () => {
    expect(queue.depth("main")).toBe(0);

    const blocker = queue.enqueue("main", () => sleep(100));
    queue.enqueue("main", () => sleep(1));
    queue.enqueue("main", () => sleep(1));

    await sleep(5);
    expect(queue.depth("main")).toBe(2);
    await blocker;
  });

  it("reports active count per lane", async () => {
    expect(queue.active("sub")).toBe(0);

    const task1 = queue.enqueue("sub", () => sleep(50));
    const task2 = queue.enqueue("sub", () => sleep(50));

    await sleep(5);
    expect(queue.active("sub")).toBe(2);
    await Promise.all([task1, task2]);
    expect(queue.active("sub")).toBe(0);
  });

  it("propagates task errors without affecting other tasks", async () => {
    const failing = queue.enqueue("main", async () => {
      throw new Error("boom");
    });
    const succeeding = queue.enqueue("main", async () => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(succeeding).resolves.toBe("ok");
  });

  it("returns total stats across all lanes", async () => {
    const t1 = queue.enqueue("main", () => sleep(50));
    const t2 = queue.enqueue("sub", () => sleep(50));

    await sleep(5);
    const stats = queue.stats();
    expect(stats.totalActive).toBe(2);
    expect(stats.totalQueued).toBe(0);
    await Promise.all([t1, t2]);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
