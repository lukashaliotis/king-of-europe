// Home arenas — Phase 2, wrinkle 1 of 3.
//
// (FLAME_PATH is shared with the icon set so the arena meter and the streak flame are one glyph.)
// SPEC rules this obeys:
//  - Arena must NOT add to strength. It multiplies the win-curve OUTPUT only (~±3-5%).
//    Because the top of the curve is a cliff, a few percent near perfection is decisive and
//    mid-table it's noise. "The roster gets you to 36-2; OAKA gets you to 38-0."
//  - Capacity is the trap. Pionir (~8k) is more feared than Belgrade Arena (~20k). These are
//    hand-rated on atmosphere/intimidation, NOT on seats.
//  - No per-season ratings. Atmosphere doesn't change year to year; what changes is clubs
//    moving buildings. Modelled as (club, building, year_range).
//
// Ratings are 1-10 and unashamedly subjective. Veto freely.
import { FLAME_PATH, isClassicLook } from "./icons.js";

const NEUTRAL = 6.5;   // rating that yields no effect
const SPREAD = 3.5;    // ratings this far from NEUTRAL hit the cap
const MAX_SWING = 0.045; // ±4.5% on the win-curve output

// teamCode -> [{ name, from, to, rating, cap }]  (from/to are season start years, inclusive)
// `rating` is ATMOSPHERE (drives the win multiplier + the cauldron steepness), `cap` is the
// approximate basketball CAPACITY in thousands (drives only the drawn SIZE of the building).
// So Pionir is small but steep-and-loud, a modern bowl is big but shallow. Both hand-set.
export const ARENAS = {
  PAN: [{ name: "OAKA", from: 2001, to: 2025, rating: 9.5, cap: 18.5 }],
  OLY: [{ name: "Peace & Friendship Stadium", from: 2001, to: 2025, rating: 9.5, cap: 12.5 }],
  PAR: [{ name: "Aleksandar Nikolić Hall (Pionir)", from: 2001, to: 2018, rating: 9.5, cap: 8 },
        { name: "Belgrade Arena", from: 2019, to: 2025, rating: 9.5, cap: 19 }],
  RED: [{ name: "Aleksandar Nikolić Hall (Pionir)", from: 2001, to: 2014, rating: 9.5, cap: 8 },
        { name: "Belgrade Arena", from: 2015, to: 2025, rating: 9.3, cap: 19 }],
  ZAL: [{ name: "Kaunas Sports Hall", from: 2001, to: 2010, rating: 8, cap: 4.5 },
        { name: "Žalgirio Arena", from: 2011, to: 2025, rating: 9, cap: 15.4 }],
  TEL: [{ name: "Menora Mivtachim (Yad Eliyahu)", from: 2001, to: 2025, rating: 9, cap: 11.7 }],
  ULK: [{ name: "Abdi İpekçi Arena", from: 2001, to: 2012, rating: 7.5, cap: 12.3 },
        { name: "Ülker Sports Arena", from: 2013, to: 2025, rating: 9, cap: 13.8 }],
  BAS: [{ name: "Fernando Buesa Arena", from: 2001, to: 2025, rating: 8.5, cap: 15.5 }],
  VIR: [{ name: "PalaDozza", from: 2001, to: 2008, rating: 8.5, cap: 5.7 },
        { name: "Segafredo Arena", from: 2019, to: 2025, rating: 8, cap: 10 }],
  FOR: [{ name: "PalaDozza", from: 2001, to: 2008, rating: 8.5, cap: 5.7 }],
  BUD: [{ name: "Morača Sports Center", from: 2001, to: 2025, rating: 8.5, cap: 6 }],
  IST: [{ name: "Abdi İpekçi Arena", from: 2001, to: 2016, rating: 8, cap: 12.3 },
        { name: "Sinan Erdem Dome", from: 2017, to: 2025, rating: 8, cap: 16 }],
  PAM: [{ name: "Fuente de San Luis", from: 2001, to: 2024, rating: 8, cap: 9 },
        { name: "Roig Arena", from: 2025, to: 2025, rating: 7.5, cap: 15.6 }],
  SIE: [{ name: "PalaEstra", from: 2001, to: 2014, rating: 8, cap: 7 }],
  MAD: [{ name: "WiZink Center", from: 2001, to: 2025, rating: 8, cap: 15.5 }],
  MAL: [{ name: "Martín Carpena", from: 2001, to: 2025, rating: 8, cap: 11.3 }],
  ARI: [{ name: "Nick Galis Hall", from: 2001, to: 2025, rating: 8, cap: 5.2 }],
  ZAD: [{ name: "Krešimir Ćosić Hall", from: 2001, to: 2025, rating: 8, cap: 9 }],
  KSK: [{ name: "Karşıyaka Arena", from: 2001, to: 2025, rating: 8, cap: 6 }],
  HTA: [{ name: "Shlomo Group Arena", from: 2001, to: 2025, rating: 8, cap: 5 }],
  GAL: [{ name: "Abdi İpekçi Arena", from: 2001, to: 2016, rating: 8, cap: 12.3 }],
  BES: [{ name: "BJK Akatlar Arena", from: 2001, to: 2025, rating: 8, cap: 3.2 }],
  BAM: [{ name: "Brose Arena", from: 2001, to: 2017, rating: 7.5, cap: 6.8 }],
  CIB: [{ name: "Dražen Petrović Hall", from: 2001, to: 2016, rating: 7.5, cap: 5.4 }],
  BAR: [{ name: "Palau Blaugrana", from: 2001, to: 2025, rating: 8, cap: 7.5 }],
  MUN: [{ name: "Audi Dome", from: 2010, to: 2024, rating: 7, cap: 6.7 },
        { name: "SAP Garden", from: 2025, to: 2025, rating: 7.5, cap: 11.5 }],
  STR: [{ name: "Rhénus Sport", from: 2001, to: 2025, rating: 7.5, cap: 6.2 }],
  PES: [{ name: "Adriatic Arena", from: 2001, to: 2025, rating: 7.5, cap: 10 }],
  JOV: [{ name: "Palau Olímpic de Badalona", from: 2001, to: 2025, rating: 7.5, cap: 12.5 }],
  CTU: [{ name: "PalaDesio", from: 2001, to: 2025, rating: 7.5, cap: 5 }],
  LMG: [{ name: "Palais des Sports de Beaublanc", from: 2001, to: 2025, rating: 7.5, cap: 5.6 }],
  SAS: [{ name: "PalaSerradimigni", from: 2001, to: 2025, rating: 7.5, cap: 5 }],
  AVE: [{ name: "PalaDelMauro", from: 2001, to: 2025, rating: 7.5, cap: 5 }],
  CHO: [{ name: "Salle de la Meilleraie", from: 2001, to: 2025, rating: 7.5, cap: 5 }],
  KLA: [{ name: "Švyturio Arena", from: 2001, to: 2025, rating: 7.5, cap: 6.3 }],
  BIL: [{ name: "Bilbao Arena (Miribilla)", from: 2001, to: 2025, rating: 7.5, cap: 10 }],
  ASV: [{ name: "Astroballe", from: 2001, to: 2023, rating: 7, cap: 5.6 },
        { name: "LDLC Arena", from: 2024, to: 2025, rating: 7, cap: 12.5 }],
  AEK: [{ name: "OAKA / Ano Liosia", from: 2001, to: 2025, rating: 7, cap: 9 }],
  LJU: [{ name: "Tivoli / Stožice", from: 2001, to: 2025, rating: 7, cap: 12 }],
  LIE: [{ name: "Rytas Arena", from: 2001, to: 2025, rating: 7, cap: 11 }],
  TRE: [{ name: "PalaVerde", from: 2001, to: 2012, rating: 7, cap: 5.3 }],
  PAU: [{ name: "Palais des Sports", from: 2001, to: 2010, rating: 7, cap: 7.7 }],
  MIL: [{ name: "Mediolanum Forum", from: 2001, to: 2025, rating: 7, cap: 12.7 }],
  DYR: [{ name: "Sibur Arena", from: 2001, to: 2025, rating: 7, cap: 7 }],
  CHA: [{ name: "Spiroudome", from: 2001, to: 2025, rating: 7, cap: 6 }],
  LEM: [{ name: "Antarès", from: 2001, to: 2025, rating: 7, cap: 5.6 }],
  CED: [{ name: "Dom Sportova", from: 2001, to: 2025, rating: 7, cap: 6 }],
  MES: [{ name: "Dvorana Leona Štuklja", from: 2001, to: 2025, rating: 7, cap: 3 }],
  NAN: [{ name: "Palais des Sports Jean Weille", from: 2001, to: 2025, rating: 7, cap: 6 }],
  GSS: [{ name: "Hala CRS Zielona Góra", from: 2001, to: 2025, rating: 7, cap: 5.5 }],
  PRS: [{ name: "Adidas Arena", from: 2024, to: 2025, rating: 7, cap: 8 }],
  PER: [{ name: "Peristéri Stadium", from: 2001, to: 2025, rating: 7, cap: 4 }],
  OOS: [{ name: "COREtec Dôme", from: 2001, to: 2025, rating: 7, cap: 5 }],
  EST: [{ name: "Palacio de Deportes de Madrid", from: 2001, to: 2025, rating: 7, cap: 10 }],
  NAP: [{ name: "PalaBarbuto", from: 2001, to: 2025, rating: 7, cap: 3.5 }],
  ROA: [{ name: "Halle André Vacheresse", from: 2001, to: 2025, rating: 7, cap: 4 }],
  NIO: [{ name: "Panionios Gym", from: 2001, to: 2025, rating: 7, cap: 3 }],
  OLD: [{ name: "EWE Arena", from: 2001, to: 2025, rating: 7, cap: 6 }],
  CHL: [{ name: "Le Colisée", from: 2001, to: 2025, rating: 7, cap: 5 }],
  NTR: [{ name: "Palais des Sports Maurice Thorez", from: 2001, to: 2025, rating: 7, cap: 3 }],
  CAN: [{ name: "Gran Canaria Arena", from: 2014, to: 2025, rating: 7, cap: 11 }],
  MCO: [{ name: "Salle Gaston Médecin", from: 2021, to: 2025, rating: 6.5, cap: 5 }],
  BER: [{ name: "Max-Schmeling / Mercedes-Benz Arena", from: 2001, to: 2025, rating: 7.0, cap: 14.5 }],
  ROM: [{ name: "PalaLottomatica", from: 2001, to: 2013, rating: 6.5, cap: 11.2 }],
  SOP: [{ name: "Gdynia Arena", from: 2001, to: 2025, rating: 6.5, cap: 5.5 }],
  CSK: [{ name: "USH CSKA", from: 2001, to: 2014, rating: 6.5, cap: 5 },
        { name: "Megasport Arena", from: 2015, to: 2022, rating: 6.5, cap: 14 }],
  UNK: [{ name: "Basket-Hall Kazan", from: 2001, to: 2025, rating: 6.5, cap: 7.5 }],
  DAR: [{ name: "Volkswagen Arena", from: 2001, to: 2025, rating: 6.5, cap: 5.2 }],
  TIV: [{ name: "Basket-Hall Krasnodar", from: 2001, to: 2025, rating: 6.5, cap: 7.5 }],
  WRO: [{ name: "Hala Orbita", from: 2001, to: 2025, rating: 6.5, cap: 3 }],
  FRA: [{ name: "Fraport Arena", from: 2001, to: 2025, rating: 6.5, cap: 5 }],
  PEM: [{ name: "Molot Sport Palace", from: 2001, to: 2025, rating: 6.5, cap: 7 }],
  COL: [{ name: "Kölnarena (Lanxess)", from: 2001, to: 2025, rating: 6.5, cap: 13 }],
  DYN: [{ name: "Dynamo Sports Palace", from: 2001, to: 2025, rating: 6.5, cap: 5 }],
  MAR: [{ name: "Maroussi Gym", from: 2001, to: 2025, rating: 6.5, cap: 3 }],
  ORL: [{ name: "Palais des Sports d Orléans", from: 2001, to: 2025, rating: 6.5, cap: 3.5 }],
  ZAG: [{ name: "Dom Sportova", from: 2001, to: 2025, rating: 6.5, cap: 6 }],
  NIK: [{ name: "Palats Sportu Kyiv", from: 2001, to: 2025, rating: 6.5, cap: 6 }],
  NOV: [{ name: "Nagorny Sports Palace", from: 2001, to: 2025, rating: 6.5, cap: 5.5 }],
  ZGO: [{ name: "Hala Turowa", from: 2001, to: 2025, rating: 6.5, cap: 2.8 }],
  DUB: [{ name: "Coca-Cola Arena", from: 2025, to: 2025, rating: 6.5, cap: 15.5 }],
  KHI: [{ name: "Mytishchi Arena", from: 2001, to: 2021, rating: 6, cap: 7 }],
  LON: [{ name: "London Arena", from: 2001, to: 2025, rating: 6, cap: 12 }],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function ratingToMult(rating) {
  return 1 + clamp((rating - NEUTRAL) / SPREAD, -1, 1) * MAX_SWING;
}

/** The building a club played in that season, or a neutral default. */
export function arenaFor(teamCode, season) {
  const list = ARENAS[teamCode];
  const hit = list && list.find((a) => season >= a.from && season <= a.to);
  if (!hit) return { name: "Neutral venue", rating: NEUTRAL, mult: 1, cap: 8, known: false };
  return { name: hit.name, rating: hit.rating, mult: ratingToMult(hit.rating), cap: hit.cap ?? 8, known: true };
}

// A stable key for a specific BUILDING. A club can use different buildings across eras (Žalgiris:
// Kaunas Sports Hall pre-2011 vs Žalgirio Arena after), so two same-club players from different
// arena-eras key DIFFERENTLY — each building is then its own home-arena candidate, and the home
// edge scales by how many of your five actually played in THAT building. Used isomorphically by the
// client spin AND the anti-cheat resolvers, so they can never disagree.
export const arenaKey = (teamCode, season) => `${teamCode}|${arenaFor(teamCode, season).name}`;

/** A 0-5 flame atmosphere METER (markup): `lit` flames for the rating, faint ones for the rest.
 *  The flame is a vector silhouette (NOT the 🔥 emoji) so it takes the brand colour and stays crisp. */
// The 1-5 band a rating falls in. The flame meter AND the Team Report's wording both read this, so
// they cannot drift apart — Palau Blaugrana (7.5) drew two flames while the report called it "a real
// edge", because the two had separate thresholds.
export function arenaTier(rating) {
  return rating > 9.15 ? 5 : rating > 8.75 ? 4 : rating > 7.75 ? 3 : rating > 6.75 ? 2 : 1;
}

export function arenaFlames(rating) {
  // Rating bands → 1–5 flames. Bands are placed on the rating clusters so the very top cauldrons
  // (9.3+: OAKA, Peace & Friendship, Pionir, Belgrade Arena) finally read 5/5, 9.0 stays 4, the 8s
  // are 3, the 7s are 2, and a dead 6.5 room is 1. Display only — the win multiplier still uses the
  // raw rating, so this changes no gameplay.
  const n = arenaTier(rating);
  if (isClassicLook()) return "▲".repeat(n); // Classic look: the original triangles
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += `<svg class="flame ${i < n ? "lit" : "dim"}" viewBox="0 0 24 24" aria-hidden="true"><path d="${FLAME_PATH}"/></svg>`;
  }
  return out;
}

/**
 * An ORIGINAL stylized arena illustration (no real photos/logos — on-spec): a SIDE-ON
 * cross-section of the bowl, seen from the end of the floor. TWO independent variables:
 *   - CAPACITY drives the SIZE — how far the stands extend outward and how many rows deep, so an
 *     18k bowl is visibly bigger than a 7k hall (OAKA vs Palau Blaugrana).
 *   - RATING drives the RAKE — a feared cauldron leans steep and close over the floor; a polite
 *     venue is shallow. So a small loud gym is steep-but-narrow, a big quiet dome wide-but-flat.
 */
export function arenaSVG(primary, secondary = "#ffffff", rating = 7, cap = 8) {
  const t = clamp((rating - 5.5) / 4, 0, 1);    // 0 neutral .. 1 cauldron (atmosphere)
  const c = clamp((cap - 4) / (19 - 4), 0, 1);   // 0 small .. 1 huge (capacity)
  const FLOOR = 88;          // the playing surface
  const COURT_L = 70, COURT_R = 130;
  const run = 22 + c * 34;   // horizontal DEPTH of each stand — capacity makes the building wider
  const rise = Math.min(58, run * (0.55 + t * 0.95)); // higher-rated cauldrons rake steeper
  const top = FLOOR - rise;
  const lx = COURT_L - run;
  const STEPS = 6 + Math.round(c * 3); // 6..9 tiers — bigger arenas seat more rows

  // A raked deck drawn as seating steps, from the outer wall down to the floor.
  const deck = (outerX, courtX) => {
    let d = `M ${outerX} ${top} `;
    for (let i = 0; i < STEPS; i++) {
      const x1 = outerX + (courtX - outerX) * ((i + 1) / STEPS);
      const y0 = top + (FLOOR - top) * (i / STEPS);
      const y1 = top + (FLOOR - top) * ((i + 1) / STEPS);
      d += `L ${x1.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} `;
    }
    return d + `L ${outerX} ${FLOOR} Z`;
  };

  // Crowd: flecks along each step, denser for hotter arenas. Symmetric on both decks.
  let crowd = "";
  const perStep = 1 + Math.round(t * 2);
  for (let i = 0; i < STEPS; i++) {
    const y = top + (FLOOR - top) * ((i + 0.5) / STEPS) - 1.5;
    for (let j = 0; j < perStep; j++) {
      const f = (i + (j + 0.5) / perStep) / STEPS;
      const xl = lx + (COURT_L - lx) * f;
      // drawn in the PRIMARY at high opacity, not the secondary: the stands are the same hue at
      // low opacity, so a solid dot always reads darker than its deck whatever the club colours
      // are (a white secondary was invisible on a pale deck).
      crowd += `<circle cx="${xl.toFixed(1)}" cy="${y.toFixed(1)}" r="1.15" fill="${primary}" fill-opacity="0.9"/>`;
      crowd += `<circle cx="${(200 - xl).toFixed(1)}" cy="${y.toFixed(1)}" r="1.15" fill="${primary}" fill-opacity="0.9"/>`;
    }
  }

  const hoop = (x, dir) =>
    `<line x1="${x}" y1="${FLOOR - 9}" x2="${x}" y2="${FLOOR}" stroke="#c9b48a" stroke-width="1.2"/>` +
    `<line x1="${x}" y1="${FLOOR - 7}" x2="${x + dir * 5}" y2="${FLOOR - 7}" stroke="#c9b48a" stroke-width="1.2"/>`;

  const op = (0.30 + t * 0.30).toFixed(2);
  // viewBox is cropped to the drawn band (y 8..96) so the building fills its box; shallow
  // arenas simply sit lower and smaller in frame, which is the point.
  return `<svg class="arena-art" viewBox="0 8 200 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    // roof, sprung between the two stands
    `<path d="M ${lx - 4} ${top - 3} Q 100 ${top - 16} ${200 - lx + 4} ${top - 3}" fill="none" ` +
      `stroke="${primary}" stroke-width="2.5" stroke-opacity="0.55" stroke-linecap="round"/>` +
    // the two raked decks
    `<path d="${deck(lx, COURT_L)}" fill="${primary}" fill-opacity="${op}"/>` +
    `<path d="${deck(200 - lx, COURT_R)}" fill="${primary}" fill-opacity="${op}"/>` +
    crowd +
    // the floor, seen end-on
    `<rect x="${COURT_L}" y="${FLOOR}" width="${COURT_R - COURT_L}" height="4" rx="1" fill="#f4ecd9" stroke="#d8c69a" stroke-width="1"/>` +
    `<line x1="100" y1="${FLOOR}" x2="100" y2="${FLOOR + 4}" stroke="#d8c69a" stroke-width="0.8"/>` +
    hoop(COURT_L + 4, 1) + hoop(COURT_R - 4, -1) +
    `<line x1="6" y1="${FLOOR + 4}" x2="194" y2="${FLOOR + 4}" stroke="${primary}" stroke-width="1.5" stroke-opacity="0.35"/>` +
    `</svg>`;
}
