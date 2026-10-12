// Single source of truth for design tokens. Web adopts this package in Phase 2 (see DECISIONS.md D-011).
export const tokens = {
  color: { bg: "#0b1530", bg2: "#111f45", surface: "#16254f", surface2: "#1d2f63", text: "#f4f7ff", muted: "#9fb0d6", brand: "#2f6bff", brand2: "#5b8bff", accent: "#ffd166" },
  semantic: { good: "#4fb286", bad: "#e8644a", warn: "#e8a24a", info: "#5b8bff" },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 },
  radius: { sm: 10, md: 16, lg: 28, pill: 999 },
  motion: { fast: 200, base: 250, slow: 300 },
  z: { nav: 20, overlay: 40, toast: 50 },
  breakpoint: { sm: 600, md: 800, lg: 1100 },
  touch: 48,
} as const;
export type Tokens = typeof tokens;

/** Flattens tokens to CSS custom properties, e.g. color.brand2 -> --color-brand2. */
export function cssVariables(t: Tokens = tokens): string {
  const lines: string[] = [];
  for (const [group, values] of Object.entries(t)) {
    if (typeof values === "number") lines.push(`--${group}: ${values}px;`);
    else for (const [k, v] of Object.entries(values)) lines.push(`--${group}-${k}: ${typeof v === "number" ? `${v}px` : v};`);
  }
  return `:root {\n  ${lines.join("\n  ")}\n}`;
}
