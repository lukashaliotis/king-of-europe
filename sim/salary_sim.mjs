// Tune Salary Cap. The €100M cap covers 5 starters + 6th + a mandatory cheap COACH (priced by
// pedigree). The mandatory CAPTAIN is FREE — he doubles his impact but costs nothing. Player price =
// PIR (EuroLeague's official index). This models realistic good play: a value-aware greedy drafts
// under the (tiny) journeyman-coach reserve, then captains its best player and hires the best-fit
// affordable coach — mirroring web/src/app.js reconcileSalaryCommit. Salary is unranked, so this is
// a relaxed sandbox; the free captain + cheap coach make it easy by design (38-0 no longer rare).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { legendsPool, LEGENDS_CHANCE } from "../web/src/legends.js";
import { eligibleCoaches, coachDeltas, coachCost, COACH_FLOOR_PRICE } from "../web/src/coaches.js";
import { SALARY_CAP, FLOOR, playerCost } from "../web/src/salary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const LEG = legendsPool();
const SLOT = ["G", "G", "F", "F", "C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const spinOnce = (rng) => (rng() < LEGENDS_CHANCE ? LEG : spin(pools, rng));
const priceOf = (pl) => playerCost(pl, data.seasons);
const stamp = (pl) => ({ ...pl, _src: { teamCode: pl.teamCode, teamName: pl.teamName, seasonLabel: "" } });

function playCapped(rng, cap) {
  const slots = [null, null, null, null, null];
  let sixth = null, spent = 0;
  const used = new Set();
  const openPos = (pos) => SLOT.findIndex((p, i) => p === pos && !slots[i]);
  const picked = () => slots.filter(Boolean).length + (sixth ? 1 : 0);
  // draft-time reserve = just a journeyman coach (the captain is free)
  const effCap = () => cap - COACH_FLOOR_PRICE;
  const afford = (price) => spent + price + FLOOR * (6 - picked() - 1) <= effCap();
  let guard = 0;
  while (picked() < 6 && guard++ < 120) {
    const pool = spinOnce(rng);
    const starters = slots.filter(Boolean);
    const softCap = ((effCap() - spent) / (6 - picked())) * 1.7;
    let best = null, bestKey = -Infinity;
    for (const cand of pool.players) {
      if (used.has(cand.playerCode)) continue;
      const price = priceOf(cand);
      if (!afford(price) || price > softCap) continue;
      const pi = openPos(cand.pos);
      if (pi >= 0) {
        const res = projectRecord([...starters, cand], data.seasons, undefined, 1, null, sixth);
        if (res.S > bestKey) { bestKey = res.S; best = { cand, price, type: "pos", pi }; }
      }
      if (!sixth) {
        const res = projectRecord(starters, data.seasons, undefined, 1, null, cand);
        if (res.S - 0.01 > bestKey) { bestKey = res.S - 0.01; best = { cand, price, type: "bench" }; }
      }
    }
    if (!best) continue;
    if (best.type === "pos") slots[best.pi] = best.cand; else sixth = best.cand;
    used.add(best.cand.playerCode); spent += best.price;
  }
  const five = slots.filter(Boolean);
  if (five.length < 5) return null;
  const players = spent;
  const six = [...five, sixth].filter(Boolean).map(stamp);
  // captain = highest-PIR starter (FREE); coach = best-fit affordable, else free caretaker
  const capP = five.slice().sort((a, b) => (b.pir ?? 0) - (a.pir ?? 0))[0];
  const coaches = eligibleCoaches(six, data);
  const co = coaches.find((e) => players + coachCost(e.coach) <= cap) || null;
  const deltas = co ? coachDeltas(co) : null;
  const r = projectRecord(five, data.seasons, undefined, 1, deltas, sixth, capP.playerCode);
  return { wins: r.wins, spent: players + (co ? coachCost(co.coach) : 0), caretaker: !co && coaches.length > 0 };
}

const N = Number(process.argv[2] || 4000);
console.log(`price = PIR · coach 15/10/5/2 · captain FREE (×2 impact) · €${SALARY_CAP} cap`);
console.log(`cap€ | 38-0%   med  p75  p90 | avgSpend | caretaker`);
for (const cap of [90, 100, 110]) {
  const rng = mulberry32(999);
  const w = [], sp = [];
  let perfect = 0, care = 0;
  for (let i = 0; i < N; i++) {
    const r = playCapped(rng, cap);
    if (!r) continue;
    w.push(r.wins); sp.push(r.spent); if (r.wins === 38) perfect++; if (r.caretaker) care++;
  }
  w.sort((a, b) => a - b);
  const q = (f) => w[Math.floor(f * (w.length - 1))];
  const avg = (sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(0);
  console.log(` €${cap}  | ${(100 * perfect / w.length).toFixed(2).padStart(5)}%  ${String(q(0.5)).padStart(3)}  ${String(q(0.75)).padStart(3)}  ${String(q(0.9)).padStart(3)} | €${avg}M  | ${(100 * care / w.length).toFixed(1)}%`);
}
