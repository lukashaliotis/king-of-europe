// Verify the GOAT model: build a grafted player, field his real club, project + play the postseason,
// award the hardware — and prove the Final Four MVP can go to a teammate, not the GOAT.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength, categoryZ } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { buildGoat, goatFive, buildAwardPool, computeAwards, ungraftedStats, STAT_LABEL } from "../web/src/goat.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);
const pool = buildAwardPool(data.players, seasons);
console.log(`award pool: ${pool.strengths.length} qualified player-seasons\n`);

// donor = the single best real player at one raw stat (for the demo build)
const bestBy = (keyFn) => data.players.filter((p) => p.q).sort((a, b) => keyFn(b) - keyFn(a))[0];
const donors = {
  pts: bestBy((p) => p.box.pts), reb: bestBy((p) => p.box.reb), ast: bestBy((p) => p.cat.playmaking),
  ts: bestBy((p) => (p.box.fga >= 8 ? p.box.ts : 0)), stl: bestBy((p) => p.box.stl), blk: bestBy((p) => p.box.blk),
};
const surname = (n) => n.split(",")[0];

// HOME CLUB: a genuinely deep club so the cast is real. BASE: its weakest guard (the "upgrade the
// hole" strategy) — the club keeps its stars as support.
const home = pools.find((p) => /Olympiacos Piraeus 2022-23/.test(`${p.teamName} ${p.seasonLabel}`));
const guards = home.players.filter((p) => p.pos === "G").sort((a, b) => playerStrength(a, seasons) - playerStrength(b, seasons));
const base = guards[0];
console.log(`HOME: ${home.teamName} ${home.seasonLabel}`);
console.log(`BASE (weak guard): ${surname(base.playerName)}  ${base.box.pts}p ${base.box.reb}r ${base.box.ast}a ${base.box.stl}s ${base.box.blk}b ${(base.box.ts*100|0)}%TS\n`);

// Graft 5 of 6 — leave BLOCKS at base (the forced weakness).
const grafts = ["pts", "reb", "ast", "ts", "stl"].map((stat) => ({ stat, donor: donors[stat] }));
const goat = buildGoat(base, grafts, seasons); // seasons ⇒ freak cap applied (shipped behaviour)
const gz = categoryZ(goat, seasons);
console.log("GOAT stat line (donor in brackets; blocks left at base):");
for (const s of ["pts", "reb", "ast", "stl", "blk", "ts"]) {
  const d = goat.source[s];
  const val = s === "ts" ? `${(goat.box.ts * 100).toFixed(1)}%` : goat.box[s];
  console.log(`  ${STAT_LABEL[s].padEnd(9)} ${String(val).padStart(6)}  ${d ? "← " + surname(d.playerName) : "(base)"}`);
}
console.log("left at base:", ungraftedStats(grafts).map((s) => STAT_LABEL[s]).join(", "));
console.log("categories z:", Object.fromEntries(Object.entries(gz).map(([k, v]) => [k, +v.toFixed(2)])));

const five = goatFive(goat, home, seasons);
console.log("\nLINEUP:", five.map((p) => `${p.pos}:${p.goat ? "★" + surname(p.playerName) : surname(p.playerName)}`).join("  "));
const res = projectRecord(five, seasons);
const post = runPostseason(five, seasons, pools, res.wins);
console.log(`RECORD ${res.wins}-${res.losses}  →  ${post.stage} (${post.label})`);
const aw = computeAwards(goat, five, seasons, res, post, pool);
console.log("percentiles:", `overall top ${((1 - aw.percentiles.overall) * 100).toFixed(2)}%`, `| defense top ${((1 - aw.percentiles.defense) * 100).toFixed(2)}%`);
console.log("AWARDS:", aw.awards.map((a) => a.label).join(", ") || "(none)");
if (aw.finalFourMVP) console.log("Final Four MVP →", aw.finalFourMVP.winner, aw.finalFourMVP.isGoat ? "(the GOAT)" : "(a TEAMMATE)");
console.log("GOAT SEASON:", aw.goatSeason);

// ---- F4 MVP STEAL: champion, but the two F4 opponents have weak centres and our teammate C is elite.
// Use a REALISTIC guard GOAT (a real solid guard tagged goat) — not the max-graft monster above — so
// the all-timer centre feasting on weak opponents can actually out-impact him.
console.log("\n=== Final Four MVP steal test (realistic guard GOAT) ===");
const byStr = (list) => list.slice().sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons));
const allC = data.players.filter((p) => p.pos === "C" && p.q);
const allG = data.players.filter((p) => p.pos === "G" && p.q);
const weakC = byStr(allC)[allC.length - 1];
const strongC = byStr(allC)[0];               // all-timer centre teammate
const goodG = byStr(allG)[80];                // a solid, not-godlike guard → our GOAT
const decentG = byStr(allG)[400];
const someF = data.players.filter((p) => p.pos === "F" && p.q)[0];
const goatG = { ...goodG, goat: true };
const oppFive = [decentG, decentG, someF, someF, weakC];   // opponents: weak centre at slot 4
const myFive = [goatG, decentG, someF, someF, strongC];    // GOAT guard + all-timer centre
const fakePost = { stage: "champion", rounds: [
  { name: "Final Four semi-final", five: oppFive },
  { name: "Final", five: oppFive },
] };
const aw2 = computeAwards(goatG, myFive, seasons, { wins: 38, losses: 0 }, fakePost, pool);
console.log(`GOAT guard ${surname(goatG.playerName)} str ${playerStrength(goatG, seasons).toFixed(1)} vs opp G ${playerStrength(decentG, seasons).toFixed(1)}`);
console.log(`teammate C ${surname(strongC.playerName)} str ${playerStrength(strongC, seasons).toFixed(1)} vs weak opp C ${surname(weakC.playerName)} ${playerStrength(weakC, seasons).toFixed(1)}`);
console.log("Final Four MVP →", aw2.finalFourMVP.winner, aw2.finalFourMVP.isGoat ? "(GOAT — kept it)" : "(TEAMMATE — stolen ✓)");
