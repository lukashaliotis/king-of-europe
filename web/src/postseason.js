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
// The play-in field is teams 7-10 - four mediocre sides - but opponents are drawn from a percentile
// band of ALL club-seasons, so a bubble team was being handed a top-third all-time roster. That was
// always wrong; with a single elimination game it simply never showed. Under the real two-game shape
// it becomes decisive, so play-in opponents are pulled down to bubble strength. Tuned so a 9th/10th
// seed still reaches the playoffs about as often as it did before the format changed (~13%) - the
// point of this change is the STRUCTURE, not a difficulty swing.
const PLAYIN_PEER = 4.6;
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
    list.push({ pool, five, S, rankS: S + DEPTH_WEIGHT * depth });
  }
  list.sort((a, b) => b.rankS - a.rankS); // strongest (depth-adjusted) first
  OPP_TABLE = list;
  return list;
}

// SCENARIO Daily G.O.A.T.: resolve a fixed historical bracket path into playable opponents. Each step
// names a real club-season (the team that actually stood in that round) plus a difficulty `bump`. We
// field that club's best five and compute its GAME strength exactly like opponentTable (so a scenario
// opponent is strengthed identically to a drawn one), keyed by round. Missing club-seasons fall back
// to a normal draw. A pure function of (pools, seasons, path), so the client + resolver never disagree.
function resolveFixedPath(pools, seasons, path) {
  const byRound = {};
  for (const step of path || []) {
    const pool = pools.find((p) => p.teamCode === step.code && p.season === step.season);
    if (!pool) continue;
    const five = bestFive(pool);
    if (!five) continue;
    const S = projectRecord(five, seasons).S + OPP_BONUS;
    byRound[step.round] = { pool, five, S, bump: step.bump || 0 };
  }
  return byRound;
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
// `boss` (0 by default) is the Legends-Boss escalation: the postseason opponents get an extra
// strength bump, growing each round (the Final Four are legend-tier), so a legends five romps the
// season but must survive a boss gauntlet for the title. Same value on client + resolver (a pure
// function of the day's theme), so the bracket is reproduced identically for the anti-cheat.
// `fixedPath` (Scenario Daily G.O.A.T.) pins the Playoffs/Semifinal/Final opponents to a team's REAL
// historical bracket, each with a difficulty bump; the regular-season gates and the play-in stay
// generic. A pure function of the day's scenario, so the anti-cheat resolver reproduces it exactly.
export function runPostseason(roster, seasons, pools, wins, sixthMan = null, boss = 0, fixedPath = null) {
  // Scenario brackets are SALTED by the build (the grafts). A locked-base icon scenario otherwise fixes
  // the roster's player codes, so seedFrom() would hand every player the identical bracket and one
  // unlucky RNG would make the day unwinnable for everyone. Salting by the grafted donor codes gives
  // each build its own bracket luck, exactly like the free-base daily. Isomorphic: the client and the
  // resolver build the identical GOAT.source, so the salt matches and the anti-cheat still reproduces it.
  let seed = seedFrom(roster);
  if (fixedPath) {
    const g = roster.find((p) => p && p.source);
    if (g) {
      let h = seed >>> 0;
      for (const k of Object.keys(g.source).sort()) {
        const c = (g.source[k] && g.source[k].playerCode) || "";
        for (let i = 0; i < c.length; i++) h = Math.imul(h ^ c.charCodeAt(i), 16777619) >>> 0;
      }
      seed = h >>> 0;
    }
  }
  const rng = mulberry32(seed);
  const baseS = projectRecord(roster, seasons, undefined, 1, null, sixthMan).S;
  // SEED: reward the regular season. A strong record lifts your bracket strength (high seed / home
  // court); a bubble record drags it down (underdog). This is what makes the Final Four an
  // achievement instead of a coin flip for anyone who scrapes into the playoffs.
  const S = baseS + SEED_COEF * (wins - SEED_PIVOT);
  const table = opponentTable(pools, seasons);
  const fixed = fixedPath ? resolveFixedPath(pools, seasons, fixedPath) : null;
  const used = new Set();
  const rounds = [];

  if (wins < REBUILD_CUT) return { stage: "relegation", label: "Eurocup team.", rounds };
  if (wins < ALMOST_CUT) return { stage: "rebuild", label: "Need to rebuild.", rounds };
  if (wins < PLAYIN_CUT) return { stage: "almost", label: "Almost Postseason.", rounds };

  // 7th-10th: the play-in, in the REAL EuroLeague shape rather than one flat elimination game.
  //   7v8  -> the winner takes the 7th playoff seed; the LOSER drops into the second game
  //   9v10 -> the loser is out
  //   loser(7v8) v winner(9v10) -> the winner takes the last playoff place
  // So a 7th or 8th seed gets TWO bites, and a 9th or 10th seed has to win TWICE. Every play-in
  // team used to play exactly one game, which handed 9th and 10th a far easier route in than the
  // competition does. Seed bands mirror seedFor() in app.js: 23->7th, 22->8th, 21->9th, 20->10th.
  if (wins < PLAYOFF_CUT) {
    const topHalf = wins >= 22; // 7th or 8th
    // Opponent strength follows who you'd actually face. Game one is a PEER (7v8, or 9v10), so it is
    // drawn from a band around your own level; the follow-up is whoever came out of the other tie -
    // stronger if you are 9th/10th (the loser of 7v8), weaker if you are 7th/8th (the 9v10 survivor).
    // Using the old flat band for a 9th seed's opener made it a coin flip against a better side and
    // then a second game on top: 3.7% of 9th seeds reached the playoffs, which is not a play-in, it
    // is a formality.
    const first = pickOpponent(rng, table, topHalf ? 0.26 : 0.36, topHalf ? 0.52 : 0.64, used);
    const g1 = game(rng, S, first.S - PLAYIN_PEER + boss * 0.4);
    rounds.push({ name: topHalf ? "Play-in" : "Play-in R1", opp: first.pool, five: first.five, ...g1 });
    if (topHalf) {
      // lost the 7v8: one more chance, against whoever survived 9v10 — a weaker opponent
      if (!g1.win) {
        const second = pickOpponent(rng, table, 0.36, 0.64, used);
        const g2 = game(rng, S, second.S - PLAYIN_PEER + boss * 0.4);
        rounds.push({ name: "Play-in elimination", opp: second.pool, five: second.five, ...g2 });
        if (!g2.win) return { stage: "playin", label: "Eliminated in the play-in.", rounds };
      }
    } else {
      // 9th/10th: survive the first, then beat a side that finished above you
      if (!g1.win) return { stage: "playin", label: "Eliminated in the play-in.", rounds };
      const second = pickOpponent(rng, table, 0.26, 0.52, used);
      const g2 = game(rng, S, second.S - PLAYIN_PEER + boss * 0.4);
      rounds.push({ name: "Play-in final", opp: second.pool, five: second.five, ...g2 });
      if (!g2.win) return { stage: "playin", label: "Eliminated in the play-in.", rounds };
    }
  }

  const qfFix = fixed && fixed.Playoffs;
  const qfOpp = qfFix || pickOpponent(rng, table, 0, 0.12, used);
  const qf = series(rng, S, qfOpp.S + boss * 0.5 + (qfFix ? qfFix.bump : 0));
  rounds.push({ name: "Playoffs", opp: qfOpp.pool, five: qfOpp.five, series: qf.tally, win: qf.win });
  if (!qf.win) return { stage: "playoffs", label: "Lost in the playoffs.", rounds };

  // Deep-round escalation: the Final Four is a gauntlet. The semi and final opponents get an extra
  // edge (rest, neutral-court, the peak of the field) so even a juggernaut can't sleepwalk to the
  // title — winning it all should mean beating the best when it counts.
  const sfFix = fixed && fixed.Semifinal;
  const sfOpp = sfFix || pickOpponent(rng, table, 0, 0.05, used);
  const sf = game(rng, S, sfOpp.S + 1.2 + boss * 0.85 + (sfFix ? sfFix.bump : 0));
  rounds.push({ name: "Semifinal", opp: sfOpp.pool, five: sfOpp.five, ...sf });
  if (!sf.win) return { stage: "finalfour", label: "Final Four team.", rounds };

  // Final opponent from the top ~2.3% (≈12 club-seasons). Wider than the old top-1.5% (7) so the
  // final isn't the same handful of teams every time — there are genuinely ~a dozen title-calibre
  // rosters. The rng²-weighting still favours the very top, so #1–3 remain the likeliest final boss.
  // The final edge was raised 2.6 → 3.9 to offset the wider (slightly weaker-on-average) pool: with
  // it, no win-bucket beats its pre-widening title rate (perfect-season ~48.5% vs ~49.7% before,
  // 28-31 ~11.2% vs ~10.8%) — verified at N=12000 in sim/bracket_diag.mjs. Variety up, difficulty held.
  const fFix = fixed && fixed.Final;
  const fOpp = fFix || pickOpponent(rng, table, 0, 0.024, used);
  const f = game(rng, S, fOpp.S + 3.9 + boss * 1.0 + (fFix ? fFix.bump : 0));
  rounds.push({ name: "Final", opp: fOpp.pool, five: fOpp.five, ...f });
  if (!f.win) return { stage: "lostfinal", label: "Lost in the final.", rounds };

  return { stage: "champion", label: "EuroLeague Champions.", rounds };
}

// THE BRACKET/SEASON SCORE, shared by Classic and G.O.A.T. Regular season = 100 per win (38-0 →
// 3800). Then the bracket: +100 per playoff game won, −100 per game lost (a best-of-five sweep =
// +300). The two Final Four games (Semifinal + Final) also add their point MARGIN (win by 12 → +12,
// lose by 8 → −8) — the closing-game drama. G.O.A.T. layers award/season bonuses ON TOP of this.
export function classicScore(wins, post) {
  let score = wins * 100;
  for (const r of post.rounds || []) {
    if (r.series) {
      const [w, l] = r.series.split(/[^\d]+/).map(Number); // "3–1" → [3,1]
      score += (w - l) * 100;
    } else {
      score += r.win ? 100 : -100;
      if (r.name === "Semifinal" || r.name === "Final") score += (r.us || 0) - (r.them || 0);
    }
  }
  return score;
}
