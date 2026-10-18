import { z } from "zod";
import { AVATAR_LEGACY_DEFAULTS, AVATAR_OPTIONS, type Avatar } from "./avatar";
import { CAMPUS_IDS } from "./campuses";
import { BIO_MAX, DISPLAY_NAME } from "./identity";
import { FLOOR_THEMES, ROOM, WALL_THEMES } from "./home";

export const CampusId = z.enum(CAMPUS_IDS);
export type CampusId = z.infer<typeof CampusId>;
export const AvatarSchema = z.object({
  skin: z.enum(AVATAR_OPTIONS.skin), outfit: z.enum(AVATAR_OPTIONS.outfit), hair: z.enum(AVATAR_OPTIONS.hair),
  hairColor: z.enum(AVATAR_OPTIONS.hairColor).default(AVATAR_LEGACY_DEFAULTS.hairColor),
  top: z.enum(AVATAR_OPTIONS.top).default(AVATAR_LEGACY_DEFAULTS.top),
  accessory: z.enum(AVATAR_OPTIONS.accessory),
  face: z.enum(AVATAR_OPTIONS.face).default(AVATAR_LEGACY_DEFAULTS.face),
  shoes: z.enum(AVATAR_OPTIONS.shoes).default(AVATAR_LEGACY_DEFAULTS.shoes),
  backpack: z.enum(AVATAR_OPTIONS.backpack).default(AVATAR_LEGACY_DEFAULTS.backpack),
  headwear: z.enum(AVATAR_OPTIONS.headwear).default(AVATAR_LEGACY_DEFAULTS.headwear),
  bottom: z.enum(AVATAR_OPTIONS.bottom).default(AVATAR_LEGACY_DEFAULTS.bottom),
  body: z.enum(AVATAR_OPTIONS.body).default(AVATAR_LEGACY_DEFAULTS.body),
});

export const DisplayName = z
  .string()
  .trim()
  .min(DISPLAY_NAME.min)
  .max(DISPLAY_NAME.max)
  .regex(/^[\p{L}\p{N} _.-]+$/u, "letters, numbers, space, _ . - only");

export const CreateSessionRequest = z.object({
  displayName: DisplayName,
  campus: CampusId,
  avatar: AvatarSchema,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const PlayerProfile = z.object({
  id: z.string(),
  displayName: DisplayName,
  campus: CampusId,
  avatar: AvatarSchema,
  bio: z.string().max(BIO_MAX),
  reputation: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type PlayerProfile = z.infer<typeof PlayerProfile>;

export const SessionResponse = z.object({
  token: z.string(),
  profile: PlayerProfile,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

// ---- Activities (server-authoritative) ----

export const ActivityStartResponse = z.object({
  runId: z.string(),
  // The client must wait `delayMs` (decided by the server) before reacting.
  // The server only measures elapsed time between its own events.
  delayMs: z.number(),
});
export type ActivityStartResponse = z.infer<typeof ActivityStartResponse>;

export const ActivityCompleteRequest = z.object({
  runId: z.string().min(1),
});
export type ActivityCompleteRequest = z.infer<typeof ActivityCompleteRequest>;

export const ActivityCompleteResponse = z.object({
  rewardCoins: z.number().int(),
  rewardReputation: z.number().int(),
  reactionMs: z.number(),
  tooEarly: z.boolean(),
  profile: PlayerProfile,
  newlyUnlocked: z.array(z.string()).optional(),
  levelUp: z.object({ from: z.number(), to: z.number(), title: z.string() }).optional(),
});
export type ActivityCompleteResponse = z.infer<typeof ActivityCompleteResponse>;

export const LeaderboardEntry = z.object({
  campus: CampusId,
  name: z.string(),
  score: z.number().int(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

// ---- Ledger (immutable) ----

export const LedgerEntry = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  actorId: z.string(),
  sourceEvent: z.string(),
  currency: z.literal("CAMPUS_COINS"),
  amount: z.number().int(),
  createdAt: z.string(),
  metadata: z.record(z.unknown()),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

// ---- Realtime protocol ----

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), token: z.string(), reconnectToken: z.string().optional() }),
  z.object({ t: z.literal("input"), seq: z.number().int().nonnegative(), x: z.number(), y: z.number() }),
  z.object({ t: z.literal("emote"), emote: z.enum(["wave", "dance", "laugh", "cheer", "sit"]) }),
  z.object({ t: z.literal("interact"), pointId: z.string().max(40) }),
  z.object({ t: z.literal("ping"), ts: z.number() }),
  /** Client finished the Grand Gate entry check. Soft authority: the server only accepts it near the gate, then lets this player through the wicket. */
  z.object({ t: z.literal("gate_pass") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface PlayerSnapshot {
  id: string;
  name: string;
  campus: CampusId;
  avatar: Avatar;
  x: number;
  y: number;
  emote?: string;
}

/** Delta for an entity the viewer already knows: only what changes per tick. Missing `emote` means none. */
export interface PlayerDelta { id: string; x: number; y: number; emote?: string }

export type ServerMessage =
  | { t: "welcome"; selfId: string; reconnectToken: string; x: number; y: number; players: PlayerSnapshot[] }
  | { t: "snapshot"; ack: number; players: PlayerSnapshot[]; moved: PlayerDelta[]; gone: string[]; serverTime: number; population: number }
  | { t: "correct"; x: number; y: number; ack: number }
  | { t: "interaction"; pointId: string; ok: boolean; activity: "reaction" | "quiz" | "hunt" | "jobs" | "shift" | "checkin" | null; reason?: string }
  | { t: "pong"; ts: number; serverTime: number }
  | { t: "error"; code: string; message: string };

// ---- Identity, inventory, home (Phase 2) ----
export const UpdateProfileRequest = z.object({ displayName: z.string().max(64).optional(), bio: z.string().max(400).optional(), avatar: AvatarSchema.optional() })
  .strict().refine((v) => v.displayName !== undefined || v.bio !== undefined || v.avatar !== undefined, { message: "nothing to update" });
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;
export interface IdentityResponse {
  profile: PlayerProfile; title: string; nextTitle: { title: string; at: number; remaining: number } | null;
  renameAvailableAt: string | null; achievements: { id: string; unlockedAt: string }[]; newlyUnlocked?: string[];
}
export const HomeLayoutSchema = z.object({
  theme: z.object({ wall: z.enum(WALL_THEMES), floor: z.enum(FLOOR_THEMES) }),
  items: z.array(z.object({ itemId: z.string().min(1).max(40), x: z.number().int().min(0).max(ROOM.cols), y: z.number().int().min(0).max(ROOM.rows), rot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) })).max(ROOM.maxItems),
});
export const SaveHomeRequest = z.object({ layout: HomeLayoutSchema, revision: z.number().int().min(0) });
export type SaveHomeRequest = z.infer<typeof SaveHomeRequest>;
export interface InventoryResponse { items: { itemId: string; qty: number; acquiredAt: string }[] }
export interface HomeResponse { layout: z.infer<typeof HomeLayoutSchema>; revision: number; updatedAt: string; newlyUnlocked?: string[] }
