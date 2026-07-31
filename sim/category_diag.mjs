// Category-balance diagnostic (read-only). For many drafts, measures per category:
//   (1) how often it is THE GATE (the weakest link that caps the record)
//   (2) the marginal wins from +1 std added to just that category (via the coach-delta channel)
// If a category is rarely the gate AND buys lots of wins, it is effectively over-weighted.
// Run: node sim/category_diag.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS, CATEGORIES } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const P = DEFAULT_PARAMS;
const SLOT_POS = ["G", "G", "F", "F", "C"];

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const openFor = (slots, pos) => SLOT_POS.findIndex((p, i) => p === pos && !slots[i]);

// realistic: greedy best-available on S
function greedyFive(rng) {
  const slots = [null,null,null,null,null], used = new Set();
  let g = 0;
  while (slots.some(s => !s) && g++ < 200) {
    const pool = spin(pools, rng);
    let best=null, bk=-Infinity, bs=-1;
    for (const c of pool.players) {
      if (used.has(c.playerCode)) continue;
      const idx = openFor(slots, c.pos); if (idx < 0) continue;
      const res = projectRecord(slots.filter(Boolean).concat(c), data.seasons, P);
      if (res.S > bk) { bk = res.S; best = c; bs = idx; }
    }
    if (best) { slots[bs] = best; used.add(best.playerCode); }
  }
  return slots.filter(Boolean);
}

// unbiased: random legal five
function randomFive(rng) {
  const slots = [null,null,null,null,null], used = new Set();
  let g = 0;
  while (slots.some(s => !s) && g++ < 400) {
    const pool = spin(pools, rng);
    const cand = pool.players.filter(c => !used.has(c.playerCode) && openFor(slots, c.pos) >= 0);
    if (!cand.length) continue;
    const c = cand[(rng() * cand.length) | 0];
    slots[openFor(slots, c.pos)] = c; used.add(c.playerCode);
  }
  return slots.filter(Boolean);
}

function run(label, make, N, seed) {
  const rng = mulberry32(seed);
  const gate = Object.fromEntries(CATEGORIES.map(k => [k, 0]));
  const marg = Object.fromEntries(CATEGORIES.map(k => [k, 0]));
  const meanScore = Object.fromEntries(CATEGORIES.map(k => [k, 0]));
  let used = 0;
  for (let i = 0; i < N; i++) {
    const five = make(rng);
    if (five.length < 5) continue;
    used++;
    const base = projectRecord(five, data.seasons, P);
    gate[base.gateCategory]++;
    for (const k of CATEGORIES) {
      meanScore[k] += base.categoryScores[k];
      const bumped = projectRecord(five, data.seasons, P, 1, { [k]: 1 }, null);
      const bw = (bumped.expectedWins ?? bumped.wins) - (base.expectedWins ?? base.wins);
      marg[k] += bw;
    }
  }
  console.log(`\n=== ${label}  (n=${used}) ===`);
  console.log("category      gate%   +1std→wins   avg score");
  for (const k of CATEGORIES) {
    console.log(`${k.padEnd(12)} ${((gate[k]/used*100).toFixed(1)+"%").padStart(6)}   ${(marg[k]/used).toFixed(3).padStart(9)}   ${(meanScore[k]/used).toFixed(2).padStart(8)}`);
  }
}

run("REALISTIC (greedy best-available)", greedyFive, 4000, 12345);
run("RANDOM (unbiased legal fives)", randomFive, 5000, 999);
