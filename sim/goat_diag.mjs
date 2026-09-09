// Diagnose why a specific GOAT team underperforms: reconstruct it and print the engine internals
// (per-category team scores, the gate, the usage collision, S, expected wins).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, categoryZ, playerStrength, playerUsage, DEFAULT_PARAMS, CATEGORIES } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { buildGoat, goatFive } from "../web/src/goat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const surname = (n) => n.split(",")[0];

const home = pools.find((p) => /Olympiacos Piraeus 2012-13/.test(`${p.teamName} ${p.seasonLabel}`));
const base = home.players.find((p) => /SLOUKAS/i.test(p.playerName));

// find a donor by surname whose stat is closest to the screenshot value
const findDonor = (name, statFn, target) =>
  data.players.filter((p) => p.q && new RegExp(name, "i").test(p.playerName))
    .sort((a, b) => Math.abs(statFn(a) - target) - Math.abs(statFn(b) - target))[0];

const donors = {
  pts: findDonor("FORD", (p) => p.box.pts, 24.6),
  reb: findDonor("AUGUSTINE", (p) => p.box.reb, 6.8),
  ast: findDonor("CALATHES", (p) => p.box.ast, 8.1),
  stl: findDonor("SOLOMON", (p) => p.box.stl, 2.2),
  blk: findDonor("TYUS", (p) => p.box.blk, 1),
};
console.log("BASE:", surname(base.playerName), "TS", (base.box.ts * 100 | 0) + "%");
for (const [s, d] of Object.entries(donors)) console.log(`donor ${s}: ${d ? surname(d.playerName) + " (" + d.playerName.split(",")[1]?.trim() + ", " + d.teamCode + " " + d.season + ")  ast=" + d.box.ast + " tov(implied)=" + (d.box.ast - d.cat.playmaking).toFixed(1) + " playmaking=" + d.cat.playmaking.toFixed(1) : "NOT FOUND"}`);

const grafts = Object.entries(donors).filter(([, d]) => d).map(([stat, donor]) => ({ stat, donor }));
const goat = buildGoat(base, grafts);
console.log("\nGOAT box:", JSON.stringify(goat.box));
console.log("GOAT cat:", Object.fromEntries(Object.entries(goat.cat).map(([k, v]) => [k, +(+v).toFixed(2)])));
console.log("GOAT categoryZ (vs guard baseline):", Object.fromEntries(Object.entries(categoryZ(goat, seasons)).map(([k, v]) => [k, +v.toFixed(2)])));
console.log("GOAT usage(fga/mpg):", playerUsage(goat).toFixed(2), " strength:", playerStrength(goat, seasons).toFixed(1));

const five = goatFive(goat, home, seasons);
console.log("\nFIVE:", five.map((p) => `${p.pos}:${p.goat ? "★" + surname(p.playerName) : surname(p.playerName)}`).join("  "));
console.log("per-player categoryZ:");
for (const p of five) console.log(`  ${(p.goat ? "★" : " ") + surname(p.playerName).padEnd(14)} usage ${playerUsage(p).toFixed(2)}`, Object.fromEntries(Object.entries(categoryZ(p, seasons)).map(([k, v]) => [k, +v.toFixed(2)])));

const totalUsage = five.reduce((a, p) => a + playerUsage(p), 0);
const excess = Math.max(0, totalUsage - DEFAULT_PARAMS.usageBudget);
const collision = 1 / (1 + DEFAULT_PARAMS.collisionK * excess);
console.log(`\ntotal usage ${totalUsage.toFixed(2)} (budget ${DEFAULT_PARAMS.usageBudget}) → excess ${excess.toFixed(2)} → collision ×${collision.toFixed(3)} on scoring+playmaking`);

const res = projectRecord(five, seasons);
console.log("\nTEAM categoryScores:", Object.fromEntries(Object.entries(res.categoryScores).map(([k, v]) => [k, +v.toFixed(2)])));
console.log("gate category:", res.gateCategory, " | S:", res.S.toFixed(2), " | expectedWins:", res.expectedWins.toFixed(1), " | wins:", res.wins);
