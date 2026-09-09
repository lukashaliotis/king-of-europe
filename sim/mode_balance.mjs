// One balance snapshot across every mode, with the FULL build (five + 6th man + coach + arena).
// The older harnesses (softtune, retune2) measure the bare five, which understates every mode the
// player actually plays: the coach alone is worth ~5 expected wins. Two drafters, as elsewhere:
//   CASUAL — chases points (what a first-timer does)
//   SKILLED — picks the pick that maximises S at each step (what a good player converges on)
// Run: node sim/mode_balance.mjs [N]
import { readFileSync } from "node:fs";
import { projectRecord, DEFAULT_PARAMS, mulberry32, gameProbability } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { arenaFor, arenaKey, ratingToMult } from "../web/src/arenas.js";
import { buildCoachProfiles, eligibleCoaches, coachDeltas } from "../web/src/coaches.js";
import { playerCost, SALARY_CAP, FLOOR, canAfford } from "../web/src/salary.js";
import { coachCost, COACH_FLOOR_PRICE } from "../web/src/coaches.js";
import { DYN, poolBestFive, drawFloor } from "../web/src/dynasty.js";

const data = JSON.parse(readFileSync(new URL("../data/players.json", import.meta.url), "utf-8"));
const pools = buildClubSeasons(data);
buildCoachProfiles(data);
const SLOT = ["G", "G", "F", "F", "C"];
const N = Number(process.argv[2] || 1500);
const stamp = (p, pool) => ({ ...p, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } });
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };

// ---- drafters -------------------------------------------------------------------------------
function draft(rng, mode, budgetCap) {
  const slots = [null, null, null, null, null]; const used = new Set();
  const open = (pos) => SLOT.findIndex((p, i) => p === pos && !slots[i]);
  let picks = 0, guard = 0, spent = 0;
  while (picks < 5 && guard++ < 120) {
    const pool = spin(pools, rng);
    const here = slots.filter(Boolean);
    let best = null, bk = -Infinity;
    for (const c of pool.players) {
      if (used.has(c.playerCode) || open(c.pos) < 0) continue;
      // the live rule: 5 + 6th + a MANDATORY priced coach all come out of the cap; the captain is free
      if (budgetCap) { const price = playerCost(c, data.seasons); if (!canAfford(spent, price, (5 - picks - 1) + 1, budgetCap - COACH_FLOOR_PRICE)) continue; }
      const k = mode === "casual" ? c.cat.scoring + c.cat.efficiency * 0.3
                                  : projectRecord([...here, c], data.seasons).S;
      if (k > bk) { bk = k; best = { c, i: open(c.pos), pool }; }
    }
    if (!best) continue;
    slots[best.i] = stamp(best.c, best.pool); used.add(best.c.playerCode);
    if (budgetCap) spent += playerCost(best.c, data.seasons);
    picks++;
  }
  const five = slots.filter(Boolean);
  if (five.length !== 5) return null;
  // 6th man + coach + arena, the way the live game offers them
  let sixth = null;
  for (let t = 0; t < 20 && !sixth; t++) {
    const pool = spin(pools, rng);
    const c = pool.players.find((x) => !used.has(x.playerCode) && (!budgetCap || canAfford(spent, playerCost(x, data.seasons), 1, budgetCap)));
    if (c) { sixth = stamp(c, pool); if (budgetCap) spent += playerCost(c, data.seasons); }
  }
  const elig = eligibleCoaches([...five, sixth].filter(Boolean), data) || [];
  // skilled play picks the coach that lifts the weakest category; casual takes the first offered
  let coach = elig[0] || null;
  if (mode !== "casual" && elig.length) {
    let bs = -Infinity;
    for (const e of elig) { const r = projectRecord(five, data.seasons, undefined, 1, coachDeltas(e), sixth); if (r.S > bs) { bs = r.S; coach = e; } }
  }
  // home arena: best-rated building among the five (share-scaled, as the live game does)
  let mult = 1;
  for (const s of five) {
    const base = arenaFor(s._src.teamCode, s.season);
    const key = arenaKey(s._src.teamCode, s.season);
    const share = five.filter((x) => arenaKey(x._src.teamCode, x.season) === key).length / 5;
    const m = 1 + (base.mult - 1) * share;
    if (m > mult) mult = m;
  }
  if (budgetCap && coach) spent += coachCost(coach.coach);
  // Salary's captain is FREE and doubles his category contribution, so skilled play always names one:
  // the starter whose doubling lifts S most.
  let captain = null;
  if (budgetCap) {
    let bs = -Infinity;
    for (const p of five) {
      const r = projectRecord(five, data.seasons, undefined, mult, coach ? coachDeltas(coach) : null, sixth, p.playerCode);
      if (r.S > bs) { bs = r.S; captain = p.playerCode; }
    }
  }
  return { five, sixth, coach, mult, spent, captain };
}

function season(b) {
  return projectRecord(b.five, data.seasons, undefined, b.mult, b.coach ? coachDeltas(b.coach) : null, b.sixth, b.captain || null);
}

// ---- Classic / Salary -----------------------------------------------------------------------
function runMode(label, mode, cap, seed) {
  const rng = mulberry32(seed);
  const wins = [], spends = []; const stages = {};
  let n = 0, zero = 0, perfect = 0;
  for (let i = 0; i < N; i++) {
    const b = draft(rng, mode, cap); if (!b) continue;
    const r = season(b); n++; wins.push(r.wins); if (cap) spends.push(b.spent);
    if (r.wins === 0) zero++; if (r.wins === 38) perfect++;
    const post = runPostseason(b.five, data.seasons, pools, r.wins, b.sixth, 0);
    stages[post.stage] = (stages[post.stage] || 0) + 1;
  }
  const champ = ((stages.champion || 0) / n * 100).toFixed(1);
  const ff = (((stages.finalfour || 0) + (stages.lostfinal || 0) + (stages.champion || 0)) / n * 100).toFixed(1);
  console.log(`  ${label.padEnd(16)} p10 ${String(q(wins,0.1)).padStart(2)}  med ${String(q(wins,0.5)).padStart(2)}  p90 ${String(q(wins,0.9)).padStart(2)}  ` +
    `| 0-38 ${(100*zero/n).toFixed(1)}%  38-0 ${(100*perfect/n).toFixed(2)}%  | F4 ${ff}%  title ${champ}%` +
    (cap ? `  | spend ${q(spends,0.5)}/${cap}` : ""));
}

console.log(`N=${N} builds per cell — five + 6th man + coach + home arena\n`);
console.log("CLASSIC");
runMode("casual", "casual", null, 4242);
runMode("skilled", "skilled", null, 4242);
console.log("\nSALARY (cap €100M)");
runMode("casual", "casual", SALARY_CAP, 909);
runMode("skilled", "skilled", SALARY_CAP, 909);

// ---- Dynasty: how far does a run get? --------------------------------------------------------
console.log("\nDYNASTY — rounds survived");
for (const mode of ["casual", "skilled"]) {
  const rng = mulberry32(31); const runs = [];
  for (let i = 0; i < Math.min(N, 400); i++) {
    const b = draft(rng, mode, null); if (!b) continue;
    let S = projectRecord(b.five, data.seasons, undefined, 1, b.coach ? coachDeltas(b.coach) : null, b.sixth).S;
    let round = 1;
    for (; round <= 40; round++) {
      // opponent: a real club's best five at/above the rising draw floor, plus the escalation handicap
      let opp = null;
      for (let t = 0; t < DYN.drawAttempts && !opp; t++) {
        const pool = pools[Math.floor(rng() * pools.length)];
        const pb = poolBestFive(pool, data.seasons);
        if (pb && pb.S >= drawFloor(pools, data.seasons, round)) opp = pb;
      }
      if (!opp) break;
      if (!(rng() < gameProbability(S, opp.S + DYN.esc * (round - 1)))) break;
    }
    runs.push(round - 1);
  }
  console.log(`  ${mode.padEnd(16)} med ${String(q(runs,0.5)).padStart(2)}  p75 ${String(q(runs,0.75)).padStart(2)}  p90 ${String(q(runs,0.9)).padStart(2)}  p95 ${String(q(runs,0.95)).padStart(2)}  max ${Math.max(...runs)}`);
}

// ---- Versus: is the duel a fair read of the two teams? ---------------------------------------
console.log("\nVERSUS — best-of-7, how often the stronger five wins");
{
  const rng = mulberry32(77); const bands = {};
  for (let i = 0; i < 600; i++) {
    const a = draft(rng, "skilled", null), b = draft(rng, rng() < 0.5 ? "casual" : "skilled", null);
    if (!a || !b) continue;
    const sa = season(a).S, sb = season(b).S;
    const p = gameProbability(sa, sb);
    // best-of-7 win probability at per-game p
    let bo7 = 0;
    for (let k = 4; k <= 7; k++) { let c = 1; for (let j = 0; j < k - 4; j++) c = c * (3 + j + 1) / (j + 1); bo7 += c * Math.pow(p, 4) * Math.pow(1 - p, k - 4); }
    const gap = Math.abs(sa - sb);
    const band = gap < 2 ? "S gap < 2" : gap < 5 ? "S gap 2-5" : gap < 10 ? "S gap 5-10" : "S gap 10+";
    (bands[band] = bands[band] || []).push(sa > sb ? bo7 : 1 - bo7);
  }
  for (const k of ["S gap < 2", "S gap 2-5", "S gap 5-10", "S gap 10+"]) {
    if (!bands[k]) continue;
    const m = bands[k].reduce((x, y) => x + y, 0) / bands[k].length;
    console.log(`  ${k.padEnd(12)} stronger side wins the series ${(100*m).toFixed(0)}%  (n=${bands[k].length})`);
  }
}
