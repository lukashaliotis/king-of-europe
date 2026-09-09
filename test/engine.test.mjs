import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRecord, seedFromRoster, gameProbability, CATEGORIES, GAMES, CAT_TYPICAL, DISPLAY_MEAN, DISPLAY_SCALE, FINAL_STAGE, catZ } from "../web/src/engine.js";
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

test("the display reference is separate from the sim's gate constant", () => {
  // CAT_TYPICAL feeds GATE_SHIFT and is calibrated on the BARE FIVE; DISPLAY_MEAN is what the bars
  // and the Team Report are judged against and covers the FINISHED build (five + 6th + coach), which
  // sits about a category-point higher. Collapsing them back into one number would tell every
  // completed team it was above par at everything.
  // They are measured on deliberately different populations — CAT_TYPICAL on a greedy BARE FIVE, and
  // DISPLAY_MEAN on a realistic MIX of finished builds (half casual). So they must not be equal, but
  // neither uniformly dominates: playmaking is lower on the display side precisely because half that
  // sample is a points-chaser who does not pass.
  let differ = 0;
  for (const k of CATEGORIES) if (Math.abs(DISPLAY_MEAN[k] - CAT_TYPICAL[k]) > 1e-9) differ++;
  assert.equal(differ, CATEGORIES.length, "display and sim references have collapsed into one");
  assert.ok(DISPLAY_SCALE > 0);
  for (const k of CATEGORIES) assert.equal(catZ(DISPLAY_MEAN[k], k), 0, `${k}: typical must read as z 0`);
});

test("catZ uses ONE shared scale, so no category is amplified", () => {
  // Per-category standard deviations were tried and rejected: the spreads move with how you draft,
  // so own-sd scoring merely relocated the distortion (2.8x on skilled play, 38x on scattergun).
  const step = CATEGORIES.map((k) => catZ(DISPLAY_MEAN[k] + 1, k));
  for (const s of step) assert.ok(Math.abs(s - step[0]) < 1e-9, "categories are scaled differently");
});

test("the weak link is reasonably even across drafting styles", () => {
  // The whole point of the relative gate is that ANY category can be your weak link. This is the
  // regression guard on that: score/mean used to hand the two small-mean categories the slot 24x
  // more often than the least-named one on a points-chasing draft.
  for (const [mode, limit] of [["skilled", 6], ["casual", 14], ["spread", 16]]) {
    const share = Object.fromEntries(CATEGORIES.map((k) => [k, 0]));
    const bs = builds(500, mode, 1006);
    for (const b of bs) {
      const cs = seasonOf(b).categoryScores;
      let worst = null, wv = Infinity;
      for (const k of CATEGORIES) { const v = catZ(cs[k], k); if (v < wv) { wv = v; worst = k; } }
      share[worst]++;
    }
    const counts = CATEGORIES.map((k) => share[k]);
    const spread = Math.max(...counts) / Math.max(1, Math.min(...counts));
    assert.ok(spread <= limit, `${mode}: weak-link spread ${spread.toFixed(1)}x exceeds ${limit}x — ${JSON.stringify(share)}`);
  }
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

test("an untouched board draws no bars", () => {
  // The bars are drawn WHILE you draft, so "typical" has to mean typical at THIS stage. Judged
  // against a finished team, an empty board — every score exactly 0 — came out as five long bars,
  // which read as though you already had a team before pressing Spin.
  for (const k of CATEGORIES) assert.equal(catZ(0, k, 0), 0, `${k}: an empty board is not neutral`);
});

test("a part-built roster is judged against a part-built roster", () => {
  // Each stage's own reference, so the bars stay meaningful from the first pick rather than telling
  // every partial roster it is far below par at everything.
  const five = pools.find((p) => p.players.length >= 5).players.slice(0, 5);
  for (let n = 1; n <= 5; n++) {
    const res = projectRecord(five.slice(0, n), data.seasons);
    for (const k of CATEGORIES) {
      const z = catZ(res.categoryScores[k], k, n);
      assert.ok(Number.isFinite(z) && Math.abs(z) < 8, `${n} picks, ${k}: z ${z}`);
    }
  }
});

test("the finished-build reference is the default", () => {
  // teamReport and the result card call catZ without a stage; they are always looking at a complete
  // build, so the default must be the finished-build row, not the bare five.
  for (const k of CATEGORIES) {
    assert.equal(catZ(DISPLAY_MEAN[k], k), 0, `${k}: default stage is not the finished build`);
    assert.equal(catZ(DISPLAY_MEAN[k], k, FINAL_STAGE), catZ(DISPLAY_MEAN[k], k));
  }
});
