// Dynasty calibration. Models the real mode mechanic against real rosters and reports the
// win-STREAK distribution, so the opponent ramp + home edge are tuned empirically (not by eye):
//   - starting squad: UNIFORM-spin draft (no strength bias), 5 legal starters (2G/2F/1C) + 1 sixth
//   - each round r: draw an opponent club-year whose best legal five clears a RISING floor F(r),
//     roll home/away (±edge on win prob), then ONE seeded game at p = gameProbability(myS, oppS)
//   - on a win: forced recruit — take one opponent player, cut one of yours, keep a fieldable six,
//     greedily maximising your five's S (an expert player); a casual variant swaps by raw scoring
//   - first loss ends the run; the streak is the score
// Target: a GREAT run (p90) ~10-15, tuned a touch harder.  Usage: node sim/dynasty_calib.mjs [N]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, gameProbability, DEFAULT_PARAMS } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const P = DEFAULT_PARAMS;

function mb(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const spinUniform = (rng) => pools[Math.floor(rng() * pools.length)]; // NO weight bias (Dynasty draft)
const counts = (arr) => arr.reduce((a, p) => (a[p.pos] = (a[p.pos] || 0) + 1, a), {});

// Memoised strength: projectRecord is deterministic in (five, sixth), and the greedy recruit
// re-evaluates heavily overlapping rosters, so a signature cache collapses millions of calls.
const _sCache = new Map();
function Sof(five, sixth = null) {
  const key = five.map((p) => p.playerCode).sort().join("|") + (sixth ? "#" + sixth.playerCode : "");
  let v = _sCache.get(key);
  if (v === undefined) { v = projectRecord(five, seasons, P, 1, null, sixth).S; _sCache.set(key, v); }
  return v;
}

// Best legal five (2G/2F/1C) from a single club-year pool, greedy by marginal S. Opponents field this.
const SLOT = ["G", "G", "F", "F", "C"];
const _poolCache = new Map();
function poolBest(pool) { // { five, S } for a pool, computed once
  let v = _poolCache.get(pool.id);
  if (v === undefined) { const five = bestFiveFromPool(pool); v = five ? { five, S: Sof(five) } : null; _poolCache.set(pool.id, v); }
  return v;
}
function bestFiveFromPool(pool) {
  const five = []; const open = { G: 2, F: 2, C: 1 }; const used = new Set();
  for (let step = 0; step < 5; step++) {
    let best = null, bk = -Infinity;
    for (const c of pool.players) {
      if (used.has(c.playerCode) || !open[c.pos]) continue;
      const s = Sof([...five, c]);
      if (s > bk) { bk = s; best = c; }
    }
    if (!best) return null;
    five.push(best); used.add(best.playerCode); open[best.pos]--;
  }
  return five;
}

// A squad is 6 players that can field a legal five (G>=2,F>=2,C>=1). Its S = best (five,sixth) split.
function canField(six) { const c = counts(six); return (c.G || 0) >= 2 && (c.F || 0) >= 2 && (c.C || 0) >= 1 && six.length === 6; }
function bestSplit(six) {
  let bestS = -Infinity, bestFive = null, bestSixth = null;
  for (let i = 0; i < 6; i++) {
    const five = six.filter((_, j) => j !== i); const c = counts(five);
    if ((c.G || 0) !== 2 || (c.F || 0) !== 2 || (c.C || 0) !== 1) continue;
    const s = Sof(five, six[i]);
    if (s > bestS) { bestS = s; bestFive = five; bestSixth = six[i]; }
  }
  return { S: bestS, five: bestFive, sixth: bestSixth };
}

// Uniform-spin starting draft: greedily fill 2G/2F/1C, then add a 6th (best marginal S as sixth).
function draftSquad(rng) {
  const five = []; const open = { G: 2, F: 2, C: 1 }; const used = new Set(); let g = 0;
  while (five.length < 5 && g++ < 120) {
    const pool = spinUniform(rng); let best = null, bk = -Infinity;
    for (const c of pool.players) {
      if (used.has(c.playerCode) || !open[c.pos]) continue;
      const s = Sof([...five, c]); if (s > bk) { bk = s; best = c; }
    }
    if (!best) continue;
    five.push(best); used.add(best.playerCode); open[best.pos]--;
  }
  if (five.length < 5) return null;
  let sixth = null, bk = -Infinity, g2 = 0;
  while (g2++ < 40) {
    const pool = spinUniform(rng);
    for (const c of pool.players) {
      if (used.has(c.playerCode)) continue;
      const s = Sof(five, c); if (s > bk) { bk = s; sixth = c; }
    }
    if (sixth) break;
  }
  return [...five, sixth];
}

// Draw an opponent whose best-five S clears F(r); fall back to the strongest seen after a cap.
function drawOpponent(rng, floorS) {
  let best = null, bestS = -Infinity;
  for (let i = 0; i < 250; i++) {
    const pb = poolBest(spinUniform(rng));
    if (!pb) continue;
    if (pb.S >= floorS) return pb;
    if (pb.S > bestS) { bestS = pb.S; best = pb; }
  }
  return best || { five: null, S: -Infinity };
}

// Forced recruit. EXPERT: the swap (one opp player in, one of yours out) that maximises S while the
// six stays fieldable. CASUAL: take opp's best scorer, cut own worst scorer, ignore fit if legal.
function recruit(six, oppFive, rng, casual) {
  const score = (p) => p.cat.scoring + 0.3 * p.cat.efficiency;
  if (casual) {
    const incoming = [...oppFive].sort((a, b) => score(b) - score(a));
    const outgoing = [...six].map((p, i) => [p, i]).sort((a, b) => score(a[0]) - score(b[0]));
    for (const inc of incoming) for (const [, i] of outgoing) {
      const next = six.map((p, j) => (j === i ? inc : p));
      if (canField(next)) return next;
    }
    return six;
  }
  let best = six, bk = bestSplit(six).S;
  for (const inc of oppFive) {
    if (six.some((p) => p.playerCode === inc.playerCode)) continue;
    for (let i = 0; i < 6; i++) {
      const next = six.map((p, j) => (j === i ? inc : p));
      if (!canField(next)) continue;
      const s = bestSplit(next).S;
      if (s > bk) { bk = s; best = next; }
    }
  }
  return best;
}

const EDGE = 0.04; // home/away swing on win prob (real app uses the actual arena mult, ~±4.5%)
// Effective opponent strength = a real club-year's best five (drawn above a modest rising floor, for
// narrative — late you face genuinely strong clubs) PLUS a per-round ESCALATION handicap, so even a
// looted superteam eventually falls. Mirrors the postseason seeding handicap.
function runOnce(rng, F0, slope, Fmax, esc, casual) {
  let six = draftSquad(rng); if (!six) return 0;
  let streak = 0;
  for (let r = 1; r <= 80; r++) {
    const floorS = Math.min(Fmax, F0 + slope * (r - 1));
    const opp = drawOpponent(rng, floorS); if (!opp.five) break;
    const myS = bestSplit(six).S;
    const oppEff = opp.S + esc * (r - 1);
    let p = gameProbability(myS, oppEff, P);
    p *= (rng() < 0.5 ? 1 + EDGE : 1 - EDGE); // home or away
    p = Math.max(0, Math.min(0.999, p));
    if (rng() < p) { streak++; six = recruit(six, opp.five, rng, casual); }
    else break;
  }
  return streak;
}

function distStreak(N, seed, F0, slope, Fmax, esc, casual) {
  const rng = mb(seed); const xs = [];
  for (let i = 0; i < N; i++) xs.push(runOnce(rng, F0, slope, Fmax, esc, casual));
  xs.sort((a, b) => a - b);
  const q = (p) => xs[Math.floor(p * (xs.length - 1))];
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { p25: q(0.25), med: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), max: xs[xs.length - 1], mean: +mean.toFixed(1) };
}

// ---- 1) reference distributions (what strengths are in play) ----
function quantiles(xs) { xs.sort((a, b) => a - b); const q = (p) => +xs[Math.floor(p * (xs.length - 1))].toFixed(2); return { min: +xs[0].toFixed(2), p10: q(0.1), p50: q(0.5), p90: q(0.9), p95: q(0.95), max: +xs[xs.length - 1].toFixed(2) }; }
const poolS = pools.map(poolBest).filter(Boolean).map((pb) => pb.S);
console.log(`pools=${pools.length}  opponent best-five S:`, quantiles(poolS.slice()));
{ const rng = mb(1); const ss = []; for (let i = 0; i < 1500; i++) { const sq = draftSquad(rng); if (sq) ss.push(bestSplit(sq).S); } console.log(`starting squad S (uniform draft):`, quantiles(ss)); }

// ---- 2) ramp sweep ----
const N = Number(process.argv[2] || 3000);
const Fmax = quantiles(poolS.slice()).p95; // draw ceiling: late you face ~p95 real clubs
const F0 = 3, slope = 1.0;                  // low round-1 floor (winnable early) → healthier median
console.log(`\nN=${N} runs/cell, draw floor F0=${F0} slope=${slope} cap Fmax=${Fmax}\n`);
console.log(`esc = per-round handicap added to opponent effective S\n`);
console.log("esc  | EXPERT p25 med p75 p90 p95 max mean | CASUAL med p90 mean");
for (const esc of [0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.4]) {
  const e = distStreak(N, 12345, F0, slope, Fmax, esc, false);
  const c = distStreak(N, 12345, F0, slope, Fmax, esc, true);
  console.log(`${esc.toFixed(1).padEnd(4)} |    ${String(e.p25).padStart(3)} ${String(e.med).padStart(3)} ${String(e.p75).padStart(3)} ${String(e.p90).padStart(3)} ${String(e.p95).padStart(3)} ${String(e.max).padStart(3)} ${String(e.mean).padStart(4)}  |    ${String(c.med).padStart(3)} ${String(c.p90).padStart(3)} ${String(c.mean).padStart(4)}`);
}
