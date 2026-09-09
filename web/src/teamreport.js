// Team Report — the plain-language, position-aware breakdown behind the weakest-link line. It's
// DESCRIPTIVE only: it reads the same category scores the sim already produced and explains WHY,
// using the detailed box splits (rim vs perimeter D, OREB/DREB, 3PT/2PT/FT, turnovers). Everything
// is judged ERA + POSITION relative — a player's stat is z-scored against qualified players from his
// OWN season and position — so an old-era five is never dinged for the league's low 3PA of its day.
import { CATEGORIES, catZ } from "./engine.js";
import { archetypeOf, rosterArchetypes, rosterHas } from "./archetypes.js";
import { arenaTier } from "./arenas.js";

// Data names are ALL CAPS ("BECIROVIC, EMIR") — show the surname title-cased ("Becirovic"). Roman-
// numeral suffixes stay upper (Baldwin IV, not Iv) and curated two-letter initials too (KC, TJ), so
// this matches app.js prettyName.
const titleCase = (s) => s.toLowerCase()
  .replace(/(^|[ '\-])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase())
  .replace(/\b(ii|iii|iv|vi|vii|viii|ix)\b/gi, (m) => m.toUpperCase())
  .replace(/\b(kc|tj|pj|aj|dj|jd|cj|jj|rj|bj|jt|jp)\b/gi, (m) => m.toUpperCase());
const surname = (n) => titleCase(String(n).split(",")[0].trim() || n);
// "A", "A & B", "A, B & C" — joining three names with " & " twice read badly.
const nameList = (xs) => (xs.length <= 2 ? xs.join(" & ") : xs.slice(0, -1).join(", ") + " & " + xs[xs.length - 1]);
// Use the DERIVED role (data.js deriveRoles), not raw G/F/C: a "Forward" like Weems is a perimeter
// WING (interior=false), never a big — so he's never called a stretch big.
const isGuard = (p) => p.pos === "G";
const isBig = (p) => !!p.interior;               // centres + true interior forwards
const isWing = (p) => !p.interior && p.pos === "F"; // perimeter forwards (SF)

// ---- era+position baselines for the raw sub-stats (built once from the qualified pool) ----
let BASE = null; // BASE[season][pos][key] = {mean, std}
// per-game volume accessors + rate accessors (rates are only meaningful with enough attempts)
const VOL = {
  pts: (b) => b.pts, reb: (b) => b.reb, oreb: (b) => b.oreb, dreb: (b) => b.dreb,
  ast: (b) => b.ast, stl: (b) => b.stl, blk: (b) => b.blk, tov: (b) => b.tov, tpa: (b) => b.tpa,
};
const meanStd = (xs) => {
  const n = xs.length || 1;
  const m = xs.reduce((a, x) => a + x, 0) / n;
  const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / n;
  return { mean: m, std: Math.sqrt(v) || 1 };
};
const SIM_CATS = ["scoring", "rebounding", "playmaking", "defense", "efficiency"];
function buildBase(players) {
  const groups = new Map(); // "season|pos" -> [box...]
  const catGroups = new Map(); // "season|pos" -> [cat...]
  for (const p of players) {
    if (!p.q || !p.box) continue;
    const k = `${p.season}|${p.pos}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p.box);
    if (p.cat) { if (!catGroups.has(k)) catGroups.set(k, []); catGroups.get(k).push(p.cat); }
  }
  const base = {};
  for (const [k, boxes] of groups) {
    const [season, pos] = k.split("|");
    base[season] = base[season] || {};
    const stats = {};
    for (const key in VOL) stats[key] = meanStd(boxes.map(VOL[key]));
    // rates: shooting % among shooters with real volume, so a 1-attempt fluke doesn't set the bar
    stats.tp = meanStd(boxes.filter((b) => b.tpa >= 1).map((b) => b.tpm / b.tpa));
    stats.two = meanStd(boxes.filter((b) => b.twa >= 2).map((b) => b.twm / b.twa));
    stats.ft = meanStd(boxes.filter((b) => b.fta >= 1).map((b) => b.ftm / b.fta));
    // the SIM's own categories, z-scored the same way — comparing a raw box z across stats of wildly
    // different volume is apples-to-oranges (a 1.7-steal guard out-z's a 15-point guard), so anything
    // choosing "what is he best at" should use these, not pts/reb/ast/stl/blk.
    const cats = catGroups.get(k) || [];
    for (const c of SIM_CATS) stats["cat_" + c] = meanStd(cats.map((x) => x[c] || 0));
    base[season][pos] = stats;
  }
  return base;
}
function ensureBase(data) { if (!BASE) BASE = buildBase(data.players); }

// z-score of one player's stat vs his own season+position peers, softly shrunk so short old seasons
// (few games) can't throw an extreme z off noise — mirrors the engine's reliability idea.
function z(p, key, data) {
  ensureBase(data);
  const b = BASE[p.season] && BASE[p.season][p.pos] && BASE[p.season][p.pos][key];
  if (!b) return 0;
  let val;
  if (key.startsWith("cat_")) val = (p.cat && p.cat[key.slice(4)]) || 0;
  else if (key === "tp") val = p.box.tpa >= 1 ? p.box.tpm / p.box.tpa : b.mean;
  else if (key === "two") val = p.box.twa >= 2 ? p.box.twm / p.box.twa : b.mean;
  else if (key === "ft") val = p.box.fta >= 1 ? p.box.ftm / p.box.fta : b.mean;
  else val = VOL[key](p.box);
  const raw = (val - b.mean) / b.std;
  const shrink = p.gp ? p.gp / (p.gp + 4) : 1;
  return raw * shrink;
}
const avgZ = (players, key, data) => players.length ? players.reduce((a, p) => a + z(p, key, data), 0) / players.length : 0;

// ONE sentence that already says HOW he scores, read off the shot mix (3PT / FT / 2PT share of his
// points). The kind of scorer is part of the description, not a label appended after it.
function scorerLine(name, p, pick) {
  const b = (p && p.box) || {};
  const three = 3 * (b.tpm || 0), ft = b.ftm || 0, two = 2 * (b.twm || 0);
  const tot = three + ft + two;
  const t3 = tot > 0 ? three / tot : 0, tft = tot > 0 ? ft / tot : 0, t2 = tot > 0 ? two / tot : 0;
  if (t3 >= 0.25 && t2 >= 0.35 && tft >= 0.15) return `${name} is a three-level scorer who can carry the offense.`;
  if (t3 >= 0.45) return `${name} is a three-point scorer who can carry the offense.`;
  if (tft >= 0.28) return `${name} is a high-level scorer who gets to the free-throw line.`;
  if (t2 >= 0.68) return `${name} is an inside scorer who can carry the offense.`;
  return pick([`${name} is a genuine go-to scorer for late-game offense.`, `${name} is a high-level scorer who can carry the offense.`]);
}

// ---- the report ----
// Deterministic variety: pick a phrasing from a hash of the roster, so different teams read
// differently but a given team is stable.
const hashCodes = (five) => { let h = 2166136261; for (const p of five) { const s = p.playerCode || ""; for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 16777619)) >>> 0; } return h; };

// res = projectRecord output (categoryScores, gateCategory); five = starters;
// opts = { sixth, coachLabel, coachName, coachPedigree, arena:{name,rating}, caretaker }
export function teamReport(res, five, opts, data) {
  const { sixth = null, coachLabel = null, coachName = null, coachPedigree = null, arena = null, caretaker = false, champion = false } = opts || {};
  const guards = five.filter(isGuard), bigs = five.filter(isBig), wings = five.filter(isWing);
  // ---------- LINEUP SHAPE ----------
  // Measured over realistic drafts (sim/report_audit.mjs), 26% of fives are structurally odd — three
  // guards, one big or none, every big a floor-spacer — and the report named the shape in only 41%
  // of them. It handed you the symptoms (outrebounded, no rim protection) while the single fact that
  // caused BOTH sat unremarked in the lineup. This matters far more in play than it looks on real
  // club rosters: a real squad is built to be balanced, but Classic draws six independent
  // club-seasons, so the fives the game actually produces are much stranger.
  // A structural cause outranks a weak link, so these are tested FIRST in each chain below.
  const bigsStretch = bigs.filter((p) => { const a = archetypeOf(p, data); return a && a.key === "stretch_big"; });
  const allBigsStretch = bigs.length >= 2 && bigsStretch.length === bigs.length;
  const pgs = guards.filter((p) => p.pos5 === "PG");
  // NAME them. The court always draws one SF, one PF and one C because those are SLOTS, not readings
  // of who the players are — so a line saying "all three bigs" reads as plainly wrong against it, and
  // the reader's first question is which three. Naming answers it on the line itself.
  const bigNames = nameList(bigs.map((p) => surname(p.playerName)));
  const bigsWord = bigs.length === 2 ? `Both bigs (${bigNames})` : `All ${bigs.length === 3 ? "three" : "four"} bigs (${bigNames})`;
  // When the SHAPE is the cause, the cure is a different KIND of player, not more quality at the same
  // position — the generic per-category hint would tell a side already carrying three stretch bigs to
  // go and add floor spacing. Keyed by category, and only reachable when the matching shape branch
  // below actually claimed the weakness (they are tested first in each chain, so the two agree).
  const SHAPE_FIX = {};
  if (bigs.length === 0) {
    SHAPE_FIX.rebounding = SHAPE_FIX.defense = SHAPE_FIX.interior = "Any genuine big would do more than any other signing - this five doesn't have one.";
  } else if (allBigsStretch) {
    SHAPE_FIX.rebounding = "A big who actually plays inside would fix the glass; the ones you have both live out on the arc.";
  } else if (bigs.length === 1) {
    SHAPE_FIX.rebounding = "A second big alongside him would settle the glass; one man cannot hold it alone.";
  } else if (guards.length >= 3) {
    SHAPE_FIX.rebounding = "Trading a guard for size would do more than another rebounder - three guards cannot hold the glass.";
  }
  // the merged interior finding takes the same cure as the glass when a lineup shape caused it
  if (bigs.length === 1 || allBigsStretch) SHAPE_FIX.interior = "A second big who plays inside would fix both ends of this at once.";
  if (bigs.length >= 3) SHAPE_FIX.interior = "Size is not the problem here - one of these bigs needs to be a genuine rim protector and rebounder.";
  if (bigs.length >= 3) SHAPE_FIX.efficiency = "A shooter on the wing would open the floor; right now the bigs are standing on each other.";
  if (guards.length <= 1 || pgs.length === 0) SHAPE_FIX.playmaking = "A natural point guard would settle this - nobody here runs an offense for a living.";
  const seed = hashCodes(five);
  const pick = (arr) => arr[seed % arr.length];

  // STANDING IS THE BAR, in the bar's own units. The category bars are drawn in engine.catZ — each
  // category measured against a typical FINISHED build, in that category's own spread — so the report
  // judges in exactly the same measure and the two can never rank things differently. (Before, the
  // bars used score/mean and the report used score-mean, which disagreed 55% of the time; and both
  // over-weighted whichever categories have the smallest means.)
  const standing = {};
  for (const k of CATEGORIES) standing[k] = catZ(res.categoryScores[k], k);
  // The headline weakness = the SMALLEST BAR (lowest score-to-typical ratio), so this popup names the
  // same category the category-balance bars highlight. (Was res.gateCategory, the engine's absolute-
  // deviation gate, which could differ from the shortest bar and read as "weird".)
  let gate = CATEGORIES[0], gv = Infinity;
  for (const k of CATEGORIES) { if (standing[k] < gv) { gv = standing[k]; gate = k; } }

  // A category becomes a STRENGTH only if it's clearly ELITE (well above a typical team) AND a real
  // signal backs it, so the same praise never fires on a merely-decent category. A WEAKNESS surfaces
  // if the category is clearly below par OR it's the gate; its text is a SPECIFIC diagnosis.
  const ELITE = 0.55, WEAK = -0.25; // engine.catZ units: shared-scale distance from a typical build
  const strengths = [];
  const wcand = {}; // cat -> its specific diagnosis text; the actual selection happens after the caps.
  const S = (cat, elite, text) => { if (text && elite && standing[cat] > ELITE && !strengths.some((f) => f.cat === cat)) strengths.push({ cat, text }); };
  const W = (cat, text) => { if (text && !(cat in wcand)) wcand[cat] = text; };

  // ---------- DEFENSE (rim = big blocks, perimeter = guard steals) ----------
  const rimZ = avgZ(bigs, "blk", data), perimZ = avgZ(guards, "stl", data);
  S("defense", rimZ > 1.0 && rimZ >= perimZ, pick(["Rim protection anchors the defense; the bigs deter shots at the basket.", "Elite shot-blocking protects the paint."]));
  S("defense", perimZ > 1.0 && perimZ > rimZ, pick(["Strong perimeter pressure from the guards generates steals.", "The backcourt contains the perimeter and forces turnovers."]));
  // specific diagnosis: name whichever of rim / perimeter is the real hole
  W("defense",
    bigs.length === 0 ? "Not one of the five is a true interior player, so nothing protects the rim."
    : rimZ <= perimZ
    // Don't claim NOTHING is there when someone is. rimZ is a team average over the bigs, so a lone
    // real shot-blocker beside a passenger still averages low - the same absence-vs-presence trap the
    // Fix already guards against, and it belongs on the weakness text too.
    ? (rosterHas(five, "rim", data)
        ? `${surname((bigs.find((b) => { const a = archetypeOf(b, data); return a && a.caps.rim; }) || bigs[0]).playerName)} protects the rim alone; the rest of the paint is open.`
        : pick(["No rim protection; interior defense is a real problem.", "Little resistance at the rim, so interior defense is a concern."]))
    : pick(["Perimeter defense is a weak point opponents will exploit.", "The guards struggle to contain the perimeter."]));

  // ---------- REBOUNDING (bigs must board; OREB vs DREB) ----------
  const bigRebZ = avgZ(bigs, "reb", data), orebZ = avgZ(five, "oreb", data), drebZ = avgZ(five, "dreb", data);
  S("rebounding", bigRebZ > 1.1, pick(["The frontcourt controls the glass at both ends.", "Dominant on the boards, winning the possession battle."]));
  // Say WHICH glass and WHO — the flat "outrebounded on the whole" was the least specific line in
  // the report. It now only survives as a last resort, and a genuinely team-wide failure says so.
  // "The whole team can't rebound" = at least four of the five are below par for their own position
  // AND nobody is carrying the glass. (Requiring literally all five never fired — z is position-
  // relative, so a guard is judged against guards.)
  const rebZs = five.map((p) => z(p, "reb", data));
  const allWeakOnGlass = five.length >= 5 &&
    rebZs.filter((x) => x < 0).length >= 4 && Math.max(...rebZs) < 0.5;
  // The four tests above all average POSITION-RELATIVE z, and a strong five is usually ABOVE par for
  // its positions (median bigs-reb z ~ +0.6), so they almost never tripped: 98% of teams fell through
  // to the flat "outrebounded on the whole". A five can be outrebounded in ABSOLUTE terms while every
  // player is fine for his own position - the real cause is usually the LINEUP (too few bigs) or a
  // single weak link. Check those before the last-resort line.
  const worstReb = five.length ? [...five].sort((a, b) => z(a, "reb", data) - z(b, "reb", data))[0] : null;
  W("rebounding",
    // The lineup explains the glass before any individual does.
    bigs.length === 0 ? "Not one of the five is a true interior player, so the glass is conceded by design."
    : allBigsStretch ? `${bigsWord} play outside, so nobody is left on the glass.`
    : bigs.length === 1 ? "Only one true big in the five, so the frontcourt is outsized."
    : guards.length >= 3 ? "Three guards on the floor, so this five simply gets outsized on the glass."
    : allWeakOnGlass
    ? "Not one of the five rebounds above par; it's a team-wide problem, not one weak link."
    : bigRebZ < -0.4
    ? pick(["Undersized up front; the bigs are outrebounded.", "The frontcourt is outrebounded and cedes the paint."])
    : drebZ < -0.5 ? "Weak on the defensive glass, conceding too many second chances."
    : orebZ < -0.5 ? "Weak on the offensive glass - no second chances."
    : (worstReb && z(worstReb, "reb", data) < -0.5) ? `${surname(worstReb.playerName)} doesn't rebound for his position.`
    // Last resort, but now it says something: nobody in the five attacks the glass as a SPECIALISM.
    // "Outrebounded on the whole" was the least informative line in the report and fired on 24% of teams.
    : !rosterHas(five, "glass", data) ? "No second chances: nobody in the five goes after the offensive glass."
    : "The team is outrebounded on the whole.");

  // ---------- SCORING (a go-to option; usage logjam) ----------
  const scorer = [...five].sort((a, b) => z(b, "pts", data) - z(a, "pts", data))[0];
  const scorerZ = scorer ? z(scorer, "pts", data) : 0;
  const highUsage = five.filter((p) => p.mpg > 0 && p.box.fga / p.mpg > 0.34);
  S("scoring", scorerZ > 1.4, scorer ? scorerLine(surname(scorer.playerName), scorer, pick) : "");
  // A top-heavy five is a real, checkable cause: one man scores and the rest don't threaten. (Tested
  // and rejected: low minutes - generic-weakness fives average the same mpg as specific ones, 24.0 vs
  // 23.8 - so there is no minutes story here, and the flat line stays for cases with no clear cause.)
  const aboveParScorers = five.filter((p) => z(p, "pts", data) > 0).length;
  W("scoring", scorerZ < 0.5
    ? pick(["No go-to scorer to create offense in the clutch.", "No reliable shot-creator when the offense stalls."])
    : highUsage.length >= 3 ? `Too many high-usage scorers competing for the same shots.`
    : aboveParScorers <= 2 ? `${surname(scorer.playerName)} scores, but the rest of the five don't threaten.`
    : `${surname(scorer.playerName)} is the closest thing to a first option, and he isn't enough on his own.`);

  // ---------- PLAYMAKING (guards distribute; passing big; turnovers) ----------
  const guardAstZ = avgZ(guards, "ast", data);
  const passBig = bigs.find((p) => z(p, "ast", data) > 1.0);
  const turnoverProne = [...five].filter((p) => z(p, "tov", data) > 1.1 && z(p, "ast", data) > 0.3);
  // Name him. "A true floor general who creates for the whole team" praised nobody in particular —
  // the reader's first question is which one, and the answer is right there.
  const topPasser = guards.length ? [...guards].sort((a, b) => z(b, "ast", data) - z(a, "ast", data))[0] : null;
  S("playmaking", guardAstZ > 1.0, topPasser
    ? pick([`${surname(topPasser.playerName)} is a true floor general who creates for the whole team.`,
            `${surname(topPasser.playerName)} runs the offense and the backcourt generates open looks.`])
    : "The backcourt moves the ball well and generates open looks.");
  if (passBig && standing.playmaking > ELITE) S("playmaking", true, `${surname(passBig.playerName)} is a rare playmaking big the offense can run through.`);
  W("playmaking",
    guards.length <= 1 ? "Only one guard in the five, so ball-handling falls to players unused to it."
    : pgs.length === 0 ? "No natural point guard in the five; nobody runs the offense by trade."
    : guardAstZ < -0.3
    ? pick(["Not enough playmaking; the guards create little for others.", "Ball movement stalls without a true distributor."])
    : turnoverProne.length ? `${nameList(turnoverProne.map((p) => surname(p.playerName)))} commit${turnoverProne.length > 1 ? "" : "s"} too many turnovers.`
    : !rosterHas(five, "creator", data) ? "No natural distributor in the five; nobody sets the table by trade."
    : "The passing is there, but the ball sticks too often.");

  // ---------- EFFICIENCY (spacing, bigs inside, FT with the TS decomposition) ----------
  const tpaZ = avgZ(five, "tpa", data), tpPctZ = avgZ(five.filter((p) => p.box.tpa >= 1), "tp", data);
  const stretchBig = bigs.find((p) => p.box.tpa >= 1.5 && z(p, "tp", data) > 0.4);
  const shooterWing = wings.find((p) => p.box.tpa >= 2 && z(p, "tp", data) > 0.5);
  const bigsTwoZ = avgZ(bigs.filter((p) => p.box.twa >= 2), "two", data);
  const ftLiability = bigs.find((p) => p.box.fta >= 1.5 && z(p, "ft", data) < -0.9);
  if (stretchBig && standing.efficiency > ELITE) S("efficiency", true, `${surname(stretchBig.playerName)} stretches the floor as a shooting big.`);
  else if (shooterWing && standing.efficiency > ELITE) S("efficiency", true, `${surname(shooterWing.playerName)} spaces the floor with reliable outside shooting.`);
  else S("efficiency", true, "Efficient shot selection, generating high-value looks.");
  const ftShooters = five.filter((p) => p.box.fta >= 1);
  const teamFtZ = avgZ(ftShooters, "ft", data);
  W("efficiency",
    bigs.length >= 3 ? `${bigsWord} share the floor, so the paint is crowded and there is no room to operate.`
    : (tpaZ < -0.5 && tpPctZ < 0) ? pick(["No outside shooting, allowing defenses to pack the paint.", "No floor spacing to open driving lanes."])
    : ftLiability ? `${surname(ftLiability.playerName)} is a liability at the free-throw line, a target to foul late.`
    : (bigsTwoZ < -0.35 && bigs.length) ? "The bigs finish poorly inside, converting too few looks at the rim."
    : (ftShooters.length >= 3 && teamFtZ < -0.3) ? "Poor free-throw shooting hands back the points this five earns."
    : !rosterHas(five, "spacing", data) ? "Nobody stretches the defense, so every shot comes contested."
    : "Too many contested, low-value shots.");

  // ---------- FACTORS (merged into strengths, but ONLY when genuinely EXCEPTIONAL) ----------
  // A marquee (Legendary/Elite) coach, a star off the bench, or a true fortress arena - the kind of
  // thing actually worth calling out, with a SPECIFIC note on what it does. Routine ones stay silent.
  // Every archetype carries a documented NEGATIVE (see ARCHETYPES in coaches.js). When that negative
  // lands on the team's WORST category the coach is not a bright spot - you hired the man who deepens
  // your biggest flaw - so he does NOT go under Strengths at all. Instead the note is carried down onto
  // that weakness (see coachWorsens below), where it belongs.
  // The coach's NEGATIVE landing on the team's worst category is the one coach fact that belongs in
  // the Weaknesses list rather than the factors section: you hired the man who deepens your biggest
  // flaw, and that reads as a flaw, not as bench colour. Assessed for EVERY coach now — the old
  // pedigree gate meant this only ever fired for a Legendary/Elite name, and pedigree has nothing to
  // do with whether his system hurts you. Everything else the coach does is a factor line below.
  let coachWorsens = null;
  if (coachName) {
    const cn = surname(coachName), sys = COACH_SYS[coachLabel];
    if (sys && sys.hurts && sys.hurts === gate) {
      coachWorsens = { cat: gate, note: ` Coach ${cn}'s ${sys.adj} system makes it worse.` };
    }
  }
  // ---- cap by team quality: fewer bright spots the worse the team, more blunt truths. On-court
  // category strengths lead (best first); coach/bench/home fill in only if there's room. ----
  const q = res.expectedWins != null ? res.expectedWins : res.wins;
  const posCap = q < 12 ? 1 : q < 22 ? 2 : 3;
  const negCap = q < 12 ? 4 : q < 22 ? 3 : 2;

  // Weakness selection. A category that's a genuine STRENGTH is NEVER also listed as a weakness — that
  // self-contradiction ("elite scorer" sitting above "too many scorers") is what made the report argue
  // with itself. From what's left, the gate (relative weak point) leads, then the next categories that
  // are actually below a typical team, up to the cap. A side that's at/above typical everywhere is
  // allowed to show NO weakness rather than manufacturing one from a category it's merely least-elite in.
  const SOFT = -0.05;
  const strengthCats = new Set(strengths.map((s) => s.cat));
  const weaknesses = CATEGORIES.filter((c) => wcand[c] && !strengthCats.has(c)).map((c) => ({ cat: c, text: wcand[c] }));
  weaknesses.sort((a, b) => (a.cat === gate ? -1 : b.cat === gate ? 1 : standing[a.cat] - standing[b.cat]));
  const picked = [];
  for (const w of weaknesses) {
    if (picked.length >= negCap) break;
    if (standing[w.cat] < SOFT) picked.push(w); // only a category genuinely below par is a weakness
  }

  // ...but the result screen's tappable line already NAMED a weak point ("Not enough Playmaking"),
  // so a report of pure praise is a non-answer to the question the player just asked. If nothing is
  // below par, still explain the GATE as a RELATIVE weak point, honestly framed: the lowest bar on a
  // strong five, not a hole. (Skipped when the gate is itself a listed strength — that contradiction
  // is exactly what the strengthCats guard above exists to prevent.)
  if (!picked.length && wcand[gate] && !strengthCats.has(gate)) {
    picked.push({ cat: gate, text: `${wcand[gate]} It's the team's biggest weakness, though still above a typical five.` });
  }

  // ONE root cause, not two symptoms. A missing interior presence surfaces TWICE — as "nothing at the
  // rim" and as "outrebounded" — which inflates the weakness count and hides that it's a single hole.
  // When the rim is the defensive hole AND rebounding is also weak, merge them into one finding that
  // names both affected areas, so the Fix below can prescribe the actual cure (a big) rather than
  // treating either symptom on its own.
  const rimIsTheHole = rimZ <= perimZ;
  const di = picked.findIndex((w) => w.cat === "defense");
  const ri = picked.findIndex((w) => w.cat === "rebounding");
  if (rimIsTheHole && di !== -1 && ri !== -1) {
    const hi = Math.max(di, ri), lo = Math.min(di, ri);
    // The merge states the SYMPTOM pair. Where the lineup explains both — no big at all, one big
    // asked to do everything, or two bigs who both play out on the arc — say THAT instead: it is the
    // single fact causing both halves, and it was being lost precisely in the reports that needed it
    // most (every silent shape case in the audit was this merge swallowing a one-big frontcourt).
    const merged = { cat: "interior", text:
      bigs.length === 0 ? "Not one of the five is a true interior player: no rim protection and no rebounding."
      : allBigsStretch ? `${bigsWord} play out on the arc, so the paint goes unguarded and the glass unmanned.`
      : bigs.length === 1 ? `Only one true big in the five, and ${surname(bigs[0].playerName)} cannot cover the rim and the glass at once.`
      // Absence is the wrong word when the frontcourt is CROWDED. Three bigs and still nothing at the
      // rim or on the glass is a quality problem, and "no interior presence" flatly contradicts the
      // lineup the player is looking at.
      : bigs.length >= 3 ? `${bigsWord} on the floor and still nothing at the rim or on the glass.`
      : "No interior presence: no rim protection and no rebounding." };
    picked.splice(hi, 1); picked.splice(lo, 1);             // remove the HIGHER index first, or lo shifts
    picked.splice(Math.min(lo, picked.length), 0, merged);  // root cause takes the earlier of their slots
  }

  // The coach deepens the team's worst category: say so ON that weakness. (If defense/rebounding got
  // merged into the single "interior" finding, the note follows it there.)
  if (coachWorsens) {
    const target = picked.find((w) => w.cat === coachWorsens.cat)
      || (["defense", "rebounding"].includes(coachWorsens.cat) ? picked.find((w) => w.cat === "interior") : null);
    if (target) target.text += coachWorsens.note;
  }

  // Category strengths lead (strongest first) and obey the quality cap; the FACTOR shout-outs
  // (coach / bench / arena) are already gated to "exceptional", so they're appended rather than
  // competing for the cap — otherwise a stacked five's three category strengths always buried the
  // star 6th man / marquee coach / fortress arena and they never showed.
  // A category can be plainly excellent without tripping any of the SPECIFIC signals above (which need
  // a named shot-blocker, a 1.4-z scorer, a passing big and so on). A 31-7 finalist was getting ONE
  // on-court strength because scoring and rebounding cleared the bar but not the signal. If there is
  // room under the cap, a clearly-elite category earns a plain line rather than silence.
  for (const c of CATEGORIES) {
    if (strengths.length >= posCap) break;
    if (standing[c] > ELITE && !strengths.some((f) => f.cat === c)) strengths.push({ cat: c, text: PLAINLY_STRONG[c] });
  }

  // A five with nothing 30% above typical used to end up with an EMPTY Strengths list once the coach,
  // bench and arena moved to their own section — 42% of reports. An empty list is not an honest
  // answer either: every team is better at something than at everything else. So when nothing is
  // genuinely elite, name the best category and FRAME it truthfully as relative, the same way the
  // gate fallback does for weaknesses on a strong side.
  if (!strengths.length) {
    // Take the best category outright. The old filter excluded anything below SOFT, which on a genuinely
    // poor five is all five of them — so the team that most needed something said about it got an empty
    // Strengths list. We are already inside the "nothing is elite" branch and the line says so plainly;
    // the strongest category cannot also be the gate, so this can't contradict the weakness list.
    const best = [...CATEGORIES].sort((a, b) => standing[b] - standing[a])[0];
    // Deliberately plain, and deliberately NOT the enthusiastic per-category praise: pairing
    // "Efficient shot selection, generating high-value looks" with a walk-back ("if not a strength in
    // absolute terms") made the line argue with itself. One honest sentence instead.
    if (best) strengths.push({ cat: best, text: BEST_OF_A_BAD_LOT[best] });
  }
  const catStrengths = strengths.filter((s) => CATEGORIES.includes(s.cat)).sort((a, b) => standing[b.cat] - standing[a.cat]);
  // The Fix addresses the PRIMARY weakness actually shown — no weakness, no Fix (a strong side gets none
  // rather than a Fix for a problem it doesn't have). Two categories need a context-aware fix instead of
  // the generic per-category hint, since the generic one can prescribe the exact opposite of the cure:
  //  · playmaking: guards who create but cough it up need ball security, not another passer.
  //  · scoring:  a usage logjam (several high-volume scorers) needs the shots ORGANISED, not another
  //    scorer — the generic "add a shot-creator" would make the stated problem worse.
  // The merged INTERIOR finding covers TWO failing categories, so it is the bigger hole even when it
  // is not the single lowest bar — the Fix prescribes the one hire that repairs both.
  const primary = picked.find((w) => w.cat === "interior") || picked[0] || null;
  let hint = primary ? (HINTS[primary.cat === "defense" ? (rimIsTheHole ? "defense_rim" : "defense_onball") : primary.cat] || null) : null;
  // If the report just identified the COACH as what's deepening this weakness, the cure is the bench,
  // not another signing — prescribing a shooter while the system keeps costing you the same category
  // treated a different problem from the one diagnosed. Recommend a system that helps the gate instead
  // of hurting it (each is the archetype with the best delta on that category and no new hole).
  const coachIsTheCause = coachWorsens && primary &&
    (primary.cat === coachWorsens.cat ||
     (primary.cat === "interior" && ["defense", "rebounding"].includes(coachWorsens.cat)));
  if (coachIsTheCause) {
    const sysName = SYSTEM_FOR[coachWorsens.cat] || "a different"; // carries its own article (a / an)
    // No signing talk here: the problem is the system, not the personnel, and telling the player to
    // buy someone muddles the one case where the answer is purely on the bench.
    hint = `This system doesn't fit this group - ${sysName} approach would give you the ${coachWorsens.cat} `
      + `organisation these players are missing.`;
  } else if (primary && SHAPE_FIX[primary.cat]) {
    hint = SHAPE_FIX[primary.cat];
  } else if (primary && primary.cat === "playmaking" && guardAstZ >= -0.3 && turnoverProne.length) {
    // TESTED BEFORE the general capability branch below. When both could fire, the specific one is
    // right: a team whose playmaking is sunk by turnovers has a creator (so "you already have one"
    // is true but useless) and the actual instruction is ball security. Ordering these the other way
    // round produced "Vujcic commits too many turnovers" immediately followed by "Vujcic already
    // gives you creation" — the same man named as both the problem and the answer.
    hint = "The creation is already there - the offense needs fewer turnovers, not another passer.";
  } else if (primary && primary.cat === "scoring" && scorerZ >= 0.5 && highUsage.length >= 3) {
    hint = "The shots are there - a pass-first guard to organise the distribution would help more than another scorer.";
  } else if (primary && !ASSERTS_ABSENCE.test(primary.text)
             && needCap(primary.cat, rimIsTheHole) && rosterHas(five, needCap(primary.cat, rimIsTheHole), data)) {
    // THE PLEISS CASE. The old Fix prescribed a capability by CATEGORY alone, never checking whether
    // the five already had a player who supplies it — so it told a team holding Tibor Pleiss to go
    // and find a stretch big. Measured across every real club-season, 60% of Fixes asked for
    // something already on the roster. If the capability IS present, the problem is not absence, and
    // saying "sign one" is the wrong instruction: either the man doing it is alone, or it's a
    // quality problem rather than a personnel one.
    const cap = needCap(primary.cat, rimIsTheHole);
    const who = rosterArchetypes(five, data)
      .filter(({ arch }) => arch && arch.caps[cap] && arch.traits.confidence >= 0.6)
      .map(({ player }) => surname(player.playerName));
    hint = who.length === 1
      ? `${who[0]} already gives you ${CAP_WORD[cap]} - ${CAP_ALONE[cap]}`
      : `${CAP_PRESENT[cap]} ${nameList(who)} already do it, so this is about quality, not another signing.`;
  }

  // ---------- COACH, SIXTH MAN, HOME COURT ----------
  // All three are always ASSESSED, but they only ever speak when they are worth a line, and they
  // speak inside Strengths or Weaknesses rather than in a section of their own — a neutral coach or
  // an ordinary building is not news. Judged here, after the weaknesses are settled, so a factor can
  // never praise a category the report has just called a weakness (an "elite defense off the bench"
  // line sat directly under "on-ball defense is a weak point" in 2% of reports).
  const weakCats = new Set(picked.map((w) => w.cat));
  const bonus = [];  // -> Strengths
  if (coachName && !coachWorsens) {
    const cn = surname(coachName), sys = COACH_SYS[coachLabel];
    // A coach earns a line only when his system lands on something that matters: patching a category
    // the team is short in, or reinforcing one that is genuinely elite. Working on a category that is
    // neither (45% of coaches) is not a strength, so he says nothing.
    // COACH_SYS names ONE category, but every archetype moves two or three (Up-tempo is scoring +4,
    // playmaking +2, efficiency -1.5). Summarising him by the headline category alone hid the most
    // useful fact available: Ataman's secondary +2 was propping up the very playmaking the report had
    // just named as the weak link, and the line said only that he "amplifies an already potent offense".
    // ...but never when that category is itself a listed WEAKNESS: "props up the efficiency, which is
    // where this five is thinnest" sat in Strengths directly above "Efficiency - too many contested,
    // low-value shots". Same contradiction the bench lines are already guarded against; this branch
    // was missed.
    if (sys && sys.also && standing[sys.also] < SOFT && !weakCats.has(sys.also)) bonus.push({ cat: "coach", text: `Coach ${cn}'s ${sys.adj} system props up the ${sys.also}, which this five is short of.` });
    else if (sys && standing[sys.cat] > ELITE) bonus.push({ cat: "coach", text: `Coach ${cn}'s ${sys.adj} system ${sys.strong}.` });
    else if (sys && standing[sys.cat] < SOFT && !weakCats.has(sys.cat)) bonus.push({ cat: "coach", text: `Coach ${cn}'s ${sys.adj} system ${sys.weak}.` });
  }
  if (sixth) {
    const sa = archetypeOf(sixth, data), sn = surname(sixth.playerName);
    const zc = (k) => z(sixth, "cat_" + k, data);
    const ranked = SIM_CATS.map((k) => ({ k, zz: zc(k) })).sort((a, b) => b.zz - a.zz);
    const best = zc("scoring") >= 1.0 ? { k: "scoring", zz: zc("scoring") } : ranked[0];
    // "Covers a gap" used to mean the five had NOBODY with the capability. Too strict: on a team whose
    // one hole is playmaking, a creator arriving off the bench is the most interesting fact in the
    // report even if a starter nominally supplies creation too. A category the report has just called
    // a weakness counts as a gap.
    const covers = sa ? ["spacing", "rim", "glass", "creator", "stopper"]
      .find((c) => sa.caps[c] && (!rosterHas(five, c, data) || weakCats.has(CAP_CAT[c]))) : null;
    // The engine already discounts a ball-dominant reserve (benchValue); the player was never told.
    const lost = sa ? Math.round(100 * Math.max(0, (sa.traits.usage - 0.20) / 0.20) * 0.27 / 0.92) : 0;
    if (covers) {
      const line = rosterHas(five, covers, data)
        ? `Your best ${CAP_WORD[covers]} comes from ${sn}, off the bench - the one thing this five is short of.`
        : `${sn} is the only ${CAP_NOUN[covers]} on the roster, and he's coming off the bench.`;
      bonus.push({ cat: "bench", text: line });
    }
    else if (lost >= 20) picked.push({ cat: "bench", text: `${sn} is a ball-dominant starter cast as a reserve, and a good deal of what he does is lost in a bench role.` });
    // Never praise him for a category the five has just been marked down in — that reads as the
    // report contradicting itself rather than explaining the weakness.
    else if (best.zz > 1.2 && !weakCats.has(best.k)) bonus.push({ cat: "bench", text: `A star reserve in ${sn}, who provides elite ${BENCH_WORD[best.k]} off the bench.` });
    else if (best.zz > 0.9 && !weakCats.has(best.k)) bonus.push({ cat: "bench", text: `${sn} is a functional 6th man, a real lift of ${BENCH_WORD[best.k]} off the bench.` });
  }
  if (arena) {
    // Wording comes off the SAME band the flame meter draws (arenaTier), so the sentence and the
    // flames can never disagree: Palau Blaugrana showed two flames while the report called it "a real
    // edge on the 19 home nights".
    const tier = arenaTier(arena.rating);
    if (tier === 5) bonus.push({ cat: "arena", text: `A genuine fortress at ${arena.name}, a significant home-court advantage.` });
    else if (tier === 4) bonus.push({ cat: "arena", text: `${arena.name} is a real edge on home nights.` });
    else if (tier === 1) picked.push({ cat: "arena", text: `${arena.name} is no advantage; visiting sides are comfortable there.` });
  }

  // Rebuild the capped lists now the factors are known. Category strengths lead (strongest first);
  // the factors are guaranteed up to posCap-1 slots so a stacked five can't bury a marquee coach or a
  // star reserve, but the TOTAL still obeys the cap - fewer bright spots the worse the team.
  const nB = Math.min(bonus.length, Math.max(0, posCap - 1));
  const merged = [...catStrengths.slice(0, posCap - nB), ...bonus.slice(0, nB)];
  for (const f of [...catStrengths, ...bonus]) { if (merged.length >= posCap) break; if (!merged.includes(f)) merged.push(f); }

  // EuroLeague champion: a victory lap, not a critique. Lead with the praise (strengths + the coach /
  // bench / arena shout-outs), and DROP the prescriptive Fix — nothing needs fixing, you won it. If a
  // real weakness was still carried to the title, it isn't hidden: it's reframed as something the whole
  // overcame ("even with X lagging, the team still had more than enough"), so the flaw makes the run
  // read as MORE impressive, not less.
  if (champion) {
    const weak = picked.map((w) => w.cat);
    let triumph;
    if (weak.length) {
      const list = weak.length > 1 ? weak.slice(0, -1).join(", ") + " and " + weak[weak.length - 1] : weak[0];
      triumph = `Even with ${list} never quite clicking, the whole had more than enough - champions of Europe.`;
    } else {
      triumph = `No real weakness anywhere - a complete team, and champions of Europe.`;
    }
    return { strengths: merged, weaknesses: [], hint: null, gate, triumph };
  }

  return { strengths: merged, weaknesses: picked.slice(0, negCap + 1), hint, gate };
}

// What the Fix is really asking for, per weakness — and how to talk about it when the five HAS it.
// What the Fix is really asking for. `defense` is resolved at call time, not here: the defensive
// weakness has TWO diagnoses (no rim protection vs no on-ball containment) and prescribing rim help
// for an on-ball problem answers a question the report never asked. Fired on 7.2% of reports.
const NEED_CAP = { efficiency: "spacing", rebounding: "glass", playmaking: "creator", interior: "rim" };
const needCap = (cat, rimIsTheHole) => (cat === "defense" ? (rimIsTheHole ? "rim" : "stopper") : NEED_CAP[cat]);
// Some weakness lines state that a capability is simply ABSENT ("No interior presence: no rim
// protection and no rebounding"). The "you already have one" Fix must never answer those: the two
// tests disagree by construction — the weakness is judged on TEAM averages (the bigs' blocks against
// the guards' steals) while rosterHas asks about an INDIVIDUAL, so a lone above-average centre can be
// credited with rim protection one line under a finding that says there is none. When the report has
// asserted absence, the Fix falls through to the plain prescription instead.
const ASSERTS_ABSENCE = /\bNo\b|Nobody|Not enough playmaking|Little resistance/;
const CAP_CAT = { spacing: "efficiency", rim: "defense", glass: "rebounding", creator: "playmaking", stopper: "defense" };
// "the only <X> on the roster" needs a PERSON noun; CAP_WORD is the abstract skill and reads as
// "the only rebounding on the roster".
const CAP_NOUN = { spacing: "outside shooter", rim: "rim protector", glass: "real rebounder",
  creator: "creator", stopper: "perimeter defender" };
const CAP_WORD = { spacing: "floor spacing", rim: "rim protection", glass: "rebounding", creator: "creation", stopper: "perimeter defense" };
const CAP_ALONE = {
  spacing: "the other four give defenses nothing to worry about outside.",
  rim: "he is protecting the rim alone, and one big cannot cover the whole paint.",
  glass: "he is boxing out alone while the other four leak second chances.",
  creator: "he is creating alone, and the offense stops whenever he sits.",
  stopper: "he is guarding the perimeter alone, and offenses simply attack elsewhere.",
};
const CAP_PRESENT = {
  spacing: "The shooting is already on the floor -", rim: "The rim protection is already there -",
  glass: "The rebounding is already there -", creator: "The creation is already there -",
  stopper: "The perimeter defense is already there -",
};

// A clearly-elite category that tripped no specific signal (see the cap-filling loop above).
const PLAINLY_STRONG = {
  scoring: "The five puts up points comfortably above a typical side.",
  rebounding: "This team wins the glass against a typical side.",
  playmaking: "The ball moves well and the offense creates good looks.",
  defense: "A genuinely strong defensive side.",
  efficiency: "The five takes and makes high-value shots.",
};
// Used only by the no-elite-category fallback above: the honest "you're least bad at this" line.
const BEST_OF_A_BAD_LOT = {
  scoring: "Scoring is where this five holds up best.",
  rebounding: "The glass is where this five holds up best.",
  playmaking: "Ball movement is where this five holds up best.",
  defense: "Defense is where this five holds up best.",
  efficiency: "Shot quality is where this five holds up best.",
};
const BENCH_WORD = { scoring: "scoring", rebounding: "rebounding", playmaking: "playmaking", defense: "defense", efficiency: "efficiency" };
// A coach's archetype, the category it acts on, and a specific effect phrase for when that category
// is a weakness (weak) versus already a strength (strong).
const COACH_SYS = {
  Defensive: { adj: "defensive", cat: "defense", also: "efficiency", hurts: "scoring", weak: "addresses the team's defensive shortcomings", strong: "reinforces an already strong defense" },
  "Up-tempo": { adj: "up-tempo", cat: "scoring", also: "playmaking", hurts: "efficiency", weak: "lifts a struggling offense with pace", strong: "amplifies an already potent offense" },
  Motion: { adj: "motion", cat: "playmaking", also: "efficiency", hurts: "defense", weak: "sharpens the team's ball movement and shot creation", strong: "reinforces the team's ball movement" },
  Physical: { adj: "physical", cat: "rebounding", also: "defense", hurts: "playmaking", weak: "toughens a soft team on the glass", strong: "reinforces a physical frontcourt" },
};
// Which coaching system best HELPS each category. Efficiency picks balanced (+1.2, no negative)
// over defensive (+1.5 but -1.5 scoring) - the point is to close the hole, not trade it.
const SYSTEM_FOR = { scoring: "an up-tempo", rebounding: "a physical", playmaking: "a motion",
  defense: "a defensive", efficiency: "a balanced" };
const HINTS = {
  scoring: "Add a shot-creator who can generate his own offense.",
  rebounding: "A physical rebounding big would shore up the glass.",
  playmaking: "A pass-first floor general would settle the offense.",
  defense: "A rim-protecting big or a strong perimeter defender would help most.",
  defense_rim: "A rim-protecting big would help most.",
  defense_onball: "A perimeter defender who can contain the ball would help most.",
  efficiency: "A reliable outside shooter or a stretch big would open the floor.",
  // the merged root cause: one hire fixes both the paint and the glass
  interior: "A rim-protecting big would fix both the rim defense and the rebounding.",
};
