// Does the Daily winnability floor over-represent all-time-great club-seasons in the board?
// Compare, over a year of daily seeds: (a) RAW boards (single draw, no floor) vs (b) FLOORED boards
// (buildDailyBoard, re-seeds until the optimal five clears ~31 wins). Measure how often a top-ranked
// "great" club-season appears, and how hard the floor bites.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { buildDailyBoard, dailySeed, utcDayKey } from "../web/src/daily.js";
import { legendsPool, LEGENDS_CHANCE } from "../web/src/legends.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const LEG = legendsPool();

// Rank every fieldable club-season by best-five S — the "greatness" ranking.
const SLOT_POS = ["G", "G", "F", "F", "C"];
function bestFive(pool) {
  const slots = [null, null, null, null, null];
  for (const p of pool.players) {
    const i = SLOT_POS.findIndex((pos, idx) => pos === p.pos && !slots[idx]);
    if (i >= 0) slots[i] = p;
    if (slots.every(Boolean)) break;
  }
  return slots.every(Boolean) ? slots : null;
}
const ranked = pools
  .map((pool) => ({ pool, five: bestFive(pool) }))
  .filter((x) => x.five)
  .map((x) => ({ id: x.pool.id, S: projectRecord(x.five, seasons).S }))
  .sort((a, b) => b.S - a.S);
const rankOf = new Map(ranked.map((r, i) => [r.id, i + 1])); // id -> 1-based greatness rank
const N_FIELDABLE = ranked.length;

const TOPK = [12, 30, 60]; // "great" thresholds to report

// A raw single-draw board (floor OFF) uses buildDailyBoard with seasons=null.
function rawBoard(seed) { return buildDailyBoard(pools, LEG, LEGENDS_CHANCE, seed, 6, null); }
// A floored board (Daily as shipped) passes seasons.
function flooredBoard(seed) { return buildDailyBoard(pools, LEG, LEGENDS_CHANCE, seed, 6, seasons); }

function summarize(label, boards) {
  const days = boards.length;
  const counts = TOPK.map(() => 0);        // days with >=1 great in that tier
  const totals = TOPK.map(() => 0);        // total greats across all boards in that tier
  let bestRankSum = 0, legendDays = 0;
  const rankBuckets = {};                    // best (min) rank per board, histogram
  for (const board of boards) {
    let bestRank = Infinity, hasLegend = false;
    const tierHit = TOPK.map(() => false);
    for (const pool of board) {
      if (pool.id === LEG.id) { hasLegend = true; continue; }
      const rk = rankOf.get(pool.id);
      if (rk == null) continue;
      if (rk < bestRank) bestRank = rk;
      TOPK.forEach((k, ti) => { if (rk <= k) { tierHit[ti] = true; totals[ti]++; } });
    }
    tierHit.forEach((hit, ti) => { if (hit) counts[ti]++; });
    if (hasLegend) legendDays++;
    if (bestRank !== Infinity) { bestRankSum += bestRank; const b = bestRank <= 5 ? "1-5" : bestRank <= 12 ? "6-12" : bestRank <= 30 ? "13-30" : bestRank <= 60 ? "31-60" : "61+"; rankBuckets[b] = (rankBuckets[b] || 0) + 1; }
  }
  console.log(`\n=== ${label} (${days} days, ${N_FIELDABLE} fieldable club-seasons) ===`);
  TOPK.forEach((k, ti) => {
    console.log(`  top-${String(k).padEnd(3)} appears on ${(100 * counts[ti] / days).toFixed(1).padStart(5)}% of boards   (avg ${(totals[ti] / days).toFixed(2)} per board)`);
  });
  console.log(`  avg BEST (strongest) team's greatness rank per board: ${(bestRankSum / days).toFixed(1)}`);
  console.log(`  strongest-team-on-board rank histogram:`, rankBuckets);
  console.log(`  legends on board: ${(100 * legendDays / days).toFixed(1)}% of days`);
}

// A year of real daily seeds starting today.
const DAYS = 365;
const seeds = [];
const start = new Date(utcDayKey() + "T00:00:00Z").getTime();
for (let i = 0; i < DAYS; i++) {
  const dk = new Date(start + i * 86400000).toISOString().slice(0, 10);
  seeds.push(dailySeed(dk));
}
summarize("RAW boards (winnability floor OFF)", seeds.map(rawBoard));
summarize("FLOORED boards (shipped Daily)", seeds.map(flooredBoard));

// How hard does the floor bite? fraction of RAW boards that already clear the floor.
import { DEFAULT_PARAMS } from "../web/src/engine.js";
const FLOOR_WINS = 31;
const p = DEFAULT_PARAMS, pGame = FLOOR_WINS / 38;
const FLOOR_S = p.leagueS + Math.log(pGame / (1 - pGame)) / p.gameSteep;
function optS(board) {
  // strongest legal five across the board (mirror of daily.js optimalFiveStrength, simplified)
  const bestByPos = board.map((pool) => { const b = { G: null, F: null, C: null }; for (const pl of pool.players) { const s = playerStrength(pl, seasons); if (!b[pl.pos] || s > playerStrength(b[pl.pos], seasons)) b[pl.pos] = pl; } return b; });
  let best = -Infinity;
  for (let bench = 0; bench < board.length; bench++) {
    const idx = []; for (let i = 0; i < board.length; i++) if (i !== bench) idx.push(i);
    const perm = (chosen, roles, rem) => {
      if (!roles.length) { const five = chosen.map(([pi, r]) => bestByPos[pi][r]); if (five.every(Boolean)) { const S = projectRecord(five, seasons).S; if (S > best) best = S; } return; }
      const role = roles[0];
      for (let j = 0; j < rem.length; j++) { const pi = rem[j]; if (!bestByPos[pi][role]) continue; perm([...chosen, [pi, role]], roles.slice(1), rem.filter((_, k) => k !== j)); }
    };
    perm([], SLOT_POS, idx);
  }
  return best;
}
let cleared = 0;
for (const seed of seeds) { if (optS(rawBoard(seed)) >= FLOOR_S) cleared++; }
console.log(`\nFLOOR bite: FLOOR_S=${FLOOR_S.toFixed(2)} (=${FLOOR_WINS} wins). RAW boards that ALREADY clear it: ${(100 * cleared / DAYS).toFixed(1)}% → the floor re-seeds the other ${(100 * (1 - cleared / DAYS)).toFixed(1)}%.`);
