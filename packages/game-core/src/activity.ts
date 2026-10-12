// Pluggable activity contract. The server owns every outcome: clients only submit actions.
export interface ActivityContext { playerId: string; now: number }
export type ValidationResult = { ok: true } | { ok: false; reason: string };
export interface Reward { coins: number; reputation: number; items?: string[] }

export interface Activity<State, Action, Result> {
  readonly id: string;
  startActivity(ctx: ActivityContext): State;
  validateAction(state: State, action: Action, ctx: ActivityContext): ValidationResult;
  tick(state: State, ctx: ActivityContext): State;
  complete(state: State, ctx: ActivityContext): Result;
  reward(result: Result, ctx: ActivityContext): Reward;
}

export interface RunnerOptions { maxActionsPerRun: number; runTtlMs: number; maxCoins: number; maxReputation: number; newId: () => string }

export class ActivityError extends Error {
  constructor(public readonly code: "not_found" | "forbidden" | "expired" | "invalid_action" | "too_many_actions" | "already_completed", message: string) {
    super(message);
    this.name = "ActivityError";
  }
}

interface Run<S> { id: string; playerId: string; startedAt: number; actions: number; state: S; done: boolean }

/** Hosts one activity type. Rewards are clamped so a buggy adapter cannot mint unbounded currency. */
export class ActivityRunner<S, A, R> {
  private runs = new Map<string, Run<S>>();
  constructor(private activity: Activity<S, A, R>, private opts: RunnerOptions) {}

  start(ctx: ActivityContext): { runId: string } {
    const id = this.opts.newId();
    this.runs.set(id, { id, playerId: ctx.playerId, startedAt: ctx.now, actions: 0, state: this.activity.startActivity(ctx), done: false });
    return { runId: id };
  }

  private get(runId: string, ctx: ActivityContext): Run<S> {
    const run = this.runs.get(runId);
    if (!run) throw new ActivityError("not_found", "Unknown run");
    if (run.playerId !== ctx.playerId) throw new ActivityError("forbidden", "Not your run");
    if (run.done) throw new ActivityError("already_completed", "Run already completed");
    if (ctx.now - run.startedAt > this.opts.runTtlMs) {
      run.done = true;
      throw new ActivityError("expired", "Run expired");
    }
    return run;
  }

  act(runId: string, action: A, ctx: ActivityContext): void {
    const run = this.get(runId, ctx);
    if (run.actions >= this.opts.maxActionsPerRun) throw new ActivityError("too_many_actions", "Too many actions");
    const v = this.activity.validateAction(run.state, action, ctx);
    if (!v.ok) throw new ActivityError("invalid_action", v.reason);
    run.actions += 1;
  }

  tick(runId: string, ctx: ActivityContext): void {
    const run = this.get(runId, ctx);
    run.state = this.activity.tick(run.state, ctx);
  }

  finish(runId: string, ctx: ActivityContext): { result: R; reward: Reward } {
    const run = this.get(runId, ctx);
    run.done = true;
    const result = this.activity.complete(run.state, ctx);
    const raw = this.activity.reward(result, ctx);
    const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0)));
    return { result, reward: { ...raw, coins: clamp(raw.coins, this.opts.maxCoins), reputation: clamp(raw.reputation, this.opts.maxReputation) } };
  }
}
