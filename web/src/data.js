// Data loading, club-season pools, and the weighted spin.
// The game loop: each spin yields ONE (club, single season); the player picks one player from
// its roster, then spins again for the next slot. Five spins build the five.
import { playerStrength, CATEGORIES } from "./engine.js";

const MIN_ROSTER = 5; // you pick ONE player per spin, so 5 gives a real choice (adds Zadar 2001)

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
