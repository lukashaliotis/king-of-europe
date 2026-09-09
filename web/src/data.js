// Data loading, club-season pools, and the weighted spin.
// The game loop: each spin yields ONE (club, single season); the player picks one player from
// its roster, then spins again for the next slot. Five spins build the five.
import { playerStrength, CATEGORIES } from "./engine.js";

const MIN_ROSTER = 5; // you pick ONE player per spin, so 5 gives a real choice (adds Zadar 2001)

// CAREER-MODAL POSITION. The roster API labels a player's position per club-season, and it
// disagrees with itself for tweeners: Othello Hunter is tagged F at Olympiacos but C at his six
// other clubs, so a season shows "only one center". We collapse each player to ONE position for
// the whole game: the position he played the most (weighted by games played, so a full season
// outvotes a cameo), ties broken toward his most-recent season. This is a display+eligibility fix
// AND it feeds the position-relative z-scoring, so a career center is finally judged against
// centers everywhere. Idempotent: the raw per-season tag is stashed in `posRaw` on first pass.
//
// !! This MUTATES the loaded data (pos) and deriveRoles() adds posRaw/bigness/interior/pos5.
// Those are LOAD-TIME artefacts — never write the mutated object back to data/players.json. That
// file must hold only what pipeline/build_dataset.py emits, or a re-bake silently changes its
// shape. `node pipeline/check_data.mjs` enforces this.
export function applyCareerPositions(data) {
  const votes = new Map(); // playerCode -> { pos: gpWeight }
  const recent = new Map(); // playerCode -> { season, pos } of latest row
  for (const pl of data.players) {
    if (pl.posRaw === undefined) pl.posRaw = pl.pos; // stash once, stay idempotent
    const raw = pl.posRaw;
    if (!votes.has(pl.playerCode)) votes.set(pl.playerCode, {});
    const v = votes.get(pl.playerCode);
    v[raw] = (v[raw] || 0) + Math.max(1, pl.gp || 0);
    const r = recent.get(pl.playerCode);
    if (!r || pl.season > r.season) recent.set(pl.playerCode, { season: pl.season, pos: raw });
  }
  const modal = new Map();
  for (const [code, v] of votes) {
    let best = null, bestW = -1;
    for (const pos of Object.keys(v)) {
      if (v[pos] > bestW) { bestW = v[pos]; best = pos; }
    }
    // tie-break: if the most-recent season's position is within the leaders, prefer it
    const tied = Object.keys(v).filter((pos) => v[pos] === bestW);
    if (tied.length > 1) best = tied.includes(recent.get(code).pos) ? recent.get(code).pos : best;
    modal.set(code, best);
  }
  for (const pl of data.players) pl.pos = modal.get(pl.playerCode);
  // Manual coarse-position corrections. A few players are logged by the EuroLeague API under the role
  // they filled in one club-spell, not who they are, with no other season to outvote it. Boris Diaw
  // (code AZM) came up at Pau tagged a GUARD, but he's a 2.03m point-forward / undersized big — a
  // FORWARD here (deriveRoles then sub-classifies SF/PF). Height alone can't decide this: real tall
  // guards (Papaloukas, Satoranský, Jarić) sit at the same 2.00-2.03m, so the fix stays surgical.
  // playerCode -> coarse position override. Edwin Jackson (000229) is a 1.91m SHOOTING GUARD, but
  // ASVEL logged him as a Forward in 4 of his 6 seasons (91 games to 40), so the games-weighted
  // vote made his career position F. Height is the tell in this direction: a 190cm "forward" is a
  // guard. (The reverse is NOT safe - real 2.00m+ guards exist, e.g. Papaloukas, Satoranský.)
  const POS_FIX = {
    AZM: "F",          // Diaw, Boris      - 2.03m point-forward logged as a guard at Pau
    // Guards the roster feed logged as Forwards. All nine confirmed against public profiles; each is
    // 1.90-1.93m, i.e. guard height. (Verifying matters: Kuric "looked" like a genuine 1.93m wing and
    // is in fact a shooting guard.) Four more short forwards - Robinson, Dobbins, Judith, Carter -
    // are deliberately NOT here: 7-10 games each and 3-5.5 rpg, so a real small forward is plausible.
    "000229": "G",     // Jackson, Edwin
    "005789": "G",     // Kuric, Kyle
    "013371": "G",     // Harrison, Shaquille
    "005458": "G",     // Garcia, Sergi
    "005553": "G",     // Lomazs, Rihards
    BGV: "G",          // Vialtsev, Egor
    "012740": "G",     // Robertson, Kassius
    "011936": "G",     // Mathews, Jonah
    "000416": "G",     // English, Carl
    CTN: "G",          // Smith, Charles   - the 2005 Alphonso Ford Trophy winner (Pesaro/Real Madrid/Efes)
  };
  for (const pl of data.players) if (POS_FIX[pl.playerCode]) pl.pos = POS_FIX[pl.playerCode];
  return data;
}

// Refine the coarse G/F/C career position into a display sub-position + an interior/perimeter flag,
// derived from HEIGHT + that season's role stats, ERA-relative (judged vs same-season, same-career-pos
// peers). This is advisory/cosmetic — the sim still runs on G/F/C `pos`. It fixes two things: the Team
// Report can tell a floor-spacing WING from a true BIG (a "Forward" like Weems is a SF/wing, not a
// stretch big), and the court can seat the wing at SF and the bruiser at PF.
export function deriveRoles(data) {
  const P = data.players.filter((p) => p.box);
  const groups = new Map(); // "season|pos" -> players
  for (const p of P) { const k = p.season + "|" + p.pos; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const ms = (xs) => { const a = xs.filter((x) => Number.isFinite(x)); const n = a.length || 1; const m = a.reduce((s, x) => s + x, 0) / n; const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / n; return { m, s: Math.sqrt(v) || 1 }; };
  const base = new Map();
  for (const [k, arr] of groups) {
    const q = arr.filter((p) => p.q); const pool = q.length >= 4 ? q : arr;
    base.set(k, {
      h: ms(pool.filter((p) => p.height > 0).map((p) => p.height)),
      blk: ms(pool.map((p) => p.box.blk)), reb: ms(pool.map((p) => p.box.reb)),
      tpa: ms(pool.map((p) => p.box.tpa)), ast: ms(pool.map((p) => p.box.ast)),
    });
  }
  const zf = (b, v) => (b && Number.isFinite(v)) ? (v - b.m) / b.s : 0;
  for (const p of P) {
    const b = base.get(p.season + "|" + p.pos);
    if (p.pos === "C") { p.pos5 = "C"; p.interior = true; p.bigness = 2; continue; }
    if (p.pos === "G") { p.pos5 = (b && zf(b.ast, p.box.ast) >= 0.15) ? "PG" : "SG"; p.interior = false; p.bigness = -2; continue; }
    // Forward: an interior score (taller, rim-active, board-crashing, low outside/creation = a big).
    const zh = (b && p.height > 0) ? zf(b.h, p.height) : 0;
    const zreb = zf(b.reb, p.box.reb);
    const big = 1.1 * zh + 1.0 * zf(b.blk, p.box.blk) + 0.8 * zreb - 1.2 * zf(b.tpa, p.box.tpa) - 0.6 * zf(b.ast, p.box.ast);
    // A genuine big whose score dips just below 0 in one extreme-creation season (e.g. Shengelia
    // 2022-23, bigness ≈ -0.24) is still a big, so a tall, board-crashing NEAR-MISS is rescued. But the
    // rescue must NOT reach a true point-forward — a tall, rebounding PLAYMAKER (e.g. Preldžić, bigness
    // ≈ -1.2, a career SF/point-forward) is deeply negative precisely BECAUSE he creates, and belongs at
    // wing. Gating the rescue on a near-miss band keeps Shengelia's one dip a PF without dragging the
    // playmakers inside. Only flips a handful of forwards, all genuine bigs.
    p.bigness = big; p.interior = big >= 0 || (big >= -0.5 && zh >= 0.6 && zreb >= 0.5); p.pos5 = p.interior ? "PF" : "SF";
  }
  // CAREER-MODAL INTERIOR, for exactly the reason applyCareerPositions collapses `pos`: judged one
  // season at a time, a tweener disagrees with himself. Dejan Bodiroga — a 2.05m point-forward, one of
  // the great European WINGS — came out a wing in 2001, 2002 and 2006 and an interior big in 2003 and
  // 2004, because in those two years his three-point volume dipped and the height term carried him
  // barely over the line (bigness +0.44 and +0.83, against +1.0 to +5.2 for every genuine big). A five
  // holding him was then told "all three bigs share the floor" while the court showed a guard, a wing
  // and a centre.
  //
  // So the per-season score decides, then his CAREER decides, weighted by games played the same way
  // the position vote is. Raising the per-season bar instead was tried and is worse: it clears
  // Bodiroga but also drops a Mirotić season and a Shengelia season, and moves twice as many rows.
  // Centres and guards are never in doubt and skip the vote.
  const intVotes = new Map(); // playerCode -> { yes, no } in games
  for (const p of P) {
    if (p.pos === "C" || p.pos === "G") continue;
    const v = intVotes.get(p.playerCode) || { yes: 0, no: 0 };
    const w = Math.max(1, p.gp || 0);
    if (p.interior) v.yes += w; else v.no += w;
    intVotes.set(p.playerCode, v);
  }
  for (const p of P) {
    if (p.pos === "C" || p.pos === "G") continue;
    const v = intVotes.get(p.playerCode);
    if (!v) continue;
    p.interior = v.yes >= v.no;
    p.pos5 = p.interior ? "PF" : "SF";
  }
  return data;
}

// FLOOR SPACING, per player-season: how much of his own shot diet comes from outside, judged against
// same-season, same-position peers. Era- and position-relative like everything else here, because the
// league's shot diet has moved further in 25 years than any other thing in this data — the median
// qualified guard now takes 48% of his shots from three, and a fixed bar would simply mark every
// pre-2010 roster down.
//
// The engine reads this to damp a five whose floor nobody stretches (see SPACING_CATEGORIES there).
// It is a LOAD-TIME artefact like interior/pos5 — never persist it (pipeline/check_data.mjs enforces).
export function deriveSpacing(data) {
  const groups = new Map(); // "season|pos" -> [outside share]
  const shareOf = (p) => { const t = p.box.tpa + p.box.twa; return t > 0 ? p.box.tpa / t : 0; };
  for (const p of data.players) {
    if (!p.q || !p.box || (p.gp || 0) < 10) continue; // the league's real diet, not cameos
    const k = `${p.season}|${p.pos}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(shareOf(p));
  }
  const base = new Map();
  for (const [k, xs] of groups) {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length) || 0.1;
    base.set(k, { m, sd });
  }
  // Shrunk by games played and clamped, the same discipline the engine applies to every other z here.
  // Without it a 7-game centre who took two threes a night in 2009 — a season when centres essentially
  // never shot them, so the group's spread is almost nothing — came back at z 8.6 and would have
  // dragged a whole five's spacing on his own. 54 rows cleared |z| > 3 before this; the real p99 is 2.9.
  for (const p of data.players) {
    const b = base.get(`${p.season}|${p.pos}`);
    if (!b || !p.box) { p.spacing = 0; continue; }
    const raw = (shareOf(p) - b.m) / b.sd;
    const shrink = p.gp ? p.gp / (p.gp + 4) : 0;
    p.spacing = Math.max(-3, Math.min(3, raw * shrink));
  }
  return data;
}

export async function loadData() {
  // Resolve relative to THIS module (web/src/data.js), not the page, so it works whether the
  // app is served from the repo root (production static deploy) or the dev server.
  const url = new URL("../../data/players.json", import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load players.json: ${res.status}`);
  return res.json();
}

// Group players into (club, season) pools. Skip junk teamCodes (mid-season-transfer rows the
// API concatenates with ";") and pools too small to draft from.
export function buildClubSeasons(data) {
  applyCareerPositions(data); // collapse tweeners to one career position before pooling
  deriveRoles(data);          // refine into PG/SG/SF/PF/C + interior flag for display + the Team Report
  deriveSpacing(data);        // per-player floor spacing, read by the engine's spacing term
  const byId = new Map();
  for (const pl of data.players) {
    if (!pl.teamCode || pl.teamCode.includes(";")) continue;
    const id = `${pl.teamCode}|${pl.season}`;
    if (!byId.has(id)) {
      byId.set(id, {
        id, teamCode: pl.teamCode, teamName: pl.teamName,
        season: pl.season, seasonLabel: data.seasons[String(pl.season)].label,
        players: [],
      });
    }
    byId.get(id).players.push(pl);
  }

  const pools = [];
  for (const pool of byId.values()) {
    if (pool.players.length < MIN_ROSTER) continue;
    // sort roster strongest-first so the best options surface
    pool.players.sort((a, b) => playerStrength(b, data.seasons) - playerStrength(a, data.seasons));
    const top5 = pool.players.slice(0, 5).reduce((a, p) => a + Math.max(0, playerStrength(p, data.seasons)), 0);
    pool.ceiling = top5;
    // SQRT weighting: still leans toward stronger clubs (recognizable teams show up a bit more)
    // but far gentler than linear, so mid- and small-tier club-years stay in regular rotation.
    // (Linear made elite club-seasons ~2x over-represented and the game noticeably easier; the
    // difficulty this removes is restored in the win-curve calibration, not by re-skewing the spin.)
    pool.weight = Math.max(0.7, Math.sqrt(top5));
    pools.push(pool);
  }
  return pools;
}

export function spin(pools, rng = Math.random) {
  const total = pools.reduce((a, p) => a + p.weight, 0);
  let r = rng() * total;
  for (const pool of pools) {
    r -= pool.weight;
    if (r <= 0) return pool;
  }
  return pools[pools.length - 1];
}

export { CATEGORIES };
