// GOAT mode — build ONE mythical player by grafting stats off real players, then see how far he
// carries his real club. Pure logic (no DOM); the browser UI and the sim harness both use it.
//
// THE MODEL
//  - Spin a home club, pick a base player — his REAL line is the GOAT's starting stat line, and he
//    fixes the GOAT's position + name. The club fills the best four at the OTHER slots as the cast.
//  - Six graftable stats: Points, Rebounds, Assists (the donor's turnovers ride along, hidden, via
//    the playmaking category), TS%, Steals, Blocks. You get FIVE grafts, so exactly ONE stat stays
//    at the base player's value — a forced weakness that keeps the gate alive. Defense costs two
//    grafts (steals + blocks are separate).
//  - The GOAT is a synthetic player object shaped like any other, so projectRecord/runPostseason
//    treat him uniformly. His categories are z-scored against HIS position (a guard who grafts a
//    centre's rebounding is judged as a freakishly-rebounding guard — the whole fantasy).
import { CATEGORIES, categoryZ, playerStrength } from "./engine.js";

const SLOT_POS = ["G", "G", "F", "F", "C"];

// FREAK CAP. Grafting is judged position-relative (a guard's grafted centre-rebounding is scored
// against guards — the fantasy), so an unbounded graft lands at a z of 9–12: two to three times the
// best real season EVER in any category (real ceilings: scoring 3.2, rebounding 3.7, playmaking 4.0,
// defense 4.0, efficiency 3.0). That cartoon inflation is invisible in the box line (we cap the
// RATING, cat.*, never the displayed box.* numbers) but it trivialised the individual awards and
// warped the sim. We clamp each category's shrink-adjusted z to GOAT_CAT_CAP — "freakish, a hair
// past the greatest season ever, but not physically impossible." Only ever scales a category DOWN.
export const GOAT_CAT_CAP = 4.5;

// Look up a player's per-(season, position) category baseline {mean,std} — mirrors engine.baselineFor
// (not exported there). Tolerant of missing data, falls back to the Forward baseline.
function baselineOf(seasons, player, category) {
  const meta = seasons[String(player.season)];
  if (!meta || !meta.catStats) return null;
  const byPos = meta.catStats[player.pos] || meta.catStats.F || null;
  return byPos ? byPos[category] : null;
}

// Clamp the GOAT's category RATINGS so no shrink-adjusted z exceeds `cap`. z is linear in
// (value − mean), so scaling (cat − mean) by cap/z lands the final z exactly on the cap. In place.
function capCategoryZ(goat, seasons, cap) {
  if (!seasons || !(cap < Infinity)) return goat;
  const gz = categoryZ(goat, seasons);
  for (const k of CATEGORIES) {
    if (gz[k] > cap) {
      const bl = baselineOf(seasons, goat, k);
      if (bl && bl.std) goat.cat[k] = bl.mean + (goat.cat[k] - bl.mean) * (cap / gz[k]);
    }
  }
  return goat;
}

// The six graftable stats and the engine category each one drives. `ast` maps to playmaking so the
// donor's hidden turnovers come with it; `stl`/`blk` both feed defense (two separate grafts).
export const GRAFT_STATS = ["pts", "reb", "ast", "ts", "stl", "blk"];
export const STAT_LABEL = { pts: "Points", reb: "Rebounds", ast: "Assists", ts: "TS%", stl: "Steals", blk: "Blocks" };
export const STAT_CATEGORY = { pts: "scoring", reb: "rebounding", ast: "playmaking", ts: "efficiency", stl: "defense", blk: "defense" };

// Build the GOAT from a base player + a list of grafts ({ stat, donor }). Pure — rebuilds from the
// base each call, so the UI just passes the grafts accumulated so far.
// `seasons` (optional) enables the freak cap: when provided, grafted category ratings are clamped to
// `cap` z. Omit seasons (UI preview cards that only read box.*) to skip it — the cap only affects the
// rating/sim/awards, never the displayed box line, so preview cards are identical either way.
export function buildGoat(base, grafts = [], seasons = null, cap = GOAT_CAT_CAP) {
  const box = { ...base.box };
  const cat = { ...base.cat };
  const source = {}; // stat -> donor (for "whose stat is this"); base stats stay unmarked
  // Usage = FGA / minutes. When we graft a scorer's FGA we must take his MINUTES too, or a low-minute
  // base + a high-volume donor produces a nonsense usage ("17 shots in 10 min") that detonates the
  // one-ball collision penalty. Track the minutes that go with the current shot volume.
  let mpg = base.mpg;
  for (const { stat, donor } of grafts) {
    if (stat === "pts") { box.pts = donor.box.pts; box.fga = donor.box.fga; cat.scoring = donor.cat.scoring; mpg = donor.mpg || base.mpg; }
    else if (stat === "reb") { box.reb = donor.box.reb; cat.rebounding = donor.cat.rebounding; }
    else if (stat === "ast") { box.ast = donor.box.ast; cat.playmaking = donor.cat.playmaking; } // donor's ast-tov
    else if (stat === "ts") { box.ts = donor.box.ts; cat.efficiency = donor.cat.efficiency; }
    else if (stat === "stl") { box.stl = donor.box.stl; }
    else if (stat === "blk") { box.blk = donor.box.blk; }
    source[stat] = donor;
  }
  cat.defense = (box.stl || 0) + (box.blk || 0); // recompute after any steals/blocks graft
  const goat = {
    season: base.season, pos: base.pos, gp: base.gp, mpg,
    playerName: base.playerName, teamCode: base.teamCode, teamName: base.teamName,
    playerCode: "GOAT_" + base.playerCode, baseCode: base.playerCode, goat: true, q: true,
    box, cat, source,
    _src: base._src || { teamCode: base.teamCode, seasonLabel: base.seasonLabel || String(base.season), teamName: base.teamName },
  };
  return capCategoryZ(goat, seasons, cap);
}

// Which of the six stats is still at the base value (the forced weakness) — for UI highlighting.
export const ungraftedStats = (grafts) => {
  const done = new Set(grafts.map((g) => g.stat));
  return GRAFT_STATS.filter((s) => !done.has(s));
};

// The GOAT plus the best four the home club can field at the OTHER four slots (the base player is
// removed from the pool — he's become the GOAT). Returns a legal 2G/2F/1C five, or null if the club
// is too shallow to field the rest.
export function goatFive(goat, homeClub, seasons) {
  const slots = [null, null, null, null, null];
  slots[SLOT_POS.findIndex((pos) => pos === goat.pos)] = goat;
  const cands = (homeClub.players || [])
    .filter((pl) => pl.playerCode !== goat.baseCode)
    .slice()
    .sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons));
  for (const pl of cands) {
    const i = SLOT_POS.findIndex((pos, idx) => pos === pl.pos && !slots[idx]);
    if (i >= 0) { slots[i] = pl; if (slots.every(Boolean)) break; }
  }
  return slots.every(Boolean) ? slots : null;
}

/* ---------------- individual awards ---------------- */

// Precompute the real-player distributions ONCE so award percentiles are grounded in the actual
// pool (an MVP-calibre GOAT ranks among the top real seasons ever). Sorted ascending for a binary
// percentile lookup.
export function buildAwardPool(players, seasons) {
  const strengths = [], defenses = [], scorings = [];
  for (const pl of players) {
    if (!pl.q) continue;
    strengths.push(playerStrength(pl, seasons));
    const z = categoryZ(pl, seasons);
    defenses.push(z.defense);
    scorings.push(z.scoring);
  }
  const asc = (a, b) => a - b;
  strengths.sort(asc); defenses.sort(asc); scorings.sort(asc);
  return { strengths, defenses, scorings };
}

// Fraction of the pool strictly below `v` (0..1). 0.995 ⇒ top 0.5%.
function percentile(sorted, v) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  return sorted.length ? lo / sorted.length : 0;
}

// FINAL FOUR MVP — only if you win the title, and it is NOT guaranteed to be the GOAT. Each of your
// five earns an "F4 impact" = how far he out-classes the opponent at HIS slot, summed over the semi
// and the final. Weak-centre opponents ⇒ your all-timer centre dominates ⇒ he can steal the award
// from a guard GOAT. Uses the opponent fives postseason.js attaches to each round.
function finalFourMVP(goat, five, post, seasons) {
  const rounds = post.rounds || [];
  const semi = rounds.find((r) => /semi/i.test(r.name || ""));
  const final = rounds.find((r) => r.name === "Final");
  const games = [semi, final].filter((r) => r && r.five);
  const impact = five.map((pl, idx) => {
    let imp = 0;
    for (const g of games) { const opp = g.five[idx]; imp += playerStrength(pl, seasons) - (opp ? playerStrength(opp, seasons) : 0); }
    return { pl, imp };
  }).sort((a, b) => b.imp - a.imp);
  const winner = impact[0].pl;
  return { winner: winner.playerName, isGoat: !!winner.goat };
}

// Compute the GOAT's hardware from his percentile ranks + the team's result. Deterministic.
export function computeAwards(goat, five, seasons, res, post, pool) {
  const gz = categoryZ(goat, seasons);
  const pOverall = percentile(pool.strengths, playerStrength(goat, seasons));
  const pDefense = percentile(pool.defenses, gz.defense);
  const pScoring = percentile(pool.scorings, gz.scoring);
  const wins = res.wins;
  const madePlayoffs = wins >= 24;   // top-6, straight into the playoffs
  const madePlayin = wins >= 20;     // reached the play-in or better
  const topTwoSeed = wins >= 32;     // 1st/2nd seed

  // Order matters — this is the reveal sequence: All-EuroLeague → Best Defender → Top Scorer → MVP.
  const awards = [];
  if (pOverall >= 0.97 && madePlayoffs) awards.push({ id: "all-euroleague", label: "All-EuroLeague First Team" });
  if (pDefense >= 0.99 && madePlayin) awards.push({ id: "dpoy", label: "Best Defender" });
  if (pScoring >= 0.99 && madePlayin) awards.push({ id: "topscorer", label: "Top Scorer" });
  if (pOverall >= 0.995 && topTwoSeed) awards.push({ id: "mvp", label: "Regular Season MVP" });
  let f4 = null;
  if (post.stage === "champion") {
    f4 = finalFourMVP(goat, five, post, seasons);
    if (f4.isGoat) awards.push({ id: "f4mvp", label: "Final Four MVP" });
  }
  const goatSeason = res.wins === 38 && post.stage === "champion" &&
    awards.some((a) => a.id === "mvp") && awards.some((a) => a.id === "f4mvp");
  return { awards, finalFourMVP: f4, percentiles: { overall: pOverall, defense: pDefense, scoring: pScoring }, goatSeason };
}

/* ---------------- per-round box line (playoff games) ---------------- */

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

// The GOAT's statline for a bracket round, reproducible from the roster + round name.
//   `series` true  → a best-of-five (the Playoffs round): these are AVERAGES over 3–5 games, so a
//                    one-decimal line reads right (15.6, not a fake-exact 15).
//   `series` false → a SINGLE game (play-in, semifinal, final): whole-number counting stats.
// TS% stays a percentage in both cases.
export function goatGameLine(goat, roundKey, rosterSig, series = false) {
  const rng = mulberry32(hash(rosterSig + "|" + roundKey));
  const j = series
    ? (v, frac) => Math.max(0, +(v * (1 + (rng() * 2 - 1) * frac)).toFixed(1))
    : (v, frac) => Math.max(0, Math.round(v * (1 + (rng() * 2 - 1) * frac)));
  const b = goat.box;
  return {
    pts: j(b.pts, 0.22), reb: j(b.reb, 0.3), ast: j(b.ast, 0.3),
    stl: j(b.stl, 0.55), blk: j(b.blk, 0.55), ts: Math.min(0.99, +(b.ts * (1 + (rng() * 2 - 1) * 0.12)).toFixed(2)),
  };
}
