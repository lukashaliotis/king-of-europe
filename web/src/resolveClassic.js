// Authoritative Classic ALL-TIME resolver + scoring. Classic is free play (no seeded board), so a
// submission carries the full roster (each pick's club-season + code), the chosen coach, and the won
// arena. The server rebuilds those exact players from the dataset and re-runs the same engine to get
// the AUTHORITATIVE record + score — the client submits choices, never a number, so a score can't be
// forged. (An arena the player didn't actually spin is a bounded ±~4.5% edge and must still be one of
// their own five's clubs; acceptable for a friends board.)
//
// ISOMORPHIC: runs unchanged in the browser and in a Cloudflare Worker — pure game logic only.
import { buildClubSeasons } from "./data.js";
import { projectRecord } from "./engine.js";
import { runPostseason, classicScore } from "./postseason.js";
import { arenaFor, arenaKey } from "./arenas.js";
import { eligibleCoaches, coachDeltas } from "./coaches.js";

export { classicScore }; // re-export: some callers import the scorer from the Classic resolver

const fail = (error) => ({ ok: false, error });

// Rebuild the exact player the client drafted: found by club-season (teamCode + seasonLabel) + code,
// stamped with the club-year source the game uses for the arena + display.
function findPlayer(pools, teamCode, seasonLabel, code) {
  const pool = pools.find((p) => p.teamCode === teamCode && p.seasonLabel === seasonLabel);
  if (!pool) return null;
  const pl = pool.players.find((p) => p.playerCode === code);
  if (!pl) return null;
  return { ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } };
}

/**
 * @param submission { starters:[{code,teamCode,seasonLabel}] (court order), sixth:{...}|null,
 *                     coach:code|null, arenaSlot:0-4|null }
 * @returns { ok:true, wins, losses, stage, label, score } or { ok:false, error }
 */
export function resolveClassicAllTime(data, submission) {
  const pools = buildClubSeasons(data);
  const { starters: sIn, sixth: sixthIn, coach: coachCode, arenaSlot } = submission || {};

  if (!Array.isArray(sIn) || sIn.length !== 5) return fail("need exactly five starters");
  const starters = [];
  for (const p of sIn) {
    const pl = p && findPlayer(pools, p.teamCode, p.seasonLabel, p.code);
    if (!pl) return fail("a starter was not found");
    starters.push(pl);
  }
  const pos = starters.reduce((m, s) => ((m[s.pos] = (m[s.pos] || 0) + 1), m), {});
  if (pos.G !== 2 || pos.F !== 2 || pos.C !== 1) return fail("illegal position mix for a starting five");

  let sixth = null;
  if (sixthIn) { sixth = findPlayer(pools, sixthIn.teamCode, sixthIn.seasonLabel, sixthIn.code); if (!sixth) return fail("sixth man was not found"); }

  const all = [...starters, ...(sixth ? [sixth] : [])];
  if (new Set(all.map((s) => s.playerCode)).size !== all.length) return fail("the same player was used twice");

  // Arena (Classic spins it randomly, so it can't be reseeded) — take the submitted home slot, but it
  // must be one of the five's own clubs. Share-scaled exactly like the live game.
  let arenaMult = 1, arenaName = null;
  if (typeof arenaSlot === "number" && arenaSlot >= 0 && arenaSlot < 5) {
    const home = starters[arenaSlot];
    const base = arenaFor(home._src.teamCode, home.season);
    // Share-scaled by BUILDING (same club + same arena-era), matching the live game's arenaInfoFor.
    const homeKey = arenaKey(home._src.teamCode, home.season);
    const homeCount = starters.filter((x) => arenaKey(x._src.teamCode, x.season) === homeKey).length;
    arenaMult = 1 + (base.mult - 1) * (homeCount / 5);
    arenaName = base.name;
  }

  // Coach — must have coached at least one of the five.
  let catDeltas = null, coachName = null;
  if (coachCode) {
    const entry = eligibleCoaches(all, data).find((e) => e.coach.code === coachCode);
    if (!entry) return fail("that coach managed none of your five");
    catDeltas = coachDeltas(entry);
    coachName = entry.coach.name;
  }

  const res = projectRecord(starters, data.seasons, undefined, arenaMult, catDeltas, sixth);
  const post = runPostseason(starters, data.seasons, pools, res.wins, sixth);
  return {
    ok: true,
    wins: res.wins, losses: res.losses,
    stage: post.stage, label: post.label,
    score: classicScore(res.wins, post),
    arena: arenaName, coach: coachName,
  };
}
