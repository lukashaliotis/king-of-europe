// Daily Challenge — a deterministic board seeded by the UTC date, so every player worldwide
// faces the SAME six club-year draws on a given day and results are directly comparable
// (Wordle-style). No re-spins: the board is the challenge. Shared, reproducible, shareable.
import { spin } from "./data.js";
import { CATEGORIES } from "./engine.js";

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

// Pre-draw the day's board: `size` distinct (club, season) offers, deterministic from the seed.
// At most one Legends slot; no duplicate club-years.
export function buildDailyBoard(pools, legends, legendsChance, seed, size = 6) {
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

// The spoiler-light share string: record, stage, and a five-square category grid (the red
// square is your weakest link — the gate).
export function shareText({ dayKey, wins, losses, label, stage, categoryScores, streak }) {
  const grid = CATEGORIES.map((k) => catEmoji(categoryScores[k])).join("");
  const pretty = new Date(dayKey + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const icon = STAGE_ICON[stage] ? " " + STAGE_ICON[stage] : "";
  return `👑 King of Europe — Daily\n${pretty} · ${wins}–${losses} · ${label}${icon}\n${grid}` +
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
