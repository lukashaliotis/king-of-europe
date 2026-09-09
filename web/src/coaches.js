// Coaches — Phase 2, wrinkle 2 of 3.
//
// SPEC rules this obeys:
//  - A flat rating is rejected (dead mechanic). The coach MODIFIES CATEGORY SCORES, i.e. he
//    patches the gate. Because the ceiling is min(category), a defensive coach raising your
//    defensive floor is enormous if defence is your hole and worthless if it isn't. That makes
//    him a SITUATIONAL pick, not a "best available" one.
//  - "Never hand-tag." Both the tenures AND the profiles are derived, not typed by hand.
//
// WHERE THE DATA COMES FROM: the club roster endpoint (typeName === "Coach"), baked into
// data/players.json by the pipeline. 216 real coaches over 544 club-seasons — 100% of real
// club-seasons, including mid-season replacements. (An earlier version of this file was ~26
// coaches typed from memory at 30% coverage; it was wrong and is gone.)
//
// HOW A PROFILE IS DERIVED: for each coach, take every qualified player-season he fielded and
// average their position-relative z per category. That raw level is NOT usable directly — a
// coach at Real Madrid grades positive in everything simply because he had good players, which
// would make elite-club coaches a universal buff (the free-bonus trap again). So we CENTRE it:
// subtract his own overall mean, leaving only his TILT — what he over-indexes on relative to
// his own teams' level. That tilt is the archetype. Small samples shrink toward no tilt.
import { CATEGORIES, categoryZ } from "./engine.js";

const SAMPLE_K = 40;   // reliability shrinkage on a coach's player-season sample
const TILT_SCALE = 9;  // derived tilt (z units) -> category-score deltas at full roster share

// Archetype deltas at FULL roster share (all five coached by him).
export const ARCHETYPES = {
  defensive: { label: "Defensive", deltas: { defense: 4.0, efficiency: 1.5, scoring: -1.5 } },
  offensive: { label: "Up-tempo", deltas: { scoring: 4.0, playmaking: 2.0, efficiency: -1.5 } },
  balanced: { label: "Balanced", deltas: { scoring: 1.2, rebounding: 1.2, playmaking: 1.2, defense: 1.2, efficiency: 1.2 } },
  playmaker: { label: "Motion", deltas: { playmaking: 4.0, efficiency: 1.0, defense: -1.0 } },
  physical: { label: "Physical", deltas: { rebounding: 4.0, defense: 1.5, playmaking: -1.0 } },
};

// HAND-RATED archetypes for the ~40 most-tenured coaches (~69% of spinnable club-seasons).
// This is subjective — but deriving profiles from box scores demonstrably failed (it graded
// Obradović "Efficient" and Kurtinaitis "Defensive", both backwards), because team defence
// lives in opponent points allowed, which a player box score does not contain. Everyone below
// the top 40 keeps their derived tilt: obscure enough that nobody holds an expectation.
// Keyed by the API's person code. Veto freely.
const HAND_ARCHETYPES = {
  WBC: "defensive",  // Obradović, Željko
  WAW: "physical",   // Ivanović, Duško — brutal-conditioning, board-crashing grinder
  WAG: "defensive",  // Ivković, Dušan
  CAG: "defensive",  // Itoudis, Dimitris
  "001869": "defensive", // Bartzokas, Georgios
  KBM: "defensive",  // Sfairopoulos, Ioannis
  WCT: "physical",   // Pešić, Svetislav — old-school structured FIBA physicality
  CYP: "defensive",  // Trinchieri, Andrea — data-confirmed grinder (tempo −0.75, reb −0.87)
  AEZ: "defensive",  // Radonjić, Dejan
  WBS: "defensive",  // Maljković, Božidar
  APU: "defensive",  // Zdovc, Jure
  WAV: "balanced",   // Scariolo, Sergio
  WAF: "balanced",   // Messina, Ettore
  KOW: "balanced",   // Pascual, Xavi
  LAF: "balanced",   // Perasović, Velimir
  WAI: "balanced",   // Spahija, Neven
  WBU: "balanced",   // Mahmuti, Oktay
  CZR: "balanced",   // Plaza, Joan
  LMQ: "balanced",   // Banchi, Luca
  WAE: "balanced",   // Pedoulakis, Argyris
  WAK: "balanced",   // Bucchi, Piero
  CAY: "balanced",   // Filipovski, Sašo
  WBR: "balanced",   // Herbert, Gordon
  WAJ: "balanced",   // Zouros, Ilias
  BYO: "balanced",   // Anzulović, Dražen
  DHB: "balanced",   // Bagatskis, Ainars
  CTB: "balanced",   // Collet, Vincent
  BAS: "balanced",   // Pačėsas, Tomas
  WCL: "offensive",  // Ataman, Ergin
  BSS: "offensive",  // Laso, Pablo
  ADG: "playmaker",  // Jasikevičius, Šarūnas — pass-heavy Barça/Žalgiris identity (ast-rate +0.43)
  WBB: "offensive",  // Blatt, David
  CAA: "offensive",  // Gershon, Pini
  "000733": "offensive", // Kurtinaitis, Rimas
  CEV: "offensive",  // Pianigiani, Simone
  TFT: "offensive",  // Kattash, Oded
  WCD: "offensive",  // Repeša, Jasmin
  WAT: "playmaker",  // García Reneses, Aíto
  WBH: "playmaker",  // Vujošević, Duško
  WBA: "playmaker",  // Tanjević, Bogdan
  CWX: "playmaker",  // Martínez, Pedro
  AEY: "physical",   // Obradović, Saša
};

// PEDIGREE — how strongly a coach imposes his identity. This scales his WHOLE tilt vector,
// downsides included: a legend is more decisive AND more dangerous, never a flat free bonus.
// (A flat bonus would make the most famous eligible name an auto-pick and kill the situational
// design — the same trap the arena fell into.) Hand-set from titles/reputation. VETO FREELY.
const PEDIGREE_LEGEND = 1.35;
const PEDIGREE_ELITE = 1.22;
const PEDIGREE_STRONG = 1.12;
const PEDIGREE = {
  WBC: PEDIGREE_LEGEND, // Obradović, Željko — far and away the most decorated
  WAF: PEDIGREE_ELITE,  // Messina, Ettore
  WAG: PEDIGREE_LEGEND, // Ivković, Dušan — a genuine legend of European coaching
  WBS: PEDIGREE_ELITE,  // Maljković, Božidar
  WCL: PEDIGREE_ELITE,  // Ataman, Ergin
  WCT: PEDIGREE_ELITE,  // Pešić, Svetislav
  BSS: PEDIGREE_ELITE,  // Laso, Pablo
  CAG: PEDIGREE_ELITE,  // Itoudis, Dimitris
  "001869": PEDIGREE_ELITE, // Bartzokas, Georgios
  CAA: PEDIGREE_ELITE,  // Gershon, Pini
  WBB: PEDIGREE_STRONG, // Blatt, David
  KOW: PEDIGREE_STRONG, // Pascual, Xavi
  ADG: PEDIGREE_STRONG, // Jasikevičius, Šarūnas
  WAW: PEDIGREE_STRONG, // Ivanović, Duško
  KBM: PEDIGREE_STRONG, // Sfairopoulos, Ioannis
  CYP: PEDIGREE_STRONG, // Trinchieri, Andrea
  // Final Four floor — every head coach who reached a real EuroLeague Final Four is lifted to at
  // least Proven. Derived by cross-referencing the official FF history (2001-2026) against each
  // club-season's most-tenured coach in our data (the head-coach proxy); see the FF audit.
  JUV: PEDIGREE_STRONG, // Giannakis, Panagiotis — Olympiacos, EuroLeague-winning coach + a legend as a player
  WAT: PEDIGREE_STRONG, // García Reneses, Aíto — 2003 EuroLeague champion (Barcelona)
  WCD: PEDIGREE_STRONG, // Repeša, Jasmin — 2004 Final Four / final (Fortitudo Bologna)
  BVH: PEDIGREE_STRONG, // Kazlauskas, Jonas — 1999 EuroLeague champion (Žalgiris)
  CEV: PEDIGREE_STRONG, // Pianigiani, Simone — 2008 & 2011 Final Four (Montepaschi Siena)
  WAV: PEDIGREE_STRONG, // Scariolo, Sergio — 2007 Final Four (Unicaja Málaga)
  LAF: PEDIGREE_STRONG, // Perasović, Velimir — 2016 Final Four (Baskonia)
  WBH: PEDIGREE_STRONG, // Vujošević, Duško — 2010 Final Four (Partizan)
  WAI: PEDIGREE_STRONG, // Spahija, Neven — 2008 Final Four (Baskonia / Tau Cerámica)
  AEY: PEDIGREE_STRONG, // Obradović, Saša — 2023 Final Four (Monaco)
  TFT: PEDIGREE_STRONG, // Kattash, Oded — 2008 Final Four (Maccabi Tel Aviv)
  BCR: PEDIGREE_STRONG, // Pashutin, Evgeny — 2010 Final Four (CSKA Moscow)
  DAS: PEDIGREE_STRONG, // Mateo, Chus — 2023 EuroLeague champion + 2024 Final Four (Real Madrid)
  CWX: PEDIGREE_STRONG, // Martínez, Pedro — 2025 Final Four (Valencia)
  JZO: PEDIGREE_STRONG, // Boniciolli, Matteo — 2002 Final Four (Fortitudo Bologna)
  WAB: PEDIGREE_STRONG, // Recalcati, Carlo — 2004 Final Four (Montepaschi Siena)
};

// Everyone else earns pedigree from TENURE — seasons on a EuroLeague bench is the one proxy for
// "defined identity" our data actually contains. Asymptotes to ~1.15; a one-season stint ~0.88.
function pedigreeFor(profile) {
  if (PEDIGREE[profile.code]) return PEDIGREE[profile.code];
  const t = profile.seasons.size;
  return 0.85 + 0.30 * (t / (t + 8));
}

/** Display tier for the coach card, or null for an ordinary bench. */
export function pedigreeLabel(profile) {
  const v = profile.pedigree || 1;
  if (v >= PEDIGREE_LEGEND) return "Legendary";
  if (v >= PEDIGREE_ELITE) return "Elite";
  if (v >= PEDIGREE_STRONG) return "Proven";
  return null;
}

// Salary mode: a coach is a cheap hire, priced by pedigree — a journeyman is nearly free and always
// available, and it climbs fast so a Legendary coach is a small splurge you save a little for. Kept
// deliberately low: the captain is free (impact-only), so the coach is Salary's only budget line
// beyond the players, and it's meant to be a light flavour choice, not a tax. Recalibrate in
// sim/salary_sim.mjs if difficulty needs it.
const COACH_PRICE = { Legendary: 15, Elite: 10, Proven: 5 };
export const COACH_FLOOR_PRICE = 2; // a journeyman (untagged) coach — always affordable, also the draft reserve
export function coachCost(profile) {
  return COACH_PRICE[pedigreeLabel(profile)] || COACH_FLOOR_PRICE;
}

let PROFILES = null; // code -> { name, seasons:Set, tilt:{cat:number}, n, top, pedigree }

/** Build every coach's derived profile once. */
export function buildCoachProfiles(data) {
  if (PROFILES) return PROFILES;
  const byClubSeason = new Map(); // "CLUB|YEAR" -> [qualified players]
  for (const p of data.players) {
    if (!p.q) continue; // cameos would just add noise to a coach's profile
    const key = `${p.teamCode}|${p.season}`;
    if (!byClubSeason.has(key)) byClubSeason.set(key, []);
    byClubSeason.get(key).push(p);
  }

  PROFILES = new Map();
  for (const [code, entry] of Object.entries(data.coaches || {})) {
    const seasons = new Set(entry.seasons.map(([c, y]) => `${c}|${y}`));
    const squad = [];
    for (const key of seasons) squad.push(...(byClubSeason.get(key) || []));

    const tilt = {};
    for (const k of CATEGORIES) tilt[k] = 0;
    if (squad.length) {
      const mean = {};
      for (const k of CATEGORIES) mean[k] = 0;
      for (const p of squad) {
        const z = categoryZ(p, data.seasons);
        for (const k of CATEGORIES) mean[k] += z[k];
      }
      for (const k of CATEGORIES) mean[k] /= squad.length;
      // centre -> tilt (removes "he coached good players" from "he coaches defence")
      const overall = CATEGORIES.reduce((a, k) => a + mean[k], 0) / CATEGORIES.length;
      const rel = squad.length / (squad.length + SAMPLE_K); // shrink small samples
      for (const k of CATEGORIES) tilt[k] = (mean[k] - overall) * rel;
    }
    const top = [...CATEGORIES].sort((a, b) => tilt[b] - tilt[a])[0];
    const archetype = HAND_ARCHETYPES[code] || null; // hand-rated wins over the derived tilt
    const profile = { code, name: entry.name, seasons, tilt, n: squad.length, top, archetype };
    profile.pedigree = pedigreeFor(profile);
    PROFILES.set(code, profile);
  }
  return PROFILES;
}

/** Hand-rated archetype where we have one, otherwise the label his own teams' tilt implies. */
export function coachLabel(profile) {
  if (profile.archetype) return ARCHETYPES[profile.archetype].label;
  const strength = Math.max(...CATEGORIES.map((k) => Math.abs(profile.tilt[k])));
  if (strength < 0.04) return "Balanced";
  // Use the SAME vocabulary as the hand-rated archetypes (ARCHETYPES labels) so a derived coach
  // never shows an off-palette tag like "Scoring" or "Rebounding".
  const LABELS = {
    scoring: "Up-tempo", rebounding: "Physical", playmaking: "Motion",
    defense: "Defensive", efficiency: "System",
  };
  return LABELS[profile.top];
}

/** Coaches who actually managed at least one of your five, with how many they had. */
export function eligibleCoaches(five, data) {
  const profiles = buildCoachProfiles(data);
  const out = [];
  for (const profile of profiles.values()) {
    const players = five.filter((p) => p && profile.seasons.has(`${p._src.teamCode}|${p.season}`));
    if (players.length) out.push({ coach: profile, count: players.length, players });
  }
  return out.sort((a, b) => b.count - a.count || a.coach.name.localeCompare(b.coach.name));
}

/**
 * Category deltas, SCALED BY ROSTER SHARE — he can only coach the players he actually had.
 * Same fix the arena needed: with five clubs, "best of your five" is otherwise a free bonus.
 * It also makes the SPEC's brag ("Obradović coached 3 of your 5") mechanically real. Share is over
 * the FULL SIX-man roster (five starters + the sixth man), so callers pass all six.
 */
export function coachDeltas(entry) {
  const share = entry.count / 6;
  const ped = entry.coach.pedigree || 1; // scales the whole vector, negatives included
  const out = {};
  const a = entry.coach.archetype;
  if (a) {
    const base = ARCHETYPES[a].deltas;
    for (const k of CATEGORIES) out[k] = (base[k] || 0) * share * ped;
  } else {
    for (const k of CATEGORIES) out[k] = entry.coach.tilt[k] * TILT_SCALE * share * ped;
  }
  return out;
}

export const archetypeLabel = (profile) => coachLabel(profile);
