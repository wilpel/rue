import { Injectable } from "@nestjs/common";

interface SessionEntry {
  sessionId: string;
  updatedAt: number;
}

@Injectable()
export class SessionService {
  private sessions = new Map<string, SessionEntry>();
  private static readonly TTL_MS = 1_800_000; // 30 minutes

  get(key: string): string | undefined {
    const entry = this.sessions.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.updatedAt > SessionService.TTL_MS) {
      this.sessions.delete(key);
      return undefined;
    }
    return entry.sessionId;
  }

  set(key: string, sessionId: string): void {
    this.sessions.set(key, { sessionId, updatedAt: Date.now() });
  }

  clear(key: string): void {
    this.sessions.delete(key);
  }
}
