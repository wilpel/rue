export interface Signal {
  id: string;
  source: string;
  type: string;
  content: string;
  salience: number;
  timestamp: number;
  ttlMs: number;
  metadata?: Record<string, unknown>;
}
