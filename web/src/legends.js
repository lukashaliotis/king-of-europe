// European Legends — the rare "nugget" pool of pre-2002 icons.
//
// DATA CAVEAT: the API only reaches 2000-01, so these players have NO real stats in our source
// (and none exists in structured form anywhere we found). These per-game lines are ESTIMATES of
// each player's European-competition prime — hand-curated, not sourced. They're deliberately
// elite so the Legends spin is a genuine power-up. To stay comparable to the rest of the game,
// each legend is z-scored against a real season's per-position baseline (BASE_SEASON).
//
// If real pre-2000 European stats ever surface, replace the estimates here.

const BASE_SEASON = 2012; // real season whose per-position baseline we z-score the legends against

// name, pos, [pts, reb, ast, stl, blk, ts%, tov, mpg]  (per game, prime, European play — ESTIMATED)
// Each legend is a light-touch SPECIALIST — best-in-class at one category so the golden pick patches
// a specific need (see docs/DECISIONS.md). Verified pool-neutral vs the old all-rounder lines
// (total strength 114.6 → 115.3, peak legends-five 37.8 → 37.9 exp wins — no recalibration needed).
// Minutes are varied (30–36 by stature) so legends no longer clump together in the MIN sort.
const RAW = [
  ["PETROVIC, DRAZEN", "G", 27, 3, 4, 1.5, 0.1, 0.64, 2.2, 36], // efficiency
  ["GALIS, NIKOS", "G", 31, 4, 3, 1.6, 0.1, 0.55, 3.0, 36], // scoring (volume, low eff)
  ["DJORDJEVIC, ALEKSANDAR", "G", 16, 3, 8, 1.3, 0.1, 0.62, 2.3, 33], // playmaking
  ["MARCIULIONIS, SARUNAS", "G", 21, 4, 5, 2.6, 0.3, 0.58, 2.8, 33], // defense (steals)
  ["GIANNAKIS, PANAGIOTIS", "G", 14, 5, 7, 2.0, 0.2, 0.56, 2.6, 32], // rebounding (pass-first)
  ["KUKOC, TONI", "F", 19, 7, 7, 1.5, 0.5, 0.60, 2.6, 34], // playmaking (point-forward)
  ["BODIROGA, DEJAN", "F", 19, 5, 5, 1.3, 0.3, 0.63, 2.2, 32], // efficiency
  ["RADJA, DINO", "F", 21, 11, 2, 1.0, 1.6, 0.58, 2.3, 33], // rebounding
  ["SAN EPIFANIO, JUAN ANTONIO", "F", 23, 5, 3, 1.2, 0.4, 0.60, 1.9, 31], // scoring
  ["SABONIS, ARVYDAS", "C", 22, 12, 5, 1.0, 1.8, 0.60, 3.0, 34], // scoring + playmaking
  ["DIVAC, VLADE", "C", 13, 13, 3, 1.2, 2.5, 0.55, 2.5, 33], // defense + rebounding
  ["SAVIC, ZORAN", "C", 16, 8, 2, 0.7, 1.2, 0.64, 1.8, 30], // efficiency (post)
];

function makeLegend([name, pos, pts, reb, ast, stl, blk, ts, tov, mpg]) {
  const surname = name.split(",")[0].replace(/[^A-Z]/gi, "");
  return {
    season: BASE_SEASON,
    playerCode: "LEG_" + surname,
    playerName: name,
    teamCode: "LEG",
    teamName: "European Legends",
    gp: 20, mpg, pos, q: true, legend: true,
    cat: { scoring: pts, rebounding: reb, playmaking: ast - tov, defense: stl + blk, efficiency: ts },
    box: { pts, reb, ast, stl, blk, ts, fga: +(pts * 0.72).toFixed(1) },
    pir: Math.round(pts + reb + ast + stl + blk),
  };
}

// The Legends pool, shaped like a normal (club, season) pool so the game treats it uniformly.
// season = -1 is a sentinel (not a real season) so the ↻ Club / ↻ Year re-spins don't match it.
export function legendsPool() {
  const players = RAW.map(makeLegend).sort((a, b) => b.pir - a.pir);
  return {
    id: "LEG|legends", teamCode: "LEG", teamName: "European Legends",
    season: -1, seasonLabel: "All-Time", players, legend: true,
    ceiling: 999, weight: 0,
  };
}

// Per SPIN, not per game — and a Classic run takes six spins, so this compounds:
// 1 - (1-p)^6. At the old 0.03 that was ~17% of games (1 in 6), far too common for a "nugget".
// 0.0085 => ~5% of games, about 1 in 20.
export const LEGENDS_CHANCE = 0.0085;
