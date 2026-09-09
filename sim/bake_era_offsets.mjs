// Bake per-season era offsets into data/players.json (data.seasons[y].catOffset).
//
// Era-fairness: the record gate compares a five's category totals to a bar that was modern-tilted, so
// pre-2016 teams (a ~10-game group-stage era, systematically lower category totals) were underrated.
// We compute each season's TYPICAL best-five category totals, then an additive offset that maps every
// season onto a common MODERN reference. projectRecord adds this offset before strength+gate, so a
// team that dominated its era projects like an equally dominant team from any era. Re-run any time the
// dataset changes; idempotent (strips old offsets first, recomputes from raw category scores).
import { readFileSync, writeFileSync } from "node:fs";
import { projectRecord, playerStrength, CATEGORIES } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";

const path = new URL("../data/players.json", import.meta.url);
const data = JSON.parse(readFileSync(path, "utf-8"));
// idempotent: remove any previously-baked offsets so eraTypical is computed from RAW category scores
for (const y of Object.keys(data.seasons)) delete data.seasons[y].catOffset;
const seasons = data.seasons;
const pools = buildClubSeasons(data);

function bestFive(pool) {
  const need = { G: 2, F: 2, C: 1 }, by = { G: [], F: [], C: [] };
  for (const p of pool.players) if (by[p.pos]) by[p.pos].push(p);
  const five = [];
  for (const pos of ["G", "F", "C"]) { by[pos].sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons)); if (by[pos].length < need[pos]) return null; for (let i = 0; i < need[pos]; i++) five.push(by[pos][i]); }
  return five;
}
const years = [...new Set(pools.map((p) => p.season))].sort();
// eraTypical[y][k] = mean best-five category score for that season (offsets are absent, so these are raw)
const eraTypical = {};
for (const y of years) {
  const cs = pools.filter((p) => p.season === y).map(bestFive).filter(Boolean).map((f) => projectRecord(f, seasons).categoryScores);
  const m = {}; for (const k of CATEGORIES) m[k] = cs.reduce((a, c) => a + c[k], 0) / cs.length;
  eraTypical[y] = m;
}
// reference = mean over the modern 30-game era (2016+), the seasons the win curve was calibrated on
const REF_FROM = 2016;
const ref = {}; const refYears = years.filter((y) => y >= REF_FROM);
for (const k of CATEGORIES) ref[k] = refYears.reduce((a, y) => a + eraTypical[y][k], 0) / refYears.length;

// offset[y][k] = ref[k] - eraTypical[y][k] for the PRE-2016 group-stage era; the modern era (2016+),
// which the win curve + all difficulty were calibrated on, is left EXACTLY as shipped (offset 0). This
// fixes the real old-vs-modern unfairness (old teams lifted onto the modern bar) without disturbing
// modern records, leaderboards, or daily difficulty.
for (const y of years) {
  const off = {};
  for (const k of CATEGORIES) off[k] = y < REF_FROM ? +(ref[k] - eraTypical[y][k]).toFixed(4) : 0;
  seasons[String(y)].catOffset = off;
}

// ---- validate: old champions should rise to contender level; modern should barely move ----
const show = [["OLY", 2011, "Spanoulis Oly 11-12"], ["PAN", 2010, "Diamantidis Pan 10-11"], ["PAR", 2009, "Partizan 09-10"], ["OLY", 2022, "Oly 22-23 (modern)"], ["MAD", 2017, "Madrid 17-18 (modern)"]];
console.log("team                     new best-five EW  (Σoffset)");
for (const [c, s, label] of show) {
  const pool = pools.find((p) => p.teamCode === c && p.season === s);
  const ew = projectRecord(bestFive(pool), seasons).expectedWins;
  const so = CATEGORIES.reduce((a, k) => a + seasons[String(s)].catOffset[k], 0);
  console.log(`  ${label.padEnd(24)} ${ew.toFixed(1).padStart(5)}         Σ${so.toFixed(2)}`);
}
if (process.argv.includes("--write")) { writeFileSync(path, JSON.stringify(data)); console.log("\nWROTE data/players.json with catOffset"); }
else console.log("\n(dry run — pass --write to save)");

// ---- distribution check: per-era max/mean best-five EW AFTER offset (era-fairness target) ----
console.log("\nera   n   meanEW  maxEW   top3");
for (const y of [2003,2005,2009,2011,2013,2017,2020,2022,2024]) {
  const ews = pools.filter((p) => p.season === y).map(bestFive).filter(Boolean).map((f) => projectRecord(f, seasons).expectedWins).sort((a,b)=>b-a);
  const mean = (ews.reduce((a,b)=>a+b,0)/ews.length).toFixed(1);
  console.log(`  ${y}  ${String(ews.length).padStart(2)}  ${mean.padStart(5)}  ${ews[0].toFixed(1).padStart(5)}   ${ews.slice(0,3).map(x=>x.toFixed(0)).join(",")}`);
}
