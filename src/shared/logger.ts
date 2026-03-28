export interface LogEntry {
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  sink?: (entry: LogEntry) => void;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

const defaultSink = (entry: LogEntry): void => {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  const sink = opts.sink ?? defaultSink;
  const baseContext = opts.context ?? {};

  function log(level: LogEntry["level"], msg: string, ctx?: Record<string, unknown>): void {
    const entry: LogEntry = {
      ts: Date.now(),
      level,
      msg,
      ...baseContext,
      ...ctx,
    };
    if (ctx?.error instanceof Error) {
      entry.error = ctx.error.message;
      entry.stack = ctx.error.stack;
    }
    sink(entry);
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    child(ctx) {
      return createLogger({ sink, context: { ...baseContext, ...ctx } });
    },
  };
}
