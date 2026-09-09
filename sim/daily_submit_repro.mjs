// Repro: build today's Daily board, draft a legal five + sixth, and run the SERVER resolver
// (resolveDaily) exactly as /api/submit does — to see if a well-formed submission is accepted.
import fs from "node:fs";
import { resolveDaily, dailyPools, dailyBoard } from "../web/src/resolve.js";
import { utcDayKey } from "../web/src/daily.js";

const data = JSON.parse(fs.readFileSync(new URL("../data/players.json", import.meta.url)));
const dayKey = process.argv[2] || utcDayKey();
const pools = dailyPools(data);
const board = dailyBoard(pools, dayKey, data.seasons);

console.log("dayKey:", dayKey, "board size:", board.length);
board.forEach((p, i) => console.log(`  draw ${i}: ${p.teamCode} ${p.seasonLabel}  players=${(p.players || []).length} legend=${!!p.legend}`));

// Positions available per draw
const posOf = board.map((p) => new Set((p.players || []).map((pl) => pl.pos)));

// Assign 5 distinct draws to roles [G,G,F,F,C]; leftover draw -> sixth (any player).
const roles = ["G", "G", "F", "F", "C"];
const assign = new Array(roles.length).fill(-1);
const usedDraw = new Array(board.length).fill(false);
function solve(r) {
  if (r === roles.length) return true;
  for (let d = 0; d < board.length; d++) {
    if (usedDraw[d] || !posOf[d].has(roles[r])) continue;
    usedDraw[d] = true; assign[r] = d;
    if (solve(r + 1)) return true;
    usedDraw[d] = false; assign[r] = -1;
  }
  return false;
}
if (!solve(0)) { console.log("!! could not field a legal five from this board"); process.exit(1); }
const sixthDraw = usedDraw.findIndex((u) => !u);

const pick = (drawIdx, pos) => (board[drawIdx].players || []).find((pl) => !pos || pl.pos === pos);
const starters = roles.map((pos, i) => ({ slot: assign[i], code: pick(assign[i], pos).playerCode }));
const sixth = { slot: sixthDraw, code: pick(sixthDraw, null).playerCode };
const submission = { starters, sixth, coach: null };

console.log("\nsubmission:", JSON.stringify(submission));
const result = resolveDaily(data, dayKey, submission);
console.log("\nresolveDaily result:", JSON.stringify(result, null, 2));

// --- Confirm the client bug: drawOf matches teamCode ONLY, so players in a club that appears in
// two draws can be mis-slotted (collapse to the first occurrence). ---
console.log("\n=== client drawOf (teamCode-only) mismatch check ===");
const buggyDrawOf = (teamCode, code) => board.findIndex((pool) =>
  pool.teamCode === teamCode && pool.players.some((p) => p.playerCode === code));
const fixedDrawOf = (teamCode, seasonLabel, code) => board.findIndex((pool) =>
  pool.teamCode === teamCode && pool.seasonLabel === seasonLabel && pool.players.some((p) => p.playerCode === code));
let mism = 0;
board.forEach((pool, d) => {
  (pool.players || []).forEach((pl) => {
    const buggy = buggyDrawOf(pool.teamCode, pl.playerCode);
    if (buggy !== d) {
      mism++;
      if (mism <= 8) console.log(`  draw ${d} ${pool.teamCode} ${pool.seasonLabel} player ${pl.playerName} -> buggy slot ${buggy} (WRONG), fixed=${fixedDrawOf(pool.teamCode, pool.seasonLabel, pl.playerCode)}`);
    }
  });
});
console.log(`  total mis-slotted players today: ${mism}`);

// --- End-to-end: a five spanning BOTH OLY draws (1 and 5), submitted buggy vs fixed ---
console.log("\n=== end-to-end: five spanning both same-club draws ===");
const G = board.map((p,i)=>({p,i}));
// find a starter from draw 1 (OLY 2023-24) and McKissic from draw 5 (OLY 2020-21)
const draw1 = board[1], draw5 = board[5];
const g1 = draw1.players.find(x=>x.pos==="G");
const mck = draw5.players.find(x=>x.playerName.includes("MCKISSIC")) || draw5.players.find(x=>x.pos==="G");
// fill remaining roles from other draws (0 BAS, 2 BAS, 3 ASV, 4 LEG)
const others = [0,2,3,4];
const need = {G:2,F:2,C:1};
if (g1) need.G--; if (mck && mck.pos==="G") need.G--; else if (mck) need[mck.pos]--;
const chosen = [{slot:1,pl:g1},{slot:5,pl:mck}];
for (const d of others){ for (const pos of ["G","F","C"]){ if(need[pos]>0){ const pl=board[d].players.find(x=>x.pos===pos); if(pl){chosen.push({slot:d,pl}); need[pos]--; break; } } } }
const usedDraws = new Set(chosen.map(c=>c.slot));
const sixthD = [0,1,2,3,4,5].find(d=>!usedDraws.has(d));
const sixthPl = board[sixthD].players[0];
const buggyDraw = (pl)=>board.findIndex(pool=>pool.teamCode===pl.teamCode && pool.players.some(p=>p.playerCode===pl.playerCode));
const fixedDraw = (pl)=>board.findIndex(pool=>pool.teamCode===pl.teamCode && pool.seasonLabel===pl.seasonLabel && pool.players.some(p=>p.playerCode===pl.playerCode));
const mk = (fn)=>({ starters: chosen.map(c=>({slot:fn(c.pl), code:c.pl.playerCode})), sixth:{slot:fn(sixthPl), code:sixthPl.playerCode}, coach:null });
const buggySub = mk(buggyDraw), fixedSub = mk(fixedDraw);
console.log("buggy slots:", buggySub.starters.map(s=>s.slot).concat(buggySub.sixth.slot).join(","), "->", resolveDaily(data,dayKey,buggySub).ok ? "ACCEPTED" : "REJECTED: "+resolveDaily(data,dayKey,buggySub).error);
console.log("fixed slots:", fixedSub.starters.map(s=>s.slot).concat(fixedSub.sixth.slot).join(","), "->", resolveDaily(data,dayKey,fixedSub).ok ? "ACCEPTED ✓" : "REJECTED: "+resolveDaily(data,dayKey,fixedSub).error);
