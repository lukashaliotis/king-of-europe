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

// DAILY WINNABILITY FLOOR. Everyone worldwide faces the same board, so a weak draw would mean a day
// nobody can go deep. We require the board's OPTIMAL five (best legal 2G/2F/1C achievable across the
// six draws) to project to at least a Final-capable strength — so "with the right moves" always
// yields a real title run, while finding those moves stays hard. Bare five only (no coach/arena/6th,
// which only add headroom), so the guarantee is a conservative floor.
const FLOOR_WINS = 31; // Final-capable optimum
const FLOOR_S = (() => {
  const p = DEFAULT_PARAMS;
  const pGame = FLOOR_WINS / 38;              // needed per-game win rate
  return p.leagueS + Math.log(pGame / (1 - pGame)) / p.gameSteep; // invert the win-curve logistic
})();
const ROLES = ["G", "G", "F", "F", "C"];

// Strength of the strongest legal five buildable from the board (one player per draw, five as
// starters). Proxy-rank candidate fives by summed player strength, then score the top few through
// the real engine (gate/collision) and return the best true S.
function optimalFiveStrength(board, seasons) {
  const stCache = new Map();
  const strengthOf = (pl) => {
    if (!stCache.has(pl)) stCache.set(pl, playerStrength(pl, seasons));
    return stCache.get(pl);
  };
  // best player of each position within each draw
  const bestByPos = board.map((pool) => {
    const b = { G: null, F: null, C: null };
    for (const pl of pool.players) {
      if (!b[pl.pos] || strengthOf(pl) > strengthOf(b[pl.pos])) b[pl.pos] = pl;
    }
    return b;
  });
  const n = board.length;
  const candidates = []; // { five, sum }
  // pick which draw sits on the bench, assign the other five to ROLES (permutations)
  for (let bench = 0; bench < n; bench++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (i !== bench) idx.push(i);
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
    perm([], ROLES, idx);
  }
  if (!candidates.length) return -Infinity;
  candidates.sort((a, b) => b.sum - a.sum);
  let bestS = -Infinity;
  for (const c of candidates.slice(0, 4)) { // re-score the top few through the real engine
    const S = projectRecord(c.five, seasons).S;
    if (S > bestS) bestS = S;
  }
  return bestS;
}

// Pre-draw the day's board. When `seasons` is supplied (Daily), enforce the winnability floor by
// deterministically re-seeding until the optimal five clears it; without it (Versus), draw once.
// The re-seed sequence is a pure function of the base seed, so the browser and the server resolver
// land on the identical board.
export function buildDailyBoard(pools, legends, legendsChance, seed, size = 6, seasons = null) {
  if (!seasons) return drawBoard(pools, legends, legendsChance, seed, size);
  const MAX_ATTEMPTS = 40;
  let best = null, bestS = -Infinity;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const s = (seed + attempt * 0x9e3779b1) >>> 0; // golden-ratio stride, deterministic
    const board = drawBoard(pools, legends, legendsChance, s, size);
    const optS = optimalFiveStrength(board, seasons);
    if (optS >= FLOOR_S) return board;             // clears the floor
    if (optS > bestS) { bestS = optS; best = board; } // keep the strongest fallback
  }
  return best; // nothing cleared the floor in MAX_ATTEMPTS → strongest board seen
}

// A stable signature of the drafted five, so the arena spin is reproducible for a given roster.
export function rosterSignature(players) {
  return players.map((p) => p.playerCode).sort().join("|");
}

/* ---------------- share + persistence ---------------- */

export function catEmoji(score) {
  if (score >= 4) return "🟩";
  if (score >= 1.5) return "🟨";
  return "🟥";
}
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
  const weak = stage === "champion" ? "" : `\nWeak link: ${weakestLink(categoryScores)}`;
  return `👑 King of Europe — Daily\n${pretty} · ${wins}–${losses} · ${label}${icon}${weak}` +
    (streak > 1 ? `\n🔥 ${streak}-day streak` : "") +
    `\n🔗 king-of-europe.pages.dev`;
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
