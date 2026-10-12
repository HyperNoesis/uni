// Unit test for the onboarding draft (checklist 0044, 0061): round trip, corrupt/hostile data, throwing storage, step clamping.
import { DRAFT_KEY, clearDraft, readDraft, saveDraft } from "../../apps/web/lib/onboarding-draft.ts";
import { DEFAULT_AVATAR, parseAvatar } from "../../packages/domain/src/avatar.ts";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("ok  :", m);
const eq = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : fail(`${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), m }; };
const v = { parseAvatar, campusIds: ["unity_heights", "lagoon_tech"] };
const good = { step: 2, campus: "lagoon_tech", name: "Ada", avatar: DEFAULT_AVATAR };

let s = mem(); saveDraft(s, good);
eq(readDraft(s, v), good, "round trip restores step, campus, name and avatar");
clearDraft(s); eq(readDraft(s, v), null, "clearDraft removes the draft");
eq(readDraft(null, v), null, "missing storage means no draft");
eq(readDraft(undefined, v), null, "undefined storage means no draft");

const put = (obj) => { s = mem(); s.setItem(DRAFT_KEY, typeof obj === "string" ? obj : JSON.stringify(obj)); return readDraft(s, v); };
eq(put("{not json"), null, "corrupt JSON is ignored");
eq(put("null"), null, "null payload is ignored");
eq(put({ ...good, campus: "mars_base" }), null, "unknown campus is rejected");
eq(put({ ...good, avatar: { ...DEFAULT_AVATAR, hair: "<script>" } }), null, "invalid avatar part is rejected");
eq(put({ ...good, avatar: "x" }), null, "non-object avatar is rejected");
eq(put({ ...good, step: 99 }).step, 2, "step is clamped to the last step");
eq(put({ ...good, step: -4 }).step, 0, "negative step is clamped to 0");
eq(put({ ...good, step: "abc" }).step, 0, "non-numeric step falls back to 0");
eq(put({ ...good, name: "x".repeat(50) }).name.length, 20, "name is cut to 20 characters");
eq(put({ ...good, name: 7 }).name, "", "non-string name becomes empty");

const boom = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); }, removeItem() { throw new Error("blocked"); } };
eq(readDraft(boom, v), null, "throwing getItem does not crash");
saveDraft(boom, good); clearDraft(boom); ok("throwing setItem/removeItem do not crash");
