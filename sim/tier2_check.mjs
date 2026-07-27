// Validate the Tier-2 rewrite:
//   1. a season is 38 draws at p, so P(38-0) tracks p^38
//   2. the same five ALWAYS yields the same record (determinism preserved)
//   3. records now scatter around 38p instead of being a rounded function of S
import { playSeason, gameProbability, seedFromRoster, projectRecord, DEFAULT_PARAMS, GAMES } from "../web/src/engine.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildClubSeasons } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));

console.log("=== 1. P(38-0) should track p^38 ===");
console.log(" p      theory p^38   observed (20k seeds)");
for (const p of [0.999, 0.99, 0.97, 0.95, 0.92, 0.90, 0.85]) {
  let perfect = 0;
  const N = 20000;
  for (let s = 0; s < N; s++) if (playSeason(p, s) === GAMES) perfect++;
  console.log(
    ` ${p.toFixed(3)}   ${(Math.pow(p, 38) * 100).toFixed(3).padStart(7)}%   ${((100 * perfect) / N).toFixed(3).padStart(7)}%`
  );
}

console.log("\n=== 2. determinism: same roster -> same record ===");
const pools = buildClubSeasons(data);
const pool = pools.find((x) => x.players.length >= 8);
const five = ["G", "G", "F", "F", "C"].map((pos) => {
  const p = pool.players.find((q) => q.pos === pos && !this);
  return p;
});
const legal = [];
const SLOT = ["G", "G", "F", "F", "C"];
const used = new Set();
for (const slot of SLOT) {
  const p = pool.players.find((q) => q.pos === slot && !used.has(q.playerCode));
  if (p) { used.add(p.playerCode); legal.push({ ...p, _src: { teamCode: pool.teamCode } }); }
}
if (legal.length === 5) {
  const runs = new Set();
  for (let i = 0; i < 8; i++) runs.add(projectRecord(legal, data.seasons).wins);
  // and re-ordered, since the seed sorts player codes
  const shuffled = [...legal].reverse();
  runs.add(projectRecord(shuffled, data.seasons).wins);
  console.log(` ${pool.teamName} ${pool.seasonLabel}: 9 runs (incl. reordered) -> distinct records = ${runs.size} ${runs.size === 1 ? "OK" : "FAIL"} (${[...runs]})`);
} else {
  console.log(" (could not field a legal five from the sample pool)");
}

console.log("\n=== 3. scatter: records around 38p ===");
for (const p of [0.6, 0.8, 0.9]) {
  const w = [];
  for (let s = 0; s < 4000; s++) w.push(playSeason(p, s));
  w.sort((a, b) => a - b);
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  console.log(` p=${p}  38p=${(38 * p).toFixed(1)}  mean=${mean.toFixed(1)}  p10=${w[400]}  p90=${w[3600]}  min=${w[0]}  max=${w[w.length - 1]}`);
}

console.log("\n=== 4. one p everywhere: season / postseason / duel agree ===");
console.log(` gameProbability(+4 S edge) = ${gameProbability(24, 20).toFixed(3)}`);
console.log(` gameProbability(  0 S edge) = ${gameProbability(20, 20).toFixed(3)}`);
console.log(` gameProbability(-4 S edge) = ${gameProbability(16, 20).toFixed(3)}`);
console.log(` (leagueS=${DEFAULT_PARAMS.leagueS}, gameSteep=${DEFAULT_PARAMS.gameSteep})`);
