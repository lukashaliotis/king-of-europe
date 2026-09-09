// Daily G.O.A.T. — a deterministic, shared build-a-superplayer puzzle seeded by the UTC date. Every
// player worldwide gets the SAME fixed home club + five fixed donor clubs on a given day, so results
// are directly comparable. The home club is guaranteed solid (a winnability floor) since it is four
// of your five slots; the puzzle is which base to take and which stat to graft from each donor.
//
// ISOMORPHIC: no DOM / no localStorage below the persistence section — the board builder runs
// unchanged in the browser and in the Cloudflare Worker resolver, so the two can never disagree.
import { spin } from "./data.js";
import { projectRecord, playerStrength, DEFAULT_PARAMS } from "./engine.js";
import { mulberry32, hashSeed } from "./daily.js";
import { classicScore } from "./postseason.js";

// Separate seed namespace from Daily classic ("KOE-") so the two modes draw independent boards.
export function goatDaySeed(dayKey) {
  return hashSeed("KOEG-" + dayKey);
}

const ROLES = ["G", "G", "F", "F", "C"];

// The club's own best legal starting five (2G/2F/1C by player strength), or null if it can't field
// one. Used only to gauge home-club quality for the winnability floor.
function bestLegalFive(pool, seasons) {
  const need = { G: 2, F: 2, C: 1 };
  const byPos = { G: [], F: [], C: [] };
  for (const p of pool.players) if (byPos[p.pos]) byPos[p.pos].push(p);
  const five = [];
  for (const pos of ["G", "F", "C"]) {
    byPos[pos].sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons));
    if (byPos[pos].length < need[pos]) return null;
    for (let i = 0; i < need[pos]; i++) five.push(byPos[pos][i]);
  }
  return five;
}

// A home club is "solid" when its OWN best five already projects to at least HOME_FLOOR_EW expected
// wins. Conservative on purpose: it ignores the G.O.A.T. boost (swapping the weakest starter for a
// maxed mythical player only helps), so clearing this floor guarantees the day is winnable with the
// right grafts. CALIBRATED in sim/goat_daily_calib.mjs (120-day sweep): 14 is the knee — optimal play
// reaches the playoffs ~95% of days (winnable) while the title/38-0/GOAT-season stay real achievements
// (greedy champion 40%, 38-0 7.5%, GOAT season 3.3%; typical play never 38-0). Higher floors inflate
// the apex (GOAT season 8–12% at 16–19); lower floors leave some days unwinnable even played perfectly.
export const HOME_FLOOR_EW = 14;
function homeExpectedWins(pool, seasons) {
  const five = bestLegalFive(pool, seasons);
  if (!five) return -Infinity;
  return projectRecord(five, seasons).expectedWins;
}
export const canFieldFive = (pool) => !!bestLegalFive(pool, { });

// Build today's fixed board: a solid home club + five distinct donor clubs. Deterministic from the
// seed (one continuous rng stream), so the browser and the server resolver land on the identical
// board. `seasons` enables the home winnability floor; omit it only for quick structural tests.
// `scenario` (Scenario Daily G.O.A.T.) pins the home club to a hand-authored club-season instead of
// spinning it; the donors still spin from the seed. Both the client and the resolver pass the same
// scenario (a pure function of the date), so the fixed home can never be forged.
export function buildGoatDailyBoard(pools, seed, seasons = null, scenario = null) {
  const rng = mulberry32(seed);
  const used = new Set();
  // HOME — a scenario pins it to a fixed club-season; otherwise spin until a club can field a five AND
  // clears the winnability floor (tracking the strongest seen as a fallback for a rare weak-pool day).
  let home = null;
  if (scenario) home = pools.find((p) => p.teamCode === scenario.home.code && p.season === scenario.home.season) || null;
  if (!home) {
    let bestHome = null, bestEW = -Infinity;
    for (let i = 0; i < 400 && !home; i++) {
      const p = spin(pools, rng);
      if (p.legend || !bestLegalFive(p, seasons || {})) continue; // no Legends slot as the fixed home cast
      const ew = seasons ? homeExpectedWins(p, seasons) : Infinity;
      if (ew >= HOME_FLOOR_EW) home = p;
      else if (ew > bestEW) { bestEW = ew; bestHome = p; }
    }
    home = home || bestHome;
  }
  used.add(home.id);
  // DONORS — five distinct clubs (distinct from home). Legends can appear as a donor (a rare golden
  // graft source), matching free G.O.A.T. where any spun club can be a donor.
  const donors = [];
  for (let i = 0; i < 800 && donors.length < 5; i++) {
    const p = spin(pools, rng);
    if (used.has(p.id)) continue;
    used.add(p.id);
    donors.push(p);
  }
  return { home, donors, scenario: scenario || null };
}

/* ---------------- score + persistence ---------------- */

// Postseason depth, worst → best. Kept for callers that still want a depth ordinal.
export const STAGE_RANK = {
  relegation: 0, rebuild: 1, almost: 2, playin: 3, playoffs: 4, finalfour: 5, lostfinal: 6, champion: 7,
};

// G.O.A.T. bonuses layered ON TOP of the shared Classic score (see classicScore in postseason.js).
export const GOAT_AWARD_PTS = 250;   // per individual award (MVP, Best Defender, Final Four MVP)
export const GOAT_SEASON_BONUS = 500; // the full G.O.A.T. season (38-0 + title + every award)

// The single sortable number the leaderboard ranks on. Same additive mindset as Classic — 100 per
// regular-season win, the bracket paid per game (+100 won / −100 lost) with the Final Four margins —
// then G.O.A.T.-only hardware: +100 per award, +500 for the full G.O.A.T. season.
export function goatScore({ wins, post, awardCount, goatSeason }) {
  return classicScore(wins, post)
    + (awardCount || 0) * GOAT_AWARD_PTS
    + (goatSeason ? GOAT_SEASON_BONUS : 0);
}

// A one-line share/summary string for a finished daily build.
export function goatDailyShareText({ dayKey, wins, losses, label, goatSeason }) {
  const pretty = new Date(dayKey + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `⭐ King of Europe - Daily G.O.A.T.\n${pretty} · ${wins}–${losses} · ${label}` +
    (goatSeason ? `\n👑 THE G.O.A.T. SEASON` : "") +
    `\nhttps://king-of-europe.pages.dev`;
}

const KEY = (dayKey) => "koe-goatdaily-" + dayKey;

export function loadGoatDaily(dayKey) {
  try { return JSON.parse(localStorage.getItem(KEY(dayKey)) || "null"); } catch (e) { return null; }
}
export function saveGoatDaily(result, dayKey) {
  try { localStorage.setItem(KEY(dayKey), JSON.stringify(result)); } catch (e) { /* ignore */ }
}
