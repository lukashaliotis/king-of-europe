import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { archetypeOf, capsOf, traitsOf, ARCHETYPE } from "../web/src/archetypes.js";
import { data } from "./helpers.mjs";

const row = (frag, season) =>
  data.players.find((p) => p.box && p.season === season && p.playerName.toUpperCase().includes(frag.toUpperCase()));

test("the prototype harness still passes", () => {
  // sim/archetype_check.mjs pins named seasons of players whose identity is not in dispute. Any rule
  // tweak that quietly re-labels the league fails here first.
  const out = execFileSync("node", ["sim/archetype_check.mjs"], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
  assert.match(out, /pass 27 \/ 27/, out);
});

test("every player gets exactly one known label", () => {
  let n = 0;
  for (const p of data.players) {
    if (!p.box) continue;
    const a = archetypeOf(p, data);
    assert.ok(a && ARCHETYPE[a.key], `${p.playerName}: unknown archetype ${a && a.key}`);
    assert.ok(a.label && a.need, `${p.playerName}: archetype missing display text`);
    n++;
  }
  assert.ok(n > 5000, `only ${n} players labelled`);
});

test("capabilities are position-appropriate", () => {
  // Anthony Parker, a 1.98m guard, once came back with rim protection AND rebounding because both
  // were judged position-relative. The Fix would then tell a team it already had a rim protector.
  for (const p of data.players) {
    if (!p.box) continue;
    const caps = archetypeOf(p, data).caps;
    if (p.pos === "G") {
      assert.equal(caps.rim, false, `${p.playerName} (guard) credited with rim protection`);
      assert.equal(caps.glass, false, `${p.playerName} (guard) credited with team rebounding`);
    }
    if (p.interior) assert.equal(caps.stopper, false, `${p.playerName} (big) credited with perimeter defense`);
  }
});

test("the label is season-specific, not a reputation", () => {
  // Pleiss took zero threes in 2013 and 2.7 a game at 44% in 2023. The game drafts a club-SEASON, so
  // the label has to describe the man who played that year.
  const early = row("PLEISS", 2013), late = row("PLEISS", 2023);
  assert.ok(early && late);
  assert.equal(archetypeOf(late, data).key, "stretch_big", "late Pleiss should be a stretch big");
  assert.notEqual(archetypeOf(early, data).key, "stretch_big", "2013 Pleiss took no threes at all");
});

test("a capability can hold even when the label is something else", () => {
  // Caps are deliberately decoupled from the headline label: a volume scorer taking six threes a game
  // still spaces the floor. Tying the two together is what produced the Pleiss bug.
  const v = row("VUJACIC", 2011);
  assert.ok(v);
  const a = archetypeOf(v, data);
  assert.equal(a.caps.spacing, true, "Vujacic shot 5 threes a game and reads as no spacing");
});

test("thresholds sit off values the data lands on exactly", () => {
  // 1.7 of 5.0 is 0.33999999999999997 in binary floating point and failed a `>= 0.34` test by 1e-17.
  const v = row("VUJACIC", 2011);
  const t = traitsOf(v, data);
  assert.ok(t.outsideAcc >= 0.33, "the sniper accuracy floor is back on a knife edge");
});

test("capsOf is pure and total", () => {
  for (const p of data.players.slice(0, 800)) {
    if (!p.box) continue;
    const t = traitsOf(p, data);
    const caps = capsOf(t, p);
    for (const k of ["spacing", "rim", "glass", "creator", "stopper"]) {
      assert.equal(typeof caps[k], "boolean", `caps.${k} is not a boolean`);
    }
  }
});
