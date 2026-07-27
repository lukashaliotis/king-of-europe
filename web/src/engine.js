// 38-0 simulation engine — deterministic, portable (Node harness + browser share this file).
//
// The heart is the category GATE: team strength is capped by the weakest category, not the
// average. That is what forces trade-offs and makes a result arguable. See docs/SPEC.md.
//
// Pipeline of a projection, for a drafted five:
//   z_k(player) = (cat_k - season.mean_k) / season.std_k      // era adjustment, per player's season
//   C_k         = sum of z_k across the five                  // team score in category k
//   strength    = sum of C_k over the five categories         // overall roster strength
//   gate        = min of C_k over the five categories         // the weakest link
//   g'          = gateTransform(gate)                          // map gate into a safe (0,1)-ish domain
//   S           = strength * g'^gamma                          // weakest link scales the whole roster
//   wins        = 38 * logistic(S)                             // non-linear, harsh near the top

export const CATEGORIES = ["scoring", "rebounding", "playmaking", "defense", "efficiency"];
export const GAMES = 38;

// RATE categories are averages, not team totals. Summing five players' TS% z-scores is wrong —
// a team's true shooting is a USAGE-WEIGHTED MEAN of its shooters. Counting stats (points,
// rebounds, assists, stocks) genuinely do add up, so they stay sums.
const RATE_CATEGORIES = new Set(["efficiency"]);

// Categories constrained by there being ONE BALL. Five high-usage scorers cannot all shoot;
// their raw z-scores add as if they could. These get damped by the usage-collision term.
const COLLISION_CATEGORIES = ["scoring", "playmaking"];

// Default tunable parameters. These are PLACEHOLDERS to be calibrated empirically against real
// rosters (build step 3) — do not treat them as final.
export const DEFAULT_PARAMS = {
  gamma: 1.0,
  // Reliability shrinkage: a player's z-score is scaled by gp/(gp+reliabilityK) so that
  // small-sample seasons (the short pre-2016 regular seasons, ~9-14 games) can't post the
  // extreme rates that would otherwise let noisy old rosters dominate the all-time summit.
  // Full modern seasons (~28-38 games) are barely touched. K controls the aggressiveness.
  reliabilityK: 4.0,
  // gate transform: "sigmoid" squashes the gate into (0,1); "shift" is max(0, gate + shiftC).
  // Both are implemented behind this flag; the choice is made during tuning.
  gateTransform: "sigmoid",
  gateMid: -1.0, // sigmoid midpoint: a balanced roster (gate ~4) is near-unpenalized (~0.95);
  gateSteep: 0.6, // only genuine holes (gate < 0) sink hard. The gate punishes weakness, not everyone.
  shiftC: 8.0, // used only by the "shift" transform
  // SOFT-MIN gate. A hard min() only ever sees the single worst category, so a team with two
  // holes scores the same as one with a single hole, and the gate flips discontinuously between
  // categories. The normalised log-mean-exp below equals the common value when all five are
  // equal, sits between min and mean otherwise, and DROPS as more categories sag. Higher beta
  // = closer to a hard min. Set to 0 to restore the old min().
  softMinBeta: 1.2,
  // USAGE COLLISION. Total FGA/min a five can realistically support; past this, the ball-dominant
  // categories get damped (see COLLISION_CATEGORIES). Qualified-player usage runs p10 0.20,
  // median 0.29, p90 0.39 — so five median starters ≈ 1.45 and five ball-hogs ≈ 1.95.
  // Calibrated in sim/retune2.mjs. Collision turned out to be a far better lever than the win
  // curve: raising collisionK cut greedy-optimal 38-0 from 10.7% to 4.5% while the median only
  // slipped 27->22, whereas getting the same drop out of winMid alone crushed the median to 10.
  // It punishes the thing we WANT punished (stacking ball-hogs) instead of punishing everyone.
  usageBudget: 1.55,
  collisionK: 3.2,
  // PER-GAME win curve. `leagueS` is the effective strength of a league-average opponent — the
  // S at which you win exactly half your games — and gameSteep is how sharply an edge in S turns
  // into an edge in a single game:
  //     p = logistic(gameSteep * (S - leagueS))
  // The season is then 38 draws at p (see playSeason), so a perfect season costs p^38 and is
  // structural rather than a tuned threshold. Same p is reused for the postseason and the
  // Versus duel, so one number governs every game the roster ever plays.
  // Calibrated in sim/retune2.mjs AFTER the Tier-2 rewrite. These two are now SEPARABLE, which
  // they never were under the old single win curve: gameSteep sets how fast a good team's p
  // saturates toward 1 (i.e. the thickness of the 38-0 tail) while leagueS shifts the median.
  // At leagueS 20, steep 0.44->0.30 cut 38-0 from 6.8% to 1.9% and cost ONE median win.
  // Locked at 18 / 0.26 -> 38-0 2.3%, median 25, p90 35.
  leagueS: 18.0,
  gameSteep: 0.26,
};

const HOME_GAMES = GAMES / 2; // 19 home, 19 away — the arena is a HOME edge, not a global one

function logistic(x, steep, mid) {
  return 1 / (1 + Math.exp(-steep * (x - mid)));
}

/* ---------------- per-game probability + the seeded season (Tier 2) ---------------- */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed from the roster's player codes, sorted so draft ORDER never changes the season. */
export function seedFromRoster(roster) {
  const key = roster.map((p) => p.playerCode).sort().join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Probability that a team of effective strength sA beats one of strength sB in ONE game.
 * This is the single quantity the whole game runs on: the regular season, the postseason
 * bracket and the Versus duel all ask it the same question.
 */
export function gameProbability(sA, sB, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params };
  return logistic(sA - sB, p.gameSteep, 0);
}

/**
 * Play out 38 games at per-game probability `p`. Seeded, so the same five ALWAYS produces the
 * same season (the SPEC's determinism is reproducibility, not absence of chance) — but 38-0 now
 * costs p^38 instead of merely requiring p to round up to 38, which is what makes a perfect
 * season structurally rare rather than a tuning artefact.
 *
 * The arena is applied as a HOME-COURT edge over the 19 home games. It's doubled there so the
 * whole-season magnitude still matches the ±4.5% the arena was calibrated to.
 */
export function playSeason(p, seed, arenaMult = 1) {
  const rng = mulberry32(seed);
  const pHome = Math.max(0, Math.min(0.999, p * (1 + 2 * (arenaMult - 1))));
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    if (rng() < (i < HOME_GAMES ? pHome : p)) wins++;
  }
  return wins;
}

/**
 * Normalised soft-min (log-mean-exp). Equals the shared value when every category is equal,
 * approaches min() as beta grows, and — the point — sinks further the MORE categories sag, so
 * the second-worst finally counts. Shifted by the true min for numerical stability.
 */
function softMin(values, beta) {
  const m = Math.min(...values);
  if (!beta || beta <= 0) return m;
  let s = 0;
  for (const v of values) s += Math.exp(-beta * (v - m));
  return m - Math.log(s / values.length) / beta;
}

function gateTransform(gate, p) {
  if (p.gateTransform === "shift") {
    return Math.max(0, gate + p.shiftC);
  }
  // sigmoid (default): bounded in (0,1); a terrible category asymptotes toward a hard cap.
  return logistic(gate, p.gateSteep, p.gateMid);
}

// z-score one player's category value against their own season+POSITION baseline, then apply
// reliability shrinkage by games played (see reliabilityK). Position-relative: a guard's
// rebounding is judged against guards, a center's playmaking against centers.
function zscore(value, stat, gp, reliabilityK) {
  if (!stat || stat.std === 0) return 0;
  const z = (value - stat.mean) / stat.std;
  const reliability = gp / (gp + reliabilityK);
  return z * reliability;
}

// Look up the per-(season, position) baseline for a player's category, tolerant of missing data.
function baselineFor(seasons, player, category) {
  const meta = seasons[String(player.season)];
  if (!meta || !meta.catStats) return null;
  const byPos = meta.catStats[player.pos] || meta.catStats.F || null; // fallback to Forward
  return byPos ? byPos[category] : null;
}

// One player's shrink-adjusted, position-relative z per category.
export function categoryZ(player, seasons, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const out = {};
  for (const k of CATEGORIES) {
    out[k] = zscore(player.cat[k], baselineFor(seasons, player, k), player.gp, p.reliabilityK);
  }
  return out;
}

// Sum of a single player's shrink-adjusted z across all categories. Used to weight the spin
// toward stronger clubs (a club's "ceiling" ~ its best few players' strength).
export function playerStrength(player, seasons, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params };
  let s = 0;
  for (const k of CATEGORIES) {
    s += zscore(player.cat[k], baselineFor(seasons, player, k), player.gp, p.reliabilityK);
  }
  return s;
}

/**
 * Project a record for a five-man roster.
 * @param {Array} roster - up to 5 player records ({season, cat:{...}, ...}).
 * @param {Object} seasons - baked season meta: { [year]: { catStats: { cat: {mean,std} } } }.
 * @param {Object} params - tuning parameters (defaults to DEFAULT_PARAMS).
 * @param {number} arenaMult - home-arena multiplier (Phase 2). Applies to the win-curve OUTPUT
 *   only — never to strength or the gate — so it stays a separate layer. ~±4.5%, which is
 *   decisive at the cliff near perfection and noise mid-table.
 * @param {Object|null} catDeltas - coach category adjustments (Phase 2), e.g. {defense: +2.4}.
 *   Applied to the CATEGORY SCORES, so the coach patches the gate — a different layer from the
 *   arena. Situational by design: worthless unless it lifts your weakest category.
 * @param {Object|null} sixthMan - the bench player (Phase 2). Adds his position-relative z to
 *   the category scores, but USAGE-DISCOUNTED: a high-usage star gives ~65% of his value off
 *   the bench, a low-usage motor player ~90%. This is the deliberate inversion — a role player
 *   is genuinely a better 6th man than a ball-dominant star.
 * @returns {{wins:number, losses:number, categoryScores:Object, gate:number,
 *            gateCategory:string, strength:number, S:number, benchValue:number}}
 */
export function projectRecord(roster, seasons, params = DEFAULT_PARAMS, arenaMult = 1, catDeltas = null, sixthMan = null) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const bench = sixthMan ? benchValue(sixthMan) : 0;
  const n = roster.length || 1;

  // Usage shares drive both the rate-category weighting and the collision term below.
  const usages = roster.map(playerUsage);
  const totalUsage = usages.reduce((a, b) => a + b, 0);

  // 1) the five's own score per category
  const categoryScores = {};
  for (const k of CATEGORIES) {
    let score = 0;
    if (RATE_CATEGORIES.has(k)) {
      // usage-weighted MEAN, rescaled by n so it stays on the same scale as the counting sums.
      // A high-volume chucker now drags team efficiency more than a low-usage finisher lifts it.
      roster.forEach((player, i) => {
        const w = totalUsage > 0 ? usages[i] / totalUsage : 1 / n;
        score += w * zscore(player.cat[k], baselineFor(seasons, player, k), player.gp, p.reliabilityK);
      });
      score *= n;
    } else {
      for (const player of roster) {
        score += zscore(player.cat[k], baselineFor(seasons, player, k), player.gp, p.reliabilityK);
      }
    }
    categoryScores[k] = score;
  }

  // 2) usage collision — one ball. Only UPSIDE is damped: crowding the ball can't make you
  //    better at a category you're already bad at.
  const excess = Math.max(0, totalUsage - p.usageBudget);
  const collision = 1 / (1 + p.collisionK * excess);
  for (const k of COLLISION_CATEGORIES) {
    if (categoryScores[k] > 0) categoryScores[k] *= collision;
  }

  // 3) coach patches the gate; 4) the 6th man adds what he's good at (usage-discounted) but
  //    can't drag a category down — a sub doesn't make your starters worse.
  for (const k of CATEGORIES) {
    if (catDeltas && catDeltas[k]) categoryScores[k] += catDeltas[k];
    if (sixthMan) {
      categoryScores[k] += Math.max(0, zscore(sixthMan.cat[k], baselineFor(seasons, sixthMan, k), sixthMan.gp, p.reliabilityK)) * bench;
    }
  }

  const strength = CATEGORIES.reduce((acc, k) => acc + categoryScores[k], 0);

  // The ceiling uses the SOFT-min (so a second sagging category also costs you); the label still
  // names the single worst category, which is what the player can actually act on.
  const gate = softMin(CATEGORIES.map((k) => categoryScores[k]), p.softMinBeta);
  let worst = Infinity;
  let gateCategory = null;
  for (const k of CATEGORIES) {
    if (categoryScores[k] < worst) {
      worst = categoryScores[k];
      gateCategory = k;
    }
  }

  const gPrime = gateTransform(gate, p);
  // strength can be negative (below-average roster); guard the fractional power against a
  // negative base by only exponentiating the (non-negative) gate factor, never strength.
  const S = strength * Math.pow(gPrime, p.gamma);

  // Per-game probability against a league-average opponent, then an actual seeded season.
  const pGame = logistic(S, p.gameSteep, p.leagueS);
  const wins = playSeason(pGame, seedFromRoster(roster), arenaMult);

  return {
    wins,
    losses: GAMES - wins,
    p: pGame,
    expectedWins: GAMES * pGame, // smooth, unrounded — use this to COMPARE rosters
    categoryScores,
    gate,
    gateCategory,
    strength,
    S,
    benchValue: bench,
    usage: totalUsage,
    collision,
  };
}

// Usage-based bench discount from FGA per minute. Low usage (~0.20) keeps ~0.90 of value;
// high usage (~0.40+) drops to ~0.65. Calibrated off the qualified-player FGA/min distribution
// (p10 0.20, median 0.29, p90 0.39).
export function playerUsage(pl) {
  return pl.mpg > 0 && pl.box ? pl.box.fga / pl.mpg : 0.29;
}
const BENCH_MINUTES = 0.55; // a 6th man plays ~half a starter's minutes — keeps him a boost,
                            // not a sixth starter (which over-inflated 38-0 and crushed the curve)
export function benchValue(pl) {
  const u = playerUsage(pl);
  const t = Math.max(0, Math.min(1, (u - 0.20) / 0.20)); // 0 at low usage, 1 at high
  return (0.92 - t * 0.27) * BENCH_MINUTES; // usage discount × bench-minutes -> [0.36 .. 0.51]
}
