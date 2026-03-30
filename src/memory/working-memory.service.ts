import { Injectable } from "@nestjs/common";

@Injectable()
export class WorkingMemoryService {
  private store = new Map<string, unknown>();

  get<T = unknown>(key: string): T | undefined { return this.store.get(key) as T | undefined; }
  set(key: string, value: unknown): void { this.store.set(key, value); }
  delete(key: string): void { this.store.delete(key); }
  has(key: string): boolean { return this.store.has(key); }
  entries(): [string, unknown][] { return Array.from(this.store.entries()); }
  clear(): void { this.store.clear(); }

  toSnapshot(): string {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.store) obj[key] = value;
    return JSON.stringify(obj);
  }

  fromSnapshot(json: string): void {
    const obj = JSON.parse(json) as Record<string, unknown>;
    this.store.clear();
    for (const [key, value] of Object.entries(obj)) this.store.set(key, value);
  }

  toPromptText(): string {
    if (this.store.size === 0) return "No active working memory.";
    const lines = ["Current working state:"];
    for (const [key, value] of this.store) {
      const formatted = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`- ${key}: ${formatted}`);
    }
    return lines.join("\n");
  }
}
