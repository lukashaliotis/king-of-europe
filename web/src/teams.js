// Favorite-club list for player profiles. Codes are the app's stable EuroLeague team codes (same
// ones used everywhere else); the crest-free generated badge (see badge()/clubStyle) renders the
// mark, so this only needs code + display name. Curated to the recognizable EuroLeague clubs — not
// the full long tail — so the picker stays scannable. teamName(code) falls back gracefully.

export const TEAMS = [
  { code: "PAN", name: "Panathinaikos" },
  { code: "OLY", name: "Olympiacos" },
  { code: "MAD", name: "Real Madrid" },
  { code: "BAR", name: "Barcelona" },
  { code: "ULK", name: "Fenerbahçe" },
  { code: "IST", name: "Anadolu Efes" },
  { code: "TEL", name: "Maccabi Tel Aviv" },
  { code: "CSK", name: "CSKA Moscow" },
  { code: "ZAL", name: "Žalgiris" },
  { code: "MIL", name: "Olimpia Milano" },
  { code: "PAR", name: "Partizan" },
  { code: "RED", name: "Crvena Zvezda" },
  { code: "BAS", name: "Baskonia" },
  { code: "MCO", name: "AS Monaco" },
  { code: "VIR", name: "Virtus Bologna" },
  { code: "MUN", name: "Bayern Munich" },
  { code: "ASV", name: "LDLC ASVEL" },
  { code: "BER", name: "ALBA Berlin" },
  { code: "MAL", name: "Unicaja Málaga" },
  { code: "PAM", name: "Valencia Basket" },
  { code: "LJU", name: "Cedevita Olimpija" },
  { code: "AEK", name: "AEK Athens" },
  { code: "ARI", name: "Aris Thessaloniki" },
  { code: "PER", name: "Peristéri" },
  { code: "GAL", name: "Galatasaray" },
  { code: "BES", name: "Beşiktaş" },
  { code: "CAN", name: "Gran Canaria" },
  { code: "JOV", name: "Joventut Badalona" },
  { code: "PRS", name: "Paris Basketball" },
  { code: "BUD", name: "Budućnost" },
  { code: "CIB", name: "Cibona" },
  { code: "DYR", name: "Zenit St Petersburg" },
  { code: "KHI", name: "Khimki" },
  { code: "NAP", name: "Napoli" },
  { code: "DUB", name: "Dubai Basketball" },
  { code: "HTA", name: "Hapoel Tel Aviv" },
  { code: "SIE", name: "Virtus Siena" },
  { code: "SAS", name: "Dinamo Sassari" },
];

const BY_CODE = Object.fromEntries(TEAMS.map((t) => [t.code, t]));

/** Look up a team by code; returns { code, name } or null. */
export const teamByCode = (code) => (code && BY_CODE[code]) || null;

/** Display name for a team code, or "" if unknown/unset. */
export const teamName = (code) => (teamByCode(code) ? BY_CODE[code].name : "");
