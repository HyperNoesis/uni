import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ACHIEVEMENTS } from "./identity";
import { ITEMS } from "./items";

// Preserve already-applied migrations. Core identity inventory rows stay in 0002;
// the new server-priced shop offers are appended by 0004.
const sql2 = readFileSync(new URL("../../../infra/db/migrations/0002_identity_home.sql", import.meta.url), "utf8");
const sql3 = readFileSync(new URL("../../../infra/db/migrations/0003_social.sql", import.meta.url), "utf8");
const sql4 = readFileSync(new URL("../../../infra/db/migrations/0004_shop_catalog.sql", import.meta.url), "utf8");
const sql5 = readFileSync(new URL("../../../infra/db/migrations/0005_progression_jobs_wars.sql", import.meta.url), "utf8");
const block = (sql: string, table: string) => sql.slice(sql.indexOf(`INSERT INTO ${table}`)).split(";")[0]!;
const ids = (b: string) => [...b.matchAll(/^\s+\('([a-z_]+)'/gm)].map((m) => m[1]!).sort();
const itemSeedSql = `${block(sql2, "items")}\n${block(sql4, "items")}`;

describe("catalog <-> migrations", () => {
  it("seeds every item exactly once without rewriting historical migrations", () => {
    expect(ids(block(sql2, "items"))).toEqual(ITEMS.filter((i) => i.source !== "shop").map((i) => i.id).sort());
    expect(ids(block(sql4, "items"))).toEqual(ITEMS.filter((i) => i.source === "shop").map((i) => i.id).sort());
    expect(ids(itemSeedSql)).toEqual(ITEMS.map((i) => i.id).sort());
    expect(new Set(ids(itemSeedSql)).size).toBe(ITEMS.length);
    const b3 = block(sql3, "achievements");
    expect([...ids(block(sql2, "achievements")), ...ids(b3), ...ids(block(sql5, "achievements"))].sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });
  it("seeds matching footprints, layers, source and campus", () => {
    for (const i of ITEMS) {
      expect(itemSeedSql).toContain(`('${i.id}', '${i.name}', '${i.layer}', ${i.w}, ${i.h}, '${i.source}', ${i.campus ? `'${i.campus}'` : "NULL"})`);
    }
  });
});
