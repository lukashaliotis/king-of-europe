import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRecord, seedFromRoster, gameProbability, CATEGORIES, GAMES, CAT_TYPICAL, catRatio, catZ } from "../web/src/engine.js";
import { catBarGeom, weakestBarCat } from "../web/src/catbars.js";
import { coachDeltas } from "../web/src/coaches.js";
import { data, pools, builds, seasonOf, quantile } from "./helpers.mjs";

test("a projection is always finite and in range", () => {
  for (const b of builds(400, "spread", 1001)) {
    const r = seasonOf(b);
    for (const k of ["wins", "losses", "S", "strength", "gate", "p", "expectedWins"]) {
      assert.ok(Number.isFinite(r[k]), `${k} is ${r[k]}`);
    }
    for (const k of CATEGORIES) assert.ok(Number.isFinite(r.categoryScores[k]), `categoryScores.${k}`);
    assert.ok(r.wins >= 0 && r.wins <= GAMES, `wins out of range: ${r.wins}`);
    assert.equal(r.wins + r.losses, GAMES);
    assert.ok(r.p >= 0 && r.p <= 1, `p out of range: ${r.p}`);
  }
});

test("the same five always produces the same season", () => {
  for (const b of builds(60, "skilled", 1002)) {
    const a = seasonOf(b), c = seasonOf(b);
    assert.equal(a.wins, c.wins);
    assert.equal(a.S, c.S);
  }
});

test("draft ORDER never changes the season", () => {
  // seedFromRoster sorts the player codes precisely so that picking the same five in a different
  // order cannot hand you a different 38 games. If this breaks, two players with identical teams
  // would post different records.
  for (const b of builds(60, "skilled", 1003)) {
    const straight = seasonOf(b);
    const reversed = seasonOf({ ...b, five: [...b.five].reverse() });
    assert.equal(straight.wins, reversed.wins, "reversing the draft order changed the record");
    assert.equal(seedFromRoster(b.five), seedFromRoster([...b.five].reverse()));
  }
});

test("a sixth man never makes a team worse", () => {
  // The engine only adds his POSITIVE category z's — a substitute cannot drag the starters down.
  for (const b of builds(120, "spread", 1004)) {
    if (!b.sixth) continue;
    const withHim = seasonOf(b).S;
    const without = seasonOf({ ...b, sixth: null }).S;
    assert.ok(withHim >= without - 1e-9, `sixth man cost ${(without - withHim).toFixed(3)} S`);
  }
});

test("gameProbability is symmetric and bounded", () => {
  for (const [a, b] of [[10, 10], [20, 5], [0, 30], [-5, 5]]) {
    const p = gameProbability(a, b);
    assert.ok(p > 0 && p < 1, `p=${p}`);
    assert.ok(Math.abs(p + gameProbability(b, a) - 1) < 1e-9, "not symmetric");
  }
  assert.equal(gameProbability(7, 7), 0.5);
});

test("floor spacing is derived, bounded and era-relative", () => {
  const xs = data.players.filter((p) => p.box).map((p) => p.spacing);
  assert.ok(xs.length > 5000, "spacing was not derived onto the players");
  for (const z of xs) assert.ok(Number.isFinite(z) && Math.abs(z) < 8, `implausible spacing z: ${z}`);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean) < 0.35, `spacing should centre near 0 across the league, got ${mean.toFixed(2)}`);
  // era-relative: a pre-2010 roster must not be marked down simply for its decade's shot diet
  const era = (lo, hi) => { const s = data.players.filter((p) => p.box && p.season >= lo && p.season <= hi).map((p) => p.spacing);
    return s.reduce((a, b) => a + b, 0) / s.length; };
  assert.ok(Math.abs(era(2001, 2009) - era(2016, 2025)) < 0.3, "spacing drifts by era — the baseline is not era-relative");
});

test("the spacing term only ever damps, and only what a packed paint costs", () => {
  // Same guarantee the usage collision gives: crowding cannot make you BETTER at anything, and it
  // must not touch rebounding or defense — a lineup of bigs really does board and block.
  for (const b of builds(200, "spread", 1007)) {
    const on = seasonOf(b);
    const off = projectRecord(b.five, data.seasons, { spacingK: 0 }, b.mult,
      b.coach ? coachDeltas(b.coach) : null, b.sixth);
    for (const k of CATEGORIES) {
      assert.ok(on.categoryScores[k] <= off.categoryScores[k] + 1e-9, `${k} was RAISED by the spacing term`);
    }
    for (const k of ["rebounding", "defense", "playmaking"]) {
      assert.ok(Math.abs(on.categoryScores[k] - off.categoryScores[k]) < 1e-9, `${k} should be untouched by spacing`);
    }
  }
});

test("a roster with no spacing data behaves exactly as before", () => {
  // sim harnesses and tests call projectRecord on raw player rows that never went through
  // data.js deriveSpacing; those must not be silently penalised.
  for (const b of builds(60, "skilled", 1008)) {
    const bare = b.five.map(({ spacing, ...rest }) => rest);
    const a = projectRecord(bare, data.seasons);
    const c = projectRecord(bare, data.seasons, { spacingK: 0 });
    assert.equal(a.S, c.S, "a roster without spacing data was penalised anyway");
  }
});

test("stacking bigs is no longer a free optimum", () => {
  // Before the term, team spacing correlated -0.14 with S and -0.11 with wins: interior players post
  // the rebounds and blocks the engine rewards, so the sim PAID you for the crowded paint the Team
  // Report was warning you about. It should not reach zero — a lineup of bigs genuinely does rebound.
  const rows = builds(500, "spread", 1009).map((b) => ({
    sp: b.five.reduce((a, p) => a + (p.spacing || 0), 0) / 5, wins: seasonOf(b).wins }));
  const n = rows.length;
  const ms = rows.reduce((a, r) => a + r.sp, 0) / n, mw = rows.reduce((a, r) => a + r.wins, 0) / n;
  let nu = 0, ds = 0, dw = 0;
  for (const r of rows) { const x = r.sp - ms, y = r.wins - mw; nu += x * y; ds += x * x; dw += y * y; }
  const corr = nu / Math.sqrt(ds * dw);
  assert.ok(corr > -0.13, `spacing still correlates ${corr.toFixed(3)} with wins — the term has stopped biting`);
});

test("the bars build as you draft instead of oscillating", () => {
  // Lukas asked for this twice. A centre-anchored bar is arguably more informative and is much worse
  // to watch: a part-built roster is below a finished one in every category, so the bars sit left of
  // centre and lurch about with every pick. The bar is a share of typical, so it grows.
  let steps = 0, backwards = 0;
  for (const b of builds(150, "skilled", 1010)) {
    let prev = CATEGORIES.map(() => 0);
    for (let n = 1; n <= 5; n++) {
      const cs = projectRecord(b.five.slice(0, n), data.seasons).categoryScores;
      const now = CATEGORIES.map((k) => { const g = catBarGeom(cs[k], k); return g.left >= 50 ? g.width : -g.width; });
      for (let i = 0; i < CATEGORIES.length; i++) { steps++; if (now[i] < prev[i] - 1e-9) backwards++; }
      prev = now;
    }
  }
  const pct = 100 * backwards / steps;
  assert.ok(pct < 22, `${pct.toFixed(1)}% of pick-to-pick bar moves go backwards — the bars are oscillating`);
});

test("an untouched board draws no bars at all", () => {
  for (const k of CATEGORIES) {
    assert.equal(catRatio(0, k), 0, `${k}: an empty board is not zero`);
    assert.equal(catBarGeom(0, k).width, 0, `${k}: an empty board still draws a bar`);
  }
});

test("the shortest bar IS the category the report names", () => {
  // One measure for the geometry and the label, so the picture and the words can never disagree.
  for (const b of builds(300, "spread", 1011)) {
    const cs = seasonOf(b).categoryScores;
    let worst = null, wv = Infinity;
    for (const k of CATEGORIES) { const g = catBarGeom(cs[k], k); const signed = g.left >= 50 ? g.width : -g.width;
      if (signed < wv) { wv = signed; worst = k; } }
    assert.equal(weakestBarCat(cs), worst, "the highlighted category is not the shortest bar");
  }
});

test("catZ orders categories exactly as the bars do", () => {
  for (const b of builds(200, "spread", 1012)) {
    const cs = seasonOf(b).categoryScores;
    const byZ = [...CATEGORIES].sort((a, c) => catZ(cs[a], a) - catZ(cs[c], c));
    const byRatio = [...CATEGORIES].sort((a, c) => catRatio(cs[a], a) - catRatio(cs[c], c));
    assert.deepEqual(byZ, byRatio, "the report and the bars would rank categories differently");
  }
});
