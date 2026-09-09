// Compare OLD vs NEW legend stats: individual strength + a best legal legends five, to see whether
// the light-touch specialization changed the OVERALL power (and thus whether we must recalibrate).
import fs from "node:fs";
import { playerStrength, projectRecord } from "../web/src/engine.js";

const data = JSON.parse(fs.readFileSync(new URL("../data/players.json", import.meta.url)));
const seasons = data.seasons;
const BASE = 2012;

// [name, pos, pts, reb, ast, stl, blk, ts, tov]
const OLD = [
  ["PETROVIC", "G", 28, 4, 5, 2.0, 0.1, 0.62, 2.5],
  ["GALIS", "G", 30, 4, 4, 2.0, 0.1, 0.58, 2.8],
  ["DJORDJEVIC", "G", 17, 3, 7, 1.5, 0.1, 0.61, 2.5],
  ["MARCIULIONIS", "G", 22, 4, 5, 2.0, 0.1, 0.60, 2.8],
  ["GIANNAKIS", "G", 19, 3, 6, 1.6, 0.1, 0.57, 2.5],
  ["KUKOC", "F", 20, 8, 7, 1.6, 0.5, 0.60, 2.8],
  ["BODIROGA", "F", 19, 6, 5, 1.3, 0.3, 0.58, 2.5],
  ["RADJA", "F", 22, 10, 2, 1.0, 1.5, 0.59, 2.3],
  ["EPI", "F", 18, 5, 4, 1.2, 0.4, 0.59, 2.0],
  ["SABONIS", "C", 22, 13, 5, 1.0, 2.0, 0.60, 3.0],
  ["DIVAC", "C", 16, 11, 3, 1.0, 2.0, 0.57, 2.5],
  ["SAVIC", "C", 15, 8, 2, 0.8, 1.5, 0.58, 2.0],
];
const NEW = [
  ["PETROVIC", "G", 27, 3, 4, 1.5, 0.1, 0.64, 2.2],
  ["GALIS", "G", 31, 4, 3, 1.6, 0.1, 0.55, 3.0],
  ["DJORDJEVIC", "G", 16, 3, 8, 1.3, 0.1, 0.62, 2.3],
  ["MARCIULIONIS", "G", 21, 4, 5, 2.6, 0.3, 0.58, 2.8],
  ["GIANNAKIS", "G", 14, 5, 7, 2.0, 0.2, 0.56, 2.6],
  ["KUKOC", "F", 19, 7, 7, 1.5, 0.5, 0.60, 2.6],
  ["BODIROGA", "F", 19, 5, 5, 1.3, 0.3, 0.63, 2.2],
  ["RADJA", "F", 21, 11, 2, 1.0, 1.6, 0.58, 2.3],
  ["EPI", "F", 23, 5, 3, 1.2, 0.4, 0.60, 1.9],
  ["SABONIS", "C", 22, 12, 5, 1.0, 1.8, 0.60, 3.0],
  ["DIVAC", "C", 13, 13, 3, 1.2, 2.5, 0.55, 2.5],
  ["SAVIC", "C", 16, 8, 2, 0.7, 1.2, 0.64, 1.8],
];

const mk = ([name, pos, pts, reb, ast, stl, blk, ts, tov]) => ({
  season: BASE, playerName: name, teamCode: "LEG", pos, gp: 20, mpg: 32, q: true, legend: true,
  cat: { scoring: pts, rebounding: reb, playmaking: ast - tov, defense: stl + blk, efficiency: ts },
  box: { pts, reb, ast, stl, blk, ts, fga: +(pts * 0.72).toFixed(1) },
});

const strengthsOf = (raw) => raw.map(mk).map((p) => ({ p, s: playerStrength(p, seasons) }));

const oldS = strengthsOf(OLD), newS = strengthsOf(NEW);
console.log("=== individual strength (OLD -> NEW) ===");
oldS.forEach((o, i) => {
  const n = newS[i];
  console.log(`${o.p.playerName.padEnd(13)} ${o.p.pos}  ${o.s.toFixed(2)} -> ${n.s.toFixed(2)}  (${(n.s - o.s >= 0 ? "+" : "") + (n.s - o.s).toFixed(2)})`);
});
const sum = (arr) => arr.reduce((a, x) => a + x.s, 0);
console.log(`\npool total strength: OLD ${sum(oldS).toFixed(1)}  NEW ${sum(newS).toFixed(1)}`);

// Best legal five (2G,2F,1C) by strength + best remaining as 6th, then projectRecord.
function bestFive(list) {
  const byPos = (pos) => list.filter((x) => x.p.pos === pos).sort((a, b) => b.s - a.s);
  const G = byPos("G"), F = byPos("F"), C = byPos("C");
  const five = [G[0].p, G[1].p, F[0].p, F[1].p, C[0].p];
  const used = new Set(five);
  const sixth = list.map((x) => x.p).filter((p) => !used.has(p)).sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons))[0];
  return { five, sixth };
}
for (const [label, list] of [["OLD", oldS], ["NEW", newS]]) {
  const { five, sixth } = bestFive(list);
  const res = projectRecord(five, seasons, undefined, 1, null, sixth);
  console.log(`\n=== best legends five (${label}) ===`);
  console.log("five:", five.map((p) => p.playerName).join(", "), "| 6th:", sixth.playerName);
  console.log(`S=${res.S.toFixed(2)}  expectedWins=${res.expectedWins.toFixed(1)}  wins=${res.wins}  gate=${res.gateCategory}`);
  console.log("categoryScores:", Object.fromEntries(Object.entries(res.categoryScores).map(([k, v]) => [k, +v.toFixed(2)])));
}
