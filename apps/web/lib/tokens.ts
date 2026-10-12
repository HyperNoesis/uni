/** Typed design tokens (single source of truth, checklist 0107-0120).
 *  apps/web/app/tokens.css is GENERATED from this file by `pnpm gen:tokens`; `pnpm check:ui` fails if they drift.
 *  Legacy custom properties in globals.css (--bg, --brand, --touch ...) keep working and are checked against these values. */
export const tokens = {
  // Brand UI: deep navy surfaces, electric-blue actions, crisp white text, cyan highlights (0108).
  color: {
    bg: "#0b1530", bg2: "#111f45", surface: "#16254f", surface2: "#1d2f63",
    line: "rgba(255,255,255,0.1)", text: "#f4f7ff", muted: "#9fb0d6",
    brand: "#2f6bff", brand2: "#5b8bff", cyan: "#5ee7ff",
    // Warm gold is reserved for reward / achievement emphasis only (0109). `accent` is kept as the legacy alias.
    gold: "#ffd166", accent: "#ffd166",
  },
  // World palette from CAMPUS_VISUAL_BIBLE.md: cream concrete, stone, terracotta, clay, timber, glass, greens (0110).
  world: {
    creamConcrete: "#d8d2c4", stone: "#e4d4b9", terracotta: "#b8613f", clay: "#c9724a", timber: "#916239",
    glass: "#a8e3f6", leaf: "#62c982", green: "#3f9a58", navy: "#1f3a6e", electric: "#3675e7",
  },
  // Semantic colours stay consistent everywhere (0111).
  semantic: { good: "#4fb286", bad: "#e8644a", warn: "#e8a24a", info: "#5b8bff" },
  // Gameplay text is high-legibility sans; the display face is for hero moments only (0112).
  font: {
    body: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    display: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
  },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 },
  radius: { sm: 10, md: 16, lg: 28, pill: 999 },
  // Restrained translucent panels with contrast-safe backgrounds (0114).
  elevation: {
    panel: "0 8px 24px rgba(5,10,25,0.35)",
    overlay: "0 16px 48px rgba(5,10,25,0.55)",
    glassBg: "rgba(11,21,48,0.82)",
    glassBlur: 12,
  },
  // Important transitions sit in 200-300 ms and are disabled under reduced motion (0117, 0118).
  motion: { fast: 200, base: 250, slow: 300 },
  z: { canvas: 0, hud: 10, nav: 20, overlay: 40, toast: 50 },
  breakpoint: { sm: 600, md: 800, lg: 1100 },
  // Primary touch targets are at least 44 px; we use 48 (0116).
  touch: 48,
  touchMin: 44,
  // Reference viewports every overlay must be re-tested at (0033, 0148).
  viewports: { desktop: [1440, 900], phone: [390, 844], smallPhone: [360, 800] },
} as const;
export type Tokens = typeof tokens;

/** Groups that become `--<group>-<key>` custom properties in tokens.css. Order is stable so the output is diffable. */
export const CSS_GROUPS = ["color", "world", "semantic", "space", "radius", "elevation", "motion", "z", "font"] as const;
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const unit = (group: string, v: string | number) =>
  typeof v === "number" ? (group === "space" || group === "radius" ? `${v}px` : group === "motion" ? `${v}ms` : group === "z" ? `${v}` : `${v}px`) : v;
export function tokensToCss(t: Tokens = tokens): string {
  const lines: string[] = ["/* GENERATED from lib/tokens.ts by `pnpm gen:tokens`. Do not edit by hand. */", ":root {"];
  for (const g of CSS_GROUPS) {
    for (const [k, v] of Object.entries(t[g] as Record<string, string | number>)) lines.push(`  --${g}-${kebab(k)}: ${unit(g, v)};`);
  }
  lines.push(`  --touch-min: ${t.touchMin}px;`, "}", "");
  return lines.join("\n");
}
