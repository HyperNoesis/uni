"use client";
import Link from "next/link";
import { NAV } from "./AppShell";

/** One consistent HUD icon set (24px grid, 2px round stroke). Replaces mixed emoji in the play HUD. */
const P: Record<string, string> = {
  coin: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v10M9.5 9.8h3.8a1.6 1.6 0 010 3.2h-2.6a1.6 1.6 0 000 3.2h3.9",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  cube: "M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7",
  gauge: "M4 18a8 8 0 1116 0M12 18l4-6",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  festival: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
  compass: "M12 3a9 9 0 100 18 9 9 0 000-18zM15.5 8.5l-2 5-5 2 2-5z",
  brain: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2 0-3.5-1-3.5-2.2S10 3 12 7zM12 7c2 0 3.5-1 3.5-2.2S14 3 12 7z",
  medal: "M12 9a5 5 0 100 10 5 5 0 000-10zM9 3l3 6 3-6",
  close: "M6 6l12 12M18 6L6 18",
  trophy: "M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a4 4 0 004 4M16 6h4v1a4 4 0 01-4 4M12 13v4M8 21h8M10 17h4",
};
export function HudIcon({ n }: { n: keyof typeof P | string }) {
  return <svg className="hud-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n] ?? ""} /></svg>;
}

/** Bottom navigation (max five destinations: Home, World, Social, Events, Profile) so players can leave the world. */
export function PlayNav() {
  const items = NAV.filter((n) => n.href !== "/shop");
  return (
    <nav className="play-nav" aria-label="Primary">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="play-tab" aria-current={n.href === "/play" ? "page" : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.icon} /></svg>
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}
