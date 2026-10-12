import type {
  ActivityCompleteResponse,
  ActivityStartResponse,
  CreateSessionRequest,
  HomeLayout,
  HomeResponse,
  IdentityResponse,
  InventoryResponse,
  PlayerProfile,
  SessionResponse,
  ChatMessage,
  GroupView,
  PublicPlayer,
  SocialOverview,
  ProgressResponse,
  QuestClaimResponse,
  JobsResponse,
  ShiftStep,
  ShiftAnswerResponse,
} from "@campus/domain";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:4001";

const KEY = "campus.token";

/** Free-tier hosts sleep when idle. A no-cors ping to each service's health route starts waking them while the page loads. */
let warmed = false;
export function warmServers(): void {
  if (warmed || typeof fetch !== "function") return;
  warmed = true;
  for (const u of [API_URL, WS_URL.replace(/^ws/, "http")]) {
    try { void fetch(`${u}/healthz`, { mode: "no-cors", cache: "no-store" }).catch(() => undefined); } catch { /* best effort */ }
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message ?? body.error ?? "request_failed"), { status: res.status, code: body.error, body });
  return body as T;
}

export const api = {
  createSession: (r: CreateSessionRequest) =>
    req<SessionResponse>("/api/v1/auth/session", { method: "POST", body: JSON.stringify(r) }),
  me: () => req<{ profile: PlayerProfile }>("/api/v1/me"),
  identity: () => req<IdentityResponse>("/api/v1/profile"),
  updateProfile: (patch: { displayName?: string; bio?: string; avatar?: PlayerProfile["avatar"] }) =>
    req<IdentityResponse>("/api/v1/profile", { method: "PATCH", body: JSON.stringify(patch) }),
  inventory: () => req<InventoryResponse>("/api/v1/inventory"),
  shop: () => req<{
    currency: "CAMPUS_COINS";
    balance: number;
    offers: { itemId: string; price: number; tagline: string; featured?: boolean; owned: number; item: { id: string; name: string; layer: "floor" | "object" | "wall"; w: number; h: number; art: string; color: string; accent: string } }[];
  }>("/api/v1/shop"),
  purchaseShopItem: (itemId: string, idempotencyKey: string) => req<{
    ok: true; itemId: string; itemName: string; price: number; profile: PlayerProfile; inventory: InventoryResponse["items"];
  }>("/api/v1/shop/purchase", { method: "POST", headers: { "idempotency-key": idempotencyKey }, body: JSON.stringify({ itemId }) }),
  home: () => req<HomeResponse>("/api/v1/home"),
  saveHome: (layout: HomeLayout, revision: number) =>
    req<HomeResponse>("/api/v1/home", { method: "PUT", body: JSON.stringify({ layout, revision }) }),
  startReaction: () => req<ActivityStartResponse>("/api/v1/activities/reaction/start", { method: "POST" }),
  completeReaction: (runId: string) =>
    req<ActivityCompleteResponse>("/api/v1/activities/reaction/complete", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ runId }),
    }),
  startQuiz: () => req<{
    runId: string;
    question: { id: string; category: string; prompt: string; choices: string[] };
    attemptsRemaining: number;
  }>("/api/v1/activities/quiz/start", { method: "POST" }),
  completeQuiz: (runId: string, answerIndex: number) => req<{
    correct: boolean;
    correctIndex: number;
    explanation: string;
    rewardCoins: number;
    rewardReputation: number;
    warPointsAwarded: number;
    attemptsRemaining: number;
    profile: PlayerProfile;
  }>("/api/v1/activities/quiz/complete", {
    method: "POST",
    headers: { "idempotency-key": `quiz-${runId}` },
    body: JSON.stringify({ runId, answerIndex }),
  }),
  startHunt: () => req<{
    runId: string; step: number; totalSteps: number; clue: string; landmark: string; attemptsRemaining: number;
  }>("/api/v1/activities/hunt/start", { method: "POST" }),
  checkpointHunt: (runId: string, pointId: string) => req<{
    ok: true; runId: string; pointId: string; complete: boolean; step: number; totalSteps: number;
    clue?: string; landmark?: string; attemptsRemaining: number; rewardCoins?: number; rewardReputation?: number;
    warPointsAwarded?: number; profile?: PlayerProfile;
  }>("/api/v1/activities/hunt/checkpoint", {
    method: "POST",
    headers: { "idempotency-key": `hunt-${runId}-${pointId}` },
    body: JSON.stringify({ runId, pointId }),
  }),
  campusWars: () => req<{
    season: { id: string; name: string; status: "active"; startsAt: string; endsAt: string; pointsRule: string };
    scoring: { rule: number; pointsPerPlayerPerUtcDay: number; sourceCaps: Record<string, number>; minContributors: number; normalization: string; explanation: string };
    entries: { campus: string; name: string; score: number; totalPoints: number; contributors: number; population: number; ranked: boolean; rank: number | null }[];
    me?: { campus: string; points: number; bySource: Record<string, number>; campusRank: number | null; campusContributors: number; today: { total: number; cap: number; bySource: Record<string, number> } };
  }>("/api/v1/campus-wars/current"),
  campusWarsHistory: () => req<{ seasons: { season: string; standings: { campus: string; score: number; rank: number | null }[]; at: string }[] }>("/api/v1/campus-wars/history"),
  progress: () => req<ProgressResponse>("/api/v1/progress"),
  claimQuest: (id: string) => req<QuestClaimResponse>(`/api/v1/quests/${id}/claim`, { method: "POST" }),
  jobs: () => req<JobsResponse>("/api/v1/jobs"),
  applyJob: (jobId: string) => req<JobsResponse & { newlyUnlocked?: string[] }>("/api/v1/jobs/apply", { method: "POST", body: JSON.stringify({ jobId }) }),
  quitJob: () => req<JobsResponse>("/api/v1/jobs/quit", { method: "POST" }),
  shiftStart: () => req<ShiftStep>("/api/v1/jobs/shift/start", { method: "POST" }),
  shiftAnswer: (runId: string, index: number, choice: number) => req<ShiftAnswerResponse>("/api/v1/jobs/shift/answer", { method: "POST", body: JSON.stringify({ runId, index, choice }) }),
  checkin: () => req<{ ok: true; event: string; coins: number; reputation: number; warPoints: number }>("/api/v1/events/checkin", { method: "POST" }),
  events: () => req<{ events: {
    id: string; title: string; description: string; location: string; category: "social" | "learning" | "sports" | "creator";
    icon: string; startsAt: string; endsAt: string; status: "upcoming" | "live"; rsvpCount: number; rsvped: boolean;
  }[] }>("/api/v1/events"),
  rsvpEvent: (eventId: string, attending: boolean) => req<{ ok: true; eventId: string; startsAt: string; status: "upcoming" | "live"; rsvped: boolean; rsvpCount: number }>(
    `/api/v1/events/${encodeURIComponent(eventId)}/rsvp`, { method: attending ? "POST" : "DELETE" }
  ),
  social: {
    overview: () => req<SocialOverview>("/api/v1/social/overview"),
    search: (q: string) => req<{ players: (PublicPlayer & { relation: "friend" | "incoming" | "outgoing" | "none" })[] }>(`/api/v1/social/players?q=${encodeURIComponent(q)}`),
    request: (playerId: string) => req<{ state: string }>("/api/v1/social/friends/request", { method: "POST", body: JSON.stringify({ playerId }) }),
    respond: (playerId: string, accept: boolean) => req<{ state: string }>("/api/v1/social/friends/respond", { method: "POST", body: JSON.stringify({ playerId, accept }) }),
    remove: (playerId: string) => req<{ ok: true }>("/api/v1/social/friends/remove", { method: "POST", body: JSON.stringify({ playerId }) }),
    block: (playerId: string, blocked: boolean) => req<{ ok: true }>("/api/v1/social/blocks", { method: "POST", body: JSON.stringify({ playerId, blocked }) }),
    mute: (playerId: string, muted: boolean) => req<{ ok: true }>("/api/v1/social/mutes", { method: "POST", body: JSON.stringify({ playerId, muted }) }),
    groups: () => req<{ groups: GroupView[] }>("/api/v1/social/groups"),
    createGroup: (name: string, description: string) => req<{ group: GroupView }>("/api/v1/social/groups", { method: "POST", body: JSON.stringify({ name, description }) }),
    joinGroup: (id: string) => req<{ group: GroupView }>(`/api/v1/social/groups/${id}/join`, { method: "POST" }),
    leaveGroup: (id: string) => req<{ ok: true }>(`/api/v1/social/groups/${id}/leave`, { method: "POST" }),
    messages: (kind: "dm" | "group", id: string, after?: string) =>
      req<{ messages: ChatMessage[] }>(`/api/v1/social/${kind === "dm" ? "dm" : "groups"}/${id}${kind === "dm" ? "" : "/messages"}${after ? `?after=${encodeURIComponent(after)}` : ""}`),
    send: (kind: "dm" | "group", id: string, text: string) =>
      req<{ message: ChatMessage }>(`/api/v1/social/${kind === "dm" ? "dm" : "groups"}/${id}${kind === "dm" ? "" : "/messages"}`, { method: "POST", body: JSON.stringify({ text }) }),
    report: (r: { playerId: string; reason: string; context: string; note?: string; messageId?: string }) => req<{ ok: true }>("/api/v1/reports", { method: "POST", body: JSON.stringify(r) }),
  },
  leaderboard: () =>
    req<{ season: string; entries: { campus: string; name: string; score: number }[] }>("/api/v1/leaderboards/current"),
};
