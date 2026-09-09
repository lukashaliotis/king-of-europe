// Print the TOP of the opponent table — the club-seasons the bracket draws from — to see whether the
// deep-round / final opponents are "random" or genuinely the strongest paper teams. Mirrors the
// ranking in postseason.js (best-five S + OPP_BONUS, depth-adjusted rankS) so what we print is
// exactly what the game samples from.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);

const SLOT_POS = ["G", "G", "F", "F", "C"];
const OPP_BONUS = 5.0, DEPTH_WEIGHT = 0.15;

function bestFive(pool) {
  const slots = [null, null, null, null, null];
  for (const p of pool.players) {
    const i = SLOT_POS.findIndex((pos, idx) => pos === p.pos && !slots[idx]);
    if (i >= 0) slots[i] = p;
    if (slots.every(Boolean)) break;
  }
  return slots.every(Boolean) ? slots : null;
}

const list = [];
for (const pool of pools) {
  const five = bestFive(pool);
  if (!five) continue;
  const proj = projectRecord(five, seasons); // NOTE: no coach, no arena, no 6th man for opponents
  const S = proj.S + OPP_BONUS;
  const starters = new Set(five.map((p) => p.playerCode));
  let depth = 0;
  for (const p of pool.players) {
    if (starters.has(p.playerCode)) continue;
    depth += Math.max(0, playerStrength(p, seasons));
  }
  list.push({ pool, five, S, proj, rankS: S + DEPTH_WEIGHT * depth });
}
list.sort((a, b) => b.rankS - a.rankS);

const surname = (n) => n.split(",")[0].replace(/[^A-Za-z\- ]/g, "").trim();
console.log(`opponent table: ${list.length} club-seasons\n`);
console.log("FINAL is drawn from top 1.5% =", Math.max(1, Math.floor(0.015 * list.length)), "teams");
console.log("SEMI  is drawn from top 5%   =", Math.max(1, Math.floor(0.05 * list.length)), "teams\n");
const CATS = ["scoring", "rebounding", "playmaking", "defense", "efficiency"];
console.log("rank  rankS  club-season                     sco reb pmk def eff  gate");
list.slice(0, 14).forEach((r, i) => {
  const cs = r.proj.categoryScores;
  const cells = CATS.map((k) => (cs[k] ?? 0).toFixed(1).padStart(4)).join("");
  const tag = `${r.pool.teamName} ${r.pool.seasonLabel}`;
  console.log(`${String(i + 1).padStart(3)}  ${r.rankS.toFixed(2).padStart(6)}  ${tag.padEnd(30).slice(0, 30)} ${cells}  ${r.proj.gateCategory}`);
});
console.log("\n(opponent S/categories use best-five ONLY — no coach, no arena, no 6th man)");
