import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRecord, seedFromRoster, gameProbability, CATEGORIES, GAMES, CAT_TYPICAL, DISPLAY_MEAN, DISPLAY_SCALE, catZ } from "../web/src/engine.js";
import { data, builds, seasonOf, quantile } from "./helpers.mjs";

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
