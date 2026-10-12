// Repo conformance gate for the master prompt's required structure and hygiene rules. Run: pnpm check:repo
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const failures = [];
const need = (path) => { if (!existsSync(path)) failures.push(`missing required path: ${path}`); };

[
  "README.md", "ARCHITECTURE.md", "DECISIONS.md", "SECURITY.md", "CONTRIBUTING.md", ".env.example", "docker-compose.yml",
  "pnpm-workspace.yaml", "turbo.json", ".github/workflows/ci.yml",
  "apps/web", "apps/api", "apps/realtime", "apps/worker", "apps/admin",
  "packages/ui", "packages/domain", "packages/game-core", "packages/game-content", "packages/analytics",
  "infra/docker/Dockerfile", "infra/db/migrations", "infra/db/migrate.sh", "infra/deployment",
  "tests/unit", "tests/integration", "tests/e2e", "tests/load",
].forEach(need);

// Every workspace must expose the scripts CI relies on.
for (const group of ["apps", "packages"]) {
  for (const name of readdirSync(group)) {
    const pj = join(group, name, "package.json");
    if (!existsSync(pj)) { failures.push(`${group}/${name} has no package.json`); continue; }
    const scripts = JSON.parse(readFileSync(pj, "utf8")).scripts ?? {};
    for (const s of ["typecheck", "lint", "test", "build"]) if (!scripts[s]) failures.push(`${group}/${name} is missing script "${s}"`);
  }
}

// No committed secrets or env files.
if (existsSync(".env")) failures.push(".env must not exist in the repo");
const gitignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
if (!/^\.env$/m.test(gitignore)) failures.push(".gitignore must ignore .env");

// Every env var read in source must be documented in .env.example.
const documented = new Set((existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "").split("\n").map((l) => l.replace(/^#\s*/, "").split("=")[0].trim()));
const IGNORED = new Set(["NODE_ENV", "PORT"]);
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".next", "dist", ".turbo"].includes(f)) continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx|mjs)$/.test(f) && !/\.test\./.test(f) && out.push(p);
  }
  return out;
};
for (const dir of ["apps", "packages"]) {
  for (const file of walk(dir)) {
    for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (!IGNORED.has(m[1]) && !documented.has(m[1])) failures.push(`${file} reads ${m[1]} but .env.example does not document it`);
    }
  }
}

// Migrations: numbered, ordered, never editing history is enforced by review; here we check naming only.
if (existsSync("infra/db/migrations")) {
  const files = readdirSync("infra/db/migrations").filter((f) => f.endsWith(".sql"));
  if (files.length === 0) failures.push("infra/db/migrations has no migrations");
  for (const f of files) if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(f)) failures.push(`migration name must look like 0001_name.sql: ${f}`);
}

// Gambling guard: the economy must stay fictional and deterministic.
const money = existsSync("infra/db/migrations/0001_baseline.sql") ? readFileSync("infra/db/migrations/0001_baseline.sql", "utf8") : "";
if (!/is_redeemable = false/.test(money)) failures.push("currencies.is_redeemable must be pinned to false");

if (failures.length) { console.error("repo check FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("repo check passed");
