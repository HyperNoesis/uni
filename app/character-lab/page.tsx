"use client";
import { useEffect, useRef, useState } from "react";

/* Character Lab: previews a rigged GLB with Free Fire-style lighting (ACES tone mapping, PBR environment, sun + cool rim light,
 * soft shadows, restrained bloom) using Three.js. Isolated from the game so a bad model can never break /play.
 * Put a model at /public/assets/characters/hero.glb or pick a .glb from your device. Not Draco-compressed (meshopt is fine). */
type Info = { tris: number; meshes: number; clips: string[]; msg: string };
type Lab = { loadUrl: (u: string) => void; play: (n: string) => void };

export default function CharacterLab() {
  const host = useRef<HTMLDivElement>(null);
  const lab = useRef<Lab | null>(null);
  const [info, setInfo] = useState<Info>({ tris: 0, meshes: 0, clips: [], msg: "Starting 3D…" });
  const [active, setActive] = useState("");

  useEffect(() => {
    let stop = () => {};
    let dead = false;
    (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
        const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
        const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
        const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
        const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
        const { OutputPass } = await import("three/addons/postprocessing/OutputPass.js");
        const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
        if (dead || !host.current) return;
        const el = host.current;
        const size = () => ({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#7fc6ee");
        scene.fog = new THREE.Fog("#a9d8f0", 14, 42);
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.55;

        scene.add(new THREE.HemisphereLight("#bfe6ff", "#8a7a52", 0.7));
        const sun = new THREE.DirectionalLight("#fff1d0", 2.6);
        sun.position.set(5, 9, 4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const rim = new THREE.DirectionalLight("#7ab8ff", 1.3); // cool back light: the "game character" edge
        rim.position.set(-4, 3, -5);
        scene.add(rim);

        const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: "#4aa563", roughness: 0.95 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.08, 48), new THREE.MeshStandardMaterial({ color: "#d9ccae", roughness: 0.8 }));
        plinth.position.y = 0.04;
        plinth.receiveShadow = true;
        scene.add(plinth);

        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        camera.position.set(0, 1.4, 4.4);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.95, 0);
        controls.enableDamping = true;
        controls.minDistance = 1.5;
        controls.maxDistance = 9;
        controls.maxPolarAngle = Math.PI / 2.05;

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.6, 0.88));
        composer.addPass(new OutputPass());
        const fit = () => { const { w, h } = size(); renderer.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);

        let current: InstanceType<typeof THREE.Object3D> | null = null;
        let mixer: InstanceType<typeof THREE.AnimationMixer> | null = null;
        let actions = new Map<string, InstanceType<typeof THREE.AnimationAction>>();
        let playing: InstanceType<typeof THREE.AnimationAction> | null = null;

        const disposeObj = (o: InstanceType<typeof THREE.Object3D>) => o.traverse((n) => {
          const m = n as InstanceType<typeof THREE.Mesh>;
          if (!m.isMesh) return;
          m.geometry.dispose();
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v && (v as { isTexture?: boolean }).isTexture) (v as InstanceType<typeof THREE.Texture>).dispose();
            mat.dispose();
          }
        });
        const clear = () => { if (current) { scene.remove(current); disposeObj(current); } mixer?.stopAllAction(); mixer = null; actions = new Map(); playing = null; current = null; };

        const play = (name: string) => {
          const next = actions.get(name);
          if (!next) return;
          next.reset().fadeIn(0.25).play();
          if (playing && playing !== next) playing.fadeOut(0.25);
          playing = next;
          setActive(name);
        };

        const place = (obj: InstanceType<typeof THREE.Object3D>, clips: InstanceType<typeof THREE.AnimationClip>[], msg: string) => {
          clear();
          const box = new THREE.Box3().setFromObject(obj);
          const h = box.max.y - box.min.y || 1;
          obj.scale.multiplyScalar(1.8 / h); // normalise to a 1.8 m person
          const b2 = new THREE.Box3().setFromObject(obj);
          obj.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y + 0.08, -(b2.min.z + b2.max.z) / 2);
          let tris = 0, meshes = 0;
          obj.traverse((n) => {
            const m = n as InstanceType<typeof THREE.Mesh>;
            if (!m.isMesh) return;
            meshes++; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
            const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          });
          scene.add(obj);
          current = obj;
          if (clips.length) {
            mixer = new THREE.AnimationMixer(obj);
            for (const c of clips) actions.set(c.name, mixer.clipAction(c));
            const first = clips.find((c) => /idle/i.test(c.name)) ?? clips[0]!;
            play(first.name);
          } else setActive("");
          setInfo({ tris: Math.round(tris), meshes, clips: clips.map((c) => c.name), msg });
        };

        const fallback = () => { // stylised placeholder soldier so the lab is never empty
          const g = new THREE.Group();
          const mat = (c: string, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.05 });
          const add = (geo: import("three").BufferGeometry, c: string, x: number, y: number, z = 0) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); g.add(m); };
          add(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), "#3b4a2f", 0, 1.1);
          add(new THREE.BoxGeometry(0.5, 0.42, 0.34), "#2d3340", 0, 1.15);
          add(new THREE.SphereGeometry(0.2, 24, 18), "#8a5a3a", 0, 1.68);
          add(new THREE.SphereGeometry(0.21, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), "#1c1f26", 0, 1.72);
          for (const s of [-1, 1]) {
            add(new THREE.CapsuleGeometry(0.075, 0.5, 4, 8), "#3b4a2f", s * 0.33, 1.1);
            add(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), "#2a3144", s * 0.14, 0.45);
            add(new THREE.BoxGeometry(0.16, 0.12, 0.3), "#1c1f26", s * 0.14, 0.06, 0.05);
          }
          place(g, [], "Placeholder (no hero.glb found). Pick a .glb below.");
        };

        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const loadUrl = (url: string) => {
          setInfo((i) => ({ ...i, msg: "Loading model…" }));
          loader.load(url, (gltf) => place(gltf.scene, gltf.animations, "Loaded"), undefined,
            () => { if (url.includes("hero.glb")) fallback(); else setInfo((i) => ({ ...i, msg: "Could not read that file. Export as .glb (no Draco)." })); });
        };
        lab.current = { loadUrl, play };
        loadUrl("/assets/characters/hero.glb");

        const clock = new THREE.Clock();
        let raf = 0;
        const loop = () => { raf = requestAnimationFrame(loop); mixer?.update(clock.getDelta()); controls.update(); composer.render(); };
        loop();
        stop = () => { cancelAnimationFrame(raf); ro.disconnect(); clear(); controls.dispose(); composer.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); };
      } catch (e) {
        setInfo({ tris: 0, meshes: 0, clips: [], msg: "3D could not start: " + (e instanceof Error ? e.message : "unknown error") + ". Run pnpm install (adds three)." });
      }
    })();
    return () => { dead = true; stop(); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b1226", color: "#fff" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: 12, left: 12, maxWidth: 320, background: "rgba(10,20,48,.82)", border: "1px solid rgba(120,170,255,.3)", borderRadius: 14, padding: 12, fontSize: 13 }}>
        <b>Character Lab</b>
        <p style={{ margin: "6px 0" }}>{info.msg}</p>
        <label style={{ display: "block", margin: "6px 0" }}>Pick a .glb
          <input type="file" accept=".glb,model/gltf-binary" style={{ display: "block", marginTop: 4 }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) lab.current?.loadUrl(URL.createObjectURL(f)); }} />
        </label>
        <div>Triangles {info.tris.toLocaleString()} · meshes {info.meshes} <small style={{ opacity: .7 }}>(phone target: under ~15k tris)</small></div>
        {info.clips.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {info.clips.map((c) => <button key={c} onClick={() => lab.current?.play(c)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,.25)", background: active === c ? "#2f6bff" : "transparent", color: "#fff", cursor: "pointer" }}>{c}</button>)}
        </div>}
      </div>
    </div>
  );
}
