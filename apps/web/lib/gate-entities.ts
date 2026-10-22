/* Turns a GateSnapshot into renderer entities (skinned guards in blue with glasses, one police officer). Shared by the play page and the screenshot harness. */
import { DEFAULT_AVATAR } from "@campus/domain";
import type { Entity } from "./world-render";
import type { GateSnapshot, GuardView } from "./gate-security";

const TONES = ["#5e3b26", "#8a5a3b", "#6b4430", "#7a4e33", "#4e3120", "#935f3f"];
const GEST_EASE_S = 0.35;
export const gestureView = (g: { kind: string; t: number } | undefined) => (g ? { gesture: { kind: g.kind, w: Math.min(1, g.t / GEST_EASE_S) } } : {});

export function gateEntities(sn: GateSnapshot): Entity[] {
  return sn.guards.map((g: GuardView, i: number) => {
    const avatar = (g.kit === "police"
      ? { ...DEFAULT_AVATAR, skin: "#5e3b26", outfit: "#14161a", hair: "bald", accessory: "none", top: "polo", bottom: "chinos", shoes: "boots", face: "calm" }
      : { ...DEFAULT_AVATAR, skin: TONES[i % TONES.length]!, outfit: "#1f4fb5", hair: "fade", accessory: i % 3 === 2 ? "round_glasses" : "glasses", top: "polo", bottom: "chinos", shoes: "boots", face: "calm" }) as unknown as Entity["avatar"];
    return { id: g.id, name: g.name, x: g.x, y: g.y, npc: true, staff: true, tagColor: g.kit === "police" ? "#14161a" : "#1f4fb5", avatar, kit: g.kit,
      face: g.face, ...gestureView(g.gesture), ...(g.say ? { say: g.say } : {}) };
  });
}
