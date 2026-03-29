import * as fs from "node:fs";
import * as path from "node:path";

export interface PersistedEvent {
  seq: number;
  ts: number;
  channel: string;
  payload: unknown;
}

export class EventPersistence {
  private readonly filePath: string;
  private seq: number;
  private fd: number | null = null;

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "events.jsonl");
    this.seq = this.resolveLastSeq();
  }

  append(channel: string, payload: unknown): PersistedEvent {
    this.seq++;
    const event: PersistedEvent = {
      seq: this.seq,
      ts: Date.now(),
      channel,
      payload,
    };
    const line = JSON.stringify(event) + "\n";
    if (this.fd === null) {
      this.fd = fs.openSync(this.filePath, "a");
    }
    try {
      fs.writeSync(this.fd, line);
    } catch (err) {
      fs.closeSync(this.fd);
      this.fd = null;
      throw err;
    }
    return event;
  }

  readAll(): PersistedEvent[] {
    return this.readLines();
  }

  readTail(count: number): PersistedEvent[] {
    const all = this.readLines();
    return all.slice(-count);
  }

  readSince(seq: number): PersistedEvent[] {
    return this.readLines().filter((e) => e.seq >= seq);
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  private readLines(): PersistedEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const content = fs.readFileSync(this.filePath, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((line) => JSON.parse(line) as PersistedEvent);
  }

  private resolveLastSeq(): number {
    const events = this.readLines();
    if (events.length === 0) return 0;
    return events[events.length - 1].seq;
  }
}
