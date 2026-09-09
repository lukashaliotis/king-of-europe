// Salary Cap — a player's price IS his PIR (EuroLeague's official Performance Index Rating): a
// PIR-15 player costs €15M, full stop. No opaque curve — the number on the card is the number fans
// already know, so pricing never "feels random". PIR is points-heavy, so scorers cost and
// defenders/rebounders come cheap; the hook is that you must still buy enough scoring or your
// scoring gate craters.
//
// Calibrated in sim/salary_sim.mjs. PIR runs ~0-28 for real players (p50 8, p90 15, p99 21) and up
// to ~42 for legends. The €100M cap covers 5 starters + the 6th man + a mandatory priced COACH
// (€2-15 by pedigree). The CAPTAIN is FREE — he costs nothing and multiplies his own contribution
// (engine.CAPTAIN_WEIGHT) — so he is a pure upside pick, which is what makes Salary the relaxed
// mode of the set.
//
// MEASURED (sim/mode_balance.mjs, skilled play, full build): median 32, p90 37, 38-0 ~3.9%, against
// Classic's median 29 / 38-0 1.9%. Salary is meant to be more forgiving and it is, by roughly 2x on
// the perfect-season rate. (An earlier note here claimed "median ~18 / p90 ~28, 38-0 ~0%" and a
// "captain double-price surcharge" that the code has never charged — both were wrong; the captain
// was doubling contribution for free and Salary was running SEVEN times easier than Classic.)
export const SALARY_CAP = 100; // €M, for the whole build (five + bench + coach + captain surcharge)
export const FLOOR = 2;        // price floor so the deepest scrubs are never near-free

/** The player's PIR, clamped non-negative (a handful of deep-bench seasons dip below zero). */
export const playerPir = (player) => Math.max(0, player.pir || 0);

/** Price in whole €M = the player's PIR (floored). (`seasons` kept for call-site parity.) */
export function playerCost(player, seasons) {
  return Math.max(FLOOR, Math.round(playerPir(player)));
}

export const formatMoney = (n) => `€${n}M`;

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
