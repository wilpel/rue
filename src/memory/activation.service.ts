import { Injectable } from "@nestjs/common";

export interface ActivationInput {
  accessCount: number;
  lastAccessedAt: number | null;
  contentScore: number;
  tags: string[];
}

export interface ActivationResult {
  total: number;
  baseLevel: number;
  contextMatch: number;
  emotionalBoost: number;
}

const EMOTIONAL_TAGS: Record<string, number> = {
  critical: 1.0,
  urgent: 0.8,
  important: 0.5,
  core: 0.4,
  personal: 0.3,
  decision: 0.3,
  preference: 0.2,
};

const EMOTIONAL_CAP = 1.5;

@Injectable()
export class ActivationService {
  computeActivation(input: ActivationInput, nowMs = Date.now()): ActivationResult {
    const baseLevel = this.computeBaseLevel(input.accessCount, input.lastAccessedAt, nowMs);
    const contextMatch = input.contentScore;
    const emotionalBoost = this.computeEmotionalBoost(input.tags);
    return { total: baseLevel + contextMatch + emotionalBoost, baseLevel, contextMatch, emotionalBoost };
  }

  private computeBaseLevel(accessCount: number, lastAccessedAt: number | null, nowMs: number): number {
    if (accessCount === 0 || lastAccessedAt === null) return 0;
    const ageHours = Math.max(0, (nowMs - lastAccessedAt) / 3_600_000);
    const recencyDecay = 1 / (1 + Math.sqrt(ageHours / 24));
    return Math.log(accessCount + 1) * recencyDecay;
  }

  private computeEmotionalBoost(tags: string[]): number {
    let boost = 0;
    for (const tag of tags) {
      const weight = EMOTIONAL_TAGS[tag.toLowerCase()];
      if (weight) boost += weight;
    }
    return Math.min(boost, EMOTIONAL_CAP);
  }
}
