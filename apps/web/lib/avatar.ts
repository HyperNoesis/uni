import { avatarPart, type Avatar } from "@campus/domain";

/** Draws a chibi avatar with feet at (x, y). `s` is a scale factor (1 = ~36px tall). */
export function drawAvatar(ctx: CanvasRenderingContext2D, a: Avatar, x: number, y: number, s = 1, bob = 0): void {
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(0, 1, 11, 4, 0, 0, Math.PI * 2); ctx.fill();

  const pack = avatarPart(a, "backpack");
  if (pack === "backpack") { ctx.fillStyle = "#1d4fd8"; roundRect(ctx, -12, -25, 24, 17, 4); ctx.fill(); ctx.fillStyle = "#163fae"; ctx.fillRect(-6, -16, 12, 6); }
  if (pack === "satchel") { ctx.fillStyle = "#c98a4d"; roundRect(ctx, 5, -14, 9, 9, 2); ctx.fill(); }
  if (a.top === "hoodie") { ctx.fillStyle = shade(a.outfit, -0.18); ctx.beginPath(); ctx.arc(0, -26, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#1b2540";
  if (a.top !== "kaftan") { ctx.fillRect(-6, -10, 5, 10); ctx.fillRect(1, -10, 5, 10); }
  else { ctx.fillRect(-5, -4, 4, 4); ctx.fillRect(1, -4, 4, 4); }

  const shoes = avatarPart(a, "shoes");
  if (shoes === "boots") { ctx.fillStyle = "#7a4a26"; ctx.fillRect(-7, -7, 6.5, 7); ctx.fillRect(0.5, -7, 6.5, 7); ctx.fillStyle = "#2b1d12"; ctx.fillRect(-7.5, -1.5, 7.5, 1.5); ctx.fillRect(0, -1.5, 7.5, 1.5); }
  else if (shoes === "sandals") { ctx.fillStyle = "#c98a4d"; ctx.fillRect(-7, -1.5, 7, 1.5); ctx.fillRect(0, -1.5, 7, 1.5); ctx.fillStyle = "#6b3f1d"; ctx.fillRect(-6, -3, 5, 1.2); ctx.fillRect(1, -3, 5, 1.2); }
  else { ctx.fillStyle = shoes === "black_sneakers" ? "#1c2030" : shoes === "red_sneakers" ? "#e8443a" : "#f4f6fa"; roundRect(ctx, -7.5, -4, 7.5, 4, 1.5); ctx.fill(); roundRect(ctx, 0, -4, 7.5, 4, 1.5); ctx.fill(); ctx.fillStyle = shoes === "white_sneakers" ? "#d9dee8" : "#f4f6fa"; ctx.fillRect(-7.5, -1, 7.5, 1); ctx.fillRect(0, -1, 7.5, 1); }

  ctx.fillStyle = a.outfit;
  if (a.top === "kaftan") {
    roundRect(ctx, -10, -25, 20, 24, 5); ctx.fill();
    ctx.fillStyle = shade(a.outfit, 0.35); ctx.fillRect(-1, -25, 2, 24); ctx.fillRect(-10, -3, 20, 2);
  } else { roundRect(ctx, -9, -24, 18, 16, 5); ctx.fill(); }
  if (a.top === "jersey") { ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(-9, -18, 18, 2.5); ctx.fillRect(-9, -13, 18, 2.5); }
  if (a.top === "hoodie") {
    ctx.fillStyle = shade(a.outfit, -0.22); roundRect(ctx, -5, -14, 10, 5, 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(-2.5, -24, 1, 6); ctx.fillRect(1.5, -24, 1, 6);
  }
  if (pack === "backpack") { ctx.fillStyle = "#163fae"; ctx.fillRect(-6.5, -24, 2.5, 14); ctx.fillRect(4, -24, 2.5, 14); }
  if (pack === "satchel") { ctx.strokeStyle = "#a96f38"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, -24); ctx.lineTo(8, -9); ctx.stroke(); }
  if (a.accessory === "chain") { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -22, 5, 0.2, Math.PI - 0.2); ctx.stroke(); }

  ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(0, -31, 9, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = a.hairColor;
  switch (a.hair) {
    case "short": ctx.beginPath(); ctx.arc(0, -33, 9, Math.PI, 0); ctx.fill(); break;
    case "fade": ctx.beginPath(); ctx.arc(0, -34, 8.5, Math.PI, 0); ctx.fill(); ctx.fillRect(-9, -36, 18, 2); break;
    case "afro": ctx.beginPath(); ctx.arc(0, -34, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(0, -30, 8, 0, Math.PI * 2); ctx.fill(); break;
    case "braids": ctx.beginPath(); ctx.arc(0, -33, 9, Math.PI, 0); ctx.fill(); ctx.fillRect(-10, -33, 3, 14); ctx.fillRect(7, -33, 3, 14); break;
    case "locs": ctx.beginPath(); ctx.arc(0, -33, 9.5, Math.PI, 0); ctx.fill(); for (const dx of [-10, -7, 6, 9]) ctx.fillRect(dx, -34, 2.5, 12); break;
    case "bun": ctx.beginPath(); ctx.arc(0, -33, 9, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(0, -43, 4.5, 0, Math.PI * 2); ctx.fill(); break;
    case "cap": ctx.fillStyle = "#e8644a"; ctx.beginPath(); ctx.arc(0, -34, 9, Math.PI, 0); ctx.fill(); ctx.fillRect(-2, -35, 13, 3); ctx.fillStyle = a.hairColor; ctx.fillRect(-9, -33, 3, 3); break;
    case "wrap": ctx.fillStyle = "#e8a24a"; roundRect(ctx, -10, -42, 20, 11, 6); ctx.fill(); break;
    case "bald": break;
  }

  ctx.fillStyle = "#111";
  const face = avatarPart(a, "face");
  if (a.accessory !== "sunglasses") {
    if (face === "calm") { ctx.fillRect(-5, -31, 3.5, 1); ctx.fillRect(1.5, -31, 3.5, 1); } else { ctx.fillRect(-4, -31, 2, 2); ctx.fillRect(2, -31, 2, 2); }
    if (face === "cool") { ctx.save(); ctx.translate(-3, -34); ctx.rotate(0.25); ctx.fillRect(-2.5, 0, 5, 1); ctx.restore(); ctx.save(); ctx.translate(3, -34); ctx.rotate(-0.25); ctx.fillRect(-2.5, 0, 5, 1); ctx.restore(); }
  }
  ctx.strokeStyle = "#5a1e1e"; ctx.fillStyle = "#5a1e1e"; ctx.lineWidth = 1.2;
  if (face === "smile") { ctx.beginPath(); ctx.arc(0, -29.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  else if (face === "calm") ctx.fillRect(-2, -26.5, 4, 1);
  else if (face === "grin") { ctx.fillRect(-4, -28, 8, 3.2); ctx.fillStyle = "#fff"; ctx.fillRect(-3.5, -28, 7, 1.2); }
  else { ctx.beginPath(); ctx.moveTo(-2, -26.5); ctx.lineTo(3.5, -28); ctx.stroke(); }
  ctx.fillStyle = "#111";
  if (a.accessory === "glasses") { ctx.strokeStyle = "#111"; ctx.lineWidth = 1; ctx.strokeRect(-6, -33, 5, 4); ctx.strokeRect(1, -33, 5, 4); }
  if (a.accessory === "sunglasses") { ctx.fillRect(-6.5, -33, 6, 4); ctx.fillRect(0.5, -33, 6, 4); ctx.fillRect(-1, -32, 2, 1); }
  if (a.accessory === "headphones") {
    ctx.strokeStyle = "#e8e8f0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -32, 10, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = "#e8e8f0"; ctx.fillRect(-12, -33, 4, 7); ctx.fillRect(8, -33, 4, 7);
  }
  ctx.restore();
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
