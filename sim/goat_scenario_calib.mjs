// Scenario Daily G.O.A.T. verification + calibration.
//   1) the scenario board is deterministic and pins the authored home club;
//   2) the isomorphic resolver reproduces the direct sim AND enforces the locked base (anti-cheat);
//   3) measures the title / 38-0 rate per scenario so the difficulty `bump`s keep the crown an
//      achievement (greedy play should usually win; average play should not walk it in).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { buildGoat, goatFive, buildAwardPool, computeAwards, GRAFT_STATS } from "../web/src/goat.js";
import { buildGoatDailyBoard, goatDaySeed, goatScore } from "../web/src/dailygoat.js";
import { resolveGoatDaily } from "../web/src/resolveGoat.js";
import { GOAT_SCENARIOS, goatScenarioFor } from "../web/src/goatscenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const awardPool = buildAwardPool(data.players, seasons);

const raw = (p, s) => (s === "ts" ? p.box.ts : (s === "ast" ? p.cat.playmaking : p.box[s] ?? 0));
const bestSpecialist = (club, s) => [...club.players].sort((a, b) => raw(b, s) - raw(a, s))[0];

function scoreOf(board, base, grafts, path, lift) {
  const goat = buildGoat(base, grafts, seasons);
  const five = goatFive(goat, board.home, seasons);
  if (!five) return null;
  const res = projectRecord(five, seasons, undefined, 1, lift || null);
  const post = runPostseason(five, seasons, pools, res.wins, null, 0, path);
  const aw = computeAwards(goat, five, seasons, res, post, awardPool);
  return { wins: res.wins, stage: post.stage, awards: aw.awards, goatSeason: aw.goatSeason,
    score: goatScore({ wins: res.wins, post, awardCount: aw.awards.length, goatSeason: aw.goatSeason }) };
}

// Greedy: (icon) locked base, else home's weakest that still fields a five; then one stat per donor to
// maximize expectedWins. The best a real, careful player could do.
// base candidates: a locked single, a curated PICK set, or (team) the weakest fielding player.
function baseSet(board, scen) {
  if (scen.base) return (scen.base.pick || [scen.base.code]).map((c) => board.home.players.find((p) => p.playerCode === c)).filter(Boolean);
  const cand = [...board.home.players].sort((a, b) => playerStrength(a, seasons) - playerStrength(b, seasons));
  for (const b of cand) if (goatFive(buildGoat(b, [], seasons), board.home, seasons)) return [b];
  return [];
}
function playGreedy(board, scen) {
  const base = baseSet(board, scen)[0];
  if (!base) return null;
  const grafts = [], open = new Set(GRAFT_STATS);
  for (let d = 0; d < board.donors.length; d++) {
    let best = null;
    for (const s of open) {
      const spec = bestSpecialist(board.donors[d], s);
      const five = goatFive(buildGoat(base, [...grafts, { stat: s, donor: spec }], seasons), board.home, seasons);
      if (!five) continue;
      const ew = projectRecord(five, seasons, undefined, 1, scen.homeLift || null).expectedWins;
      if (!best || ew > best.ew) best = { stat: s, donor: spec, ew };
    }
    if (best) { grafts.push({ stat: best.stat, donor: best.donor, slot: d }); open.delete(best.stat); }
  }
  return { base, grafts };
}

// Average play: random distinct stat per donor (still grafting a strong specimen for it), random base
// (within the home roster) for team scenarios. Models a population of decent-but-not-optimal builds.
function playRandom(board, scen, rnd) {
  const set = scen.base ? baseSet(board, scen) : board.home.players.filter((b) => goatFive(buildGoat(b, [], seasons), board.home, seasons));
  const base = set[Math.floor(rnd() * set.length)];
  if (!base) return null;
  const stats = [...GRAFT_STATS].sort(() => rnd() - 0.5);
  const grafts = board.donors.map((donor, d) => ({ stat: stats[d % stats.length], donor: bestSpecialist(donor, stats[d % stats.length]), slot: d }));
  return { base, grafts };
}

function mulberry(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

console.log("=== Scenario board determinism + home pinning ===");
for (const scen of GOAT_SCENARIOS) {
  const dk = "2026-01-01"; // arbitrary; we pass the scenario directly
  const a = buildGoatDailyBoard(pools, goatDaySeed(dk), seasons, scen);
  const b = buildGoatDailyBoard(pools, goatDaySeed(dk), seasons, scen);
  const sig = (bd) => bd.home.id + "|" + bd.donors.map((d) => d.id).join(",");
  const homeOk = a.home.teamCode === scen.home.code && a.home.season === scen.home.season;
  console.log(`  ${scen.id}: det=${sig(a) === sig(b) ? "OK" : "FAIL"} home=${a.home.id} ${homeOk ? "OK" : "*** WRONG HOME ***"}`);
}

console.log("\n=== Difficulty (greedy = best play; random N=3000 = population) ===");
for (const scen of GOAT_SCENARIOS) {
  const board = buildGoatDailyBoard(pools, goatDaySeed("2026-06-06"), seasons, scen);
  const g = playGreedy(board, scen);
  const gr = scoreOf(board, g.base, g.grafts, scen.path, scen.homeLift);
  const rnd = mulberry(0xC0FFEE ^ scen.id.length);
  let champ = 0, perfect = 0, f4 = 0, n = 0; const winsArr = [];
  for (let i = 0; i < 3000; i++) {
    const p = playRandom(board, scen, rnd); if (!p) continue;
    const r = scoreOf(board, p.base, p.grafts, scen.path, scen.homeLift); if (!r) continue;
    n++; winsArr.push(r.wins);
    if (r.stage === "champion") champ++;
    if (r.wins === 38) perfect++;
    if (["finalfour", "lostfinal", "champion"].includes(r.stage)) f4++;
  }
  winsArr.sort((a, b) => a - b);
  const med = winsArr[Math.floor(winsArr.length / 2)];
  const P = (x) => `${((100 * x) / n).toFixed(1)}%`;
  console.log(`  ${scen.id} (${scen.team}) bumps=${scen.path.map((s) => s.bump).join("/")}`);
  console.log(`     greedy: ${gr.wins}-${38 - gr.wins} ${gr.stage}${gr.goatSeason ? " GOAT-SEASON" : ""} (base=${g.base.playerName})`);
  console.log(`     random: champ ${P(champ)} · reach F4 ${P(f4)} · 38-0 ${P(perfect)} · median wins ${med}`);
}

console.log("\n=== Resolver == direct sim + base-lock enforcement ===");
// Find a real day for each scenario so goatScenarioFor returns it, to test the full resolver path.
function findDayFor(id) {
  for (let i = 0; i < 400; i++) { const dk = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10); const s = goatScenarioFor(dk); if (s && s.id === id) return dk; }
  return null;
}
let ok = 0, fail = 0;
for (const scen of GOAT_SCENARIOS) {
  const dk = findDayFor(scen.id);
  if (!dk) { console.log(`  ${scen.id}: no day found in range (chance too low?)`); continue; }
  const board = buildGoatDailyBoard(pools, goatDaySeed(dk), seasons, scen);
  const g = playGreedy(board, scen);
  const direct = scoreOf(board, g.base, g.grafts, scen.path, scen.homeLift);
  const submission = { base: { code: g.base.playerCode }, grafts: g.grafts.map((x) => ({ slot: x.slot, stat: x.stat, code: x.donor.playerCode })) };
  const r = resolveGoatDaily(data, dk, submission);
  const match = r.ok && r.wins === direct.wins && r.score === direct.score && r.stage === direct.stage;
  if (match) ok++; else { fail++; console.log(`  MISMATCH ${scen.id}`, { direct: { wins: direct.wins, score: direct.score, stage: direct.stage }, resolver: r }); }
  // base-lock: for icon/pick scenarios, a base OUTSIDE the allowed set must be REJECTED.
  if (scen.base) {
    const allowed = new Set(scen.base.pick || [scen.base.code]);
    const other = board.home.players.find((p) => !allowed.has(p.playerCode));
    const rr = resolveGoatDaily(data, dk, { base: { code: other.playerCode }, grafts: submission.grafts });
    const kind = scen.base.pick ? `pick(${allowed.size})` : "icon";
    console.log(`  ${scen.id}: resolver ${match ? "OK" : "FAIL"} · ${kind} base-lock ${rr.ok ? "*** NOT ENFORCED ***" : "enforced"} · day ${dk}`);
  } else {
    console.log(`  ${scen.id}: resolver ${match ? "OK" : "FAIL"} · free base · day ${dk}`);
  }
}
console.log(`\nresolver match: ${ok} ok / ${fail} fail`);
