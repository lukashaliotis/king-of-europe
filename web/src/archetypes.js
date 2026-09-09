// Player archetypes — WHAT KIND of player each man is, season by season.
//
// The Team Report already knew how GOOD a player was for his position (position-relative z). It did
// not know what KIND of player he was, which produced the bug this module exists to fix: the report
// told a team holding Tibor Pleiss that it needed "a stretch big to open the floor". Pleiss WAS the
// stretch big — the old test used an absolute volume bar (tpa >= 1.5) while every other judgement in
// the report is era- and position-relative, so a centre taking 1.1 threes a game at 45% registered as
// nothing at all.
//
// THREE RULES THIS FILE OBEYS
//
// 1. SEASON-SPECIFIC, never career. The game drafts a club-SEASON, so the label must describe the man
//    who played THAT year. Pleiss took 0.0 threes in 2013 and 2.7 in 2023; calling both "shooting big"
//    would be a lie in one direction or the other. Reputation is not evidence.
//
// 2. SHARE BEFORE VOLUME. Raw counts don't travel across eras or positions, and for bigs the 3PA
//    distribution is so lumpy (median centre: 0.1 a game) that both z-scores AND percentiles mislead —
//    z understates the skew, and ties inflate the percentile so 0.2 attempts reads as "76th centile".
//    What survives is the share of a man's OWN shots taken from outside: Tavares 0-1%, Hines 0-3%,
//    Dunston 0-7%, Antić 39-73%. Scale-free, era-neutral, and it says what we actually mean —
//    how much of his game is played out there.
//
// 3. A LABEL MUST BE EARNED. Everything here is checked against real prototypes (sim/archetype_check.mjs)
//    before it ships. A player who clears no bar is a role player, and saying so is a real answer —
//    inventing a specialism for an ordinary starter would make every label meaningless.
//
// Judged against same-season, same-position peers throughout, with the engine's own gp/(gp+K)
// shrinkage, so a 7-game cameo can't post an extreme rate and claim a specialism off noise.

const SHRINK_K = 4; // mirrors engine.js reliabilityK

// ---------------------------------------------------------------------------------------------
// Baselines: mean/std per (season, position) for the RATIO traits below. Built once, lazily.
// ---------------------------------------------------------------------------------------------
let BASE = null;
const meanStd = (xs) => {
  const n = xs.length || 1;
  const m = xs.reduce((a, x) => a + x, 0) / n;
  const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / n;
  return { mean: m, std: Math.sqrt(v) || 1 };
};

// The raw per-game traits we baseline. Rates are guarded against tiny denominators by the callers.
const TRAIT = {
  pts: (b) => b.pts,
  reb: (b) => b.reb,
  oreb: (b) => b.oreb,
  ast: (b) => b.ast,
  stl: (b) => b.stl,
  blk: (b) => b.blk,
  tpa: (b) => b.tpa,
  fd: (b) => b.fd,   // fouls drawn — rim pressure. Baked but never used until now.
  blka: (b) => b.blka, // own shots blocked — takes it into contact. Also previously unused.
};

function buildBase(players) {
  const groups = new Map();
  for (const p of players) {
    if (!p.q || !p.box) continue;
    const k = `${p.season}|${p.pos}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const base = {};
  for (const [k, arr] of groups) {
    const [season, pos] = k.split("|");
    base[season] = base[season] || {};
    const stats = {};
    for (const key in TRAIT) stats[key] = meanStd(arr.map((p) => TRAIT[key](p.box)));
    base[season][pos] = stats;
  }
  return base;
}
export function ensureArchetypeBase(data) { if (!BASE) BASE = buildBase(data.players); return BASE; }
export function _resetArchetypeBase() { BASE = null; DIET = null; } // tests only

// ---------------------------------------------------------------------------------------------
// ERA-RELATIVE SHOT DIET. Shot selection has moved further in 25 years than any other thing in this
// data: the MEDIAN qualified guard now takes 48% of his shots from three, so a fixed "45% = sniper"
// bar sat below the middle of the league and made snipers of 30% of all guards. A label that common
// says nothing. Diet is therefore judged as a PERCENTILE within the player's own season and position
// group — exactly the era-relative rule the rest of the project already follows for everything else.
// Position GROUP (big / wing / guard), not the raw G/F/C, so a perimeter forward is compared with
// wings and a true big with bigs.
// ---------------------------------------------------------------------------------------------
let DIET = null; // DIET["season|group"] = { share:[sorted], vol:[sorted] }
export const groupOf = (p) => (p.interior ? "big" : p.pos === "G" ? "guard" : "wing");
function buildDiet(players) {
  const g = new Map();
  for (const p of players) {
    if (!p.q || !p.box || (p.gp || 0) < 10) continue; // the league's real shot diet, not cameos
    const k = `${p.season}|${groupOf(p)}`;
    if (!g.has(k)) g.set(k, { share: [], vol: [] });
    const shots = p.box.tpa + p.box.twa;
    g.get(k).share.push(shots > 0 ? p.box.tpa / shots : 0);
    g.get(k).vol.push(p.box.tpa);
  }
  const out = {};
  for (const [k, v] of g) out[k] = { share: v.share.sort((a, b) => a - b), vol: v.vol.sort((a, b) => a - b) };
  return out;
}
// Fraction of same-season, same-group peers this value exceeds. Midpoint of the tied run, so the
// heavy cluster of bigs at exactly 0.0 threes doesn't hand a man who took 0.2 a "76th percentile".
function pctile(sorted, v) {
  if (!sorted || !sorted.length) return 0.5;
  let lo = 0, hi = 0;
  for (const x of sorted) { if (x < v) lo++; if (x <= v) hi++; }
  return (lo + hi) / (2 * sorted.length);
}
function dietPct(p, data) {
  if (!DIET) DIET = buildDiet(data.players);
  const d = DIET[`${p.season}|${groupOf(p)}`];
  const b = p.box, shots = b.tpa + b.twa;
  return {
    sharePct: pctile(d && d.share, shots > 0 ? b.tpa / shots : 0),
    volPct: pctile(d && d.vol, b.tpa),
  };
}

// Position-relative, shrunk z for one raw trait.
function zt(p, key, data) {
  ensureArchetypeBase(data);
  const b = BASE[p.season] && BASE[p.season][p.pos] && BASE[p.season][p.pos][key];
  if (!b || !p.box) return 0;
  const raw = (TRAIT[key](p.box) - b.mean) / b.std;
  return raw * (p.gp ? p.gp / (p.gp + SHRINK_K) : 1);
}

// ---------------------------------------------------------------------------------------------
// Scale-free shot-diet + role ratios. These carry the archetype logic; the z's above only say
// "unusual for his position", which is a different question from "what does he do".
// ---------------------------------------------------------------------------------------------
export function traitsOf(p, data) {
  const b = p.box || {};
  const fga = b.fga || 0, tpa = b.tpa || 0, twa = b.twa || 0, fta = b.fta || 0;
  const shots = tpa + twa;
  return {
    // shot diet
    outsideShare: shots > 0 ? tpa / shots : 0,       // how much of his game is beyond the arc
    outsideVol: tpa,                                  // absolute floor — a threat needs real attempts
    outsideAcc: tpa >= 0.5 ? b.tpm / tpa : 0,         // only meaningful with attempts
    twoAcc: twa >= 1.5 ? b.twm / twa : 0,
    ftRate: fga > 0 ? fta / fga : 0,                  // rim pressure / contact seeking
    ftAcc: fta >= 1 ? b.ftm / fta : 0,
    // role
    orebShare: b.reb > 0 ? b.oreb / b.reb : 0,
    tovRatio: (b.ast + b.tov) > 0 ? b.tov / (b.ast + b.tov) : 0,
    usage: p.mpg > 0 ? fga / p.mpg : 0,
    starterShare: p.gp > 0 ? (p.gs || 0) / p.gp : 0,  // gs: baked since day one, never read until now
    // era-relative shot diet (see buildDiet): where he sits among his own season's peers
    ...dietPct(p, data),
    // position-relative standing
    zPts: zt(p, "pts", data), zReb: zt(p, "reb", data), zOreb: zt(p, "oreb", data),
    zAst: zt(p, "ast", data), zStl: zt(p, "stl", data), zBlk: zt(p, "blk", data),
    zTpa: zt(p, "tpa", data), zFd: zt(p, "fd", data),
    confidence: p.gp ? p.gp / (p.gp + SHRINK_K) : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// The archetypes. `key` is what code matches on; `label` is what the player reads; `need` is the
// short phrase used when the Fix asks for one ("the team needs <need>").
// Ordered by priority WITHIN each position group — the first bar a player clears wins, so the more
// specific, more identity-defining archetypes are tested before the general ones.
// ---------------------------------------------------------------------------------------------
export const ARCHETYPE = {
  // --- bigs -------------------------------------------------------------------------------
  stretch_big:   { label: "Stretch big",      need: "a stretch big",            group: "big" },
  rim_protector: { label: "Rim protector",    need: "a rim-protecting big",     group: "big" },
  glass_cleaner: { label: "Glass cleaner",    need: "a rebounding big",         group: "big" },
  post_scorer:   { label: "Post scorer",      need: "an interior scorer",       group: "big" },
  playmaking_big:{ label: "Playmaking big",   need: "a playmaking big",         group: "big" },
  rim_runner:    { label: "Rim runner",       need: "a finisher at the rim",    group: "big" },
  energy_big:    { label: "Energy big",       need: "a big",                    group: "big" },
  // --- wings ------------------------------------------------------------------------------
  three_and_d:   { label: "3&D wing",         need: "a 3&D wing",               group: "wing" },
  sharpshooter:  { label: "Sharpshooter",     need: "an outside shooter",       group: "wing" },
  slasher:       { label: "Slashing wing",    need: "a slasher who draws fouls",group: "wing" },
  point_forward: { label: "Point forward",    need: "a playmaking forward",     group: "wing" },
  scoring_wing:  { label: "Scoring wing",     need: "a wing who can score",     group: "wing" },
  glue_wing:     { label: "Glue wing",        need: "a wing",                   group: "wing" },
  // --- guards -----------------------------------------------------------------------------
  floor_general: { label: "Floor general",    need: "a pass-first floor general", group: "guard" },
  sniper:        { label: "Sniper",           need: "an outside shooter",       group: "guard" },
  combo_guard:   { label: "Combo guard",      need: "a scoring guard",          group: "guard" },
  slashing_guard:{ label: "Slashing guard",   need: "a guard who gets downhill",group: "guard" },
  on_ball_pest:  { label: "On-ball pest",     need: "a point-of-attack defender", group: "guard" },
  volume_scorer: { label: "Volume scorer",    need: "a shot-creator",           group: "guard" },
  role_guard:    { label: "Role guard",       need: "a guard",                  group: "guard" },
};

/**
 * The archetype of ONE player-season. Position group comes from the derived role (data.js
 * deriveRoles), so a "Forward" who is really a perimeter wing is judged as a wing, never as a big.
 */
export function archetypeOf(p, data) {
  if (!p || !p.box) return null;
  const t = traitsOf(p, data);
  const big = !!p.interior;
  const guard = p.pos === "G";
  let key;

  if (big) {
    // A big who genuinely plays outside. Needs BOTH a real share of his own shots AND enough
    // absolute attempts to be respected — a 40% share off 0.3 attempts a game is a rounding error,
    // not spacing. Accuracy is a floor, not a bar: a big defenders must close out on has value even
    // at 33%, which is why Antić (72% share, 27%) still counts and Pleiss's 2013 (0 attempts) doesn't.
    if (t.sharePct >= 0.72 && t.volPct >= 0.70 && t.outsideAcc >= 0.30) key = "stretch_big";
    // 0.85, not 1.0: verified against Dunston, whose blocks clear 1.0 in five seasons but sit at
    // 0.86-0.91 in two more that are plainly the same player doing the same job.
    else if (t.zBlk >= 0.85) key = "rim_protector";
    else if (t.zReb >= 1.0 || (t.zOreb >= 1.0 && t.zReb >= 0.4)) key = "glass_cleaner";
    else if (t.zPts >= 0.9 && t.twoAcc >= 0.45) key = "post_scorer";
    else if (t.zAst >= 1.0) key = "playmaking_big";
    else if (t.twoAcc >= 0.55 && t.sharePct < 0.40) key = "rim_runner";
    else key = "energy_big";
  } else if (guard) {
    // PASS-FIRST, not merely high-assist. Assists alone made floor generals of Shved, Mike James and
    // Larkin - high-usage scorers who also pass. What separates a distributor is that his passing
    // outweighs his OWN scoring. Measured across the archetype's undisputed names, the margin
    // (zAst - zPts) runs +0.63 to +2.28; the scoring guards run -0.02 to -2.37. The gap is clean,
    // so the bar sits in it.
    if (t.zAst >= 0.9 && t.zAst - t.zPts >= 0.5 && t.tovRatio <= 0.42) key = "floor_general";
    // Tested before the sniper: a primary scorer who happens to shoot a lot of threes is defined by
    // the scoring (Larkin, 57% of his shots from three, is still the man the offense runs through).
    else if (t.usage >= 0.34 && t.zPts >= 1.5) key = "volume_scorer";
    // A sniper is a SHOT DIET, not a quality grade - the accuracy floor only rules out a man who
    // cannot shoot at all. Vujacic at 46% of his shots from three is a specialist even in a cold year.
    // 0.33, not 0.34: the bar is a "can he shoot at all" floor, and a threshold sitting exactly on a
    // value the data produces is a knife-edge - Vujacic's 1.7-of-5.0 is 0.33999999999999997 in binary
    // floating point and failed a 0.34 test by 1e-17. Keep bars off round divisions.
    else if (t.sharePct >= 0.70 && t.volPct >= 0.75 && t.outsideAcc >= 0.36) key = "sniper";
    else if (t.zStl >= 1.1) key = "on_ball_pest";
    else if (t.ftRate >= 0.34 && t.zFd >= 0.5) key = "slashing_guard";
    else if (t.zPts >= 0.5) key = "combo_guard";
    else key = "role_guard";
  } else {
    // wings
    if (t.sharePct >= 0.65 && t.volPct >= 0.65 && t.outsideAcc >= 0.34 && t.zStl >= 0.5) key = "three_and_d";
    else if (t.sharePct >= 0.75 && t.volPct >= 0.75 && t.outsideAcc >= 0.35) key = "sharpshooter";
    // A shot diet this extreme IS the identity, cold year or not: Rudy Fernandez in 2021 took 85% of
    // his shots from three and shot 32%, which failed both accuracy bars above and left him labelled
    // a point forward. Volume + diet settle it; the accuracy floors stay for the merely three-happy.
    else if (t.sharePct >= 0.90 && t.volPct >= 0.80) key = "sharpshooter";
    else if (t.zAst >= 1.0 && t.zAst - t.zPts >= 0.3) key = "point_forward"; // same pass-first test as the guards
    else if (t.ftRate >= 0.32 && t.zFd >= 0.5 && t.outsideShare < 0.34) key = "slasher";
    else if (t.zPts >= 0.9) key = "scoring_wing";
    else key = "glue_wing";
  }
  return { key, ...ARCHETYPE[key], traits: t, caps: capsOf(t, p) };
}

/**
 * WHAT HE GIVES YOU, computed from the traits directly and deliberately NOT tied to which label won.
 * A "Volume scorer" taking six threes a game still spaces the floor; a "Post scorer" who blocks shots
 * still protects the rim. Tying capability to the headline label would resurrect the exact bug this
 * module was built to kill — the report telling a team to sign what it already has.
 */
export function capsOf(t, p) {
  const big = !!(p && p.interior), guard = !!(p && p.pos === "G");
  return {
    spacing: t.volPct >= 0.70 && t.outsideAcc >= 0.33, // enough threes, made often enough to respect
    // POSITION-GATED. Every z here is position-relative, so a guard who blocks 0.4 shots out-z's his
    // own position and used to come back with rim: true — Anthony Parker 2004 registered rim, glass
    // AND stopper. The Fix would then have told a team it already had rim protection, meaning a
    // 1.98m shooting guard. Rim protection is a big's job and team rebounding is not a guard's, so
    // those two caps are restricted to the players who can actually supply them.
    rim: big && t.zBlk >= 0.85,
    glass: !guard && (t.zReb >= 1.0 || t.zOreb >= 1.0),
    creator: t.zAst >= 0.9,
    // "Stopper" answers the ON-BALL hole, which is a perimeter job. Including a big's shot-blocking
    // here let the Fix tell a team whose GUARDS cannot contain the ball that its playmaking centre
    // was already guarding it alone. A big's rim work is the `rim` cap; this one is guards and wings.
    stopper: !big && t.zStl >= 1.1,
  };
}

/** Archetypes for a whole five (or six), in roster order. */
export function rosterArchetypes(players, data) {
  return players.filter(Boolean).map((p) => ({ player: p, arch: archetypeOf(p, data) }));
}

/**
 * Does this roster already contain a player with the given capability flag ("spacing", "rim",
 * "glass", "creator", "stopper")? This is what stops the Fix prescribing what the team already has.
 * `min` guards against a cameo counting: a man who played 7 games is not your floor spacing.
 */
export function rosterHas(players, flag, data, minConfidence = 0.6) {
  return rosterArchetypes(players, data)
    .some(({ arch }) => arch && arch.caps[flag] && arch.traits.confidence >= minConfidence);
}
