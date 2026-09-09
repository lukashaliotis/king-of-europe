import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRecord, mulberry32, gameProbability } from "../web/src/engine.js";
import { runPostseason } from "../web/src/postseason.js";
import { coachDeltas } from "../web/src/coaches.js";
import { playerCost, canAfford, SALARY_CAP } from "../web/src/salary.js";
import { COACH_FLOOR_PRICE } from "../web/src/coaches.js";
import { data, pools, builds, seasonOf, quantile, SLOT, stamp } from "./helpers.mjs";
import { spin } from "../web/src/data.js";

// Difficulty is the thing most easily broken by accident: a constant nudged in the engine, a new
// bonus layered on, a threshold moved. These are deliberately WIDE — they are tripwires for a real
// shift, not a pin on the exact numbers, which move a little with any tuning.
const band = (label, value, lo, hi) =>
  assert.ok(value >= lo && value <= hi, `${label}: ${value} outside the expected ${lo}-${hi}`);

test("Classic sits where it was calibrated", () => {
  const casual = builds(700, "casual", 4242).map((b) => seasonOf(b).wins);
  const skilled = builds(700, "skilled", 4242).map((b) => seasonOf(b).wins);
  band("casual median", quantile(casual, 0.5), 11, 20);
  band("skilled median", quantile(skilled, 0.5), 25, 33);
  band("skilled p90", quantile(skilled, 0.9), 33, 38);
  const perfect = 100 * skilled.filter((w) => w === 38).length / skilled.length;
  band("skilled 38-0 rate %", perfect, 0.5, 6);
  const winless = 100 * casual.filter((w) => w === 0).length / casual.length;
  band("casual 0-38 rate %", winless, 0, 2);
});

test("a perfect season stays out of reach for a casual five", () => {
  const casual = builds(700, "casual", 909).map((b) => seasonOf(b).wins);
  const perfect = 100 * casual.filter((w) => w === 38).length / casual.length;
  assert.ok(perfect < 1.5, `casual play reaches 38-0 ${perfect.toFixed(2)}% of the time`);
});

test("skill beats luck", () => {
  const casual = builds(500, "casual", 77).map((b) => seasonOf(b).wins);
  const skilled = builds(500, "skilled", 77).map((b) => seasonOf(b).wins);
  const gap = quantile(skilled, 0.5) - quantile(casual, 0.5);
  assert.ok(gap >= 8, `only ${gap} median wins between casual and skilled play`);
});

test("Salary is more forgiving than Classic, but not a different game", () => {
  // The captain is free and multiplies his own contribution, which is what makes Salary the relaxed
  // mode. At a straight doubling it produced a 38-0 in 13% of skilled builds against Classic's 2% —
  // seven times easier, on a mode with its own leaderboard.
  const rng = mulberry32(909);
  const wins = [];
  for (let i = 0; i < 700; i++) {
    const slots = [null, null, null, null, null]; const used = new Set();
    const open = (pos) => SLOT.findIndex((p, j) => p === pos && !slots[j]);
    let picks = 0, guard = 0, spent = 0;
    while (picks < 5 && guard++ < 120) {
      const pool = spin(pools, rng); const here = slots.filter(Boolean);
      let best = null, bk = -Infinity;
      for (const c of pool.players) {
        if (used.has(c.playerCode) || open(c.pos) < 0) continue;
        if (!canAfford(spent, playerCost(c), (5 - picks - 1) + 1, SALARY_CAP - COACH_FLOOR_PRICE)) continue;
        const r = projectRecord([...here, c], data.seasons);
        if (r.S > bk) { bk = r.S; best = { c, i: open(c.pos), pool }; }
      }
      if (!best) continue;
      slots[best.i] = stamp(best.c, best.pool); used.add(best.c.playerCode);
      spent += playerCost(best.c); picks++;
    }
    const five = slots.filter(Boolean); if (five.length !== 5) continue;
    let captain = null, cb = -Infinity;
    for (const p of five) { const r = projectRecord(five, data.seasons, undefined, 1, null, null, p.playerCode); if (r.S > cb) { cb = r.S; captain = p.playerCode; } }
    wins.push(projectRecord(five, data.seasons, undefined, 1, null, null, captain).wins);
  }
  // No coach or arena in this build, so the absolute rate sits below the full-stack figure in
  // sim/mode_balance.mjs — the guard that matters is the CEILING, which is what the free captain blew
  // through. (Full stack: Salary 3.9% against Classic 2.2%.)
  const perfect = 100 * wins.filter((w) => w === 38).length / wins.length;
  assert.ok(perfect < 7, `Salary skilled reaches 38-0 ${perfect.toFixed(2)}% of the time — the captain is unpriced again`);
  band("Salary skilled median", quantile(wins, 0.5), 22, 35);
});

test("the captain is a boost, not a cheat code", () => {
  const five = builds(200, "skilled", 5150).map((b) => b.five);
  let lifts = 0, huge = 0;
  for (const f of five) {
    const base = projectRecord(f, data.seasons).S;
    let best = base;
    for (const p of f) { const s = projectRecord(f, data.seasons, undefined, 1, null, null, p.playerCode).S; if (s > best) best = s; }
    if (best > base) lifts++;
    if (best > base * 1.6) huge++;
  }
  assert.ok(lifts > five.length * 0.7, "the captain barely does anything");
  assert.ok(huge < five.length * 0.15, `the captain multiplies S by >1.6x on ${huge}/${five.length} fives`);
});

test("a Versus duel favours the better team without being a formality", () => {
  const bo7 = (p) => { let s = 0; for (let k = 4; k <= 7; k++) { let c = 1; for (let j = 0; j < k - 4; j++) c = c * (4 + j) / (j + 1); s += c * p ** 4 * (1 - p) ** (k - 4); } return s; };
  assert.ok(bo7(gameProbability(0, 0)) > 0.49 && bo7(gameProbability(0, 0)) < 0.51, "an even duel is not a coin flip");
  const close = bo7(gameProbability(1.5, 0));
  band("bo7 win% at a 1.5 S edge", close * 100, 52, 70);
  const wide = bo7(gameProbability(12, 0));
  assert.ok(wide > 0.9, `a 12-point S edge only wins ${(wide * 100).toFixed(0)}% of series`);
});

test("the postseason rewards the regular season", () => {
  const five = builds(120, "skilled", 6001).map((b) => b.five);
  const reach = (wins) => five.filter((f) => {
    const s = runPostseason(f, data.seasons, pools, wins, null, 0).stage;
    return !["relegation", "rebuild", "almost", "playin"].includes(s);
  }).length / five.length;
  assert.ok(reach(20) < reach(24), "20 wins reaches the playoffs as often as 24");
  assert.ok(reach(24) <= reach(31) + 0.05, "a 31-win season is no better than 24");
});
