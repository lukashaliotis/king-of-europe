// Authoritative Dynasty resolver — the anti-cheat core for the streak leaderboards. Given a run's
// SEED, its starting five (player code + season), the home arena, and the per-round recruit choices,
// it reconstructs the players and re-simulates the whole gauntlet with the exact same seeded logic the
// browser ran. The streak it returns is the one the seeded games actually produce — the client can
// submit choices, never a number — so an inflated streak can't be forged.
//
// ISOMORPHIC: runs unchanged in the browser (self-check) and in a Cloudflare Worker (authoritative).
import { buildClubSeasons } from "./data.js";
import { arenaFor } from "./arenas.js";
import { replayDynastyRun, buildDynastyBoard, dynastyWeekSeed } from "./dynasty.js";

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
  const { board, seed, startFive, arena, choices } = submission || {};
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

  // The home arena must be one of the five's own clubs (it's spun from them).
  if (arena && arena.teamCode && !five.some((p) => p._src.teamCode === arena.teamCode)) {
    return { ok: false, error: "arena isn't one of your five's clubs" };
  }

  // Weekly runs must use the week's real seed AND a five drafted from the week's fixed board — this is
  // what makes the weekly board fair (no seed-shopping, no off-board super-fives).
  if (board && board !== "alltime") {
    const expected = dynastyWeekSeed(board) >>> 0;
    if (((Number(seed)) >>> 0) !== expected) return { ok: false, error: "wrong seed for this week" };
    const draws = buildDynastyBoard(pools, expected);
    const usedDraw = new Set();
    for (const s of startFive) {
      let hit = -1;
      for (let j = 0; j < draws.length; j++) {
        if (usedDraw.has(j)) continue;
        if (draws[j].season === s.season && draws[j].players.some((p) => p.playerCode === s.code)) { hit = j; break; }
      }
      if (hit < 0) return { ok: false, error: "a starter isn't from this week's board" };
      usedDraw.add(hit);
    }
  }

  let mult = 1;
  if (arena && arena.teamCode) mult = arenaFor(arena.teamCode, arena.season).mult;

  return replayDynastyRun(pools, data.seasons, { seed, five, arena: { mult }, choices: choices || [] });
}
