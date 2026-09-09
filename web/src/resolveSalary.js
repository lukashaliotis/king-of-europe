// Authoritative Salary-cap ALL-TIME resolver + scoring. Salary is Classic with a twist: every player
// (and the coach) has a price, the whole build must fit under the cap, and one starter is the captain
// (free, ×2 impact). The server rebuilds the exact players, RE-VALIDATES the cap, applies the captain,
// re-runs the engine for the authoritative record, and scores it — the client submits choices, never a
// number, so neither the score nor an over-cap build can be forged.
//
// SCORING: the shared Classic score (100/win + bracket) PLUS an efficiency bonus of 50 points per
// unspent €1M (half a win), so a title won cheaply outranks the same title bought to the cap, without
// letting budget-hoarding overtake winning.
//
// ISOMORPHIC: runs unchanged in the browser and in a Cloudflare Worker — pure game logic only.
import { buildClubSeasons } from "./data.js";
import { projectRecord, GAMES } from "./engine.js";
import { runPostseason, classicScore } from "./postseason.js";
import { arenaFor, arenaKey } from "./arenas.js";
import { eligibleCoaches, coachDeltas, coachCost } from "./coaches.js";
import { SALARY_CAP, playerCost } from "./salary.js";

// Each unspent €1M is worth UP TO this many points, SCALED BY WIN RATE (wins/38). Flat unspent points
// are exploitable — a legal five can be fielded for ~€30M, so hoarding €60-70M with a scrub team would
// top the board. Scaling by win rate ties efficiency to actually winning: a bad cheap team banks almost
// nothing, an efficient contender banks a lot, and you can't max both (winning needs pricey players).
export const UNSPENT_PTS = 50;
export const efficiencyBonus = (unspent, wins) => Math.round(unspent * UNSPENT_PTS * (wins / GAMES));
const fail = (error) => ({ ok: false, error });

function findPlayer(pools, teamCode, seasonLabel, code) {
  const pool = pools.find((p) => p.teamCode === teamCode && p.seasonLabel === seasonLabel);
  if (!pool) return null;
  const pl = pool.players.find((p) => p.playerCode === code);
  if (!pl) return null;
  return { ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } };
}

/**
 * @param submission { starters:[{code,teamCode,seasonLabel}], sixth:{...}|null, coach:code|null,
 *                     arenaSlot:0-4|null, captain:code }
 * @returns { ok:true, wins, losses, stage, label, score, unspent } or { ok:false, error }
 */
export function resolveSalaryAllTime(data, submission) {
  const pools = buildClubSeasons(data);
  const { starters: sIn, sixth: sixthIn, coach: coachCode, arenaSlot, captain: captainIn } = submission || {};

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

  // Captain: mandatory, must be one of the five, free (his cost is not charged), ×2 impact.
  if (!captainIn || typeof captainIn !== "string") return fail("a captain is required");
  const captain = starters.find((s) => s.playerCode === captainIn);
  if (!captain) return fail("the captain must be one of your five starters");

  // Coach — must have coached at least one of the five (Salary: also a PAID hire).
  let catDeltas = null, coachName = null, coachPrice = 0;
  if (coachCode) {
    const entry = eligibleCoaches(all, data).find((e) => e.coach.code === coachCode);
    if (!entry) return fail("that coach managed none of your five");
    catDeltas = coachDeltas(entry);
    coachName = entry.coach.name;
    coachPrice = coachCost(entry.coach);
  }

  // RE-VALIDATE THE CAP (anti-cheat): five + sixth + coach must fit; the captain is free.
  const playersSpent = starters.reduce((a, s) => a + playerCost(s, data.seasons), 0) + (sixth ? playerCost(sixth, data.seasons) : 0);
  const spent = playersSpent + coachPrice;
  if (spent > SALARY_CAP) return fail("build exceeds the salary cap");
  const unspent = Math.max(0, SALARY_CAP - spent);

  // Arena — take the submitted home slot (must be one of the five's own clubs), share-scaled like live.
  let arenaMult = 1, arenaName = null;
  if (typeof arenaSlot === "number" && arenaSlot >= 0 && arenaSlot < 5) {
    const home = starters[arenaSlot];
    const base = arenaFor(home._src.teamCode, home.season);
    const homeKey = arenaKey(home._src.teamCode, home.season);
    const homeCount = starters.filter((x) => arenaKey(x._src.teamCode, x.season) === homeKey).length;
    arenaMult = 1 + (base.mult - 1) * (homeCount / 5);
    arenaName = base.name;
  }

  const res = projectRecord(starters, data.seasons, undefined, arenaMult, catDeltas, sixth, captain.playerCode);
  const post = runPostseason(starters, data.seasons, pools, res.wins, sixth); // bracket ignores the captain, matching live
  const score = classicScore(res.wins, post) + efficiencyBonus(unspent, res.wins);
  return {
    ok: true,
    wins: res.wins, losses: res.losses,
    stage: post.stage, label: post.label,
    score, unspent,
    arena: arenaName, coach: coachName,
  };
}
