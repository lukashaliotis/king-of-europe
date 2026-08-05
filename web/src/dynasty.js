// Dynasty — the roguelike gauntlet. Pure logic only (the UI lives in app.js): draw opponents against
// a rising floor + a per-round escalation handicap, resolve ONE seeded game, and validate the forced
// recruit-and-replace. Determinism for the leaderboards comes from the `rng` the caller passes in.
//
// Calibrated empirically in sim/dynasty_calib.mjs against real rosters (see docs/DECISIONS.md §15):
// with esc=1.1 a great run (p90) ≈ 12 wins and an exceptional one (p95) ≈ 15. Re-tune HERE.
import { projectRecord, gameProbability, DEFAULT_PARAMS } from "./engine.js";
import { arenaFor } from "./arenas.js";

export const DYN = {
  F0: 3,          // round-1 draw floor: weak-ish opponents early so the first games are winnable
  slope: 1.0,     // how fast the draw floor rises (you face better real clubs each round)
  esc: 1.1,       // per-round escalation ADDED to the opponent's effective strength — the handicap
                  // that guarantees even a looted superteam eventually falls (real rosters cap ~S22)
  drawAttempts: 250,
  homeEdge: 0.045, // fallback ±4.5% when a club has no rated arena (neutral)
};

const counts = (arr) => { const c = { G: 0, F: 0, C: 0 }; for (const p of arr) if (p) c[p.pos]++; return c; };
const legalFive = (five) => { const c = counts(five); return c.G === 2 && c.F === 2 && c.C === 1; };
const Sof = (roster, seasons, sixth = null) => projectRecord(roster, seasons, DEFAULT_PARAMS, 1, null, sixth).S;

/* ---------------- opponents ---------------- */

// Best legal five (2G/2F/1C) from one club-year pool, greedy by marginal strength. Cached per pool
// (a pool's best five never changes), so repeated draws are instant.
const _poolBest = new Map();
export function poolBestFive(pool, seasons) {
  if (_poolBest.has(pool.id)) return _poolBest.get(pool.id);
  const five = []; const open = { G: 2, F: 2, C: 1 }; const used = new Set();
  for (let step = 0; step < 5; step++) {
    let best = null, bk = -Infinity;
    for (const c of pool.players) {
      if (used.has(c.playerCode) || !open[c.pos]) continue;
      const s = Sof([...five, c], seasons);
      if (s > bk) { bk = s; best = c; }
    }
    if (!best) { _poolBest.set(pool.id, null); return null; }
    five.push(best); used.add(best.playerCode); open[best.pos]--;
  }
  const v = { five, S: Sof(five, seasons) };
  _poolBest.set(pool.id, v);
  return v;
}

// The draw ceiling: late rounds should face genuinely strong REAL clubs (p95 best-five), above which
// only the escalation handicap keeps ramping. Computed once.
let _ceiling = null;
export function opponentCeiling(pools, seasons) {
  if (_ceiling != null) return _ceiling;
  const xs = pools.map((p) => poolBestFive(p, seasons)).filter(Boolean).map((v) => v.S).sort((a, b) => a - b);
  _ceiling = xs[Math.floor(0.95 * (xs.length - 1))];
  return _ceiling;
}

export const drawFloor = (pools, seasons, round) =>
  Math.min(opponentCeiling(pools, seasons), DYN.F0 + DYN.slope * (round - 1));

function makeOpponent(pool, pb, round) {
  const five = pb.five.map((p) => ({ ...p, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } }));
  const arena = arenaFor(pool.teamCode, pool.season);
  return {
    pool, five, S: pb.S,
    effS: pb.S + DYN.esc * (round - 1), // real strength + the per-round handicap
    round, arenaMult: arena.mult, arenaName: arena.name,
    teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel,
  };
}

// Draw an opponent whose best five clears the round's floor; fall back to the strongest seen.
export function drawOpponent(pools, seasons, rng, round) {
  const floorS = drawFloor(pools, seasons, round);
  let best = null, bestS = -Infinity;
  for (let i = 0; i < DYN.drawAttempts; i++) {
    const pool = pools[Math.floor(rng() * pools.length)];
    const pb = poolBestFive(pool, seasons);
    if (!pb) continue;
    if (pb.S >= floorS) return makeOpponent(pool, pb, round);
    if (pb.S > bestS) { bestS = pb.S; best = { pool, pb }; }
  }
  return makeOpponent(best.pool, best.pb, round);
}

/* ---------------- a single game ---------------- */

// Your per-game win probability vs the opponent's effective strength, with the home/away arena edge.
// Home → your arena lifts you; away → their arena cuts you (a neutral arena is ~1, so no swing).
export function winProbability(myS, opp, home, homeMult) {
  const mult = home ? homeMult : 2 - opp.arenaMult;
  return Math.max(0.02, Math.min(0.98, gameProbability(myS, opp.effS) * mult));
}

// Split a team's total into 4 quarter buckets (exact sum) so the score can be revealed quarter by
// quarter like a live game — with lead changes, not a monotone climb.
function splitQuarters(total, rng) {
  const base = total / 4, q = [];
  let acc = 0;
  for (let i = 0; i < 3; i++) { const v = Math.max(9, Math.round(base + (rng() - 0.5) * 9)); q.push(v); acc += v; }
  q.push(Math.max(7, total - acc));
  return q;
}

// A plausible EuroLeague final score for flavour, consistent with who won and how one-sided it was,
// plus per-quarter splits for the simulated reveal.
function scoreline(win, p, rng) {
  const total = 150 + Math.floor(rng() * 26);            // 150–175 combined
  let margin = 1 + Math.round(Math.abs(p - 0.5) * 34 + rng() * 9); // bigger edge → bigger margin
  const signed = win ? margin : -margin;
  let mine = Math.round((total + signed) / 2);
  let theirs = total - mine;
  if (win && mine <= theirs) { mine = theirs + 1 + Math.floor(rng() * 3); theirs = total - mine; }
  if (!win && theirs <= mine) { theirs = mine + 1 + Math.floor(rng() * 3); mine = total - theirs; }
  return { mine, theirs, quarters: { mine: splitQuarters(mine, rng), theirs: splitQuarters(theirs, rng) } };
}

export function resolveGame(myS, opp, home, homeMult, rng) {
  const p = winProbability(myS, opp, home, homeMult);
  const win = rng() < p;
  return { win, p, ...scoreline(win, p, rng) };
}

/* ---------------- the squad + the forced recruit (5v5) ---------------- */

// Order a legal five (2G/2F/1C) into the court slots [PG,SG,SF,PF,C] = [G,G,F,F,C].
export function orderFive(five) {
  const g = five.filter((p) => p.pos === "G"), f = five.filter((p) => p.pos === "F"), c = five.filter((p) => p.pos === "C");
  return [g[0], g[1], f[0], f[1], c[0]];
}

// Is swapping `incoming` in for five[outIndex] legal? A five is exactly 2G/2F/1C, so the swap must be
// like-for-like on position (take their centre → drop yours) and introduce no duplicate.
export function canSwap(five, incoming, outIndex) {
  if (outIndex == null || !incoming) return false;
  const next = five.map((p, i) => (i === outIndex ? incoming : p));
  const seen = new Set();
  for (const p of next) { if (seen.has(p.playerCode)) return false; seen.add(p.playerCode); }
  return legalFive(next);
}

export const squadStrength = (five, seasons) => Sof(five, seasons);
