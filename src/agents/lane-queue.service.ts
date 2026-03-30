import { Injectable } from "@nestjs/common";
import type { Lane } from "../shared/types.js";
import { ConfigService } from "../config/config.service.js";

type Task<T> = () => Promise<T>;
interface QueueEntry { task: Task<unknown>; resolve: (value: unknown) => void; reject: (error: unknown) => void; }
interface LaneState { queue: QueueEntry[]; active: number; maxConcurrent: number; }
export interface LaneStats { totalActive: number; totalQueued: number; lanes: Record<string, { active: number; queued: number; max: number }>; }

@Injectable()
export class LaneQueueService {
  private lanes = new Map<string, LaneState>();

  constructor(config: ConfigService) {
    const c = config.lanes;
    for (const [lane, max] of Object.entries(c)) {
      this.lanes.set(lane, { queue: [], active: 0, maxConcurrent: max });
    }
  }

  async enqueue<T>(lane: Lane, task: Task<T>): Promise<T> {
    const state = this.getOrCreateLane(lane);
    if (state.active < state.maxConcurrent) return this.runTask(state, task);
    return new Promise<T>((resolve, reject) => {
      state.queue.push({ task: task as Task<unknown>, resolve: resolve as (v: unknown) => void, reject });
    });
  }

  depth(lane: Lane): number { return this.getOrCreateLane(lane).queue.length; }
  active(lane: Lane): number { return this.getOrCreateLane(lane).active; }

  stats(): LaneStats {
    let totalActive = 0; let totalQueued = 0;
    const lanes: LaneStats["lanes"] = {};
    for (const [name, state] of this.lanes) {
      totalActive += state.active; totalQueued += state.queue.length;
      lanes[name] = { active: state.active, queued: state.queue.length, max: state.maxConcurrent };
    }
    return { totalActive, totalQueued, lanes };
  }

  private async runTask<T>(state: LaneState, task: Task<T>): Promise<T> {
    state.active++;
    try { return await task(); } finally { state.active--; this.drain(state); }
  }

  private drain(state: LaneState): void {
    while (state.active < state.maxConcurrent && state.queue.length > 0) {
      const entry = state.queue.shift()!;
      state.active++;
      entry.task().then(r => entry.resolve(r)).catch(e => entry.reject(e)).finally(() => { state.active--; this.drain(state); });
    }
  }

  private getOrCreateLane(lane: string): LaneState {
    let state = this.lanes.get(lane);
    if (!state) { state = { queue: [], active: 0, maxConcurrent: 1 }; this.lanes.set(lane, state); }
    return state;
  }
}
