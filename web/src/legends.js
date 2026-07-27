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

// name, pos, [pts, reb, ast, stl, blk, ts%, tov]  (per game, prime, European play — ESTIMATED)
const RAW = [
  ["PETROVIC, DRAZEN", "G", 28, 4, 5, 2.0, 0.1, 0.62, 2.5],
  ["GALIS, NIKOS", "G", 30, 4, 4, 2.0, 0.1, 0.58, 2.8],
  ["DJORDJEVIC, ALEKSANDAR", "G", 17, 3, 7, 1.5, 0.1, 0.61, 2.5],
  ["MARCIULIONIS, SARUNAS", "G", 22, 4, 5, 2.0, 0.1, 0.60, 2.8],
  ["GIANNAKIS, PANAGIOTIS", "G", 19, 3, 6, 1.6, 0.1, 0.57, 2.5],
  ["KUKOC, TONI", "F", 20, 8, 7, 1.6, 0.5, 0.60, 2.8],
  ["BODIROGA, DEJAN", "F", 19, 6, 5, 1.3, 0.3, 0.58, 2.5],
  ["RADJA, DINO", "F", 22, 10, 2, 1.0, 1.5, 0.59, 2.3],
  ["SAN EPIFANIO, JUAN ANTONIO", "F", 18, 5, 4, 1.2, 0.4, 0.59, 2.0],
  ["SABONIS, ARVYDAS", "C", 22, 13, 5, 1.0, 2.0, 0.60, 3.0],
  ["DIVAC, VLADE", "C", 16, 11, 3, 1.0, 2.0, 0.57, 2.5],
  ["SAVIC, ZORAN", "C", 15, 8, 2, 0.8, 1.5, 0.58, 2.0],
];

function makeLegend([name, pos, pts, reb, ast, stl, blk, ts, tov]) {
  const surname = name.split(",")[0].replace(/[^A-Z]/gi, "");
  return {
    season: BASE_SEASON,
    playerCode: "LEG_" + surname,
    playerName: name,
    teamCode: "LEG",
    teamName: "European Legends",
    gp: 20, mpg: 32, pos, q: true, legend: true,
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

export const LEGENDS_CHANCE = 0.03; // ~1 in 33 main spins draws the Legends
