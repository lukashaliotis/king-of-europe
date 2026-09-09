// Versus — head-to-head. Two players draft from the SAME seeded board (fair, like Daily), then
// one team is sent to the other as a compact challenge code. The receiver's device reconstructs
// the challenger's five and sims a best-of-seven locally. No backend: the code carries the seed
// (so both boards match) and the challenger's roster (so the duel can be resolved offline).
import { projectRecord, playerStrength, gameProbability } from "./engine.js";
import { arenaFor, arenaKey } from "./arenas.js";
import { eligibleCoaches, coachDeltas } from "./coaches.js";
import { mulberry32, hashSeed } from "./daily.js";

const PREFIX = "KOE2-";

/* ---------------- serialize / encode ---------------- */

// The challenge is SHORT because both players share the same seeded six-draw board (rebuilt from the
// seed on the other side). So we don't store full player rows — just, per draw, the CODE of the
// player picked from it; season and club are implied by the draw. Plus the seed (base36), which draw
// is the bench, which draw's club hosts the arena, and the coach's short code. All ASCII, readable,
// and about a quarter the length of the old base64 envelope. Fields split on ".", codes on ",".
export function encodeChallenge({ seed, board, slots, sixth, arenaSlotIdx, coachCode }) {
  const all = [...slots, sixth].filter(Boolean);
  const used = new Set();
  // for each draw (in order), the code of the drafted player that came from it
  const codes = board.map((draw) => {
    const p = all.find((x) => !used.has(x.playerCode) && draw.players.some((pl) => pl.playerCode === x.playerCode));
    if (p) used.add(p.playerCode);
    return p ? p.playerCode : "";
  });
  const benchIdx = sixth ? codes.indexOf(sixth.playerCode) : -1;
  const arenaIdx = (arenaSlotIdx != null && slots[arenaSlotIdx]) ? codes.indexOf(slots[arenaSlotIdx].playerCode) : -1;
  return PREFIX + [seed.toString(36), codes.join(","), benchIdx, arenaIdx, coachCode || ""].join(".");
}

export function decodeChallenge(code) {
  const raw = String(code || "").trim();
  if (!raw.startsWith(PREFIX)) throw new Error("That doesn't look like a King of Europe challenge code.");
  const parts = raw.slice(PREFIX.length).split(".");
  if (parts.length < 5) throw new Error("This challenge code is corrupted.");
  const [seed36, codesStr, benchIdx, arenaIdx, coachCode] = parts;
  const codes = codesStr.split(",");
  const seed = parseInt(seed36, 36);
  if (!Number.isFinite(seed) || codes.length !== 6) throw new Error("This challenge code is not valid.");
  return { seed: seed >>> 0, codes, benchIdx: Number(benchIdx), arenaIdx: Number(arenaIdx), coachCode: coachCode || "" };
}

/* ---------------- reconstruct the opponent ---------------- */

function prettySurname(name) {
  const s = name.split(",")[0].trim().toLowerCase();
  return s.replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase());
}

function withSrc(rec, data) {
  return { ...rec, _src: { teamCode: rec.teamCode, teamName: rec.teamName, seasonLabel: data.seasons[String(rec.season)].label } };
}

// Turn a decoded envelope into a playable opponent, using the SAME six-draw `board` (rebuilt from the
// seed) both players share: each stored code is looked up in its draw. Returns the reconstructed
// five/bench, the arena multiplier and coach deltas they chose, a display label, and the projected
// result. Throws if a code can't be found in this build's board (different game data).
export function reconstructTeam(env, data, board) {
  const players = env.codes.map((code, i) => {
    const draw = board[i];
    const rec = draw && draw.players.find((pl) => pl.playerCode === code);
    if (!rec) throw new Error("This challenge was built from different game data.");
    return withSrc(rec, data);
  });
  const bench = env.benchIdx >= 0 ? players[env.benchIdx] : null;
  const starters = players.filter((_, i) => i !== env.benchIdx);
  if (starters.length !== 5) throw new Error("This challenge code is not valid.");

  // arena multiplier — same roster-share scaling the live game uses
  let arenaMult = 1, arenaName = null;
  if (env.arenaIdx >= 0 && players[env.arenaIdx]) {
    const host = players[env.arenaIdx];
    const base = arenaFor(host._src.teamCode, host.season);
    // Share-scaled by BUILDING (same club + arena-era), matching the live game's arenaInfoFor.
    const hostKey = arenaKey(host._src.teamCode, host.season);
    const share = starters.filter((s) => arenaKey(s._src.teamCode, s.season) === hostKey).length / 5;
    arenaMult = 1 + (base.mult - 1) * share;
    arenaName = base.name;
  }

  // coach deltas — find the coach (by code) among those who managed the six
  let deltas = null, coachName = null;
  if (env.coachCode) {
    const entry = eligibleCoaches([...starters, bench].filter(Boolean), data).find((e) => e.coach.code === env.coachCode);
    if (entry) { deltas = coachDeltas(entry); coachName = entry.coach.name; }
  }

  const result = projectRecord(starters, data.seasons, undefined, arenaMult, deltas, bench);
  const anchor = [...starters].sort((a, b) => playerStrength(b, data.seasons) - playerStrength(a, data.seasons))[0];
  const label = `${prettySurname(anchor.playerName)}'s Five`;

  return { starters, bench, arenaMult, arenaName, coachDeltas: deltas, coachName, label, result };
}

/* ---------------- the duel ---------------- */

const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) * 1.15; // ~N(0,1)
const MARGIN_SD = 9.0;

// A duel seed that's identical on both devices: symmetric over the two rosters' player codes.
export function duelSeed(codesA, codesB) {
  const key = [...codesA, ...codesB].sort().join("|");
  return hashSeed("KOE-DUEL-" + key);
}

// Best-of-seven decided by each team's effective strength S (same S the season sim uses). The
// margin decides each game, so the score and the winner can never disagree. Deterministic given
// the seed, so both players see the same series.
export function duel(sA, sB, seed) {
  const rng = mulberry32(seed);
  const p = gameProbability(sA, sB); // the SAME per-game probability the season runs on
  let a = 0, b = 0;
  const games = [];
  while (a < 4 && b < 4) {
    const aWin = rng() < p;
    const margin = 1 + Math.round(Math.abs(gauss(rng)) * MARGIN_SD * 0.7);
    const base = 72 + Math.round(rng() * 14);
    games.push({ a: aWin ? base + margin : base, b: aWin ? base : base + margin, aWin });
    aWin ? a++ : b++;
  }
  return { aWins: a, bWins: b, aIsWinner: a > b, games };
}
