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

test("a claim about a player's role agrees with his archetype", () => {
  // The report told a team that Luka Doncic was "the only perimeter defender on the roster". His
  // steals as an 18-year-old cleared the stopper bar and defense was the listed weakness, so a fixed
  // walk through the capabilities picked it — about a volume scorer. What a player's numbers DO and
  // what he can be CALLED are different questions.
  for (const { b, rp } of reports) {
    const claim = [...rp.strengths, ...rp.weaknesses].map((x) => x.text)
      .find((t) => /only .+ on the roster|comes from .+, off the bench/.test(t));
    if (!claim || !b.sixth) continue;
    const sa = archetypeOf(b.sixth, data);
    assert.ok(sa && sa.supplies, `claims a role for a ${sa && sa.key}, which supplies nothing: ${claim}`);
    assert.ok(sa.caps[sa.supplies], `claims a role his own numbers do not support: ${claim}`);
  }
});

test("a volume scorer is never described as a defender", () => {
  const luka = data.players.find((p) => p.season === 2017 && /DONČIĆ/.test(p.playerName));
  assert.ok(luka, "Doncic 2017 is no longer in the dataset");
  const a = archetypeOf(luka, data);
  assert.equal(a.key, "volume_scorer");
  assert.ok(!a.supplies, "a volume scorer should not be claimable as anything else");
});

test("a Fix ends with something to DO", () => {
  // The "you already have one" family used to stop at the diagnosis — "X already gives you floor
  // spacing, the other four give defenses nothing to worry about outside" says what is fine and then
  // stops, which is why it read as filler however rarely it fired.
  const ADVISES = /\b(would|should|needs?|put|add|trade|swap|the fix is|has to be|is the signing)\b/i;
  for (const { rp } of reports) {
    assert.ok(ADVISES.test(rp.hint), `Fix gives no instruction: ${rp.hint}`);
  }
});

test("plural agreement holds when names are listed", () => {
  for (const { rp } of reports) {
    for (const t of [...rp.strengths, ...rp.weaknesses].map((x) => x.text).concat(rp.hint || "")) {
      assert.doesNotMatch(t, /,.*&.*\bboth\b/, `three names and "both": ${t}`);
      assert.doesNotMatch(t, /&[^,]*\ball of\b/, `two names and "all": ${t}`);
    }
  }
});

test("the bench shout-out reads as a strength", () => {
  // It sits under Strengths, so it must not lead with the gap: "Your best creation comes from X, off
  // the bench - the one thing this five is short of" was a complaint wearing a strength's clothes.
  for (const { rp } of reports) {
    for (const s of rp.strengths) {
      assert.doesNotMatch(s.text, /the one thing this five is short of/, `a Strength that reads as a complaint: ${s.text}`);
    }
  }
});
