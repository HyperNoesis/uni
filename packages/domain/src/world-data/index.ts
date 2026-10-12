// Registry of zone files. To add a room: drop <id>.json into ./zones and add one import line here.
// world-data.test.ts fails if a file exists in ./zones but is not listed (or vice versa).
import world from "./world.json";
// GENERATED-DISTRICTS-BEGIN (scripts/world/generate-districts.mjs)
import engineering_quarter from "./zones/engineering_quarter.json";
import science_complex from "./zones/science_complex.json";
import medical_college from "./zones/medical_college.json";
import arts_row from "./zones/arts_row.json";
import business_law from "./zones/business_law.json";
import hostel_estate_east from "./zones/hostel_estate_east.json";
import hostel_village from "./zones/hostel_village.json";
import gate_road from "./zones/gate_road.json";
import market_town from "./zones/market_town.json";
import admin_quarter from "./zones/admin_quarter.json";
import research_park from "./zones/research_park.json";
import innovation_village from "./zones/innovation_village.json";
// GENERATED-DISTRICTS-END
import assets from "./assets.json";
import main_gate from "./zones/main_gate.json";
import student_commons from "./zones/student_commons.json";
import academic_block from "./zones/academic_block.json";
import hostel_street from "./zones/hostel_street.json";
import food_court from "./zones/food_court.json";
import library from "./zones/library.json";
import sports_ground from "./zones/sports_ground.json";
import creator_hub from "./zones/creator_hub.json";
import event_arena from "./zones/event_arena.json";
import quiet_garden from "./zones/quiet_garden.json";

export const WORLD_JSON: unknown = world;
export const ZONE_JSON: Record<string, unknown> = {
  main_gate, student_commons, academic_block, hostel_street, food_court, library, sports_ground, creator_hub, event_arena, quiet_garden,
  /* districts */ engineering_quarter, science_complex, medical_college, arts_row, business_law, hostel_estate_east, hostel_village, gate_road, market_town, admin_quarter, research_park, innovation_village,
};
export const ASSET_MANIFEST_JSON: unknown = assets;
