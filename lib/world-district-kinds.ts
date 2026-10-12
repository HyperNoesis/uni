/* CAMPUS district building character (static, decorative, visual only).
 * Gives every room kind its own silhouette + facade grammar so the 140+ district buildings are not colour-swapped clones:
 * hostels get tanks/laundry/balcony rails, labs get sunshade fins + roof plant + solar, workshops get saw-tooth roofs and a stack,
 * clinics a lit cross, shops striped awnings + signs, canteens umbrellas and tables, studios an angled canopy, gyms a clerestory ridge,
 * halls a pediment + dome, lounges a pergola. Variation inside a kind is seeded from the building position (deterministic).
 * Everything stays within the building footprint (+ the 1.8 m door apron). Pure + dependency-free; baked with the zone mesh. */
import type { P, Quality } from "./world-architecture";
import type { DistrictBuilding } from "./world-districts";

const rnd = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const METAL = "#8d98aa", DARK = "#4a5468", CREAM = "#f4f1ea", TERRA = "#c9724a", GLASS = "#8fd3ec", TIMBER = "#916239";
const STRIPES = [["#e8644a", "#f4f1ea"], ["#3675e7", "#f4f1ea"], ["#3f8844", "#ffd166"], ["#a15cff", "#f4f1ea"]] as const;
const CLOTH = ["#e8644a", "#3675e7", "#ffd166", "#3f8844", "#ff8fb3", "#31c4d0"];

export function buildKindDetail(b: DistrictBuilding, q: Quality, p: P): void {
  const low = q === "low", hi = q === "high", r = rnd(b.x, b.y), r2 = rnd(b.y, b.x + 5);
  const pitched = b.kind === "dorm" || b.kind === "shop" || b.kind === "lounge" || b.kind === "canteen" || b.kind === "clinic" || b.kind === "hall";
  // pitched kinds (see PITCHED in the renderer) have a wedge roof: roof-level pieces sit on the ridge at the footprint centre
  const top = pitched ? b.height + .08 + Math.min(b.w, b.h) * (b.kind === "hall" ? .22 : .3) + .6 : b.height + .5, sz = b.y + b.h, cx = b.x + b.w / 2, mz = b.y + b.h / 2;
  const left = r > .5; // seeded mirror: which side the secondary feature sits on
  const fx = left ? b.x + .9 : b.x + b.w - 2.1;
  const lit = p.lbox ?? p.box;
  switch (b.kind) {
    case "dorm": {
      // roof water tank on a stand, balcony slab + rail along the front, laundry rail on the side
      p.box(cx - .6, mz - .6, 1.2, 1.2, .5, METAL, top); p.cyl(cx, mz, 1.1, 1.0, "#4a6fa5", top + .5);
      p.box(b.x + .5, sz - .02, b.w - 1, .9, .1, "#e4d4b9", b.height * .5);
      if (!low) for (let x = b.x + .6; x < b.x + b.w - .5; x += 1.3) p.box(x, sz + .82, .08, .06, .8, DARK, b.height * .5 + .1);
      if (!low) { p.box(b.x + .5, sz + .86, b.w - 1, .06, .06, DARK, b.height * .5 + .85); }
      if (hi) for (let i = 0; i < 4; i++) p.box(b.x + 1 + i * 1.5 + r * .2, sz + .3, .7, .05, .55, CLOTH[(i + Math.floor(r * 6)) % 6]!, b.height * .5 + .3);
      break;
    }
    case "lab": {
      // vertical sunshade fins on the front, rooftop plant + ducts, solar panels (high)
      if (!low) for (let x = b.x + .8; x < b.x + b.w - .6; x += 1.1) p.box(x, sz - .05, .09, .55, b.height * .6, CREAM, .4);
      p.box(fx, b.y + 1.5, 2, 1.6, .7, METAL, top); p.box(fx + .2, b.y + 1.7, 1.6, .25, .35, DARK, top + .7);
      p.cyl(left ? b.x + b.w - 1.5 : b.x + 1.5, b.y + b.h * .5, .5, 1.1, CREAM, top);
      if (hi) for (let i = 0; i < 3; i++) p.rbox(b.x + b.w * (left ? .55 : .15) + i * 1.5, top + .45, b.y + b.h - 1.6, 1.3, .06, 1.9, "#1f3a6e", .35);
      break;
    }
    case "workshop": {
      // saw-tooth roof (3 teeth with glazed risers) + chimney stack with a cap
      const n = low ? 2 : 3, tw = (b.w - 1.2) / n;
      for (let i = 0; i < n; i++) {
        const x = b.x + .6 + i * tw;
        p.rbox(x + tw * .45, top + .35, b.y + b.h / 2, tw * .95, .12, b.h - 1.4, METAL, .0);
        p.box(x + tw - .12, b.y + .8, .12, b.h - 1.6, .7, GLASS, top);
        p.box(x, b.y + .8, tw, b.h - 1.6, .22, DARK, top);
      }
      p.box(left ? b.x + .7 : b.x + b.w - 1.6, b.y + 1, .9, .9, 2.0, "#a85a3a", top); p.box(left ? b.x + .6 : b.x + b.w - 1.7, b.y + .9, 1.1, 1.1, .18, DARK, top + 2.0);
      if (!low) p.box(b.x + 1, sz + .2, 1.2, .8, .9, TIMBER, 0); // delivery crate
      break;
    }
    case "classroom": {
      // brise-soleil louvres above the windows + parapet cap + stair-core box with a skylight
      if (!low) for (let i = 0; i < 3; i++) p.box(b.x + .4, sz - .02, b.w - .8, .75 + i * .12, .07, CREAM, b.height * .72 - i * .0 + i * .1);
      p.box(b.x + .15, b.y + .15, b.w - .3, .18, .22, "#e4d4b9", top - .1);
      p.box(fx, b.y + 1.4, 1.5, 1.5, .9, "#d8d2c4", top); if (hi) p.box(fx + .3, b.y + 1.7, .9, .9, .08, GLASS, top + .9);
      if (!low && r2 > .4) p.box(b.x + b.w - .1, b.y + 1, .35, b.h - 2, b.height * .8, TERRA, 0); // accent wall fin
      break;
    }
    case "office": {
      // flagpole with a flag, rooftop plant, projecting entrance fascia
      const px = left ? b.x + .8 : b.x + b.w - .8;
      p.cyl(px, b.y + b.h - .9, .1, 3.6, METAL, top); p.box(px, b.y + b.h - 1.0, .85, .05, .5, ["#3f8844", "#3675e7", "#e8644a"][Math.floor(r * 3)]!, top + 3.0);
      p.box(cx - 1.6, b.y + 1.2, 3.2, 1.6, .55, METAL, top);
      p.box(b.x + .6, sz - .05, b.w - 1.2, .35, .35, CREAM, b.height - .35);
      break;
    }
    case "clinic": {
      // lit cross on the roof edge, ambulance-bay canopy on the side
      lit(cx - .2, mz - .1, .4, .2, 1.4, "#ff4a4a", top); lit(cx - .7, mz - .1, 1.4, .2, .4, "#ff4a4a", top + .5);
      p.box(b.x + b.w - 2.2, sz - .02, 2.2, 2.2, .12, CREAM, b.height - .1); p.box(b.x + b.w - 2.1, sz + 1.9, .1, .1, b.height - .1, DARK, 0);
      if (!low) p.box(b.x + .5, sz + .3, 1.6, .6, .5, "#3f8844", 0); // planter
      break;
    }
    case "shop": {
      // striped front awning, hanging sign, produce crates, roller-shutter hint
      const [c1, c2] = STRIPES[Math.floor(r * STRIPES.length) % STRIPES.length]!;
      const n = Math.max(4, Math.floor(b.w / .9));
      for (let i = 0; i < n; i++) p.box(b.x + .2 + i * ((b.w - .4) / n), sz - .02, (b.w - .4) / n, 1.5, .1, i % 2 ? c2 : c1, b.height * .82 - (low ? 0 : i % 2 ? .0 : .0));
      lit(cx - 1.1, sz + .02, 2.2, .1, .5, "#fff1c4", b.height * .82 + .15);
      if (!low) { p.box(b.x + .5, sz + 1.2, .7, .6, .5, TIMBER, 0); p.box(b.x + b.w - 1.3, sz + 1.2, .7, .6, .5, TIMBER, 0); p.sph(b.x + .85, .62, sz + 1.5, .55, .22, .45, "#e8a24a"); }
      break;
    }
    case "canteen": {
      // front seating: round tables + umbrellas, extractor vent + chimney on the roof
      const n = low ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const ux = b.x + b.w * (n === 1 ? .25 : .2 + i * .55) + r * .5, uz = sz + 2.7;
        p.cyl(ux, uz, .9, .06, "#f4f1ea", .7); p.cyl(ux, uz, .12, .7, METAL, 0); p.cyl(ux, uz, .1, 1.9, METAL, 0); p.cyl(ux, uz, 2.2, .14, i % 2 ? "#e8644a" : "#ffd166", 1.9);
        if (!low) { p.cyl(ux - .85, uz, .4, .4, TIMBER, 0); p.cyl(ux + .85, uz, .4, .4, TIMBER, 0); }
      }
      p.box(cx - .55, mz - .55, 1.1, 1.1, 1.4, METAL, top); p.cyl(cx, mz, .7, .3, DARK, top + 1.4);
      lit(cx - .9, sz + .02, 1.8, .1, .4, "#ffb24d", b.height * .8);
      break;
    }
    case "studio": {
      // angled feature canopy + vertical colour fins + neon strip
      p.rbox(cx, top + .55, sz - .9, b.w - .8, .14, 2.1, ["#a15cff", "#e8644a", "#31c4d0"][Math.floor(r * 3)]!, .0);
      p.box(b.x + .5, sz - 1.9, .12, .12, top + .5, DARK, 0); p.box(b.x + b.w - .6, sz - 1.9, .12, .12, top + .5, DARK, 0);
      if (!low) for (let i = 0; i < 4; i++) p.box(b.x + .8 + i * ((b.w - 1.6) / 3), sz - .06, .16, .35, b.height * .7, ["#a15cff", "#31c4d0", "#e8644a", "#ffd166"][(i + Math.floor(r * 4)) % 4]!, .3);
      lit(b.x + .8, sz - .1, b.w - 1.6, .06, .14, "#ff7ad9", top - .35);
      break;
    }
    case "gym": {
      // raised clerestory ridge with glass band, stepped roof, banner
      p.box(b.x + 1, b.y + 1, b.w - 2, b.h - 2, .9, METAL, top); p.box(b.x + 1.2, b.y + 1, b.w - 2.4, .1, .45, GLASS, top + .2); p.box(b.x + 1.2, b.y + b.h - 1.1, b.w - 2.4, .1, .45, GLASS, top + .2);
      p.box(b.x + 2, b.y + 2, b.w - 4, b.h - 4, .5, "#d8d2c4", top + .9);
      if (!low) { p.box(cx - 1.4, sz - .04, 2.8, .05, 1.2, "#3675e7", b.height * .45); lit(cx - 1.1, sz - .02, 2.2, .05, .18, "#fff1c4", b.height * .45 + .5); }
      break;
    }
    case "lounge": {
      // timber pergola along the side + planters + roof lantern
      const px = left ? b.x - 2.1 : b.x + b.w + .1;
      p.box(px, b.y + 1, 2, b.h - 2, .1, TIMBER, 2.4);
      for (const zz of [b.y + 1, b.y + b.h - 1.15]) { p.box(px + .05, zz, .14, .14, 2.4, TIMBER, 0); p.box(px + 1.8, zz, .14, .14, 2.4, TIMBER, 0); }
      if (!low) for (let z = b.y + 1.3; z < b.y + b.h - 1.2; z += .8) p.box(px, z, 2, .08, .06, "#6d4a2e", 2.5);
      p.box(px + .4, b.y + 1.4, 1.2, .5, .45, "#3f8844", 0);
      p.cyl(cx, mz, 1.2, .5, CREAM, top); lit(cx - .3, mz - .3, .6, .6, .3, "#fff1c4", top + .5);
      break;
    }
    case "hall": {
      // pediment (stepped gable) over the portico + low dome with a lantern; portico itself is drawn by the district pass
      const pw = b.w - 1.6;
      p.box(b.x + .8, sz + .45, pw, .5, .25, "#efe6d4", b.height + .85);
      p.box(b.x + 1.8, sz + .45, pw - 2, .5, .25, "#efe6d4", b.height + 1.1);
      p.box(b.x + 2.8, sz + .45, pw - 4, .5, .25, "#efe6d4", b.height + 1.35);
      p.sph(cx, top + .9, mz, Math.min(5, b.w * .45), 1.8, Math.min(5, b.w * .45), "#d9e4ef");
      p.cyl(cx, mz, .7, .9, CREAM, top + 1.7); p.sph(cx, top + 2.8, mz, .6, .6, .6, "#ffd166");
      break;
    }
    default: break;
  }
}
