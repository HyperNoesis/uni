import type { Avatar, CampusId } from "@campus/domain";

/** Onboarding draft that survives refresh/disconnect (checklist 0044, 0061). Pure and storage-injected so it is unit-testable.
 *  Storage may be missing, full or throw (private mode): every function degrades to "no draft". */
export const DRAFT_KEY = "campus.onboarding.draft.v1";
export interface Draft { step: number; campus: CampusId; name: string; avatar: Avatar }
export interface DraftStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export interface DraftValidators { parseAvatar(input: unknown): Avatar | null; campusIds: readonly string[] }
const NAME_MAX = 20, LAST_STEP = 2;

export function readDraft(storage: DraftStorage | null | undefined, v: DraftValidators): Draft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft> | null;
    if (!d || typeof d !== "object") return null;
    const avatar = v.parseAvatar(d.avatar);
    if (!avatar || typeof d.campus !== "string" || !v.campusIds.includes(d.campus)) return null;
    const step = Number.isFinite(Number(d.step)) ? Math.min(LAST_STEP, Math.max(0, Math.trunc(Number(d.step)))) : 0;
    return { step, campus: d.campus as CampusId, name: typeof d.name === "string" ? d.name.slice(0, NAME_MAX) : "", avatar };
  } catch { return null; }
}
export function saveDraft(storage: DraftStorage | null | undefined, d: Draft): void {
  try { storage?.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* best effort */ }
}
export function clearDraft(storage: DraftStorage | null | undefined): void {
  try { storage?.removeItem(DRAFT_KEY); } catch { /* best effort */ }
}
/** sessionStorage accessor that never throws (the property access itself can throw when storage is blocked). */
export function safeSession(): DraftStorage | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}
