// Daily G.O.A.T. verification + calibration.
//   1) the board is deterministic (same day → same board);
//   2) the isomorphic resolver reproduces the direct-sim result from choices alone (anti-cheat);
//   3) sweeps HOME_FLOOR_EW to pick a floor that keeps the day winnable under good play.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { buildGoat, goatFive, buildAwardPool, computeAwards, GRAFT_STATS } from "../web/src/goat.js";
import { buildGoatDailyBoard, goatDaySeed, goatScore, HOME_FLOOR_EW } from "../web/src/dailygoat.js";
import { resolveGoatDaily } from "../web/src/resolveGoat.js";
import { goatScenarioFor } from "../web/src/goatscenarios.js"; // scenario days have their own calib (goat_scenario_calib.mjs)

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const awardPool = buildAwardPool(data.players, seasons);

const dayKeys = [];
for (let i = 0; i < 120; i++) dayKeys.push(new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10));

const raw = (p, s) => (s === "ts" ? p.box.ts : (s === "ast" ? p.cat.playmaking : p.box[s] ?? 0));
const bestSpecialist = (club, s) => [...club.players].sort((a, b) => raw(b, s) - raw(a, s))[0];

// Greedy daily player: base = home's weakest that still fields a five (keeps the strongest cast);
// then assign one stat to each donor to maximize expectedWins (one stat is left at base).
function playGreedy(board) {
  const cand = [...board.home.players].sort((a, b) => playerStrength(a, seasons) - playerStrength(b, seasons));
  let base = null;
  for (const b of cand) if (goatFive(buildGoat(b, [], seasons), board.home, seasons)) { base = b; break; }
  if (!base) return null;
  const grafts = [];
  const openStats = new Set(GRAFT_STATS);
  for (let d = 0; d < board.donors.length; d++) {
    let best = null;
    for (const s of openStats) {
      const spec = bestSpecialist(board.donors[d], s);
      const trial = [...grafts, { stat: s, donor: spec }];
      const g = buildGoat(base, trial, seasons);
      const five = goatFive(g, board.home, seasons);
      if (!five) continue;
      const ew = projectRecord(five, seasons).expectedWins;
      if (!best || ew > best.ew) best = { stat: s, donor: spec, ew };
    }
    if (best) { grafts.push({ stat: best.stat, donor: best.donor, slot: d }); openStats.delete(best.stat); }
  }
  return { base, grafts };
}

function scoreOf(board, base, grafts) {
  const goat = buildGoat(base, grafts, seasons);
  const five = goatFive(goat, board.home, seasons);
  const res = projectRecord(five, seasons);
  const post = runPostseason(five, seasons, pools, res.wins);
  const aw = computeAwards(goat, five, seasons, res, post, awardPool);
  return { wins: res.wins, stage: post.stage, awards: aw.awards, goatSeason: aw.goatSeason,
    score: goatScore({ wins: res.wins, post, awardCount: aw.awards.length, goatSeason: aw.goatSeason }) };
}

// ---- 1) determinism ----
let detOk = true;
for (const dk of dayKeys.slice(0, 20)) {
  const a = buildGoatDailyBoard(pools, goatDaySeed(dk), seasons);
  const b = buildGoatDailyBoard(pools, goatDaySeed(dk), seasons);
  const sig = (bd) => bd.home.id + "|" + bd.donors.map((d) => d.id).join(",");
  if (sig(a) !== sig(b)) { detOk = false; console.log("NON-DETERMINISTIC:", dk); }
}
console.log(`determinism: ${detOk ? "OK" : "FAIL"} (20 days ×2)`);

// ---- 2) resolver == direct sim (anti-cheat), over all days played greedily ----
let matchOk = 0, matchFail = 0;
const pct = (x, n) => `${((100 * x) / n).toFixed(1)}%`;
const winsArr = [], stageCount = {}; let perfect = 0, goatSeason = 0, playoffs = 0, champ = 0;
let homeBelowFloor = 0;
for (const dk of dayKeys) {
  if (goatScenarioFor(dk)) continue; // this sim covers the PROCEDURAL board; scenario days are calibrated separately
  const board = buildGoatDailyBoard(pools, goatDaySeed(dk), seasons);
  const homeEW = projectRecord(bestFive(board.home), seasons).expectedWins;
  if (homeEW < HOME_FLOOR_EW) homeBelowFloor++;
  const play = playGreedy(board);
  if (!play) { console.log("no legal build:", dk); continue; }
  const direct = scoreOf(board, play.base, play.grafts);
  winsArr.push(direct.wins);
  stageCount[direct.stage] = (stageCount[direct.stage] || 0) + 1;
  if (direct.wins === 38) perfect++;
  if (direct.goatSeason) goatSeason++;
  if (["playoffs", "finalfour", "lostfinal", "champion"].includes(direct.stage)) playoffs++;
  if (direct.stage === "champion") champ++;
  const submission = { base: { code: play.base.playerCode },
    grafts: play.grafts.map((g) => ({ slot: g.slot, stat: g.stat, code: g.donor.playerCode })) };
  const r = resolveGoatDaily(data, dk, submission);
  if (r.ok && r.wins === direct.wins && r.score === direct.score) matchOk++;
  else { matchFail++; if (matchFail <= 3) console.log("MISMATCH", dk, { direct: { wins: direct.wins, score: direct.score }, resolver: r }); }
}
function bestFive(pool) {
  const need = { G: 2, F: 2, C: 1 }, by = { G: [], F: [], C: [] };
  for (const p of pool.players) if (by[p.pos]) by[p.pos].push(p);
  const five = [];
  for (const pos of ["G", "F", "C"]) { by[pos].sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons)); for (let i = 0; i < need[pos]; i++) five.push(by[pos][i]); }
  return five;
}
console.log(`resolver == direct sim: ${matchOk}/${matchOk + matchFail} match ${matchFail ? "❌ FAIL" : "✓"}`);

// ---- 3) winnability under greedy play (current HOME_FLOOR_EW) ----
winsArr.sort((a, b) => a - b);
const mean = (winsArr.reduce((a, b) => a + b, 0) / winsArr.length).toFixed(1);
console.log(`\nGREEDY daily play over ${winsArr.length} days (HOME_FLOOR_EW=${HOME_FLOOR_EW}):`);
console.log(`  wins: mean ${mean}  median ${winsArr[winsArr.length >> 1]}  min ${winsArr[0]}  max ${winsArr[winsArr.length - 1]}`);
console.log(`  reached playoffs: ${pct(playoffs, winsArr.length)}   champion: ${pct(champ, winsArr.length)}   38-0: ${pct(perfect, winsArr.length)}   GOAT season: ${pct(goatSeason, winsArr.length)}`);
console.log(`  home below floor (fallback used): ${homeBelowFloor}/${dayKeys.length}`);
console.log(`  stages: ` + Object.entries(stageCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, winsArr.length)}`).join("  "));

// Typical player: base = home's median-strength eligible player; each donor → its best OVERALL
// player's biggest raw upgrade (no lookahead). Represents a normal, non-optimising player.
function playTypical(board) {
  const elig = [...board.home.players].sort((a, b) => playerStrength(a, seasons) - playerStrength(b, seasons))
    .filter((b) => goatFive(buildGoat(b, [], seasons), board.home, seasons));
  if (!elig.length) return null;
  const base = elig[Math.floor(elig.length / 2)];
  const grafts = [], open = new Set(GRAFT_STATS);
  for (let d = 0; d < board.donors.length; d++) {
    const donor = [...board.donors[d].players].sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons))[0];
    const cur = buildGoat(base, grafts, seasons);
    let stat = [...open].map((s) => ({ s, gain: raw(donor, s) - raw(cur, s) })).sort((a, b) => b.gain - a.gain)[0].s;
    grafts.push({ stat, donor, slot: d }); open.delete(stat);
  }
  return { base, grafts };
}

// ---- 4) floor sweep: full outcome spread (greedy ceiling + typical), to pick the floor ----
console.log(`\nHOME_FLOOR_EW sweep over ${dayKeys.length} days  [G=greedy ceiling, T=typical]:`);
for (const floor of [8, 10, 12, 14, 16, 19]) {
  const acc = { G: { po: 0, ch: 0, pf: 0, gs: 0, w: 0 }, T: { po: 0, ch: 0, pf: 0, gs: 0, w: 0 } };
  let n = 0, fallback = 0;
  for (const dk of dayKeys) {
    const board = buildGoatDailyBoardFloor(pools, goatDaySeed(dk), seasons, floor);
    if (projectRecord(bestFive(board.home), seasons).expectedWins < floor) fallback++;
    for (const [k, fn] of [["G", playGreedy], ["T", playTypical]]) {
      const play = fn(board); if (!play) continue;
      const d = scoreOf(board, play.base, play.grafts); const a = acc[k]; a.w += d.wins;
      if (["playoffs", "finalfour", "lostfinal", "champion"].includes(d.stage)) a.po++;
      if (d.stage === "champion") a.ch++;
      if (d.wins === 38) a.pf++;
      if (d.goatSeason) a.gs++;
    }
    n++;
  }
  const row = (a) => `mean ${(a.w / n).toFixed(0)}  po ${pct(a.po, n)}  champ ${pct(a.ch, n)}  38-0 ${pct(a.pf, n)}  GOATszn ${pct(a.gs, n)}`;
  console.log(`  floor ${String(floor).padStart(2)}  G[ ${row(acc.G)} ]`);
  console.log(`             T[ ${row(acc.T)} ]  fallback-days ${fallback}`);
}

// A floor-parameterised copy of buildGoatDailyBoard for the sweep (mirrors the module exactly).
function buildGoatDailyBoardFloor(pools, seed, seasons, floor) {
  const rng = mulberry32(seed);
  const used = new Set();
  let home = null, bestHome = null, bestEW = -Infinity;
  for (let i = 0; i < 400 && !home; i++) {
    const p = spin(pools, rng);
    if (p.legend || !canField(p)) continue;
    const ew = projectRecord(bestFive(p), seasons).expectedWins;
    if (ew >= floor) home = p; else if (ew > bestEW) { bestEW = ew; bestHome = p; }
  }
  home = home || bestHome; used.add(home.id);
  const donors = [];
  for (let i = 0; i < 800 && donors.length < 5; i++) { const p = spin(pools, rng); if (used.has(p.id)) continue; used.add(p.id); donors.push(p); }
  return { home, donors };
}
function canField(pool) { const need = { G: 2, F: 2, C: 1 }; for (const p of pool.players) if (need[p.pos] > 0) need[p.pos]--; return need.G <= 0 && need.F <= 0 && need.C <= 0; }
import { spin } from "../web/src/data.js";
import { mulberry32 } from "../web/src/daily.js";
