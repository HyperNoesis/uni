// TEST-ONLY shim: the zip did not carry packages/domain/src/gate-security.ts, so this stands in for GATE. Values mirror docs/GATE_SECURITY_PASS.md.
export * from "../../../packages/domain/src/index";
export const GATE = {
  line: 132, centre: { x: 60 },
  carGate: { x0: 50, x1: 67.4, height: 3.2 }, wicket: { x0: 67.9, x1: 70.4, hinge: 70.4, height: 2.4 },
  guardPosts: [
    { id: "gateman", x: 69.2, y: 134.6 }, { id: "g2", x: 52.4, y: 134.8 }, { id: "g3", x: 56, y: 135 }, { id: "g4", x: 64, y: 135 }, { id: "g5", x: 72.4, y: 135.4 }, { id: "g6", x: 49, y: 135.6 },
  ],
  police: { officer: { x: 76.5, y: 140.5 }, car: { x: 80, y: 141.5, rot: 1.2 } },
};
export const inChallengeZone = (x: number, y: number) => y < 147 && y > GATE.line + 1 && x > 38 && x < 82;
export const isOutsideGate = (y: number) => y > GATE.line;
