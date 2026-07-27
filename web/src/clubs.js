// Club colours + generated badges. NO real crests/logos — the SPEC allows "original badges"
// only. Colours are facts; the badge is an original coloured roundel with the club's short code.

// teamCode -> { c1: primary, c2: secondary, ab: badge abbreviation }
const CLUBS = {
  BAR: { c1: "#004d98", c2: "#a50044", ab: "FCB" }, // Barcelona
  OLY: { c1: "#d32f2f", c2: "#ffffff", ab: "OLY" }, // Olympiacos
  PAN: { c1: "#0a7d34", c2: "#ffffff", ab: "PAO" }, // Panathinaikos
  TEL: { c1: "#f2c200", c2: "#0033a0", ab: "MTA" }, // Maccabi Tel Aviv
  MAD: { c1: "#0b3b8f", c2: "#ffffff", ab: "RMB" }, // Real Madrid
  ULK: { c1: "#14235a", c2: "#ffed00", ab: "FEN" }, // Fenerbahce
  ZAL: { c1: "#00623a", c2: "#ffffff", ab: "ZAL" }, // Zalgiris
  BAS: { c1: "#002d62", c2: "#ffffff", ab: "BAS" }, // Baskonia
  IST: { c1: "#001f5b", c2: "#e4002b", ab: "EFS" }, // Anadolu Efes
  CSK: { c1: "#c8102e", c2: "#003a70", ab: "CSK" }, // CSKA Moscow
  MIL: { c1: "#d0112b", c2: "#ffffff", ab: "MIL" }, // Olimpia Milano
  PAR: { c1: "#111418", c2: "#ffffff", ab: "PAR" }, // Partizan
  MAL: { c1: "#1f9b4c", c2: "#ffffff", ab: "UNI" }, // Unicaja Malaga
  RED: { c1: "#ce1126", c2: "#ffffff", ab: "CRV" }, // Crvena Zvezda
  BER: { c1: "#f2c200", c2: "#0b3d91", ab: "ALB" }, // ALBA Berlin
  ASV: { c1: "#1a7a3f", c2: "#ffffff", ab: "ASV" }, // ASVEL
  MUN: { c1: "#dc052d", c2: "#ffffff", ab: "BAY" }, // Bayern Munich
  LJU: { c1: "#00a651", c2: "#ff7f00", ab: "OLI" }, // Cedevita Olimpija
  SIE: { c1: "#111418", c2: "#ffffff", ab: "SIE" }, // Siena
  PAM: { c1: "#ff7f00", c2: "#111418", ab: "VAL" }, // Valencia (Pamesa)
  CIB: { c1: "#0033a0", c2: "#ffffff", ab: "CIB" }, // Cibona
  KHI: { c1: "#f2c200", c2: "#0b3d91", ab: "KHI" }, // Khimki
  VIR: { c1: "#111418", c2: "#ffffff", ab: "VIR" }, // Virtus Bologna
  MCO: { c1: "#da291c", c2: "#ffffff", ab: "MON" }, // Monaco
  AEK: { c1: "#f2c200", c2: "#111418", ab: "AEK" }, // AEK
  BAM: { c1: "#c8102e", c2: "#ffffff", ab: "BAM" }, // Bamberg
  MCT: { c1: "#e4002b", c2: "#ffffff", ab: "MCT" },
  LEG: { c1: "#c8a23a", c2: "#111418", ab: "LEG" }, // European Legends — gold

  // --- the long tail. Previously these fell back to a hash-generated colour, which is why
  // Gran Canaria showed navy instead of canary yellow. Colours are facts, so they're set here.
  CAN: { c1: "#f2c200", c2: "#0b3d91", ab: "GCA" }, // Gran Canaria — canary yellow
  SOP: { c1: "#f2c200", c2: "#0b3d91", ab: "ARK" }, // Arka Gdynia
  PAU: { c1: "#0a7d34", c2: "#ffffff", ab: "PAU" }, // Pau-Lacq-Orthez
  TRE: { c1: "#1a9e4b", c2: "#ffffff", ab: "TRV" }, // Benetton Treviso
  FOR: { c1: "#0b3d91", c2: "#ffffff", ab: "FOR" }, // Fortitudo Bologna
  ROM: { c1: "#f26722", c2: "#111418", ab: "ROM" }, // Virtus Roma
  LIE: { c1: "#d32f2f", c2: "#ffffff", ab: "RYT" }, // Rytas Vilnius
  GAL: { c1: "#f2c200", c2: "#d32f2f", ab: "GAL" }, // Galatasaray
  UNK: { c1: "#007a3d", c2: "#ffffff", ab: "UNI" }, // UNICS Kazan
  CHA: { c1: "#111418", c2: "#f2c200", ab: "CHA" }, // Spirou Charleroi
  WRO: { c1: "#0a7d34", c2: "#ffffff", ab: "SLA" }, // Śląsk Wrocław
  BUD: { c1: "#0033a0", c2: "#ffffff", ab: "BUD" }, // Budućnost
  STR: { c1: "#0b3d91", c2: "#ffffff", ab: "SIG" }, // Strasbourg
  LEM: { c1: "#d32f2f", c2: "#ffffff", ab: "LEM" }, // Le Mans
  CED: { c1: "#ff7f00", c2: "#0033a0", ab: "CED" }, // Cedevita Zagreb
  DAR: { c1: "#111418", c2: "#ffffff", ab: "DAR" }, // Darüşşafaka
  DYR: { c1: "#0b5fa5", c2: "#ffffff", ab: "ZEN" }, // Zenit St Petersburg
  FRA: { c1: "#d32f2f", c2: "#111418", ab: "FRA" }, // Skyliners Frankfurt
  MES: { c1: "#0033a0", c2: "#ffffff", ab: "KRK" }, // Krka Novo Mesto
  PES: { c1: "#d32f2f", c2: "#ffffff", ab: "PES" }, // Pesaro
  ARI: { c1: "#f2c200", c2: "#111418", ab: "ARI" }, // Aris Thessaloniki
  JOV: { c1: "#0a7d34", c2: "#111418", ab: "JOV" }, // Joventut Badalona
  NAN: { c1: "#d32f2f", c2: "#ffffff", ab: "NAN" }, // SLUC Nancy
  CTU: { c1: "#0b3d91", c2: "#ffffff", ab: "CAN" }, // Cantù
  GSS: { c1: "#4b5563", c2: "#ffffff", ab: "GSS" },
  TIV: { c1: "#007a3d", c2: "#d32f2f", ab: "LOK" }, // Lokomotiv Kuban
  LMG: { c1: "#0a7d34", c2: "#ffffff", ab: "LIM" }, // Limoges CSP
  SAS: { c1: "#0b3d91", c2: "#ffffff", ab: "SAS" }, // Dinamo Sassari
  PRS: { c1: "#111418", c2: "#ffffff", ab: "PAR" }, // Paris Basketball
  PER: { c1: "#f2c200", c2: "#111418", ab: "PER" }, // Peristeri
  LON: { c1: "#0033a0", c2: "#ffffff", ab: "LON" }, // London Towers
  OOS: { c1: "#d32f2f", c2: "#f2c200", ab: "OOS" }, // Oostende
  PEM: { c1: "#0b3d91", c2: "#ffffff", ab: "PER" }, // Ural Great Perm
  EST: { c1: "#0a7d34", c2: "#111418", ab: "EST" }, // Estudiantes
  COL: { c1: "#d32f2f", c2: "#ffffff", ab: "KOL" }, // RheinStars Köln
  DYN: { c1: "#0b5fa5", c2: "#ffffff", ab: "DYN" }, // Dynamo Moscow
  NAP: { c1: "#0b9ad6", c2: "#ffffff", ab: "NAP" }, // Napoli
  ROA: { c1: "#0a7d34", c2: "#ffffff", ab: "ROA" }, // Chorale Roanne
  NIO: { c1: "#0033a0", c2: "#d32f2f", ab: "PAN" }, // Panionios
  AVE: { c1: "#0a7d34", c2: "#ffffff", ab: "AVE" }, // Scandone Avellino
  OLD: { c1: "#0b3d91", c2: "#f2c200", ab: "OLD" }, // Baskets Oldenburg
  MAR: { c1: "#0033a0", c2: "#ffffff", ab: "MAR" }, // Maroussi
  ORL: { c1: "#d32f2f", c2: "#0b3d91", ab: "ORL" }, // Orléans
  CHO: { c1: "#d32f2f", c2: "#ffffff", ab: "CHO" }, // Cholet
  ZAG: { c1: "#0033a0", c2: "#ffffff", ab: "ZAG" }, // KK Zagreb
  BIL: { c1: "#111418", c2: "#d32f2f", ab: "BIL" }, // Bilbao Basket
  BES: { c1: "#111418", c2: "#ffffff", ab: "BES" }, // Beşiktaş
  CHL: { c1: "#d32f2f", c2: "#ffffff", ab: "CHL" }, // Élan Chalon
  NIK: { c1: "#0b3d91", c2: "#f2c200", ab: "BUD" }, // Budivelnyk
  NTR: { c1: "#0a7d34", c2: "#ffffff", ab: "NTR" }, // Nanterre 92
  NOV: { c1: "#0b5fa5", c2: "#ffffff", ab: "NIZ" }, // Nizhny Novgorod
  KLA: { c1: "#0b5fa5", c2: "#ffffff", ab: "NEP" }, // Neptūnas Klaipėda
  ZGO: { c1: "#0a7d34", c2: "#ffffff", ab: "TUR" }, // Turów Zgorzelec
  KSK: { c1: "#007a3d", c2: "#d32f2f", ab: "KAR" }, // Karşıyaka
  DUB: { c1: "#111418", c2: "#d4af37", ab: "DUB" }, // Dubai Basketball
  HTA: { c1: "#d32f2f", c2: "#ffffff", ab: "HAP" }, // Hapoel Tel Aviv
};

function hashHue(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

// Colours for any club — mapped clubs get real colours, others a stable generated hue.
export function clubStyle(teamCode) {
  const c = CLUBS[teamCode];
  if (c) return { primary: c1safe(c.c1), secondary: c.c2, abbr: c.ab };
  const hue = hashHue(teamCode || "?");
  return { primary: `hsl(${hue} 52% 40%)`, secondary: "#ffffff", abbr: (teamCode || "?").slice(0, 3) };
}
const c1safe = (x) => x;

// Player initials from "SURNAME, GIVEN" -> "GS" (given + surname). Falls back gracefully.
export function monogram(playerName) {
  const parts = playerName.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return (parts[1][0] + parts[0][0]).toUpperCase();
  const w = (parts[0] || "?").replace(/[^A-Za-zÀ-ÿ]/g, "");
  return (w.slice(0, 2) || "?").toUpperCase();
}
