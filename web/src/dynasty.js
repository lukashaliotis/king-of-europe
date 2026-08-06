// Dynasty — the roguelike gauntlet. Pure logic only (the UI lives in app.js): draw opponents against
// a rising floor + a per-round escalation handicap, resolve ONE seeded game, and validate the forced
// recruit-and-replace. Determinism for the leaderboards comes from the `rng` the caller passes in.
//
// Calibrated empirically in sim/dynasty_calib.mjs against real rosters (see docs/DECISIONS.md §15):
// with esc=1.1 a great run (p90) ≈ 12 wins and an exceptional one (p95) ≈ 15. Re-tune HERE.
import { projectRecord, gameProbability, DEFAULT_PARAMS, mulberry32 } from "./engine.js";
import { arenaFor } from "./arenas.js";
import { hashSeed } from "./daily.js";

export const DYN = {
  F0: 3,          // round-1 draw floor: weak-ish opponents early so the first games are winnable
  slope: 1.0,     // how fast the draw floor rises (you face better real clubs each round)
  esc: 0.55,      // per-round escalation ADDED to the opponent's effective strength — the handicap
                  // that guarantees even a looted superteam eventually falls (real rosters cap ~S22).
                  // RECALIBRATED for 5v5 in sim/dynasty_recalib.mjs (the first pass, esc=1.1, was tuned
                  // for a 6-man squad and ran too hard at 5v5). At 0.55: EXPERT median 2, p90 12, p95 15,
                  // max ~28; CASUAL p90 3 — restores the great-run target while staying brutal at the
                  // median (most runs die by round 2). Re-tune HERE.
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

/* ---------------- the weekly shared challenge ---------------- */

// The seed for a given ISO week — drives BOTH the fixed draft board and the gauntlet, so everyone
// worldwide gets the identical challenge that week.
export const dynastyWeekSeed = (weekKey) => hashSeed("KOE-DYN-" + weekKey);

// Can one player be taken from each of the board's draws to field a legal 2G/2F/1C five? (bipartite
// matching of the draws to the slots [G,G,F,F,C], solved by tiny backtracking).
function boardCanFieldLegalFive(board) {
  const avail = board.map((pool) => { const s = new Set(); for (const p of pool.players) s.add(p.pos); return s; });
  const slots = ["G", "G", "F", "F", "C"];
  const usedDraw = new Array(board.length).fill(false);
  const assign = (i) => {
    if (i >= slots.length) return true;
    for (let d = 0; d < board.length; d++) {
      if (!usedDraw[d] && avail[d].has(slots[i])) {
        usedDraw[d] = true;
        if (assign(i + 1)) return true;
        usedDraw[d] = false;
      }
    }
    return false;
  };
  return assign(0);
}

// The week's fixed draft board: `size` distinct club-years drawn UNIFORMLY (Dynasty's modest-start
// ethos — no strength bias, no legends), deterministically reseeded until a legal five is achievable.
// Everyone on the same week seed gets the identical board.
export function buildDynastyBoard(pools, seed, size = 5) {
  let fallback = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const rng = mulberry32(hashSeed("KOE-DYN-BOARD:" + seed + ":" + attempt));
    const board = []; const used = new Set(); let g = 0;
    while (board.length < size && g++ < 500) {
      const pool = pools[Math.floor(rng() * pools.length)];
      if (used.has(pool.id)) continue;
      used.add(pool.id); board.push(pool);
    }
    if (board.length !== size) continue;
    if (boardCanFieldLegalFive(board)) return board;
    if (!fallback) fallback = board;
  }
  return fallback;
}

/* ---------------- determinism (for replay + the leaderboards) ---------------- */

// A per-round RNG stream, a PURE function of (runSeed, round, salt) — so the opponent draw and the
// home/away roll for round r are identical for everyone on the same seed regardless of prior play,
// while the game coin-flip still resolves against the player's own squad strength. This makes a whole
// run reproducible from (seed, starting five, arena, recruit choices) — the basis of server re-sim.
export function roundRng(seed, round, salt) {
  return mulberry32(hashSeed(seed + ":" + round + ":" + salt));
}
export const drawFor = (pools, seasons, seed, round) => drawOpponent(pools, seasons, roundRng(seed, round, "opp"), round);
export const homeFor = (seed, round) => roundRng(seed, round, "loc")() < 0.5;

// Replay a whole run deterministically and return the VERIFIED streak. `five` is already-reconstructed
// player objects (2G/2F/1C); `choices[r-1] = { inn, out }` are the player-codes swapped after winning
// round r. Runs identically in the browser (self-check) and the Worker (authoritative). Any illegal
// swap or a streak longer than the seeded games actually allow is rejected.
export function replayDynastyRun(pools, seasons, sub, maxRounds = 200) {
  if (!Array.isArray(sub.five) || sub.five.length !== 5 || !legalFive(sub.five)) return { ok: false, error: "illegal starting five" };
  const homeMult = sub.arena ? sub.arena.mult : 1;
  let five = orderFive(sub.five);
  let streak = 0;
  for (let r = 1; r <= maxRounds; r++) {
    const opp = drawOpponent(pools, seasons, roundRng(sub.seed, r, "opp"), r);
    if (!opp || !opp.five) break;
    const home = roundRng(sub.seed, r, "loc")() < 0.5;
    const res = resolveGame(Sof(five, seasons), opp, home, homeMult, roundRng(sub.seed, r, "game"));
    if (!res.win) break;         // the seeded game decides the loss — not the client
    streak++;
    const choice = (sub.choices || [])[r - 1];
    if (!choice) break;          // player ended the run here (no recruit recorded)
    const incoming = opp.five.find((p) => p.playerCode === choice.inn);
    const outIdx = five.findIndex((p) => p.playerCode === choice.out);
    if (!incoming || outIdx < 0 || !canSwap(five, incoming, outIdx)) return { ok: false, error: "illegal recruit at round " + r };
    five = orderFive(five.map((p, i) => (i === outIdx ? incoming : p)));
  }
  return { ok: true, streak };
}
