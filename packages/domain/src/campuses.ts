// Fictional campuses only; real institutions need an approved campus pack.
export const CAMPUS_IDS = ["unity_heights", "lagoon_tech", "savannah_state"] as const;
export type CampusKey = (typeof CAMPUS_IDS)[number];
export const CAMPUSES: Record<CampusKey, { name: string; tagline: string; color: string }> = {
  unity_heights: { name: "Unity Heights University", tagline: "Where the whole country meets", color: "#2f6bff" },
  lagoon_tech: { name: "Lagoon Institute of Technology", tagline: "Build fast. Ship faster.", color: "#1fb7c9" },
  savannah_state: { name: "Savannah State University", tagline: "Heat, hustle and heart", color: "#e8a24a" },
};
