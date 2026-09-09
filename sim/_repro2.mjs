import fs from "fs";
import { buildClubSeasons } from "../web/src/data.js";
import { resolveClassicAllTime } from "../web/src/resolveClassic.js";
import { eligibleCoaches } from "../web/src/coaches.js";

const data = JSON.parse(fs.readFileSync(new URL("../data/players.json", import.meta.url), "utf8"));
const pools = buildClubSeasons(data);

// Find a pool that alone can field 2G/2F/1C + a 6th, so a coach is likely eligible.
function tryPool(pool) {
  const by = { G: [], F: [], C: [] };
  for (const pl of pool.players) if (by[pl.pos]) by[pl.pos].push(pl);
  if (by.G.length >= 2 && by.F.length >= 2 && by.C.length >= 1) {
    const five = [by.G[0], by.G[1], by.F[0], by.F[1], by.C[0]];
    const sixth = by.G[2] || by.F[2] || by.C[1] || null;
    return { five, sixth };
  }
  return null;
}
let chosen = null;
for (const pool of pools) { const r = tryPool(pool); if (r && r.sixth) { chosen = { pool, ...r }; break; } }
const { pool, five, sixth } = chosen;
const enc = (pl) => ({ code: pl.playerCode, teamCode: pool.teamCode, seasonLabel: pool.seasonLabel });
const rebuilt = five.map((pl) => ({ ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } }));
const coaches = eligibleCoaches([...rebuilt, { ...sixth, _src: { teamCode: pool.teamCode } }], data);
const coach = coaches[0] ? coaches[0].coach.code : null;
console.log("pool:", pool.teamCode, pool.seasonLabel, "| coach:", coach, "| coachName:", coaches[0]?.coach.name);

const submission = { starters: five.map(enc), sixth: enc(sixth), coach, arenaSlot: 0 };
const local = resolveClassicAllTime(data, submission);
console.log("LOCAL (arena+sixth+coach):", JSON.stringify(local));

const payload = { ...submission, name: "Repro2", uid: "repro-uid-0002", country: "", team: "", badge: "" };
const res = await fetch("https://king-of-europe.pages.dev/api/classic-submit", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
});
console.log("PROD status:", res.status, "| body:", (await res.text()).slice(0, 300));
