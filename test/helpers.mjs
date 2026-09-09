// Shared fixtures and drafters for the regression suite.
//
// Everything here is SEEDED. A test that fails only sometimes teaches nothing, and the whole point of
// this suite is that a number moving is a signal rather than noise — so every draft, every season and
// every bracket in the tests comes from a fixed seed and is reproducible on any machine.
import { readFileSync } from "node:fs";
import { projectRecord, mulberry32, CATEGORIES } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { buildCoachProfiles, eligibleCoaches, coachDeltas, archetypeLabel, pedigreeLabel } from "../web/src/coaches.js";
import { arenaFor, arenaKey } from "../web/src/arenas.js";

export const data = JSON.parse(readFileSync(new URL("../data/players.json", import.meta.url), "utf-8"));
export const pools = buildClubSeasons(data);
buildCoachProfiles(data);
export { CATEGORIES };

export const SLOT = ["G", "G", "F", "F", "C"];
export const stamp = (p, pool) => ({
  ...p,
  _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel },
});
export const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(q * (s.length - 1))];
};

/**
 * Build a full six + coach + arena the way the live game does.
 * `mode` picks the drafter:
 *   "skilled" — takes the pick that maximises S (what a good player converges on)
 *   "casual"  — chases points (what a first-timer does)
 *   "spread"  — one player from each of five DIFFERENT club-seasons, which is what Classic actually
 *               produces; intact club rosters are structurally far tidier than real drafts and hide
 *               whole classes of bug (three natural point guards, two stretch bigs, no rim protection).
 */
export function build(rng, mode = "skilled") {
  const slots = [null, null, null, null, null];
  const used = new Set();
  const open = (pos) => SLOT.findIndex((p, i) => p === pos && !slots[i]);

  if (mode === "spread") {
    for (let i = 0; i < 5; i++) {
      let got = null;
      for (let t = 0; t < 50 && !got; t++) {
        const pool = pools[Math.floor(rng() * pools.length)];
        const fit = pool.players.slice(0, 8).filter((p) => p.pos === SLOT[i] && !used.has(p.playerCode));
        if (fit.length) got = stamp(fit[Math.floor(rng() * fit.length)], pool);
      }
      if (!got) return null;
      slots[i] = got;
      used.add(got.playerCode);
    }
  } else {
    let picks = 0, guard = 0;
    while (picks < 5 && guard++ < 120) {
      const pool = spin(pools, rng);
      const here = slots.filter(Boolean);
      let best = null, bk = -Infinity;
      for (const c of pool.players) {
        if (used.has(c.playerCode) || open(c.pos) < 0) continue;
        const k = mode === "casual"
          ? c.cat.scoring + c.cat.efficiency * 0.3
          : projectRecord([...here, c], data.seasons).S;
        if (k > bk) { bk = k; best = { c, i: open(c.pos), pool }; }
      }
      if (!best) continue;
      slots[best.i] = stamp(best.c, best.pool);
      used.add(best.c.playerCode);
      picks++;
    }
  }

  const five = slots.filter(Boolean);
  if (five.length !== 5) return null;

  let sixth = null;
  for (let t = 0; t < 20 && !sixth; t++) {
    const pool = spin(pools, rng);
    const c = pool.players.find((x) => !used.has(x.playerCode));
    if (c) sixth = stamp(c, pool);
  }

  const elig = eligibleCoaches([...five, sixth].filter(Boolean), data) || [];
  let coach = elig[0] || null;
  if (mode === "skilled" && elig.length) {
    let bs = -Infinity;
    for (const e of elig) {
      const r = projectRecord(five, data.seasons, undefined, 1, coachDeltas(e), sixth);
      if (r.S > bs) { bs = r.S; coach = e; }
    }
  }

  // home arena: the best building among the five, share-scaled exactly as app.js arenaInfoFor does
  let mult = 1, arena = null;
  for (const s of five) {
    const base = arenaFor(s._src.teamCode, s.season);
    const key = arenaKey(s._src.teamCode, s.season);
    const share = five.filter((x) => arenaKey(x._src.teamCode, x.season) === key).length / 5;
    const m = 1 + (base.mult - 1) * share;
    if (m > mult || !arena) { if (m >= mult) { mult = m; arena = base; } }
  }
  return { five, sixth, coach, arena, mult };
}

/** The projection for a build, with every Phase-2 layer applied. */
export const seasonOf = (b, captain = null) =>
  projectRecord(b.five, data.seasons, undefined, b.mult, b.coach ? coachDeltas(b.coach) : null, b.sixth, captain);

/** N reproducible builds. */
export function builds(n, mode = "skilled", seed = 20260909) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const b = build(rng, mode);
    if (b) out.push(b);
  }
  return out;
}

/** The opts object teamReport expects, built from a `build()` result. */
export function reportOpts(b, extra = {}) {
  return {
    sixth: b.sixth,
    coachLabel: b.coach ? archetypeLabel(b.coach.coach) : null,
    coachName: b.coach ? b.coach.coach.name : null,
    coachPedigree: b.coach ? pedigreeLabel(b.coach.coach) : null,
    arena: b.arena ? { name: b.arena.name, rating: b.arena.rating } : null,
    ...extra,
  };
}
