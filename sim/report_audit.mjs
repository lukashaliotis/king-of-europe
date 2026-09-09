// Team Report audit over REALISTIC DRAFTS, not intact club rosters.
//
// The first version of this audit walked the 543 real club top-fives. That set is biased: a real
// EuroLeague squad is structurally sane — it does not field two stretch bigs and three natural point
// guards. Classic draws SIX INDEPENDENT club-seasons and you take one player from each, so the fives
// the game actually produces are far stranger than any real roster. Measuring on real rosters flatters
// the report and hid several faults (a screenshot from one real game surfaced three of them at once).
// This harness spins the way the game spins.
// Run: node sim/report_audit.mjs [nDrafts]
import { readFileSync } from "fs";
import { buildClubSeasons } from "../web/src/data.js";
import { projectRecord, mulberry32, CATEGORIES } from "../web/src/engine.js";
import { teamReport } from "../web/src/teamreport.js";
import { rosterHas, archetypeOf } from "../web/src/archetypes.js";
import { buildCoachProfiles, eligibleCoaches, coachDeltas, archetypeLabel, pedigreeLabel } from "../web/src/coaches.js";
import { arenaFor, ratingToMult, arenaTier } from "../web/src/arenas.js";

const data = JSON.parse(readFileSync(new URL("../data/players.json", import.meta.url), "utf8"));
const pools = buildClubSeasons(data);
buildCoachProfiles(data);
const N = Number(process.argv[2] || 4000);
const rng = mulberry32(20260909);
const SLOT_POS = ["G", "G", "F", "F", "C"];
const pick = (a) => a[Math.floor(rng() * a.length)];
const stamp = (p, pool) => ({ ...p, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } });

// One draft: six independent spins, each contributing one player. A player is offered for a slot only
// if his coarse position fits it, which is the game's own rule; within that we take a top-of-roster
// name, since a player picks from what the spin actually surfaces.
function draft() {
  const five = [];
  for (let i = 0; i < 5; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const pool = pick(pools);
      const fit = pool.players.slice(0, 8).filter((p) => p.pos === SLOT_POS[i]);
      if (fit.length) { five.push(stamp(pick(fit), pool)); break; }
    }
    if (five.length !== i + 1) return null; // couldn't fill this slot
  }
  const sp = pick(pools);
  return { five, sixth: stamp(pick(sp.players.slice(0, 8)), sp) };
}

const GENERIC = [/Not enough scoring across the five/, /The team is outrebounded on the whole/,
  /Too many contested, low-value shots/, /Not enough ball movement or creation/];
const NEED = (cat, rimHole) => (cat === "defense" ? (rimHole ? "rim" : "stopper")
  : { efficiency: "spacing", rebounding: "glass", playmaking: "creator", interior: "rim" }[cat]);

let n = 0;
const c = { noSt: 0, noWk: 0, noFix: 0, dup: 0, em: 0, capB: 0, generic: 0, genL: 0, totL: 0,
  askHave: 0, askN: 0, absN: 0, mismatch: 0, contra: 0, arenaDrift: 0, shape: 0, shapeSilent: 0, factorLines: 0 };
const shapes = {};
for (let i = 0; i < N; i++) {
  const d = draft(); if (!d) continue;
  const { five, sixth } = d;
  const co = (eligibleCoaches([...five, sixth], data) || [])[0] || null;
  const src = pick(five)._src;
  const ar = arenaFor(src.teamCode, five.find((p) => p._src === src).season);
  let res;
  try { res = projectRecord(five, data.seasons, undefined, ratingToMult(ar.rating), co ? coachDeltas(co) : null, sixth); }
  catch { continue; }
  const rp = teamReport(res, five, { sixth, coachLabel: co ? archetypeLabel(co.coach) : null,
    coachName: co ? co.coach.name : null, coachPedigree: co ? pedigreeLabel(co.coach) : null,
    arena: { name: ar.name, rating: ar.rating } }, data);
  n++;
  const lines = [...rp.strengths, ...rp.weaknesses].map((x) => x.text);
  const all = lines.concat(rp.hint || "");
  c.totL += lines.length;
  if (!rp.strengths.length) c.noSt++;
  if (!rp.weaknesses.length) c.noWk++;
  if (!rp.hint) c.noFix++;
  if (rp.strengths.some((x) => rp.weaknesses.some((w) => w.cat === x.cat))) c.dup++;
  if (rp.strengths.length > 3) c.capB++;
  if (all.some((t) => /[—–]/.test(t))) c.em++;
  const g = lines.filter((t) => GENERIC.some((r) => r.test(t))).length;
  c.genL += g; if (g) c.generic++;
  c.factorLines += [...rp.strengths, ...rp.weaknesses].filter((x) => ["coach", "bench", "arena"].includes(x.cat)).length;
  // the Fix must not ask for what the five already has
  const prim = rp.weaknesses.filter((w) => CATEGORIES.includes(w.cat) || w.cat === "interior");
  const p0 = prim.find((w) => w.cat === "interior") || prim[0];
  const onBall = rp.weaknesses.some((w) => w.cat === "defense" && /on-ball|contain the ball/i.test(w.text));
  if (p0) {
    const need = NEED(p0.cat, !onBall);
    // A finding that states a TEAM-LEVEL absence ("No interior presence") is not answered by pointing
    // at one man who has the trait: the correct advice there really is "sign one", even though an
    // individual clears the individual bar. Counting those as false prescriptions overstated the
    // fault, so they are excluded and reported separately.
    const absence = /\bNo\b|Nobody|Not enough playmaking|Little resistance/.test(p0.text);
    // Only a GENERIC prescription can be a false ask. The context-aware Fixes (fewer turnovers,
    // change the system, organise the shots) are not asking for a signing at all.
    // Only the GENERIC per-category prescriptions can be a false ask. The shape Fixes name a
    // different KIND of player ("a big who actually plays inside", "a shooter on the wing"), so
    // having the capability already does not make them wrong.
    const prescribes = /^(Add a shot-creator|A physical rebounding big|A pass-first floor general|A rim-protecting big|A point-of-attack defender|A reliable outside shooter)/.test(rp.hint || "");
    if (need && !absence) { c.askN++; if (prescribes && rosterHas(five, need, data)) c.askHave++; }
    if (need && absence) c.absN++;
  }
  if (onBall && /rim/i.test(rp.hint || "")) c.mismatch++;
  for (const x of rp.strengths) {
    const m = x.text.match(/elite (scoring|rebounding|playmaking|defense|efficiency)/);
    if (m && rp.weaknesses.some((w) => w.cat === m[1])) { c.contra++; break; }
  }
  // arena wording vs the flames the player can see
  const tier = arenaTier(ar.rating);
  const saysEdge = all.some((t) => /real edge|genuine fortress/.test(t));
  if (saysEdge && tier < 4) c.arenaDrift++;
  // structurally odd lineups: is the SHAPE ever named?
  const bigs = five.filter((p) => p.interior);
  const stretch = bigs.filter((p) => { const a = archetypeOf(p, data); return a && a.key === "stretch_big"; });
  const guards = five.filter((p) => p.pos === "G");
  const odd = (bigs.length >= 2 && stretch.length === bigs.length) || bigs.length <= 1 || guards.length >= 3 || bigs.length >= 3
    || five.filter((p) => p.pos === "G").length <= 1;
  // A lopsided five is only a REPORTING gap when the category that shape damages is actually one of
  // the listed weaknesses. A one-big lineup that rebounds fine needs no explanation, and counting it
  // as a miss overstated the fault.
  // Each shape damages a SPECIFIC category; a three-big lineup whose efficiency is fine is not a
  // reporting miss. Tie the test to the category that shape actually harms.
  const wk = new Set(rp.weaknesses.map((w) => w.cat));
  const pgs = five.filter((p) => p.pos === "G" && p.pos5 === "PG");
  const shapeMatters =
    (((bigs.length <= 1) || (bigs.length >= 2 && stretch.length === bigs.length) || guards.length >= 3) && (wk.has("rebounding") || wk.has("interior")))
    || (bigs.length >= 3 && wk.has("efficiency"))
    || ((guards.length <= 1 || !pgs.length) && wk.has("playmaking"));
  const key = `${guards.length}G/${5 - guards.length - bigs.length}W/${bigs.length}B`;
  shapes[key] = (shapes[key] || 0) + 1;
  if (odd && shapeMatters) { c.shape++; if (!all.some((t) => /true big|by design|outsized|play out on the arc|nobody is left on the glass|Three guards|share the floor|natural point guard|Only one guard/i.test(t))) c.shapeSilent++; }
}
const pc = (x) => (100 * x / n).toFixed(1) + "%";
console.log(`drafts audited: ${n}  (six independent spins each)\n`);
console.log("CORRECTNESS");
console.log("  category in BOTH lists         :", c.dup, pc(c.dup));
console.log("  Fix contradicts the weakness   :", c.mismatch, pc(c.mismatch), "  (rim advice for an on-ball hole)");
console.log("  praise for a listed weakness   :", c.contra, pc(c.contra));
console.log("  arena text vs its flame count  :", c.arenaDrift, pc(c.arenaDrift));
console.log("  em dashes / cap breaches       :", c.em, "/", c.capB);
console.log("\nSUBSTANCE");
console.log("  Fix asks for what they HAVE    :", c.askHave + "/" + c.askN, (100 * c.askHave / (c.askN || 1)).toFixed(0) + "%");
console.log("  (team-level absence findings   :", c.absN, "- excluded, \"sign one\" is correct there)");
console.log("  reports w/ a generic line      :", c.generic, pc(c.generic));
console.log("  generic lines / all lines      :", c.genL + "/" + c.totL, (100 * c.genL / c.totL).toFixed(1) + "%");
console.log("  empty Strengths / Weaknesses   :", pc(c.noSt), "/", pc(c.noWk));
console.log("  no Fix                         :", c.noFix, pc(c.noFix));
console.log("  coach/bench/home lines earned  :", (c.factorLines / n).toFixed(2), "per report");
console.log("\nLINEUP SHAPE (the gap this audit exists to expose)");
console.log("  odd shape AND a matching weakness:", c.shape, pc(c.shape));
console.log("  ...with the shape never named  :", c.shapeSilent, (100 * c.shapeSilent / (c.shape || 1)).toFixed(0) + "% of those");
console.log("  top shapes:", Object.entries(shapes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join("  "));
