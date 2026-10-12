import type { Logger } from "@campus/domain/logging";

export interface Job { id: string; type: string; payload: unknown; attempts: number; runAt: number }
export type Handler = (payload: unknown, ctx: { log: Logger; attempt: number }) => Promise<void>;
export interface RunRecord { jobId: string; type: string; status: "succeeded" | "retrying" | "dead"; attempt: number; error?: string }

export interface QueueOptions {
  logger: Logger;
  now?: () => number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  /** Receives every run outcome. The job_runs table (infra/db/migrations) is its persistence target. */
  onRun?: (r: RunRecord) => void;
}

/**
 * In-process queue behind a small interface. Enqueue is idempotent per job id; failures retry with exponential
 * backoff and end in a dead-letter list. A Redis/BullMQ adapter can replace this without touching handlers.
 */
export class JobQueue {
  private handlers = new Map<string, Handler>();
  private pending = new Map<string, Job>();
  private seen = new Set<string>();
  readonly dead: Job[] = [];
  private now: () => number;
  private maxAttempts: number;
  private base: number;

  constructor(private opts: QueueOptions) {
    this.now = opts.now ?? Date.now;
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.base = opts.baseBackoffMs ?? 1000;
  }

  register(type: string, handler: Handler): void {
    this.handlers.set(type, handler);
  }

  /** Returns false when a job with the same id was already accepted. */
  enqueue(type: string, payload: unknown, o: { id: string; delayMs?: number }): boolean {
    if (this.seen.has(o.id)) return false;
    this.seen.add(o.id);
    this.pending.set(o.id, { id: o.id, type, payload, attempts: 0, runAt: this.now() + (o.delayMs ?? 0) });
    return true;
  }

  stats() {
    return { pending: this.pending.size, dead: this.dead.length };
  }

  async processDue(): Promise<{ ran: number; retried: number; dead: number }> {
    const t = this.now();
    const due = [...this.pending.values()].filter((j) => j.runAt <= t);
    let ran = 0, retried = 0, dead = 0;
    for (const job of due) {
      const handler = this.handlers.get(job.type);
      job.attempts += 1;
      const log = this.opts.logger.child({ jobId: job.id, jobType: job.type, attempt: job.attempts });
      try {
        if (!handler) throw new Error(`no handler registered for ${job.type}`);
        await handler(job.payload, { log, attempt: job.attempts });
        this.pending.delete(job.id);
        ran += 1;
        this.opts.onRun?.({ jobId: job.id, type: job.type, status: "succeeded", attempt: job.attempts });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (job.attempts >= this.maxAttempts) {
          this.pending.delete(job.id);
          this.dead.push(job);
          dead += 1;
          log.error("job dead-lettered", { error: message });
          this.opts.onRun?.({ jobId: job.id, type: job.type, status: "dead", attempt: job.attempts, error: message });
        } else {
          job.runAt = this.now() + this.base * 2 ** (job.attempts - 1);
          retried += 1;
          log.warn("job failed, will retry", { error: message, retryInMs: job.runAt - this.now() });
          this.opts.onRun?.({ jobId: job.id, type: job.type, status: "retrying", attempt: job.attempts, error: message });
        }
      }
    }
    return { ran, retried, dead };
  }
}
