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

// Categories a CROWDED PAINT actually costs you. If nobody on the floor has to be guarded outside,
// the defense sits in the lane: drives die, shots get contested, and the five's shot quality falls.
// Not rebounding or defense — a lineup of bigs really does board and block, and their own numbers
// already say so.
const SPACING_CATEGORIES = ["scoring", "efficiency"];

// RELATIVE GATE. The weakest-link gate used to be the lowest RAW category sum, which is biased:
// rebounding & defense stack freely (typically high) while playmaking & efficiency are structurally
// low, so the gate landed on those two ~83% of the time. We instead judge each category against its
// TYPICAL team level (measured over realistic drafts in sim/category_diag.mjs) — lifting the
// naturally-low categories and lowering the naturally-high ones before taking the min — so ANY
// category can be your weak link. Strength (the sum) is untouched, so this only changes WHICH
// category caps you, not your raw power.
// (Means re-measured 2026-09 with sim/category_diag.mjs; the previous values had drifted 5-16% low,
// which drew every bar ~10% fuller than the truth.)
export const CAT_TYPICAL = { scoring: 3.58, rebounding: 5.25, playmaking: 2.56, defense: 5.10, efficiency: 1.96 };
// ---------------------------------------------------------------------------------------------
// DISPLAY REFERENCE — used by the category bars, the weakest-link line and the Team Report, and by
// nothing in the simulation. Deliberately separate from CAT_TYPICAL above, which feeds GATE_SHIFT
// and is calibrated on the BARE FIVE; what the player is actually shown is the FINISHED build, five
// plus a sixth man plus a coach, which sits a whole category-point higher. Judging the display
// against the bare-five bar told a completed team it was above par at everything.
//
// The old measure was score/mean, which divides by a number that differs 2.7x across the categories
// and so amplified whichever ones have the smallest means (playmaking, efficiency). Measured over a
// points-chasing draft it named those two as the weak link 24x more often than the least-named one.
//
// Judging each category in its OWN standard deviation looked like the answer and is NOT: the spreads
// themselves move with how you draft, so it merely swaps which population gets distorted (spread of
// 2.8x on skilled play but 38x on scattergun drafts). What is stable is subtracting the mean and
// scaling everything by ONE shared number — 0 means typical, and no category is amplified relative to
// another. Worst-case spread across casual / skilled / scattergun / intact-club populations:
//   score/mean 24.5x   own-sd z 38.4x   shared scale 11.2x  <- least bad on every realistic population
// Measured over a REALISTIC MIX of play — half casual (chasing points), half skilled, each taking an
// offered coach rather than the optimal one. Referencing near-perfect play instead told an ordinary
// finished team it was below par at all five things at once, which is both harsh and useless.
// Re-measure both rows with sim/category_diag.mjs if the draft distribution ever changes.
// DISPLAY MEASURE — used by the category bars, the weakest-link line and the Team Report, and by
// nothing in the simulation.
//
// A category is judged as a RATIO of its own typical level. That keeps the bars GROWING as you draft:
// an untouched board is 0 and draws nothing, and each pick adds to a bar that only ever moves one way.
// A centre-anchored version was tried — measuring each category as a distance above or below typical —
// and it is worse to USE even though it is arguably more informative: a part-built roster is below a
// finished one in every category, so the bars sat left of centre and lurched about with every pick.
// Watching them build is the point. Do not make them oscillate.
//
// Everything that ranks categories goes through catRatio, so the shortest bar and the category the
// report names as the weak point are the same category by construction. They once used score/mean and
// score-mean respectively and disagreed 55% of the time.
export const catRatio = (score, k) => (score || 0) / (CAT_TYPICAL[k] || 1);
/** Fractional deviation from typical: 0 = typical, +0.30 = 30% above. Same ordering as catRatio. */
export const catZ = (score, k) => catRatio(score, k) - 1;
const GATE_SHIFT = (() => {
  const avg = CATEGORIES.reduce((a, k) => a + CAT_TYPICAL[k], 0) / CATEGORIES.length;
  const s = {};
  for (const k of CATEGORIES) s[k] = CAT_TYPICAL[k] - avg; // + for high cats, − for low cats
  return s;
})();

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
  // FLOOR SPACING. The sim had no idea whether a five could stretch a defense, and the omission had a
  // direction: interior players post the rebounds and blocks the engine rewards, so stacking bigs was
  // a mild OPTIMUM. Measured over realistic drafts, team spacing correlated -0.14 with S and -0.11
  // with wins — the worst-spaced tenth of teams won MORE than the best-spaced tenth (median 5 against
  // 4, with 2.5 bigs against 1.7). Meanwhile the Team Report was telling those same players their
  // paint was too crowded. The model and the write-up disagreed, and the model was the wrong one.
  //
  // Same shape as the usage collision above, and for the same reason: each player's own shooting is
  // already in his numbers, but nothing expressed that five non-shooters make EACH OTHER worse. It
  // damps upside only — a packed lane cannot make you better at something you were bad at — and it
  // needs `spacing` from data.js deriveSpacing, defaulting to neutral when absent so a bare-roster
  // call (tests, sim harnesses) behaves exactly as before.
  //
  // spacingSlack is the room below a typical five before it bites; spacingK is how hard it bites.
  // Tuned against a drafter that OPTIMISES UNDER THIS TERM, which is the only measurement that means
  // anything here — the point is to change what a good player BUILDS, not merely to tax what he built
  // before. At 0.10 / 0.9 the optimiser's average five goes from -0.28 spacing to -0.15 and from 2.27
  // bigs to 2.16, for one median win and no change to the 38-0 rate. Pushing harder keeps flattening
  // the spacing-to-wins correlation but starts eating the win curve (K 1.6 costs four median wins),
  // and the correlation should not reach zero anyway: a lineup of bigs genuinely does rebound.
  spacingSlack: 0.10,
  spacingK: 0.9,

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
  // RE-TUNED (sim/retune2.mjs) across three changes that all shifted difficulty: (1) spin weighting
  // flattened to sqrt (weaker typical draft), (2) the RELATIVE gate, (3) the 6th-man buff to 0.80.
  // They roughly cancelled on the median (leagueS stays 18), but the top end got a touch fatter, so
  // gameSteep dropped 0.26->0.23 to keep the 38-0 tail thin.
  // Locked at 18 / 0.23 -> 38-0 1.8%, median 25, p75 31, p90 35 (base ~0%). Same difficulty as the
  // original, now with more club variety AND a more evenly-spread weakest-link category.
  // RE-TUNED (the "Balanced" profile, sim/softtune.mjs): measured a brutal skill cliff — a casual
  // "chase points" five had a MEDIAN of 7 wins and went 0-38 ~4% of the time. Softened with a gate
  // floor + win floor (below) and a gentler curve (leagueS 18->16, gameSteep 0.23->0.22) so a casual
  // now medians ~12 and almost never goes winless, while skilled play stays clearly ahead (~29 median,
  // 38-0 ~3.2%). The weak link still bites — just not fatally.
  leagueS: 16.0,
  gameSteep: 0.22,
  // gateFloor: a single blind spot caps you hard but no longer zeroes an otherwise-strong roster
  // (the thing that produced 0-38 casual seasons). winFloor: even a poor five steals a few games.
  gateFloor: 0.35,
  winFloor: 0.05,
};

const HOME_GAMES = GAMES / 2; // 19 home, 19 away — the arena is a HOME edge, not a global one

// SALARY captain. He is free and doubles nothing else in the game, so his weight IS the mode's
// difficulty dial. At the original 2.0 — a straight doubling of one man's contribution across all
// five categories, and therefore across the gate too — Salary produced a 38-0 in 13.1% of skilled
// builds against Classic's 1.9%: seven times easier, on a mode with its own leaderboard. Measured:
// 2.0 -> 13.1%, 1.7 -> 7.5%, 1.5 -> 4.5%, 1.4 -> 3.9%, 1.3 -> 3.4% (Classic 1.9%). 1.4 keeps the
// captain a decision worth making while leaving Salary about twice as forgiving as Classic rather
// than seven times. Only ever non-1 in Salary (captainCode is null everywhere else), so nothing
// outside that mode moves. Re-tune in sim/salary_sim.mjs.
const CAPTAIN_WEIGHT = 1.4;

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
  // sigmoid (default): bounded in (0,1); a terrible category asymptotes toward a hard cap. The
  // gateFloor lifts that cap off zero: a single blind spot should still cost you dearly, but it
  // shouldn't zero out an otherwise-strong roster (which sent casual, "chase points" fives to 0-38).
  const floor = p.gateFloor || 0;
  return floor + (1 - floor) * logistic(gate, p.gateSteep, p.gateMid);
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
 * @param {string|null} captainCode - Salary mode: the playerCode whose category contribution counts
 *   double. Optional; null means no captain.
 * @returns {{wins:number, losses:number, categoryScores:Object, gate:number,
 *            gateCategory:string, strength:number, S:number, benchValue:number}}
 */
export function projectRecord(roster, seasons, params = DEFAULT_PARAMS, arenaMult = 1, catDeltas = null, sixthMan = null, captainCode = null) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const bench = sixthMan ? benchValue(sixthMan) : 0;
  const n = roster.length || 1;

  // Usage shares drive both the rate-category weighting and the collision term below.
  const usages = roster.map(playerUsage);
  const totalUsage = usages.reduce((a, b) => a + b, 0);
  // Captain (Salary mode): his category contribution counts DOUBLE — he's the man the team runs
  // through. Weight 2 for the captain, 1 for everyone else; null captain leaves everything at 1.
  const capW = roster.map((pl) => (captainCode && pl.playerCode === captainCode ? CAPTAIN_WEIGHT : 1));

  // 1) the five's own score per category
  const categoryScores = {};
  for (const k of CATEGORIES) {
    let score = 0;
    if (RATE_CATEGORIES.has(k)) {
      // usage-weighted MEAN, rescaled by n so it stays on the same scale as the counting sums.
      // A high-volume chucker now drags team efficiency more than a low-usage finisher lifts it.
      // The captain gets double weight in that mean (his efficiency matters twice as much).
      const effTotal = roster.reduce((a, _pl, i) => a + capW[i] * usages[i], 0);
      roster.forEach((player, i) => {
        const w = effTotal > 0 ? (capW[i] * usages[i]) / effTotal : 1 / n;
        score += w * zscore(player.cat[k], baselineFor(seasons, player, k), player.gp, p.reliabilityK);
      });
      score *= n;
    } else {
      roster.forEach((player, i) => {
        score += capW[i] * zscore(player.cat[k], baselineFor(seasons, player, k), player.gp, p.reliabilityK);
      });
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

  // 2b) floor spacing — a five nobody has to guard outside gets its shot quality squeezed
  let spacingZ = 0, spacingSeen = 0;
  for (const pl of roster) {
    if (!pl || typeof pl.spacing !== "number") continue;
    spacingZ += pl.spacing; spacingSeen++;
  }
  spacingZ = spacingSeen ? spacingZ / spacingSeen : 0;
  const crowd = Math.max(0, -spacingZ - p.spacingSlack);
  const spacingMult = 1 / (1 + p.spacingK * crowd);
  for (const k of SPACING_CATEGORIES) {
    if (categoryScores[k] > 0) categoryScores[k] *= spacingMult;
  }

  // 3) coach patches the gate; 4) the 6th man adds what he's good at (usage-discounted) but
  //    can't drag a category down — a sub doesn't make your starters worse.
  for (const k of CATEGORIES) {
    if (catDeltas && catDeltas[k]) categoryScores[k] += catDeltas[k];
    if (sixthMan) {
      categoryScores[k] += Math.max(0, zscore(sixthMan.cat[k], baselineFor(seasons, sixthMan, k), sixthMan.gp, p.reliabilityK)) * bench;
    }
  }

  // ERA RE-CENTERING (era-fairness). Judge the five against its OWN era's typical five, not a single
  // modern-tilted bar. Each season carries a baked `catOffset` that lifts that season's category
  // totals onto a common (modern-reference) scale, so a team that dominated its era projects like an
  // equally dominant team from any other era. Baked by sim/bake_era_offsets.mjs; absent -> no change.
  //
  // The offset is the AVERAGE of the five men's own seasons. It used to be one season's offset — the
  // roster's modal year — elected by a scan that kept the FIRST season to reach the highest count.
  // Every normal mode draws each pick from a different club-season, so all five counts were 1 and the
  // "modal year" was simply whoever happened to sit in the first slot: the same five arranged
  // differently produced a different record in 64% of drafts, and the man at point guard silently
  // decided the whole team's era. Averaging is both order-independent and truer — a five spanning
  // 2003 to 2023 belongs to a blended era, not to one of its members' years — and it collapses to the
  // old behaviour exactly when the five DO share a season, which is the intact-roster case.
  const eraOff = {};
  for (const k of CATEGORIES) eraOff[k] = 0;
  let eraSeen = 0;
  for (const pl of roster) {
    const meta = pl && seasons && seasons[String(pl.season)];
    const off = meta && meta.catOffset;
    if (!off) continue;
    eraSeen++;
    for (const k of CATEGORIES) eraOff[k] += off[k] || 0;
  }
  if (eraSeen) for (const k of CATEGORIES) categoryScores[k] += eraOff[k] / eraSeen;

  const strength = CATEGORIES.reduce((acc, k) => acc + categoryScores[k], 0);

  // The ceiling uses the SOFT-min over category scores judged RELATIVE to their typical level (so a
  // second sagging category also costs you); the label names the single worst category, which is
  // what the player can actually act on.
  const gate = softMin(CATEGORIES.map((k) => categoryScores[k] - GATE_SHIFT[k]), p.softMinBeta);
  let worst = Infinity;
  let gateCategory = null;
  for (const k of CATEGORIES) {
    const rel = categoryScores[k] - GATE_SHIFT[k];
    if (rel < worst) {
      worst = rel;
      gateCategory = k;
    }
  }

  const gPrime = gateTransform(gate, p);
  // strength can be negative (below-average roster); guard the fractional power against a
  // negative base by only exponentiating the (non-negative) gate factor, never strength.
  const S = strength * Math.pow(gPrime, p.gamma);

  // Per-game probability against a league-average opponent, then an actual seeded season. The
  // winFloor is the chance even a poor five steals any single game — real bad teams still win a
  // handful, and it means a blind spot yields ~a rough season, never a literal 0-38.
  const pGame = Math.max(p.winFloor || 0, logistic(S, p.gameSteep, p.leagueS));
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
const BENCH_MINUTES = 0.80; // a 6th man plays a solid chunk of minutes: ~+1.8 wins on average (was
                            // 0.55 ≈ +1.3, too weak), and more when he patches your weakest category.
                            // Capped below a sixth starter by design — he only adds his POSITIVE z's.
export function benchValue(pl) {
  const u = playerUsage(pl);
  const t = Math.max(0, Math.min(1, (u - 0.20) / 0.20)); // 0 at low usage, 1 at high
  return (0.92 - t * 0.27) * BENCH_MINUTES; // usage discount × bench-minutes -> [0.36 .. 0.51]
}
