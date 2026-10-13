"use client";

import { DEFAULT_PITCH, clampPitch, clampZoom, clampLook, wrapHeading, headingForward, headingRight } from "../../lib/world-camera";
import { JobsSheet } from "../../components/JobsSheet";
import { ShiftSheet } from "../../components/ShiftSheet";
import { TasksPanel } from "../../components/TasksPanel";
import { GateCheck, GATE_POST, type GateState } from "../../components/GateCheck";
import { PocketPhone } from "../../components/PocketPhone";
import { HudIcon, PlayNav } from "../../components/HudIcons";
import { useCallback, useEffect, useRef, useState } from "react";
import SportsGame from "../../components/SportsGame";
import type { Sport } from "../../lib/sports-game";
import MiniGame from "../../components/MiniGame";
import type { Mini } from "../../lib/minigames";
import { useRouter } from "next/navigation";
import { FrameSampler, QualityGovernor } from "../../lib/perf-sampler";
import {
  AMBIENT_NPCS,
  CAMPUSES,
  DEFAULT_AVATAR,
  DOWNGRADE,
  BUILDINGS,
  INTERACTION_POINTS,
  WALL,
  HUNT_START_POINT_ID,
  HUNT_STOPS,
  QUALITY_PROFILES,
  SPAWN,
  WORLD,
  ZONES,
  buildingAt,
  levelFor,
  npcAt,
  slideMove,
  suggestQuality,
  zoneAt,
  canSit,
  ASSET_MANIFEST,
  type QualityLevel,
  type ClientMessage,
  type PlayerProfile,
  type PlayerSnapshot,
  type ServerMessage,
} from "@campus/domain";
import { api, clearToken, getToken, warmServers, WS_URL } from "../../lib/api";
import { drawWorld, type Entity } from "../../lib/world-render";
import { createWorld3DRenderer } from "../../lib/world-3d-render";
import { createAssetStreamer, type AssetStreamer } from "../../lib/asset-loader";
import { loadSkinnedCharacter, CHARACTER_LOD_URL } from "../../lib/skinned-character";

const EMOTES = { wave: "👋", dance: "💃", laugh: "😂", cheer: "🎉" } as const; // "sit" is a contextual action, not in this strip
type EmoteKey = keyof typeof EMOTES;
type Phase = "connecting" | "live" | "reconnecting" | "failed";

interface Remote extends PlayerSnapshot {
  rx: number;
  ry: number;
}

export default function Play() {
  const router = useRouter();
  const stage = useRef<HTMLCanvasElement>(null);
  const stage3d = useRef<HTMLCanvasElement>(null);
  const stageLabels = useRef<HTMLCanvasElement>(null);
  const renderer3dRef = useRef<ReturnType<typeof createWorld3DRenderer> | null>(null);
  const assetStreamerRef = useRef<AssetStreamer | null>(null);
  const renderer3dFailed = useRef(false);
  const renderModeRef = useRef<"3D" | "2D">("3D");
  const ws = useRef<WebSocket | null>(null);
  const me = useRef<{ id: string; x: number; y: number; seq: number }>({ id: "", x: SPAWN.x, y: SPAWN.y, seq: 0 });
  const others = useRef(new Map<string, Remote>());
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const reconnect = useRef<{ token: string | null; tries: number }>({ token: null, tries: 0 });
  const nearRef = useRef<string | null>(null);
  const huntTargetRef = useRef<string | null>(null);
  const huntRef = useRef<HuntPanel | null>(null);
  const huntBusyRef = useRef(false);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [population, setPopulation] = useState(1);
  const [zoneName, setZoneName] = useState("Main Gate");
  const [renderMode, setRenderMode] = useState<"3D" | "2D">("3D");
  // The minimap marker is updated straight on the DOM (no React re-render of the whole world screen while walking).
  const mapDot = useRef<SVGCircleElement>(null);
  const mapRing = useRef<SVGCircleElement>(null);
  const mapCone = useRef<SVGPolygonElement>(null);
  const [near, setNear] = useState<string | null>(null);
  const [sitOk, setSitOk] = useState(false);
  const gateRef = useRef<GateState>({ gx: GATE_POST.x, gy: GATE_POST.y, open: 0 });
  const [gateDone, setGateDone] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  useEffect(() => { try { if (sessionStorage.getItem("campus.gatePass")) { gateRef.current.open = 1; setGateDone(true); } } catch { /* storage blocked: show the check */ } }, []);
  const finishGate = useCallback(() => { try { sessionStorage.setItem("campus.gatePass", "1"); } catch { /* ignore */ } setGateDone(true); }, []);
  const sitOkRef = useRef(false);
  const myEmote = useRef<{ k: string; until: number; x: number; y: number } | null>(null);
  function doEmote(k: string) {
    if (k === "sit" && !canSit(me.current.x, me.current.y)) return;
    send({ t: "emote", emote: k } as ClientMessage);
    myEmote.current = { k, until: Date.now() + (k === "sit" ? 20000 : 2500), x: me.current.x, y: me.current.y };
  }
  const [toast, setToast] = useState("");
  const [jobsOpen, setJobsOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const viewOverride = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { if (!canDiag) return; const m = /[?&]view=(-?[\d.]+),(-?[\d.]+)/.exec(location.search); if (m) viewOverride.current = { x: +m[1]!, y: +m[2]! }; }, []);
  const [tasksOpen, setTasksOpen] = useState(false); // opened on wide screens after mount (avoids an SSR hydration mismatch)
  useEffect(() => { if (window.innerWidth >= 720) setTasksOpen(true); }, []);
  const [taskTick, setTaskTick] = useState(0);
  const [reaction, setReaction] = useState<null | { stage: "starting" | "wait" | "go" | "done"; runId?: string; msg?: string }>(null);
  type QuizQuestionView = { id: string; category: string; prompt: string; choices: string[] };
  type QuizPanel =
    | { stage: "loading" }
    | { stage: "playing" | "submitting"; runId: string; question: QuizQuestionView; selected: number | null; attemptsRemaining: number }
    | { stage: "result"; question: QuizQuestionView; correct: boolean; correctIndex: number; selected: number; explanation: string; rewardCoins: number; rewardReputation: number; warPointsAwarded: number; attemptsRemaining: number };
  type HuntPanel =
    | { stage: "active" | "checking"; runId: string; step: number; totalSteps: number; clue: string; landmark: string; attemptsRemaining: number }
    | { stage: "complete"; rewardCoins: number; rewardReputation: number; warPointsAwarded: number };
  const [quiz, setQuiz] = useState<QuizPanel | null>(null);
  const [hunt, setHunt] = useState<HuntPanel | null>(null);
  const [board, setBoard] = useState<{ season: string; entries: { campus: string; name: string; score: number; totalPoints: number; contributors: number; population: number }[] } | null>(null);
  const knob = useRef<HTMLDivElement>(null);
  const camRef = useRef({ x: SPAWN.x, y: SPAWN.y });
  const orbit = useRef({ yaw: 0, zoom: 1, pitch: DEFAULT_PITCH });
  // Walk views: "fp" is you looking out of your own eyes, "chase" is a close over-the-shoulder view, "orbit" is the old overview camera.
  type ViewMode = "fp" | "chase" | "orbit";
  const viewRef = useRef<ViewMode>("chase");
  const [viewMode, setViewMode] = useState<ViewMode>("chase");
  const lookRef = useRef({ heading: Math.atan2(60 - SPAWN.x, 48 - SPAWN.y), pitch: -0.03 }); // spawn facing up the boulevard toward the Commons
  const walkRef = useRef({ phase: 0, amp: 0 });
  const sprintRef = useRef(false);
  // Tap "Enter" at a door: the avatar walks itself through the doorway (any stick/keyboard input cancels it).
  const autoWalkRef = useRef<{ stage: 0 | 1; out: [number, number]; inn: [number, number]; until: number; stuck: number } | null>(null);
  const doorNearRef = useRef<string | null>(null);
  const [doorNear, setDoorNear] = useState<{ id: string; name: string } | null>(null);
  const [sprintOn, setSprintOn] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [slowConnect, setSlowConnect] = useState(false);
  /** Showcase camera: a short eased reveal (gate -> boulevard -> commons) on the first entry of a session. The live world stays controllable; any camera input cancels it. */
  const intro = useRef<{ t0: number } | null>(null);
  const introChecked = useRef(false);
  const [compassYaw, setCompassYaw] = useState(0);
  const qualityRef = useRef<QualityLevel>("medium");
  const lightingRef = useRef<"day" | "night" | "festival">("day");
  const [lighting, setLighting] = useState<"day" | "night" | "festival">("day");
  const cycleLighting = () => { const o = ["day", "night", "festival"] as const; const n = o[(o.indexOf(lightingRef.current) + 1) % 3]!; lightingRef.current = n; setLighting(n); };
  const autoQuality = useRef(true);
  const diagOn = useRef(false);
  const rttRef = useRef(0);
  const bytesRef = useRef(0);
  const [quality, setQuality] = useState<QualityLevel | "auto">("auto");
  const [diag, setDiag] = useState<{ fps: number; ms: number; drawn: number; culled: number; players: number; rtt: number; bytes: number } | null>(null);
  const canDiag = process.env.NEXT_PUBLIC_DEBUG_PANEL === "1" || process.env.NODE_ENV !== "production";

  const sampler = useRef(new FrameSampler(60_000));
  const [perfMsg, setPerfMsg] = useState("");
  function downloadPerf(rep: unknown, st: { drawn: number; culled: number }) {
    const n = navigator as Navigator & { deviceMemory?: number };
    const doc = { capturedAt: new Date().toISOString(), report: rep, env: { ua: n.userAgent, cores: n.hardwareConcurrency, memoryGb: n.deviceMemory ?? null, dpr: window.devicePixelRatio, viewport: `${innerWidth}x${innerHeight}`,
      renderer: renderModeRef.current, quality: qualityRef.current, zone: zoneName, drawn: st.drawn, culled: st.culled, players: others.current.size + 1, rttMs: rttRef.current } };
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" })); a.download = `campus-perf-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // Applies a quality level; `auto` marks a runtime downgrade so the HUD shows what is running.
  function applyQuality(level: QualityLevel, fromAuto = false, raised = false) {
    qualityRef.current = level;
    if (fromAuto) { setQuality(level); say(raised ? `Quality raised to ${level[0]!.toUpperCase()}${level.slice(1)}` : `Switched to ${level[0]!.toUpperCase()}${level.slice(1)} quality for smoother play`); }
  }
  function cycleRenderer() {
    if (!renderer3dRef.current) return say("3D graphics are unavailable here; CAMPUS is using the lightweight renderer.");
    const next = renderModeRef.current === "3D" ? "2D" : "3D";
    renderModeRef.current = next;
    setRenderMode(next);
    if (stage3d.current) stage3d.current.style.opacity = next === "3D" ? "1" : "0";
    if (stageLabels.current) stageLabels.current.style.opacity = next === "3D" ? "1" : "0";
    say(next === "3D" ? "3D campus view enabled" : "Lightweight 2D view enabled");
  }
  function cycleView() {
    const order: ViewMode[] = ["chase", "fp", "orbit"];
    const next = order[(order.indexOf(viewRef.current) + 1) % order.length]!;
    viewRef.current = next; setViewMode(next); intro.current = null;
    if (next === "orbit") { orbit.current = { yaw: 0, zoom: 1, pitch: DEFAULT_PITCH }; setCompassYaw(0); try { document.exitPointerLock?.(); } catch { /* not locked */ } }
    say(next === "fp" ? "First-person view" : next === "chase" ? "Third-person: see your avatar walk" : "Overview camera");
  }
  function toggleSprint() { sprintRef.current = !sprintRef.current; setSprintOn(sprintRef.current); }
  function cycleQuality() {
    const order: (QualityLevel | "auto")[] = ["auto", "low", "medium", "high"];
    const next = order[(order.indexOf(quality) + 1) % order.length]!;
    setQuality(next);
    autoQuality.current = next === "auto";
    const lvl = next === "auto" ? detectQuality() : next;
    qualityRef.current = lvl;
    try { localStorage.setItem("campus.quality", next); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event("resize"));
  }
  function detectQuality(): QualityLevel {
    const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    return suggestQuality({ cores: n.hardwareConcurrency, ...(n.deviceMemory !== undefined ? { memoryGb: n.deviceMemory } : {}), ...(n.connection?.saveData !== undefined ? { saveData: n.connection.saveData } : {}) });
  }
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("campus.quality"); } catch { /* ignore */ }
    const pick = saved === "low" || saved === "medium" || saved === "high" ? saved : null;
    setQuality(pick ?? "auto");
    autoQuality.current = !pick;
    qualityRef.current = pick ?? detectQuality();
    window.dispatchEvent(new Event("resize"));
    const onKey = (e: KeyboardEvent) => { if (canDiag && e.key === "`") { diagOn.current = !diagOn.current; setDiag(diagOn.current ? { fps: 0, ms: 0, drawn: 0, culled: 0, players: 0, rtt: 0, bytes: 0 } : null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? "" : t)), 2600);
  }, []);

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
  }, []);

  // ---- bootstrap profile ----
  useEffect(() => {
    if (!getToken()) return void router.replace("/start");
    warmServers(); // wake sleeping free-tier services while the profile loads
    api.me().then((r) => setProfile(r.profile)).catch(() => {
      clearToken();
      router.replace("/start");
    });
  }, [router]);

  // ---- websocket lifecycle with reconnect ----
  useEffect(() => {
    if (!profile) return;
    let closed = false;
    let timer: number | undefined;
    let pingTimer: number | undefined;

    const connect = () => {
      const sock = new WebSocket(WS_URL);
      ws.current = sock;
      sock.onopen = () => {
        window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: "ping", ts: Date.now() } satisfies ClientMessage)); }, 5000);
        const token = getToken();
        if (token) sock.send(JSON.stringify({ t: "hello", token, reconnectToken: reconnect.current.token ?? undefined } satisfies ClientMessage));
      };
      sock.onmessage = (ev) => {
        bytesRef.current = typeof ev.data === "string" ? ev.data.length : 0;
        const m = JSON.parse(ev.data) as ServerMessage;
        switch (m.t) {
          case "welcome":
            me.current.id = m.selfId;
            me.current.x = m.x;
            me.current.y = m.y;
            reconnect.current = { token: m.reconnectToken, tries: 0 };
            others.current.clear(); // welcome is a full resync
            ingest(m.players);
            setPhase("live");
            setSlowConnect(false);
            break;
          case "snapshot":
            ingest(m.players); // newly visible players, sent in full once
            for (const d of m.moved) {
              const o = others.current.get(d.id);
              if (!o) continue;
              o.x = d.x; o.y = d.y;
              if (d.emote) o.emote = d.emote; else delete o.emote;
            }
            for (const id of m.gone) others.current.delete(id);
            setPopulation(m.population);
            break;
          case "pong":
            rttRef.current = Math.max(0, Date.now() - m.ts);
            break;
          case "correct":
            me.current.x = m.x;
            me.current.y = m.y;
            break;
          case "interaction":
            if (!m.ok) say(m.reason === "too_far" ? "Get closer" : "Can't do that");
            else if (m.activity === "reaction") void openReaction();
            else if (m.activity === "quiz") void openQuiz();
            else if (m.activity === "jobs") setJobsOpen(true);
            else if (m.activity === "shift") setShiftOpen(true);
            else if (m.activity === "checkin") void api.checkin().then((r) => { say(`Checked in to ${r.event}! +${r.coins} coins`); api.me().then((x) => setProfile(x.profile)).catch(() => {}); }).catch((e) => say((e as Error).message || "Check-in failed"));
            else if (m.activity === "hunt") { if (m.pointId === HUNT_START_POINT_ID) void openHunt(); else void advanceHunt(m.pointId); }
            else say("Welcome to CAMPUS. Explore the Commons, Library, Food Court and Sports Ground.");
            break;
          case "error":
            if (m.code === "unauthorized") {
              clearToken();
              router.replace("/start");
            } else if (m.code === "rate_limited") say("Slow down");
            break;
        }
      };
      sock.onclose = () => {
        window.clearInterval(pingTimer);
        if (closed) return;
        const n = ++reconnect.current.tries;
        if (n > 45) return setPhase("failed"); // free-tier servers can need ~1-2 minutes to wake: keep trying, keep the player walking
        setPhase((p) => (p === "connecting" ? p : "reconnecting"));
        timer = window.setTimeout(connect, Math.min(3000, 400 * n));
      };
    };

    const ingest = (list: PlayerSnapshot[]) => {
      for (const p of list) {
        if (p.id === me.current.id) continue;
        const prev = others.current.get(p.id);
        others.current.set(p.id, { ...p, rx: prev?.rx ?? p.x, ry: prev?.ry ?? p.y });
      }
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(pingTimer);
      ws.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // ---- look: drag the world to turn your head (first-person / chase), or orbit in overview. HUD controls are untouched. ----
  useEffect(() => {
    const ptrs = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const onCanvas = (e: Event) => (e.target as HTMLElement | null)?.tagName === "CANVAS";
    const turn = (dx: number, dy: number, k: number) => {
      const l = lookRef.current;
      l.heading = wrapHeading(l.heading - dx * 0.0062 * k);
      l.pitch = clampLook(l.pitch - dy * 0.0052 * k);
    };
    const down = (e: PointerEvent) => {
      if (!onCanvas(e)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0;
      // Desktop: click the world to capture the mouse for true FPS look (Esc releases it).
      if (e.pointerType === "mouse" && viewRef.current !== "orbit" && !overlayRef.current) { try { void (stage3d.current as HTMLCanvasElement | null)?.requestPointerLock?.(); } catch { /* unsupported */ } }
    };
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      intro.current = null;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (viewRef.current !== "orbit") { if (ptrs.size === 1 && !document.pointerLockElement) turn(dx, dy, 1); }
      else {
        if (ptrs.size === 1) { orbit.current.yaw += dx * 0.008; orbit.current.pitch = clampPitch(orbit.current.pitch + dy * 0.004); setCompassYaw(orbit.current.yaw); }
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) orbit.current.zoom = clampZoom(orbit.current.zoom * (pinch / d));
          pinch = d;
        }
      }
      p.x = e.clientX; p.y = e.clientY;
    };
    const locked = (e: MouseEvent) => { if (document.pointerLockElement && viewRef.current !== "orbit") turn(e.movementX, e.movementY, 0.8); };
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => { if (!onCanvas(e) || viewRef.current !== "orbit") return; intro.current = null; orbit.current.zoom = clampZoom(orbit.current.zoom * (e.deltaY > 0 ? 1.08 : 0.92)); };
    for (const c of [stage3d.current, stageLabels.current]) if (c) c.style.touchAction = "none";
    window.addEventListener("pointerdown", down); window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    window.addEventListener("mousemove", locked);
    window.addEventListener("wheel", wheel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      window.removeEventListener("mousemove", locked);
      window.removeEventListener("wheel", wheel);
      try { document.exitPointerLock?.(); } catch { /* not locked */ }
    };
  }, []);

  // ---- input ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if ((k === "e" || k === "enter") && !overlayRef.current) interact();
      if (k === "v" && !e.repeat && !overlayRef.current) cycleView();
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- render + movement loop ----
  useEffect(() => {
    const canvas = stage.current;
    const canvas3d = stage3d.current;
    const labelsCanvas = stageLabels.current;
    if (!canvas || !canvas3d || !labelsCanvas) return;
    const ctx = canvas.getContext("2d");
    const labelsCtx = labelsCanvas.getContext("2d");
    if (!ctx) return;
    // WebGL is the preferred renderer, but the original vector renderer remains the safety net.
    const onWebglContextLost = (event: Event) => {
      event.preventDefault();
      try { renderer3dRef.current?.destroy(); } catch { /* a lost context may reject cleanup calls */ }
      renderer3dRef.current = null;
      renderer3dFailed.current = true;
      renderModeRef.current = "2D";
      canvas3d.style.opacity = "0";
      labelsCanvas.style.opacity = "0";
      setRenderMode("2D");
      setToast("3D graphics paused; switched to lightweight mode");
    };
    canvas3d.addEventListener("webglcontextlost", onWebglContextLost);
    if (!renderer3dFailed.current) {
      try {
        const r3d = createWorld3DRenderer(canvas3d);
        renderer3dRef.current = r3d;
        // Optional skinned character body (nearest avatars). Never throws: on any failure the built-in box avatar stays (lib/skinned-character.ts).
        void Promise.all([loadSkinnedCharacter(), loadSkinnedCharacter(CHARACTER_LOD_URL)]).then(([model, lod]) => { if (model && renderer3dRef.current === r3d) r3d.setSkinnedCharacter(model, lod); });
        // Optional GLB models, streamed per zone; any failure keeps the built-in shapes (see lib/asset-loader.ts).
        assetStreamerRef.current?.destroy();
        assetStreamerRef.current = ASSET_MANIFEST.assets.length ? createAssetStreamer({
          manifest: ASSET_MANIFEST,
          sink: { add: (e, m) => r3d.registerMesh(e.id, m, e.slot, e), remove: (id) => r3d.unregisterMesh(id) },
          onStatus: (st) => { if (st.state === "failed") console.warn("[assets]", st.id, st.error); },
        }) : null;
        canvas3d.style.opacity = "1";
        renderModeRef.current = "3D";
        setRenderMode("3D");
      } catch (error) {
        renderer3dRef.current = null;
        renderer3dFailed.current = true;
        canvas3d.style.opacity = "0";
        labelsCanvas.style.opacity = "0";
        renderModeRef.current = "2D";
        setRenderMode("2D");
        console.warn("CAMPUS 3D renderer unavailable; using 2D fallback.", error);
      }
    } else {
      canvas3d.style.opacity = "0";
      renderModeRef.current = "2D";
      setRenderMode("2D");
    }
    let raf = 0;
    let last = performance.now();
    let sendAcc = 0;
    let t0 = performance.now();
    let scale = 14;
    let lastZone = "";
    let lastMapPublish = performance.now();
    let frameAt = performance.now();
    let slow = 0;
    const gov = new QualityGovernor(), UP: Record<QualityLevel, QualityLevel> = { low: "medium", medium: "high", high: "high" };
    const acc = { ms: 0, n: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_PROFILES[qualityRef.current].dprCap);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The label layer uses CSS-pixel coordinates because the 3D renderer projects labels in screen space.
      labelsCanvas.width = Math.max(1, Math.round(labelsCanvas.clientWidth));
      labelsCanvas.height = Math.max(1, Math.round(labelsCanvas.clientHeight));
      labelsCtx?.setTransform(1, 0, 0, 1, 0, 0);
      renderer3dRef.current?.resize();
      scale = Math.max(9, Math.min(18, canvas.clientWidth / 34));
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = keys.current;
      const walk = renderModeRef.current === "3D" && viewRef.current !== "orbit";
      let ix: number, iy: number;
      if (walk) { // WASD / stick are relative to where you are looking; arrows, Q and R turn
        ix = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0) + stick.current.x;
        iy = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0) + stick.current.y;
        const turn = (k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("r") ? 1 : 0);
        if (turn) lookRef.current.heading = wrapHeading(lookRef.current.heading + turn * dt * 2.3);
      } else {
        ix = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + stick.current.x;
        iy = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0) + stick.current.y;
      }
      if (!introChecked.current && me.current.id) {
        introChecked.current = true;
        let seen = false;
        try { seen = sessionStorage.getItem("campus.intro") === "1"; sessionStorage.setItem("campus.intro", "1"); } catch { /* storage unavailable: still show once per mount */ }
        const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!seen && !reduce && viewRef.current === "orbit") intro.current = { t0: now };
      }
      if (intro.current) {
        const u = Math.min(1, (now - intro.current.t0) / 5200), e = 1 - Math.pow(1 - u, 3);
        if (k.has("q") || k.has("r")) intro.current = null;
        else { orbit.current.yaw = 0.75 * (1 - e); orbit.current.pitch = 0.5 + (DEFAULT_PITCH - 0.5) * e; orbit.current.zoom = 1.55 - 0.55 * e; setCompassYaw(orbit.current.yaw); if (u >= 1) intro.current = null; }
      }
      if (!walk) {
        if (k.has("q")) orbit.current.yaw -= dt * 1.6;
        if (k.has("r")) orbit.current.yaw += dt * 1.6;
        if (renderModeRef.current === "3D" && orbit.current.yaw) {
          const yc = Math.cos(orbit.current.yaw), ys = Math.sin(orbit.current.yaw);
          const rx = ix * yc + iy * ys, ry = -ix * ys + iy * yc;
          ix = rx; iy = ry;
        }
      }
      const mag = Math.hypot(ix, iy);
      // You can walk the moment the page loads: the server link may still be waking (free hosting), and it catches up when it connects.
      const canWalk = phaseRef.current !== "failed" && !overlayRef.current;
      const online = phaseRef.current === "live" && !overlayRef.current;
      let autoDir: [number, number] | null = null;
      {
        const aw = autoWalkRef.current;
        if (aw) {
          if (mag > 0.05 || now > aw.until || !canWalk) autoWalkRef.current = null; // any manual input cancels the auto-walk
          else {
            const tgt = aw.stage === 0 ? aw.out : aw.inn;
            const ddx = tgt[0] - me.current.x, ddy = tgt[1] - me.current.y, dist = Math.hypot(ddx, ddy);
            if (dist < 0.35) { if (aw.stage === 0) aw.stage = 1; else autoWalkRef.current = null; }
            else autoDir = [ddx / dist, ddy / dist];
          }
        }
      }
      let speedNow = 0;
      if (canWalk && (mag > 0.05 || autoDir)) {
        const sprint = k.has("shift") || sprintRef.current;
        const sp = WORLD.maxSpeed * (sprint ? 1.22 : 0.88) * (autoDir ? 1 : Math.min(1, mag)); // sprint stays under the server's speed tolerance (1.35x)
        let dx = autoDir ? autoDir[0] : ix / mag, dy = autoDir ? autoDir[1] : iy / mag;
        if (autoDir) { const want = Math.atan2(dx, dy), dh = wrapHeading(want - lookRef.current.heading); lookRef.current.heading = wrapHeading(lookRef.current.heading + dh * Math.min(1, dt * 6)); }
        if (walk && !autoDir) {
          const h = lookRef.current.heading, [fx, fz] = headingForward(h), [rx, rz] = headingRight(h), fw = -iy / mag, st = ix / mag;
          dx = fx * fw + rx * st; dy = fz * fw + rz * st;
        }
        const m = slideMove(me.current.x, me.current.y, me.current.x + dx * sp * dt, me.current.y + dy * sp * dt);
        speedNow = Math.hypot(m.x - me.current.x, m.y - me.current.y) / Math.max(dt, 1e-3);
        me.current.x = m.x;
        me.current.y = m.y;
      }
      { const aw = autoWalkRef.current; if (aw) { aw.stuck = speedNow < 0.3 ? aw.stuck + dt : 0; if (aw.stuck > 1.2) autoWalkRef.current = null; } } // blocked by something: give up instead of pushing forever
      { const w = walkRef.current; w.amp += (Math.min(1, speedNow / 5) - w.amp) * Math.min(1, dt * 9); if (speedNow > 0.3) w.phase += dt * (7.5 + speedNow * 0.7); }
      if (document.pointerLockElement && overlayRef.current) { try { document.exitPointerLock(); } catch { /* ignore */ } }
      sendAcc += dt;
      if (sendAcc >= 0.05 && online) {
        sendAcc = 0;
        send({ t: "input", seq: ++me.current.seq, x: me.current.x, y: me.current.y });
      }
      for (const o of others.current.values()) {
        o.rx += (o.x - o.rx) * Math.min(1, dt * 10);
        o.ry += (o.y - o.ry) * Math.min(1, dt * 10);
      }

      // zone + proximity HUD state
      const z = buildingAt(me.current.x, me.current.y)?.name ?? zoneAt(me.current.x, me.current.y)?.name ?? "Campus Paths";
      if (z !== lastZone) { lastZone = z; setZoneName(z); }
      if (now - lastMapPublish >= 90) { // minimap marker + view cone move on the DOM directly: no React re-render while walking
        lastMapPublish = now;
        const mx = me.current.x, my = me.current.y, hd = lookRef.current.heading, fov = viewRef.current === "orbit" ? 0 : 0.62;
        for (const c of [mapDot.current, mapRing.current]) if (c) { c.setAttribute("cx", mx.toFixed(2)); c.setAttribute("cy", my.toFixed(2)); }
        const cone = mapCone.current;
        if (cone) cone.setAttribute("points", fov ? `${mx.toFixed(2)},${my.toFixed(2)} ${(mx + Math.sin(hd - fov) * 11).toFixed(2)},${(my + Math.cos(hd - fov) * 11).toFixed(2)} ${(mx + Math.sin(hd + fov) * 11).toFixed(2)},${(my + Math.cos(hd + fov) * 11).toFixed(2)}` : "");
      }
      let nearest: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const p of INTERACTION_POINTS) {
        if (p.hidden && p.id !== huntTargetRef.current) continue;
        const distance = Math.hypot(p.x - me.current.x, p.y - me.current.y);
        if (distance <= WORLD.interactRange && distance < nearestDistance) { nearest = p.id; nearestDistance = distance; }
      }
      { const mx = me.current.x, my = me.current.y; const sp: Sport | null = my >= 62 && my <= 78 && mx >= 80 && mx <= 100 ? "football" : my >= 62 && my <= 78 && mx >= 102 && mx <= 116 ? "basketball" : null; if (sp !== sportSpotRef.current) { sportSpotRef.current = sp; setSportSpot(sp); } }
      { const mx = me.current.x, my = me.current.y; const mp: Mini | null = mx >= 78 && mx <= 116 && my >= 4 && my <= 36 ? "rhythm" : mx >= 78 && mx <= 100 && my >= 40 && my <= 58 ? "delivery" : null; if (mp !== miniSpotRef.current) { miniSpotRef.current = mp; setMiniSpot(mp); } }
      if (nearest !== nearRef.current) { nearRef.current = nearest; setNear(nearest); }
      { // the closest door in front of you (south of its wall, within 9 m) while you are outside: offers the Enter button
        let best: (typeof BUILDINGS)[number] | null = null, bd = 9;
        if (!buildingAt(me.current.x, me.current.y)) for (const b of BUILDINGS) {
          if (!b.door || me.current.y < b.y + b.h - 0.2) continue;
          const d = Math.hypot(b.door.x + b.door.w / 2 - me.current.x, b.y + b.h - me.current.y);
          if (d < bd) { bd = d; best = b; }
        }
        const key = best ? best.id : null;
        if (key !== doorNearRef.current) { doorNearRef.current = key; setDoorNear(best ? { id: best.id, name: best.name } : null); }
      }
      const sitNow = canSit(me.current.x, me.current.y);
      if (sitNow !== sitOkRef.current) { sitOkRef.current = sitNow; setSitOk(sitNow); }

      const st = drawFrame(ctx, labelsCtx, canvas.clientWidth, canvas.clientHeight, scale, (now - t0) / 1000);
      // frame-time sampling: feeds diagnostics and auto-downgrades quality when frames run long (sustained ~3s)
      const ft = now - frameAt; frameAt = now;
      if (sampler.current.recording) {
        const rep = sampler.current.push(ft, now);
        if (rep) { downloadPerf(rep, st); setPerfMsg(`Saved: ${rep.fpsAvg} fps avg, p95 ${rep.p95Ms} ms`); } else if (acc.n % 30 === 0) setPerfMsg(`REC ${Math.round(sampler.current.elapsed(now) / 1000)}s`);
      }
      acc.ms += ft; acc.n++;
      if (acc.ms >= 1000) {
        const fps = Math.round((acc.n * 1000) / acc.ms);
        if (diagOn.current) setDiag({ fps, ms: +(acc.ms / acc.n).toFixed(1), drawn: st.drawn, culled: st.culled, players: others.current.size + 1, rtt: rttRef.current, bytes: bytesRef.current });
        const budget = 1000 / (QUALITY_PROFILES[qualityRef.current].targetFps * 0.8);
        slow = acc.ms / acc.n > budget ? slow + 1 : 0;
        if (slow >= 3 && autoQuality.current && qualityRef.current !== "low") { slow = 0; gov.noteDowngrade(now); applyQuality(DOWNGRADE[qualityRef.current], true); resize(); }
        else if (autoQuality.current && qualityRef.current !== "high" && !sampler.current.recording) {
          const nxt = UP[qualityRef.current];
          if (gov.observe(acc.ms / acc.n, 1000 / (QUALITY_PROFILES[nxt].targetFps * 0.8), now)) { applyQuality(nxt, true, true); resize(); }
        }
        acc.ms = 0; acc.n = 0;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas3d.removeEventListener("webglcontextlost", onWebglContextLost);
      assetStreamerRef.current?.destroy(); assetStreamerRef.current = null;
      renderer3dRef.current?.destroy();
      renderer3dRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refs mirroring state for the render loop
  const phaseRef = useRef<Phase>("connecting");
  const [sport, setSport] = useState<Sport | null>(null);
  const [sportSpot, setSportSpot] = useState<Sport | null>(null);
  const sportSpotRef = useRef<Sport | null>(null);
  const [mini, setMini] = useState<Mini | null>(null);
  const [miniSpot, setMiniSpot] = useState<Mini | null>(null);
  const miniSpotRef = useRef<Mini | null>(null);
  const overlayRef = useRef(false);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    if (phase === "live") return setSlowConnect(false);
    const t = window.setTimeout(() => setSlowConnect(true), 5000);
    return () => window.clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    huntRef.current = hunt;
    huntTargetRef.current = hunt && hunt.stage !== "complete" ? HUNT_STOPS[hunt.step]?.pointId ?? null : null;
    overlayRef.current = !!sport || !!mini || !!reaction || !!quiz || !!board || jobsOpen || shiftOpen || hunt?.stage === "complete" || phoneOpen || (phase === "live" && !gateDone);
  }, [sport, mini, reaction, quiz, board, hunt, jobsOpen, shiftOpen, phoneOpen, phase, gateDone]);

  function myEmoteNow(now: number, x: number, y: number): boolean {
    const e = myEmote.current;
    if (!e) return false;
    if (now > e.until || (e.k === "sit" && Math.hypot(x - e.x, y - e.y) > 0.35)) { myEmote.current = null; return false; }
    return true;
  }

  function drawFrame(ctx: CanvasRenderingContext2D, labelsCtx: CanvasRenderingContext2D | null, w: number, h: number, scale: number, time: number) {
    const now = Date.now();
    const q = QUALITY_PROFILES[qualityRef.current];
    const entities: Entity[] = [];
    for (const o of others.current.values()) entities.push({ id: o.id, name: o.name, x: o.rx, y: o.ry, avatar: o.avatar, tagColor: CAMPUSES[o.campus].color, ...(o.emote ? { emote: o.emote } : {}) });
    for (const n of AMBIENT_NPCS) {
      const p = npcAt(n, now);
      if (Math.hypot(p.x - me.current.x, p.y - me.current.y) > 70) continue; // large world: skip far ambient NPCs
      entities.push({ id: n.id, name: n.name, x: p.x, y: p.y, npc: true, tagColor: "#5b6b94", avatar: { ...DEFAULT_AVATAR, skin: n.skin, outfit: n.outfit } });
    }
    { // Main Gate officers (client-side scenery, flagged as NPCs). The first one walks out to check your pass.
      const uni = { ...DEFAULT_AVATAR, skin: "#5e3b26", outfit: "#1f3a6e", hair: "cap" } as unknown as typeof DEFAULT_AVATAR, g = gateRef.current;
      entities.push({ id: "gate_officer_1", name: "Gate Officer", x: g.gx, y: g.gy, npc: true, tagColor: "#1f3a6e", avatar: uni });
      entities.push({ id: "gate_officer_2", name: "Gate Officer", x: 65.2, y: 72.6, npc: true, tagColor: "#1f3a6e", avatar: { ...uni, skin: "#8a5a3b" } });
    }
    if (profile) entities.push({ id: me.current.id || "me", name: profile.displayName, x: me.current.x, y: me.current.y, avatar: profile.avatar, tagColor: CAMPUSES[profile.campus].color, ...(myEmoteNow(now, me.current.x, me.current.y) ? { emote: myEmote.current!.k } : {}) });
    // camera eases toward the player (smooth follow)
    const cam = camRef.current;
    const vo = viewOverride.current; // dev-only visual camera override (?view=x,y); never affects the server-side position
    const walkView = renderModeRef.current === "3D" && viewRef.current !== "orbit" && !vo;
    if (walkView) { cam.x = me.current.x; cam.y = me.current.y; } // walking views are locked to the avatar: zero camera lag
    else {
      cam.x += ((vo ? vo.x : me.current.x) - cam.x) * 0.18;
      cam.y += ((vo ? vo.y : me.current.y) - cam.y) * 0.18;
    }
    const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const camBob = viewRef.current === "fp" && !reducedMotion ? Math.sin(walkRef.current.phase) * 0.042 * walkRef.current.amp : 0;
    const renderInput = { w, h, scale, time, camX: cam.x, camY: cam.y, meId: me.current.id || "me", entities, emoji: EMOTES, quality: q, activeHuntPointId: huntTargetRef.current };
    if (renderer3dRef.current && renderModeRef.current === "3D") {
      try {
        {
          const px = me.current.x, py = me.current.y;
          // Zones within ~30 units are visible from here: stream them ahead of arrival so buildings never pop in.
          const near = ZONES.filter((z) => Math.max(z.x - px, 0, px - (z.x + z.w)) ** 2 + Math.max(z.y - py, 0, py - (z.y + z.h)) ** 2 < 900).map((z) => z.id);
          assetStreamerRef.current?.setZone(zoneAt(px, py)?.id, near);
        }
        const stats = renderer3dRef.current.render({
          width: w, height: h, time, camX: cam.x, camY: cam.y, camMode: walkView ? viewRef.current : "orbit", camHeading: lookRef.current.heading, camLook: lookRef.current.pitch, camBob, camYaw: orbit.current.yaw, camPitch: orbit.current.pitch, zoom: orbit.current.zoom,
          meId: me.current.id || "me", entities, quality: qualityRef.current, lighting: lightingRef.current,
          activeHuntPointId: huntTargetRef.current, gateOpen: gateRef.current.open,
        }, labelsCtx);
        return { drawn: stats.drawn, culled: stats.culled };
      } catch (error) {
        console.warn("CAMPUS 3D frame failed; switching to 2D fallback.", error);
        renderer3dRef.current.destroy();
        renderer3dRef.current = null;
        renderer3dFailed.current = true;
        if (stage3d.current) stage3d.current.style.opacity = "0";
        if (stageLabels.current) stageLabels.current.style.opacity = "0";
        renderModeRef.current = "2D";
        setRenderMode("2D");
      }
    }
    return drawWorld(ctx, renderInput);
  }

  // ---- actions ----
  function enterDoor(id: string) {
    const b = BUILDINGS.find((x) => x.id === id);
    if (!b || !b.door) return;
    const cx = b.door.x + b.door.w / 2, by = b.y + b.h;
    keys.current.clear();
    autoWalkRef.current = { stage: 0, out: [cx, by + 1.0], inn: [cx, by - WALL - 1.5], until: performance.now() + 9000, stuck: 0 };
  }

  function interact() {
    const id = nearRef.current;
    if (!id) return say("Walk up to a glowing marker");
    send({ t: "interact", pointId: id });
  }

  async function openReaction() {
    setReaction({ stage: "starting" });
    const attempt = async (): Promise<Awaited<ReturnType<typeof api.startReaction>>> => {
      try {
        return await api.startReaction();
      } catch (e) {
        // The proximity attestation travels realtime -> API; allow it a moment to land.
        if ((e as { code?: string }).code === "not_in_range") {
          await new Promise((r) => setTimeout(r, 400));
          return api.startReaction();
        }
        throw e;
      }
    };
    try {
      const run = await attempt();
      setReaction({ stage: "wait", runId: run.runId });
      window.setTimeout(() => setReaction((r) => (r && r.runId === run.runId && r.stage === "wait" ? { ...r, stage: "go" } : r)), run.delayMs);
    } catch (e) {
      setReaction(null);
      const code = (e as { code?: string }).code;
      say(code === "cooldown" ? "Catch your breath for a few seconds" : "Couldn't start. Try again.");
    }
  }

  async function openQuiz() {
    setQuiz({ stage: "loading" });
    const attempt = async (): Promise<Awaited<ReturnType<typeof api.startQuiz>>> => {
      try { return await api.startQuiz(); }
      catch (e) {
        // Realtime forwards the proximity attestation just before the response; retry once if it is still arriving.
        if ((e as { code?: string }).code === "not_in_range") {
          await new Promise((r) => setTimeout(r, 400));
          return api.startQuiz();
        }
        throw e;
      }
    };
    try {
      const r = await attempt();
      setQuiz({ stage: "playing", runId: r.runId, question: r.question, selected: null, attemptsRemaining: r.attemptsRemaining });
    } catch (e) {
      setQuiz(null);
      const err = e as { code?: string; message?: string };
      say(err.code === "daily_limit" ? "You have used today's five quiz attempts" : err.code === "quiz_in_progress" ? "Finish the question already open" : "Walk close to the glowing Quiz board and try again");
    }
  }

  async function submitQuiz() {
    if (!quiz || quiz.stage !== "playing" || quiz.selected === null) return;
    const active = quiz; const sel: number = quiz.selected;
    setQuiz({ ...active, stage: "submitting" });
    try {
      const r = await api.completeQuiz(active.runId, sel);
      setProfile(r.profile);
      setQuiz({ stage: "result", question: active.question, correct: r.correct, correctIndex: r.correctIndex, selected: sel, explanation: r.explanation, rewardCoins: r.rewardCoins, rewardReputation: r.rewardReputation, warPointsAwarded: r.warPointsAwarded, attemptsRemaining: r.attemptsRemaining });
    } catch (e) {
      const err = e as { code?: string; status?: number; message?: string };
      if (err.code === "answer_too_fast") {
        setQuiz(active);
        say("Take a moment to read the question first");
      } else if (err.code === "run_expired" || err.code === "run_not_found" || err.code === "run_already_completed" || err.code === "daily_limit") {
        setQuiz(null);
        say(err.code === "daily_limit" ? "You have used today's five quiz attempts" : "That question is no longer active. Return to the Quiz board.");
      } else {
        // Reuse a deterministic idempotency key for this run so a network retry cannot double-pay.
        setQuiz(active);
        say("Connection hiccup. Submit again; the server safely deduplicates this run.");
      }
    }
  }

  async function openHunt() {
    const attempt = async () => {
      try { return await api.startHunt(); }
      catch (e) {
        if ((e as { code?: string }).code === "not_in_range") {
          await new Promise((r) => setTimeout(r, 400));
          return api.startHunt();
        }
        throw e;
      }
    };
    try {
      const r = await attempt();
      const panel: HuntPanel = { stage: "active", runId: r.runId, step: r.step, totalSteps: r.totalSteps, clue: r.clue, landmark: r.landmark, attemptsRemaining: r.attemptsRemaining };
      huntRef.current = panel;
      setHunt(panel);
      say(r.step > 0 ? `Hunt resumed · ${r.step}/${r.totalSteps} clues found` : "Scavenger Hunt started. Follow the clue card!");
    } catch (e) {
      const err = e as { code?: string };
      say(err.code === "daily_limit" ? "You have used today's three hunt attempts" : "Walk close to the Scavenger Hunt board in Student Commons");
    }
  }

  async function advanceHunt(pointId: string) {
    const active = huntRef.current;
    if (!active || active.stage === "complete") return say("Start a Scavenger Hunt at the Commons board first");
    if (huntBusyRef.current || active.stage === "checking") return;
    huntBusyRef.current = true;
    const checking: HuntPanel = { ...active, stage: "checking" };
    huntRef.current = checking;
    setHunt(checking);
    try {
      const r = await api.checkpointHunt(active.runId, pointId);
      if (r.complete) {
        if (r.profile) setProfile(r.profile);
        const complete: HuntPanel = { stage: "complete", rewardCoins: r.rewardCoins ?? 0, rewardReputation: r.rewardReputation ?? 0, warPointsAwarded: r.warPointsAwarded ?? 0 };
        huntRef.current = complete;
        setHunt(complete);
      } else {
        const next: HuntPanel = { stage: "active", runId: active.runId, step: r.step, totalSteps: r.totalSteps, clue: r.clue ?? "Follow the next clue.", landmark: r.landmark ?? "Campus", attemptsRemaining: r.attemptsRemaining };
        huntRef.current = next;
        setHunt(next);
        say(`Checkpoint found! Next: ${next.landmark}`);
      }
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "run_expired" || err.code === "run_not_found" || err.code === "daily_limit") {
        huntRef.current = null;
        setHunt(null);
        say("That hunt is no longer active. Return to the Hunt board to start again.");
      } else {
        const retry: HuntPanel = { ...active, stage: "active" };
        huntRef.current = retry;
        setHunt(retry);
        say(err.code === "wrong_checkpoint" ? "That spot isn't next. Follow your current clue." : err.code === "not_in_range" ? "Get a little closer to the clue location." : "Connection hiccup. Interact with the same clue again to retry safely.");
      }
    } finally {
      huntBusyRef.current = false;
    }
  }

  async function tapPad() {
    if (!reaction?.runId) return;
    if (reaction.stage !== "wait" && reaction.stage !== "go") return;
    const early = reaction.stage === "wait";
    const runId = reaction.runId;
    setReaction({ stage: "done", runId, msg: "…" });
    try {
      const r = await api.completeReaction(runId);
      setProfile(r.profile);
      setReaction({
        stage: "done",
        runId,
        msg: early || r.tooEarly ? "Too early! No reward." : `${Math.round(r.reactionMs)} ms  ·  +${r.rewardCoins} coins  ·  +${r.rewardReputation} rep`,
      });
    } catch {
      setReaction({ stage: "done", runId, msg: "Run expired or already scored." });
    }
  }

  async function openBoard() {
    try {
      const r = await api.campusWars();
      setBoard({ season: r.season.name, entries: r.entries });
    } catch {
      say("Campus Wars standings unavailable");
    }
  }

  // ---- joystick ----
  const onStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerup" || e.type === "pointercancel") {
      stick.current = { x: 0, y: 0 };
      if (knob.current) knob.current.style.transform = "translate(0,0)";
      return;
    }
    if (e.buttons === 0 && e.type === "pointermove") return;
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 10;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    stick.current = { x: dx / max, y: dy / max };
    if (knob.current) knob.current.style.transform = `translate(${dx}px,${dy}px)`;
  };

  return (
    <div className="world">
      <canvas ref={stage} className="stage stage-fallback" aria-label="Campus world" />
      <canvas ref={stage3d} className="stage stage-webgl" aria-hidden="true" />
      <canvas ref={stageLabels} className="stage stage-labels" aria-hidden="true" />

      <aside className="campus-minimap" aria-label={`Campus map. You are at ${zoneName}.`}>
        <div className="minimap-head"><span>YOUR CAMPUS</span><b>{zoneName}</b></div>
        <svg viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} role="img" aria-label="Map of campus zones and activity boards">
          <rect width={WORLD.width} height={WORLD.height} rx="4" fill="#0c1730" />
          <path d="M60 4 V78 M4 38 H116" stroke="#a6c7c1" strokeWidth="2.3" strokeLinecap="round" opacity=".65" />
          {ZONES.map((zone) => <g key={zone.id}>
            <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="1.8" fill={zone.color} opacity=".62" stroke="#e5f0ff" strokeWidth=".7" strokeOpacity=".65" />
            <text x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 1.4} fontSize="3.1" textAnchor="middle" fontWeight="700" fill="#fff" stroke="#172443" strokeWidth=".5" paintOrder="stroke">{zone.id === "student_commons" ? "COMMONS" : zone.id === "academic_block" ? "ACADEMIC" : zone.id === "hostel_street" ? "HOSTELS" : zone.id === "food_court" ? "FOOD" : zone.id === "sports_ground" ? "SPORTS" : zone.id === "creator_hub" ? "CREATOR" : zone.id === "event_arena" ? "ARENA" : zone.id === "main_gate" ? "GATE" : "LIBRARY"}</text>
          </g>)}
          {INTERACTION_POINTS.filter((point) => !point.hidden).map((point) => point.id.startsWith("rp_") ? <circle key={point.id} cx={point.x} cy={point.y} r="1" fill={point.activity === "quiz" ? "#53d6d1" : "#ffd166"} opacity=".85" /> : <g key={point.id}><circle cx={point.x} cy={point.y} r="2.1" fill={point.activity === "quiz" ? "#53d6d1" : point.activity === "reaction" ? "#ffd166" : point.activity === "hunt" ? "#65c7ff" : "#fff"} stroke="#0c1730" strokeWidth=".8" /><text x={point.x + 2.2} y={point.y + .9} fontSize="3.2" fill="#fff" stroke="#0c1730" strokeWidth=".5" paintOrder="stroke">{point.activity === "quiz" ? "Q" : point.activity === "reaction" ? "!" : point.activity === "hunt" ? "H" : "i"}</text></g>)}
          <polygon ref={mapCone} points="" fill="#7fb2ff" opacity=".38" />
          <circle ref={mapDot} cx={SPAWN.x} cy={SPAWN.y} r="2.7" fill="#fff" stroke="#2f6bff" strokeWidth="1.5" />
          <circle ref={mapRing} cx={SPAWN.x} cy={SPAWN.y} r="5" fill="none" stroke="#fff" strokeWidth=".65" opacity=".75" />
        </svg>
        <div className="minimap-legend"><span><i className="you-dot" /> YOU</span><span><i className="quiz-dot" /> QUIZ</span><span><i className="reaction-dot" /> REACTION</span><span><i className="hunt-dot" /> HUNT</span></div>
      </aside>

      {mini && <MiniGame kind={mini} onExit={() => setMini(null)} />}
      {sport && <SportsGame sport={sport} onExit={() => setSport(null)} />}
      <div className="hud-top">
        <div className="hud-group hud-main">
          <div className="pill campus-name">{profile ? CAMPUSES[profile.campus].name : "…"}</div>
          <div className="pill" aria-live="polite"><HudIcon n="coin" /> {profile?.coins ?? 0}</div>
          <div className="pill"><HudIcon n="star" /> {profile?.reputation ?? 0}</div>
          <div className="pill lvl">Lv {levelFor(profile?.reputation ?? 0).level}<span className="lvl-title"> · {levelFor(profile?.reputation ?? 0).title}</span></div>
          <button className="pill hud-more" onClick={() => setHudOpen((o) => !o)} aria-expanded={hudOpen} aria-label="More controls">{hudOpen ? "✕" : "☰"}</button>
        </div>
        <div className={`hud-group hud-secondary${hudOpen ? " open" : ""}`}>
          <button className="pill" onClick={() => setTasksOpen((o) => !o)} aria-pressed={tasksOpen}><HudIcon n="tasks" /> Tasks</button>
          <button className="pill" onClick={cycleView} aria-label="Change camera view (V)"><HudIcon n="cube" /> {viewMode === "fp" ? "First-person" : viewMode === "chase" ? "Third-person" : "Overview"}</button>
          <button className="pill" onClick={cycleRenderer} aria-label="Switch between 3D and lightweight 2D campus graphics"><HudIcon n="cube" /> {renderMode}</button>
          <button className="pill" onClick={cycleQuality} aria-label="Graphics quality"><HudIcon n="gauge" /> {quality === "auto" ? "Auto" : quality}</button>
          {viewMode === "orbit" && <button className="pill" onClick={() => { orbit.current = { yaw: 0, zoom: 1, pitch: DEFAULT_PITCH }; setCompassYaw(0); }} aria-label="Reset camera (compass)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${compassYaw}rad)`, transition: "transform .1s" }}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg> Reset</button>}
          <button className="pill" onClick={cycleLighting} aria-label="Time of day"><HudIcon n={lighting === "day" ? "sun" : lighting === "night" ? "moon" : "festival"} /> {lighting === "day" ? "Day" : lighting === "night" ? "Night" : "Festival"}</button>
          <button className="pill" onClick={openBoard}><HudIcon n="trophy" /> Campus Wars</button>
          <div className="pill"><small>online</small> {population}</div>
        </div>
      </div>
      {tasksOpen && <TasksPanel refreshKey={taskTick} onClose={() => setTasksOpen(false)} />}
      <div className="pill zone-tag">{zoneName}</div>
      {diag && <div className="diag" role="status">{diag.fps} fps · {diag.ms} ms · drawn {diag.drawn} · culled {diag.culled} · players {diag.players} · rtt {diag.rtt} ms · snap {diag.bytes} B · {qualityRef.current}</div>}
      {diag && canDiag && <button className="diag-btn" onClick={() => { if (sampler.current.recording) { sampler.current.stop(); setPerfMsg("Stopped"); } else { sampler.current.start(performance.now()); setPerfMsg("REC 0s"); } }}>{sampler.current.recording ? "■ Stop" : "● Record 60s route"} {perfMsg}</button>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {viewMode === "fp" && renderMode === "3D" && <div className="reticle" aria-hidden="true" />}
      <div className="hud-bottom">
        <div className="left-controls">
          <button className={`emote sprint${sprintOn ? " on" : ""}`} aria-label="Sprint (hold Shift)" aria-pressed={sprintOn} onClick={toggleSprint}>⚡</button>
          <div className="stick" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onStick(e); }}
            onPointerMove={onStick} onPointerUp={onStick} onPointerCancel={onStick} aria-label="Move">
            <div className="knob" ref={knob} />
          </div>
        </div>
        <div className="actions">
          <div className="emotes">
            {(Object.keys(EMOTES) as EmoteKey[]).map((k) => (
              <button key={k} className="emote" aria-label={k} onClick={() => doEmote(k)}>{EMOTES[k]}</button>
            ))}
            {sitOk && <button className="emote" aria-label="Sit" onClick={() => doEmote("sit")}>🪑</button>}
          </div>
          {sportSpot && !near && <button className="btn big accent" onClick={() => { keys.current.clear(); setSport(sportSpot); }}>🏀⚽ Play {sportSpot === "football" ? "Football" : "Basketball"}</button>}
          {miniSpot && !sportSpot && !near && <button className="btn big accent" onClick={() => { keys.current.clear(); setMini(miniSpot); }}>{miniSpot === "rhythm" ? "🎵 Play Beat Stage" : "🛵 Play Delivery Dash"}</button>}
          {doorNear && !near && !sportSpot && !miniSpot && <button className="btn big accent" onClick={() => enterDoor(doorNear.id)}>🚪 Enter {doorNear.name}</button>}
          {near && <button className="btn big accent" onClick={interact}>
            {near ? near === HUNT_START_POINT_ID ? (hunt && hunt.stage !== "complete" ? "Resume Scavenger Hunt" : "Start Scavenger Hunt") : INTERACTION_POINTS.find((p) => p.id === near)?.hidden ? "Search clue spot" : INTERACTION_POINTS.find((p) => p.id === near)?.name : "Explore"}
          </button>}
        </div>
      </div>

      {profile && phase === "live" && !gateDone && <GateCheck profile={profile} player={me} gate={gateRef} onDone={finishGate} />}
      {profile && gateDone && <PocketPhone profile={profile} onOpenChange={setPhoneOpen} />}

      <PlayNav />

      {(phase === "connecting" || phase === "reconnecting") && (
        <div className="conn-chip" role="status">
          <i className="conn-dot" />{phase === "connecting" ? "Connecting to campus…" : "Reconnecting…"}
          {slowConnect && <small>Waking the campus server, it can take a minute. Keep exploring.</small>}
        </div>
      )}
      {phase === "failed" && (
        <div className="conn">
          <div className="card sheet">
            <h3>Can't reach campus</h3>
            <button className="btn" onClick={() => location.reload()}>Try again</button>
          </div>
        </div>
      )}

      {hunt && hunt.stage !== "complete" && (
        <aside className="hunt-tracker" aria-live="polite" aria-label="Scavenger hunt progress">
          <div className="hunt-tracker-top"><span><HudIcon n="compass" /> CAMPUS SCAVENGER HUNT</span><b>{hunt.step}/{hunt.totalSteps} found</b></div>
          <div className="hunt-progress"><span style={{ width: `${(hunt.step / hunt.totalSteps) * 100}%` }} /></div>
          <p className="hunt-landmark">Next stop: {hunt.landmark}</p>
          <p className="hunt-clue">{hunt.stage === "checking" ? "Checking the checkpoint…" : hunt.clue}</p>
          <small>{hunt.attemptsRemaining} hunt attempts left today · 10-minute route</small>
        </aside>
      )}

      {hunt?.stage === "complete" && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Scavenger hunt completed">
          <div className="card sheet hunt-result">
            <div className="quiz-result-icon correct">✓</div>
            <span className="quiz-badge"><HudIcon n="compass" /> SCAVENGER HUNT</span>
            <h3>You explored the whole route!</h3>
            <p className="muted">All three checkpoints found. Your campus adventure paid off.</p>
            <div className="quiz-rewards"><span><HudIcon n="coin" /> +{hunt.rewardCoins}</span><span><HudIcon n="star" /> +{hunt.rewardReputation} rep</span><span><HudIcon n="trophy" /> +{hunt.warPointsAwarded} Wars pts</span></div>
            <button className="btn accent" onClick={() => { huntRef.current = null; setHunt(null); }}>Back to campus</button>
          </div>
        </div>
      )}

      {quiz && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Campus Quiz">
          <div className="card sheet quiz-sheet">
            <div className="quiz-topline"><span className="quiz-badge"><HudIcon n="brain" /> CAMPUS QUIZ</span><button className="btn ghost quiz-close" disabled={quiz.stage === "submitting"} onClick={() => setQuiz(null)} aria-label="Close quiz">✕</button></div>
            {quiz.stage === "loading" && <><h3>Getting your question…</h3><p className="muted">Checking your place at the Commons board.</p></>}
            {(quiz.stage === "playing" || quiz.stage === "submitting") && (
              <>
                <div className="quiz-meta"><span>{quiz.question.category}</span><span>{quiz.attemptsRemaining} attempts left today</span></div>
                <h3 className="quiz-question">{quiz.question.prompt}</h3>
                <div className="quiz-choices">
                  {quiz.question.choices.map((choice, index) => (
                    <button key={`${quiz.question.id}-${index}`} className={`quiz-choice ${quiz.selected === index ? "selected" : ""}`} aria-pressed={quiz.selected === index} disabled={quiz.stage === "submitting"} onClick={() => setQuiz({ ...quiz, selected: index })}>
                      <span>{String.fromCharCode(65 + index)}</span>{choice}
                    </button>
                  ))}
                </div>
                <button className="btn accent" disabled={quiz.selected === null || quiz.stage === "submitting"} onClick={() => void submitQuiz()}>{quiz.stage === "submitting" ? "Checking answer…" : "Submit answer"}</button>
                <p className="muted small">One answer per question. Rewards and scoring are verified by the server.</p>
              </>
            )}
            {quiz.stage === "result" && (
              <>
                <div className={`quiz-result-icon ${quiz.correct ? "correct" : "incorrect"}`}>{quiz.correct ? "✓" : "↻"}</div>
                <h3>{quiz.correct ? "Correct. Nice work!" : "Not quite this time."}</h3>
                <div className={`quiz-answer-note ${quiz.correct ? "right" : "wrong"}`}><b>Correct answer: {quiz.question.choices[quiz.correctIndex]}</b><p className="muted">{quiz.explanation}</p></div>
                <div className="quiz-rewards"><span><HudIcon n="coin" /> +{quiz.rewardCoins}</span><span><HudIcon n="star" /> +{quiz.rewardReputation} rep</span><span><HudIcon n="trophy" /> +{quiz.warPointsAwarded} Wars pts</span></div>
                <p className="muted small">{quiz.attemptsRemaining} quiz attempts remaining today.</p>
                <button className="btn accent" onClick={() => setQuiz(null)}>Back to campus</button>
              </>
            )}
          </div>
        </div>
      )}

      {jobsOpen && <JobsSheet onClose={() => setJobsOpen(false)} />}
      {shiftOpen && <ShiftSheet onClose={() => { setShiftOpen(false); setTaskTick((n) => n + 1); api.me().then((r) => setProfile(r.profile)).catch(() => {}); }} />}

      {reaction && (
        <div className="overlay">
          <div className="card sheet">
            <h3>Reaction Challenge</h3>
            {(reaction.stage === "starting" || reaction.stage === "wait" || reaction.stage === "go") && (
              <button className={`react-pad ${reaction.stage === "go" ? "go" : "wait"}`} onPointerDown={tapPad}>
                {reaction.stage === "starting" ? "Get ready…" : reaction.stage === "wait" ? "Wait for green…" : "TAP NOW"}
              </button>
            )}
            {reaction.stage === "done" && (
              <>
                <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{reaction.msg}</p>
                <button className="btn" onClick={() => setReaction(null)}>Back to campus</button>
              </>
            )}
          </div>
        </div>
      )}

      {board && (
        <div className="overlay" onClick={() => setBoard(null)}>
          <div className="card sheet wars-world-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">WEEKLY COMPETITION</p>
            <h3>{board.season}</h3>
            <p className="muted small">Average points per active contributor. Every player can add up to 30 points per day.</p>
            <ul className="board">
              {board.entries.map((b, index) => <li key={b.campus} className={b.campus === profile?.campus ? "my-campus" : ""}><span><small>{index + 1}.</small> {b.name}<small className="wars-contributors">{b.contributors} contributors</small></span><span>{b.score}<small className="wars-contributors">{b.totalPoints} total</small></span></li>)}
            </ul>
            <button className="btn" onClick={() => setBoard(null)}>Back to campus</button>
            <a className="btn ghost" href="/events">View full standings</a>
          </div>
        </div>
      )}
    </div>
  );
}
