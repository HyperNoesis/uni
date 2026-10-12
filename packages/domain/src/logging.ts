// Structured JSON logging and a shared error type. One JSON object per line so any log host can parse it.
export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /token|secret|password|authorization|cookie|api[-_]?key/i;

export function parseLogLevel(v: string | undefined): LogLevel {
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : "info";
}

/** Replaces values of sensitive keys and serializes Errors. Depth-limited so cycles cannot hang the logger. */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (value === null || typeof value !== "object") return value;
  if (depth >= 5) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  sink?: (line: string) => void;
  bindings?: Record<string, unknown>;
  now?: () => Date;
}

export function createLogger(opts: LoggerOptions): Logger {
  const min = ORDER[opts.level ?? "info"];
  const sink = opts.sink ?? ((line: string) => process.stdout.write(line + "\n"));
  const now = opts.now ?? (() => new Date());
  const base = opts.bindings ?? {};
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < min) return;
    const record = { time: now().toISOString(), level, service: opts.service, msg, ...(redact({ ...base, ...fields }) as object) };
    sink(JSON.stringify(record));
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (b) => createLogger({ ...opts, bindings: { ...base, ...b } }),
  };
}

/** Expected failures. `expose` controls whether the message may be shown to clients (never for 5xx). */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
    public readonly expose = status < 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface ErrorBody { error: string; message: string; correlationId?: string }

/** Maps any thrown value to a safe HTTP response. Unknown errors never leak internals. */
export function toErrorBody(err: unknown, correlationId?: string): { status: number; body: ErrorBody } {
  if (err instanceof AppError && err.expose) {
    return { status: err.status, body: { error: err.code, message: err.message, ...(correlationId ? { correlationId } : {}) } };
  }
  return { status: 500, body: { error: "internal_error", message: "Something went wrong.", ...(correlationId ? { correlationId } : {}) } };
}
