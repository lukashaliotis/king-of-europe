// Verify the Classic all-time scoring + resolver: (1) the isomorphic resolver reproduces the
// direct-sim record + score from the submitted roster alone (anti-cheat); (2) sanity-check the
// scale (38-0 champion ≈ 4000+, a mid team a few thousand).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, playerStrength } from "../web/src/engine.js";
import { buildClubSeasons } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { classicScore, resolveClassicAllTime } from "../web/src/resolveClassic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const seasons = data.seasons;
const pools = buildClubSeasons(data);

const src = (pl, pool) => ({ ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } });

// Build a five by taking, for each needed slot, the strongest player at that position from any club
// NOT already used — starting the club search from `rankFrom` so we can build a strong or a mid five.
function fiveFrom(rankFrom = 0) {
  const need = ["G", "G", "F", "F", "C"];
  const picks = [];
  const usedClub = new Set();
  for (const pos of need) {
    const cands = [];
    for (const c of pools) {
      if (usedClub.has(c.id)) continue;
      const p = c.players.filter((x) => x.pos === pos).sort((a, b) => playerStrength(b, seasons) - playerStrength(a, seasons))[0];
      if (p) cands.push({ p, c, s: playerStrength(p, seasons) });
    }
    cands.sort((a, b) => b.s - a.s);
    const pick = cands[Math.min(rankFrom, cands.length - 1)];
    if (!pick) return null;
    usedClub.add(pick.c.id);
    picks.push(src(pick.p, pick.c));
  }
  return picks;
}

function evalFive(five) {
  const res = projectRecord(five, seasons);
  const post = runPostseason(five, seasons, pools, res.wins);
  return { res, post, score: classicScore(res.wins, post) };
}

// A strong all-star five (best per position, distinct clubs) to chase a title, + a mid five.
const strong = fiveFrom(0);
const mid = fiveFrom(60);

let pass = 0, total = 0;
for (const [name, five] of [["STRONG", strong], ["MID", mid]]) {
  if (!five) { console.log(name, "— could not build five"); continue; }
  const { res, post, score } = evalFive(five);
  const roundStr = post.rounds.map((r) => `${r.name}${r.series ? " " + r.series : (r.win ? " W" : " L")}${(r.name === "Semifinal" || r.name === "Final") ? ` (${r.us}-${r.them})` : ""}`).join(", ");
  console.log(`\n${name}: ${res.wins}-${res.losses} → ${post.stage} · SCORE ${score}`);
  console.log(`  rounds: ${roundStr || "(missed postseason)"}`);
  // resolver cross-check
  const submission = {
    starters: five.map((p) => ({ code: p.playerCode, teamCode: p._src.teamCode, seasonLabel: p._src.seasonLabel })),
    sixth: null, coach: null, arenaSlot: null,
  };
  const r = resolveClassicAllTime(data, submission);
  total++;
  const ok = r.ok && r.wins === res.wins && r.score === score;
  if (ok) pass++;
  console.log(`  resolver: ${r.ok ? `${r.wins}-${r.losses} score ${r.score}` : "FAIL " + r.error} ${ok ? "✓" : "❌ MISMATCH"}`);
}

// scoring breakdown sanity: 38-0 baseline = 3800; a champion adds playoff run + F4 margins.
console.log(`\nresolver == direct sim: ${pass}/${total} ${pass === total ? "✓" : "❌"}`);
console.log(`(scale check) a 38-0 regular season alone = ${classicScore(38, { rounds: [] })} before any playoff points`);
