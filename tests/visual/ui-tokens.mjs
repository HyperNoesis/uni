// UI contract (checklist 0107-0120): tokens.css is in sync with tokens.ts, legacy CSS variables agree with the tokens,
// reduced-motion is honoured, touch targets meet the minimum and the primary nav has at most five destinations.
import { readFileSync } from "node:fs";
import { tokens, tokensToCss } from "../../apps/web/lib/tokens.ts";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("ok  :", m);

if (read("../../apps/web/app/tokens.css") !== tokensToCss()) fail("apps/web/app/tokens.css is out of sync with lib/tokens.ts: run `pnpm gen:tokens`");
ok("tokens.css matches tokens.ts");

const globals = read("../../apps/web/app/globals.css");
const legacy = { "--bg": tokens.color.bg, "--bg-2": tokens.color.bg2, "--surface": tokens.color.surface, "--surface-2": tokens.color.surface2, "--muted": tokens.color.muted,
  "--text": tokens.color.text, "--brand": tokens.color.brand, "--brand-2": tokens.color.brand2, "--accent": tokens.color.accent, "--good": tokens.semantic.good, "--bad": tokens.semantic.bad,
  "--touch": `${tokens.touch}px`, "--radius": `${tokens.radius.md}px`, "--radius-sm": `${tokens.radius.sm}px` };
for (const [name, want] of Object.entries(legacy)) {
  const m = globals.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) fail(`globals.css is missing ${name}`);
  if (m[1].trim() !== want) fail(`${name} is ${m[1].trim()} in globals.css but ${want} in tokens.ts`);
}
ok("legacy CSS variables agree with tokens");

if (!/prefers-reduced-motion:\s*reduce/.test(globals)) fail("globals.css has no reduced-motion rule");
ok("reduced-motion rule present");
if (tokens.touch < tokens.touchMin || tokens.touchMin < 44) fail("touch targets below 44px");
for (const [k, v] of Object.entries(tokens.motion)) if (v < 200 || v > 300) fail(`motion.${k}=${v} outside 200-300ms`);
ok("touch targets >= 44px; transitions within 200-300ms");

const shell = read("../../apps/web/components/AppShell.tsx");
const order = shell.match(/PRIMARY_ORDER = \[([^\]]+)\]/);
if (!order) fail("AppShell has no PRIMARY_ORDER");
const dests = order[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
if (dests.length > 5) fail(`primary nav has ${dests.length} destinations (max 5)`);
if (dests.join() !== "/play,/home,/social,/events,/profile") fail(`primary nav is ${dests.join()}`);
ok(`primary nav: ${dests.join(" ")}`);

const layout = read("../../apps/web/app/layout.tsx");
if (!layout.includes('import "./tokens.css"')) fail("layout.tsx does not import tokens.css");
ok("layout imports tokens.css");

if (!layout.includes('href="#main"') || !layout.includes("skip-link")) fail("layout.tsx has no skip-to-content link");
if (!shell.includes('id="main"')) fail("AppShell main has no id=main (skip link target)");
if (!/\.skip-link:focus/.test(globals)) fail("globals.css has no .skip-link:focus rule");
ok("skip-to-content link, target and focus style present");
