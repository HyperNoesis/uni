# Acceptance gates (honest, 2026-10-10). No browser frames have been captured, so nothing is PASS.
| Gate | Status | Reason |
|---|---|---|
| Live 3D proof | PARTIAL | Real geometry, mock-GL tests only; no screenshot |
| Hero vista | PARTIAL | Gate, beacon, islands built; placement unseen |
| Architectural quality | PARTIAL | Kit + 9 zones; no close/medium/far captures |
| Whole-world continuity | PARTIAL | Zones joined by routes in data; unwalked |
| Human-scale validity | NOT TESTED | |
| Real interactions | PARTIAL | Existing boards/activities work in Phase 4-6; no matrix |
| Material/lighting | PARTIAL | Shader written, not GPU-verified |
| UI consistency | PARTIAL | Day/Night pill only; no 390x844 / 360x800 captures |
| Animation | PARTIAL | Walk/bob exists; not recorded |
| World population | PARTIAL | 17 ambient NPCs, capped by quality; collision with player not tested |
| Performance | NOT TESTED | Mock draw calls ~160 only |
| Network integrity | NOT RE-RUN | |
| Asset hygiene | PARTIAL | Registry written; no console log |
| IP/rights | PASS (by construction) | All assets generated in-repo; no third-party art |

## Update 2026-10-11 (pass K, real Chromium frames; software GL, evidence in /tmp shots v1440/v390/v360/night/z5)
| Gate | Status | Evidence / reason |
|---|---|---|
| Live 3D proof | PASS | Real geometry rendered in Chromium; frames captured at 1440x900, 390x844, 360x800 |
| Hero vista | PARTIAL | Gate + Student Centre + commons + beacon seen; boulevard seen only from above |
| Architectural quality | PARTIAL | Gate, commons, food court, sports seen; library/hostel/academic/creator/arena NOT yet viewed |
| UI consistency | PARTIAL | Consistent SVG icon set, 5-item bottom nav, no overlaps at 360/390/1440; no design-token file yet; Reset pill still uses emoji |
| Material/lighting | PARTIAL | Day + night frames viewed; festival beams not viewed |
| World population | PARTIAL | NPCs + 3 real clients visible together (online 3) |
| Network integrity | PARTIAL | 3 simultaneous browser clients saw each other; reconnect not re-run |
| Performance | NOT TESTED on real GPU | software GL only |

## Update pass O
| Whole-world continuity | PARTIAL | Transport Edge now built (unviewed); all 12 brief spatial items exist in code |
| Quality ladder | PASS (code) | Low/Balanced/High + Auto, persisted in localStorage, auto-downgrade; not measured on a real GPU |

## Pass L3 status (honest; nothing below is a measured PASS)
| Gate | Status | Evidence / reason |
|---|---|---|
| Live 3D proof | PARTIAL | Real geometry for 22 zones; no frame reviewed by a human yet. Run `node scripts/capture-evidence.mjs`. |
| Whole-world continuity | PARTIAL | `tests/visual/world-expansion.mjs`: 22 zones, 160 buildings, 158 enterable rooms, all reachable from spawn (ran, passed). |
| Architectural quality | PARTIAL | Kit + landmarks for every zone (`world-architecture*.ts`); needs close/medium/long captures. |
| Animation | PARTIAL | Walk cycle, heading-facing, wave/dance/laugh/cheer poses, idle breathing (code + contract test; not seen). |
| Performance | NOT MEASURED | `FrameSampler` + "Record 60s route" button (backtick) produces p50/p95 JSON; auto quality now also upgrades with hysteresis. Needs a real device. |
| UI consistency | PARTIAL | Existing HUD; needs 1440x900 / 390x844 / 360x800 captures. |
| World population | PARTIAL | 2+ NPCs per zone, routes re-cut around landmarks; low/high crowd captures pending. |
| Network integrity | NOT RE-RUN | Phase 4 two-client test not run here. |
| Asset hygiene / IP | PARTIAL | No external models/textures added; all geometry procedural and original. |

## Pass M (11 Oct 2026, software GL frames + tests; no real GPU)
| Gate | Status | Evidence / reason |
|---|---|---|
| Performance | PARTIAL | Draw calls measured in software GL: high 186, medium 136, low 88 (was 297/182/88). FPS on a real device still NOT MEASURED. |
| Real interactions | PARTIAL | Marker labels now name the real action; Sit added with server check + tests. |
| Animation | PARTIAL | Seated pose added; still not recorded on video. |
| UI consistency | PARTIAL | Label overlap fixed in captured frames; 390x844/360x800 not re-captured this pass. |
| Material/lighting | PARTIAL | Night glow verified in frame after emissive merge; grass variation added. |
| Hero vista | PARTIAL | Showcase camera added (code + typecheck; not screen-recorded). |
