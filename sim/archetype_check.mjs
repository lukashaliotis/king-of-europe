// Validates web/src/archetypes.js against players whose identity is not in dispute.
// Seasons are NAMED, not "his biggest year" — the archetype is season-specific by design, so the
// test has to be too, and pinning the year stops the harness quietly re-picking a season to pass.
// Run: node sim/archetype_check.mjs
import { readFileSync } from "fs";
import { applyCareerPositions, deriveRoles } from "../web/src/data.js";
import { archetypeOf, traitsOf } from "../web/src/archetypes.js";

const data = JSON.parse(readFileSync(new URL("../data/players.json", import.meta.url), "utf8"));
applyCareerPositions(data); deriveRoles(data);

// [name fragment, season, accepted archetype(s)]
const EXPECT = [
  // bigs
  ["TAVARES, WALTER",        2020, "rim_protector"],
  ["DUNSTON, BRYANT",        2017, "rim_protector"],
  ["DUNSTON, BRYANT",        2016, "rim_protector"],   // the 0.91-block year the 1.0 bar used to miss
  ["ANTIC, PERO",            2016, "stretch_big"],
  ["MIROTIĆ, NIKOLA",        2021, "stretch_big"],
  ["MIROTIĆ, NIKOLA",        2013, "stretch_big"],
  ["PLEISS, TIBOR",          2023, "stretch_big"],     // the bug that started this
  ["PLEISS, TIBOR",          2013, "rim_runner|energy_big|post_scorer|rim_protector"], // 0 threes: NOT a shooter
  ["BOUROUSIS, IOANNIS",     2015, "glass_cleaner|playmaking_big"],
  ["VESELÝ, JAN",            2021, "post_scorer|rim_runner|rim_protector"],
  ["VESELÝ, JAN",            2017, "post_scorer|rim_runner|rim_protector"],
  // guards — pass-first
  ["CALATHES, NICK",         2018, "floor_general"],
  ["PAPALOUKAS, THEODOROS",  2006, "floor_general"],
  ["TEODOSIC, MILOS",        2016, "floor_general"],
  ["SLOUKAS, KOSTAS",        2020, "floor_general"],
  ["HUERTAS, MARCELINHO",    2018, "floor_general"],
  ["DIAMANTIDIS, DIMITRIS",  2006, "floor_general|on_ball_pest"],
  // guards — score-first
  ["SHVED, ALEXEY",          2017, "volume_scorer"],
  ["JAMES, MIKE",            2023, "volume_scorer"],
  ["LARKIN, SHANE",          2023, "volume_scorer"],
  ["LANGFORD, KEITH",        2016, "volume_scorer"],
  ["LLULL, SERGIO",          2016, "volume_scorer|combo_guard"],
  ["VUJACIC, SASHA",         2011, "sniper|combo_guard"],
  // wings
  ["FERNANDEZ, RUDY",        2018, "sharpshooter|three_and_d"],
  ["FERNANDEZ, RUDY",        2021, "sharpshooter|three_and_d"], // the cold year
  ["FERNANDEZ, RUDY",        2006, "three_and_d|sharpshooter"],
];

// KNOWN LIMIT, recorded rather than papered over: Kyle Hines is one of the great EuroLeague
// defenders, and the box score can only see part of why. His blocks (0.4-1.2 a game) put him above
// average for a centre in his best years and ordinary in the rest, so he reads rim_protector in
// 2013/2015/2019 and rim_runner or playmaking_big elsewhere — a fair picture, but it is built from
// blocks alone. Positioning, team defence and charges leave no trace in a player box score. Same
// blind spot that made the derived coach archetypes call Obradović "Efficient" and forced the
// hand-overrides in coaches.js. We label what the data can see and do not invent the rest.
const KNOWN_LIMITS = [["HINES, KYLE", 2019, "rim_protector|rim_runner"]];

let pass = 0; const fails = [];
const row = (frag, season) => data.players.find(
  (p) => p.box && p.season === season && p.playerName.toUpperCase().includes(frag.toUpperCase()));

console.log("player                       season pos5  got                expected");
console.log("-".repeat(90));
for (const [frag, season, want] of [...EXPECT, ...KNOWN_LIMITS]) {
  const p = row(frag, season);
  if (!p) { fails.push(`${frag} ${season} NOT FOUND`); console.log(`?? ${frag} ${season} NOT FOUND`); continue; }
  const a = archetypeOf(p, data);
  const ok = want.split("|").includes(a.key);
  if (ok) pass++; else fails.push(`${p.playerName} ${season}: got ${a.key}, wanted ${want}`);
  console.log(`${ok ? "  " : "XX"} ${p.playerName.slice(0, 24).padEnd(26)} ${season}  ${String(p.pos5).padEnd(4)} ${a.key.padEnd(18)} ${want}`);
}
const total = EXPECT.length + KNOWN_LIMITS.length;
console.log("-".repeat(90));
console.log(`pass ${pass} / ${total}`);
for (const f of fails) console.log("  FAIL " + f);
process.exit(fails.length ? 1 : 0);
