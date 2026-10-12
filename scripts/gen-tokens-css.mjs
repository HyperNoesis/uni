// Writes apps/web/app/tokens.css from apps/web/lib/tokens.ts. Run: pnpm gen:tokens
import { writeFileSync } from "node:fs";
import { tokensToCss } from "../apps/web/lib/tokens.ts";
writeFileSync(new URL("../apps/web/app/tokens.css", import.meta.url), tokensToCss());
console.log("wrote apps/web/app/tokens.css");
