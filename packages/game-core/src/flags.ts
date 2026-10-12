// Feature flags for experimental extensions. Base weekly Campus Wars scoring is a core MVP system; this flag is reserved for future expanded event features. Defaults are off; deployments opt in via FEATURE_FLAGS='{"shop":true}'.
export const FLAG_DEFAULTS = {
  campusWars: false,
  shop: false,
  creatorStudio: false,
  aiNpc: false,
  sponsoredZones: false,
} as const;
export type FlagName = keyof typeof FLAG_DEFAULTS;
export type Flags = Record<FlagName, boolean>;

/** Unknown names and non-boolean values are ignored, and malformed JSON falls back to defaults. */
export function resolveFlags(raw: string | undefined): Flags {
  const flags: Flags = { ...FLAG_DEFAULTS };
  if (!raw) return flags;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) {
        const v = (parsed as Record<string, unknown>)[name];
        if (typeof v === "boolean") flags[name] = v;
      }
    }
  } catch {
    /* keep defaults */
  }
  return flags;
}
