// Generates the expansion districts (zones/*.json) deterministically. Run: node scripts/world/generate-districts.mjs
// Output is committed; this script is the source of truth for the layout grammar (rows of rooms either side of a spine).
import fs from "node:fs";
import path from "node:path";
const dir = path.resolve(new URL(".", import.meta.url).pathname, "../../packages/domain/src/world-data");
const GAP = 2, FRONT = 4, MARGIN = 1.5, SPINE = 4;
const KIND_H = { dorm: 3.4, lab: 2.9, workshop: 3.0, classroom: 3.0, office: 2.6, clinic: 2.8, shop: 2.4, canteen: 2.6, studio: 2.8, gym: 3.6, lounge: 2.6, hall: 3.6 };
const Z = [
  { id: "engineering_quarter", name: "Engineering Quarter", x: 120, y: 0, w: 40, h: 40, color: "#5f74e8", avenue: "bottom", rows: "sss", kinds: ["lab", "workshop", "classroom"], pal: ["#6f86c9", "#5f74e8", "#7a8cff", "#4f6bd0"],
    names: ["Civil Engineering Lab", "Mechanical Workshop", "Electrical Machines Lab", "Fabrication Bay", "Robotics Lab", "Power Systems Lab", "Thermofluids Lab", "CAD Studio", "Materials Testing Lab", "Control Systems Lab", "Eng. Lecture Room A", "Eng. Dean's Office"] },
  { id: "science_complex", name: "Science Complex", x: 160, y: 0, w: 40, h: 40, color: "#3fa7a0", avenue: "bottom", rows: "sss", kinds: ["lab", "classroom", "office"], pal: ["#4fb3a8", "#3fa7a0", "#6cc4b4", "#46a08f"],
    names: ["Physics Lab 1", "Physics Lab 2", "Chemistry Lab 1", "Chemistry Lab 2", "Biology Lab", "Microbiology Lab", "Geology Lab", "Computer Lab 1", "Computer Lab 2", "Maths Seminar Room", "Science Lecture Room", "Science Dean's Office"] },
  { id: "medical_college", name: "College of Medicine", x: 200, y: 0, w: 40, h: 40, color: "#e8644a", avenue: "bottom", rows: "sss", kinds: ["clinic", "classroom", "lab"], pal: ["#e9a090", "#e8644a", "#f0b8a8", "#d9826c"],
    names: ["Student Health Clinic", "Anatomy Lab", "Pharmacy Lab", "Nursing Skills Ward", "Dental Suite", "Physiotherapy Room", "Radiology Room", "Counselling Centre", "Medical Lecture Room", "Clinical Skills Lab", "Pharmacy Dispensary", "Medical Dean's Office"] },
  { id: "arts_row", name: "Arts & Humanities Row", x: 120, y: 40, w: 40, h: 40, color: "#c9724a", avenue: "top", rows: "sss", kinds: ["classroom", "studio", "office"], pal: ["#d98a5f", "#c9724a", "#e4a574", "#b8613f"],
    names: ["Literature Seminar Room", "History Room", "Theatre Arts Studio", "Music Practice Room", "Fine Art Studio", "Philosophy Room", "Languages Lab", "Mass Comm. Newsroom", "Radio Booth", "Dance Studio", "Arts Lecture Room", "Arts Dean's Office"] },
  { id: "business_law", name: "Business & Law Quarter", x: 160, y: 40, w: 40, h: 40, color: "#8b6fd6", avenue: "top", rows: "sss", kinds: ["classroom", "office", "hall"], pal: ["#9d85e0", "#8b6fd6", "#b19cec", "#7a5fc4"],
    names: ["Moot Court Room", "Law Library Room", "Accounting Lab", "Finance Trading Room", "Entrepreneurship Hub", "Marketing Studio", "Law Lecture Room", "Management Seminar", "Economics Room", "Business Clinic", "Law Dean's Office", "Business Dean's Office"] },
  { id: "hostel_estate_east", name: "East Hostel Estate", x: 200, y: 40, w: 40, h: 40, color: "#ffd166", avenue: "top", rows: "sss", kinds: ["dorm", "lounge"], pal: ["#f2c46b", "#e8a24a", "#f7d98a", "#d99a4e"],
    names: ["East Hall Room 101", "East Hall Room 102", "East Hall Room 103", "East Hall Room 104", "East Hall Room 201", "East Hall Room 202", "East Hall Room 203", "East Hall Room 204", "East Hall Common Room", "East Hall Laundry", "East Hall Study Room", "East Hall Warden"] },
  { id: "hostel_village", name: "Hostel Village", x: 0, y: 80, w: 48, h: 70, color: "#ffb24d", rows: "sssss", kinds: ["dorm", "dorm", "dorm", "lounge"], pal: ["#f2b45e", "#e89d4a", "#f7cb85", "#d98f45"],
    names: ["Village Block A Room 1", "Village Block A Room 2", "Village Block A Room 3", "Village Block A Room 4", "Village Block B Room 1", "Village Block B Room 2", "Village Block B Room 3", "Village Block B Room 4", "Village Block C Room 1", "Village Block C Room 2", "Village Block C Room 3", "Village Block C Room 4", "Village Block D Room 1", "Village Block D Room 2", "Village Block D Room 3", "Village Block D Room 4", "Village Study Room", "Village Laundry", "Village Common Room", "Village Porter's Lodge"] },
  { id: "gate_road", name: "Gate Road", x: 48, y: 80, w: 24, h: 70, color: "#477a60", rows: "", kinds: [], pal: [], names: [] },
  { id: "market_town", name: "Market Town", x: 72, y: 80, w: 48, h: 70, color: "#ff8fb3", rows: "ssbss", kinds: ["shop", "canteen", "shop", "office"], pal: ["#f08fa8", "#ff8fb3", "#f7b0c4", "#e07c97"],
    names: ["Campus Bookshop", "Stationery Kiosk", "Phone Repair Stall", "Tailor's Shop", "Barber Shop", "Salon", "Mama Put Canteen", "Suya Spot", "Jollof Kitchen", "Bukka Canteen", "Smoothie Bar", "Provision Store", "Pharmacy", "Cyber Cafe", "Print & Copy Centre", "Bank Branch", "ATM Lobby", "Tech Gadget Shop", "Thrift Store", "Gift Shop", "Student Cooperative", "Bakery", "Laundry Service", "Campus Post Office", "Travel Agency"] },
  { id: "admin_quarter", name: "Admin & Staff Quarter", x: 120, y: 80, w: 40, h: 70, color: "#6f86c9", rows: "sbss", kinds: ["office", "hall", "office", "lounge"], pal: ["#7f93d0", "#6f86c9", "#93a5dc", "#5f78b8"],
    names: ["Registry", "Bursary", "Vice-Chancellor's Office", "Student Affairs", "Admissions Office", "Examinations Office", "Senate Chamber", "ICT Help Desk", "Security Office", "Staff Common Room", "Alumni Office", "Careers Office", "Convocation Hall", "Health & Safety Office"] },
  { id: "research_park", name: "Research Park", x: 160, y: 80, w: 40, h: 70, color: "#31c4d0", rows: "ssbs", kinds: ["lab", "office", "hall", "lab"], pal: ["#52cfd9", "#31c4d0", "#7adde4", "#28a8b3"],
    names: ["AI Research Lab", "Data Science Lab", "Biotech Lab", "Clean Energy Lab", "Agritech Lab", "Materials Lab", "Drone Lab", "IoT Lab", "Research Office 1", "Research Office 2", "Innovation Hall", "Prototype Lab", "Quantum Lab", "Photonics Lab"] },
  { id: "innovation_village", name: "Innovation Village", x: 200, y: 80, w: 40, h: 70, color: "#a15cff", rows: "sssb", kinds: ["studio", "office", "lounge", "gym"], pal: ["#b07cf5", "#a15cff", "#c49bff", "#8d4de6"],
    names: ["Startup Pod 1", "Startup Pod 2", "Startup Pod 3", "Startup Pod 4", "Maker Space", "Game Dev Studio", "Film Studio", "Podcast Studio", "Design Studio", "Co-working Room A", "Co-working Room B", "Pitch Room", "Campus Gym", "Wellness Studio"] },
];
const R = (n) => Math.round(n * 100) / 100;
// What you can do inside each kind of room (stopgap: the two proximity-based activities the API can already verify anywhere).
// Both have server-owned rewards with per-player daily caps / cooldowns, so more entry points never mean more rewards.
// Jobs/shifts are tied to specific sites by the API, so they are not offered here. Dorms and lounges stay social spaces for now.
const ROOM_ACTIVITY = { classroom: ["quiz", "Study Quiz"], lab: ["quiz", "Study Quiz"], hall: ["quiz", "Study Quiz"], office: ["quiz", "Study Quiz"], clinic: ["quiz", "Study Quiz"], workshop: ["quiz", "Study Quiz"], gym: ["reaction", "Reaction Challenge"], studio: ["reaction", "Reaction Challenge"], shop: ["reaction", "Reaction Challenge"], canteen: ["reaction", "Reaction Challenge"] };
const total = { rooms: 0 };
const registry = [];
for (const z of Z) {
  const half = (z.w - 2 * MARGIN - SPINE) / 2;
  const top = z.y + (z.avenue === "top" ? 6 : 2), bottom = z.y + z.h - (z.avenue === "bottom" ? 6 : 2);
  const buildings = [];
  let ry = top, ni = 0;
  for (let r = 0; r < z.rows.length; r++) {
    const big = z.rows[r] === "b", bw = big ? Math.min(16, half) : 7, bh = big ? 8 : 6.5;
    if (ry + bh + FRONT > bottom + 0.01) break;
    const per = Math.max(1, Math.floor((half + GAP) / (bw + GAP)));
    const xs = [];
    for (let i = 0; i < per; i++) xs.push(z.x + MARGIN + i * (bw + GAP));
    for (let i = per - 1; i >= 0; i--) xs.push(z.x + z.w - MARGIN - bw - i * (bw + GAP));
    for (const bx of xs) {
      if (ni >= z.names.length) break;
      const kind = big && z.kinds.includes("hall") ? "hall" : z.kinds[(ni + r) % z.kinds.length];
      const dw = big ? 4 : 3;
      buildings.push({ id: `${z.id.split("_")[0]}_${String(ni + 1).padStart(2, "0")}_${z.names[ni].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 18)}`.slice(0, 40), name: z.names[ni].slice(0, 40), x: R(bx), y: R(ry), w: bw, h: bh, door: { x: R(bx + (bw - dw) / 2), w: dw }, color: z.pal[(ni + r) % z.pal.length], height: KIND_H[kind], kind });
      ni++;
    }
    ry += bh + FRONT;
  }
  const interactionPoints = buildings.filter((b) => ROOM_ACTIVITY[b.kind]).map((b) => ({ id: `rp_${b.id}`.slice(0, 41), name: `${ROOM_ACTIVITY[b.kind][1]}`, x: R(b.x + b.w / 2), y: R(b.y + b.h * 0.45), activity: ROOM_ACTIVITY[b.kind][0] }));
  const cx = z.x + z.w / 2, y0 = top + 1, y1 = ry - FRONT - 1;
  const npcs = buildings.length ? [
    { id: `npc_${z.id}_1`, name: ["Tunde", "Amaka", "Ibrahim", "Ngozi", "Seyi", "Halima"][Z.indexOf(z) % 6], outfit: z.pal[0], skin: "#7a4b2e", speed: 1.5, pauseMs: 2600, path: [{ x: R(cx - 0.8), y: R(y0) }, { x: R(cx - 0.8), y: R(Math.max(y0 + 4, y1)) }] },
    { id: `npc_${z.id}_2`, name: ["Funke", "Emeka", "Zainab", "Kola", "Bisi", "Chidi"][Z.indexOf(z) % 6], outfit: "#f4f1ea", skin: "#b97a4f", speed: 1.9, pauseMs: 1800, path: [{ x: R(cx + 0.8), y: R(Math.max(y0 + 4, y1)) }, { x: R(cx + 0.8), y: R(y0 + 3) }] },
  ] : [
    { id: `npc_${z.id}_1`, name: "Okada Rider", outfit: "#e8a24a", skin: "#7a4b2e", speed: 2.2, pauseMs: 2500, path: [{ x: 58.2, y: 84 }, { x: 58.2, y: 146 }] },
    { id: `npc_${z.id}_2`, name: "Fruit Seller", outfit: "#3f9a58", skin: "#b97a4f", speed: 1.2, pauseMs: 4000, path: [{ x: 64.5, y: 100 }, { x: 64.5, y: 130 }] },
  ];
  const zone = { schemaVersion: 1, id: z.id, name: z.name, rect: { x: z.x, y: z.y, w: z.w, h: z.h }, color: z.color, ambientAudio: "town", spawnPoints: [], buildings, props: [], interactionPoints, npcs, decor: [] };
  fs.writeFileSync(path.join(dir, "zones", z.id + ".json"), JSON.stringify(zone, null, 2) + "\n");
  total.rooms += buildings.length; registry.push(z.id);
  console.log(z.id.padEnd(22), buildings.length, "rooms");
}
console.log("new rooms:", total.rooms);
// registry
let idx = fs.readFileSync(path.join(dir, "index.ts"), "utf8");
idx = idx.replace(/\/\/ GENERATED-DISTRICTS-BEGIN[\s\S]*?\/\/ GENERATED-DISTRICTS-END\n/g, "");
idx = idx.replace(/\n  \/\* districts \*\/[^\n]*\n/, "\n");
const imports = registry.map((id) => `import ${id} from "./zones/${id}.json";`).join("\n");
idx = idx.replace('import world from "./world.json";', `import world from "./world.json";\n// GENERATED-DISTRICTS-BEGIN (scripts/world/generate-districts.mjs)\n${imports}\n// GENERATED-DISTRICTS-END`);
idx = idx.replace(/quiet_garden,\s*\n?\s*(?:\/\* districts \*\/[^\n]*)?\};/, `quiet_garden,\n  /* districts */ ${registry.join(", ")},\n};`);
fs.writeFileSync(path.join(dir, "index.ts"), idx);
