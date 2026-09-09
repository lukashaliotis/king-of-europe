// Authoritative Daily resolver — the anti-cheat core. Given a UTC day and a player's CHOICES
// (which of the six draws each pick came from, which player, which coach), it re-derives the
// day's board and re-runs the exact same engine the browser ran, producing the authoritative
// record. The client can only submit choices; the server computes the score, so an inflated
// result can't be forged.
//
// ISOMORPHIC: this file runs unchanged in the browser and in a Cloudflare Worker. It pulls only
// pure game logic (no DOM, no localStorage) — the same modules the client uses, so the numbers
// can never drift from what the player saw.
import { buildClubSeasons } from "./data.js";
import { projectRecord } from "./engine.js";
import { runPostseason } from "./postseason.js";
import { arenaFor, arenaKey } from "./arenas.js";
import { eligibleCoaches, coachDeltas } from "./coaches.js";
import { legendsPool, LEGENDS_CHANCE } from "./legends.js";
import { mulberry32, hashSeed, dailySeed, buildDailyBoard, rosterSignature } from "./daily.js";
import { dailyThemeFor, rulesetOf, buildThemedDailyBoard, bossFor } from "./dailytheme.js";

const LEGENDS = legendsPool();

export function dailyPools(data) {
  return buildClubSeasons(data);
}
// Reproduce the exact board the client built — one shared isomorphic builder, so the anti-cheat can
// never diverge (themed pool filter, ruleset floor, Legends-Boss board all live in one place).
export function dailyBoard(pools, dayKey, seasons) {
  return buildThemedDailyBoard(pools, dayKey, seasons);
}

const fail = (error) => ({ ok: false, error });

// Rebuild the exact slot object the client held: the player record from the draw's roster,
// wrapped with the club-year source the game stamps on placement.
function reconstruct(pool, code) {
  if (!pool) return null;
  const pl = pool.players.find((p) => p.playerCode === code);
  if (!pl) return null;
  return { ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } };
}

/**
 * @param submission { starters:[{slot,code}] (court order, PG,SG,SF,PF,C), sixth:{slot,code}, coach:code|null }
 * @returns { ok:true, wins, losses, stage, label, gateCategory, categoryScores, arena, coach }
 *          or { ok:false, error }
 */
export function resolveDaily(data, dayKey, submission) {
  const pools = dailyPools(data);
  const board = dailyBoard(pools, dayKey, data.seasons);
  const { starters: sIn, sixth: sixthIn, coach: coachCode } = submission || {};

  if (!Array.isArray(sIn) || sIn.length !== 5) return fail("need exactly five starters");
  if (!sixthIn || typeof sixthIn.slot !== "number") return fail("need a sixth man");

  // Every pick must reference a real draw, and the six picks must use each of the six draws once.
  const all = [...sIn, sixthIn];
  if (all.some((p) => !p || typeof p.slot !== "number" || p.slot < 0 || p.slot >= board.length))
    return fail("a pick references a draw that doesn't exist");
  const slotsUsed = all.map((p) => p.slot).sort((a, b) => a - b).join(",");
  if (slotsUsed !== board.map((_, i) => i).join(",")) return fail("picks must use each draw exactly once");

  const starters = [];
  for (const p of sIn) {
    const slot = reconstruct(board[p.slot], p.code);
    if (!slot) return fail(`player ${p.code} was not in draw ${p.slot}`);
    starters.push(slot);
  }
  const sixth = reconstruct(board[sixthIn.slot], sixthIn.code);
  if (!sixth) return fail("sixth man was not in its draw");

  // No human twice, and a legal starting five for THIS board's ruleset (2G/2F/1C normally; five
  // guards on a rare Guard-Gauntlet day). The ruleset is a pure function of the date, so the check
  // matches the client's slots exactly.
  const codes = [...starters, sixth].map((s) => s.playerCode);
  if (new Set(codes).size !== 6) return fail("the same player was used twice");
  const ruleset = rulesetOf(dailyThemeFor(dayKey));
  const need = {}; ruleset.roles.forEach((r) => { need[r] = (need[r] || 0) + 1; });
  const pos = starters.reduce((m, s) => ((m[s.pos] = (m[s.pos] || 0) + 1), m), {});
  if (Object.keys(need).some((k) => (pos[k] || 0) !== need[k]) || Object.keys(pos).some((k) => !need[k]))
    return fail("illegal position mix for this board");
  // Single-position days: the bench player must match too (else a smuggled off-position player covers
  // the gate). The role-count check above already constrains the starting five.
  if (ruleset.soloPos && sixth.pos !== ruleset.soloPos)
    return fail(`the sixth man must be a ${({ G: "guard", F: "forward", C: "center" })[ruleset.soloPos]} on this board`);

  // Home arena — daily is SEEDED (not chosen): reproduce the EXACT weighted spin, share-scaled.
  // Dedup + weight + share by BUILDING (arena-era), mirroring the client's arenaChoices/arenaInfoFor
  // — same starter order, so the seeded target + mult match bit-for-bit.
  const firstIdx = new Map();
  starters.forEach((s, i) => { const k = arenaKey(s._src.teamCode, s.season); if (!firstIdx.has(k)) firstIdx.set(k, i); });
  const weighted = [];
  for (const i of firstIdx.values()) {
    const key = arenaKey(starters[i]._src.teamCode, starters[i].season);
    const n = starters.filter((x) => arenaKey(x._src.teamCode, x.season) === key).length;
    for (let k = 0; k < n; k++) weighted.push(i);
  }
  const rand = mulberry32(dailySeed(dayKey) ^ hashSeed(rosterSignature(starters)))();
  const target = weighted[(rand * weighted.length) | 0];
  const homeKey = arenaKey(starters[target]._src.teamCode, starters[target].season);
  const base = arenaFor(starters[target]._src.teamCode, starters[target].season);
  const homeCount = starters.filter((x) => arenaKey(x._src.teamCode, x.season) === homeKey).length;
  const arenaMult = 1 + (base.mult - 1) * (homeCount / 5);

  // Coach — the one genuine choice. Must have coached at least one of the five.
  let catDeltas = null, coachName = null;
  if (coachCode) {
    const entry = eligibleCoaches([...starters, sixth].filter(Boolean), data).find((e) => e.coach.code === coachCode);
    if (!entry) return fail("that coach managed none of your five");
    catDeltas = coachDeltas(entry);
    coachName = entry.coach.name;
  }

  const res = projectRecord(starters, data.seasons, undefined, arenaMult, catDeltas, sixth);
  const post = runPostseason(starters, data.seasons, pools, res.wins, sixth, bossFor(dailyThemeFor(dayKey)));
  return {
    ok: true,
    wins: res.wins, losses: res.losses,
    stage: post.stage, label: post.label,
    gateCategory: res.gateCategory, categoryScores: res.categoryScores,
    arena: base.name, coach: coachName,
  };
}
