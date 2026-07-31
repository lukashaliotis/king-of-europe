// Postseason: derive the stage reached from the 38-game record, then play out the bracket.
//
// DETERMINISTIC, per the SPEC. The RNG is seeded from the five player codes (sorted, so draft
// order doesn't matter), so the same five always produce the same bracket, the same opponents
// and the same final score. Randomness is fine; irreproducibility is not.
import { projectRecord, gameProbability, playerStrength } from "./engine.js";

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

// SEEDING. The bracket used to ignore the season you just played — a 20-18 bubble team got the
// same odds as a 34-4 juggernaut of similar paper strength, so bubble teams reached the Final
// Four ~62% of the time. Now your regular-season record shifts your effective bracket strength:
// a great season = high seed, home court, you're the favourite; a bubble team = genuine underdog
// every round. Pivot near a strong-playoff record so ~26 wins is roughly neutral. Deterministic
// (record is seeded from the five), so it stays reproducible.
const SEED_COEF = 0.62;
const SEED_PIVOT = 26;

// Roster DEPTH used for opponent REALISM only (never for the game itself). A one-star minnow and
// a deep contender can field similarly-rated best fives, but the contender has a real 6th–8th man.
// Rewarding depth in the ranking pushes minnows down the table so they rarely appear in deep
// rounds, while genuine clubs surface — without needing real standings (which the data lacks).
const DEPTH_WEIGHT = 0.15;

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

// Every club-season that can field a legal five. GAME strength is that five's S (+OPP_BONUS) —
// the team that actually takes the floor against you. But the table is RANKED by a depth-adjusted
// score (best five + a bonus for a real 6th–8th man), so one-star minnows sink and genuine deep
// clubs rise. Ranking realism ≠ on-court strength: you still only play the five they can field.
// Computed once and cached.
let OPP_TABLE = null;
function opponentTable(pools, seasons) {
  if (OPP_TABLE) return OPP_TABLE;
  const list = [];
  for (const pool of pools) {
    const five = bestFive(pool);
    if (!five) continue;
    const S = projectRecord(five, seasons).S + OPP_BONUS;
    // depth = positive strength of the players BEYOND the starting five (6th man onward)
    const starters = new Set(five.map((p) => p.playerCode));
    let depth = 0;
    for (const p of pool.players) {
      if (starters.has(p.playerCode)) continue;
      depth += Math.max(0, playerStrength(p, seasons));
    }
    list.push({ pool, S, rankS: S + DEPTH_WEIGHT * depth });
  }
  list.sort((a, b) => b.rankS - a.rankS); // strongest (depth-adjusted) first
  OPP_TABLE = list;
  return list;
}

// Draw an opponent from a strength band of the ranked table, WEIGHTED toward the stronger end of
// the band (the top of the band is ~3x as likely as the bottom). Uniform draws served the weakest
// in-band team as often as the strongest, which is how minnows sneaked into deep rounds; the
// weighting keeps variety but makes a real contender the likely opponent.
function pickOpponent(rng, table, loPct, hiPct, used) {
  const lo = Math.floor(loPct * table.length);
  const hi = Math.max(lo + 1, Math.floor(hiPct * table.length));
  for (let tries = 0; tries < 80; tries++) {
    // rng^2 biases toward 0 → toward `lo` (the stronger end of the band)
    const t = rng() * rng();
    const idx = lo + Math.floor(t * (hi - lo));
    const cand = table[idx];
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
  const baseS = projectRecord(roster, seasons, undefined, 1, null, sixthMan).S;
  // SEED: reward the regular season. A strong record lifts your bracket strength (high seed / home
  // court); a bubble record drags it down (underdog). This is what makes the Final Four an
  // achievement instead of a coin flip for anyone who scrapes into the playoffs.
  const S = baseS + SEED_COEF * (wins - SEED_PIVOT);
  const table = opponentTable(pools, seasons);
  const used = new Set();
  const rounds = [];

  if (wins < REBUILD_CUT) return { stage: "relegation", label: "Eurocup team.", rounds };
  if (wins < ALMOST_CUT) return { stage: "rebuild", label: "Need to rebuild.", rounds };
  if (wins < PLAYIN_CUT) return { stage: "almost", label: "Almost postseason.", rounds };

  // 7th-10th: survive the play-in or go home
  if (wins < PLAYOFF_CUT) {
    const opp = pickOpponent(rng, table, 0.28, 0.55, used);
    const g = game(rng, S, opp.S);
    rounds.push({ name: "Play-in", opp: opp.pool, ...g });
    if (!g.win) return { stage: "playin", label: "Eliminated in the play-in.", rounds };
  }

  const qfOpp = pickOpponent(rng, table, 0, 0.12, used);
  const qf = series(rng, S, qfOpp.S);
  rounds.push({ name: "Playoffs", opp: qfOpp.pool, series: qf.tally, win: qf.win });
  if (!qf.win) return { stage: "playoffs", label: "Lost in the playoffs.", rounds };

  // Deep-round escalation: the Final Four is a gauntlet. The semi and final opponents get an extra
  // edge (rest, neutral-court, the peak of the field) so even a juggernaut can't sleepwalk to the
  // title — winning it all should mean beating the best when it counts.
  const sfOpp = pickOpponent(rng, table, 0, 0.05, used);
  const sf = game(rng, S, sfOpp.S + 1.2);
  rounds.push({ name: "Final Four semi-final", opp: sfOpp.pool, ...sf });
  if (!sf.win) return { stage: "finalfour", label: "Final Four team.", rounds };

  const fOpp = pickOpponent(rng, table, 0, 0.015, used);
  const f = game(rng, S, fOpp.S + 2.6);
  rounds.push({ name: "Final", opp: fOpp.pool, ...f });
  if (!f.win) return { stage: "lostfinal", label: "Lost in the final.", rounds };

  return { stage: "champion", label: "EuroLeague Champions.", rounds };
}
