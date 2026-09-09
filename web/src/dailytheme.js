// Themed Daily — each UTC day gets ONE theme, a pure function of the date, shared by everyone. A
// theme is just a POOL FILTER on the club-year draws; the winnability floor + fallback in
// buildDailyBoard handle a hard themed day. ISOMORPHIC: the client and the anti-cheat resolver both
// import this, so a themed board can never be forged (same date → same theme → same filtered pools).

import { hashSeed, dailySeed, buildDailyBoard } from "./daily.js";
import { legendsPool, LEGENDS_CHANCE } from "./legends.js";

// Club → country (ISO-2, matching countries.js). Only clubs we can attribute confidently; a club not
// here simply never shows up on a country day. Enough clubs per country for a 6-draw board.
export const CLUB_COUNTRY = {
  // Greece
  PAN: "GR", OLY: "GR", ARI: "GR", AEK: "GR", PER: "GR", MAR: "GR", NIO: "GR",
  // Spain
  MAD: "ES", BAR: "ES", BAS: "ES", MAL: "ES", PAM: "ES", CAN: "ES", JOV: "ES", EST: "ES", BIL: "ES",
  // Turkey
  ULK: "TR", IST: "TR", GAL: "TR", BES: "TR", DAR: "TR", KSK: "TR",
  // Italy
  MIL: "IT", VIR: "IT", SIE: "IT", NAP: "IT", SAS: "IT", PES: "IT", ROM: "IT", TRE: "IT", FOR: "IT", CTU: "IT", AVE: "IT",
  // France
  ASV: "FR", MCO: "FR", PRS: "FR", STR: "FR", NAN: "FR", LEM: "FR", CHO: "FR", ORL: "FR", ROA: "FR", NTR: "FR", LMG: "FR", CHL: "FR", PAU: "FR",
  // Germany
  BER: "DE", MUN: "DE", BAM: "DE", OLD: "DE", FRA: "DE", COL: "DE",
  // Russia
  CSK: "RU", KHI: "RU", DYR: "RU", UNK: "RU", TIV: "RU", DYN: "RU", NOV: "RU", PEM: "RU",
  // Serbia
  PAR: "RS", RED: "RS",
  // Lithuania
  ZAL: "LT", LIE: "LT", KLA: "LT",
  // Croatia
  CIB: "HR", CED: "HR", ZAG: "HR", ZAD: "HR",
  // Israel
  TEL: "IL", HTA: "IL",
};

// RULE-BREAKER rulesets. A theme may carry `ruleset` to change the lineup rules (not just the pool).
// `roles` is the legal starting five; `floorWins` is the winnability floor for that ruleset (guards
// top out lower than a 2G/2F/1C five, so the bar is lower). Threaded into the board floor (daily.js),
// the client slots (app.js) AND the anti-cheat validation (resolve.js) so they can never disagree.
// `soloPos` = a single-position lineup (all five + the bench must be that position); null = standard
// 2G/2F/1C. floorWins is the winnability bar (single-position fives top out lower, so a lower bar).
export const RULESETS = {
  standard: { roles: ["G", "G", "F", "F", "C"], floorWins: 28, soloPos: null },
  guards:   { roles: ["G", "G", "G", "G", "G"], floorWins: 20, soloPos: "G" },
  forwards: { roles: ["F", "F", "F", "F", "F"], floorWins: 18, soloPos: "F" },
  centers:  { roles: ["C", "C", "C", "C", "C"], floorWins: 15, soloPos: "C" },
};
export const rulesetOf = (theme) => RULESETS[(theme && theme.ruleset) || "standard"];

// The classic Daily — no filter.
export const THEME_OPEN = { id: "open", name: "Open Draw", emoji: "🌍", desc: "Any club, any era.", filter: null };

// RULE-BREAKER themes — rare special days that change the lineup rules themselves.
export const RARE_THEMES = [
  { id: "guards", name: "Guard Gauntlet", emoji: "⚡", ruleset: "guards", filter: null,
    desc: "Five guards, no bigs - cover every category with backcourt only." },
  { id: "forwards", name: "Forward Frenzy", emoji: "🔷", ruleset: "forwards", filter: null,
    desc: "Five forwards - plenty of scoring and boards, but who runs the offense?" },
  { id: "centers", name: "Center Clash", emoji: "🗼", ruleset: "centers", filter: null,
    desc: "Five centers - a wall inside, but spacing and playmaking are on you. Legendary hard." },
  // Legends Boss: the board is the 12 all-time greats (draft a 2G/2F/1C five of legends); they romp
  // the regular season, but the postseason opponents escalate to legend-tier (boss) — the title is
  // the real prize. `legends` swaps the board (app.js/resolve.js); `boss` scales the bracket.
  { id: "legends", name: "Legends Boss", emoji: "👑", legends: true, boss: 16, filter: null,
    desc: "Field the all-time greats - then survive a boss gauntlet of legend-tier teams for the title." },
];

// The Legends-Boss escalation for a theme (0 = normal bracket), and whether it's a Legends board day.
export const bossFor = (theme) => (theme && theme.boss) || 0;
export const isLegendsDay = (theme) => !!(theme && theme.legends);

// The category + specific name for a theme, for the "what kind of Daily is this?" chip.
// e.g. Regular · (none) | Era · The 2000s | Dynasty · Panathinaikos | Country · Greek | Rule Breaker · Guard Gauntlet
export function themeKind(theme) {
  const id = (theme && theme.id) || "open";
  if (id === "open") return { kind: "Regular", short: "", special: false };
  if (id.startsWith("era")) return { kind: "Era", short: theme.name, special: true };
  if (id.startsWith("dyn_")) return { kind: "Legacy", short: theme.name.replace(/ Legacy$/, ""), special: true };
  if (id.startsWith("cty_")) return { kind: "Country", short: theme.country || theme.name.replace(/ Clubs$/, ""), special: true };
  return { kind: "Rule Breaker", short: theme.name, special: true }; // guards / forwards / centers / legends
}

const decade = (id, name, from, to) => ({ id, name, emoji: "🕰️", desc: `Only club-years from the ${name}.`,
  filter: (p) => p.season >= from && p.season <= to });
const ERA_THEMES = [
  decade("era00s", "2000s", 2001, 2009),
  decade("era10s", "2010s", 2010, 2019),
  decade("era20s", "2020s", 2020, 2025),
];

// "Legacy" not "Dynasty" — Dynasty is already a game mode, so a Dynasty-named Daily read as confusing.
// (The id stays "dyn_" so seeds, saved results and the anti-cheat resolver keep matching.)
const dynasty = (code, name, emoji) => ({ id: "dyn_" + code, name: name + " Legacy", emoji,
  desc: `Only ${name}, across the years - build a team from its eras.`, filter: (p) => p.teamCode === code });
const DYNASTY_THEMES = [
  dynasty("PAN", "Panathinaikos", "🟢"), dynasty("OLY", "Olympiacos", "🔴"),
  dynasty("MAD", "Real Madrid", "⚪"), dynasty("BAR", "Barcelona", "🔵"),
  dynasty("CSK", "CSKA Moscow", "🔴"), dynasty("ULK", "Fenerbahçe", "🟡"),
  dynasty("TEL", "Maccabi Tel Aviv", "🟡"), dynasty("MIL", "Olimpia Milano", "🔴"),
  dynasty("PAR", "Partizan", "⚫"), dynasty("ZAL", "Žalgiris", "🟢"),
];

// `name` = the theme TITLE, an ADJECTIVE + "Clubs" so it's grammatical ("French Clubs", not the wrong
// "France Clubs"); `country` = the COUNTRY NAME, used for the chip ("Country · France", via themeKind)
// and the copy ("Only clubs from France."). So the demonym never leaks into the chip/description while
// the title still reads naturally. The id stays "cty_"+cc → seeds/saved results/resolver unaffected.
const country = (cc, name, adj, emoji) => ({ id: "cty_" + cc, name: adj + " Clubs", country: name, emoji,
  desc: `Only clubs from ${name}.`, filter: (p) => CLUB_COUNTRY[p.teamCode] === cc });
const COUNTRY_THEMES = [
  country("GR", "Greece", "Greek", "🇬🇷"), country("ES", "Spain", "Spanish", "🇪🇸"), country("TR", "Türkiye", "Turkish", "🇹🇷"),
  country("IT", "Italy", "Italian", "🇮🇹"), country("FR", "France", "French", "🇫🇷"), country("DE", "Germany", "German", "🇩🇪"),
  country("RU", "Russia", "Russian", "🇷🇺"), country("RS", "Serbia", "Serbian", "🇷🇸"), country("LT", "Lithuania", "Lithuanian", "🇱🇹"),
];

export const THEMES = [THEME_OPEN, ...ERA_THEMES, ...DYNASTY_THEMES, ...COUNTRY_THEMES, ...RARE_THEMES];
const BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const themeById = (id) => BY_ID[id] || THEME_OPEN;
const THEMED = [...ERA_THEMES, ...DYNASTY_THEMES, ...COUNTRY_THEMES];

// The day's theme, deterministic from the date. Roughly: ~7% a RARE rule-breaker (guards/forwards/
// centers/legends), ~43% the classic Open draw, ~50% a pool-filter theme. Same on every device + the
// server (both call this), so bumping these thresholds stays anti-cheat-safe.
export function dailyThemeFor(dayKey) {
  const h = hashSeed("KOE-THEME-" + dayKey) >>> 0;
  const roll = h % 1000;
  if (roll < 70) return RARE_THEMES[Math.floor(h / 1000) % RARE_THEMES.length];
  if (roll < 500) return THEME_OPEN;
  return THEMED[Math.floor(h / 1000) % THEMED.length];
}

// Apply a theme to the club-year pools. Falls back to the full pool if the filter leaves too few to
// draw a board (deterministic — client and server compute the same filtered length, so they agree).
export function themedPools(pools, theme) {
  if (!theme || !theme.filter) return pools;
  const filtered = pools.filter(theme.filter);
  return filtered.length >= 10 ? filtered : pools;
}

// THE single source for a day's board — called by BOTH the client (ensureDailyBoard) and the
// anti-cheat resolver (resolve.js dailyBoard), so they can never build different boards. Applies the
// theme's pool filter, ruleset floor (roles/floorWins), Legends purity, and the Legends-Boss board.
export function buildThemedDailyBoard(pools, dayKey, seasons) {
  const theme = dailyThemeFor(dayKey);
  if (isLegendsDay(theme)) return Array.from({ length: 6 }, () => legendsPool()); // the 12 legends, six draws
  const rs = rulesetOf(theme);
  const lc = (theme.filter || theme.ruleset) ? 0 : LEGENDS_CHANCE; // themed / rule-breaker days are pure
  return buildDailyBoard(themedPools(pools, theme), legendsPool(), lc, dailySeed(dayKey), 6, seasons, rs.roles, rs.floorWins);
}
