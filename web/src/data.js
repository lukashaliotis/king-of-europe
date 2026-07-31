// Data loading, club-season pools, and the weighted spin.
// The game loop: each spin yields ONE (club, single season); the player picks one player from
// its roster, then spins again for the next slot. Five spins build the five.
import { playerStrength, CATEGORIES } from "./engine.js";

const MIN_ROSTER = 5; // you pick ONE player per spin, so 5 gives a real choice (adds Zadar 2001)

// CAREER-MODAL POSITION. The roster API labels a player's position per club-season, and it
// disagrees with itself for tweeners: Othello Hunter is tagged F at Olympiacos but C at his six
// other clubs, so a season shows "only one center". We collapse each player to ONE position for
// the whole game: the position he played the most (weighted by games played, so a full season
// outvotes a cameo), ties broken toward his most-recent season. This is a display+eligibility fix
// AND it feeds the position-relative z-scoring, so a career center is finally judged against
// centers everywhere. Idempotent: the raw per-season tag is stashed in `posRaw` on first pass.
export function applyCareerPositions(data) {
  const votes = new Map(); // playerCode -> { pos: gpWeight }
  const recent = new Map(); // playerCode -> { season, pos } of latest row
  for (const pl of data.players) {
    if (pl.posRaw === undefined) pl.posRaw = pl.pos; // stash once, stay idempotent
    const raw = pl.posRaw;
    if (!votes.has(pl.playerCode)) votes.set(pl.playerCode, {});
    const v = votes.get(pl.playerCode);
    v[raw] = (v[raw] || 0) + Math.max(1, pl.gp || 0);
    const r = recent.get(pl.playerCode);
    if (!r || pl.season > r.season) recent.set(pl.playerCode, { season: pl.season, pos: raw });
  }
  const modal = new Map();
  for (const [code, v] of votes) {
    let best = null, bestW = -1;
    for (const pos of Object.keys(v)) {
      if (v[pos] > bestW) { bestW = v[pos]; best = pos; }
    }
    // tie-break: if the most-recent season's position is within the leaders, prefer it
    const tied = Object.keys(v).filter((pos) => v[pos] === bestW);
    if (tied.length > 1) best = tied.includes(recent.get(code).pos) ? recent.get(code).pos : best;
    modal.set(code, best);
  }
  for (const pl of data.players) pl.pos = modal.get(pl.playerCode);
  return data;
}

export async function loadData() {
  // Resolve relative to THIS module (web/src/data.js), not the page, so it works whether the
  // app is served from the repo root (production static deploy) or the dev server.
  const url = new URL("../../data/players.json", import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load players.json: ${res.status}`);
  return res.json();
}

// Group players into (club, season) pools. Skip junk teamCodes (mid-season-transfer rows the
// API concatenates with ";") and pools too small to draft from.
export function buildClubSeasons(data) {
  applyCareerPositions(data); // collapse tweeners to one career position before pooling
  const byId = new Map();
  for (const pl of data.players) {
    if (!pl.teamCode || pl.teamCode.includes(";")) continue;
    const id = `${pl.teamCode}|${pl.season}`;
    if (!byId.has(id)) {
      byId.set(id, {
        id, teamCode: pl.teamCode, teamName: pl.teamName,
        season: pl.season, seasonLabel: data.seasons[String(pl.season)].label,
        players: [],
      });
    }
    byId.get(id).players.push(pl);
  }

  const pools = [];
  for (const pool of byId.values()) {
    if (pool.players.length < MIN_ROSTER) continue;
    // sort roster strongest-first so the best options surface
    pool.players.sort((a, b) => playerStrength(b, data.seasons) - playerStrength(a, data.seasons));
    const top5 = pool.players.slice(0, 5).reduce((a, p) => a + Math.max(0, playerStrength(p, data.seasons)), 0);
    pool.ceiling = top5;
    // SQRT weighting: still leans toward stronger clubs (recognizable teams show up a bit more)
    // but far gentler than linear, so mid- and small-tier club-years stay in regular rotation.
    // (Linear made elite club-seasons ~2x over-represented and the game noticeably easier; the
    // difficulty this removes is restored in the win-curve calibration, not by re-skewing the spin.)
    pool.weight = Math.max(0.7, Math.sqrt(top5));
    pools.push(pool);
  }
  return pools;
}

export function spin(pools, rng = Math.random) {
  const total = pools.reduce((a, p) => a + p.weight, 0);
  let r = rng() * total;
  for (const pool of pools) {
    r -= pool.weight;
    if (r <= 0) return pool;
  }
  return pools[pools.length - 1];
}

export { CATEGORIES };
