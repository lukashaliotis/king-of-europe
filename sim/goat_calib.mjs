// GOAT calibration harness. Simulates the REAL play loop many times and reports the win
// distribution, award rates, the GOAT-SEASON rate, and how hot the grafted category z-scores run.
//
// Faithful to app.js: home club spun (weighted, must field a legal five), base picked from it, then
// FIVE grafts, each from a freshly-spun club (deduped against home + used), taking one of the donor's
// six stats. We model three players: a greedy optimizer (the brag-chaser ceiling), a typical engaged
// player (takes the biggest raw upgrade the ▲ hint shows), and a random/naive floor.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength, categoryZ, CATEGORIES } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { buildGoat, goatFive, buildAwardPool, computeAwards, GRAFT_STATS } from "../web/src/goat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const awardPool = buildAwardPool(data.players, seasons);

// A tiny deterministic RNG so runs are reproducible (seedable from argv).
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const canFieldFive = (pool) => {
  const need = { G: 2, F: 2, C: 1 };
  for (const p of pool.players || []) if (need[p.pos] > 0) need[p.pos]--;
  return need.G <= 0 && need.F <= 0 && need.C <= 0;
};

// Spin a fresh club (weighted, like the game), deduped against `used` ids; optionally require a legal five.
function spinClub(rng, used, needFive) {
  for (let i = 0; i < 200; i++) {
    const t = spin(pools, rng);
    if (used.has(t.id)) continue;
    if (needFive && !canFieldFive(t)) continue;
    return t;
  }
  return null;
}

// The freak cap under test (Infinity = current uncapped behaviour). Set per-strategy loop below.
let CAP = Infinity;
const mkGoat = (base, grafts) => buildGoat(base, grafts, seasons, CAP);

// expectedWins for a candidate GOAT built from base + grafts, fielded on the home club.
function evalGoat(base, grafts, home) {
  const goat = mkGoat(base, grafts);
  const five = goatFive(goat, home, seasons);
  if (!five) return null;
  return { goat, five, ew: projectRecord(five, seasons).expectedWins };
}

// Pick the base: the home club's WEAKEST player (removing him leaves the strongest 4-man cast),
// among those that still yield a legal five. Matches the "keep the club's stars as support" tip.
function pickBase(home) {
  const cand = [...home.players].sort((a, b) => playerStrength(a, seasons) - playerStrength(b, seasons));
  for (const b of cand) if (goatFive(mkGoat(b, []), home, seasons)) return b;
  return null;
}

// One full build under a strategy. Returns the finished GOAT + team result, or null if it fizzled.
function runBuild(rng, strategy) {
  const home = spinClub(rng, new Set(), true);
  if (!home) return null;
  const base = pickBase(home);
  if (!base) return null;
  const used = new Set([home.id]);
  const grafts = [];
  const raw = (p, s) => (s === "ts" ? p.box.ts : (s === "ast" ? p.cat.playmaking : p.box[s] ?? 0));
  const bestSpecialist = (club, s) => [...club.players].sort((a, b) => raw(b, s) - raw(a, s))[0];
  for (let g = 0; g < 5; g++) {
    const donorClub = spinClub(rng, used, false);
    if (!donorClub) break;
    used.add(donorClub.id);
    const open = GRAFT_STATS.filter((s) => !grafts.some((x) => x.stat === s));
    let stat, donor;
    if (strategy === "random") {
      stat = open[Math.floor(rng() * open.length)];
      donor = donorClub.players[Math.floor(rng() * donorClub.players.length)];
    } else if (strategy === "typical") {
      // the club's best overall player, take his biggest raw UPGRADE (what the ▲ hint nudges)
      donor = [...donorClub.players].sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons))[0];
      const cur = mkGoat(base, grafts);
      stat = open.map((s) => ({ s, d: raw(donor, s) - raw(cur, s) })).sort((a, b) => b.d - a.d)[0].s;
    } else {
      // greedy min-maxer: for each open stat consider the CLUB'S SPECIALIST in it (sort the board
      // by that stat, take its leader), evaluate expectedWins, and take the best (stat, specialist).
      let best = null;
      for (const s of open) {
        const spec = bestSpecialist(donorClub, s);
        const r = evalGoat(base, [...grafts, { stat: s, donor: spec }], home);
        if (r && (!best || r.ew > best.ew)) best = { s, donor: spec, ew: r.ew };
      }
      stat = best ? best.s : open[0];
      donor = best ? best.donor : donorClub.players[0];
    }
    grafts.push({ stat, donor });
  }
  if (grafts.length < 5) return null;
  const goat = mkGoat(base, grafts);
  const five = goatFive(goat, home, seasons);
  if (!five) return null;
  const res = projectRecord(five, seasons);
  const post = runPostseason(five, seasons, pools, res.wins);
  const aw = computeAwards(goat, five, seasons, res, post, awardPool);
  const gz = categoryZ(goat, seasons);
  return { home, base, goat, five, res, post, aw, gz };
}

const N = Number(process.argv[2] || 400);
const caps = [Infinity, 5.0, 4.5, 4.0];
const strategies = ["greedy", "typical", "random"];
const pct = (x, n) => `${((100 * x) / n).toFixed(1)}%`;

for (const cap of caps) {
 CAP = cap;
 console.log(`\n############################  FREAK CAP = ${cap === Infinity ? "∞ (current)" : cap.toFixed(1)}  ############################`);
 for (const strat of (cap === Infinity ? strategies : ["greedy", "typical"])) {
  // same seed per strategy across caps → identical draws, so differences are purely the cap
  const rng = mulberry32(0xC0FFEE ^ (strat.length * 2654435761));
  const wins = [], champs = { relegation: 0, playin: 0, playoffs: 0, semifinal: 0, final: 0, champion: 0 };
  let perfect = 0, goatSeason = 0, ok = 0;
  const awardCount = {};
  const zmax = Object.fromEntries(CATEGORIES.map((k) => [k, -Infinity]));
  const zsum = Object.fromEntries(CATEGORIES.map((k) => [k, 0]));
  let hotBuilds = 0; // builds with any category z > 6 (well beyond any real player)
  for (let i = 0; i < N; i++) {
    const b = runBuild(rng, strat);
    if (!b) continue;
    ok++;
    wins.push(b.res.wins);
    if (b.res.wins === 38) perfect++;
    if (b.aw.goatSeason) goatSeason++;
    if (champs[b.post.stage] != null) champs[b.post.stage]++;
    for (const a of b.aw.awards) awardCount[a.label] = (awardCount[a.label] || 0) + 1;
    let hot = false;
    for (const k of CATEGORIES) { zmax[k] = Math.max(zmax[k], b.gz[k]); zsum[k] += b.gz[k]; if (b.gz[k] > 6) hot = true; }
    if (hot) hotBuilds++;
  }
  wins.sort((a, b) => a - b);
  const mean = (wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(1);
  const median = wins[Math.floor(wins.length / 2)];
  const p90 = wins[Math.floor(wins.length * 0.9)];
  console.log(`\n================  ${strat.toUpperCase()}  (${ok}/${N} builds completed)  ================`);
  console.log(`wins: mean ${mean}  median ${median}  p90 ${p90}  min ${wins[0]}  max ${wins[wins.length - 1]}`);
  console.log(`38-0 PERFECT: ${perfect} (${pct(perfect, ok)})    GOAT SEASON: ${goatSeason} (${pct(goatSeason, ok)})`);
  console.log(`postseason: ` + Object.entries(champs).map(([k, v]) => `${k} ${pct(v, ok)}`).join("  "));
  console.log(`awards:     ` + Object.entries(awardCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, ok)}`).join("  ") || "(none)");
  console.log(`category z — mean:  ` + CATEGORIES.map((k) => `${k} ${(zsum[k] / ok).toFixed(1)}`).join("  "));
  console.log(`category z — MAX:   ` + CATEGORIES.map((k) => `${k} ${zmax[k].toFixed(1)}`).join("  "));
  console.log(`hot builds (any category z>6): ${hotBuilds} (${pct(hotBuilds, ok)})`);
 }
}

// For reference: the hottest REAL players' category z (the ceiling a fantasy should feel like it's beating).
console.log(`\n---- real-player category z ceilings (max over ${data.players.filter((p) => p.q).length} qualified) ----`);
const realMax = Object.fromEntries(CATEGORIES.map((k) => [k, -Infinity]));
for (const p of data.players) { if (!p.q) continue; const z = categoryZ(p, seasons); for (const k of CATEGORIES) realMax[k] = Math.max(realMax[k], z[k]); }
console.log(CATEGORIES.map((k) => `${k} ${realMax[k].toFixed(1)}`).join("  "));
