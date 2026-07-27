// Postseason: derive the stage reached from the 38-game record, then play out the bracket.
//
// DETERMINISTIC, per the SPEC. The RNG is seeded from the five player codes (sorted, so draft
// order doesn't matter), so the same five always produce the same bracket, the same opponents
// and the same final score. Randomness is fine; irreproducibility is not.
import { projectRecord, gameProbability } from "./engine.js";

const SLOT_POS = ["G", "G", "F", "F", "C"];

// Record -> where your season ends before any bracket is played (20-team, 38-round format:
// top 6 straight to the playoffs, 7-10 into the play-in, the rest go home).
const PLAYOFF_CUT = 24; // 24+  -> straight into the playoffs bracket
const PLAYIN_CUT = 20;  // 20-23 -> the play-in
const ALMOST_CUT = 16;  // 16-19 -> missed, but close
const REBUILD_CUT = 10; // 10-15 -> a rebuilding year; below 10 -> bottom of the table

const MARGIN_SD = 9.0; // spread of the winning margin, in points

// Balance constant. Your five cherry-picks the best player from five different club-seasons;
// an opponent is one real club's best five, which is structurally weaker. Without this the
// bracket is a cakewalk (~37% of teams won the title). Read it as the continuity/chemistry a
// real club has that your all-star pickup side does not. Tuned so a title stays rare.
const OPP_BONUS = 5.0;

export function seedFrom(roster) {
  const key = roster.map((p) => p.playerCode).sort().join("|");
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) * 1.15; // ~N(0,1)

// Best legal lineup (2G/2F/1C) an opponent club-season can field. pool.players is already
// sorted strongest-first by data.js, so a single greedy pass is the best five.
function bestFive(pool) {
  const slots = [null, null, null, null, null];
  for (const p of pool.players) {
    const i = SLOT_POS.findIndex((pos, idx) => pos === p.pos && !slots[idx]);
    if (i >= 0) slots[i] = p;
    if (slots.every(Boolean)) break;
  }
  return slots.every(Boolean) ? slots : null;
}

// Every club-season that can field a legal five, ranked by the strength of THAT five.
// (Ranking by pool.ceiling was wrong — it ignores the 2G/2F/1C constraint, so the "elite"
// band served up weak finalists.) Computed once and cached.
let OPP_TABLE = null;
function opponentTable(pools, seasons) {
  if (OPP_TABLE) return OPP_TABLE;
  const list = [];
  for (const pool of pools) {
    const five = bestFive(pool);
    if (five) list.push({ pool, S: projectRecord(five, seasons).S + OPP_BONUS });
  }
  list.sort((a, b) => b.S - a.S); // strongest first
  OPP_TABLE = list;
  return list;
}

// Draw an opponent from a strength band of the ranked table.
function pickOpponent(rng, table, loPct, hiPct, used) {
  const lo = Math.floor(loPct * table.length);
  const hi = Math.max(lo + 1, Math.floor(hiPct * table.length));
  for (let tries = 0; tries < 60; tries++) {
    const cand = table[lo + Math.floor(rng() * (hi - lo))];
    if (!cand || used.has(cand.pool.id)) continue;
    used.add(cand.pool.id);
    return cand;
  }
  return table[lo];
}

// One game. The WINNER now comes from the shared per-game probability (the same function the
// regular season and the Versus duel use), and the margin is drawn CONDITIONED on that outcome,
// so the score and the result can never disagree.
function game(rng, a, b) {
  const win = rng() < gameProbability(a, b);
  const margin = 1 + Math.round(Math.abs(gauss(rng)) * MARGIN_SD * 0.7);
  const base = 72 + Math.round(rng() * 14);
  return { win, us: win ? base + margin : base, them: win ? base : base + margin };
}

// Best-of-five series.
function series(rng, a, b) {
  let w = 0, l = 0;
  const games = [];
  while (w < 3 && l < 3) {
    const g = game(rng, a, b);
    games.push(g);
    g.win ? w++ : l++;
  }
  return { win: w === 3, tally: `${w}–${l}`, games };
}

/**
 * Run the postseason for a completed five.
 * @returns {{stage:string, label:string, rounds:Array}}
 */
export function runPostseason(roster, seasons, pools, wins, sixthMan = null) {
  const rng = mulberry32(seedFrom(roster));
  const S = projectRecord(roster, seasons, undefined, 1, null, sixthMan).S;
  const table = opponentTable(pools, seasons);
  const used = new Set();
  const rounds = [];

  if (wins < REBUILD_CUT) return { stage: "relegation", label: "Eurocup team.", rounds };
  if (wins < ALMOST_CUT) return { stage: "rebuild", label: "Need to rebuild.", rounds };
  if (wins < PLAYIN_CUT) return { stage: "almost", label: "Almost postseason.", rounds };

  // 7th-10th: survive the play-in or go home
  if (wins < PLAYOFF_CUT) {
    const opp = pickOpponent(rng, table, 0.35, 0.65, used);
    const g = game(rng, S, opp.S);
    rounds.push({ name: "Play-in", opp: opp.pool, ...g });
    if (!g.win) return { stage: "playin", label: "Eliminated in the play-in.", rounds };
  }

  const qfOpp = pickOpponent(rng, table, 0, 0.18, used);
  const qf = series(rng, S, qfOpp.S);
  rounds.push({ name: "Playoffs", opp: qfOpp.pool, series: qf.tally, win: qf.win });
  if (!qf.win) return { stage: "playoffs", label: "Lost in the playoffs.", rounds };

  const sfOpp = pickOpponent(rng, table, 0, 0.06, used);
  const sf = game(rng, S, sfOpp.S);
  rounds.push({ name: "Final Four semi-final", opp: sfOpp.pool, ...sf });
  if (!sf.win) return { stage: "finalfour", label: "Final Four team.", rounds };

  const fOpp = pickOpponent(rng, table, 0, 0.02, used);
  const f = game(rng, S, fOpp.S);
  rounds.push({ name: "Final", opp: fOpp.pool, ...f });
  if (!f.win) return { stage: "lostfinal", label: "Lost in the final.", rounds };

  return { stage: "champion", label: "EuroLeague Champions.", rounds };
}
