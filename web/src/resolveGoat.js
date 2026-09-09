// Authoritative Daily G.O.A.T. resolver — the anti-cheat core. Given a UTC day and a player's CHOICES
// (base player + five grafts, each a donor + stat), it re-derives the day's fixed board and re-runs
// the exact same engine the browser ran, producing the authoritative record + score. The client can
// only submit choices; the server computes the result, so an inflated score can't be forged.
//
// ISOMORPHIC: runs unchanged in the browser and in a Cloudflare Worker — pure game logic only.
import { buildClubSeasons } from "./data.js";
import { projectRecord } from "./engine.js";
import { runPostseason } from "./postseason.js";
import { buildGoat, goatFive, buildAwardPool, computeAwards, GRAFT_STATS } from "./goat.js";
import { goatDaySeed, buildGoatDailyBoard, goatScore } from "./dailygoat.js";
import { goatScenarioFor } from "./goatscenarios.js";

const fail = (error) => ({ ok: false, error });

// The award pool (real-player percentile distributions) is a pure function of the dataset — build it
// once and cache, so repeated submissions in a warm Worker isolate don't recompute 5k players.
let AWARD_POOL = null, AWARD_POOL_FOR = null;
function awardPoolFor(data) {
  if (AWARD_POOL && AWARD_POOL_FOR === data) return AWARD_POOL;
  AWARD_POOL = buildAwardPool(data.players, data.seasons); AWARD_POOL_FOR = data;
  return AWARD_POOL;
}

// Rebuild the exact player record the client held, stamped with its club-year source.
function reconstruct(pool, code) {
  if (!pool) return null;
  const pl = pool.players.find((p) => p.playerCode === code);
  if (!pl) return null;
  return { ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } };
}

/**
 * @param submission { base:{code}, grafts:[{slot,stat,code}] }  (slot = donor index 0..4)
 * @returns { ok:true, wins, losses, stage, label, awards:[label], goatSeason, score } or { ok:false, error }
 */
export function resolveGoatDaily(data, dayKey, submission) {
  const pools = buildClubSeasons(data);
  const scenario = goatScenarioFor(dayKey);
  const board = buildGoatDailyBoard(pools, goatDaySeed(dayKey), data.seasons, scenario);
  const { base: baseIn, grafts: graftsIn } = submission || {};

  if (!baseIn || typeof baseIn.code !== "string") return fail("missing base player");
  // Icon scenarios LOCK the base to one legend, or to a CURATED SET (a "pick your legend" scenario);
  // reject any base outside that set.
  if (scenario && scenario.base) {
    const allowed = scenario.base.pick || [scenario.base.code];
    if (!allowed.includes(baseIn.code)) return fail("this scenario locks the base player");
  }
  const base = reconstruct(board.home, baseIn.code);
  if (!base) return fail("base player was not in the home club");

  if (!Array.isArray(graftsIn) || graftsIn.length !== 5) return fail("need exactly five grafts");
  // Each graft uses a distinct donor draw (0..4); the donor code must be real. Stats may REPEAT — a
  // player may re-take a stat (later grafts overwrite earlier ones, as buildGoat replays them in order).
  const slotsSeen = new Set();
  const grafts = [];
  for (const g of graftsIn) {
    if (!g || typeof g.slot !== "number" || g.slot < 0 || g.slot >= board.donors.length)
      return fail("a graft references a donor that doesn't exist");
    if (slotsSeen.has(g.slot)) return fail("a donor draw was used twice");
    if (!GRAFT_STATS.includes(g.stat)) return fail("unknown graft stat");
    const donor = reconstruct(board.donors[g.slot], g.code);
    if (!donor) return fail(`donor ${g.code} was not in draw ${g.slot}`);
    slotsSeen.add(g.slot);
    grafts.push({ stat: g.stat, donor });
  }

  const goat = buildGoat(base, grafts, data.seasons); // seasons ⇒ freak cap applied
  const five = goatFive(goat, board.home, data.seasons);
  if (!five) return fail("the home club can't field a legal five around this base");

  const res = projectRecord(five, data.seasons, undefined, 1, scenario ? scenario.homeLift || null : null);
  const post = runPostseason(five, data.seasons, pools, res.wins, null, 0, scenario ? scenario.path : null);
  const aw = computeAwards(goat, five, data.seasons, res, post, awardPoolFor(data));
  const score = goatScore({ wins: res.wins, post, awardCount: aw.awards.length, goatSeason: aw.goatSeason });
  return {
    ok: true,
    wins: res.wins, losses: res.losses,
    stage: post.stage, label: post.label,
    awards: aw.awards.map((a) => a.label), goatSeason: aw.goatSeason,
    score,
  };
}
