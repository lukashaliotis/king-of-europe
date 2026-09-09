// Winnability probe for an ALL-GUARDS daily: can a five of five guards win, or does the rebounding/
// blocks gate kill it? Samples random daily-style boards, builds the best 5 guards (one per draw),
// projects the record, and reports the distribution + which category is the gate. Compares to a
// normal best-five (2G/2F/1C) from the same boards for reference.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { mulberry32 } from "../web/src/daily.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const seasons = data.seasons;
const S = (pl) => playerStrength(pl, seasons);

function board(rng, size = 6) {
  const b = [], used = new Set();
  let g = 0;
  while (b.length < size && g++ < 500) { const p = spin(pools, rng); if (used.has(p.id)) continue; used.add(p.id); b.push(p); }
  return b;
}
// best guard from each draw, then take the 5 strongest across distinct draws
function bestGuards(b) {
  const perDraw = b.map((p) => p.players.filter((x) => x.pos === "G").sort((a, c) => S(c) - S(a))[0]).filter(Boolean);
  return perDraw.sort((a, c) => S(c) - S(a)).slice(0, 5);
}
// a legal 2G/2F/1C best-five (greedy) for reference
function bestNormal(b) {
  const pick = (pos, n, used) => b.map((p) => p.players.filter((x) => x.pos === pos && !used.has(x.playerCode)).sort((a, c) => S(c) - S(a))[0]).filter(Boolean).sort((a, c) => S(c) - S(a)).slice(0, n);
  const used = new Set();
  const g = pick("G", 2, used); g.forEach((x) => used.add(x.playerCode));
  const f = pick("F", 2, used); f.forEach((x) => used.add(x.playerCode));
  const c = pick("C", 1, used); c.forEach((x) => used.add(x.playerCode));
  return [...g, ...f, ...c];
}

const N = 400;
const gWins = [], nWins = [], gateCount = {};
let gGuardsShort = 0;
const rng = mulberry32(12345);
for (let i = 0; i < N; i++) {
  const b = board(rng);
  const five = bestGuards(b);
  if (five.length < 5) { gGuardsShort++; continue; }
  const r = projectRecord(five, seasons);
  gWins.push(r.expectedWins);
  gateCount[r.gateCategory] = (gateCount[r.gateCategory] || 0) + 1;
  const nb = bestNormal(b);
  if (nb.length === 5) nWins.push(projectRecord(nb, seasons).expectedWins);
}
const stat = (a) => { a = a.slice().sort((x, y) => x - y); const q = (p) => a[Math.floor(p * (a.length - 1))]; return { min: a[0].toFixed(1), p50: q(0.5).toFixed(1), p75: q(0.75).toFixed(1), p90: q(0.9).toFixed(1), max: a[a.length - 1].toFixed(1) }; };
console.log("ALL-GUARDS best-five expectedWins:", stat(gWins), " boards w/ <5 guards:", gGuardsShort);
console.log("NORMAL   best-five expectedWins:", stat(nWins), "(reference, same boards)");
console.log("all-guards GATE category (what caps the record):", gateCount);
