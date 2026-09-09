import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, catZ } from "../web/src/engine.js";
import { teamReport } from "../web/src/teamreport.js";
import { rosterHas, archetypeOf } from "../web/src/archetypes.js";
import { arenaTier } from "../web/src/arenas.js";
import { data, builds, seasonOf, reportOpts } from "./helpers.mjs";

const SAMPLE = builds(500, "spread", 2001);
const reports = SAMPLE.map((b) => ({ b, res: seasonOf(b), rp: teamReport(seasonOf(b), b.five, reportOpts(b), data) }));
const linesOf = (rp) => [...rp.strengths, ...rp.weaknesses].map((x) => x.text);
const allText = (rp) => linesOf(rp).concat(rp.hint || "");

test("every report answers the question the result screen asked", () => {
  for (const { rp } of reports) {
    assert.ok(rp.strengths.length > 0, "empty Strengths list");
    assert.ok(rp.weaknesses.length > 0, "empty Weaknesses list");
    assert.ok(rp.hint, "no Fix");
  }
});

test("a category is never both a strength and a weakness", () => {
  for (const { rp } of reports) {
    const s = new Set(rp.strengths.map((x) => x.cat));
    for (const w of rp.weaknesses) assert.ok(!s.has(w.cat), `${w.cat} is in both lists`);
  }
});

test("no line ever renders a broken value", () => {
  for (const { rp } of reports) {
    for (const t of allText(rp)) {
      assert.doesNotMatch(t, /undefined|NaN|null|\[object/, `broken text: ${t}`);
      assert.doesNotMatch(t, /[—–]/, `em/en dash (the app uses plain hyphens): ${t}`);
      assert.doesNotMatch(t, /\bA a |\bA an |\ban a /, `double article: ${t}`);
    }
  }
});

test("the named weak point is the shortest bar", () => {
  // The report and the bars must rank categories in the SAME measure. They once used score/mean and
  // score-mean respectively and disagreed 55% of the time, so the write-up argued with the picture.
  for (const { res, rp } of reports) {
    let worst = null, wv = Infinity;
    for (const k of CATEGORIES) { const v = catZ(res.categoryScores[k], k); if (v < wv) { wv = v; worst = k; } }
    assert.equal(rp.gate, worst, "the report's gate is not the shortest bar");
  }
});

test("bright spots are capped by team quality", () => {
  for (const { res, rp } of reports) {
    const q = res.expectedWins;
    const cap = q < 12 ? 1 : q < 22 ? 2 : 3;
    assert.ok(rp.strengths.length <= cap, `${rp.strengths.length} strengths at ${q.toFixed(1)} expected wins (cap ${cap})`);
  }
});

test("the Fix never prescribes what the five already has", () => {
  // The Pleiss case: the report told a team holding a stretch big to go and sign a stretch big.
  const NEED = { efficiency: "spacing", rebounding: "glass", playmaking: "creator", interior: "rim" };
  const GENERIC = /^(Add a shot-creator|A physical rebounding big|A pass-first floor general|A rim-protecting big|A perimeter defender|A reliable outside shooter)/;
  const ABSENCE = /\bNo\b|Nobody|Not enough playmaking|Little resistance/;
  for (const { b, rp } of reports) {
    const prim = rp.weaknesses.find((w) => w.cat === "interior") || rp.weaknesses[0];
    if (!prim) continue;
    const need = NEED[prim.cat];
    // A finding that states a TEAM-LEVEL absence is correctly answered by "sign one" even when an
    // individual clears the individual bar, so those are out of scope here.
    if (!need || ABSENCE.test(prim.text)) continue;
    if (GENERIC.test(rp.hint) && rosterHas(b.five, need, data)) {
      assert.fail(`Fix asks for ${need} the five already has:\n  ${prim.text}\n  ${rp.hint}`);
    }
  }
});

test("a finding that asserts absence is never contradicted by the Fix", () => {
  for (const { rp } of reports) {
    if (!/already/.test(rp.hint || "")) continue;
    const cap = (rp.hint.match(/rim protection|floor spacing|rebounding|creation|perimeter defense/) || [])[0];
    if (!cap) continue;
    for (const w of rp.weaknesses) {
      assert.doesNotMatch(w.text, new RegExp("No .*" + cap.split(" ")[0], "i"),
        `weakness says there is none, Fix says there is:\n  ${w.text}\n  ${rp.hint}`);
    }
  }
});

test("praise never lands on a category the report just marked down", () => {
  for (const { rp } of reports) {
    for (const s of rp.strengths) {
      const m = s.text.match(/elite (scoring|rebounding|playmaking|defense|efficiency)|props up the (\w+)/);
      if (!m) continue;
      const cat = m[1] || m[2];
      assert.ok(!rp.weaknesses.some((w) => w.cat === cat), `praises ${cat} while listing it as a weakness`);
    }
  }
});

test("arena wording matches the flames the player can see", () => {
  for (const { b, rp } of reports) {
    if (!b.arena) continue;
    const tier = arenaTier(b.arena.rating);
    const says = allText(rp).some((t) => /real edge|genuine fortress/.test(t));
    if (says) assert.ok(tier >= 4, `calls a ${tier}-flame building an edge`);
  }
});

test("a lopsided lineup gets its shape named", () => {
  // 26% of real drafts are structurally odd; the report used to hand over the symptoms and never the
  // single fact causing them.
  const SHAPE = /true big|by design|outsized|play out on the arc|nobody is left on the glass|Three guards|share the floor|natural point guard|Only one guard/i;
  let odd = 0, silent = 0;
  for (const { b, rp } of reports) {
    const bigs = b.five.filter((p) => p.interior);
    const guards = b.five.filter((p) => p.pos === "G");
    const stretch = bigs.filter((p) => { const a = archetypeOf(p, data); return a && a.key === "stretch_big"; });
    const wk = new Set(rp.weaknesses.map((w) => w.cat));
    const shapeHurts =
      (((bigs.length <= 1) || (bigs.length >= 2 && stretch.length === bigs.length) || guards.length >= 3) && (wk.has("rebounding") || wk.has("interior")))
      || (bigs.length >= 3 && wk.has("efficiency"))
      || ((guards.length <= 1 || !guards.some((p) => p.pos5 === "PG")) && wk.has("playmaking"));
    if (!shapeHurts) continue;
    odd++;
    if (!allText(rp).some((t) => SHAPE.test(t))) silent++;
  }
  assert.ok(odd > 50, `only ${odd} lopsided lineups in the sample — the test is not exercising anything`);
  assert.equal(silent, 0, `${silent} of ${odd} lopsided lineups never had the shape named`);
});

test("a champion gets a victory lap, not a critique", () => {
  for (const { b, res } of reports.slice(0, 120)) {
    const rp = teamReport(res, b.five, reportOpts(b, { champion: true }), data);
    assert.equal(rp.weaknesses.length, 0, "champion report still lists weaknesses");
    assert.equal(rp.hint, null, "champion report still prescribes a Fix");
    assert.ok(rp.triumph, "champion report has no closing line");
  }
});

test("filler lines stay rare", () => {
  const GENERIC = [/Not enough scoring across the five/, /The team is outrebounded on the whole/,
    /Too many contested, low-value shots/, /Not enough ball movement or creation/];
  let generic = 0, total = 0;
  for (const { rp } of reports) {
    const ls = linesOf(rp);
    total += ls.length;
    generic += ls.filter((t) => GENERIC.some((r) => r.test(t))).length;
  }
  const pct = 100 * generic / total;
  assert.ok(pct < 10, `${pct.toFixed(1)}% of lines are generic filler (was 31.6% before the rewrite)`);
});
