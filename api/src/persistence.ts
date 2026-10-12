import { promises as fs } from "node:fs";
import { join } from "node:path";
import { SNAPSHOT_VERSION, type Store, type StoreSnapshot } from "./store";

// Durable storage adapter boundary. FilePersistence makes one API instance survive restarts; a Postgres
// adapter implements the same interface later (DECISIONS.md D-016). Needs a persistent disk in production.
export interface Persistence {
  load(): Promise<StoreSnapshot | null>;
  save(snapshot: StoreSnapshot): Promise<void>;
}

/** One JSON file, written atomically (temp + fsync + keep previous as .bak + rename). */
export class FilePersistence implements Persistence {
  private readonly file: string;
  constructor(dir: string, name = "campus-store.json") { this.file = join(dir, name); }

  async load(): Promise<StoreSnapshot | null> {
    for (const path of [this.file, `${this.file}.bak`]) {
      let text: string;
      try { text = await fs.readFile(path, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; throw e; }
      let parsed: StoreSnapshot;
      try { parsed = JSON.parse(text) as StoreSnapshot; } catch (e) {
        if (path.endsWith(".bak")) throw new Error(`no readable snapshot: ${(e as Error).message}`);
        continue; // torn main file: try the backup
      }
      // Never paper over a version mismatch with an older backup: that would silently roll players back.
      if (parsed.version !== SNAPSHOT_VERSION) throw new Error(`snapshot version ${String(parsed.version)} is not supported (expected ${SNAPSHOT_VERSION})`);
      return parsed;
    }
    try { await fs.access(this.file); } catch { return null; }
    throw new Error(`${this.file} exists but is unreadable and there is no backup`); // never boot an empty world over real data
  }

  async save(snapshot: StoreSnapshot): Promise<void> {
    await fs.mkdir(join(this.file, ".."), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    const h = await fs.open(tmp, "w", 0o600);
    try { await h.writeFile(JSON.stringify(snapshot)); await h.sync(); } finally { await h.close(); }
    try { await fs.copyFile(this.file, `${this.file}.bak`); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    await fs.rename(tmp, this.file);
  }
}

export class MemoryPersistence implements Persistence {
  snapshot: StoreSnapshot | null = null; saves = 0; failNext = false;
  async load() { return this.snapshot ? (JSON.parse(JSON.stringify(this.snapshot)) as StoreSnapshot) : null; }
  async save(s: StoreSnapshot) {
    if (this.failNext) { this.failNext = false; throw new Error("disk full"); }
    this.snapshot = JSON.parse(JSON.stringify(s)) as StoreSnapshot; this.saves++;
  }
}

export interface PersistenceStatus { kind: "file" | "memory"; lastSavedAt: string | null; lastError: string | null; pending: boolean }
export interface PersistenceHandle { flush(): Promise<void>; stop(): Promise<void>; status(): PersistenceStatus }

/** Debounced, coalescing writer: bursts become one write, saves never overlap, failures retry with backoff. */
export function startPersistence(store: Store, adapter: Persistence, opts: { kind?: "file" | "memory"; debounceMs?: number; onError?: (e: unknown) => void; now?: () => number } = {}): PersistenceHandle {
  const debounceMs = opts.debounceMs ?? 250, now = opts.now ?? Date.now;
  let timer: ReturnType<typeof setTimeout> | null = null, dirty = false, inflight: Promise<void> | null = null, stopped = false;
  let lastSavedAt: string | null = null, lastError: string | null = null, retryMs = 1_000;
  const schedule = (ms: number) => { if (timer || stopped) return; timer = setTimeout(() => { timer = null; void flush(); }, ms); timer.unref?.(); };
  const writeOnce = async () => {
    dirty = false;
    try { await adapter.save(store.toSnapshot(now())); lastSavedAt = new Date(now()).toISOString(); lastError = null; retryMs = 1_000; }
    catch (e) { dirty = true; lastError = e instanceof Error ? e.message : String(e); opts.onError?.(e); }
  };
  async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    for (;;) {
      if (inflight) { await inflight; continue; }
      if (!dirty) return;
      inflight = writeOnce().finally(() => { inflight = null; });
      await inflight;
      if (lastError) { schedule(retryMs); retryMs = Math.min(30_000, retryMs * 2); return; }
    }
  }
  store.onChange = () => { if (stopped) return; dirty = true; schedule(debounceMs); };
  return {
    flush,
    async stop() { await flush(); stopped = true; if (timer) { clearTimeout(timer); timer = null; } store.onChange = null; },
    status: () => ({ kind: opts.kind ?? "memory", lastSavedAt, lastError, pending: dirty || inflight !== null }),
  };
}
