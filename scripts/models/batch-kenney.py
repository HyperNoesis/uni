#!/usr/bin/env python3
"""Batch-convert curated Kenney (CC0) kits with import-kenney.py. Usage: batch-kenney.py <kenney>/3d <outdir> [--max-tris 3000]
Writes <outdir>/<kit>/<model>.glb and <outdir>/catalog.json (id, kit, tris, bytes, bounds). Staging only: nothing is registered in assets.json."""
import json, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
KITS = ["nature", "furniture", "food", "mini-market", "city-commercial", "city-suburban", "modular-buildings", "retro-urban", "city-roads", "fantasy-town"]
ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("out"); ap.add_argument("--max-tris", type=int, default=3000); a = ap.parse_args()
tool = str(Path(__file__).with_name("import-kenney.py")); jobs = []
for kit in KITS:
    (Path(a.out) / kit).mkdir(parents=True, exist_ok=True)
    for f in sorted((Path(a.src) / kit).glob("*.glb")): jobs.append((kit, f))
def run(j):
    kit, f = j; o = Path(a.out) / kit / f.name
    r = subprocess.run([sys.executable, tool, "--src", str(f), "--out", str(o), "--max-tris", str(a.max_tris)], capture_output=True, text=True)
    try: d = json.loads(r.stdout.strip().splitlines()[-1]); d["kit"] = kit; return d
    except Exception: return {"id": f.stem, "kit": kit, "error": (r.stderr or r.stdout)[-120:]}
with ThreadPoolExecutor(8) as ex: res = list(ex.map(run, jobs))
json.dump(res, open(Path(a.out) / "catalog.json", "w"), indent=0)
ok = [r for r in res if "error" not in r]; print(f"{len(ok)}/{len(res)} converted, {sum(r['tris'] for r in ok)} tris, {sum(r['bytes'] for r in ok)/1048576:.1f} MiB")
