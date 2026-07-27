// Diagnostic: is roster STRENGTH comparable across eras, and how is it distributed?
// Answers two calibration confounds before the win curve can be tuned:
//   (a) does the inclusive club pool drag the typical spin far below elite clubs?
//   (b) do short pre-2016 seasons inflate z-scores (older rosters artificially strong)?

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS } from "../web/src/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const PARAMS = { ...DEFAULT_PARAMS, ...(process.argv[2] ? JSON.parse(process.argv[2]) : {}) };
console.log(`(reliabilityK=${PARAMS.reliabilityK})`);

const ERAS = [
  { key: "2001-05", from: 2001, to: 2005 },
  { key: "2006-10", from: 2006, to: 2010 },
  { key: "2011-15", from: 2011, to: 2015 },
  { key: "2016-20", from: 2016, to: 2020 },
  { key: "2021-25", from: 2021, to: 2025 },
];
const eraOf = (s) => ERAS.find((e) => s >= e.from && s <= e.to);

const pools = new Map();
for (const pl of data.players) {
  const era = eraOf(pl.season);
  if (!era) continue;
  const id = `${pl.teamCode}|${era.key}`;
  if (!pools.has(id)) pools.set(id, { teamName: pl.teamName, eraKey: era.key, players: [] });
  pools.get(id).players.push(pl);
}

function greedyDraft(players) {
  const chosen = [], used = new Set();
  while (chosen.length < 5) {
    let best = null, bestKey = -Infinity;
    for (const c of players) {
      if (used.has(c.playerCode)) continue;
      const res = projectRecord([...chosen, c], seasons, PARAMS);
      const key = res.strength; // rank by raw strength here (curve-independent)
      if (key > bestKey) { bestKey = key; best = c; }
    }
    if (!best) break;
    chosen.push(best); used.add(best.playerCode);
  }
  return chosen;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// (b) mean per-player games per season — the small-sample proxy
console.log("PER-SEASON SAMPLE SIZE (mean games played, qualified players)");
for (const era of ERAS) {
  const yrs = [];
  for (let y = era.from; y <= era.to; y++) {
    const rows = data.players.filter((p) => p.season === y);
    if (rows.length) yrs.push((rows.reduce((a, p) => a + p.gp, 0) / rows.length));
  }
  console.log(`  ${era.key}: ~${(yrs.reduce((a, b) => a + b, 0) / yrs.length).toFixed(1)} games/player`);
}

// per-era strength of best rosters
console.log("\nPER-ERA BEST-ROSTER STRENGTH (greedy by raw strength, pools >= 8 players)");
const perEra = {};
for (const pool of pools.values()) {
  if (pool.players.length < 8) continue;
  const five = greedyDraft(pool.players);
  if (five.length < 5) continue;
  const res = projectRecord(five, seasons, PARAMS);
  (perEra[pool.eraKey] ||= []).push({ strength: res.strength, name: pool.teamName, five });
}
for (const era of ERAS) {
  const arr = (perEra[era.key] || []).sort((a, b) => b.strength - a.strength);
  if (!arr.length) { console.log(`  ${era.key}: (none)`); continue; }
  const strengths = arr.map((x) => x.strength);
  const top = arr[0];
  console.log(`  ${era.key}: pools=${arr.length}  medianStrength=${median(strengths).toFixed(1)}  ` +
    `maxStrength=${strengths[0].toFixed(1)}  ->  ${top.name} ` +
    `(${top.five.map((p) => p.playerName.split(",")[0]).join(",")})`);
}

// overall strength distribution (deciles)
const all = [];
for (const list of Object.values(perEra)) for (const x of list) all.push(x.strength);
all.sort((a, b) => a - b);
const dec = (q) => all[Math.floor(q * (all.length - 1))].toFixed(1);
console.log("\nOVERALL BEST-ROSTER STRENGTH DECILES (across all viable pools)");
console.log(`  min ${all[0].toFixed(1)}  p10 ${dec(0.1)}  p25 ${dec(0.25)}  median ${dec(0.5)}  ` +
  `p75 ${dec(0.75)}  p90 ${dec(0.9)}  max ${all[all.length - 1].toFixed(1)}`);
