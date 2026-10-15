#!/bin/sh
# usage: ORIG=/path/to/pristine/checkout scripts/models/regen-palm-only.sh   (generate-props.mjs rewrites zones/*.json, assets.json and ~150 extra props; this keeps ONLY the palm GLBs)
# Runs the prop generator, keeps ONLY palm_tree/palm_royal, restores everything else it rewrites (zones, assets.json, other props).
set -e
cd $(cd "$(dirname "$0")/../.." && pwd)
rm -rf /tmp/gen && mkdir -p /tmp/gen
node scripts/models/generate-props.mjs >/dev/null 2>&1
cp apps/web/public/assets/props/palm_tree.glb apps/web/public/assets/props/palm_royal.glb /tmp/gen/
rm -rf apps/web/public/assets/props && cp -r "$ORIG"/apps/web/public/assets/props apps/web/public/assets/props
cp "$ORIG"/packages/domain/src/world-data/assets.json packages/domain/src/world-data/assets.json
cp "$ORIG"/packages/domain/src/world-data/zones/*.json packages/domain/src/world-data/zones/
cp /tmp/gen/palm_tree.glb /tmp/gen/palm_royal.glb apps/web/public/assets/props/
