"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getItem } from "@campus/domain";
import { AppShell } from "../../../components/AppShell";
import { api } from "../../../lib/api";
import { drawItemIcon } from "../../../lib/room";

type Catalog = Awaited<ReturnType<typeof api.shop>>;

export default function ShopPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Retain the same key after a network failure so a retry cannot charge twice.
  const pendingKeys = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.shop();
      setCatalog(next);
      setBalance(next.balance);
    } catch {
      setNotice({ kind: "error", text: "The shop could not load. Check your connection and retry." });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function buy(itemId: string, itemName: string) {
    if (busyItem) return;
    const key = pendingKeys.current.get(itemId) ?? `shop-${itemId}-${crypto.randomUUID()}`;
    pendingKeys.current.set(itemId, key);
    setBusyItem(itemId);
    setNotice(null);
    try {
      const result = await api.purchaseShopItem(itemId, key);
      pendingKeys.current.delete(itemId);
      setBalance(result.profile.coins);
      setCatalog((current) => current ? {
        ...current,
        balance: result.profile.coins,
        offers: current.offers.map((offer) => offer.itemId === itemId ? { ...offer, owned: result.inventory.find((entry) => entry.itemId === itemId)?.qty ?? offer.owned + 1 } : offer),
      } : current);
      window.dispatchEvent(new Event("campus:session-refresh"));
      setNotice({ kind: "ok", text: `${itemName} added to your inventory. Open Home to place it in your room.` });
    } catch (error) {
      const err = error as { status?: number; code?: string };
      if (err.status === 402 || err.status === 404 || err.status === 409) pendingKeys.current.delete(itemId);
      setNotice({
        kind: "error",
        text: err.code === "insufficient_funds" ? "Not enough Campus Coins yet. Complete a quiz or Reaction Challenge, then come back." : err.code === "item_not_for_sale" ? "This item is no longer available." : err.code === "idempotency_conflict" ? "Purchase session conflict. Please try again." : "Purchase could not be confirmed. Retry safely; the same request will not charge you twice.",
      });
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <AppShell title="Room Shop">
      {({ profile }) => (
        <div className="shop-page">
          <section className="card shop-hero">
            <div className="shop-hero-copy">
              <span className="eyebrow">CAMPUS MARKETPLACE</span>
              <h2>Make your room feel like yours.</h2>
              <p className="muted">Buy virtual room cosmetics with Campus Coins. Every price is set by the server, purchases are recorded in your ledger, and purchased items become usable in your room editor.</p>
            </div>
            <div className="shop-balance"><span>YOUR BALANCE</span><strong>🪙 {balance ?? profile.coins}</strong><small>Campus Coins · virtual currency</small></div>
          </section>

          <div className="shop-toolbar">
            <div><h3>Room collection</h3><p className="muted small">One purchase adds one item to your inventory. You can own multiples.</p></div>
            <button className="btn ghost" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
          </div>

          {loading && !catalog ? <section className="card state" aria-busy="true">Loading the catalogue…</section> : !catalog ? (
            <section className="card state"><p className="muted">The shop isn't available right now.</p><button className="btn accent" onClick={() => void refresh()}>Try again</button></section>
          ) : (
            <section className="shop-grid" aria-label="Room item catalogue">
              {catalog.offers.map((offer) => (
                <article className={`card shop-item${offer.featured ? " featured" : ""}`} key={offer.itemId}>
                  {offer.featured && <span className="shop-featured">CAMPUS PICK</span>}
                  <div className="shop-art"><ItemArt itemId={offer.itemId} /><span className="shop-layer">{offer.item.layer === "wall" ? "WALL DECOR" : offer.item.layer === "floor" ? "FLOOR DECOR" : "FURNITURE"}</span></div>
                  <div className="shop-item-copy"><h4>{offer.item.name}</h4><p className="muted">{offer.tagline}</p></div>
                  <div className="shop-item-foot"><div><strong>🪙 {offer.price}</strong><small>{offer.owned > 0 ? `Owned: ${offer.owned}` : "Not owned yet"}</small></div>
                    <button className="btn accent shop-buy" disabled={busyItem !== null || (balance ?? catalog.balance) < offer.price} onClick={() => void buy(offer.itemId, offer.item.name)}>{busyItem === offer.itemId ? "Buying…" : (balance ?? catalog.balance) < offer.price ? "Need coins" : "Buy item"}</button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {balance !== null && catalog?.offers.some((o) => balance < o.price) && <p className="muted shop-footnote">Earn more coins through verified activities in the world. No real-money purchase is available in this prototype.</p>}
          {notice && <div className={`shop-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
        </div>
      )}
    </AppShell>
  );
}

function ItemArt({ itemId }: { itemId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const item = getItem(itemId);
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !item) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = 100 * dpr;
    el.height = 84 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 100, 84);
    drawItemIcon(ctx, item, 76);
  }, [itemId]);
  return <canvas ref={ref} width={100} height={84} aria-label={`${itemId} preview`} />;
}
