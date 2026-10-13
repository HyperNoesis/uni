#!/usr/bin/env python3
"""Build CAMPUS's low-poly skinned character GLB from Quaternius' Universal Animation Library (CC0).

Source : AnimationLibrary_Godot_Standard.gltf/.bin  (Quaternius, CC0 1.0 - see docs/ASSET_SOURCES.md)
Output : apps/web/public/assets/characters/campus_body.glb

What it does (all deterministic, numpy only):
  1. Merges the two source primitives and welds vertices that share a position (UV seams).
  2. Collapses the 30 finger/thumb joints onto the hand joint (23 joints remain) - fingers are invisible at game scale.
  3. Decimates with quadric edge collapse (+ a skin-weight penalty so limbs keep their deformation) to --tris triangles.
  4. Recomputes smooth normals, keeps the top-4 bone weights per vertex.
  5. Keeps only the clips the game can reach, drops animation tracks that never move, and writes ONE self-contained GLB
     (no external buffers - the in-repo loader forbids them).

Usage: python3 scripts/models/build-character.py --src <dir with the .gltf/.bin> [--tris 2400] [--out path]
"""
import argparse, heapq, json, math, struct, sys
from pathlib import Path
import numpy as np

KEEP_CLIPS = ["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop",
              "Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Exit", "Dance_Loop", "Interact"]  # + synthetic Stand_Loop
# Which body region each kept joint colours (0 skin, 1 outfit/top, 2 pants, 3 shoes). Blended by skin weight at load time.
REGION = {"root": 2, "DEF-hips": 2, "DEF-spine.001": 1, "DEF-spine.002": 1, "DEF-spine.003": 1, "DEF-neck": 0, "DEF-head": 0}
for side in ("L", "R"):
    REGION.update({f"DEF-shoulder.{side}": 1, f"DEF-upper_arm.{side}": 1, f"DEF-forearm.{side}": 0, f"DEF-hand.{side}": 0,
                   f"DEF-thigh.{side}": 2, f"DEF-shin.{side}": 2, f"DEF-foot.{side}": 3, f"DEF-toe.{side}": 3})
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_acc(g, buf, i):
    a = g["accessors"][i]; bv = g["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]]); nc = NC[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0); stride = bv.get("byteStride", 0) or dt.itemsize * nc
    if stride == dt.itemsize * nc:
        arr = np.frombuffer(buf, dtype=dt, count=a["count"] * nc, offset=off).reshape(a["count"], nc)
    else:
        arr = np.stack([np.frombuffer(buf, dtype=dt, count=nc, offset=off + k * stride) for k in range(a["count"])])
    return arr.copy()


def trs(t, q, s):
    x, y, z, w = q; xx, yy, zz, xy, xz, yz, wx, wy, wz = x*x, y*y, z*z, x*y, x*z, y*z, w*x, w*y, w*z
    m = np.eye(4)
    m[:3, :3] = np.array([[1-2*(yy+zz), 2*(xy-wz), 2*(xz+wy)], [2*(xy+wz), 1-2*(xx+zz), 2*(yz-wx)], [2*(xz-wy), 2*(yz+wx), 1-2*(xx+yy)]]) * np.array(s)
    m[:3, 3] = t
    return m


def decimate(P, F, W, target, wpen=0.5):
    """Quadric edge collapse. P (n,3) positions, F (m,3) faces, W (n,k) dense skin weights. Returns compacted P, F, W."""
    P = P.astype(np.float64).copy(); W = W.astype(np.float64).copy(); F = [tuple(f) for f in F.tolist()]
    n = len(P); alive_v = np.ones(n, bool); face_ok = [True] * len(F)
    vfaces = [set() for _ in range(n)]
    for fi, f in enumerate(F):
        for v in f: vfaces[v].add(fi)
    Q = np.zeros((n, 4, 4))
    for fi, (a, b, c) in enumerate(F):
        nrm = np.cross(P[b]-P[a], P[c]-P[a]); ar = np.linalg.norm(nrm)
        if ar < 1e-14: continue
        nrm = nrm / ar; pl = np.append(nrm, -nrm @ P[a]); K = np.outer(pl, pl) * ar * 0.5
        for v in (a, b, c): Q[v] += K
    ver = np.zeros(n, int)
    # Sharp discontinuities of the source (e.g. joint balls poking through limbs) get mild boundary protection via the plane sum alone.

    def err(q, p): h = np.append(p, 1.0); return float(h @ q @ h)

    def best(a, b):
        q = Q[a] + Q[b]; cands = [P[a], P[b], (P[a]+P[b]) / 2]
        es = [err(q, c) for c in cands]; k = int(np.argmin(es))
        return es[k] + wpen * float(np.sum((W[a]-W[b])**2)) * (np.linalg.norm(P[a]-P[b]) + 0.02), cands[k]

    def flips(v_old, others, newp):
        for fi in vfaces[v_old]:
            f = F[fi]
            if any(o in f for o in others) and sum(1 for o in others if o in f) == len(others): continue  # face disappears
            a, b, c = f; pa, pb, pc = P[a].copy(), P[b].copy(), P[c].copy()
            n0 = np.cross(pb-pa, pc-pa)
            if v_old == a: pa = newp
            elif v_old == b: pb = newp
            else: pc = newp
            n1 = np.cross(pb-pa, pc-pa)
            l0, l1 = np.linalg.norm(n0), np.linalg.norm(n1)
            if l0 > 1e-14 and (l1 < 1e-14 or (n0 @ n1) / (l0*l1) < 0.2): return True
        return False

    heap = []
    def push_edges(v):
        nb = set()
        for fi in vfaces[v]:
            for u in F[fi]:
                if u != v: nb.add(u)
        for u in nb:
            a, b = (v, u) if v < u else (u, v)
            c, p = best(a, b); heapq.heappush(heap, (c, ver[a], ver[b], a, b, p.tolist()))
    for v in range(n): push_edges(v)
    nfaces = len(F)
    while nfaces > target and heap:
        c, va, vb, a, b, p = heapq.heappop(heap)
        if not (alive_v[a] and alive_v[b]) or va != ver[a] or vb != ver[b]: continue
        p = np.array(p)
        if flips(a, (a, b), p) or flips(b, (a, b), p): continue
        # collapse b -> a
        P[a] = p; Q[a] += Q[b]; W[a] = (W[a] + W[b]) / 2
        alive_v[b] = False; ver[a] += 1; ver[b] += 1
        for fi in list(vfaces[b]):
            f = F[fi]; nf = tuple(a if v == b else v for v in f)
            if len(set(nf)) < 3:
                face_ok[fi] = False; nfaces -= 1
                for v in f: vfaces[v].discard(fi)
            else:
                F[fi] = nf; vfaces[a].add(fi)
        vfaces[b].clear()
        push_edges(a)
    keep = [i for i in range(n) if alive_v[i] and vfaces[i]]
    remap = {v: i for i, v in enumerate(keep)}
    NF = np.array([[remap[v] for v in F[fi]] for fi in range(len(F)) if face_ok[fi]], dtype=np.int64)
    return P[keep], NF, W[keep]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True); ap.add_argument("--tris", type=int, default=2400)
    ap.add_argument("--clips", default=",".join(KEEP_CLIPS), help="comma list of source clips to keep, or 'all'")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "apps/web/public/assets/characters/campus_body.glb"))
    args = ap.parse_args()
    src = Path(args.src); g = json.loads((src / "AnimationLibrary_Godot_Standard.gltf").read_text())
    buf = (src / "AnimationLibrary_Godot_Standard.bin").read_bytes()
    nodes = g["nodes"]; skin = g["skins"][0]; sj = skin["joints"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    names = {i: nodes[i]["name"] for i in range(len(nodes))}
    isfinger = lambda nm: nm.startswith("DEF-f_") or nm.startswith("DEF-thumb")
    kept_nodes = [j for j in sj if not isfinger(names[j])]
    def kept_anc(j):
        while isfinger(names[j]): j = parent[j]
        return j
    # parent-before-child order via DFS from the skeleton root
    root_node = [j for j in kept_nodes if parent.get(j) not in kept_nodes][0]
    order = []
    def dfs(j):
        order.append(j)
        for c in nodes[j].get("children", []):
            if c in kept_nodes: dfs(c)
    dfs(root_node)
    assert sorted(order) == sorted(kept_nodes), "skeleton traversal mismatch"
    new_idx = {nj: i for i, nj in enumerate(order)}; K = len(order)
    old_to_new = {oi: new_idx[kept_anc(nj)] for oi, nj in enumerate(sj)}  # source joint slot -> new joint slot
    ibm_src = read_acc(g, buf, skin["inverseBindMatrices"]).reshape(-1, 4, 4)  # glTF stores column-major; reshape gives transposed rows
    ibm = np.stack([ibm_src[sj.index(nj)].T for nj in order])  # true matrices (row-major math)

    # --- mesh: merge primitives, weld by position
    P_all, J_all, W_all = [], [], []; F_all = []; base = 0
    for prim in g["meshes"][0]["primitives"]:
        at = prim["attributes"]; p = read_acc(g, buf, at["POSITION"]).astype(np.float64)
        j = read_acc(g, buf, at["JOINTS_0"]).astype(int); w = read_acc(g, buf, at["WEIGHTS_0"]).astype(np.float64)
        f = read_acc(g, buf, prim["indices"]).reshape(-1, 3).astype(int) + base
        P_all.append(p); J_all.append(j); W_all.append(w); F_all.append(f); base += len(p)
    P = np.concatenate(P_all); J = np.concatenate(J_all); Wt = np.concatenate(W_all); F = np.concatenate(F_all)
    dense = np.zeros((len(P), K))
    for k in range(4):
        for vi in range(len(P)): dense[vi, old_to_new[J[vi, k]]] += Wt[vi, k]
    dense /= np.maximum(dense.sum(1, keepdims=True), 1e-9)
    keyq = np.round(P * 1e4).astype(np.int64); _, first, inv = np.unique(keyq, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1); Pw = P[first]; Ww = dense[first]; Fw = inv[F]
    Fw = Fw[(Fw[:, 0] != Fw[:, 1]) & (Fw[:, 1] != Fw[:, 2]) & (Fw[:, 0] != Fw[:, 2])]
    print(f"source: {len(P)} verts / {len(F)} tris -> welded {len(Pw)} verts / {len(Fw)} tris, {K} joints", file=sys.stderr)
    Pd, Fd, Wd = decimate(Pw, Fw, Ww, args.tris)
    print(f"decimated: {len(Pd)} verts / {len(Fd)} tris", file=sys.stderr)

    # normals
    N = np.zeros_like(Pd)
    for a, b, c in Fd:
        nrm = np.cross(Pd[b]-Pd[a], Pd[c]-Pd[a])
        N[a] += nrm; N[b] += nrm; N[c] += nrm
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    # top-4 weights
    top = np.argsort(-Wd, axis=1)[:, :4]; Jo = np.take_along_axis(np.tile(np.arange(K), (len(Pd), 1)), top, 1).astype(np.uint8)
    Wo = np.take_along_axis(Wd, top, 1); Wo /= np.maximum(Wo.sum(1, keepdims=True), 1e-9)

    # --- rest pose world matrices (forward axis, height, sanity)
    local = []
    for nj in order:
        n = nodes[nj]; local.append(trs(n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1]), n.get("scale", [1, 1, 1])))
    world = []
    for i, nj in enumerate(order):
        pi = new_idx.get(parent.get(nj)); world.append(local[i] if pi is None else world[pi] @ local[i])
    foot = world[new_idx[[j for j in order if names[j] == "DEF-foot.L"][0]]][:3, 3]; toe = world[new_idx[[j for j in order if names[j] == "DEF-toe.L"][0]]][:3, 3]
    fwd = toe - foot; fwd[1] = 0; fwd = (fwd / np.linalg.norm(fwd)).tolist()
    print("height", float(Pd[:, 1].max() - Pd[:, 1].min()), "forward", fwd, file=sys.stderr)

    # --- write GLB
    bin_parts = []; views = []; accs = []
    def add(arr, ctype, atype, target=None, minmax=False):
        raw = arr.tobytes(); pad = (-len(raw)) % 4; off = sum(len(b) for b in bin_parts)
        bin_parts.append(raw + b"\0" * pad)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
        if target: v["target"] = target
        views.append(v)
        a = {"bufferView": len(views)-1, "componentType": ctype, "count": int(len(arr)), "type": atype}
        if minmax: a["min"] = np.atleast_1d(arr.min(0)).astype(float).tolist(); a["max"] = np.atleast_1d(arr.max(0)).astype(float).tolist()
        accs.append(a); return len(accs)-1
    a_pos = add(Pd.astype(np.float32), 5126, "VEC3", 34962, True); a_nrm = add(N.astype(np.float32), 5126, "VEC3", 34962)
    a_jnt = add(Jo, 5121, "VEC4", 34962); a_wgt = add(Wo.astype(np.float32), 5126, "VEC4", 34962)
    a_idx = add(Fd.astype(np.uint16).reshape(-1), 5123, "SCALAR", 34963)
    a_ibm = add(np.stack([m.T for m in ibm]).reshape(-1, 16).astype(np.float32), 5126, "MAT4")
    out_nodes = [{"name": "CampusBody", "mesh": 0, "skin": 0}]
    for i, nj in enumerate(order):
        n = nodes[nj]; o = {"name": names[nj].replace("DEF-", "")}
        ch = [new_idx[c] + 1 for c in n.get("children", []) if c in new_idx]
        if ch: o["children"] = ch
        o["translation"] = [float(x) for x in n.get("translation", [0, 0, 0])]; o["rotation"] = [float(x) for x in n.get("rotation", [0, 0, 0, 1])]
        o["scale"] = [float(x) for x in n.get("scale", [1, 1, 1])]; out_nodes.append(o)
    out_nodes.append({"name": "Rig", "children": [0, 1]})  # mesh node + skeleton root
    rest = {nj: (np.array(nodes[nj].get("translation", [0, 0, 0])), np.array(nodes[nj].get("rotation", [0, 0, 0, 1])), np.array(nodes[nj].get("scale", [1, 1, 1]))) for nj in order}
    time_cache = {}; anims = []; clip_info = {}
    # Every standing idle in the free pack is a contrapposto stance with one foot ~0.4 m ahead (reads as "mid-stride" from behind).
    # Stand_Loop = Idle_Loop's upper body + breathing, with hips translation and all leg joints left at the rest pose (feet together).
    LEG = ("DEF-thigh.", "DEF-shin.", "DEF-foot.", "DEF-toe.")
    jobs = [(an["name"], an, None) for an in g["animations"] if args.clips == "all" or an["name"] in args.clips.split(",")]
    idle = next((a for a in g["animations"] if a["name"] == "Idle_Loop"), None)
    if idle is not None and not any(j[0] == "Stand_Loop" for j in jobs):
        jobs.append(("Stand_Loop", idle, lambda tn, path: names[tn].startswith(LEG) or (names[tn] == "DEF-hips" and path == "translation")))
    for out_name, an, skip in jobs:
        samplers, channels = [], []
        for ch in an["channels"]:
            tn = ch["target"]["node"]
            if tn not in new_idx: continue
            if skip and skip(tn, ch["target"]["path"]): continue
            path = ch["target"]["path"]; s = an["samplers"][ch["sampler"]]
            vals = read_acc(g, buf, s["output"]).astype(np.float32); r = rest[tn][{"translation": 0, "rotation": 1, "scale": 2}[path]]
            if np.all(np.abs(vals - vals[0]) < 1e-5) and np.all(np.abs(vals[0] - r) < 1e-4): continue  # never moves: rest pose covers it
            if s["input"] not in time_cache: time_cache[s["input"]] = add(read_acc(g, buf, s["input"]).reshape(-1).astype(np.float32), 5126, "SCALAR", None, True)
            samplers.append({"input": time_cache[s["input"]], "output": add(vals, 5126, "VEC4" if path == "rotation" else "VEC3"), "interpolation": s.get("interpolation", "LINEAR")})
            channels.append({"sampler": len(samplers)-1, "target": {"node": new_idx[tn] + 1, "path": path}})
        dur = float(max((accs[sm["input"]]["max"][0] for sm in samplers), default=0.0)); anims.append({"name": out_name, "samplers": samplers, "channels": channels}); clip_info[out_name] = dur
    missing = [c for c in (KEEP_CLIPS if args.clips != "all" else []) if c not in clip_info]
    if missing: print("WARNING missing clips:", missing, file=sys.stderr)
    gj = {"asset": {"version": "2.0", "generator": "CAMPUS scripts/models/build-character.py (source: Quaternius Universal Animation Library, CC0)", "copyright": "Source rig/animations (c) Quaternius, CC0 1.0"},
          "scene": 0, "scenes": [{"nodes": [len(out_nodes)-1]}], "nodes": out_nodes,
          "meshes": [{"name": "CampusBody", "primitives": [{"attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "JOINTS_0": a_jnt, "WEIGHTS_0": a_wgt}, "indices": a_idx, "material": 0}]}],
          "materials": [{"name": "body", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.8}}],
          "skins": [{"joints": [i + 1 for i in range(K)], "inverseBindMatrices": a_ibm, "skeleton": 1}],
          "animations": anims, "accessors": accs, "bufferViews": views,
          "extras": {"campus": {"forward": fwd, "jointRegion": [REGION[names[nj]] for nj in order], "clips": clip_info, "triangles": int(len(Fd)),
                                "regions": ["skin", "outfit", "pants", "shoes"], "source": "Quaternius Universal Animation Library (Standard), CC0 1.0"}}}
    body = b"".join(bin_parts); gj["buffers"] = [{"byteLength": len(body)}]
    js = json.dumps(gj, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(body)
    out = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(body), 0x004E4942) + body
    Path(args.out).parent.mkdir(parents=True, exist_ok=True); Path(args.out).write_bytes(out)
    print(f"wrote {args.out}: {len(out)/1024:.1f} KiB, {len(Fd)} tris, {K} joints, {len(anims)} clips", file=sys.stderr)


if __name__ == "__main__":
    main()
