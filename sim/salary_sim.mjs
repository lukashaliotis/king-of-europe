// Tune Salary Cap: sweep a PRICE SCALE against the budget so a competitive team is affordable
// but a 38-0 team is not. The realistic-good-play greedy spreads the budget (soft per-slot cap)
// rather than buying one star and four scrubs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { legendsPool, LEGENDS_CHANCE } from "../web/src/legends.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const LEG = legendsPool();
const SLOT = ["G", "G", "F", "F", "C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const spinOnce = (rng) => (rng() < LEGENDS_CHANCE ? LEG : spin(pools, rng));

// candidate price curve — FLOOR + SLOPE * s^EXP, capped. Sweep SLOPE/CAP via `scale`.
const FLOOR = 4;
function priceOf(pl, scale, cap) {
  const s = Math.max(0, playerStrength(pl, data.seasons));
  return Math.min(cap, Math.round(FLOOR + scale * Math.pow(s, 1.1)));
}

function playCapped(rng, cap, scale, priceCap) {
  const slots = [null, null, null, null, null];
  let sixth = null, spent = 0;
  const used = new Set();
  const openPos = (pos) => SLOT.findIndex((p, i) => p === pos && !slots[i]);
  const picked = () => slots.filter(Boolean).length + (sixth ? 1 : 0);
  const afford = (price) => spent + price + FLOOR * (6 - picked() - 1) <= cap;
  let guard = 0;
  while (picked() < 6 && guard++ < 120) {
    const pool = spinOnce(rng);
    const starters = slots.filter(Boolean);
    const softCap = ((cap - spent) / (6 - picked())) * 1.7;
    let best = null, bestKey = -Infinity;
    for (const cand of pool.players) {
      if (used.has(cand.playerCode)) continue;
      const price = priceOf(cand, scale, priceCap);
      if (!afford(price) || price > softCap) continue;
      const pi = openPos(cand.pos);
      if (pi >= 0) {
        const res = projectRecord([...starters, cand], data.seasons, undefined, 1, null, sixth);
        if (res.S > bestKey) { bestKey = res.S; best = { cand, price, type: "pos", pi }; }
      }
      if (!sixth) {
        const res = projectRecord(starters, data.seasons, undefined, 1, null, cand);
        if (res.S - 0.01 > bestKey) { bestKey = res.S - 0.01; best = { cand, price, type: "bench" }; }
      }
    }
    if (!best) continue;
    if (best.type === "pos") slots[best.pi] = best.cand; else sixth = best.cand;
    used.add(best.cand.playerCode); spent += best.price;
  }
  const st = slots.filter(Boolean);
  if (st.length < 5) return null;
  return { wins: projectRecord(st, data.seasons, undefined, 1, null, sixth).wins, spent };
}

const N = Number(process.argv[2] || 2500);
console.log(`scale cap$  priceCap | 38-0%   med  p75  p90 | avgSpend`);
for (const scale of [2.6, 3.2]) {
  const priceCap = scale === 2.6 ? 40 : 46;
  for (const cap of [90, 100, 110]) {
    const rng = mulberry32(999);
    const w = [], sp = [];
    let perfect = 0;
    for (let i = 0; i < N; i++) {
      const r = playCapped(rng, cap, scale, priceCap);
      if (!r) continue;
      w.push(r.wins); sp.push(r.spent); if (r.wins === 38) perfect++;
    }
    w.sort((a, b) => a - b);
    const q = (f) => w[Math.floor(f * (w.length - 1))];
    const avg = (sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(0);
    console.log(` ${scale.toFixed(1)}  $${cap}  ${String(priceCap).padStart(3)}    | ${(100 * perfect / w.length).toFixed(2).padStart(5)}%  ${String(q(0.5)).padStart(3)}  ${String(q(0.75)).padStart(3)}  ${String(q(0.9)).padStart(3)} | $${avg}M`);
  }
}
