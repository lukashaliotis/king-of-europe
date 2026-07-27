import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { playerStrength } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { legendsPool } from "../web/src/legends.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));

const qualified = data.players.filter((p) => p.q && p.mpg > 0 && p.box);
const strengths = qualified.map((p) => playerStrength(p, data.seasons)).sort((a, b) => a - b);
const q = (f) => strengths[Math.floor(f * (strengths.length - 1))].toFixed(2);
console.log("qualified players:", strengths.length);
console.log("strength percentiles:");
console.log("  min", q(0), "p10", q(0.1), "p25", q(0.25), "median", q(0.5), "p75", q(0.75), "p90", q(0.9), "p95", q(0.95), "p99", q(0.99), "max", q(1));

const leg = legendsPool().players.map((p) => ({ n: p.playerName, s: playerStrength(p, data.seasons) })).sort((a, b) => b.s - a.s);
console.log("\nlegends strength:");
leg.forEach((l) => console.log("  ", l.s.toFixed(2), l.n));

const top = qualified.map((p) => ({ n: p.playerName, y: p.season, s: playerStrength(p, data.seasons) })).sort((a, b) => b.s - a.s).slice(0, 12);
console.log("\ntop 12 player-seasons:");
top.forEach((t) => console.log("  ", t.s.toFixed(2), t.n, t.y));
