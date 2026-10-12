// Zone-based asset streamer. Loads GLBs listed in the manifest for the player's current zone, enforces
// per-asset and resident budgets, evicts zones the player has left, and NEVER throws into the render loop:
// any failure (network, size, parse, budget) leaves the slot on its code-drawn fallback shape.
import { assetLimits, assetsForZone, type AssetEntry, type AssetManifest } from "@campus/domain";
import { parseGlb, type GlbMesh } from "./glb";

export interface MeshSink { add(entry: AssetEntry, mesh: GlbMesh): void; remove(name: string): void }
export interface AssetStatus { id: string; state: "loading" | "ready" | "failed"; bytes?: number; triangles?: number; error?: string }
export interface StreamerOptions {
  manifest: AssetManifest;
  sink: MeshSink;
  fetchFn?: typeof fetch;
  /** Zones kept resident besides the current one (most recent first). Default 1. */
  keepPrevious?: number;
  onStatus?: (s: AssetStatus) => void;
}

export function createAssetStreamer(opts: StreamerOptions) {
  const { manifest, sink, onStatus } = opts;
  const doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const keepPrevious = opts.keepPrevious ?? 1;
  const loaded = new Map<string, { entry: AssetEntry; bytes: number; triangles: number; lastUsed: number }>();
  const inflight = new Map<string, Promise<void>>();
  const failed = new Map<string, string>();
  let keepNow = new Set<string>();
  let zone: string | undefined, zoneKey = "", recent: (string | undefined)[] = [], tick = 0, destroyed = false;

  const resident = () => { let b = 0, t = 0; for (const v of loaded.values()) { b += v.bytes; t += v.triangles; } return { bytes: b, triangles: t }; };
  const status = (s: AssetStatus) => { try { onStatus?.(s); } catch { /* observer errors never reach rendering */ } };
  const evictOldest = (except: Set<string>): boolean => {
    let victim: string | undefined, best = Infinity;
    for (const [id, v] of loaded) if (!except.has(id) && v.lastUsed < best) { best = v.lastUsed; victim = id; }
    if (!victim) return false;
    loaded.delete(victim); sink.remove(victim); return true;
  };

  async function load(entry: AssetEntry, wanted: Set<string>): Promise<void> {
    const lim = assetLimits(manifest, entry);
    try {
      status({ id: entry.id, state: "loading" });
      const res = await doFetch(entry.url, { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > lim.maxBytes) throw new Error(`over byte budget (${declared} > ${lim.maxBytes})`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength > lim.maxBytes) throw new Error(`over byte budget (${buf.byteLength} > ${lim.maxBytes})`);
      const mesh = parseGlb(buf, { maxTriangles: lim.maxTriangles });
      if (destroyed || !keepNow.has(entry.id)) return; // player already left the zone
      // Make room under the resident budget, never evicting what the current zone still needs.
      while ((resident().bytes + buf.byteLength > manifest.residentBudget.maxBytes || resident().triangles + mesh.triangles > manifest.residentBudget.maxTriangles) && evictOldest(wanted));
      if (resident().bytes + buf.byteLength > manifest.residentBudget.maxBytes || resident().triangles + mesh.triangles > manifest.residentBudget.maxTriangles)
        throw new Error("resident budget exhausted");
      sink.add(entry, mesh);
      loaded.set(entry.id, { entry, bytes: buf.byteLength, triangles: mesh.triangles, lastUsed: ++tick });
      status({ id: entry.id, state: "ready", bytes: buf.byteLength, triangles: mesh.triangles });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.set(entry.id, msg);
      status({ id: entry.id, state: "failed", error: msg });
    }
  }

  return {
    /**
     * Call whenever the player's zone may have changed (cheap no-op when unchanged). `near` lists zones close
     * enough to be visible (e.g. within ~30 units) so their buildings and scenery are ready before the player arrives.
     */
    setZone(next: string | undefined, near: readonly string[] = []): void {
      const key = `${next ?? ""}|${[...near].sort().join(",")}`;
      if (destroyed || key === zoneKey) return;
      zoneKey = key;
      if (next !== zone) recent = [zone, ...recent.filter((z) => z !== zone)].slice(0, keepPrevious);
      zone = next;
      const here = [next, ...near];
      const wanted = new Set(here.flatMap((z) => assetsForZone(manifest, z).map((a) => a.id)));
      const keep = new Set(wanted);
      for (const z of recent) for (const a of assetsForZone(manifest, z)) keep.add(a.id);
      keepNow = keep;
      for (const id of [...loaded.keys()]) if (!keep.has(id)) { loaded.delete(id); sink.remove(id); }
      // Current zone first, then neighbours, so the nearest things appear first.
      const order = [...new Map(here.flatMap((z) => assetsForZone(manifest, z)).map((a) => [a.id, a])).values()];
      for (const a of order) {
        const hit = loaded.get(a.id); if (hit) { hit.lastUsed = ++tick; continue; }
        if (inflight.has(a.id) || failed.has(a.id)) continue;
        const p = load(a, wanted).finally(() => inflight.delete(a.id));
        inflight.set(a.id, p);
      }
    },
    /** Resolves when everything requested so far has settled (tests, loading screens). */
    settled: async () => { while (inflight.size) await Promise.all([...inflight.values()]); },
    stats: () => ({ ...resident(), loaded: [...loaded.keys()], failed: Object.fromEntries(failed) }),
    destroy() { destroyed = true; for (const id of loaded.keys()) sink.remove(id); loaded.clear(); },
  };
}
export type AssetStreamer = ReturnType<typeof createAssetStreamer>;
