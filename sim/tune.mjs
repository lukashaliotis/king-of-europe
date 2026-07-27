// 38-0 tuning harness — plays the sim against real drafted rosters and reports the win
// distribution, so the curve can be calibrated empirically (build step 3) rather than by
// intuition. Run: node sim/tune.mjs   (optional: node sim/tune.mjs '{"gamma":1.2,...}')
//
// Provisional era buckets live here ONLY for tuning — final boundaries are deferred (data-gated).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, CATEGORIES, DEFAULT_PARAMS } from "../web/src/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;

// Provisional 5-year era windows (tuning only).
const ERAS = [
  { key: "2001-05", from: 2001, to: 2005 },
  { key: "2006-10", from: 2006, to: 2010 },
  { key: "2011-15", from: 2011, to: 2015 },
  { key: "2016-20", from: 2016, to: 2020 },
  { key: "2021-25", from: 2021, to: 2025 },
];

const paramOverride = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const PARAMS = { ...DEFAULT_PARAMS, ...paramOverride };

// ---- build (club, era) pools -------------------------------------------------
function eraOf(season) {
  return ERAS.find((e) => season >= e.from && season <= e.to);
}
const pools = new Map(); // "teamCode|eraKey" -> { teamCode, teamName, eraKey, players: [] }
for (const pl of data.players) {
  const era = eraOf(pl.season);
  if (!era) continue;
  const id = `${pl.teamCode}|${era.key}`;
  if (!pools.has(id)) {
    pools.set(id, { teamCode: pl.teamCode, teamName: pl.teamName, eraKey: era.key, players: [] });
  }
  pools.get(id).players.push(pl);
}

// ---- drafters ----------------------------------------------------------------
// Greedy "skilled" draft: repeatedly add the player that most increases projected wins,
// deduping by playerCode (one human max). Approximates an optimizing player.
function greedyDraft(players, params) {
  const chosen = [];
  const usedCodes = new Set();
  while (chosen.length < 5) {
    let best = null;
    let bestKey = -Infinity;
    for (const cand of players) {
      if (usedCodes.has(cand.playerCode)) continue;
      const res = projectRecord([...chosen, cand], seasons, params);
      // rank by wins, tie-break by effective strength S
      const key = res.wins * 1000 + res.S;
      if (key > bestKey) {
        bestKey = key;
        best = cand;
      }
    }
    if (!best) break;
    chosen.push(best);
    usedCodes.add(best.playerCode);
  }
  return chosen;
}

// Naive draft: top 5 by PIR (dedup by player). The "lookup" strategy the SPEC rejects — used
// here to show the gate punishing an unbalanced roster.
function naivePirDraft(players) {
  const chosen = [];
  const usedCodes = new Set();
  for (const pl of [...players].sort((a, b) => b.pir - a.pir)) {
    if (usedCodes.has(pl.playerCode)) continue;
    chosen.push(pl);
    usedCodes.add(pl.playerCode);
    if (chosen.length === 5) break;
  }
  return chosen;
}

// ---- self-tests --------------------------------------------------------------
function runSelfTests() {
  // determinism
  const somePool = [...pools.values()].find((p) => p.players.length >= 8);
  const five = somePool.players.slice(0, 5);
  const a = projectRecord(five, seasons, PARAMS);
  const b = projectRecord(five, seasons, PARAMS);
  const deterministic = a.wins === b.wins && a.S === b.S;

  // gate demo: two synthetic rosters, equal per-category totals summed, but one balanced and
  // one lopsided (huge scoring, zero elsewhere). Balanced must project more wins.
  const mkPlayer = (season, vals) => ({ season, playerCode: "X", gp: 30, cat: {
    scoring: vals[0], rebounding: vals[1], playmaking: vals[2], defense: vals[3], efficiency: vals[4],
  }});
  // Use a real season's mean/std by z-inverting: feed cat values already ~ mean + z*std.
  const yr = 2015;
  const cs = seasons[String(yr)].catStats;
  const val = (k, z) => cs[k].mean + z * cs[k].std;
  const balanced = CATEGORIES.map(() => 0); // placeholder
  const balancedRoster = Array.from({ length: 5 }, (_, i) =>
    mkPlayer(yr, CATEGORIES.map((k) => val(k, 1.2)))); // +1.2z everywhere
  const lopsidedRoster = Array.from({ length: 5 }, (_, i) =>
    mkPlayer(yr, CATEGORIES.map((k, ki) => val(k, ki === 0 ? 3.0 : -0.5)))); // stack scoring, starve rest
  const balRes = projectRecord(balancedRoster, seasons, PARAMS);
  const lopRes = projectRecord(lopsidedRoster, seasons, PARAMS);
  const gateCaps = balRes.wins > lopRes.wins;

  console.log("SELF-TESTS");
  console.log(`  determinism: ${deterministic ? "PASS" : "FAIL"}`);
  console.log(`  gate caps lopsided: ${gateCaps ? "PASS" : "FAIL"}  ` +
    `(balanced ${balRes.wins}-${balRes.losses} [gate=${balRes.gate.toFixed(1)}] vs ` +
    `lopsided ${lopRes.wins}-${lopRes.losses} [gate=${lopRes.gate.toFixed(1)} @${lopRes.gateCategory}])`);
  console.log("");
}

// ---- main sweep --------------------------------------------------------------
function main() {
  runSelfTests();

  const MIN_POOL = 8; // need a real draft choice
  const results = [];
  for (const pool of pools.values()) {
    if (pool.players.length < MIN_POOL) continue;
    const five = greedyDraft(pool.players, PARAMS);
    if (five.length < 5) continue;
    const res = projectRecord(five, seasons, PARAMS);
    results.push({ pool, five, res });
  }

  results.sort((a, b) => b.res.wins - a.res.wins || b.res.S - a.res.S);
  const wins = results.map((r) => r.res.wins).sort((a, b) => a - b);
  const pct = (q) => wins[Math.floor(q * (wins.length - 1))];
  const perfect = results.filter((r) => r.res.wins === 38).length;

  console.log(`PARAMS: ${JSON.stringify(PARAMS)}`);
  console.log(`Viable (club,era) pools drafted: ${results.length}\n`);
  console.log("WIN DISTRIBUTION (greedy optimal draft per pool)");
  console.log(`  min ${wins[0]}   p25 ${pct(0.25)}   median ${pct(0.5)}   p75 ${pct(0.75)}   ` +
    `p90 ${pct(0.9)}   max ${wins[wins.length - 1]}`);
  console.log(`  38-0 count: ${perfect} / ${results.length} (${(100 * perfect / results.length).toFixed(1)}%)`);

  // histogram
  const buckets = {};
  for (const w of wins) { const b = Math.floor(w / 4) * 4; buckets[b] = (buckets[b] || 0) + 1; }
  console.log("  histogram (4-win buckets):");
  for (const b of Object.keys(buckets).map(Number).sort((a, c) => a - c)) {
    console.log(`    ${b}-${b + 3}: ${"#".repeat(buckets[b])} ${buckets[b]}`);
  }

  console.log("\nTOP 12 ROSTERS BY WINS");
  for (const { pool, five, res } of results.slice(0, 12)) {
    const names = five.map((p) => `${p.playerName.split(",")[0]}(${p.season - 2000})`).join(", ");
    console.log(`  ${res.wins}-${res.losses}  ${pool.teamName} [${pool.eraKey}]  ` +
      `gate=${res.gate.toFixed(1)}@${res.gateCategory} S=${res.S.toFixed(1)}`);
    console.log(`        ${names}`);
  }
}

main();
