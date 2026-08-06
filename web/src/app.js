import { projectRecord, CATEGORIES, GAMES, benchValue, CAT_TYPICAL } from "./engine.js";
import { loadData, buildClubSeasons, spin } from "./data.js";
import { clubStyle, monogram } from "./clubs.js";
import { runPostseason } from "./postseason.js";
import { arenaFor, arenaFlames, arenaSVG } from "./arenas.js";
import { eligibleCoaches, coachDeltas, archetypeLabel, pedigreeLabel } from "./coaches.js";
import { legendsPool, LEGENDS_CHANCE } from "./legends.js";
import {
  mulberry32, hashSeed, utcDayKey, dailySeed, buildDailyBoard, rosterSignature,
  shareText, weakestLink, STAGE_ICON, loadDaily, saveDaily, currentStreak, dailyHistory, weekKey,
} from "./daily.js";
import { initOnboarding } from "./onboarding.js";
import {
  encodeChallenge, decodeChallenge, reconstructTeam, duel, duelSeed,
} from "./versus.js";
import { SALARY_CAP, FLOOR as SALARY_FLOOR, playerCost, canAfford, formatMoney } from "./salary.js";
import { getIdentity, saveName, submitDaily, fetchLeaderboard, submitDynasty, fetchDynastyBoard } from "./leaderboard.js";
import { resolveGame, orderFive, canSwap, squadStrength, roundRng, drawFor, homeFor, buildDynastyBoard, dynastyWeekSeed } from "./dynasty.js";

const LEGENDS = legendsPool();

const el = (id) => document.getElementById(id);
const MAXCAT = 10;

// Five positions on the half court (basket at top). x/y are % of the court box.
const SLOTS = [
  { label: "PG", pos: "G", x: 50, y: 84 },
  { label: "SG", pos: "G", x: 80, y: 57 },
  { label: "SF", pos: "F", x: 20, y: 57 },
  { label: "PF", pos: "F", x: 34, y: 29 },
  { label: "C", pos: "C", x: 65, y: 24 },
];
const POS_FULL = { G: "Guard", F: "Forward", C: "Center" };
// The weakest-category line on the record card — a plain-language paraphrase, not "capped by X".
const GATE_PHRASE = {
  scoring: "Not enough scoring.",
  rebounding: "Not enough rebounding.",
  playmaking: "Not enough playmaking.",
  defense: "Not enough defense.",
  efficiency: "Not efficient enough.",
};
// "Best" (overall strength) is hidden for now — reserved for a possible easy mode. Default is minutes.
const SORTS = [
  ["mpg", "MIN"], ["pts", "PTS"], ["reb", "REB"], ["ast", "AST"],
  ["stl", "STL"], ["blk", "BLK"], ["ts", "TS%"],
];
const POS_ORDER = { G: 0, F: 1, C: 2 }; // Dynasty recruit list order: guards → forwards → centre

const state = {
  data: null, pools: [], slots: [null, null, null, null, null], offer: null, pending: null,
  respins: { club: true, year: true, both: true },
  arenaSlot: null,   // whose club's building hosts you (result of the arena spin)
  arenaSpun: false,  // the home arena is now spun for, not chosen
  arenaRolling: false,
  arenaRevealing: false, // brief moment showing the won arena in the left panel
  coachName: null,   // chosen coach (must have coached one of your five)
  sixth: null,       // the 6th man (bench, positionless, usage-discounted)
  revealed: false,   // the record stays hidden until arena spun + coach committed
  sortBy: "mpg", posFilter: "ALL",
  spinning: false,
  justSpun: false,   // triggers the roster cascade for one render
  courtRevealed: false, // arena outcome shows first; the court transforms a beat later
  revealStage: 0,    // how many bracket rounds have been revealed (auto-advance)
  resultView: "bracket", // "bracket" (real seeded bracket) | "summary" (lighter round list)
  mode: "classic",   // "classic" (free play) | "daily" (seeded shared board) | "versus" (H2H)
  dailyBoard: null,  // the six pre-drawn (club, season) offers for today
  dailyDayKey: null, // the UTC day the board belongs to
  dailyStreak: 0,
  dailyPractice: false, // replaying today's board unranked (after the one ranked attempt)
  dailySubmission: null, // the finished choices to post to the leaderboard (name added at send)
  dailySubmitted: false, // this device already posted today's board this session
  versusRole: null,  // null (pick a role) | "create" (mint a code) | "accept" (answer one)
  versusSeed: null,  // the matchup seed — shared via the code so both draft the same board
  versusBoard: null, // the six pre-drawn offers for this matchup
  versusOpponent: null, // reconstructed challenger's team (responder only)
  versusResult: null,   // { code } for the challenger, or the duel outcome for the responder
  versusError: null,
  dynasty: null,     // the gauntlet run: { started, round, streak, phase, squad, opp, home, arena, lastGame, pickIn, pickOut }
  dynSub: null,      // Dynasty sub-mode: null (lobby) | "endless" (free draft, all-time) | "weekly" (shared board)
  dynBoard: null,    // the week's fixed 5-draw draft board (weekly only)
  dynWeekKey: null,  // the ISO week the board belongs to
};
let dragging = null;
let spinTimer = null;
let revealTimer = null;
let dynTimer = null; // Dynasty animations (opponent/home-away spin, simulated score reveal)

function prettyName(name) {
  return name.split(",")
    .map((p) => p.trim().toLowerCase()
      .replace(/\b([a-zà-ÿ])/g, (m) => m.toUpperCase())
      // generational suffixes are Roman numerals, not names — keep them upper-case (Brown III, not Iii)
      .replace(/\b(ii|iii|iv|vi|vii|viii|ix)\b/gi, (m) => m.toUpperCase()))
    .join(", ");
}
const surname = (name) => prettyName(name).split(",")[0];

function boxLine(p) {
  const b = p.box;
  return `<b>${b.pts.toFixed(1)}</b> PTS · <b>${b.reb.toFixed(1)}</b> REB · <b>${b.ast.toFixed(1)}</b> AST · ` +
    `<b>${b.stl.toFixed(1)}</b> STL · <b>${b.blk.toFixed(1)}</b> BLK · <b>${Math.min(100, Math.round(b.ts * 100))}%</b> TS`;
}
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111" : "#fff";
}
function avatar(p, teamCode, cls = "avatar") {
  const s = clubStyle(teamCode);
  return `<span class="${cls}" style="background:${s.primary};color:${textOn(s.primary)};` +
    `box-shadow:inset 0 0 0 2px ${s.secondary}">${monogram(p.playerName)}</span>`;
}
function badge(teamCode) {
  const s = clubStyle(teamCode);
  return `<span class="badge" style="background:${s.primary};color:${textOn(s.primary)};` +
    `box-shadow:inset 0 0 0 3px ${s.secondary}">${s.abbr}</span>`;
}

async function init() {
  try {
    state.data = await loadData();
    state.pools = buildClubSeasons(state.data);
  } catch (e) {
    el("app").innerHTML = `<p style="color:var(--bad);text-align:center">Could not load data: ${e.message}</p>`;
    return;
  }
  el("spin-btn").addEventListener("click", () => doSpin());
  el("spin-club-btn").addEventListener("click", () => doSpin("club"));
  el("spin-year-btn").addEventListener("click", () => doSpin("year"));
  el("spin-both-btn").addEventListener("click", () => doSpin("both"));
  el("reset-btn").addEventListener("click", reset);
  document.querySelectorAll(".mode-tab").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.body.dataset.mode = state.mode;
  initOnboarding();
  render();
}

// Switch game mode. Classic is free play; Daily is the seeded shared board; Versus is H2H.
function setMode(mode) {
  if (mode === state.mode || state.spinning) return;
  state.mode = mode;
  document.body.dataset.mode = mode;
  if (mode === "daily") ensureDailyBoard();
  if (mode === "versus") resetVersus();
  if (mode === "dynasty") state.dynSub = null; // land on the Dynasty lobby (Weekly vs Endless)
  reset(); // clears the roster; keeps mode + board + dynSub
}

// Enter a Dynasty sub-mode from the lobby. Weekly builds the week's fixed, shared draft board.
function enterDynastySub(sub) {
  state.dynSub = sub;
  if (sub === "weekly") {
    state.dynWeekKey = weekKey();
    state.dynBoard = buildDynastyBoard(state.pools, dynastyWeekSeed(state.dynWeekKey));
  }
  reset();
}
const dynWeeklyKey = (wk) => "koe-dyn-week-" + wk;
function loadWeekly(wk) { try { return JSON.parse(localStorage.getItem(dynWeeklyKey(wk)) || "null"); } catch (e) { return null; } }
function saveWeekly(wk, streak) { try { localStorage.setItem(dynWeeklyKey(wk), JSON.stringify({ streak, at: Date.now() })); } catch (e) { /* ignore */ } }
function ensureDailyBoard() {
  state.dailyDayKey = utcDayKey();
  state.dailyBoard = buildDailyBoard(state.pools, LEGENDS, LEGENDS_CHANCE, dailySeed(state.dailyDayKey), 6, state.data.seasons);
  state.dailyStreak = currentStreak();
  state.dailyPractice = false; // a fresh entry is the ranked attempt
}
// Today's ranked attempt is spent and we're not in a practice replay -> the board is locked.
function dailyLocked() {
  return state.mode === "daily" && !state.dailyPractice && !!loadDaily(state.dailyDayKey);
}
// Reproducible arena roll for Daily: fixed by the day + the exact five drafted.
function dailyArenaRand() {
  return mulberry32(dailySeed(state.dailyDayKey) ^ hashSeed(rosterSignature(filled())))();
}

/* ---------------- versus ---------------- */

function resetVersus() {
  state.versusRole = null; state.versusSeed = null; state.versusBoard = null;
  state.versusOpponent = null; state.versusResult = null; state.versusError = null;
}
function buildVersusBoard() {
  state.versusBoard = buildDailyBoard(state.pools, LEGENDS, LEGENDS_CHANCE, state.versusSeed);
}
// Become the challenger: pick a fresh matchup seed, build the shared board, start drafting.
function versusCreate() {
  state.versusRole = "create";
  state.versusSeed = (Math.random() * 0xffffffff) >>> 0;
  buildVersusBoard();
  reset();
}
// Accept a pasted code: reconstruct the challenger's team and adopt their board.
function versusAccept(code) {
  try {
    const env = decodeChallenge(code);
    state.versusSeed = env.seed >>> 0;
    buildVersusBoard(); // rebuild the shared board first — the code's picks reference it
    state.versusOpponent = reconstructTeam(env, state.data, state.versusBoard);
    state.versusRole = "accept";
    state.versusError = null;
    reset();
  } catch (e) {
    state.versusError = e.message;
    render();
  }
}
// The challenger's finished five -> a shareable code.
function makeChallengeCode() {
  const co = chosenCoach();
  return encodeChallenge({
    seed: state.versusSeed,
    board: state.versusBoard,
    slots: state.slots,
    sixth: state.sixth,
    arenaSlotIdx: state.arenaSlot,
    coachCode: co ? co.coach.code : "",
  });
}
// The responder's five vs the reconstructed challenger -> a best-of-seven.
function runDuel() {
  const me = projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth);
  const opp = state.versusOpponent;
  const myCodes = state.slots.map((s) => s.playerCode).concat(state.sixth ? [state.sixth.playerCode] : []);
  const oppCodes = opp.starters.map((s) => s.playerCode).concat(opp.bench ? [opp.bench.playerCode] : []);
  const d = duel(me.S, opp.result.S, duelSeed(myCodes, oppCodes));
  return { d, me };
}

const filled = () => state.slots.filter(Boolean);
const openPositions = () => SLOTS.filter((s, i) => !state.slots[i]).map((s) => s.pos);
const openSlotsFor = (pos) => SLOTS.map((s, i) => ({ s, i })).filter(({ s, i }) => s.pos === pos && !state.slots[i]);
const isDup = (player) => filled().some((s) => s.playerCode === player.playerCode)
  || (state.sixth && state.sixth.playerCode === player.playerCode);
const sixthOpen = () => !state.sixth && !dynastyMode(); // Dynasty is 5v5 — no bench slot
const hasRoomFor = (player) => openSlotsFor(player.pos).length > 0 || sixthOpen();

/* ---------------- mode helpers ---------------- */
const dynastyMode = () => state.mode === "dynasty";
const inGauntlet = () => dynastyMode() && !!state.dynasty && state.dynasty.started;
// The Dynasty draft is UNWEIGHTED — no √top-5 bias toward strong clubs — so you start modest and
// EARN your dynasty by looting, rather than being handed a strong squad (see docs/DECISIONS.md §15).
const spinUniform = (pools) => pools[Math.floor(Math.random() * pools.length)];

/* ---------------- salary cap ---------------- */
const salaryMode = () => state.mode === "salary";
const priceOf = (p) => playerCost(p, state.data.seasons);
const salarySpent = () =>
  filled().reduce((a, s) => a + priceOf(s), 0) + (state.sixth ? priceOf(state.sixth) : 0);
// affordable AND leaves FLOOR for each still-empty pick, so a splurge can't strand the roster
const canAffordPick = (player) =>
  !salaryMode() || canAfford(salarySpent(), priceOf(player), 5 - pickedCount());

// a player is placeable if there's room AND (in salary mode) you can afford him
const canPlace = (player) => !isDup(player) && hasRoomFor(player) && canAffordPick(player);
const startersFilled = () => filled().length >= 5;
// Classic/Daily/Salary/Versus: 5 starters + a 6th man. Dynasty is 5v5 — five starters IS the squad.
const complete = () => startersFilled() && (dynastyMode() || !!state.sixth);
const pickedCount = () => filled().length + (state.sixth ? 1 : 0);

/* ---------------- spin (with a slot-machine roll) ---------------- */

function respinPool(mode) {
  const o = state.offer;
  if (!o) return [];
  if (mode === "club") return state.pools.filter((p) => p.season === o.season && p.teamCode !== o.teamCode);
  if (mode === "year") return state.pools.filter((p) => p.teamCode === o.teamCode && p.season !== o.season);
  return state.pools.filter((p) => !(p.teamCode === o.teamCode && p.season === o.season));
}
const canRespin = (mode) => !!state.offer && state.respins[mode] && respinPool(mode).length > 0;

function doSpin(mode) {
  if (complete() || state.spinning) return;
  let target, reels;
  if (!mode) {
    if (state.offer) return; // already drawn — pick from it (or, in Classic, spend a re-spin)
    if (state.mode === "daily") {
      target = state.dailyBoard[pickedCount()]; // the day's fixed draw for this pick
      if (!target) return;
    } else if (state.mode === "versus") {
      target = state.versusBoard[pickedCount()]; // the matchup's shared draw
      if (!target) return;
    } else if (state.mode === "dynasty") {
      if (state.dynSub === "weekly") {
        target = state.dynBoard[pickedCount()]; // the week's fixed draw for this pick
        if (!target) return;
      } else {
        target = spinUniform(state.pools); // endless: unweighted free draft, start modest
      }
    } else {
      // rare nugget: sometimes the main spin lands the European Legends instead of a club
      target = Math.random() < LEGENDS_CHANCE ? LEGENDS : spin(state.pools);
    }
    reels = { club: true, year: true };
  } else {
    if (state.mode === "daily" || state.mode === "versus" || (dynastyMode() && state.dynSub === "weekly")) return; // no re-spins on a fixed board
    if (!canRespin(mode)) return;
    state.respins[mode] = false;
    target = spin(respinPool(mode));
    reels = { club: mode !== "year", year: mode !== "club" };
  }
  rollTo(target, reels);
}

// Cycle the reels like a lucky dip, EASING OUT so they visibly slow and land (~2.2s), then
// settle on the drawn club-year and cascade the roster in (state.justSpun).
function rollTo(target, reels) {
  state.spinning = true;
  state.pending = null;
  state.rollFixed = {
    club: reels.club ? null : clubStyle(state.offer.teamCode).abbr,
    year: reels.year ? null : state.offer.seasonLabel,
  };
  render();

  const codes = [...new Set(state.pools.map((p) => p.teamCode))];
  const years = [...new Set(state.pools.map((p) => p.season))];
  const N = 26;
  let i = 0;
  clearTimeout(spinTimer);

  const tick = () => {
    const rc = el("reel-club"), ry = el("reel-year");
    if (i >= N) { // land
      const legend = !!target.legend;
      if (rc) { rc.textContent = legend ? "★ LEGENDS ★" : clubStyle(target.teamCode).abbr; rc.classList.add("landed"); }
      if (ry) { ry.textContent = target.seasonLabel; ry.classList.add("landed"); }
      const st = clubStyle(target.teamCode);
      if (rc) { rc.style.background = st.primary; rc.style.color = textOn(st.primary); rc.style.borderColor = st.primary; }
      if (legend) { const w = el("reel-wrap"); if (w) w.classList.add("legends-hit"); }
      spinTimer = setTimeout(() => {
        state.spinning = false; state.rollFixed = null; state.offer = target; state.justSpun = true;
        render();
        setTimeout(() => { state.justSpun = false; }, 900); // let the cascade finish; don't re-trigger
      }, legend ? 900 : 260); // hold the golden reveal a beat longer
      return;
    }
    if (rc && reels.club) rc.textContent = clubStyle(codes[(Math.random() * codes.length) | 0]).abbr;
    if (ry && reels.year) ry.textContent = state.data.seasons[String(years[(Math.random() * years.length) | 0])].label;
    // gentle ease-out — capped tail (~118ms max) so it settles smoothly instead of lagging
    const t = i / N;
    const delay = 48 + Math.pow(t, 2) * 70;
    i++;
    spinTimer = setTimeout(tick, delay);
  };
  tick();
}

/* ---------------- placing ---------------- */

function selectPending(player) {
  if (!canPlace(player)) return;
  const same = state.pending && state.pending.playerCode === player.playerCode;
  state.pending = same ? null : player;
  // Surgical update: don't rebuild the whole offer grid or the mode/budget bar (that repaint is
  // the "refresh" flash). Just retag the selected card and refresh where he can be placed.
  document.querySelectorAll("#pool-grid .card").forEach((c) =>
    c.classList.toggle("selected", !!state.pending && c.dataset.code === state.pending.playerCode));
  renderCourt();
  renderSixth();
}
function placeAt(slotIndex, player) {
  const slot = SLOTS[slotIndex];
  if (!player || state.slots[slotIndex] || slot.pos !== player.pos || isDup(player)) return;
  state.slots[slotIndex] = {
    ...player,
    _src: { teamName: state.offer.teamName, seasonLabel: state.offer.seasonLabel, teamCode: state.offer.teamCode },
  };
  state.pending = null;
  state.offer = null;
  render();
}
function clearEndgame() {
  // note: does NOT clear state.sixth — the bench player survives editing a starter
  state.arenaSlot = null; state.arenaSpun = false; state.arenaRolling = false; state.arenaRevealing = false;
  state.coachName = null; state.revealed = false;
  state.courtRevealed = false; state.revealStage = 0;
  clearInterval(revealTimer);
}
// the 6th man: positionless, any non-duplicate player from the current spin
function pickSixth(player) {
  if (isDup(player) || !sixthOpen()) return;
  state.sixth = { ...player, _src: { teamName: state.offer.teamName, seasonLabel: state.offer.seasonLabel, teamCode: state.offer.teamCode } };
  state.offer = null; state.pending = null;
  render();
}
function reset() {
  state.slots = [null, null, null, null, null];
  state.offer = null; state.pending = null;
  state.respins = { club: true, year: true, both: true };
  state.sixth = null;
  state.dynasty = null;
  clearTimeout(dynTimer);
  clearEndgame();
  render();
}

/* ---------------- arena + coach ---------------- */

function arenaInfoFor(slotIdx) {
  const s = state.slots[slotIdx];
  if (!s) return null;
  const base = arenaFor(s._src.teamCode, s.season);
  const count = filled().filter((x) => x._src.teamCode === s._src.teamCode).length;
  return { ...base, count, share: count / 5, mult: 1 + (base.mult - 1) * (count / 5) };
}
const chosenArena = () => (state.arenaSlot !== null ? arenaInfoFor(state.arenaSlot) : null);
// In Dynasty the home arena is FROZEN at draft (your building for the whole run), independent of the
// squad churning underneath it via recruits.
const arenaMult = () => {
  if (inGauntlet() && state.dynasty.arena) return state.dynasty.arena.mult;
  const a = chosenArena(); return a ? a.mult : 1;
};
const coachOptions = () => eligibleCoaches([...filled(), state.sixth].filter(Boolean), state.data);
const chosenCoach = () => (state.coachName ? coachOptions().find((e) => e.coach.name === state.coachName) || null : null);
const coachCatDeltas = () => { const c = chosenCoach(); return c ? coachDeltas(c) : null; };

// distinct clubs among your five -> slot index
function arenaChoices() {
  const seen = new Map();
  state.slots.forEach((s, i) => { if (s && !seen.has(s._src.teamCode)) seen.set(s._src.teamCode, i); });
  return [...seen.values()];
}

// The home arena is now SPUN, not chosen — among the buildings your five's clubs used IN THE
// SEASONS your players came from (an Efes 2015 player brings Abdi İpekçi, not Sinan Erdem).
// Weighted by roster share: a club with more of your five is likelier to be home (and, via
// share-scaling, gives a bigger boost) — so stacking a club is rewarded twice.
function spinArena() {
  if (state.arenaRolling || state.arenaSpun) return;
  const choices = arenaChoices();
  if (!choices.length) return;
  const weighted = [];
  for (const i of choices) {
    const n = filled().filter((x) => x._src.teamCode === state.slots[i]._src.teamCode).length;
    for (let k = 0; k < n; k++) weighted.push(i);
  }
  const rand = state.mode === "daily" ? dailyArenaRand() : Math.random();
  const target = weighted[(rand * weighted.length) | 0];
  // each reel frame carries the club badge (3-letter, team colours) beside its building's name.
  const reelItem = (i) => {
    const s = state.slots[i];
    return badge(s._src.teamCode) + `<span class="reel-arena">${arenaFor(s._src.teamCode, s.season).name}</span>`;
  };

  // cycle through the actual candidate buildings, slower (it's only a handful) and readable.
  state.arenaRolling = true;
  render();
  const N = choices.length * 3 + 3;
  let i = 0;
  clearTimeout(spinTimer);
  const tick = () => {
    const r = el("arena-reel");
    if (i >= N) {
      if (r) { r.innerHTML = reelItem(target); r.classList.add("landed"); }
      spinTimer = setTimeout(() => {
        // 1) reveal the won arena BIG in the left panel; 2) sweep the court a beat later;
        // 3) advance to the coach step.
        state.arenaRolling = false; state.arenaSlot = target; state.arenaSpun = true; state.arenaRevealing = true;
        render();
        setTimeout(() => { state.courtRevealed = true; render(); }, 550);
        setTimeout(() => {
          state.arenaRevealing = false;
          if (dynastyMode()) startGauntlet(); // no coach in Dynasty — the run begins
          render();
        }, 2100);
      }, 260);
      return;
    }
    if (r) r.innerHTML = reelItem(choices[i % choices.length]); // wheel through the real options
    const t = i / N;
    const delay = 150 + Math.pow(t, 1.8) * 170; // slower, readable, gentle settle
    i++;
    spinTimer = setTimeout(tick, delay);
  };
  tick();
}

/* ---------------- Dynasty gauntlet ---------------- */

// Field the best legal five from the 6-player squad, push it into the court slots + sixth man, and
// re-point the frozen home arena to a starter of that club (or none, if it's been traded away).
// Order the 5-man squad into the court slots; the squad IS the starting five (Dynasty is 5v5).
function applyDynastySquad(five) {
  state.slots = orderFive(five);
  state.sixth = null;
  state.dynasty.squad = [...state.slots];
  const tc = state.dynasty.arena ? state.dynasty.arena.teamCode : null;
  const idx = state.slots.findIndex((s) => s && s._src.teamCode === tc);
  state.arenaSlot = idx >= 0 ? idx : null;
}

// Freeze the drafted home arena (its FULL rating — not share-scaled — so the server can reproduce it
// from just teamCode+season), field the five, seed the run, and begin. The seed makes the whole
// gauntlet reproducible; `choices` records each recruit so a run can be submitted and re-simulated.
function startGauntlet() {
  if (inGauntlet()) return;
  const homeSlot = state.arenaSlot != null ? state.slots[state.arenaSlot] : null;
  const base = homeSlot ? arenaFor(homeSlot._src.teamCode, homeSlot.season) : null;
  const st = homeSlot ? clubStyle(homeSlot._src.teamCode) : { primary: "#888", secondary: "#555", abbr: "" };
  state.dynasty = {
    started: true, round: 1, streak: 0, phase: "spin",
    squad: [...state.slots],
    sub: state.dynSub,
    board: state.dynSub === "weekly" ? state.dynWeekKey : "alltime",
    seed: state.dynSub === "weekly" ? (dynastyWeekSeed(state.dynWeekKey) >>> 0) : ((Math.random() * 0xffffffff) >>> 0),
    startFive: state.slots.map((p) => ({ code: p.playerCode, season: p.season })),
    choices: [],
    arena: base ? { mult: base.mult, name: base.name, rating: base.rating, cap: base.cap, teamCode: homeSlot._src.teamCode,
                    season: homeSlot.season, primary: st.primary, secondary: st.secondary, abbr: st.abbr } : null,
    opp: null, home: true, lastGame: null, pickIn: null, pickOut: null, recruitStep: "in", spin: null, play: null,
  };
  applyDynastySquad(state.dynasty.squad);
  beginRound();
}

// Draw the next opponent + home/away, then spin them into view (the reveal is half the fun).
function beginRound() {
  const d = state.dynasty;
  d.opp = drawFor(state.pools, state.data.seasons, d.seed, d.round);
  d.home = homeFor(d.seed, d.round);
  d.lastGame = null; d.play = null;
  animateMatchupSpin();
}

// The reveal, in sequence: (1) spin the OPPONENT (club+year reel), (2) the five take the court, (3) the
// home/away spin runs with the players already out there, (4) the floor gradually tints the home
// colour. Outcomes are already decided — this only animates the reveal.
function animateMatchupSpin() {
  clearTimeout(dynTimer);
  const d = state.dynasty;
  d.phase = "spinTeam";
  render();
  const codes = [...new Set(state.pools.map((p) => p.teamCode))];
  const years = [...new Set(state.pools.map((p) => p.season))];
  const setReel = (club, year) => { const c = el("dyn-reel-club"), y = el("dyn-reel-year"); if (c) c.textContent = club; if (y) y.textContent = year; };
  const NO = 24;
  let i = 0;
  const tickOpp = () => {
    if (i >= NO) {
      const st = clubStyle(d.opp.teamCode);
      setReel(st.abbr, d.opp.seasonLabel);
      const c = el("dyn-reel-club"); if (c) { c.classList.add("landed"); c.style.background = st.primary; c.style.color = textOn(st.primary); }
      dynTimer = setTimeout(() => { d.phase = "spinLoc"; render(); spinLoc(); }, 700); // five take the court, then home/away spins
      return;
    }
    setReel(clubStyle(codes[(Math.random() * codes.length) | 0]).abbr, state.data.seasons[String(years[(Math.random() * years.length) | 0])].label);
    i++; const t = i / NO; dynTimer = setTimeout(tickOpp, 45 + Math.pow(t, 2) * 78);
  };
  dynTimer = setTimeout(tickOpp, 120);
}

// Home/away spin, with the five already on the court; when it lands, the floor tints in (CSS trans).
function spinLoc() {
  const d = state.dynasty;
  const setLoc = (loc, landed) => { const l = el("dyn-loc-reel"); if (l) { l.textContent = loc === "home" ? "🏠 HOME" : "✈️ AWAY"; l.className = "dyn-loc-reel " + loc + (landed ? " landed" : ""); } };
  const NL = 14;
  let i = 0;
  const tick = () => {
    if (i >= NL) {
      setLoc(d.home ? "home" : "away", true);
      const court = document.querySelector(".dyn-court"); if (court) court.classList.add("tinted"); // gradual wash
      dynTimer = setTimeout(() => { d.phase = "matchup"; render(); }, 1100);
      return;
    }
    setLoc(i % 2 === 0 ? "home" : "away", false);
    i++; const t = i / NL; dynTimer = setTimeout(tick, 60 + Math.pow(t, 2) * 95);
  };
  dynTimer = setTimeout(tick, 300);
}

// Play the single game, then reveal the score quarter by quarter like a live sim.
function playGauntletGame() {
  const d = state.dynasty;
  if (d.phase !== "matchup" || !d.opp) return;
  clearTimeout(dynTimer);
  const myS = squadStrength(state.slots, state.data.seasons);
  const homeMult = d.arena ? d.arena.mult : 1;
  d.lastGame = resolveGame(myS, d.opp, d.home, homeMult, roundRng(d.seed, d.round, "game"));
  d.phase = "playing"; d.play = { q: 0, mine: 0, theirs: 0, done: false };
  render();
  animateScore();
}

function animateScore() {
  const d = state.dynasty, lg = d.lastGame;
  const paint = () => {
    const m = el("dyn-score-mine"), t = el("dyn-score-theirs"), q = el("dyn-score-q");
    if (m) m.textContent = d.play.mine; if (t) t.textContent = d.play.theirs;
    if (q) q.textContent = d.play.done ? "FINAL" : "Q" + d.play.q;
    // while the game runs, highlight whoever's currently ahead so lead changes read on the scoreboard
    if (m && t) {
      m.classList.toggle("ahead", !d.play.done && d.play.mine > d.play.theirs);
      t.classList.toggle("ahead", !d.play.done && d.play.theirs > d.play.mine);
    }
    if (d.play.done) {
      const b = el("dyn-scoreboard"); if (b) b.classList.add(lg.win ? "won" : "lost");
      if (m) { m.classList.remove("ahead"); if (lg.win) m.classList.add("lead"); }
      if (t) { t.classList.remove("ahead"); if (!lg.win) t.classList.add("lead"); }
    }
  };
  let q = 0;
  const step = () => {
    if (q >= 4) {
      d.play.done = true; paint();
      dynTimer = setTimeout(() => {
        if (lg.win) { d.streak++; d.phase = "recruit"; d.recruitStep = "in"; d.pickIn = null; d.pickOut = null; }
        else { d.phase = "over"; }
        render();
      }, 1500);
      return;
    }
    d.play.mine += lg.quarters.mine[q]; d.play.theirs += lg.quarters.theirs[q]; d.play.q = q + 1;
    paint(); q++;
    dynTimer = setTimeout(step, 820);
  };
  dynTimer = setTimeout(step, 500);
}

// Commit the forced swap: one opponent player in, one of yours out (like-for-like on position).
function confirmRecruit() {
  const d = state.dynasty;
  const incoming = d.opp.five.find((p) => p.playerCode === d.pickIn);
  if (!incoming || d.pickOut == null || !canSwap(d.squad, incoming, d.pickOut)) return;
  d.choices.push({ inn: incoming.playerCode, out: d.squad[d.pickOut].playerCode }); // record for re-sim
  const next = d.squad.map((p, i) => (i === d.pickOut ? incoming : p));
  applyDynastySquad(next);
  d.round++;
  beginRound();
}

/* ---------------- render ---------------- */

function render() {
  // drives the result-screen sidebar re-order (coach up, balance hidden) via CSS
  document.body.dataset.revealed = complete() && state.revealed ? "1" : "";
  // the coach-pick step (five done, arena spun, not yet revealed): group arena + coach up top too,
  // so the coach you're choosing isn't stranded at the bottom of the sidebar.
  document.body.dataset.picking = complete() && state.arenaSpun && !state.revealed ? "1" : "";
  renderModes(); renderControl(); renderVenue(); renderCourt(); renderSixth(); renderBench();
  renderOffer(); renderCommit(); renderCats(); renderResult();
}

function renderModes() {
  document.querySelectorAll(".mode-tab").forEach((b) =>
    b.classList.toggle("on", b.dataset.mode === state.mode));
  const bar = el("daily-bar");

  if (state.mode === "daily") {
    bar.classList.remove("hidden");
    const done = loadDaily(state.dailyDayKey);
    const streak = currentStreak();
    const streakTxt = streak > 0 ? ` · <span class="streak">🔥 ${streak}-day streak</span>` : "";
    if (state.dailyPractice) {
      bar.innerHTML = `<span class="dl">🗓 Daily</span> <b>Practice run</b> — today's board, not counted. ` +
        `<a href="#" id="dl-exit-practice" class="dl-link">Back to result</a>`;
      const exit = el("dl-exit-practice");
      if (exit) exit.addEventListener("click", (e) => { e.preventDefault(); state.dailyPractice = false; reset(); });
    } else {
      bar.innerHTML = done
        ? `<span class="dl">🗓 Daily</span> Finished today — <b>${done.wins}–${done.losses}</b> · ${done.label} ` +
          `Same board for everyone; come back tomorrow.${streakTxt}`
        : `<span class="dl">🗓 Daily</span> The same six draws for everyone today — no re-spins. ` +
          `Draft your best five.${streakTxt}`;
    }
    return;
  }

  if (state.mode === "salary") {
    bar.classList.remove("hidden");
    const spent = salarySpent(), left = SALARY_CAP - spent;
    const pct = Math.min(100, (spent / SALARY_CAP) * 100);
    const low = left <= SALARY_FLOOR * (5 - pickedCount()); // only floor fillers left affordable
    bar.innerHTML =
      `<span class="dl">💰 Salary cap</span>` +
      `<span class="cap-meter"><span class="cap-fill${low ? " low" : ""}" style="width:${pct}%"></span></span>` +
      `<b class="cap-left">${formatMoney(left)}</b> of ${formatMoney(SALARY_CAP)} left`;
    return;
  }

  if (state.mode === "versus" && state.versusRole) {
    bar.classList.remove("hidden");
    bar.innerHTML = state.versusRole === "create"
      ? `<span class="dl">⚔️ Versus</span> Draft your five, then mint a code to challenge a friend.`
      : `<span class="dl">⚔️ Versus</span> Facing <b>${state.versusOpponent.label}</b> ` +
        `<span class="muted">(proj. ${state.versusOpponent.result.wins}–${state.versusOpponent.result.losses})</span> — ` +
        `draft from the same board, then play the duel.`;
    return;
  }

  bar.classList.add("hidden");
}

// Versus role chooser — sits in the left panel before any drafting.
function renderVersusIntro(box) {
  box.classList.remove("spun-in", "legends");
  const err = state.versusError ? `<p class="versus-err">${state.versusError}</p>` : "";
  box.innerHTML =
    `<div class="versus-intro">` +
      `<div class="vi-icon">⚔️</div>` +
      `<h2>Head-to-head</h2>` +
      `<p class="muted">Both players draft from the <b>same six draws</b>. Build your five, send a ` +
        `challenge code, and the sim decides a best-of-seven.</p>` +
      `<div class="vi-actions">` +
        `<button id="vi-create" class="spin-btn">Create a challenge</button>` +
        `<div class="vi-or">or answer one</div>` +
        `<div class="vi-accept"><input id="vi-code" type="text" placeholder="Paste a challenge code…" autocomplete="off" spellcheck="false" />` +
        `<button id="vi-accept-btn" class="mini-btn">Accept</button></div>` +
        err +
      `</div>` +
    `</div>`;
  el("vi-create").addEventListener("click", () => { versusCreate(); render(); });
  const accept = () => versusAccept(el("vi-code").value);
  el("vi-accept-btn").addEventListener("click", () => { accept(); if (state.versusRole) render(); });
  el("vi-code").addEventListener("keydown", (e) => { if (e.key === "Enter") { accept(); if (state.versusRole) render(); } });
}

// Daily lockout — today's ranked attempt recap + a 7-day history strip + a practice option.
function renderDailyLockout(box) {
  box.classList.remove("spun-in", "legends");
  const r = loadDaily(state.dailyDayKey);
  const streak = currentStreak();
  const txt = shareText({
    dayKey: state.dailyDayKey, wins: r.wins, losses: r.losses,
    label: r.label, stage: r.stage, categoryScores: r.categoryScores, streak,
  });
  const cells = dailyHistory(7).reverse().map((h) => {
    const done = !!h.result;
    const wd = new Date(h.dayKey + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short" });
    const rec = done ? `${h.result.wins}–${h.result.losses}` : "—";
    const today = h.dayKey === state.dailyDayKey ? " today" : "";
    return `<div class="hist-cell${done ? " done" : ""}${today}"><span class="hc-d">${wd}</span><span class="hc-r">${rec}</span></div>`;
  }).join("");
  box.innerHTML =
    `<div class="daily-lock">` +
      `<div class="dl-badge">🔒 Today's result</div>` +
      `<div class="record${r.wins === GAMES ? " perfect" : ""}">${r.wins}–${r.losses}</div>` +
      `<div class="verdict stage-${r.stage}">${r.label}</div>` +
      `<div class="share-box"><pre class="share-pre" id="share-pre">${txt}</pre>` +
        `<button id="share-btn" class="mini-btn">Copy result</button></div>` +
      `<div class="hist-strip">${cells}</div>` +
      `<div id="leaderboard" class="lb"></div>` +
      `<p class="dl-note">One ranked attempt a day — come back tomorrow for a new board.</p>` +
      `<button id="dl-practice" class="ghost-btn">Practice today's board (unranked)</button>` +
    `</div>`;
  wireCopy(txt, "Copy result");
  el("dl-practice").addEventListener("click", () => { state.dailyPractice = true; reset(); });
  mountLeaderboard();
}

// The 6th-man BENCH slot, right under the court and available the whole time: any selected
// player can be sent here (it's positionless, usage-discounted). It's a placement target that
// lights up while a player is pending, exactly like the court spots.
function renderSixth() {
  const box = el("sixth-slot");
  if (dynastyMode()) { box.className = "sixth-slot hidden"; box.innerHTML = ""; return; } // 5v5, no bench
  if (state.sixth) {
    const s = state.sixth, pct = Math.round(benchValue(s) * 100);
    box.className = "sixth-slot filled";
    // No remove (×) on the bench — it caused edge-case bugs. To change the 6th man, Start over.
    box.innerHTML =
      `<span class="six-tag">6TH</span>${avatar(s, s._src.teamCode)}` +
      `<span class="who"><span class="nm">${prettyName(s.playerName)}</span>` +
      `<span class="from">${POS_FULL[s.pos]} · ${s._src.teamName.split(";")[0]} ${s._src.seasonLabel} · bench ${pct}%</span></span>`;
    return;
  }
  const eligible = (state.pending && sixthOpen()) ? " eligible" : "";
  box.className = "sixth-slot empty" + eligible;
  box.innerHTML = `<span class="six-tag">6TH</span><span class="six-hint">Send any player to the bench</span>`;
  box.onclick = () => { if (state.pending && sixthOpen()) pickSixth(state.pending); };
  box.ondragover = (e) => { if (dragging && sixthOpen() && !isDup(dragging)) { e.preventDefault(); box.classList.add("drop-hot"); } };
  box.ondragleave = () => box.classList.remove("drop-hot");
  box.ondrop = (e) => { e.preventDefault(); box.classList.remove("drop-hot"); if (dragging) { pickSixth(dragging); dragging = null; } };
}

function renderControl() {
  const done = complete();
  // Once the season is revealed the spin bar is dead weight — hide it so the result/bracket claims
  // that vertical space and fits without scrolling.
  el("control-bar").classList.toggle("hidden", (done && state.revealed) || inGauntlet() || (dynastyMode() && !state.dynSub));
  const info = el("pickinfo");
  if (done) info.textContent = state.revealed ? "Season played" : "Your team is set";
  else info.innerHTML = `Pick <b>${pickedCount() + 1}</b> of ${dynastyMode() ? 5 : 6}`; // Dynasty 5v5
  info.classList.toggle("done", done);

  el("spin-btn").disabled = done || !!state.offer || state.spinning || dailyLocked();
  // Fixed-board modes (Daily, Versus, weekly Dynasty) draw a set board — no re-spins.
  const fixedBoard = state.mode === "daily" || state.mode === "versus" || (dynastyMode() && state.dynSub === "weekly");
  for (const [mode, id] of [["club", "spin-club-btn"], ["year", "spin-year-btn"], ["both", "spin-both-btn"]]) {
    const btn = el(id);
    const spent = !state.respins[mode];
    btn.disabled = done || state.spinning || fixedBoard || !canRespin(mode);
    btn.classList.toggle("used", spent);
    btn.title = spent ? "Already used this playthrough"
      : state.offer ? `Re-spin ${mode === "both" ? "club and year" : mode} (1 use)` : "Spin first, then you can re-spin";
  }
  el("reset-btn").classList.toggle("hidden", filled().length === 0 && !state.offer);
}

// Arena sits above the court and shows the RESULT of the spin (idle until then).
function renderVenue() {
  const box = el("venue");
  // While drafting, the arena and coach are just promises — collapse both into ONE slim line so
  // the court and the category bars (the things you actually act on) stay above the fold.
  if (!complete()) {
    box.className = "venue slim";
    box.innerHTML = `<div class="venue-idle">🏟 Arena & coach unlock after your five</div>`;
    return;
  }
  box.className = "venue";
  // Dynasty: the home arena is frozen for the whole run (independent of the churning squad).
  if (inGauntlet() && state.dynasty.arena) {
    const ar = state.dynasty.arena;
    box.innerHTML = `<div class="venue-head">Home arena</div>` +
      arenaSVG(ar.primary, ar.secondary, ar.rating, ar.cap) +
      `<div class="venue-name">${ar.name} <span class="flames">${arenaFlames(ar.rating)}</span></div>`;
    return;
  }
  if (!state.arenaSpun) { box.innerHTML = `<div class="venue-idle">🏟 Spin for your home arena →</div>`; return; }
  const cur = chosenArena();
  const st = clubStyle(state.slots[state.arenaSlot]._src.teamCode);
  box.innerHTML = `<div class="venue-head">Home arena</div>` +
    arenaSVG(st.primary, st.secondary, cur.rating, cur.cap) +
    `<div class="venue-name">${cur.name} <span class="flames">${arenaFlames(cur.rating)}</span></div>`;
}

// Coach is PICKED in the left panel; here on the sideline we only DISPLAY who you chose.
function renderBench() {
  const box = el("bench");
  // hidden entirely until it's live — the venue line above already says it's coming
  if (!complete() || !state.arenaSpun) { box.className = "bench hidden"; box.innerHTML = ""; return; }
  if (dynastyMode()) { box.className = "bench hidden"; box.innerHTML = ""; return; } // Dynasty has no coach
  box.className = "bench";
  const co = chosenCoach();
  if (!co) {
    box.innerHTML = `<div class="bench-head">Coach</div><div class="bench-idle">No coach</div>`;
    return;
  }
  // "Coach" sits inline with the name (same type), and after the season is played we drop the
  // "N of your 5" count to save vertical room — it's already shown on the coach-pick cards.
  const meta = state.revealed
    ? `<div class="bench-meta">${archetypeLabel(co.coach)}</div>`
    : `<div class="bench-meta">${archetypeLabel(co.coach)} · Coached ${co.count} of your 6</div>`;
  box.innerHTML =
    `<div class="bench-line"><span class="bench-tag">Coach</span>` +
    `<span class="venue-name">${prettyName(co.coach.name)}</span></div>` + meta;
}

function renderCourt() {
  // "home court" treatment: team-colour paint, a centre-court abbreviation, a colour frame.
  // Gated on courtRevealed so the arena outcome shows first, then the court transforms.
  const home = (state.courtRevealed && state.arenaSlot !== null) ? state.slots[state.arenaSlot] : null;
  const st = home ? clubStyle(home._src.teamCode) : null;
  const wrap = el("court-wrap");
  wrap.classList.toggle("has-home", !!st);
  wrap.classList.toggle("sweep", !!st); // triggers the top-to-bottom colour sweep (once)
  if (st) { wrap.style.setProperty("--home", st.primary); wrap.style.setProperty("--home2", st.secondary); }
  const paint = el("c-paint"), mark = el("c-mark"), sweep = el("court-sweep");
  if (paint) { paint.style.fill = st ? st.primary : "transparent"; paint.style.fillOpacity = st ? 0.28 : 0; }
  if (mark) { mark.textContent = st ? st.abbr : ""; mark.style.fill = st ? st.primary : "transparent"; mark.style.fillOpacity = st ? 0.16 : 0; }
  if (sweep) sweep.style.background = st ? st.primary : "transparent"; // the directional wash

  const box = el("court-spots");
  box.innerHTML = "";
  SLOTS.forEach((slot, i) => {
    const s = state.slots[i];
    const eligible = state.pending && !s && slot.pos === state.pending.pos;
    const spot = document.createElement("div");
    spot.className = "spot " + (s ? "filled" : "empty") + (eligible ? " eligible" : "");
    spot.style.left = slot.x + "%";
    spot.style.top = slot.y + "%";
    if (s) {
      const st = clubStyle(s._src.teamCode);
      spot.innerHTML =
        `<span class="disc" style="background:${st.primary};color:${textOn(st.primary)};box-shadow:inset 0 0 0 2px ${st.secondary}">${monogram(s.playerName)}</span>` +
        `<span class="slot-lbl">${slot.label}</span><span class="spot-nm">${surname(s.playerName)}</span>`;
      // No remove control: a placed player is locked. What you pick, you keep — you spin on.
    } else {
      spot.innerHTML = `<span class="disc"><span class="disc-lbl">${slot.label}</span></span>` +
        `<span class="slot-lbl muted">${POS_FULL[slot.pos]}</span>`;
    }
    if (eligible) spot.addEventListener("click", () => placeAt(i, state.pending));
    spot.addEventListener("dragover", (e) => {
      if (dragging && !state.slots[i] && slot.pos === dragging.pos && !isDup(dragging)) {
        e.preventDefault(); spot.classList.add("drop-hot");
      }
    });
    spot.addEventListener("dragleave", () => spot.classList.remove("drop-hot"));
    spot.addEventListener("drop", (e) => {
      e.preventDefault(); spot.classList.remove("drop-hot");
      if (dragging) { placeAt(i, dragging); dragging = null; }
    });
    box.appendChild(spot);
  });

  const hint = el("place-hint");
  if (state.pending) {
    const targets = openSlotsFor(state.pending.pos).map((o) => o.s.label);
    if (sixthOpen()) targets.push("6TH");
    hint.innerHTML = `Placing <b>${surname(state.pending.playerName)}</b> — click ${targets.join(" / ")} (or drag him there).`;
  } else hint.textContent = "";
}

function sortedPool(pool) {
  let list = [...pool.players];
  if (state.posFilter !== "ALL") list = list.filter((p) => p.pos === state.posFilter);
  const key = state.sortBy;
  const val = (p) => (key === "mpg" ? (p.mpg ?? 0) : (p.box[key] ?? 0));
  list.sort((a, b) => val(b) - val(a)); // purely the chosen stat (minutes by default)
  return list;
}

function renderOffer() {
  const box = el("offer");
  if (complete()) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  // Dynasty: choose Weekly or Endless in the lobby before drafting.
  if (dynastyMode() && !state.dynSub) { renderDynastyLobby(box); return; }

  // Versus: choose a role before drafting (create a challenge, or answer a pasted code).
  if (state.mode === "versus" && !state.versusRole) { renderVersusIntro(box); return; }

  // Daily: today's ranked attempt is spent — show the locked result, not a fresh board.
  if (dailyLocked()) { renderDailyLockout(box); return; }

  if (state.spinning) {
    const f = state.rollFixed || {};
    box.innerHTML = `<div class="reel-wrap" id="reel-wrap"><div class="reel-label">Drawing…</div>` +
      `<div class="reels"><div class="reel-box${f.club ? " fixed" : ""}" id="reel-club">${f.club || "···"}</div>` +
      `<div class="reel-box year${f.year ? " fixed" : ""}" id="reel-year">${f.year || "····"}</div></div></div>`;
    return;
  }
  if (!state.offer) {
    box.innerHTML = `<p class="empty-hint">Press <b>Spin</b> to draw a club and year, then choose a player to place on the court.</p>`;
    return;
  }

  const pool = state.offer, s = clubStyle(pool.teamCode);
  const list = sortedPool(pool);
  const sortSel = SORTS.map(([v, l]) => `<option value="${v}"${state.sortBy === v ? " selected" : ""}>${l}</option>`).join("");
  const posBtns = ["ALL", "G", "F", "C"].map((p) =>
    `<button class="pos-btn${state.posFilter === p ? " on" : ""}" data-pos="${p}">${p === "ALL" ? "All" : p}</button>`).join("");

  // just after a spin, cascade the pool in and wash the panel in the club's colour
  box.classList.toggle("spun-in", state.justSpun);
  box.classList.toggle("legends", !!pool.legend);
  box.style.setProperty("--team", s.primary);

  box.innerHTML =
    (pool.legend ? `<div class="legends-banner">★ EUROPEAN LEGENDS ★</div>` : "") +
    `<div class="offer-head" style="border-color:${s.primary}">` + badge(pool.teamCode) +
      `<div><div class="club">${pool.teamName} <span class="season">${pool.seasonLabel}</span></div>` +
      `<div class="sub">${pool.players.length} players${pool.legend ? " · Estimated Stats" : ""}</div></div>` +
    `</div>` +
    `<div class="pool-tools"><label class="sort-lbl">Sort <select id="sort-sel">${sortSel}</select></label>` +
    `<div class="pos-filter">${posBtns}</div></div>` +
    `<div class="pool-grid" id="pool-grid"></div>`;

  el("sort-sel").addEventListener("change", (e) => { state.sortBy = e.target.value; render(); });
  box.querySelectorAll(".pos-btn").forEach((b) =>
    b.addEventListener("click", () => { state.posFilter = b.dataset.pos; render(); }));

  const grid = el("pool-grid");
  if (!list.length) { grid.innerHTML = `<p class="empty-hint">No ${POS_FULL[state.posFilter] || ""}s in this squad.</p>`; return; }
  list.forEach((p, idx) => {
    const dup = isDup(p), slotOpen = openSlotsFor(p.pos).length > 0;
    const ok = canPlace(p); // matching position slot open, affordable, or the bench is open
    const affordable = canAffordPick(p);
    const selected = state.pending && state.pending.playerCode === p.playerCode;
    let tag = "";
    if (dup) tag = `<span class="tag picked">PICKED</span>`;
    else if (salaryMode() && !affordable && hasRoomFor(p)) tag = `<span class="tag over">over budget</span>`;
    else if (!hasRoomFor(p)) tag = `<span class="tag full">no slot</span>`;
    else if (!slotOpen) tag = `<span class="tag bench">bench only</span>`; // position full, bench open
    const card = document.createElement("div");
    card.className = "card" + (ok ? "" : " locked") + (selected ? " selected" : "");
    card.dataset.code = p.playerCode; // lets selectPending toggle selection without a full re-render
    card.style.setProperty("--team", s.primary);
    if (state.justSpun) card.style.setProperty("--i", idx); // stagger the cascade
    if (ok) {
      card.setAttribute("draggable", "true");
      card.addEventListener("dragstart", () => { dragging = p; card.classList.add("dragging"); });
      card.addEventListener("dragend", () => { dragging = null; card.classList.remove("dragging"); });
      card.addEventListener("click", () => selectPending(p));
    }
    const priceChip = salaryMode()
      ? `<span class="price${affordable ? "" : " over"}">${formatMoney(priceOf(p))}</span>` : "";
    card.innerHTML =
      `<div class="card-top">${avatar(p, pool.teamCode)}` +
        `<div class="who"><div class="name">${prettyName(p.playerName)}</div>` +
        `<div class="sub"><span class="pos">${POS_FULL[p.pos]}</span> · ${p.mpg.toFixed(0)} mpg</div></div>` +
        priceChip +
        `<span class="posbadge">${p.pos}</span></div>` +
      `<div class="line">${boxLine(p)}</div>` + tag;
    grid.appendChild(card);
  });
}

// Endgame, in the left (players) area. Two steps before the record is revealed:
//   1) spin for your home arena   2) pick your coach   -> Play the season.
function renderCommit() {
  const box = el("commit");
  if (!complete() || state.revealed) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  // Step 1 — spin the arena
  if (!state.arenaSpun) {
    if (state.arenaRolling) {
      box.innerHTML = `<div class="commit-inner"><h3>Finding your home floor…</h3>` +
        `<div class="reels"><div class="reel-box arena" id="arena-reel">···</div></div></div>`;
    } else {
      // show the candidate buildings first, then spin among them
      const list = arenaChoices().map((i) => {
        const s = state.slots[i], a = arenaFor(s._src.teamCode, s.season);
        return `<li>${badge(s._src.teamCode)} <b>${a.name}</b> <span class="muted">${s._src.seasonLabel}` +
          ` · <span class="flames">${arenaFlames(a.rating)}</span></span></li>`;
      }).join("");
      box.innerHTML = `<div class="commit-inner"><h3>Your five is set</h3>` +
        `<p>Spin for your <b>home arena</b> — one of the buildings your players called home:</p>` +
        `<ul class="arena-list">${list}</ul>` +
        `<button id="arena-spin-btn" class="spin-btn">Spin the arena</button></div>`;
      el("arena-spin-btn").addEventListener("click", spinArena);
    }
    return;
  }

  // The won arena, revealed big in the players' area before we move on to the coach.
  if (state.arenaRevealing) {
    const cur = chosenArena();
    const st = clubStyle(state.slots[state.arenaSlot]._src.teamCode);
    box.innerHTML = `<div class="commit-inner arena-reveal"><div class="ar-reveal-head">Your home floor</div>` +
      `<div class="ar-reveal-art">${arenaSVG(st.primary, st.secondary, cur.rating, cur.cap)}</div>` +
      `<div class="ar-reveal-name">${cur.name} <span class="flames">${arenaFlames(cur.rating)}</span></div></div>`;
    return;
  }

  // Dynasty has no coach step — once the home arena is set the gauntlet begins (in the result-card).
  if (dynastyMode()) {
    if (!inGauntlet()) startGauntlet();
    box.classList.add("hidden");
    return;
  }

  // Step 2 — pick the coach (moved here, into the players' area). "No coach" is not an option;
  // when coaches are available we default to the best-fit (the one who had most of your five),
  // and the player can switch to any other.
  const opts = coachOptions();
  if (opts.length && !state.coachName) state.coachName = opts[0].coach.name;
  const card = (name, arch) => {
    const sel = (state.coachName || "") === name;
    return `<button class="coach-card${sel ? " sel" : ""}" data-coach="${name}">` +
      `<div class="cc-name">${prettyName(name)}</div>` +
      `<div class="cc-arch">${arch}</div></button>`;
  };
  // The exact category deltas are hidden by design — you pick a coach on his identity
  // (archetype) and fit (how many of your five he had), read against your category bars, not by
  // reading off "+4.0 defense". The pedigree tier still shows as a badge.
  const cards = opts.map((e) => {
    const ped = pedigreeLabel(e.coach);
    const pedTag = ped ? `<span class="cc-ped">${ped}</span>` : "";
    return card(e.coach.name, `${archetypeLabel(e.coach)}${pedTag} · Coached ${e.count} of your 6`);
  }).join("");

  const playLabel = state.mode === "versus"
    ? (state.versusRole === "create" ? "Mint challenge code" : "Play the duel")
    : "Play the season";
  box.innerHTML = `<div class="commit-inner"><h3>Pick your coach</h3>` +
    (opts.length
      ? `<div class="coach-cards">${cards}</div>`
      : `<p>No coach on record managed any of your five.</p>`) +
    `<button id="play-btn" class="spin-btn">${playLabel}</button></div>`;
  box.querySelectorAll(".coach-card").forEach((b) =>
    b.addEventListener("click", () => { state.coachName = b.dataset.coach || null; render(); }));
  el("play-btn").addEventListener("click", () => {
    state.revealed = true;
    if (state.mode === "daily" && !state.dailyPractice) saveDailyResult();
    else if (state.mode === "versus") {
      state.versusResult = state.versusRole === "create" ? { code: makeChallengeCode() } : runDuel();
      render();
      return;
    }
    startReveal();
  });
}

// Persist the finished daily (record, stage, category grid) and update the streak.
function saveDailyResult() {
  const res = projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth);
  const post = runPostseason(state.slots, state.data.seasons, state.pools, res.wins, state.sixth);
  const result = {
    wins: res.wins, losses: res.losses, stage: post.stage, label: post.label,
    categoryScores: res.categoryScores,
  };
  const already = loadDaily(state.dailyDayKey);
  state.dailyStreak = already ? currentStreak() : saveDaily(result, state.dailyDayKey);
  // Capture the CHOICES (not the score) for the leaderboard — the server re-simulates them.
  state.dailySubmission = buildDailySubmission();
  state.dailySubmitted = false;
}

// The compact, verifiable record of what you drafted: which of the six draws each pick came from
// and which player, plus the chosen coach. The server rebuilds the board and re-runs the engine.
function buildDailySubmission() {
  const drawOf = (pl) => state.dailyBoard.findIndex((pool) =>
    pool.teamCode === pl._src.teamCode && pool.players.some((p) => p.playerCode === pl.playerCode));
  const starters = state.slots.map((s) => ({ slot: drawOf(s), code: s.playerCode })); // court order
  const sixth = { slot: drawOf(state.sixth), code: state.sixth.playerCode };
  const co = chosenCoach();
  return { dayKey: state.dailyDayKey, starters, sixth, coach: co ? co.coach.code : null };
}

/* ---------------- Daily leaderboard ---------------- */

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Mount the leaderboard into the lockout recap: a one-time name prompt, then the standings.
// Every failure is soft — a missing/undeployed backend just shows "offline", never breaks daily.
async function mountLeaderboard() {
  const box = el("leaderboard");
  if (!box) return;
  const id = getIdentity();
  if (!id || !id.name) { box.innerHTML = nameFormHTML(); wireNameForm(box); return; }

  box.innerHTML = `<div class="lb-head">Today's leaderboard</div><div class="lb-load">Loading…</div>`;
  try {
    if (state.dailySubmission && !state.dailySubmitted) {
      await submitDaily({ ...state.dailySubmission, name: id.name, uid: id.uid });
      state.dailySubmitted = true;
    }
    const data = await fetchLeaderboard(state.dailyDayKey, id.uid);
    box.innerHTML = leaderboardHTML(data, id);
    const change = el("lb-change-name");
    if (change) change.addEventListener("click", (e) => {
      e.preventDefault(); box.innerHTML = nameFormHTML(id.name); wireNameForm(box);
    });
  } catch (e) {
    box.innerHTML = `<div class="lb-head">Today's leaderboard</div>` +
      `<div class="lb-off">Leaderboard is offline. Deploy the backend to enable it.</div>`;
  }
}

function nameFormHTML(current = "") {
  return `<div class="lb-head">Join the leaderboard</div>` +
    `<p class="lb-note">Pick a display name — no sign-up. It's saved on this device.</p>` +
    `<div class="lb-name"><input id="lb-name-input" type="text" maxlength="20" placeholder="Your name" ` +
      `value="${escapeHTML(current)}" autocomplete="off" spellcheck="false" />` +
      `<button id="lb-name-save" class="mini-btn">Save & post</button></div>`;
}

function wireNameForm(box) {
  const input = el("lb-name-input"), save = el("lb-name-save");
  const commit = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    saveName(v);
    mountLeaderboard();
  };
  if (save) save.addEventListener("click", commit);
  if (input) {
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    input.focus({ preventScroll: true }); // put the cursor in the field so the action is obvious
  }
}

function leaderboardHTML(data, id) {
  const you = data.you;
  const rows = (data.top || []).map((r) => {
    const mine = you && r.name === you.name && r.rank === you.rank;
    return `<tr class="${mine ? "me" : ""}"><td class="lb-rank">${r.rank}</td>` +
      `<td class="lb-name-cell">${escapeHTML(r.name)}</td>` +
      `<td class="lb-rec">${r.wins}–${r.losses}</td><td class="lb-stage">${escapeHTML(r.label || "")}</td></tr>`;
  }).join("");
  const total = data.total || 0;
  const youLine = you
    ? `<div class="lb-you">You: <b>#${you.rank}</b> of ${total} · ${you.wins}–${you.losses}` +
      ` · <a href="#" id="lb-change-name" class="dl-link">change name</a></div>`
    : `<div class="lb-you"><a href="#" id="lb-change-name" class="dl-link">Set a name to post</a></div>`;
  return `<div class="lb-head">Today's leaderboard <span class="lb-count">${total} played</span></div>` +
    (rows ? `<table class="lb-table"><tbody>${rows}</tbody></table>` : `<div class="lb-off">Be the first to post today.</div>`) +
    youLine;
}

// Auto-advance the end-of-season reveal: regular season → each bracket round in turn, then the
// verdict. revealStage counts how many rounds are shown; it exceeds rounds.length for the verdict.
function startReveal() {
  state.revealStage = 0;
  render();
  const post = runPostseason(state.slots, state.data.seasons, state.pools,
    projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth).wins, state.sixth);
  // Reveal order: record (stage 0) → seeding (stage 1) → each round in turn → verdict. The extra
  // +1 step is the seeding, so a bracket with N rounds has N+1 reveal steps.
  const total = post.rounds.length ? post.rounds.length + 1 : 0;
  clearInterval(revealTimer);
  revealTimer = setInterval(() => {
    state.revealStage++;
    render();
    if (state.revealStage > total) clearInterval(revealTimer);
  }, 1050);
}

// The category bars GROW as you draft (each shows the running total, so they ADD UP toward the
// finished five's aggregate). Two shaping choices:
//  - each category is divided by ITS OWN typical (`CAT_TYPICAL`), so a typical playmaking (~2.2)
//    fills the same as a typical rebounding (~4.6) instead of looking permanently half-empty;
//  - a convex build curve (`BAR_CURVE` > 1) means one player — even a star whose single-category
//    score can rival a whole five — only nudges the bar; it fills in as the picks stack up, rather
//    than jumping to the end on the first pick.
// Single on-brand orange; the weakest link is called out by its highlighted label.
const CAT_SPAN = 2.2;   // a category at ~this× its typical level fills the half-bar
const BAR_CURVE = 1.35; // >1 → early/small totals barely move the bar (gradual build-up)
function catBarGeom(score, k) {
  const ratio = Math.min(1, Math.abs(score) / (CAT_TYPICAL[k] * CAT_SPAN));
  const width = 50 * Math.pow(ratio, BAR_CURVE);
  return { left: score >= 0 ? 50 : 50 - width, width };
}
function catBarsHTML(res) {
  const gateCat = res ? res.gateCategory : null;
  return CATEGORIES.map((k) => {
    const g = catBarGeom(res ? res.categoryScores[k] : 0, k);
    return `<div class="cat-row${k === gateCat ? " isgate" : ""}"><span class="lbl">${k}</span>` +
      `<div class="cat-track"><div class="cat-fill" style="left:${g.left}%; width:${g.width}%"></div></div></div>`;
  }).join("");
}

// Update the drafting bars IN PLACE (don't rebuild the DOM), so the CSS transition animates each
// change smoothly instead of snapping — the elements persist between picks and only their
// width/position move.
function updateCatBars(container, res) {
  const gateCat = res ? res.gateCategory : null;
  if (container.dataset.built !== "1") {
    container.innerHTML = CATEGORIES.map((k) =>
      `<div class="cat-row" data-cat="${k}"><span class="lbl">${k}</span>` +
      `<div class="cat-track"><div class="cat-fill"></div></div></div>`).join("");
    container.dataset.built = "1";
  }
  for (const k of CATEGORIES) {
    const row = container.querySelector(`.cat-row[data-cat="${k}"]`);
    const fill = row.querySelector(".cat-fill");
    const g = catBarGeom(res ? res.categoryScores[k] : 0, k);
    fill.style.left = g.left + "%";
    fill.style.width = g.width + "%";
    row.classList.toggle("isgate", k === gateCat);
  }
}

function renderCats() {
  // On the final screen the balance lives inside the record card instead (see renderResult).
  const wrap = el("sidebar-cats");
  if (complete() && state.revealed) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const picks = filled();
  const res = picks.length ? projectRecord(picks, state.data.seasons, undefined, 1, coachCatDeltas(), state.sixth) : null;
  updateCatBars(el("cat-bars"), res);
  el("gate-note").textContent = res && picks.length >= 2 ? `Weakest link: ${res.gateCategory}` : "";
}

// The summary list, revealed one step at a time: seeding first (shown ≥ 1), then each round.
function renderRounds(post, res, shown) {
  if (shown < 1) return "";
  const seed = seedFor(res.wins);
  const entryNote = res.wins >= 24 ? "Straight into the playoffs"
    : res.wins >= 20 ? "Into the play-in" : "Missed the postseason";
  const seedLine =
    `<div class="round seed pop"><span class="rname">Seed</span>` +
    `<span class="rbody">${seed ? ordinal(seed) + " seed" : "—"} · ${entryNote}</span></div>`;
  const rounds = post.rounds.slice(0, Math.max(0, shown - 1)).map((r) => {
    const verb = r.win ? "beat" : "lost to";
    const score = r.series ? r.series : `${r.us}–${r.them}`;
    return `<div class="round ${r.win ? "won" : "out"} pop">` +
      `<span class="rname">${r.name}</span>` +
      `<span class="rbody">${verb} <b>${clubStyle(r.opp.teamCode).abbr} ${r.opp.seasonLabel}</b> ` +
      `<span class="rscore">${score}</span></span></div>`;
  }).join("");
  return `<div class="rounds">${seedLine}${rounds}</div>`;
}

// Where a record slots you in the standings (flavour, deterministic from wins): 1–6 go straight to
// the playoffs, 7–10 into the play-in. Mirrors the cutoffs in postseason.js.
function seedFor(wins) {
  if (wins >= 24) return Math.max(1, Math.min(6, 1 + Math.round((34 - wins) / 2))); // 34+→1 … 24-25→6
  if (wins >= 20) return Math.min(10, 30 - wins); // 23→7, 22→8, 21→9, 20→10
  return null; // missed the postseason
}
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - n % 10 === 10) ? 0 : n % 10] || "th");

// The REAL bracket view: an entry node (your seed / finish) then each tie as a two-sided matchup
// with both scores, the winner highlighted. Same `shown` reveal as the summary list.
function renderBracket(post, res, shown) {
  const seed = seedFor(res.wins);
  const entryNote = res.wins >= 24 ? "Straight into the playoffs"
    : res.wins >= 20 ? "Into the play-in" : "Missed the postseason";
  // shown: 0 = nothing yet, 1 = seeding, 2 = +round 1, … (record is revealed separately, above).
  const entry = shown >= 1
    ? `<div class="bk-entry pop">` +
        (seed ? `<span class="bk-seed">${ordinal(seed)} seed</span>` : `<span class="bk-seed miss">—</span>`) +
        `<span class="bk-entry-note">${entryNote}</span>` +
      `</div>`
    : "";

  const rounds = post.rounds.slice(0, Math.max(0, shown - 1)).map((r) => {
    const tally = r.series ? r.series.split(/[^\d]+/) : null; // "3–1" → ["3","1"], dash-agnostic
    const you = tally ? tally[0] : r.us;
    const opp = tally ? tally[1] : r.them;
    const kind = r.series ? "Best-of-5" : "";
    const club = `${clubStyle(r.opp.teamCode).abbr} ${r.opp.seasonLabel}`;
    return `<div class="bk-tie ${r.win ? "won" : "out"} pop">` +
      `<div class="bk-tie-head"><span class="bk-rname">${r.name}</span>` +
        (kind ? `<span class="bk-kind">${kind}</span>` : "") + `</div>` +
      `<div class="bk-match">` +
        `<div class="bk-side ${r.win ? "adv" : "eliminated"}"><span class="bk-team">You</span><span class="bk-sc">${you}</span></div>` +
        `<div class="bk-side ${r.win ? "eliminated" : "adv"}"><span class="bk-team">${club}</span><span class="bk-sc">${opp}</span></div>` +
      `</div></div>`;
  }).join("");

  return `<div class="bracket">${entry}${rounds}</div>`;
}

// Left panel after the reveal: ONLY the record, the stage and the bracket, revealed in stages.
// A small player chip: club-coloured disc + surname + position.
function dynChip(p, teamCode) {
  return `<span class="dyn-chip">${avatar(p, teamCode, "avatar sm")}` +
    `<span class="dyn-chip-nm">${surname(p.playerName)}</span>` +
    `<span class="dyn-chip-pos">${p.pos}</span></span>`;
}
// A full stat row (name · position · box line) so recruit decisions aren't blind. `el` = "button"
// makes it selectable; otherwise a plain div (for the "coming in" highlight).
function dynStatRow(p, teamCode, { as = "div", cls = "", attrs = "", from = "" } = {}) {
  const tag = as === "button" ? "button" : "div";
  return `<${tag} class="dyn-prow ${cls}" ${attrs}>` +
    `${avatar(p, teamCode, "avatar sm")}` +
    `<span class="dyn-prow-id"><span class="dyn-prow-nm">${surname(p.playerName)}</span>` +
      `<span class="dyn-prow-pos">${POS_FULL[p.pos] || p.pos}${from ? ` · ${from}` : ""}</span></span>` +
    `<span class="dyn-prow-box">${boxLine(p)}</span>` +
  `</${tag}>`;
}

const dynHeader = (d, note) =>
  `<div class="dyn-head"><div class="dyn-streak">🔥 <b>${d.streak}</b> <span>streak</span></div>` +
    `<div class="dyn-round">${note}</div></div>`;

// Full-court spots: your five fill the bottom half (basket at the bottom), the opponent's the top
// half (basket at the top) — the half-court SLOTS mirrored into each end.
const DYN_YOU = SLOTS.map((s) => ({ x: s.x, y: 100 - s.y * 0.5 }));
const DYN_OPP = SLOTS.map((s) => ({ x: s.x, y: s.y * 0.5 })); // same formation, mirrored to the top
function dynDisc(p, teamCode, slot) {
  const st = clubStyle(teamCode);
  return `<div class="dyn-spot" style="left:${slot.x}%;top:${slot.y}%">` +
    `<span class="disc" style="background:${st.primary};color:${textOn(st.primary)};box-shadow:inset 0 0 0 2px ${st.secondary}">${monogram(p.playerName)}</span>` +
    `<span class="dyn-spot-nm">${surname(p.playerName)}</span></div>`;
}
const DYN_COURT_SVG =
  `<svg class="dyn-court-svg" viewBox="0 0 300 480" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect class="c-floor" x="4" y="4" width="292" height="472" rx="8"/>` +
    // opponent end (top)
    `<rect class="c-line" x="110" y="4" width="80" height="118" fill="none"/>` +
    `<circle class="c-line" cx="150" cy="122" r="30" fill="none"/>` +
    `<line class="c-line" x1="132" y1="16" x2="168" y2="16"/><circle class="c-line" cx="150" cy="24" r="7" fill="none"/>` +
    // your end (bottom)
    `<rect class="c-line" x="110" y="358" width="80" height="118" fill="none"/>` +
    `<circle class="c-line" cx="150" cy="358" r="30" fill="none"/>` +
    `<line class="c-line" x1="132" y1="464" x2="168" y2="464"/><circle class="c-line" cx="150" cy="456" r="7" fill="none"/>` +
    // half-court line + centre circle
    `<line class="c-line" x1="4" y1="240" x2="296" y2="240"/><circle class="c-line" cx="150" cy="240" r="34" fill="none"/>` +
  `</svg>`;
// The matchup court: your five bottom, opponent's five top, the whole floor tinted the HOME club's
// colour (you at home, them away). The score simulates ABOVE it.
// `tinted` controls the home-club colour wash — off during the home/away spin, then animated in (CSS
// transition) once the result lands. The opponent's name/logo is NOT on the court (it sits above it).
function dynastyCourtHTML(d, tinted) {
  const opp = d.opp;
  const homeCode = d.home ? (d.arena && d.arena.teamCode) : opp.teamCode;
  const tint = homeCode ? clubStyle(homeCode) : null;
  // Order BOTH fives to the court slots [G,G,F,F,C] so the centre sits under the rim and the guards
  // out on the perimeter (opp.five arrives in greedy-pick order, not position order).
  const oppDiscs = orderFive(opp.five).map((p, i) => dynDisc(p, opp.teamCode, DYN_OPP[i])).join("");
  const youDiscs = state.slots.map((p, i) => dynDisc(p, p._src.teamCode, DYN_YOU[i])).join("");
  return `<div class="dyn-court${tinted ? " tinted" : ""}"${tint ? ` style="--tint:${tint.primary}"` : ""}>` +
    DYN_COURT_SVG +
    `<div class="dyn-court-tint"></div><div class="dyn-court-mark">${tint ? tint.abbr : ""}</div>` +
    oppDiscs + youDiscs +
  `</div>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// After a run ends: post it to the all-time board (server re-simulates the streak) and show the
// standings. No name yet → a small join form. Offline → the run still shows, board just says so.
const dynBoardTitle = (board) => (board === "alltime" ? "👑 All-time streaks" : `🗓 This week · ${board}`);

// Post the finished run to its board ONCE (the server re-simulates the streak), caching the result so
// toggling between the summary and the leaderboard doesn't re-post.
function ensureDynSubmit() {
  const d = state.dynasty;
  if (!d || d.submitted || d.submitting || d.streak === 0) return;
  const id = getIdentity();
  if (!id || !id.name) return;            // needs a name — the leaderboard view prompts for one
  d.submitting = true;
  postDynastyRun(d.board)
    .then((data) => { d.boardData = data; d.submitted = true; })
    .catch(() => { d.boardErr = true; })
    .finally(() => { d.submitting = false; if (state.dynasty === d && d.phase === "over" && d.overView === "board") render(); });
}

// The leaderboard VIEW of the over screen (shown when the toggle is on "board").
function renderDynBoardView(box) {
  const d = state.dynasty;
  const title = dynBoardTitle(d.board);
  if (d.streak === 0) { loadDynBoard(box, d.board); return; }   // read-only standings; nothing to post
  const id = getIdentity();
  if (!id || !id.name) { renderDynNameEntry(box, title); return; }
  if (d.boardData) { renderDynBoard(box, d.boardData, title); return; }
  if (d.boardErr) { box.innerHTML = `<div class="dyn-lb-status off">Leaderboard offline — your streak: 🔥 ${d.streak}</div>`; return; }
  box.innerHTML = `<div class="dyn-lb-status">Posting your run…</div>`;
  ensureDynSubmit();
}

function renderDynNameEntry(box, title) {
  box.innerHTML =
    `<div class="dyn-lb-head">${title || "👑 All-time streaks"}</div>` +
    `<div class="dyn-lb-join"><input id="dyn-name" class="dyn-name-input" maxlength="20" placeholder="Enter a name to join" />` +
      `<button id="dyn-join" class="mini-btn">Join</button></div>`;
  const input = el("dyn-name"), join = el("dyn-join");
  if (input) input.focus();
  const go = () => { const n = input.value.trim(); if (!n) return; saveName(n); render(); };
  if (join) join.addEventListener("click", go);
  if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function postDynastyRun(board) {
  const d = state.dynasty, id = getIdentity();
  return submitDynasty({
    board, name: id.name, uid: id.uid,
    seed: d.seed, startFive: d.startFive,
    arena: d.arena ? { teamCode: d.arena.teamCode, season: d.arena.season } : null,
    choices: d.choices,
  });
}

function renderDynBoard(box, data, title) {
  const rows = (data.top || []).map((r) =>
    `<li class="${data.you && r.rank === data.you.rank ? "me" : ""}"><span class="lb-rank">${r.rank}</span>` +
    `<span class="lb-name">${esc(r.name)}</span><span class="lb-streak">🔥 ${r.streak}</span></li>`).join("");
  box.innerHTML =
    `<div class="dyn-lb-head">${title || "👑 All-time streaks"}</div>` +
    (rows ? `<ol class="dyn-lb-list">${rows}</ol>` : `<div class="dyn-lb-status">Be the first to post a streak.</div>`) +
    (data.you ? `<div class="dyn-lb-you">You're <b>#${data.you.rank}</b> of ${data.total} · best <b>🔥 ${data.you.streak}</b></div>` : "");
}

// Fetch + render a board into a container (read-only), with graceful offline handling.
async function loadDynBoard(container, board) {
  const id = getIdentity();
  container.innerHTML = `<div class="dyn-lb-status">Loading…</div>`;
  try { renderDynBoard(container, await fetchDynastyBoard(board, id && id.uid), dynBoardTitle(board)); }
  catch (e) { container.innerHTML = `<div class="dyn-lb-status off">Leaderboard offline.</div>`; }
}

// The Dynasty lobby: choose the Weekly shared challenge or an Endless run, with this week's standings.
function renderDynastyLobby(box) {
  const wk = weekKey();
  const played = loadWeekly(wk);
  box.innerHTML =
    `<div class="dyn-lobby">` +
      `<div class="dyn-lobby-card weekly">` +
        `<div class="dlc-tag">🗓 Weekly Challenge</div>` +
        `<h3>The same gauntlet for everyone</h3>` +
        `<p>Draft from this week's fixed board, then survive the shared gauntlet. One ranked run — compare your streak worldwide.</p>` +
        (played
          ? `<div class="dlc-done">Played this week — 🔥 <b>${played.streak}</b>. New board Monday.</div>`
          : `<button id="dyn-weekly-go" class="play-btn">Play this week</button>`) +
      `</div>` +
      `<div class="dyn-lobby-card endless">` +
        `<div class="dlc-tag">♾️ Endless Run</div>` +
        `<h3>Draft your own five</h3>` +
        `<p>Free draft, a fresh random gauntlet each time. Chase your all-time best streak.</p>` +
        `<button id="dyn-endless-go" class="play-btn">Start a run</button>` +
      `</div>` +
    `</div>` +
    `<div class="dyn-lb" id="dyn-lobby-lb"></div>`;
  const wg = el("dyn-weekly-go"); if (wg) wg.addEventListener("click", () => enterDynastySub("weekly"));
  const eg = el("dyn-endless-go"); if (eg) eg.addEventListener("click", () => enterDynastySub("endless"));
  loadDynBoard(el("dyn-lobby-lb"), wk); // this week's standings, front and centre
}

function renderDynasty(card) {
  const d = state.dynasty;
  const opp = d.opp;
  const oppName = `${badge(opp.teamCode)} <b>${prettyName(opp.teamName)}</b> <span class="muted">${opp.seasonLabel}</span>`;

  // ---- (1) spinning up the next challenger ----
  if (d.phase === "spinTeam") {
    card.innerHTML =
      dynHeader(d, `Round ${d.round}`) +
      `<div class="dyn-spin">` +
        `<div class="dyn-spin-cap">Drawing your next challenger…</div>` +
        `<div class="reels dyn-reels"><div class="reel-box" id="dyn-reel-club">···</div>` +
          `<div class="reel-box year" id="dyn-reel-year">····</div></div>` +
      `</div>`;
    return;
  }

  // ---- (2)+(3) the five take the court, then home/away spins (court untinted until it lands) ----
  if (d.phase === "spinLoc") {
    card.innerHTML =
      dynHeader(d, `Round ${d.round}`) +
      `<div class="dyn-loc-spin"><span class="dyn-loc-cap">Home or away —</span> ` +
        `<span class="dyn-loc-reel" id="dyn-loc-reel">· · ·</span></div>` +
      `<div class="dyn-abovecourt">${badge(opp.teamCode)} ${prettyName(opp.teamName)} <span class="muted">${opp.seasonLabel}</span></div>` +
      dynastyCourtHTML(d, false);
    return;
  }

  // ---- playing: the score simulates ABOVE the split court, quarter by quarter ----
  if (d.phase === "playing") {
    card.innerHTML =
      dynHeader(d, `Round ${d.round}`) +
      `<div class="dyn-scoreboard" id="dyn-scoreboard">` +
        `<div class="dsb-side"><div class="dsb-team">Your five</div><div class="dsb-score" id="dyn-score-mine">0</div></div>` +
        `<div class="dsb-mid"><div class="dsb-q" id="dyn-score-q">Q1</div></div>` +
        `<div class="dsb-side"><div class="dsb-team">${badge(opp.teamCode)} ${clubStyle(opp.teamCode).abbr}</div><div class="dsb-score" id="dyn-score-theirs">0</div></div>` +
      `</div>` +
      dynastyCourtHTML(d, true);
    return;
  }

  // ---- the run ended: streak + the same weakest-link readout Classic gives ----
  if (d.phase === "over") {
    if (!d.overView) d.overView = "summary";
    if (d.sub === "weekly" && !d.savedWeekly) { saveWeekly(d.board, d.streak); d.savedWeekly = true; } // lock the week's attempt
    ensureDynSubmit(); // record the run even if they never open the leaderboard
    const onBoard = d.overView === "board";
    const toggle = `<button id="dyn-view-toggle" class="dyn-view-toggle">${onBoard ? "← My run" : "🏆 Leaderboard"}</button>`;
    const again = `<button id="dyn-again" class="play-btn">${d.sub === "weekly" ? "← Dynasty lobby" : "↻ New dynasty"}</button>`;
    if (onBoard) {
      card.innerHTML = `<div class="dyn-over">${toggle}<div class="dyn-lb" id="dyn-lb"></div>${again}</div>`;
      renderDynBoardView(el("dyn-lb"));
    } else {
      const lg = d.lastGame;
      const res = projectRecord(state.slots, state.data.seasons, undefined, 1, null, null);
      card.innerHTML =
        `<div class="dyn-over">${toggle}` +
          `<div class="dyn-over-label">Run over</div>` +
          `<div class="dyn-streak-big">🔥 ${d.streak}</div>` +
          `<div class="dyn-streak-cap">win streak</div>` +
          `<div class="dyn-scoreline loss">Lost ${lg.theirs}–${lg.mine} · fell to ${oppName}</div>` +
          `<div class="result-cats-wrap"><div class="rc-head">Where your dynasty ended up</div>` +
            `<div class="result-cats">${catBarsHTML(res)}</div>` +
            `<div class="rc-gate">${GATE_PHRASE[res.gateCategory] || ""}</div>` +
          `</div>` +
          (d.streak > 0 ? `<button id="dyn-share-card" class="ghost-btn dl-lb-btn">📋 Copy run card</button>` : "") +
          again +
        `</div>`;
    }
    el("dyn-view-toggle").addEventListener("click", () => { d.overView = onBoard ? "summary" : "board"; render(); });
    el("dyn-again").addEventListener("click", () => { if (d.sub === "weekly") state.dynSub = null; reset(); });
    const sc = el("dyn-share-card"); if (sc) sc.addEventListener("click", () => copyDynastyShareCard(sc));
    return;
  }

  // ---- recruit STEP 1: pick one of their players (with full stats) ----
  if (d.phase === "recruit" && d.recruitStep === "in") {
    const lg = d.lastGame;
    // the vanquished five, listed by position — guards, then forwards, then the centre
    const inOrder = [...opp.five].sort((a, b) => (POS_ORDER[a.pos] - POS_ORDER[b.pos]) || ((b.mpg ?? 0) - (a.mpg ?? 0)));
    const rows = inOrder.map((p) => {
      const owned = d.squad.some((s) => s.playerCode === p.playerCode);
      return dynStatRow(p, opp.teamCode, { as: "button", cls: owned ? "owned" : "", attrs: `data-in="${p.playerCode}" ${owned ? "disabled title='Already yours'" : ""}` });
    }).join("");
    card.innerHTML =
      dynHeader(d, `Round ${d.round} won`) +
      `<div class="dyn-scoreline win">Beat ${oppName} ${lg.mine}–${lg.theirs}</div>` +
      `<h3 class="dyn-loot">Pick 1 player</h3>` +
      `<p class="dyn-sub">Recruit one from ${prettyName(opp.teamName)} — you'll choose who to release next.</p>` +
      `<div class="dyn-plist">${rows}</div>`;
    card.querySelectorAll("[data-in]").forEach((b) =>
      b.addEventListener("click", () => { d.pickIn = b.dataset.in; d.pickOut = null; d.recruitStep = "out"; render(); }));
    return;
  }

  // ---- recruit STEP 2: choose who to release — only the SAME-position players, so it fits on one
  //      screen with the incoming player's stats and the actions (no scrolling). ----
  if (d.phase === "recruit" && d.recruitStep === "out") {
    const incoming = opp.five.find((p) => p.playerCode === d.pickIn);
    const cands = d.squad.map((p, i) => ({ p, i })).filter(({ i }) => canSwap(d.squad, incoming, i));
    const rows = cands.map(({ p, i }) =>
      dynStatRow(p, p._src.teamCode, { as: "button", cls: "out" + (d.pickOut === i ? " sel" : ""), attrs: `data-out="${i}"`, from: `${clubStyle(p._src.teamCode).abbr} ${p._src.seasonLabel}` })
    ).join("");
    const ready = d.pickOut != null && canSwap(d.squad, incoming, d.pickOut);
    card.innerHTML =
      dynHeader(d, `Round ${d.round} won`) +
      `<div class="dyn-incoming"><span class="dyn-in-tag">Coming in</span>` +
        dynStatRow(incoming, opp.teamCode, { cls: "in", from: `${clubStyle(opp.teamCode).abbr} ${opp.seasonLabel}` }) + `</div>` +
      `<h3 class="dyn-loot">Release a ${POS_FULL[incoming.pos] || incoming.pos}</h3>` +
      `<div class="dyn-plist">${rows}</div>` +
      `<div class="dyn-actions"><button id="dyn-back" class="mini-btn">← Change pick</button>` +
        `<button id="dyn-confirm" class="play-btn" ${ready ? "" : "disabled"}>Confirm swap</button></div>`;
    card.querySelectorAll("[data-out]").forEach((b) =>
      b.addEventListener("click", () => { d.pickOut = Number(b.dataset.out); render(); }));
    el("dyn-back").addEventListener("click", () => { d.recruitStep = "in"; d.pickOut = null; render(); });
    el("dyn-confirm").addEventListener("click", confirmRecruit);
    return;
  }

  // ---- the next matchup: the split court (your five vs theirs), home/away tint ----
  card.innerHTML =
    dynHeader(d, `Round ${d.round}`) +
    `<div class="dyn-loc ${d.home ? "home" : "away"}">${d.home ? "🏠 Home — " + (d.arena ? d.arena.name : "your floor") : "✈️ Away — " + opp.arenaName}</div>` +
    `<div class="dyn-abovecourt">${badge(opp.teamCode)} ${prettyName(opp.teamName)} <span class="muted">${opp.seasonLabel}</span></div>` +
    dynastyCourtHTML(d, true) +
    `<div class="dyn-play-wrap"><button id="dyn-play" class="play-btn">▶ Play the game</button></div>`;
  el("dyn-play").addEventListener("click", playGauntletGame);
}

function renderResult() {
  const card = el("result-card");
  if (inGauntlet()) { card.classList.remove("hidden"); renderDynasty(card); return; }
  if (!complete() || !state.revealed) { card.classList.add("hidden"); return; }
  if (state.mode === "versus") { renderVersusResult(card); return; }
  const res = projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth);
  const perfect = res.wins === GAMES;
  const post = runPostseason(state.slots, state.data.seasons, state.pools, res.wins, state.sixth);
  const total = post.rounds.length ? post.rounds.length + 1 : 0; // +1 = the seeding step
  const done = state.revealStage > total; // all rounds shown -> reveal the verdict + brag
  card.classList.remove("hidden");
  // A copy-able result on EVERY mode. Daily keeps its dated/streak card + leaderboard link; Classic
  // and Salary get a generic one. (Versus has its own result screen and never reaches here.)
  const shareBox = (txt) =>
    `<div class="share-box"><pre class="share-pre" id="share-pre">${txt}</pre>` +
    `<button id="share-btn" class="mini-btn">Copy result</button></div>`;
  let shareBlock = "";
  if (done && state.mode === "daily") {
    shareBlock = (state.dailyPractice ? `<p class="dl-practice-note">Practice run — not counted.</p>` : "") +
      shareBox(shareText({
        dayKey: state.dailyDayKey, wins: res.wins, losses: res.losses,
        label: post.label, stage: post.stage, categoryScores: res.categoryScores,
        streak: state.dailyStreak,
      })) +
      (state.dailyPractice ? "" : `<button id="dl-leaderboard-btn" class="ghost-btn dl-lb-btn">See today's leaderboard →</button>`) +
      // Daily default share stays spoiler-free (the text above); the image reveals the five, so it's
      // opt-in — for flexing after friends have played.
      `<button id="image-btn" class="ghost-btn dl-lb-btn">📋 Copy full card (image)</button>`;
  } else if (done) {
    const icon = STAGE_ICON[post.stage] ? " " + STAGE_ICON[post.stage] : "";
    const cap = salaryMode() ? ` · ${formatMoney(salarySpent())}` : "";
    const modeLabel = salaryMode() ? "Salary Cap" : "Classic";
    const weak = post.stage === "champion" ? "" : `\nWeak link: ${weakestLink(res.categoryScores)}`;
    const txt = `👑 King of Europe — ${modeLabel}\n${res.wins}–${res.losses} · ${post.label}${icon}${cap}${weak}\n🔗 king-of-europe.pages.dev`;
    // The record/stage/weak-link are already shown above, so no visible text preview — just the
    // copy actions (the share string lives in a hidden <pre> the Copy button reads).
    shareBlock =
      `<button id="play-again" class="play-btn">↻ Play again</button>` +
      `<div class="share-box"><pre class="share-pre" id="share-pre" hidden>${txt}</pre>` +
        `<button id="share-btn" class="mini-btn">Copy result</button>` +
        `<button id="image-btn" class="ghost-btn dl-lb-btn">📋 Copy image</button></div>`;
  }
  const postseasonBlock = post.rounds.length
    ? `<div class="view-toggle">` +
        `<button class="vt-btn${state.resultView === "bracket" ? " on" : ""}" data-view="bracket">Bracket</button>` +
        `<button class="vt-btn${state.resultView === "summary" ? " on" : ""}" data-view="summary">Summary</button>` +
      `</div>` +
      (state.resultView === "summary"
        ? renderRounds(post, res, state.revealStage)
        : renderBracket(post, res, state.revealStage))
    : "";
  card.innerHTML =
    `<div class="reg-label">Regular season</div>` +
    `<div class="record${perfect ? " perfect" : ""} pop">${res.wins}–${res.losses}</div>` +
    postseasonBlock +
    (done
      ? `<div class="verdict stage-${post.stage} pop">${post.label}</div>` +
        (perfect ? `<div class="perfect-note">A perfect regular season.</div>` : "") +
        `<div class="result-cats-wrap pop"><div class="rc-head">Category balance</div>` +
          `<div class="result-cats">${catBarsHTML(res)}</div>` +
          // no "not enough X" when you WON it — only show the weakness when you fell short
          (perfect || post.stage === "champion" ? "" : `<div class="rc-gate">${GATE_PHRASE[res.gateCategory] || ""}</div>`) +
        `</div>` +
        (salaryMode() ? `<div class="cap-note">Built for ${formatMoney(salarySpent())} of ${formatMoney(SALARY_CAP)}.</div>` : "") +
        shareBlock
      : `<div class="reveal-dots">•••</div>`);

  card.querySelectorAll(".vt-btn").forEach((b) =>
    b.addEventListener("click", () => { state.resultView = b.dataset.view; renderResult(); }));
  const lb = el("dl-leaderboard-btn");
  if (lb) lb.addEventListener("click", () => reset()); // lands on the lockout, which shows the board
  const sb = el("share-btn");
  if (sb) sb.addEventListener("click", () => {
    const txt = el("share-pre").textContent;
    navigator.clipboard.writeText(txt).then(
      () => { sb.textContent = "Copied ✓"; setTimeout(() => { sb.textContent = "Copy result"; }, 1600); },
      () => { sb.textContent = "Copy failed"; }
    );
  });
  const ib = el("image-btn");
  if (ib) ib.addEventListener("click", () => copyShareCard(ib));
  const pa = el("play-again");
  if (pa) pa.addEventListener("click", () => reset());
}

/* ---------------- shareable PNG card ---------------- */

// Gather everything the card needs from the finished game state.
function shareCardData() {
  const res = projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth);
  const post = runPostseason(state.slots, state.data.seasons, state.pools, res.wins, state.sixth);
  const co = chosenCoach();
  const five = state.slots.map((s, i) => {
    const st = clubStyle(s._src.teamCode);
    return {
      x: SLOTS[i].x, y: SLOTS[i].y, slotLabel: SLOTS[i].label,
      primary: st.primary, secondary: st.secondary, ink: textOn(st.primary),
      mono: monogram(s.playerName), name: surname(s.playerName),
      abbr: st.abbr, season: s._src.seasonLabel,
    };
  });
  const ar = chosenArena();
  const homeSlot = state.arenaSlot != null ? state.slots[state.arenaSlot] : null;
  const homeSt = homeSlot ? clubStyle(homeSlot._src.teamCode) : null;
  return {
    modeLabel: salaryMode() ? "Salary Cap" : state.mode === "daily" ? "Daily" : "Classic",
    wins: res.wins, losses: res.losses, perfect: res.wins === GAMES,
    stage: post.stage, label: post.label,
    icon: STAGE_ICON[post.stage] || "",
    five, coachName: co ? prettyName(co.coach.name) : "No coach", coachStyle: co ? archetypeLabel(co.coach) : "",
    salary: salaryMode() ? formatMoney(salarySpent()) : null,
    arena: ar ? ar.name : null,
    homeColor: homeSt ? homeSt.primary : null, homeAbbr: homeSt ? homeSt.abbr : null,
  };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A stylized half-court (basket at TOP, matching the in-app court) drawn into the box (x,y,w,h).
// `tint` (optional) is the home club's { color, abbr } — a soft colour wash + faint centre-court
// abbreviation, echoing the in-app home-court treatment.
function drawCourt(ctx, x, y, w, h, line, tint) {
  ctx.save();
  ctx.translate(x, y);
  rr(ctx, 0, 0, w, h, 18);
  ctx.save(); ctx.clip();
  if (tint) {
    ctx.fillStyle = tint.color; ctx.globalAlpha = 0.10; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.14; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '800 150px "Inter", system-ui, sans-serif';
    ctx.fillText(tint.abbr, w / 2, h * 0.56);
    ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
  }
  ctx.strokeStyle = line; ctx.lineWidth = 3;
  const mid = w / 2;
  const keyW = w * 0.28, keyH = h * 0.34;
  ctx.strokeRect(mid - keyW / 2, 0, keyW, keyH);            // paint / key
  ctx.beginPath(); ctx.arc(mid, keyH, keyW * 0.5, 0, Math.PI * 2); ctx.stroke(); // FT circle
  ctx.beginPath(); ctx.moveTo(mid - 30, 16); ctx.lineTo(mid + 30, 16); ctx.stroke(); // backboard
  ctx.beginPath(); ctx.arc(mid, 30, 10, 0, Math.PI * 2); ctx.stroke(); // rim
  ctx.beginPath(); ctx.arc(mid, 30, w * 0.42, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke(); // 3pt arc
  ctx.restore();
  rr(ctx, 0, 0, w, h, 18); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke(); // court edge
  ctx.restore();
}

// Render the finished team to an offscreen canvas.
function buildShareCanvas(d) {
  const W = 1080, H = 1350, cx = W / 2;
  const BG = "#0e1420", PANEL = "#161d2c", LINE = "#39465c", INK = "#e7ecf3", MUTE = "#93a1b6",
    ACC = "#ff7d1a", GOOD = "#2ecc71", GOLD = "#e6c65a";
  const F = (wt, sz) => `${wt} ${sz}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#141d2e"); grad.addColorStop(0.5, BG); grad.addColorStop(1, "#0b111b");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, 18, 18, W - 36, H - 36, 22); ctx.stroke();
  ctx.textAlign = "center";

  // header
  ctx.fillStyle = INK; ctx.font = F(800, 46); ctx.fillText("👑 KING OF EUROPE", cx, 96);
  ctx.fillStyle = ACC; ctx.font = F(800, 24); ctx.fillText(d.modeLabel.toUpperCase(), cx, 134);

  // record + stage
  ctx.fillStyle = d.perfect ? GOOD : INK; ctx.font = F(800, 150);
  ctx.fillText(`${d.wins}–${d.losses}`, cx, 300);
  const stageCol = d.stage === "champion" ? GOLD : d.stage === "lostfinal" || d.stage === "finalfour" ? ACC : MUTE;
  ctx.fillStyle = stageCol; ctx.font = F(700, 40);
  ctx.fillText(`${d.label}${d.icon ? " " + d.icon : ""}`, cx, 356);

  // court + five
  const cx0 = 150, cy0 = 404, cw = 780, ch = 720;
  drawCourt(ctx, cx0, cy0, cw, ch, LINE, d.homeColor ? { color: d.homeColor, abbr: d.homeAbbr } : null);
  for (const p of d.five) {
    const px = cx0 + (p.x / 100) * cw, py = cy0 + (p.y / 100) * ch, R = 44;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fillStyle = p.primary; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = p.secondary; ctx.stroke();
    ctx.fillStyle = MUTE; ctx.font = F(800, 18); ctx.fillText(p.slotLabel, px, py - R - 12);
    ctx.fillStyle = p.ink; ctx.font = F(800, 28); ctx.textBaseline = "middle";
    ctx.fillText(p.mono, px, py + 1); ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK; ctx.font = F(700, 25); ctx.fillText(p.name, px, py + R + 32);
    ctx.fillStyle = MUTE; ctx.font = F(600, 19); ctx.fillText(`${p.abbr} ${p.season}`, px, py + R + 58);
  }

  // arena + coach
  let by = 1172;
  if (d.arena) { ctx.fillStyle = MUTE; ctx.font = F(700, 23); ctx.fillText(`🏟  ${d.arena}`, cx, by); by += 46; }
  else by = 1200;
  ctx.fillStyle = MUTE; ctx.font = F(800, 22); ctx.fillText("COACH", cx, by); by += 38;
  ctx.fillStyle = INK; ctx.font = F(700, 34);
  ctx.fillText(d.coachStyle ? `${d.coachName}  ·  ${d.coachStyle}` : d.coachName, cx, by);

  // footer
  if (d.salary) { ctx.fillStyle = GOOD; ctx.font = F(700, 24); ctx.fillText(`Built for ${d.salary}`, cx, 1304); }
  ctx.fillStyle = ACC; ctx.font = F(700, 27);
  ctx.fillText("king-of-europe.pages.dev", cx, d.salary ? 1334 : 1306);
  return cv;
}

// A Dynasty run's shareable card: the streak, your final five, the home floor, and how it ended.
function dynastyShareCardData() {
  const d = state.dynasty;
  const five = state.slots.map((s, i) => {
    const st = clubStyle(s._src.teamCode);
    return {
      x: SLOTS[i].x, y: SLOTS[i].y, slotLabel: SLOTS[i].label,
      primary: st.primary, secondary: st.secondary, ink: textOn(st.primary),
      mono: monogram(s.playerName), name: surname(s.playerName), abbr: st.abbr, season: s._src.seasonLabel,
    };
  });
  return {
    streak: d.streak,
    subLabel: d.sub === "weekly" ? `Weekly Challenge · ${d.board}` : "Endless Run",
    five,
    arena: d.arena ? d.arena.name : null,
    homeColor: d.arena ? d.arena.primary : null, homeAbbr: d.arena ? d.arena.abbr : null,
    fellTo: d.opp ? `${prettyName(d.opp.teamName)} ${d.opp.seasonLabel}` : null,
    fellScore: d.lastGame ? `${d.lastGame.theirs}–${d.lastGame.mine}` : null,
  };
}

function buildDynastyShareCanvas(d) {
  const W = 1080, H = 1350, cx = W / 2;
  const BG = "#0e1420", LINE = "#39465c", INK = "#e7ecf3", MUTE = "#93a1b6", ACC = "#ff7d1a", GOLD = "#e6c65a";
  const F = (wt, sz) => `${wt} ${sz}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#141d2e"); grad.addColorStop(0.5, BG); grad.addColorStop(1, "#0b111b");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(ctx, 18, 18, W - 36, H - 36, 22); ctx.stroke();
  ctx.textAlign = "center";

  ctx.fillStyle = INK; ctx.font = F(800, 46); ctx.fillText("👑 KING OF EUROPE", cx, 96);
  ctx.fillStyle = ACC; ctx.font = F(800, 24); ctx.fillText("DYNASTY", cx, 134);

  ctx.fillStyle = d.streak >= 10 ? GOLD : ACC; ctx.font = F(800, 150); ctx.fillText(`🔥 ${d.streak}`, cx, 302);
  ctx.fillStyle = MUTE; ctx.font = F(800, 30); ctx.fillText("WIN STREAK", cx, 352);
  ctx.fillStyle = INK; ctx.font = F(700, 26); ctx.fillText(d.subLabel, cx, 394);

  const cx0 = 150, cy0 = 436, cw = 780, ch = 660;
  drawCourt(ctx, cx0, cy0, cw, ch, LINE, d.homeColor ? { color: d.homeColor, abbr: d.homeAbbr } : null);
  for (const p of d.five) {
    const px = cx0 + (p.x / 100) * cw, py = cy0 + (p.y / 100) * ch, R = 42;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fillStyle = p.primary; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = p.secondary; ctx.stroke();
    ctx.fillStyle = MUTE; ctx.font = F(800, 17); ctx.fillText(p.slotLabel, px, py - R - 11);
    ctx.fillStyle = p.ink; ctx.font = F(800, 27); ctx.textBaseline = "middle"; ctx.fillText(p.mono, px, py + 1); ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK; ctx.font = F(700, 24); ctx.fillText(p.name, px, py + R + 30);
    ctx.fillStyle = MUTE; ctx.font = F(600, 18); ctx.fillText(`${p.abbr} ${p.season}`, px, py + R + 54);
  }

  let by = 1182;
  if (d.fellTo) { ctx.fillStyle = MUTE; ctx.font = F(700, 25); ctx.fillText(`Fell to ${d.fellTo}${d.fellScore ? "   " + d.fellScore : ""}`, cx, by); by += 44; }
  if (d.arena) { ctx.fillStyle = MUTE; ctx.font = F(600, 22); ctx.fillText(`🏟  ${d.arena}`, cx, by); }
  ctx.fillStyle = ACC; ctx.font = F(700, 27); ctx.fillText("king-of-europe.pages.dev", cx, 1306);
  return cv;
}

// Build the card and COPY it to the clipboard (so it pastes straight into a chat) — the primary
// action. Falls back to the native share sheet, then a download, if image-clipboard isn't supported.
// A guard prevents a double-tap (or a re-render re-attaching the handler) from firing it twice.
let sharingCard = false;
function copyCard(btn, build) {
  if (sharingCard) return;
  sharingCard = true;
  const label = btn ? btn.textContent : "";
  const reset = () => { sharingCard = false; if (btn) btn.textContent = label; };
  const flash = (msg) => { if (btn) { btn.textContent = msg; setTimeout(reset, 1800); } else sharingCard = false; };
  let cv;
  try { cv = build(); }
  catch (e) { flash("Couldn't build"); return; }
  cv.toBlob((blob) => {
    if (!blob) { flash("Couldn't build"); return; }
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        .then(() => flash("Copied ✓"))
        .catch(() => shareOrDownloadCard(blob, flash, reset));
      return;
    }
    shareOrDownloadCard(blob, flash, reset);
  }, "image/png");
}
const copyShareCard = (btn) => copyCard(btn, () => buildShareCanvas(shareCardData()));
const copyDynastyShareCard = (btn) => copyCard(btn, () => buildDynastyShareCanvas(dynastyShareCardData()));
function shareOrDownloadCard(blob, flash, reset) {
  const file = new File([blob], "king-of-europe.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: "King of Europe" }).then(() => flash("Shared ✓")).catch(reset);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "king-of-europe.png";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  flash("Saved ✓");
}

// Versus endgame: the challenger's code to share, or the responder's decided duel.
function renderVersusResult(card) {
  card.classList.remove("hidden");
  const newMatchup = `<button id="vs-new" class="ghost-btn vs-new">New matchup</button>`;

  if (state.versusRole === "create") {
    const me = projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth);
    const code = state.versusResult.code;
    card.innerHTML =
      `<div class="reg-label">Your challenger five</div>` +
      `<div class="record pop">${me.wins}–${me.losses}</div>` +
      `<p class="verdict">Send this code to a friend. They draft from the <b>same six draws</b>, ` +
        `then the sim plays your duel on their screen.</p>` +
      `<div class="share-box"><pre class="share-pre" id="share-pre">${code}</pre>` +
        `<button id="share-btn" class="mini-btn">Copy challenge code</button></div>` +
      newMatchup;
    wireCopy(code, "Copy challenge code");
    el("vs-new").addEventListener("click", () => { resetVersus(); reset(); });
    return;
  }

  // responder — the duel is decided
  const { d, me } = state.versusResult;
  const opp = state.versusOpponent;
  const iWon = d.aIsWinner;
  const strip = d.games.map((g) => `<span class="vg ${g.aWin ? "w" : "l"}">${g.a}–${g.b}</span>`).join("");
  const shareTxt = `⚔️ King of Europe — Versus\nMy five ${iWon ? "beat" : "lost to"} ${opp.label} ${d.aWins}–${d.bWins}`;
  card.innerHTML =
    `<div class="reg-label">Best of seven</div>` +
    `<div class="record${iWon ? " perfect" : ""} pop">${d.aWins}–${d.bWins}</div>` +
    `<div class="verdict ${iWon ? "stage-champion" : "stage-relegation"} pop">${iWon ? "You win the series 🏆" : "You lost the series"}</div>` +
    `<div class="vs-teams">` +
      `<div class="vs-team you"><span class="vt-nm">Your five</span><span class="vt-rec">${me.wins}–${me.losses}</span></div>` +
      `<div class="vs-vs">vs</div>` +
      `<div class="vs-team"><span class="vt-nm">${opp.label}</span><span class="vt-rec">${opp.result.wins}–${opp.result.losses}</span></div>` +
    `</div>` +
    `<div class="vs-games">${strip}</div>` +
    `<div class="share-box"><pre class="share-pre" id="share-pre">${shareTxt}</pre>` +
      `<button id="share-btn" class="mini-btn">Copy result</button></div>` +
    newMatchup;
  wireCopy(shareTxt, "Copy result");
  el("vs-new").addEventListener("click", () => { resetVersus(); reset(); });
}

function wireCopy(text, label) {
  const sb = el("share-btn");
  if (!sb) return;
  sb.addEventListener("click", () => {
    navigator.clipboard.writeText(text).then(
      () => { sb.textContent = "Copied ✓"; setTimeout(() => { sb.textContent = label; }, 1600); },
      () => { sb.textContent = "Copy failed"; }
    );
  });
}

init();
