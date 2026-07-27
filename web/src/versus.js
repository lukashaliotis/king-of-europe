// Versus — head-to-head. Two players draft from the SAME seeded board (fair, like Daily), then
// one team is sent to the other as a compact challenge code. The receiver's device reconstructs
// the challenger's five and sims a best-of-seven locally. No backend: the code carries the seed
// (so both boards match) and the challenger's roster (so the duel can be resolved offline).
import { projectRecord, playerStrength, gameProbability } from "./engine.js";
import { arenaFor } from "./arenas.js";
import { eligibleCoaches, coachDeltas } from "./coaches.js";
import { mulberry32, hashSeed } from "./daily.js";
import { legendsPool } from "./legends.js";

const PREFIX = "KOE-V1-";

// unicode-safe base64 (coach names carry accents: Obradović, Jasikevičius…)
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s) => decodeURIComponent(escape(atob(s)));

/* ---------------- serialize / encode ---------------- */

// Build the compact envelope from the finished game state. Players are stored as
// [playerCode, season, teamCode] triples and looked up again on the other side.
export function serializeTeam({ seed, slots, sixth, arena, coachName }) {
  const trip = (p) => [p.playerCode, p.season, p._src.teamCode];
  return {
    v: 1,
    seed,
    five: slots.map(trip),
    bench: sixth ? trip(sixth) : 0,
    arena: arena ? [arena.teamCode, arena.season] : 0, // [teamCode, season] whose building hosts
    coach: coachName || 0,
  };
}

export function encodeChallenge(envelope) {
  return PREFIX + b64(JSON.stringify(envelope));
}

export function decodeChallenge(code) {
  const raw = String(code || "").trim();
  if (!raw.startsWith(PREFIX)) throw new Error("That doesn't look like a King of Europe challenge code.");
  let env;
  try { env = JSON.parse(unb64(raw.slice(PREFIX.length))); }
  catch (e) { throw new Error("This challenge code is corrupted."); }
  if (!env || env.v !== 1 || !Array.isArray(env.five) || env.five.length !== 5) {
    throw new Error("This challenge code is not valid.");
  }
  return env;
}

/* ---------------- reconstruct the opponent ---------------- */

function prettySurname(name) {
  const s = name.split(",")[0].trim().toLowerCase();
  return s.replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase());
}

function findPlayer(data, [code, season, team]) {
  // European Legends live in their own pool, not the baked players list.
  if (team === "LEG") return legendsPool().players.find((p) => p.playerCode === code) || null;
  return data.players.find((p) => p.playerCode === code && p.season === season && p.teamCode === team) || null;
}
function withSrc(rec, data) {
  return { ...rec, _src: { teamCode: rec.teamCode, teamName: rec.teamName, seasonLabel: data.seasons[String(rec.season)].label } };
}

// Turn a decoded envelope into a playable opponent: the reconstructed five/bench, the arena
// multiplier and coach deltas they chose, a display label, and the projected result (for the
// duel's strength). Throws if any player can't be found in this build's data.
export function reconstructTeam(env, data) {
  const starters = env.five.map((t) => {
    const rec = findPlayer(data, t);
    if (!rec) throw new Error("This challenge was built from different game data.");
    return withSrc(rec, data);
  });
  const bench = env.bench ? (() => {
    const rec = findPlayer(data, env.bench);
    return rec ? withSrc(rec, data) : null;
  })() : null;

  // arena multiplier — same roster-share scaling the live game uses
  let arenaMult = 1, arenaName = null;
  if (env.arena) {
    const [team, season] = env.arena;
    const base = arenaFor(team, season);
    const share = starters.filter((s) => s._src.teamCode === team).length / 5;
    arenaMult = 1 + (base.mult - 1) * share;
    arenaName = base.name;
  }

  // coach deltas — find the named coach among those who managed this five
  let deltas = null, coachName = null;
  if (env.coach) {
    const entry = eligibleCoaches(starters, data).find((e) => e.coach.name === env.coach);
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
