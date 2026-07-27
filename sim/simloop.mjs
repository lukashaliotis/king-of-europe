// Simulate the ACTUAL game loop (spin a club-year, pick best available, x5) to calibrate the
// win curve for the new mechanic. Run: node sim/simloop.mjs  (optional params JSON as argv[2])
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const PARAMS = { ...DEFAULT_PARAMS, ...(process.argv[2] ? JSON.parse(process.argv[2]) : {}) };

// deterministic RNG so runs are comparable
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Positional lineup: PG SG (Guard) + SF PF (Forward) + C (Center).
const SLOT_POS = ["G", "G", "F", "F", "C"];

// One playthrough: spin, greedy-pick the best player for an OPEN eligible slot, until full.
function playGreedy(rng) {
  const slots = [null, null, null, null, null];
  const usedCodes = new Set();
  const openSlotFor = (pos) => SLOT_POS.findIndex((p, i) => p === pos && !slots[i]);
  let guard = 0;
  while (slots.some((s) => s === null) && guard++ < 200) {
    const pool = spin(pools, rng);
    let best = null, bestKey = -Infinity, bestSlot = -1;
    for (const cand of pool.players) {
      if (usedCodes.has(cand.playerCode)) continue;
      const idx = openSlotFor(cand.pos);
      if (idx < 0) continue; // position already full
      const partial = slots.filter(Boolean).concat(cand);
      const res = projectRecord(partial, data.seasons, PARAMS);
      const key = res.S;
      if (key > bestKey) { bestKey = key; best = cand; bestSlot = idx; }
    }
    if (best) { slots[bestSlot] = best; usedCodes.add(best.playerCode); }
  }
  return projectRecord(slots.filter(Boolean), data.seasons, PARAMS);
}

const N = 8000;
const rng = mulberry32(12345);
const wins = [];
let perfect = 0;
for (let i = 0; i < N; i++) {
  const res = playGreedy(rng);
  wins.push(res.wins);
  if (res.wins === 38) perfect++;
}
wins.sort((a, b) => a - b);
const pct = (q) => wins[Math.floor(q * (wins.length - 1))];

console.log(`PARAMS leagueS=${PARAMS.leagueS} gameSteep=${PARAMS.gameSteep} gamma=${PARAMS.gamma} K=${PARAMS.reliabilityK}`);
console.log(`Simulated playthroughs: ${N} (greedy best-available each spin)`);
console.log(`  min ${wins[0]}  p10 ${pct(0.1)}  p25 ${pct(0.25)}  median ${pct(0.5)}  p75 ${pct(0.75)}  p90 ${pct(0.9)}  max ${wins[wins.length - 1]}`);
console.log(`  38-0: ${perfect}/${N} (${(100 * perfect / N).toFixed(2)}%)`);
const buckets = {};
for (const w of wins) { const b = Math.floor(w / 4) * 4; buckets[b] = (buckets[b] || 0) + 1; }
for (const b of Object.keys(buckets).map(Number).sort((a, c) => a - c)) {
  console.log(`    ${b}-${b + 3}: ${"#".repeat(Math.round(buckets[b] / N * 120))} ${(100 * buckets[b] / N).toFixed(1)}%`);
}
