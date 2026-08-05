// Authoritative Dynasty resolver — the anti-cheat core for the streak leaderboards. Given a run's
// SEED, its starting five (player code + season), the home arena, and the per-round recruit choices,
// it reconstructs the players and re-simulates the whole gauntlet with the exact same seeded logic the
// browser ran. The streak it returns is the one the seeded games actually produce — the client can
// submit choices, never a number — so an inflated streak can't be forged.
//
// ISOMORPHIC: runs unchanged in the browser (self-check) and in a Cloudflare Worker (authoritative).
import { buildClubSeasons } from "./data.js";
import { arenaFor } from "./arenas.js";
import { replayDynastyRun } from "./dynasty.js";

export const dynastyPools = (data) => buildClubSeasons(data);

// (playerCode, season) -> the reconstructed player row, wrapped with its club-year source. A player
// plays one club per season, so the pair is unique.
function playerIndex(pools) {
  const idx = new Map();
  for (const pool of pools) {
    for (const p of pool.players) {
      idx.set(p.playerCode + ":" + p.season, { ...p, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } });
    }
  }
  return idx;
}

/**
 * @param submission { seed:number, startFive:[{code,season}]×5, arena:{teamCode,season}|null,
 *                     choices:[{inn,out}] }
 * @returns { ok:true, streak } | { ok:false, error }
 */
export function resolveDynasty(data, submission, pools = null) {
  const { seed, startFive, arena, choices } = submission || {};
  if (typeof seed !== "number" || !Number.isFinite(seed)) return { ok: false, error: "missing seed" };
  if (!Array.isArray(startFive) || startFive.length !== 5) return { ok: false, error: "a starting five is required" };
  if (choices != null && !Array.isArray(choices)) return { ok: false, error: "malformed choices" };

  pools = pools || buildClubSeasons(data);
  const idx = playerIndex(pools);
  const five = [];
  for (const s of startFive) {
    const pl = s && idx.get(s.code + ":" + s.season);
    if (!pl) return { ok: false, error: "unknown player " + (s && s.code) };
    five.push(pl);
  }

  let mult = 1;
  if (arena && arena.teamCode) mult = arenaFor(arena.teamCode, arena.season).mult;

  return replayDynastyRun(pools, data.seasons, { seed, five, arena: { mult }, choices: choices || [] });
}
