// Salary Cap — price every player from the SAME era-adjusted strength the sim already uses,
// then make you build a legal six under a budget. You can't just take the best available; you
// weigh value-per-dollar. It suppresses the perfect season from the ROSTER side (you rarely
// afford a 38-0 team) without touching the win curve.
import { playerStrength } from "./engine.js";

// Calibrated in sim/salary_sim.mjs. A competitive team (~median 24 wins) costs ~$170M at raw
// strength, so these were scaled so a good six fits ~$95-100M and a 38-0 six does not: at the
// $100M cap the value-aware greedy lands median ~17 / p90 ~27 (vs 24 uncapped), 38-0 ~0%.
// Re-spins (which Salary mode has and the sim did not) lift real play a notch above that.
export const SALARY_CAP = 100; // $M, for a six (five starters + bench)
export const FLOOR = 4;        // every player costs at least this — no free scrubs
const SLOPE = 2.6;
const EXP = 1.1;               // mildly convex: elite talent carries a superstar tax
const CAP = 40;                // a ceiling so even a top legend stays fieldable with FLOOR fillers

/** Price in whole $M, derived from the player's positive era-adjusted strength. */
export function playerCost(player, seasons) {
  const s = Math.max(0, playerStrength(player, seasons));
  return Math.min(CAP, Math.round(FLOOR + SLOPE * Math.pow(s, EXP)));
}

export const formatMoney = (n) => `$${n}M`;

/**
 * Can this pick be afforded WITHOUT stranding the remaining slots? We reserve FLOOR for every
 * still-empty pick, so spending big early can't soft-lock you out of completing a legal six.
 * @param spent      total already committed
 * @param price      price of the pick being considered
 * @param picksLeftAfter  empty picks remaining AFTER this one
 */
export function canAfford(spent, price, picksLeftAfter, cap = SALARY_CAP) {
  return spent + price + FLOOR * picksLeftAfter <= cap;
}
