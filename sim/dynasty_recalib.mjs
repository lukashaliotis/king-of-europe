// Dynasty RE-calibration for the real 5v5 mechanic (the first pass modelled a 6-man squad). Uses the
// SHIPPED dynasty.js functions directly — drawFor/homeFor/resolveGame/canSwap/orderFive/squadStrength —
// so the numbers are exactly what the deployed game produces. Sweeps DYN.esc (mutated in place) and
// reports the win-streak distribution for an EXPERT (greedy draft + optimal forced recruit) and a
// CASUAL player. Target: a great run (p90) ~10-15, leaning to the harder side. Usage: node sim/dynasty_recalib.mjs [N]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildClubSeasons } from "../web/src/data.js";
import { arenaFor } from "../web/src/arenas.js";
import { DYN, drawFor, homeFor, resolveGame, roundRng, orderFive, canSwap, squadStrength } from "../web/src/dynasty.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const S = (five) => squadStrength(five, seasons);

function mb(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const wrap = (c, pool) => ({ ...c, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } });

// EXPERT draft: uniform spins, greedily fill 2G/2F/1C to maximise team S.
function draftExpert(rng) {
  const five = []; const open = { G: 2, F: 2, C: 1 }; const used = new Set(); let g = 0;
  while (five.length < 5 && g++ < 200) {
    const pool = pools[Math.floor(rng() * pools.length)];
    let best = null, bk = -Infinity;
    for (const c of pool.players) {
      if (used.has(c.playerCode) || !open[c.pos]) continue;
      const s = S([...five, wrap(c, pool)]);
      if (s > bk) { bk = s; best = wrap(c, pool); }
    }
    if (!best) continue;
    five.push(best); used.add(best.playerCode); open[best.pos]--;
  }
  return five.length === 5 ? orderFive(five) : null;
}
// CASUAL draft: chase scoring.
function draftCasual(rng) {
  const five = []; const open = { G: 2, F: 2, C: 1 }; const used = new Set(); let g = 0;
  const score = (p) => p.cat.scoring + 0.3 * p.cat.efficiency;
  while (five.length < 5 && g++ < 200) {
    const pool = pools[Math.floor(rng() * pools.length)];
    let best = null, bk = -Infinity;
    for (const c of pool.players) {
      if (used.has(c.playerCode) || !open[c.pos]) continue;
      if (score(c) > bk) { bk = score(c); best = wrap(c, pool); }
    }
    if (!best) continue;
    five.push(best); used.add(best.playerCode); open[best.pos]--;
  }
  return five.length === 5 ? orderFive(five) : null;
}

// EXPERT forced recruit: the legal (one in / one out) swap that leaves the highest team S.
function recruitExpert(five, opp) {
  let best = five, bk = -Infinity;
  for (const inc of opp.five) {
    if (five.some((p) => p.playerCode === inc.playerCode)) continue;
    for (let i = 0; i < 5; i++) {
      if (!canSwap(five, inc, i)) continue;
      const nx = orderFive(five.map((p, j) => (j === i ? inc : p)));
      const s = S(nx);
      if (s > bk) { bk = s; best = nx; }
    }
  }
  return best;
}
// CASUAL forced recruit: take their best scorer, drop own worst scorer of that position.
function recruitCasual(five, opp) {
  const score = (p) => p.cat.scoring + 0.3 * p.cat.efficiency;
  const incoming = [...opp.five].sort((a, b) => score(b) - score(a));
  for (const inc of incoming) {
    if (five.some((p) => p.playerCode === inc.playerCode)) continue;
    const cand = five.map((p, i) => [p, i]).filter(([p, i]) => canSwap(five, inc, i)).sort((a, b) => score(a[0]) - score(b[0]));
    if (cand.length) return orderFive(five.map((p, j) => (j === cand[0][1] ? inc : p)));
  }
  return five;
}

function runOnce(rng, draft, recruit) {
  let five = draft(rng);
  if (!five) return 0;
  const seed = (rng() * 0xffffffff) >>> 0;
  const homeMult = arenaFor(five[(rng() * 5) | 0]._src.teamCode, five[0].season).mult; // a spun home arena
  let streak = 0;
  for (let r = 1; r <= 120; r++) {
    const opp = drawFor(pools, seasons, seed, r);
    const home = homeFor(seed, r);
    const res = resolveGame(S(five), opp, home, homeMult, roundRng(seed, r, "game"));
    if (!res.win) break;
    streak++;
    five = recruit(five, opp);
  }
  return streak;
}

function dist(N, draft, recruit, seed0) {
  const rng = mb(seed0); const xs = [];
  for (let i = 0; i < N; i++) xs.push(runOnce(rng, draft, recruit));
  xs.sort((a, b) => a - b);
  const q = (p) => xs[Math.floor(p * (xs.length - 1))];
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { med: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), max: xs[xs.length - 1], mean: +mean.toFixed(1) };
}

const N = Number(process.argv[2] || 2000);
const orig = DYN.esc;
console.log(`N=${N} runs/cell — current shipped esc=${orig}\n`);
console.log("esc  | EXPERT med p75 p90 p95 max mean | CASUAL med p90 p95 mean");
for (const esc of [0.5, 0.55, 0.6, 0.65]) {
  DYN.esc = esc;
  const e = dist(N, draftExpert, recruitExpert, 4242);
  const c = dist(N, draftCasual, recruitCasual, 4242);
  console.log(`${esc.toFixed(2).padEnd(4)} |    ${String(e.med).padStart(3)} ${String(e.p75).padStart(3)} ${String(e.p90).padStart(3)} ${String(e.p95).padStart(3)} ${String(e.max).padStart(3)} ${String(e.mean).padStart(4)}  |    ${String(c.med).padStart(3)} ${String(c.p90).padStart(3)} ${String(c.p95).padStart(3)} ${String(c.mean).padStart(4)}`);
}
DYN.esc = orig;
