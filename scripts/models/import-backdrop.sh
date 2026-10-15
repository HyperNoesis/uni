#!/bin/sh
# Bakes the Kenney (CC0) city-commercial buildings used as the campus backdrop into texture-less GLBs and registers them in
# assets.json as always-resident decor:kn_bd_*.  Does NOT touch zones/*.json (unlike generate-props.mjs).
set -e
cd "$(dirname "$0")/../.."
out=apps/web/public/assets/kenney; mkdir -p $out; : > /tmp/kn_bd.jsonl
for m in a b c d e f g h; do python3 scripts/models/import-kenney.py --src assets-library/kenney/city-commercial/building-$m.glb --out $out/kn_bd_$m.glb --max-tris 2500 --scale 13.5 | tail -1 >> /tmp/kn_bd.jsonl; done
for m in a c d; do python3 scripts/models/import-kenney.py --src assets-library/kenney/city-commercial/building-skyscraper-$m.glb --out $out/kn_bd_sky_$m.glb --max-tris 2500 --scale 10 | tail -1 >> /tmp/kn_bd.jsonl; done
python3 - <<'PY'
import json
mp="packages/domain/src/world-data/assets.json"; m=json.load(open(mp))
m["assets"]=[a for a in m["assets"] if not a["id"].startswith("kn_bd_")]
for l in open("/tmp/kn_bd.jsonl"):
    r=json.loads(l); i=r["id"]
    m["assets"].append({"id":i,"url":f"/assets/kenney/{i}.glb","slot":f"decor:{i}","zones":"all","maxBytes":120000,"maxTriangles":2500,"size":r["size"]})
json.dump(m,open(mp,"w"),indent=2); open(mp,"a").write("\n")
PY
