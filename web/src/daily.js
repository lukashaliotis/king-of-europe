// Daily Challenge — a deterministic board seeded by the UTC date, so every player worldwide
// faces the SAME six club-year draws on a given day and results are directly comparable
// (Wordle-style). No re-spins: the board is the challenge. Shared, reproducible, shareable.
import { spin } from "./data.js";
import { CATEGORIES, CAT_TYPICAL, projectRecord, playerStrength, DEFAULT_PARAMS } from "./engine.js";

// Small, fast, seedable PRNG (same generator the Node tuning harness uses).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash -> 32-bit unsigned seed.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The UTC calendar day ("2026-07-21") — identical for everyone at a given instant, and it
// rolls over at midnight UTC.
export function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function dailySeed(dayKey = utcDayKey()) {
  return hashSeed("KOE-" + dayKey);
}

// ISO-8601 week key ("2026-W32"), UTC — the identifier for the weekly Dynasty gauntlet. Everyone
// worldwide shares one key (and thus one seeded challenge) until it rolls over Monday 00:00 UTC.
export function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (date.getUTCDay() + 6) % 7;            // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dow + 3);      // move to this week's Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return date.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

// One draw of the day's board: `size` distinct (club, season) offers, deterministic from the seed.
// At most one Legends slot; no duplicate club-years.
function drawBoard(pools, legends, legendsChance, seed, size) {
  const rng = mulberry32(seed);
  const board = [];
  const used = new Set();
  let hadLegend = false;
  let guard = 0;
  while (board.length < size && guard++ < 500) {
    if (!hadLegend && rng() < legendsChance) {
      board.push(legends);
      hadLegend = true;
      continue;
    }
    const pool = spin(pools, rng);
    if (used.has(pool.id)) continue; // keep the six club-years distinct
    used.add(pool.id);
    board.push(pool);
  }
  return board;
}

// Order the fixed board so the SCARCE required position — in practice the CENTRE, since nearly every
// club-season fields guards and forwards but not all field a centre — is left to the END. A centreless
// draw scheduled last forces you to spend an earlier pick on the centre (and silently locks the other
// cards you might have wanted), because the soft-lock guard can see the centre would otherwise be
// unfillable. Deferring the centre-capable draws to the tail means the centre can always wait, so that
// forced early pick rarely arises. Order-only: it can't change the board's winnability (the optimal
// five is order-independent) and it's a stable partition, so the board stays deterministic for the
// shared daily + the server resolver. Legend draws sort by whether they themselves field the position.
export function arrangeBoard(board, roles = ROLES) {
  if (!board || board.length < 2) return board;
  const canProvide = (pool, pos) => (pool.players || []).some((p) => p.pos === pos);
  const scarce = [...new Set(roles)]
    .map((pos) => ({ pos, n: board.filter((pl) => canProvide(pl, pos)).length }))
    .filter((x) => x.n > 0 && x.n < board.length) // a position some (not all, not none) of the draws supply
    .sort((a, b) => a.n - b.n)[0];                 // the scarcest such position
  if (!scarce) return board;                       // nothing to defer → leave as drawn
  const cannot = board.filter((pl) => !canProvide(pl, scarce.pos)); // e.g. centreless draws → first
  const can = board.filter((pl) => canProvide(pl, scarce.pos));     // centre-capable draws → last
  return [...cannot, ...can];
}

// DAILY WINNABILITY FLOOR. Everyone worldwide faces the same board, so a weak draw would mean a day
// nobody can go deep. We require the board's OPTIMAL five (best legal 2G/2F/1C achievable across the
// six draws) to project to at least a playoff-capable strength — so "with the right moves" always
// yields a real postseason run, while finding those moves stays hard. Bare five only (no coach/arena/
// 6th, which add several wins of headroom → a title stays reachable), so the guarantee is conservative.
// Was 31 (final-capable): that forced so much re-seeding it over-selected the strongest pools; 28 keeps
// the board winnable while letting the strongest real teams appear at their natural rate. See the
// LEGENDS-BLIND note on optimalFiveStrength for the other half of the same fix.
const FLOOR_WINS = 28; // default: playoff-capable optimum (24+ = straight to the playoffs)
const ROLES = ["G", "G", "F", "F", "C"]; // default legal five (rule-breaker themes pass their own)
// Invert the win-curve logistic: the S a five must project to for `wins` wins — the winnability bar.
const floorSFor = (wins) => {
  const p = DEFAULT_PARAMS;
  const pGame = wins / 38;
  return p.leagueS + Math.log(pGame / (1 - pGame)) / p.gameSteep;
};

// Strength of the strongest legal five buildable from the board (one player per draw, five as
// starters). Proxy-rank candidate fives by summed player strength, then score the top few through
// the real engine (gate/collision) and return the best true S.
//
// LEGENDS-BLIND: the winnability floor is computed over the REAL club-season draws only (Legends
// excluded). A Legends slot is the rare golden bonus, not the thing that makes a board winnable —
// counting it let the re-seed loop keep "clearing" the floor via legend boards, which inflated how
// often the all-time greats appeared on a daily board (~20% → ~57%). Requiring the best real five to
// clear the bar keeps the guarantee honest and returns Legends to their natural rarity.
function optimalFiveStrength(board, seasons, roles = ROLES) {
  const stCache = new Map();
  const strengthOf = (pl) => {
    if (!stCache.has(pl)) stCache.set(pl, playerStrength(pl, seasons));
    return stCache.get(pl);
  };
  const real = board.filter((pool) => !pool.legend); // Legends can't be why a board is "winnable"
  if (real.length < 5) return -Infinity;             // need a legal five from real draws alone
  // best player of each position within each real draw
  const bestByPos = real.map((pool) => {
    const b = { G: null, F: null, C: null };
    for (const pl of pool.players) {
      if (!b[pl.pos] || strengthOf(pl) > strengthOf(b[pl.pos])) b[pl.pos] = pl;
    }
    return b;
  });
  const candidates = []; // { five, sum }
  // Assign the 5 ROLES to 5 distinct real draws (perm itself leaves the extra draw(s) unused, so it
  // enumerates every legal five across the real board — no separate bench loop needed).
  const allIdx = real.map((_, i) => i);
  const perm = (chosen, remainingRoles, remainingIdx) => {
    if (!remainingRoles.length) {
      let sum = 0;
      for (const [pi, role] of chosen) sum += strengthOf(bestByPos[pi][role]);
      candidates.push({ five: chosen.map(([pi, role]) => bestByPos[pi][role]), sum });
      return;
    }
    const role = remainingRoles[0];
    for (let j = 0; j < remainingIdx.length; j++) {
      const pi = remainingIdx[j];
      if (!bestByPos[pi][role]) continue; // this draw can't field that position
      perm([...chosen, [pi, role]], remainingRoles.slice(1),
           remainingIdx.filter((_, k) => k !== j));
    }
  };
  perm([], roles, allIdx);
  if (!candidates.length) return -Infinity;
  candidates.sort((a, b) => b.sum - a.sum);
  let bestS = -Infinity;
  for (const c of candidates.slice(0, 4)) { // re-score the top few through the real engine
    const S = projectRecord(c.five, seasons).S;
    if (S > bestS) bestS = S;
  }
  return bestS;
}

// The best legal five on a board (the "ceiling") — returns the actual PLAYERS (court order, stamped
// with _src for rendering) + the projected record. Unlike the winnability floor, this INCLUDES legend
// draws (a golden legend is a legit pick), and it projects EVERY distinct legal five through the real
// engine and keeps the one with the most wins (not a strength-sum shortcut) — so the "optimal" is
// never worse than a well-balanced human pick. Returns null if no legal all-distinct five exists
// (e.g. a full Legends board of six identical draws).
// Enumerate every DISTINCT legal five from the board's best-by-position players, project each
// (five-only), and return up to `topK` ranked by wins (tie-break the smooth score S). Each result
// stamps _src on its players. Callers that want the true optimal TEAM take the top few fives and
// layer on the best 6th / coach / arena themselves (that lives in app.js, which has that data).
export function optimalFiveCandidates(board, seasons, roles = ROLES, topK = 1) {
  const stCache = new Map();
  const strengthOf = (pl) => { if (!stCache.has(pl)) stCache.set(pl, playerStrength(pl, seasons)); return stCache.get(pl); };
  if (board.length < 5) return [];
  const bestByPos = board.map((pool) => {
    const b = { G: null, F: null, C: null };
    for (const pl of pool.players) if (!b[pl.pos] || strengthOf(pl) > strengthOf(b[pl.pos])) b[pl.pos] = pl;
    return b;
  });
  const picksList = [];
  const allIdx = board.map((_, i) => i);
  const perm = (chosen, remRoles, remIdx) => {
    if (!remRoles.length) { picksList.push(chosen.slice()); return; }
    const role = remRoles[0];
    for (let j = 0; j < remIdx.length; j++) {
      const pi = remIdx[j];
      if (!bestByPos[pi][role]) continue;
      perm([...chosen, [pi, role]], remRoles.slice(1), remIdx.filter((_, k) => k !== j));
    }
  };
  perm([], roles, allIdx);
  const seen = new Set();
  const scored = [];
  for (const picks of picksList) {
    const five = picks.map(([pi, role]) => bestByPos[pi][role]);
    const codes = five.map((p) => p.playerCode);
    if (new Set(codes).size !== codes.length) continue;              // no player twice
    const key = codes.slice().sort().join("|");
    if (seen.has(key)) continue; seen.add(key);
    const rec = projectRecord(five, seasons);
    scored.push({ picks, wins: rec.wins, losses: rec.losses, S: rec.S });
  }
  scored.sort((a, b) => b.wins - a.wins || b.S - a.S);
  return scored.slice(0, topK).map(({ picks, wins, losses }) => ({
    five: picks.map(([pi, role]) => {
      const pl = bestByPos[pi][role], pool = board[pi];
      return { ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } };
    }),
    wins, losses,
  }));
}

export function optimalFive(board, seasons, roles = ROLES) {
  const c = optimalFiveCandidates(board, seasons, roles, 1);
  return c.length ? c[0] : null;
}

// Pre-draw the day's board. When `seasons` is supplied (Daily), enforce the winnability floor by
// deterministically re-seeding until the optimal five clears it; without it (Versus), draw once.
// The re-seed sequence is a pure function of the base seed, so the browser and the server resolver
// land on the identical board.
export function buildDailyBoard(pools, legends, legendsChance, seed, size = 6, seasons = null, roles = ROLES, floorWins = FLOOR_WINS) {
  if (!seasons) return arrangeBoard(drawBoard(pools, legends, legendsChance, seed, size), roles);
  const floorS = floorSFor(floorWins);
  const MAX_ATTEMPTS = 40;
  let best = null, bestS = -Infinity;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const s = (seed + attempt * 0x9e3779b1) >>> 0; // golden-ratio stride, deterministic
    const board = drawBoard(pools, legends, legendsChance, s, size);
    const optS = optimalFiveStrength(board, seasons, roles); // order-independent — safe to reorder after
    if (optS >= floorS) return arrangeBoard(board, roles);              // clears the floor
    if (optS > bestS) { bestS = optS; best = board; } // keep the strongest fallback
  }
  return arrangeBoard(best, roles); // nothing cleared the floor in MAX_ATTEMPTS → strongest board seen
}

// A stable signature of the drafted five, so the arena spin is reproducible for a given roster.
export function rosterSignature(players) {
  return players.map((p) => p.playerCode).sort().join("|");
}

/* ---------------- share + persistence ---------------- */

// STAGE_ICON stays as emoji on purpose: it's used only in the copied SHARE TEXT (plain text, where an
// SVG can't go). The 🟩/🟨/🟥 category grid was retired, so its helper is gone.
export const STAGE_ICON = { champion: "🏆", lostfinal: "🥈", finalfour: "🎯" };

// The weakest CATEGORY relative to its typical level (same gate the engine uses), title-cased.
export function weakestLink(categoryScores) {
  let worst = CATEGORIES[0], wv = Infinity;
  for (const k of CATEGORIES) {
    const rel = categoryScores[k] - CAT_TYPICAL[k];
    if (rel < wv) { wv = rel; worst = k; }
  }
  return worst.charAt(0).toUpperCase() + worst.slice(1);
}

// The share string: record, stage, and — unless you won it all — the weakest link named in words
// (the old colour grid read as gibberish without a legend; the PNG card carries the full detail).
export function shareText({ dayKey, wins, losses, label, stage, categoryScores, streak }) {
  const pretty = new Date(dayKey + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const icon = STAGE_ICON[stage] ? " " + STAGE_ICON[stage] : "";
  return `👑 King of Europe - Daily\n${pretty} · ${wins}–${losses} · ${label}${icon}` +
    (streak > 1 ? `\n🔥 ${streak}-day streak` : "") +
    `\nhttps://king-of-europe.pages.dev`;
}

const KEY = (dayKey) => "koe-daily-" + dayKey;
const STREAK_KEY = "koe-daily-streak";

export function loadDaily(dayKey = utcDayKey()) {
  try { return JSON.parse(localStorage.getItem(KEY(dayKey)) || "null"); } catch (e) { return null; }
}
export function currentStreak() {
  try {
    const s = JSON.parse(localStorage.getItem(STREAK_KEY) || "null");
    return s ? s.streak : 0;
  } catch (e) { return 0; }
}

// The last `days` daily results (most-recent first) for the history strip. Missing days are null.
export function dailyHistory(days = 7, endDayKey = utcDayKey()) {
  const out = [];
  const end = new Date(endDayKey + "T00:00:00Z").getTime();
  for (let i = 0; i < days; i++) {
    const dk = new Date(end - i * 86400000).toISOString().slice(0, 10);
    out.push({ dayKey: dk, result: loadDaily(dk) });
  }
  return out;
}

// Save today's result and return the running streak. Re-finishing the same day doesn't
// re-increment; finishing the day after yesterday extends the streak.
export function saveDaily(result, dayKey = utcDayKey()) {
  try {
    localStorage.setItem(KEY(dayKey), JSON.stringify(result));
    const prev = JSON.parse(localStorage.getItem(STREAK_KEY) || "null");
    const yesterday = new Date(new Date(dayKey + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    let streak = 1;
    if (prev && prev.date === dayKey) streak = prev.streak;      // already counted today
    else if (prev && prev.date === yesterday) streak = prev.streak + 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ date: dayKey, streak }));
    return streak;
  } catch (e) { return 1; }
}
