// Validate the Tier-1 model changes do what they claim:
//   (a) efficiency is usage-weighted, not summed
//   (b) usage collision damps ball-dominant categories
//   (c) the soft-min gate punishes a SECOND sagging category
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS, playerUsage, CATEGORIES } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT = ["G", "G", "F", "F", "C"];

const qualified = data.players.filter((p) => p.q && p.mpg > 0 && p.box);

// Build a legal five from a candidate list, greedily by a scoring function.
function fiveBy(rank) {
  const sorted = [...qualified].sort(rank);
  const slots = [null, null, null, null, null];
  for (const p of sorted) {
    const i = SLOT.findIndex((pos, idx) => pos === p.pos && !slots[idx]);
    if (i >= 0) slots[i] = { ...p, _src: { teamCode: p.teamCode } };
    if (slots.every(Boolean)) break;
  }
  return slots;
}

const hogs = fiveBy((a, b) => playerUsage(b) - playerUsage(a));          // max usage
const spread = fiveBy((a, b) => playerUsage(a) - playerUsage(b));        // min usage
const scorers = fiveBy((a, b) => b.cat.scoring - a.cat.scoring);         // max points

const show = (name, five) => {
  const usage = five.reduce((a, p) => a + playerUsage(p), 0);
  const off = projectRecord(five, data.seasons, { collisionK: 0, softMinBeta: 0 });
  const on = projectRecord(five, data.seasons);
  console.log(
    `${name.padEnd(10)} usage ${usage.toFixed(2)}  collision ×${on.collision.toFixed(3)}  ` +
    `scoring ${off.categoryScores.scoring.toFixed(1)}→${on.categoryScores.scoring.toFixed(1)}  ` +
    `eff ${off.categoryScores.efficiency.toFixed(1)}→${on.categoryScores.efficiency.toFixed(1)}  ` +
    `gate ${off.gate.toFixed(2)}→${on.gate.toFixed(2)}  wins ${off.wins}→${on.wins}`
  );
};

console.log("=== (a)+(b) usage weighting + collision, on real fives ===");
show("ball-hogs", hogs);
show("low-usage", spread);
show("scorers", scorers);

console.log("\n=== (c) soft-min: one hole vs two ===");
// synthetic category vectors through the same transform the engine uses
function gateOf(vals, beta) {
  const m = Math.min(...vals);
  if (!beta) return m;
  let s = 0;
  for (const v of vals) s += Math.exp(-beta * (v - m));
  return m - Math.log(s / vals.length) / beta;
}
const cases = {
  balanced: [6, 6, 6, 6, 6],
  "one hole": [0, 8, 8, 8, 8],
  "two holes": [0, 0, 8, 8, 8],
  "three holes": [0, 0, 0, 8, 8],
};
for (const [k, v] of Object.entries(cases)) {
  console.log(`${k.padEnd(12)} hard-min ${gateOf(v, 0).toFixed(2)}   soft-min ${gateOf(v, DEFAULT_PARAMS.softMinBeta).toFixed(2)}`);
}

console.log("\n=== efficiency: does a high-usage chucker hurt more than a low-usage one? ===");
// swap one starter for a same-position player with poor TS%, at high vs low usage
const base = fiveBy((a, b) => b.cat.scoring - a.cat.scoring);
const guards = qualified.filter((p) => p.pos === "G" && p.cat.efficiency < 0.45 && p.gp >= 10);
const hiUse = [...guards].sort((a, b) => playerUsage(b) - playerUsage(a))[0];
const loUse = [...guards].sort((a, b) => playerUsage(a) - playerUsage(b))[0];
for (const [tag, pl] of [["high-usage", hiUse], ["low-usage", loUse]]) {
  if (!pl) continue;
  const five = [...base];
  five[0] = { ...pl, _src: { teamCode: pl.teamCode } };
  const r = projectRecord(five, data.seasons);
  console.log(`${tag.padEnd(11)} ${pl.playerName.padEnd(26)} TS ${(pl.cat.efficiency * 100).toFixed(0)}%  ` +
    `usage ${playerUsage(pl).toFixed(2)}  team eff ${r.categoryScores.efficiency.toFixed(2)}`);
}
