/** Public clue copy and ordered checkpoint IDs for the campus scavenger hunt. Rewards stay server-owned. */
export const HUNT_START_POINT_ID = "hunt_board";
export const HUNT_STOPS = [
  { pointId: "hunt_library", landmark: "Library approach", clue: "First stop: find the quiet corner of campus where books and big ideas meet." },
  { pointId: "hunt_food", landmark: "Food Court path", clue: "Clue found! Now head toward the food court—every explorer needs a break." },
  { pointId: "hunt_sports", landmark: "Sports Ground", clue: "One last stop: find the place where teammates run, compete, and celebrate." },
] as const;
