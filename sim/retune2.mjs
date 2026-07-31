// Recalibration after the Tier-1 model changes (usage-weighted rates, usage collision,
// soft-min gate) and coach pedigree. Sweeps the win curve AGAINST the new levers: collisionK
// punishes the greedy optimiser (which stacks talent) harder than it punishes a typical five,
// so it can pull the 38-0 rate down without crushing the median the way winMid alone did.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { eligibleCoaches, coachDeltas } from "../web/src/coaches.js";
import { arenaFor } from "../web/src/arenas.js";
import { legendsPool, LEGENDS_CHANCE } from "../web/src/legends.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const LEG = legendsPool();
const SLOT_POS = ["G", "G", "F", "F", "C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const spinOnce = (rng) => (rng() < LEGENDS_CHANCE ? LEG : spin(pools, rng));

function arenaMultFor(starters, rng) {
  const clubs = [...new Set(starters.map((s) => s.teamCode))];
  const weighted = [];
  for (const c of clubs) {
    const n = starters.filter((s) => s.teamCode === c).length;
    for (let k = 0; k < n; k++) weighted.push(c);
  }
  const club = weighted[(rng() * weighted.length) | 0];
  const player = starters.find((s) => s.teamCode === club);
  const base = arenaFor(club, player.season).mult;
  return 1 + (base - 1) * (starters.filter((s) => s.teamCode === club).length / 5);
}
function bestCoachDeltas(starters, params) {
  const five = starters.map((s) => ({ ...s, _src: { teamCode: s.teamCode } }));
  let best = null, bestW = -1;
  for (const e of eligibleCoaches(five, data)) {
    const d = coachDeltas(e);
    const w = projectRecord(five, data.seasons, params, 1, d).wins;
    if (w > bestW) { bestW = w; best = d; }
  }
  return best;
}

function playFull(rng, params) {
  const slots = [null, null, null, null, null];
  let sixth = null;
  const used = new Set();
  const openPos = (pos) => SLOT_POS.findIndex((p, i) => p === pos && !slots[i]);
  let picks = 0, guard = 0;
  while (picks < 6 && guard++ < 60) {
    const pool = spinOnce(rng);
    const starters = slots.filter(Boolean);
    let best = null, bestKey = -Infinity;
    for (const cand of pool.players) {
      if (used.has(cand.playerCode)) continue;
      const pi = openPos(cand.pos);
      if (pi >= 0) {
        const res = projectRecord([...starters, cand], data.seasons, params, 1, null, sixth);
        const key = res.S; // S is smooth; wins is now a seeded draw, so don't greedy on it
        if (key > bestKey) { bestKey = key; best = { cand, type: "pos", pi }; }
      }
      if (!sixth) {
        const res = projectRecord(starters, data.seasons, params, 1, null, cand);
        const key = res.S - 0.01;
        if (key > bestKey) { bestKey = key; best = { cand, type: "bench" }; }
      }
    }
    if (!best) continue;
    if (best.type === "pos") slots[best.pi] = best.cand; else sixth = best.cand;
    used.add(best.cand.playerCode);
    picks++;
  }
  const starters = slots.filter(Boolean);
  if (starters.length < 5) return null;
  const arenaMult = arenaMultFor(starters, rng);
  const coach = bestCoachDeltas(starters, params);
  return projectRecord(starters, data.seasons, params, arenaMult, coach, sixth).wins;
}

function run(params, N, seed) {
  const rng = mulberry32(seed);
  const wins = [];
  let perfect = 0;
  for (let i = 0; i < N; i++) {
    const w = playFull(rng, params);
    if (w === null) continue;
    wins.push(w); if (w === 38) perfect++;
  }
  wins.sort((a, b) => a - b);
  const q = (p) => wins[Math.floor(p * (wins.length - 1))];
  return { perfect: 100 * perfect / wins.length, median: q(0.5), p75: q(0.75), p90: q(0.9) };
}

// base roster only (no arena/coach/6th) — the SPEC's "roster gets you to 36-2" check
function runBase(params, N, seed) {
  const rng = mulberry32(seed); let p = 0; const w = [];
  for (let i = 0; i < N; i++) {
    const slots = [null,null,null,null,null]; const used = new Set();
    const openPos = (pos) => SLOT_POS.findIndex((q, i) => q === pos && !slots[i]);
    let picks = 0, g = 0;
    while (picks < 5 && g++ < 60) {
      const pool = spin(pools, rng); const st = slots.filter(Boolean);
      let best = null, bk = -Infinity;
      for (const c of pool.players) { if (used.has(c.playerCode)) continue; const pi = openPos(c.pos); if (pi < 0) continue;
        const r = projectRecord([...st, c], data.seasons, params); const k = r.S; if (k > bk) { bk = k; best = { c, pi }; } }
      if (!best) continue; slots[best.pi] = best.c; used.add(best.c.playerCode); picks++;
    }
    const st = slots.filter(Boolean); if (st.length < 5) continue;
    const wins = projectRecord(st, data.seasons, params).wins; w.push(wins); if (wins === 38) p++;
  }
  w.sort((a,b)=>a-b);
  return { perfect: 100*p/w.length, p90: w[Math.floor(0.9*(w.length-1))], max: w[w.length-1] };
}

const N = Number(process.argv[2] || 1200);
console.log(`playthroughs per row: ${N}\n`);
console.log(`leagueS steep | FULL 38-0%  med  p75  p90 | BASE 38-0%  p90  max`);
for (const usageBudget of [1.55]) {
  for (const collisionK of [3.2]) {
    for (const [leagueS, gameSteep] of [[18, 0.23]]) {
      const softMinBeta = 1.2;
      const params = { collisionK, softMinBeta, leagueS, gameSteep, usageBudget };
      const r = run(params, N, 12345);
      const b = runBase(params, N, 777);
      console.log(
        ` ${String(leagueS).padStart(2)}    ${gameSteep.toFixed(2)}  | ` +
        `${r.perfect.toFixed(2).padStart(6)}%  ${String(r.median).padStart(3)}  ${String(r.p75).padStart(3)}  ${String(r.p90).padStart(3)} | ` +
        `${b.perfect.toFixed(2).padStart(6)}%  ${String(b.p90).padStart(3)}  ${String(b.max).padStart(3)}`
      );
    }
  }
}
