"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CAMPUSES } from "@campus/domain";
import { useSession } from "../lib/session";
import { InstallButton } from "./PwaRegister";

export const NAV = [
  { href: "/home", label: "Home", icon: "M3 11l9-8 9 8v10h-6v-6H9v6H3z" },
  { href: "/play", label: "World", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.7 2 2.7 4.7 2.7 8s-1 6-2.7 8c-1.7-2-2.7-4.7-2.7-8s1-6 2.7-8z" },
  { href: "/social", label: "Social", icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 3.6-6 8-6s8 2 8 6z" },
  { href: "/shop", label: "Shop", icon: "M4 8h16l-1 13H5L4 8zm4 0V6a4 4 0 018 0v2" },
  { href: "/events", label: "Events", icon: "M5 3h14a2 2 0 012 2v16l-4-3H5a2 2 0 01-2-2V5a2 2 0 012-2z" },
  { href: "/profile", label: "Profile", icon: "M12 12a5 5 0 100-10 5 5 0 000 10zm-8 10a8 8 0 0116 0z" },
] as const;

/** Checklist 0136/0068: at most five primary destinations, in this order. Shop and inventory are secondary (topbar + Home). */
export const PRIMARY_ORDER = ["/play", "/home", "/social", "/events", "/profile"] as const;
export const PRIMARY_NAV = PRIMARY_ORDER.map((h) => NAV.find((n) => n.href === h)!).filter(Boolean);

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={d} fill="currentColor" /></svg>;
}

/** Authenticated frame: bottom tabs on phones, side rail on desktop. Redirects anonymous users to onboarding. */
export function AppShell({ title, children }: { title: string; children: (ctx: ReturnType<typeof useSession> & { status: "ready" }) => ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const s = useSession();
  useEffect(() => { if (s.status === "anonymous") router.replace("/signin"); }, [s.status, router]);

  return (
    <div className="appshell">
      <aside className="rail">
        <Link className="logo" href="/">CAMP<span>US</span></Link>
        <nav aria-label="Primary" className="tabs">
          {PRIMARY_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="tab" aria-current={path === n.href || path?.startsWith(n.href + "/") ? "page" : undefined}>
              <Icon d={n.icon} /><span>{n.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main id="main" tabIndex={-1} className="content">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="topbar-actions">
            <InstallButton />
            <Link className="pill" href="/shop" aria-current={path === "/shop" ? "page" : undefined}>Shop</Link>
            {s.status === "ready" && <span className="pill">{s.profile.coins} coins</span>}
          </div>
        </header>
        {s.status === "loading" && <div className="card state" role="status">Loading your campus…</div>}
        {s.status === "error" && (
          <div className="card state" role="alert">
            <p>{s.message}</p>
            <button className="btn" onClick={s.retry}>Try again</button>
          </div>
        )}
        {s.status === "ready" && children(s as ReturnType<typeof useSession> & { status: "ready" })}
      </main>
    </div>
  );
}

export function campusName(id: keyof typeof CAMPUSES) { return CAMPUSES[id].name; }
