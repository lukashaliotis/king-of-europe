import { projectRecord, CATEGORIES, GAMES, benchValue, catZ } from "./engine.js";
import { loadData, buildClubSeasons, spin } from "./data.js";
import { clubStyle, monogram } from "./clubs.js";
import { runPostseason } from "./postseason.js";
import { arenaFor, arenaKey, arenaFlames, arenaSVG } from "./arenas.js";
import { eligibleCoaches, coachDeltas, archetypeLabel, pedigreeLabel, coachCost, COACH_FLOOR_PRICE } from "./coaches.js";
import { legendsPool, LEGENDS_CHANCE } from "./legends.js";
import { dailyThemeFor, rulesetOf, buildThemedDailyBoard, bossFor, themeKind } from "./dailytheme.js";
import { icon, isClassicLook, CROWN_PATH, FLAME_PATH, ARENA_PATH } from "./icons.js";
import { buildShareCanvas, buildDynastyShareCanvas, buildGoatShareCanvas } from "./sharecanvas.js";
import { catBarGeom, weakestBarCat, capCat, catBarsHTML, updateCatBars } from "./catbars.js";
import { buildGoat, goatFive, buildAwardPool, computeAwards, ungraftedStats, GRAFT_STATS, STAT_LABEL, goatGameLine } from "./goat.js";
import {
  mulberry32, hashSeed, utcDayKey, dailySeed, buildDailyBoard, rosterSignature,
  shareText, weakestLink, STAGE_ICON, loadDaily, saveDaily, currentStreak, dailyHistory, weekKey, optimalFiveCandidates,
} from "./daily.js";
import { initOnboarding, openThemeInfo, openTeamReport } from "./onboarding.js";
import { teamReport } from "./teamreport.js";
import {
  encodeChallenge, decodeChallenge, reconstructTeam, duel, duelSeed,
} from "./versus.js";
import { SALARY_CAP, FLOOR as SALARY_FLOOR, playerCost, canAfford, formatMoney } from "./salary.js";
import { getIdentity, saveName, saveProfile, submitIdentity, submitDaily, fetchLeaderboard, submitDynasty, fetchDynastyBoard, submitGoatDaily, fetchGoatLeaderboard, fetchClassicAllTime, fetchGoatAllTime, submitClassic, submitSalary, fetchSalaryAllTime, createCrew, joinCrew, leaveCrew, fetchCrews } from "./leaderboard.js";
import { COUNTRIES, countryByCode, countryFlag } from "./countries.js";
import { TEAMS, teamName } from "./teams.js";
import { FEATS, featById, featEmoji, unlockedFeats, hasFeat, unlockFeat, unlockFeatsFor, selectedBadge, setBadge } from "./feats.js";
// If a submit response says this device is one of the first 10 players, unlock the Founder badge.
const noteFounder = (data) => { if (data && data.founder) unlockFeat("founder"); return data; };
import { goatDaySeed, buildGoatDailyBoard, goatScore, loadGoatDaily, saveGoatDaily, goatDailyShareText } from "./dailygoat.js";
import { goatScenarioFor, GOAT_SCENARIOS, goatScenarioById } from "./goatscenarios.js";
import { resolveGame, orderFive, canSwap, squadStrength, roundRng, drawFor, homeFor, buildDynastyBoard, dynastyWeekSeed } from "./dynasty.js";

const LEGENDS = legendsPool();

const el = (id) => document.getElementById(id);
const MAXCAT = 10;

// Five positions on the half court (basket at top). x/y are % of the court box.
const SLOTS_STANDARD = [
  { label: "PG", pos: "G", x: 50, y: 84 },
  { label: "SG", pos: "G", x: 80, y: 57 },
  { label: "SF", pos: "F", x: 20, y: 57 },
  { label: "PF", pos: "F", x: 34, y: 29 },
  { label: "C", pos: "C", x: 65, y: 24 },
];
// Single-position ruleset (rare rule-breaker Daily): five slots of ONE position on the same spots.
const SLOTS_SOLO = (pos) => SLOTS_STANDARD.map((s) => ({ ...s, label: pos, pos }));
let SLOTS = SLOTS_STANDARD; // repointed by applyRuleset() when a rule-breaker daily is active
// The active daily's single-position ("G"/"F"/"C") if a rule-breaker day is on, else null (standard
// 2G/2F/1C). Only Daily ever breaks the rules; every other mode stays standard. Repointing SLOTS lets
// all the placement/court/share code just work.
function soloPosDaily() {
  if (state.mode !== "daily" || !state.dailyTheme) return null;
  return rulesetOf(state.dailyTheme).soloPos || null;
}
function applyRuleset() { const p = soloPosDaily(); SLOTS = p ? SLOTS_SOLO(p) : SLOTS_STANDARD; }
const POS_FULL = { G: "Guard", F: "Forward", C: "Center" };
// Cards show the coarse, always-correct Guard/Forward/Center. The refined pos5 (deriveRoles) is kept
// internal — it drives the Team Report (wing vs big) and advisory seating, but the PG/SG guess is too
// shaky to display as a fact (e.g. a scoring wing mislabelled PG).
const posLabel = (p) => POS_FULL[p.pos] || p.pos;
// The weakest-category line on the record card — a plain-language paraphrase, not "capped by X".
const GATE_PHRASE = {
  scoring: "Not enough Scoring.",
  rebounding: "Not enough Rebounding.",
  playmaking: "Not enough Playmaking.",
  defense: "Not enough Defense.",
  efficiency: "Not enough Efficiency.",
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
  captain: null,     // Salary mode: playerCode of the captain (free, doubles his contribution), or null
  captainConfirmed: false, // Salary: captain named + confirmed (its own step before the arena spin)
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
  crews: [],
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
  goat: null,        // GOAT mode: { phase, homeClub, base, grafts:[{stat,donor}], offer, donor }
};
let dragging = null;
let spinTimer = null;
let GOAT_POOL = null; // real-player award-percentile distributions (built once, lazily)
let revealTimer = null;
let dynTimer = null; // Dynasty animations (opponent/home-away spin, simulated score reveal)
let goatRevealTimer = null; // GOAT result staged reveal

function prettyName(name) {
  return name.split(",")
    .map((p) => p.trim().toLowerCase()
      // Unicode-aware: \b is ASCII-only, so a name like "peñarroya" got a false boundary AROUND the ñ
      // ("PeÑArroya") and Latin-Extended letters (č ć š ž ū ę ğ đ) were never capitalised at all
      // ("željko"). Capitalise the first letter of each word instead — start, or after a separator.
      .replace(/(^|[\s'’\-.])(\p{Ll})/gu, (m, sep, ch) => sep + ch.toUpperCase())
      // generational suffixes are Roman numerals, not names — keep them upper-case (Brown III, not Iii)
      .replace(/\b(ii|iii|iv|vi|vii|viii|ix)\b/gi, (m) => m.toUpperCase())
      // two-letter initial given names stay upper-case (KC Rivers, TJ Parker) — a curated set so
      // real short names (Ed, Bo, Ty) are still title-cased
      .replace(/\b(kc|tj|pj|aj|dj|jd|cj|jj|rj|bj|jt|jp)\b/gi, (m) => m.toUpperCase()))
    .join(", ");
}
const surname = (name) => prettyName(name).split(",")[0];

function boxLine(p, twoRows = false) {
  const b = p.box;
  const st = (v, l) => `<span class="st"><b>${v}</b> ${l}</span>`; // one ATOMIC nowrap cell — never cuts mid-unit
  const stats = [
    st(b.pts.toFixed(1), "PTS"), st(b.reb.toFixed(1), "REB"), st(b.ast.toFixed(1), "AST"),
    st(b.stl.toFixed(1), "STL"), st(b.blk.toFixed(1), "BLK"), st(Math.min(100, Math.round(b.ts * 100)) + "%", "TS"),
  ];
  // Cards (twoRows) lay the 6 stats out as a GRID: 3 columns on desktop (PTS REB AST / STL BLK TS), 2
  // on mobile (PTS REB / AST STL / BLK TS%) — so a label can never wrap off the end. Elsewhere: one row.
  return twoRows ? `<span class="statgrid">${stats.join("")}</span>` : stats.join(" · ");
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

// A tiny club badge for leaderboard rows (smaller than the reel badge()).
function lbTeamBadge(code) {
  const s = clubStyle(code);
  return `<span class="lb-badge" style="background:${s.primary};color:${textOn(s.primary)};` +
    `box-shadow:inset 0 0 0 2px ${s.secondary}">${s.abbr}</span>`;
}
// One opening-screen header for every mode that HAS an opening screen (Dynasty / G.O.A.T. /
// Versus): the mode's own mark, big, above the mode's name — so the entry screens are built the
// same way instead of each inventing its own hero. `cls` colours the mark (e.g. gold, f-streak).
const modeIntroHTML = (ic, cls, title) =>
  `<div class="mode-intro"><div class="mi-icon">${icon(ic, cls)}</div><h2 class="mi-h">${title}</h2></div>`;

// A feat's badge mark: its emoji in the Classic look, its SVG icon in Modern — so badges match the
// rest of the UI's icons instead of always being emoji.
function featMark(feat, cls = "") {
  if (!feat) return "";
  return isClassicLook() ? feat.emoji : icon(feat.icon || "star", cls);
}

// A daily theme's mark, per its category: the emoji in Classic, an SVG icon in Modern (no emoji).
const THEME_KIND_ICON = { Regular: "globe", Era: "clock", Legacy: "shield", Country: "flag", "Rule Breaker": "bolt" };
function themeMark(theme, cls = "") {
  if (!theme) return "";
  return isClassicLook() ? theme.emoji : icon(THEME_KIND_ICON[themeKind(theme).kind] || "globe", cls);
}

// Leaderboard identity: country flag + tiny club badge + name. Any of country/team may be empty
// (older rows, or a player who hasn't set them) — each piece is simply omitted in that case.
function lbNameInner(r) {
  const flag = countryFlag(r.country);
  const feat = r.badge ? featById(r.badge) : null;
  return (flag ? `<span class="lb-flag">${flag}</span>` : "") +
    (r.team ? lbTeamBadge(r.team) : "") +
    `<span class="lb-nm">${esc(r.name)}</span>` +
    (feat ? `<span class="lb-feat" title="${esc(feat.label)}">${featMark(feat)}</span>` : "");
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
  const modeSel = el("mode-select"); // the mobile dropdown mirror of the tabs
  if (modeSel) modeSel.addEventListener("change", (e) => setMode(e.target.value));
  el("lb-hub-btn").addEventListener("click", openHub);
  el("cat-peek").addEventListener("click", openCatModal);
  // Settings (gear) popup — consolidates Theme (dark/light) and Look (modern/classic).
  el("settings-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleSettings(); });
  // Mobile bottom nav — three in-play peeks (leaderboard / help / settings live in the top bar).
  const mnav = (id, fn) => { const b = el(id); if (b) b.addEventListener("click", fn); };
  // Tap toggles: a second tap on the same button closes its popup (feels like a real tab).
  mnav("mnav-court", () => courtModalOpen() ? closeCourtModal() : openCourtModal());
  mnav("mnav-balance", () => (el("cat-modal") && !el("cat-modal").classList.contains("hidden")) ? closeCatModal() : openCatModal());
  // The center button is contextual (Spin → Arena → Captain → Play …); its action is set each render
  // by syncMobilePlay and stashed on the element, so the whole draft loop lives in the bottom nav.
  mnav("mnav-play", () => { const b = el("mnav-play"); if (b && b._action) b._action(); });
  el("seg-theme").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-opt]"); if (b) setTheme(b.dataset.themeOpt); });
  el("seg-look").addEventListener("click", (e) => { const b = e.target.closest("[data-look-opt]"); if (b) setLook(b.dataset.lookOpt); });
  initProfileControls();
  // The first-run intro can set the profile too; repaint header + settings when it does.
  document.addEventListener("koe:profile", () => { paintProfile(); paintStaticIcons(); });
  // Click anywhere outside the open menu closes it.
  document.addEventListener("click", (e) => {
    if (settingsOpen() && !e.target.closest(".settings-wrap")) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (settingsOpen()) closeSettings();
    if (!el("lb-hub").classList.contains("hidden")) closeHub();
    if (!el("cat-modal").classList.contains("hidden")) closeCatModal();
    if (courtModalOpen()) closeCourtModal();
    if (!el("badge-modal").classList.contains("hidden")) closeBadges();
    if (!el("crews-modal").classList.contains("hidden")) closeCrews();
    if (!el("feat-unlock").classList.contains("hidden")) el("feat-unlock").classList.add("hidden");
  });
  // Expanding a bracket opponent's "their five" scrolls it into view so the club + all five fit on
  // screen. `toggle` doesn't bubble, so listen in the capture phase. (#9)
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d && d.classList && d.classList.contains("bk-tie") && d.open) {
      requestAnimationFrame(() => d.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }, true);
  document.body.dataset.mode = state.mode;
  paintStaticIcons();
  paintSettings();
  initOnboarding();
  render();
}

// Modern/Classic look. Modern = the SVG-icon redesign; Classic = the original emoji look. Persisted
// like the theme; icon()/arenaFlames/the share canvas all branch on data-look.
const currentLook = () => document.documentElement.getAttribute("data-look") || "modern";
function setLook(look) {
  document.documentElement.setAttribute("data-look", look);
  try { localStorage.setItem("koe-look", look); } catch (e) { /* ignore */ }
  paintStaticIcons();
  paintSettings();
  render();
}
// Dark/Light theme. Persisted as koe-theme; the pre-paint script in index.html sets it before first
// paint. Lives here (not an inline script) now that the gear popup owns both toggles.
const currentTheme = () => document.documentElement.getAttribute("data-theme") || "dark";
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("koe-theme", theme); } catch (e) { /* ignore */ }
  paintSettings();
}

/* ---- Settings (gear) popup ---- */
const settingsOpen = () => !el("settings-menu").classList.contains("hidden");
// Profile controls (name + country + team) inside the settings popup. Populate the dropdowns once,
// then save on any change — identity is per-device (a uid in localStorage), no account needed.
function initProfileControls() {
  const cSel = el("pf-country"), tSel = el("pf-team"), nInp = el("pf-name");
  if (!cSel || !tSel || !nInp) return;
  cSel.innerHTML = `<option value="">🌍 Country…</option>` +
    COUNTRIES.map((c) => `<option value="${c.code}">${c.flag} ${escapeHTML(c.name)}</option>`).join("");
  tSel.innerHTML = `<option value="">🏀 Favorite club…</option>` +
    TEAMS.map((t) => `<option value="${t.code}">${escapeHTML(t.name)}</option>`).join("");
  const save = () => {
    saveProfile({ name: nInp.value, country: cSel.value, team: tSel.value });
    paintStaticIcons(); // header/leaderboard may show flag/team later; refresh what's static now
  };
  nInp.addEventListener("change", save);
  nInp.addEventListener("blur", save);
  cSel.addEventListener("change", save);
  tSel.addEventListener("change", save);
  const bBtn = el("pf-badges"); if (bBtn) bBtn.addEventListener("click", openBadges);
  paintProfile();
}
// Reflect the stored profile into the controls (called when the popup opens).
function paintProfile() {
  const id = getIdentity() || {};
  const nInp = el("pf-name"), cSel = el("pf-country"), tSel = el("pf-team");
  if (nInp) nInp.value = id.name || "";
  if (cSel) cSel.value = id.country || "";
  if (tSel) tSel.value = id.team || "";
}

// Badge gallery — every feat, unlocked ones colored + selectable, locked ones greyed with their
// condition. Pick ONE to display by your name on the boards (tap the shown one again to hide it).
function openBadges() { closeSettings(); el("badge-modal").classList.remove("hidden"); renderBadges(); }
function closeBadges() { el("badge-modal").classList.add("hidden"); }
function renderBadges() {
  const box = el("badge-modal");
  const unlocked = unlockedFeats(), sel = selectedBadge();
  const cells = FEATS.map((f) => {
    const on = unlocked.has(f.id), chosen = sel === f.id;
    return `<button class="feat${on ? " on" : " locked"}${chosen ? " sel" : ""}" data-feat="${f.id}" type="button"${on ? "" : " disabled"}>` +
      `<span class="feat-em">${featMark(f, "feat-ic")}</span>` +
      `<span class="feat-lbl">${esc(f.label)}</span>` +
      `<span class="feat-how">${on ? (chosen ? "Shown by your name ✓" : "Unlocked - tap to show") : esc(f.how)}</span>` +
      `</button>`;
  }).join("");
  box.innerHTML =
    `<div class="badge-backdrop" data-close="1"></div>` +
    `<div class="badge-card" role="dialog" aria-modal="true" aria-label="Badges">` +
      `<button class="badge-close" data-close="1" aria-label="Close">✕</button>` +
      `<h2 class="badge-title">${isClassicLook() ? "🏅" : icon("medal", "badge-title-ic")} Badges</h2>` +
      `<p class="badge-sub">${unlocked.size ? "Tap a badge to show it by your name; tap the shown one to hide it." : "Play to unlock badges, then pick one to show by your name."}</p>` +
      `<div class="feat-grid">${cells}</div>` +
    `</div>`;
  box.querySelectorAll("[data-close]").forEach((e) => (e.onclick = closeBadges));
  box.querySelectorAll(".feat.on").forEach((b) => (b.onclick = () => {
    setBadge(selectedBadge() === b.dataset.feat ? "" : b.dataset.feat);
    renderBadges();
  }));
}

// Unlock the feats a finished game earned AND, if any are NEW, celebrate them once the result has
// settled. Every result path routes its unlocks through here so the pop-up is consistent.
function checkFeats(opts) {
  const got = unlockFeatsFor(opts);
  if (got.length) setTimeout(() => celebrateFeats(got), 700); // let the verdict "pop" land first
  return got;
}

// Celebratory pop-in when a new badge unlocks after a game: the badge bursts in with confetti; you can
// equip it to your name on the spot. Multiple unlocks in one game are shown together.
// EuroLeague Champion celebration — a trophy pop-up that auto-closes after a beat (tap to dismiss early).
// Fired once per game from renderResult when the bracket ends in a title.
let champTimer = null;
function celebrateChampion() {
  const box = el("champ-celebrate"); if (!box) return;
  const confetti = Array.from({ length: 22 }, (_, i) => `<span class="cc-confetti" style="--i:${i}"></span>`).join("");
  box.classList.remove("hidden");
  box.innerHTML =
    `<div class="cc-backdrop" data-close="1"></div>` +
    `<div class="cc-card" role="dialog" aria-label="EuroLeague Champions">` +
      `<div class="cc-confetti-wrap" aria-hidden="true">${confetti}</div>` +
      `<div class="cc-trophy">${icon("trophy", "gold")}</div>` +
      `<div class="cc-title">EuroLeague Champions</div>` +
    `</div>`;
  const close = () => box.classList.add("hidden");
  box.querySelectorAll("[data-close]").forEach((e) => (e.onclick = close));
  box.querySelector(".cc-card").onclick = close;
  clearTimeout(champTimer);
  champTimer = setTimeout(close, 3400); // auto-close after a beat
}

function celebrateFeats(ids) {
  const feats = (ids || []).map(featById).filter(Boolean);
  if (!feats.length) return;
  const box = el("feat-unlock"); if (!box) return;
  const multi = feats.length > 1;
  const confetti = Array.from({ length: 16 }, (_, i) => `<span class="fu-confetti" style="--i:${i}"></span>`).join("");
  const badges = feats.map((f) =>
    `<div class="fu-badge"><span class="fu-em">${featMark(f, "fu-ic")}</span><span class="fu-name">${esc(f.label)}</span></div>`).join("");
  box.classList.remove("hidden");
  box.innerHTML =
    `<div class="fu-backdrop" data-close="1"></div>` +
    `<div class="fu-card" role="dialog" aria-modal="true" aria-label="Badge unlocked">` +
      `<div class="fu-confetti-wrap" aria-hidden="true">${confetti}</div>` +
      `<div class="fu-kicker">${multi ? "New badges unlocked!" : "New badge unlocked!"}</div>` +
      `<div class="fu-badges">${badges}</div>` +
      `<div class="fu-actions">` +
        (multi ? "" : `<button class="mini-btn fu-equip" type="button">Show it by my name</button>`) +
        `<button class="play-btn fu-ok" type="button">Continue</button>` +
      `</div>` +
    `</div>`;
  const close = () => box.classList.add("hidden");
  box.querySelector(".fu-ok").onclick = close;
  box.querySelector(".fu-backdrop").onclick = close;
  const eq = box.querySelector(".fu-equip");
  if (eq) eq.onclick = () => { setBadge(feats[0].id); close(); paintStaticIcons(); };
}

function openSettings() { el("settings-menu").classList.remove("hidden"); el("settings-btn").setAttribute("aria-expanded", "true"); paintSettings(); paintProfile(); }
function closeSettings() { el("settings-menu").classList.add("hidden"); el("settings-btn").setAttribute("aria-expanded", "false"); }
function toggleSettings() { settingsOpen() ? closeSettings() : openSettings(); }
// Highlight the active pill in each segmented group to reflect the current theme + look.
function paintSettings() {
  const theme = currentTheme(), look = currentLook();
  document.querySelectorAll("#seg-theme .seg-opt").forEach((b) => b.classList.toggle("on", b.dataset.themeOpt === theme));
  document.querySelectorAll("#seg-look .seg-opt").forEach((b) => b.classList.toggle("on", b.dataset.lookOpt === look));
}

// The icons baked into static index.html chrome (top-bar trophy, settings gear, mobile balance)
// aren't rebuilt by render(), so repaint them through icon() on load and whenever the look changes.
// Favicons: Classic keeps the gold crown; Modern uses the crown-on-ball emblem (a solid orange ball
// so it still reads at 16px). Swapped by look in paintStaticIcons; no external asset either way.
const FAVICON_CLASSIC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 30'%3E%3Cpath d='M2 26 L6 8 L14 17 L20 4 L26 17 L34 8 L38 26 Z' fill='%23e0a83a'/%3E%3Ccircle cx='6' cy='6' r='2.6' fill='%23e0a83a'/%3E%3Ccircle cx='20' cy='3.5' r='3' fill='%23e0a83a'/%3E%3Ccircle cx='34' cy='6' r='2.6' fill='%23e0a83a'/%3E%3C/svg%3E";
const FAVICON_MODERN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='30' r='16' fill='%23F98026'/%3E%3Cg fill='none' stroke='%237a3200' stroke-width='2.2'%3E%3Cpath d='M24 14 V46 M8 30 H40'/%3E%3Cpath d='M12 19 Q24 30 12 41'/%3E%3Cpath d='M36 19 Q24 30 36 41'/%3E%3C/g%3E%3Cpath d='M8 20 L12 8 L18 15 L24 4 L30 15 L36 8 L40 20 Z' fill='%23F98026'/%3E%3C/svg%3E";

function paintStaticIcons() {
  const t = el("lb-hub-btn"); if (t) t.innerHTML = icon("trophy", "gold");
  const sb = el("settings-btn"); if (sb) sb.innerHTML = icon("gear");
  const cp = el("cat-peek"); if (cp) cp.innerHTML = `${icon("chart")} Category balance`;
  const pb = el("pf-badges"); if (pb) pb.innerHTML = `${icon("medal")} Badges`; // SVG in Modern, 🏅 in Classic
  const fav = el("favicon"); if (fav) fav.setAttribute("href", currentLook() === "modern" ? FAVICON_MODERN : FAVICON_CLASSIC);
}

// Switch game mode. Classic is free play; Daily is the seeded shared board; Versus is H2H.
function setMode(mode) {
  if (mode === state.mode || state.spinning) return;
  if (courtModalOpen()) closeCourtModal(); // don't strand the court node in the popup across modes
  state.mode = mode;
  document.body.dataset.mode = mode;
  state.sortBy = mode === "salary" ? "price" : "mpg"; // Salary defaults to sorting by price
  if (mode === "daily") ensureDailyBoard();
  if (mode === "versus") resetVersus();
  if (mode === "dynasty") state.dynSub = null; // land on the Dynasty lobby (Weekly vs Endless)
  applyRuleset(); // leaving a Guard-Gauntlet daily restores standard 2G/2F/1C slots
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
  state.dailyTheme = dailyThemeFor(state.dailyDayKey); // today's rotating theme (or Open)
  applyRuleset(); // rule-breaker days repoint SLOTS (e.g. Guard Gauntlet → 5 guard slots)
  state.dailyBoard = buildThemedDailyBoard(state.pools, state.dailyDayKey, state.data.seasons); // shared w/ the resolver
  state.dailyStreak = currentStreak();
  state.dailyPractice = false; // a fresh entry is the ranked attempt
}
// The Legends-Boss bracket escalation for the current daily (0 otherwise) — passed to runPostseason.
const curDailyBoss = () => (state.mode === "daily" && state.dailyTheme) ? bossFor(state.dailyTheme) : 0;
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
  const me = myProjection();
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

/* ---- FIXED-BOARD SOFT-LOCK GUARD (Daily / Versus / weekly Dynasty) ----
   These modes serve ONE fixed club per pick with NO re-spins, so a careless placement — above all
   benching a position you still need — can strand you with a later forced draw that fills none of your
   open slots (you can't place anyone and can't spin: a hard soft-lock). We forbid any placement that
   would make completing a legal five (+ bench) impossible with the draws still to come. Free-spin modes
   (Classic / Salary / endless Dynasty) can always draw again, so they're never guarded. */
function fixedBoardArr() {
  if (state.mode === "daily") return state.dailyBoard;
  if (state.mode === "versus") return state.versusBoard;
  if (dynastyMode() && state.dynSub === "weekly") return state.dynBoard;
  return null;
}
// Position sets of the draws that will be FORCED for the picks AFTER the current one.
function drawsAfterCurrent() {
  const b = fixedBoardArr(); if (!b) return null;
  return b.slice(pickedCount() + 1).map((pool) => new Set((pool.players || []).map((p) => p.pos)));
}
// Can these needs (a position "G"/"F"/"C", or "BENCH" = any non-empty draw) each be matched to a
// DISTINCT remaining draw? Tiny backtracking match (≤5 items). Hardest (positions) assigned first.
function canCover(needs, draws) {
  if (needs.length > draws.length) return false;
  const order = needs.slice().sort((a, b) => (a === "BENCH") - (b === "BENCH"));
  const used = new Array(draws.length).fill(false);
  const assign = (i) => {
    if (i >= order.length) return true;
    for (let d = 0; d < draws.length; d++) {
      if (used[d]) continue;
      const ok = order[i] === "BENCH" ? draws[d].size > 0 : draws[d].has(order[i]);
      if (ok) { used[d] = true; if (assign(i + 1)) return true; used[d] = false; }
    }
    return false;
  };
  return assign(0);
}
// Would placing `player` at `slotKind` (a slot index, or "six") leave completion impossible?
function wouldStrand(player, slotKind) {
  const draws = drawsAfterCurrent(); if (!draws) return false; // free-spin mode → never strands
  const slots = state.slots.slice();
  let sixth = state.sixth;
  if (slotKind === "six") sixth = player; else slots[slotKind] = player;
  const needs = [];
  SLOTS.forEach((s, i) => { if (!slots[i]) needs.push(s.pos); });
  if (!sixth && !dynastyMode()) needs.push("BENCH");
  return !canCover(needs, draws);
}
// A safe (non-stranding) slot exists for this player? Gates the pool card in fixed-board modes.
function placeableWithoutStrand(player) {
  if (!fixedBoardArr()) return true;
  for (let i = 0; i < SLOTS.length; i++) if (!state.slots[i] && SLOTS[i].pos === player.pos && !wouldStrand(player, i)) return true;
  return sixthOpen() && !wouldStrand(player, "six");
}

/* ---------------- mode helpers ---------------- */
const dynastyMode = () => state.mode === "dynasty";
const inGauntlet = () => dynastyMode() && !!state.dynasty && state.dynasty.started;
const goatMode = () => state.mode === "goat";
const goatPool = () => { if (!GOAT_POOL) GOAT_POOL = buildAwardPool(state.data.players, state.data.seasons); return GOAT_POOL; };
// A club deep enough to field a legal 2G/2F/1C (so it can supply the GOAT's four supporting slots).
function canFieldFive(pool) {
  const need = { G: 2, F: 2, C: 1 };
  for (const p of pool.players || []) if (need[p.pos] > 0) need[p.pos]--;
  return need.G <= 0 && need.F <= 0 && need.C <= 0;
}
// The Dynasty draft is UNWEIGHTED — no √top-5 bias toward strong clubs — so you start modest and
// EARN your dynasty by looting, rather than being handed a strong squad (see docs/DECISIONS.md §15).
const spinUniform = (pools) => pools[Math.floor(Math.random() * pools.length)];

/* ---------------- salary cap ---------------- */
const salaryMode = () => state.mode === "salary";
const priceOf = (p) => playerCost(p, state.data.seasons);
// The captain (Salary only, optional): his category contribution counts DOUBLE and his price counts
// double too — so the extra €PIR he adds to the tab is a real budget sacrifice, not a free buff.
const captainPlayer = () => (state.captain ? state.slots.find((s) => s && s.playerCode === state.captain) || null : null);
const captainCode = () => (salaryMode() && captainPlayer() ? state.captain : null);
// The captain is FREE — he doubles his impact but costs nothing. The mandatory coach is the only
// budget line beyond the players (cheap, priced by pedigree; 0 during the draft / if none eligible).
const coachCostNow = () => { const c = chosenCoach(); return salaryMode() && c ? coachCost(c.coach) : 0; };
const salarySpent = () =>
  filled().reduce((a, s) => a + priceOf(s), 0) + (state.sixth ? priceOf(state.sixth) : 0) + coachCostNow();
// A compact spend/left summary for the steps AFTER the draft (captain, coach, result), where the
// top budget bar is gone — so your tab (and the unspent budget the Salary board scores on) stays
// visible right through to the result. Empty outside Salary mode.
const salaryLineHTML = () => {
  if (!salaryMode()) return "";
  const spent = salarySpent(), left = SALARY_CAP - spent;
  return `<div class="salary-line">${icon("coins")} <b>${formatMoney(spent)}</b> spent` +
    ` · <b class="sl-left">${formatMoney(left)}</b> left of ${formatMoney(SALARY_CAP)}</div>`;
};
// The current roster's full projection, including the captain (null outside Salary → no effect).
const myProjection = () =>
  projectRecord(state.slots, state.data.seasons, undefined, arenaMult(), coachCatDeltas(), state.sixth, captainCode());
// Cheapest coach ACTUALLY eligible for the current placed roster (for the budget-bar reserve). Falls
// back to the journeyman floor before any coach is eligible.
const cheapestEligibleCoach = () => {
  if (!salaryMode()) return 0;
  const elig = coachOptions();
  return elig.length ? Math.min(...elig.map((e) => coachCost(e.coach))) : COACH_FLOOR_PRICE;
};
const salaryReserve = () => (salaryMode() ? cheapestEligibleCoach() : 0);
// The reserve a SPECIFIC candidate must leave: the cheapest coach eligible for the six that WOULD
// result from placing him. So the last pick can never strand you below a hireable coach — you always
// keep enough for the actual minimum-cost available coach, not a flat guess.
const stampFromOffer = (p) => ({ ...p, _src: { teamCode: state.offer.teamCode, teamName: state.offer.teamName, seasonLabel: state.offer.seasonLabel } });
const coachReserveWith = (player) => {
  if (!salaryMode()) return 0;
  if (!state.offer) return cheapestEligibleCoach();
  const elig = eligibleCoaches([...filled(), stampFromOffer(player), state.sixth].filter(Boolean), state.data);
  return elig.length ? Math.min(...elig.map((e) => coachCost(e.coach))) : 0; // no eligible coach at all → caretaker
};
// Draft-time affordability: leave FLOOR for each empty slot AND reserve the cheapest coach the
// resulting roster could hire, so a splurge can't strand the mandatory coach at commit.
const canAffordPick = (player) =>
  !salaryMode() || canAfford(salarySpent(), priceOf(player), 5 - pickedCount(), SALARY_CAP - coachReserveWith(player));

// a player is placeable if there's room, (in salary mode) you can afford him, AND (fixed-board modes)
// placing him somewhere won't strand your five with the forced draws still to come.
const canPlace = (player) => !isDup(player) && hasRoomFor(player) && canAffordPick(player) && placeableWithoutStrand(player);
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

// A club-season is only worth drawing if you can actually make a legal pick from it given your OPEN
// slots — position, dedup, 6th-man, budget (canPlace encodes all of these). Otherwise a spin can
// strand you (e.g. only your Centre slot is open, but the drawn club has no centre). Filter the
// candidates before every random draw; fall back to all pools if somehow none qualify.
const poolCanFill = (pool) => (pool.players || []).some(canPlace);
const fillablePools = (pools) => { const ok = pools.filter(poolCanFill); return ok.length ? ok : pools; };

// MOBILE ONLY (≤820px): the layout is a tall single column, so the player list, the court, and the
// end-of-season reveal are screens apart. These nudge the relevant element into view at the right
// moment so you don't have to hunt for it. No-ops on desktop, so the two-column layout is untouched.
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
function scrollToOnMobile(id, block) {
  if (!isMobile()) return;
  requestAnimationFrame(() => { const node = el(id); if (node) node.scrollIntoView({ behavior: "smooth", block: block || "center" }); });
}
// On mobile, the standard-court modes get a fixed bottom tray (the five) + bottom nav (the actions),
// so the draft is a thumb-only loop that never scrolls to the court or the top bar. Mirrors the
// "drafting" gate in renderCourtTray. Dynasty uses the court but has no tray, so it still scrolls.
const TRAY_MODES = ["classic", "daily", "salary"];
const trayActive = () => isMobile() && TRAY_MODES.includes(state.mode) && !(complete() && state.revealed);
// Between picks (a player placed, no offer open, not spinning) we show the inline COURT instead of the
// tray — they'd otherwise overlap. The tray is for PLACING (while an offer/pending is up); the court is
// for reviewing. Shared by render() (the body class) and renderCourtTray (so the tray steps aside).
const courtVisibleNow = () => filled().length > 0 && !state.offer && !state.spinning;

// On the commit steps (captain / coach) the choice moves the category bars, which can sit below the
// fold in the right column on a laptop. Bring them into view ONCE per step entry (these steps
// re-render on every click, so scrolling each time would fight the user).
let _commitStep = null;
function commitStepEntered(step) { if (_commitStep === step) return false; _commitStep = step; return true; }
function revealCatBars() {
  // Scroll far enough to reveal the WHOLE balance INCLUDING the "Weakest link" line at the very bottom
  // — that's what you're choosing a captain/coach to patch, so it must be on-screen, not just below the
  // fold. Target the gate-note (last line) when it's shown; fall back to the bars otherwise.
  requestAnimationFrame(() => {
    const note = el("gate-note");
    const target = (note && note.textContent.trim()) ? note : el("cat-bars");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

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
        target = spinUniform(fillablePools(state.pools)); // endless: unweighted free draft, start modest
      }
    } else {
      // rare nugget: sometimes the main spin lands the European Legends instead of a club — but only
      // if the Legends pool can actually fill an open slot (else fall through to a fillable club).
      const legends = Math.random() < LEGENDS_CHANCE && poolCanFill(LEGENDS);
      target = legends ? LEGENDS : spin(fillablePools(state.pools));
    }
    reels = { club: true, year: true };
  } else {
    if (state.mode === "daily" || state.mode === "versus" || (dynastyMode() && state.dynSub === "weekly")) return; // no re-spins on a fixed board
    if (!canRespin(mode)) return;
    state.respins[mode] = false;
    target = spin(fillablePools(respinPool(mode)));
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
  renderCourtTray(); // BUGFIX: the mobile bottom tray must light its eligible slots too, or you can't place there
  renderSixth();
  // On a phone the court sits far below the player list — bring it (and its now-lit slots) into
  // view when you pick someone. In the tray modes the fixed bottom tray already shows the lit slots,
  // so there's nothing to scroll to; leave the page put (Dynasty has no tray, so it still scrolls).
  if (state.pending && !trayActive()) scrollToOnMobile("court-wrap", "center");
}
// Advisory seating: within a position's two slots, prefer the one matching the player's derived role
// — a wing to SF, a bruiser to PF, a playmaker to PG. Returns a better OPEN slot index, or -1 to keep
// the clicked one. Not enforced: if the ideal slot is taken, the player falls into the other.
function preferredSlotFor(player) {
  if (SLOTS !== SLOTS_STANDARD) return -1; // rule-breaker daily: all slots share a position
  // Only the FORWARD wing/big split is reliable enough to auto-seat (it uses height + rim stats +
  // shooting). The PG/SG guess (assist-rate only) is too shaky, so guards keep the clicked slot.
  if (player.pos !== "F") return -1;
  const want = player.interior ? 3 : 2; // PF : SF
  return (!state.slots[want] && SLOTS[want].pos === "F") ? want : -1;
}
function placeAt(slotIndex, player) {
  const pref = player ? preferredSlotFor(player) : -1;
  if (pref >= 0) slotIndex = pref; // seat by role (advisory)
  const slot = SLOTS[slotIndex];
  if (!player || state.slots[slotIndex] || slot.pos !== player.pos || isDup(player)) return;
  if (wouldStrand(player, slotIndex)) return; // fixed-board guard: never let a placement soft-lock the five
  state.slots[slotIndex] = {
    ...player,
    _src: { teamName: state.offer.teamName, seasonLabel: state.offer.seasonLabel, teamCode: state.offer.teamCode },
  };
  state.pending = null;
  state.offer = null;
  render();
  afterPlaceScroll();
}
// Mobile: after placing, close the loop. Once the squad is full, bring up the arena/coach step
// (#commit, in the main column). While still drafting a tray mode, stay put — the tray shows the five
// and the nav's center button spins the next pick, so there's no reason to jump the page. Other modes
// (Dynasty) back up to the Spin bar. No-op on desktop.
function afterPlaceScroll() {
  if (complete()) { scrollToOnMobile("commit", "start"); return; }
  if (trayActive()) return;
  scrollToOnMobile("control-bar", "start");
}
function clearEndgame() {
  // note: does NOT clear state.sixth — the bench player survives editing a starter
  state.arenaSlot = null; state.arenaSpun = false; state.arenaRolling = false; state.arenaRevealing = false;
  state.coachName = null; state.revealed = false;
  state.captainConfirmed = false; // re-open the captain step if the five changes
  state.courtRevealed = false; state.revealStage = 0;
  clearInterval(revealTimer);
}
// the 6th man: positionless, any non-duplicate player from the current spin
function pickSixth(player) {
  if (isDup(player) || !sixthOpen()) return;
  if (wouldStrand(player, "six")) return; // fixed-board guard: benching this would strand a starter slot
  state.sixth = { ...player, _src: { teamName: state.offer.teamName, seasonLabel: state.offer.seasonLabel, teamCode: state.offer.teamCode } };
  state.offer = null; state.pending = null;
  render();
  afterPlaceScroll();
}
function reset() {
  state.slots = [null, null, null, null, null];
  state.offer = null; state.pending = null;
  state.respins = { club: true, year: true, both: true };
  state.sixth = null;
  state.captain = null; // Salary: no captain named yet
  state.captainConfirmed = false;
  state.dynasty = null;
  state.classicSubmitted = false;
  state.classicSubmitPromise = null; // the memoized post for this game (see submitClassicOnce)
  state.salarySubmitPromise = null; state.salarySubmitted = false; // Salary all-time post, memoized per game
  state.courtView = "you";           // sidebar court shows your five (vs the revealed "optimal")
  state.dailyOptimal = undefined;    // recomputed lazily once this game's Daily result is shown
  state.featsChecked = false;
  state.classicView = "result"; // Classic result opens on the summary, not the leaderboard
  // Preserve the GOAT sub-mode + daily board across a replay (like dynSub) — "Practice" and "New"
  // both re-enter via reset(); the caller decides whether to clear `sub` (→ back to the lobby).
  const pg = state.goat;
  state.goat = goatMode() ? {
    phase: "home", homeClub: null, base: null, grafts: [], offer: null, donor: null, usedIds: [],
    sub: pg ? pg.sub : null, dailyBoard: pg ? pg.dailyBoard : null, dayKey: pg ? pg.dayKey : null,
    scenario: pg ? pg.scenario : null,
    practice: pg ? pg.practice : false, submitted: false,
  } : null;
  clearTimeout(dynTimer);
  clearTimeout(goatRevealTimer);
  clearEndgame();
  render();
}

/* ---------------- arena + coach ---------------- */

function arenaInfoFor(slotIdx) {
  const s = state.slots[slotIdx];
  if (!s) return null;
  const base = arenaFor(s._src.teamCode, s.season);
  // Home edge scales by how many of your five played in THIS BUILDING (same club + same arena-era),
  // not just the same club — so a cross-era stack splits its edge across the two buildings.
  const key = arenaKey(s._src.teamCode, s.season);
  const count = filled().filter((x) => arenaKey(x._src.teamCode, x.season) === key).length;
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

// distinct BUILDINGS among your five -> a representative slot index. Dedup by arena-era (not just
// club), so two same-club players from different arena-eras offer BOTH buildings as candidates.
function arenaChoices() {
  const seen = new Map();
  state.slots.forEach((s, i) => { if (s) { const k = arenaKey(s._src.teamCode, s.season); if (!seen.has(k)) seen.set(k, i); } });
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
    const key = arenaKey(state.slots[i]._src.teamCode, state.slots[i].season);
    const n = filled().filter((x) => arenaKey(x._src.teamCode, x.season) === key).length;
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
        // On a phone the court is below the arena reveal, so the tint sweep plays off-screen. Let
        // the player glance at the arena, scroll DOWN to the court, THEN play the tint so they see
        // it — and finally head back up to the coach step. Desktop/Dynasty keep the original timing.
        if (isMobile() && !dynastyMode()) {
          setTimeout(() => scrollToOnMobile("court-wrap", "center"), 600);
          setTimeout(() => { state.courtRevealed = true; render(); }, 1300);
          setTimeout(() => { state.arenaRevealing = false; render(); scrollToOnMobile("commit", "start"); }, 2700);
        } else {
          setTimeout(() => { state.courtRevealed = true; render(); }, 550);
          setTimeout(() => {
            state.arenaRevealing = false;
            if (dynastyMode()) startGauntlet(); // no coach in Dynasty — the run begins
            render();
          }, 2100);
        }
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
  const setLoc = (loc, landed) => { const l = el("dyn-loc-reel"); if (l) { l.innerHTML = loc === "home" ? `${icon("home")} HOME` : `${icon("plane")} AWAY`; l.className = "dyn-loc-reel " + loc + (landed ? " landed" : ""); } };
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
  // Daily lockout recap — the draft chrome (spin bar + the empty court/sidebar) is irrelevant here
  // and, stacked on mobile, buries the recap's own controls. Flag it so CSS can drop that chrome.
  document.body.dataset.locked = dailyLocked() ? "1" : "";
  document.body.dataset.goat = goatMode() ? "1" : "";
  // Mode LOBBIES (Dynasty's Weekly/Endless, G.O.A.T.'s Daily/Endless) have no spin bar. Collapsing
  // it let the whole layout — and with it the sidebar court — ride ~56px higher than every other
  // mode. Flag the state so CSS can RESERVE the bar's footprint instead, keeping the court aligned.
  document.body.dataset.lobby =
    (dynastyMode() && !state.dynSub) || (goatMode() && !(state.goat && state.goat.sub)) ? "1" : "";
  // Mobile: once you've placed a player and you're between picks (waiting to Spin, or on the
  // arena/coach step), REVEAL the inline court — so you can see your five and the home-arena tint.
  // Hidden while an offer is open (the list + tray are the focus) and on the empty first screen.
  document.body.classList.toggle("court-visible", courtVisibleNow());
  // Between spins the roster panel holds only the empty "Press Spin…" box — drop the whole panel then
  // (mobile), so the court sits right under the controls. Keep it once complete (it holds the arena/
  // coach step) and on the revealed result.
  document.body.classList.toggle("no-roster", courtVisibleNow() && !complete());
  // GOAT takes over the whole main area (CSS hides the sidebar + spin bar); render it and stop.
  if (goatMode()) {
    renderModes(); renderGoat();
    // The G.O.A.T. LOBBY shows the sidebar (court + balance) like every other mode's opening screen,
    // so those panels must be rendered HERE too — otherwise they keep whatever the previous mode drew
    // (a stale court and another mode's arena line). The build screens hide the sidebar entirely.
    if (!(state.goat && state.goat.sub)) { renderVenue(); renderCourt(); renderSixth(); renderBench(); renderCats(); }
    syncMobilePlay(); return;
  }
  renderModes(); renderControl(); renderVenue(); renderCourt(); renderCourtTray(); renderSixth(); renderBench();
  renderOffer(); renderCommit(); renderCats(); renderResult();
  syncMobilePlay();
}

function renderModes() {
  document.querySelectorAll(".mode-tab").forEach((b) =>
    b.classList.toggle("on", b.dataset.mode === state.mode));
  const modeSel = el("mode-select");
  if (modeSel && modeSel.value !== state.mode) modeSel.value = state.mode; // keep the mobile dropdown in sync
  const bar = el("daily-bar");

  if (state.mode === "daily") {
    bar.classList.remove("hidden");
    if (state.dailyPractice) {
      bar.innerHTML = `<span class="dl">${icon("calendar")} Daily</span> <b>Practice run</b> - today's board, not counted. ` +
        `<a href="#" id="dl-exit-practice" class="dl-link">Back to result</a>`;
      const exit = el("dl-exit-practice");
      if (exit) exit.addEventListener("click", (e) => { e.preventDefault(); state.dailyPractice = false; reset(); });
    } else {
      // The bar tells you WHAT KIND of Daily today is (Regular / Era · The 2000s / Rule Breaker ·
      // Guard Gauntlet …). Special days are a tappable chip that pops an explainer. (The streak now
      // lives on the recap line, not here.)
      const theme = state.dailyTheme || dailyThemeFor(state.dailyDayKey || utcDayKey());
      const tk = themeKind(theme);
      const label = tk.kind + (tk.short ? ` · ${esc(tk.short)}` : "");
      const mark = themeMark(theme, "dl-type-ic");
      const chip = tk.special
        ? `<button id="dl-type-chip" class="dl-type special" type="button" title="What's today's Daily?">${mark} <span class="dl-type-lbl">${label}</span> <span class="dl-type-i">${icon("info")}</span></button>`
        : `<span class="dl-type">${mark} <span class="dl-type-lbl">${label}</span></span>`;
      // Lead with just the calendar mark (the "Daily" word dropped) so a long theme label — e.g.
      // "Dynasty · Olympiacos" — has room to show in full within the fixed control-bar column.
      bar.innerHTML = `<span class="dl" title="Daily">${icon("calendar")}</span> ${chip}`;
      const c = el("dl-type-chip");
      if (c) c.addEventListener("click", () => openThemeInfo(theme, themeMark(theme)));
    }
    return;
  }

  if (state.mode === "salary") {
    bar.classList.remove("hidden");
    // Headline the full cap: start at €100 of €100. The mandatory coach + captain reserve is held
    // silently (enforced by canAffordPick → cards go "over budget"), explained on hover — not
    // subtracted from the number, so it doesn't look like €12 vanished before you've picked anyone.
    const reserve = complete() ? 0 : salaryReserve();
    const spent = salarySpent(), left = SALARY_CAP - spent;
    const pct = Math.min(100, (spent / SALARY_CAP) * 100);
    const low = (left - reserve) <= SALARY_FLOOR * (5 - pickedCount()); // near the true spendable floor
    const note = reserve > 0 ? ` title="${formatMoney(reserve)} of this is held for your coach (the captain is free)"` : "";
    bar.innerHTML =
      `<span class="dl"${note}>${icon("coins")} Salary cap</span>` +
      `<span class="cap-meter"><span class="cap-fill${low ? " low" : ""}" style="width:${pct}%"></span></span>` +
      `<b class="cap-left">${formatMoney(left)}</b> of ${formatMoney(SALARY_CAP)} left`;
    return;
  }

  if (state.mode === "goat") {
    bar.classList.remove("hidden");
    bar.innerHTML = `<span class="dl">${icon("star")} G.O.A.T.</span> Build one mythical player, then see how far he drags his real club.`;
    return;
  }

  if (state.mode === "versus" && state.versusRole) {
    bar.classList.remove("hidden");
    bar.innerHTML = state.versusRole === "create"
      ? `<span class="dl">${icon("swords")} Versus</span> Draft your five, then mint a code to challenge a friend.`
      : `<span class="dl">${icon("swords")} Versus</span> Facing <b>${state.versusOpponent.label}</b> ` +
        `<span class="muted">(proj. ${state.versusOpponent.result.wins}–${state.versusOpponent.result.losses})</span> - ` +
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
    modeIntroHTML("swords", "", "Versus") +
    `<div class="versus-intro">` +
      `<p class="muted">The <b>same six draws</b> for both of you. Send a code — the sim plays a best-of-seven.</p>` +
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

// The shared "today's recap" body for the Daily — today's record + share buttons + the 7-day history
// strip. Reads the SAVED result (available right after Play), so it works both post-game (live card)
// and on a cold re-entry (no live roster). Returns the html + the share text + the saved result.
function dailyRecapBody() {
  const r = loadDaily(state.dailyDayKey) || {};
  const streak = currentStreak();
  const txt = shareText({
    dayKey: state.dailyDayKey, wins: r.wins, losses: r.losses,
    label: r.label, stage: r.stage, categoryScores: r.categoryScores, streak,
  });
  // green if that day reached the FINAL FOUR (a genuine title run), red otherwise.
  const madeFinalFour = (st) => ["finalfour", "lostfinal", "champion"].includes(st);
  const cells = dailyHistory(7).reverse().map((h) => {
    const dn = !!h.result;
    const wd = new Date(h.dayKey + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short" });
    const rec = dn ? `${h.result.wins}–${h.result.losses}` : "-";
    const hue = dn ? (madeFinalFour(h.result.stage) ? " win" : " loss") : "";
    const today = h.dayKey === state.dailyDayKey ? " today" : "";
    return `<div class="hist-cell${dn ? " done" : ""}${hue}${today}"><span class="hc-d">${wd}</span><span class="hc-r">${rec}</span></div>`;
  }).join("");
  const html =
    `<div class="dl-badge">${icon("lock")} Today's result</div>` +
    `<div class="record${r.wins === GAMES ? " perfect" : ""}">${r.wins}–${r.losses}</div>` +
    `<div class="verdict stage-${r.stage}">${r.label}</div>` +
    // the share text lives in a hidden <pre> the Copy button reads — no raw text dump on screen.
    `<div class="share-box copy-row"><pre class="share-pre" id="share-pre" hidden>${txt}</pre>` +
      `<button id="share-btn" class="mini-btn">Copy result</button>` +
      (r.card ? `<button id="dl-image-btn" class="ghost-btn dl-lb-btn">Copy image (Spoilers)</button>` : "") +
    `</div>` +
    `<div class="hist-strip">${cells}</div>` +
    `<p class="dl-note">One ranked attempt a day - come back tomorrow for a new board.` +
      (streak > 0 ? ` <span class="streak">${icon("flame", "f-streak")} ${streak}-day streak</span>` : "") +
    `</p>`;
  return { html, txt, r };
}
// Wire the copy buttons inside a rendered recap body (text + spoiler image card).
function wireDailyRecapCopy(recap) {
  wireCopy(recap.txt, "Copy result");
  const ib = el("dl-image-btn");
  if (ib && recap.r && recap.r.card) ib.addEventListener("click", () => copyCard(ib, () => buildShareCanvas(recap.r.card)));
}

// Daily lockout (cold re-entry — you already played today, no live roster) — the recap + a 7-day
// strip + a practice option, with the leaderboard behind a top-right toggle.
function renderDailyLockout(box) {
  box.classList.remove("spun-in", "legends");
  if (state.dlView == null || state.dlView === "today") state.dlView = "result";
  const onBoard = state.dlView === "board";
  const toggle = `<button id="dl-view-toggle" class="dyn-view-toggle">${onBoard ? "← Today's result" : `${icon("trophy", "gold")} Leaderboard`}</button>`;

  if (onBoard) {
    box.innerHTML = `<div class="daily-lock has-toggle">${toggle}<div id="leaderboard" class="lb"></div></div>`;
    el("dl-view-toggle").addEventListener("click", () => { state.dlView = "result"; render(); });
    mountLeaderboard();
    return;
  }

  const recap = dailyRecapBody();
  box.innerHTML =
    `<div class="daily-lock has-toggle">` + toggle + recap.html +
      `<button id="dl-practice" class="play-btn">↻ Practice today's board (unranked)</button>` +
    `</div>`;
  wireDailyRecapCopy(recap);
  el("dl-view-toggle").addEventListener("click", () => { state.dlView = "board"; render(); });
  el("dl-practice").addEventListener("click", () => { state.dailyPractice = true; state.dlView = "result"; reset(); });
  ensureDailySubmit(); // post the run silently so you're on the board even without opening it
}

// Post today's Daily run to the leaderboard once, without rendering it (the board lives behind the
// toggle now). Soft-fails; needs a chosen name (otherwise the board view's name prompt handles it).
async function ensureDailySubmit() {
  const id = getIdentity();
  if (!id || !id.name || state.dailySubmitted) return;
  const saved = loadDaily(state.dailyDayKey);
  const submission = state.dailySubmission || (saved && saved.submission);
  if (!submission) return;
  try { noteFounder(await submitDaily({ ...submission, name: id.name, uid: id.uid, country: id.country || "", team: id.team || "", badge: selectedBadge() })); state.dailySubmitted = true; }
  catch (e) { /* offline — the board view will retry */ }
}

// The 6th-man BENCH slot, right under the court and available the whole time: any selected
// player can be sent here (it's positionless, usage-discounted). It's a placement target that
// lights up while a player is pending, exactly like the court spots.
// When the finished-Daily court is flipped to the ceiling, the whole team view (court + 6th + coach +
// arena) shows the BEST possible's pieces, not yours — so the panel never reads half-yours, half-best.
function courtOptView() {
  const opt = dailyOptimalForCourt();
  return { opt, optView: state.courtView === "optimal" && !!opt };
}

function renderSixth() {
  const box = el("sixth-slot");
  if (dynastyMode() || goatMode()) { box.className = "sixth-slot hidden"; box.innerHTML = ""; return; } // Dynasty 5v5 / G.O.A.T. hero+4 — no bench
  const { opt, optView } = courtOptView();
  if (optView) {
    // Best-possible view: the ceiling's 6th man, read-only (no drop targets, no × ).
    const six = opt.sixth;
    if (six) {
      box.className = "sixth-slot filled";
      box.innerHTML =
        `<span class="six-tag">6TH</span>${avatar(six, six._src.teamCode)}` +
        `<span class="who"><span class="nm">${prettyName(six.playerName)}</span>` +
        `<span class="from">${posLabel(six)} · ${six._src.teamName.split(";")[0]}</span></span>`;
    } else {
      box.className = "sixth-slot empty";
      box.innerHTML = `<span class="six-tag">6TH</span><span class="six-hint">No 6th man</span>`;
    }
    box.onclick = null; box.ondragover = null; box.ondragleave = null; box.ondrop = null;
    return;
  }
  if (state.sixth) {
    const s = state.sixth;
    box.className = "sixth-slot filled";
    // No remove (×) on the bench — it caused edge-case bugs. To change the 6th man, Start over.
    box.innerHTML =
      `<span class="six-tag">6TH</span>${avatar(s, s._src.teamCode)}` +
      `<span class="who"><span class="nm">${prettyName(s.playerName)}</span>` +
      `<span class="from">${posLabel(s)} · ${s._src.teamName.split(";")[0]}</span></span>`;
    return;
  }
  const eligible = (state.pending && sixthOpen() && !wouldStrand(state.pending, "six")) ? " eligible" : "";
  box.className = "sixth-slot empty" + eligible;
  box.innerHTML = `<span class="six-tag">6TH</span><span class="six-hint">Send any player to the bench</span>`;
  box.onclick = () => { if (state.pending && sixthOpen() && !wouldStrand(state.pending, "six")) pickSixth(state.pending); };
  box.ondragover = (e) => { if (dragging && sixthOpen() && !isDup(dragging)) { e.preventDefault(); box.classList.add("drop-hot"); } };
  box.ondragleave = () => box.classList.remove("drop-hot");
  box.ondrop = (e) => { e.preventDefault(); box.classList.remove("drop-hot"); if (dragging) { pickSixth(dragging); dragging = null; } };
}

function renderControl() {
  const done = complete();
  // Once the FIVE IS SET the spin bar is dead weight — Spin + the re-spins all go disabled, so leaving
  // it up is a trap: on a phone it's the prominent control, and tapping the greyed Spin does nothing
  // while the real next step (Spin the arena, below) goes unnoticed. Hide it the moment the squad is
  // complete (not just after the reveal), so attention lands on the arena/coach step + the nav button.
  el("control-bar").classList.toggle("hidden", done || inGauntlet() || (dynastyMode() && !state.dynSub));
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
  // "Start over" is normally hidden (per playtest feedback). SAFETY NET: if you're somehow stuck —
  // a drawn offer where no player is placeable and no re-spin is left — surface it so there's never a
  // hard soft-lock. The fixed-board guard should prevent reaching here, but this guarantees an escape.
  const anyRespin = canRespin("club") || canRespin("year") || canRespin("both");
  const stuck = !done && !!state.offer && !state.spinning &&
    (state.offer.players || []).every((p) => !canPlace(p)) && !anyRespin;
  el("reset-btn").classList.toggle("hidden", !stuck);
}

// Arena sits above the court and shows the RESULT of the spin (idle until then).
function renderVenue() {
  const box = el("venue");
  // While drafting, the arena and coach are just promises — collapse both into ONE slim line so
  // the court and the category bars (the things you actually act on) stay above the fold.
  if (!complete()) {
    box.className = "venue slim";
    // Don't promise what the mode won't give: Dynasty has an arena but NO coach, and G.O.A.T. has
    // neither (its phases are home → spin → result), so it gets no idle line at all.
    // G.O.A.T. has no arena/coach step, so it makes no promise — but the line KEEPS its footprint
    // so the court stays level with every other mode (same reason the lobby reserves the spin bar).
    if (goatMode()) {
      box.className = "venue slim";
      box.innerHTML = `<div class="venue-idle placeholder">${icon("arena")} &nbsp;</div>`;
      return;
    }
    const unlocks = dynastyMode() ? "Arena unlocks" : "Arena & coach unlock";
    box.innerHTML = `<div class="venue-idle">${icon("arena")} ${unlocks} after your five</div>`;
    return;
  }
  box.className = "venue";
  // Best-possible view: the ceiling's home arena (its own club colours + rating).
  const { opt, optView } = courtOptView();
  if (optView && opt.arena) {
    const ar = opt.arena, ast = clubStyle(ar.teamCode);
    box.innerHTML = `<div class="venue-head">Home arena</div>` +
      arenaSVG(ast.primary, ast.secondary, ar.rating, ar.cap) +
      `<div class="venue-name">${ar.name} <span class="flames">${arenaFlames(ar.rating)}</span></div>`;
    return;
  }
  // Dynasty: the home arena is frozen for the whole run (independent of the churning squad).
  if (inGauntlet() && state.dynasty.arena) {
    const ar = state.dynasty.arena;
    box.innerHTML = `<div class="venue-head">Home arena</div>` +
      arenaSVG(ar.primary, ar.secondary, ar.rating, ar.cap) +
      `<div class="venue-name">${ar.name} <span class="flames">${arenaFlames(ar.rating)}</span></div>`;
    return;
  }
  if (!state.arenaSpun) { box.innerHTML = `<div class="venue-idle">${icon("arena")} Spin for your home arena →</div>`; return; }
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
  // Best-possible view: the ceiling's coach (no "N of your 6" — it isn't your roster).
  const { opt, optView } = courtOptView();
  const co = optView ? opt.coach : chosenCoach();
  if (!co) {
    box.innerHTML = `<div class="bench-head">Coach</div><div class="bench-idle">No coach</div>`;
    return;
  }
  // "Coach" sits inline with the name (same type), and after the season is played we drop the
  // "N of your 5" count to save vertical room — it's already shown on the coach-pick cards.
  const meta = (state.revealed || optView)
    ? `<div class="bench-meta">${archetypeLabel(co.coach)}</div>`
    : `<div class="bench-meta">${archetypeLabel(co.coach)} · Coached ${co.count} of your 6</div>`;
  box.innerHTML =
    `<div class="bench-line"><span class="bench-tag">Coach</span>` +
    `<span class="venue-name">${prettyName(co.coach.name)}</span></div>` + meta;
}

function renderCourt() {
  // On a finished Daily the same court flips between YOUR five and the board's best possible five.
  const opt = dailyOptimalForCourt();
  const optView = state.courtView === "optimal" && !!opt;
  const five = optView ? opt.five : state.slots;
  // "home court" treatment: team-colour paint, a centre-court abbreviation, a colour frame. Gated on
  // courtRevealed so the arena outcome shows first. The optimal view has no single home club, so
  // rather than dropping the tint (which looked broken), it gets the golden LEGENDS treatment.
  const home = (!optView && state.courtRevealed && state.arenaSlot !== null) ? state.slots[state.arenaSlot] : null;
  const st = optView
    ? { primary: "#c8a23a", secondary: "#e6c65a", abbr: "BEST" } // golden "best possible" court
    : (home ? clubStyle(home._src.teamCode) : null);
  const wrap = el("court-wrap");
  wrap.classList.toggle("has-home", !!st);
  wrap.classList.toggle("optimal-court", optView);
  wrap.classList.toggle("sweep", !!st && !optView); // colour sweep only on the real home reveal, not the flip
  if (st) { wrap.style.setProperty("--home", st.primary); wrap.style.setProperty("--home2", st.secondary); }
  const paint = el("c-paint"), mark = el("c-mark"), sweep = el("court-sweep");
  if (paint) { paint.style.fill = st ? st.primary : "transparent"; paint.style.fillOpacity = st ? 0.28 : 0; }
  if (mark) { mark.textContent = st ? st.abbr : ""; mark.style.fill = st ? st.primary : "transparent"; mark.style.fillOpacity = st ? 0.16 : 0; }
  if (sweep) sweep.style.background = st ? st.primary : "transparent"; // the directional wash

  const box = el("court-spots");
  box.innerHTML = "";
  SLOTS.forEach((slot, i) => {
    const s = five[i];
    const eligible = state.pending && !s && slot.pos === state.pending.pos && !wouldStrand(state.pending, i);
    const spot = document.createElement("div");
    spot.className = "spot " + (s ? "filled" : "empty") + (eligible ? " eligible" : "");
    spot.style.left = slot.x + "%";
    spot.style.top = slot.y + "%";
    if (s) {
      const st = clubStyle(s._src.teamCode);
      const cap = !optView && salaryMode() && state.captain === s.playerCode ? `<span class="cap-pip" title="Captain">C</span>` : "";
      spot.innerHTML =
        `<span class="disc" style="background:${st.primary};color:${textOn(st.primary)};box-shadow:inset 0 0 0 2px ${st.secondary}">${monogram(s.playerName)}</span>${cap}` +
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
    hint.innerHTML = `Placing <b>${surname(state.pending.playerName)}</b> - click ${targets.join(" / ")} (or drag him there).`;
  } else hint.textContent = "";

  updateCourtFlip(opt, optView);
}

// Mobile-only compact court tray, pinned above the bottom nav. Mirrors the five court slots so you can
// place a pending pick without scrolling down to the full court. Hidden on desktop + on the finished
// result; GOAT and the Dynasty gauntlet run their own screens, so it stays out of their way.
function renderCourtTray() {
  const tray = el("court-tray");
  if (!tray) return;
  // Only the modes that use the standard 2G/2F/1C court + bench (GOAT, Dynasty and Versus run their own
  // screens); never on the finished result; and NOT while the inline court is showing (between picks),
  // since the court replaces the tray there — the tray is for PLACING, when an offer/pending is up.
  const drafting = ["classic", "daily", "salary"].includes(state.mode) && !(complete() && state.revealed) && !courtVisibleNow();
  tray.classList.toggle("hidden", !drafting);
  document.body.classList.toggle("has-tray", drafting);
  if (!drafting) { tray.innerHTML = ""; return; }
  const slotHTML = (s, eligible, dataSlot, emptyLbl) => {
    if (s) {
      const st = clubStyle(s._src.teamCode);
      const cap = salaryMode() && state.captain === s.playerCode ? `<span class="tray-c">C</span>` : "";
      return `<div class="tray-slot filled"><span class="tray-disc" style="background:${st.primary};color:${textOn(st.primary)};box-shadow:inset 0 0 0 2px ${st.secondary}">${monogram(s.playerName)}</span>${cap}<span class="tray-nm">${surname(s.playerName)}</span></div>`;
    }
    return `<button class="tray-slot empty${eligible ? " eligible" : ""}" data-slot="${dataSlot}"${eligible ? "" : " disabled"}><span class="tray-disc"><span class="tray-disc-lbl">${emptyLbl}</span></span><span class="tray-nm muted">${emptyLbl}</span></button>`;
  };
  let html = SLOTS.map((slot, i) => slotHTML(state.slots[i], state.pending && !state.slots[i] && slot.pos === state.pending.pos && !wouldStrand(state.pending, i), i, slot.label)).join("");
  if (state.sixth) html += slotHTML(state.sixth, false, "six", "6th");
  else if (sixthOpen()) html += slotHTML(null, !!state.pending && !wouldStrand(state.pending, "six"), "six", "6th");
  tray.innerHTML = html;
  tray.querySelectorAll(".tray-slot.eligible").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.slot === "six") pickSixth(state.pending);
    else placeAt(+b.dataset.slot, state.pending);
  }));
}

// Mobile bottom-nav center button — one contextual primary action so the draft loop never needs the
// top bar. It mirrors whichever primary button is live on screen (Spin between picks, then Arena →
// Captain → Play through the endgame). When the pool is up it points at the list; after a result it
// offers a fresh game. Called at the end of every render so the label + action stay in step.
function mobilePrimaryBtn() {
  return Array.from(document.querySelectorAll(".spin-btn"))
    .find((b) => b.offsetParent !== null && !b.disabled) || null;
}
const PLAY_LABELS = { "spin-btn": "Spin", "arena-spin-btn": "Arena", "captain-done": "Captain", "play-btn": "Play", "goat-spin": "Spin", "goat-lock-go": "Build", "vi-create": "Play" };
function syncMobilePlay() {
  const btn = el("mnav-play"); if (!btn) return;
  const lbl = btn.querySelector("span");
  const primary = mobilePrimaryBtn();
  let text = "Play", disabled = false, action = null;
  if (state.spinning) { text = "…"; disabled = true; }
  else if (primary) { text = PLAY_LABELS[primary.id] || "Play"; action = () => primary.click(); }
  else if (state.offer) { text = "Pick"; action = () => scrollToOnMobile("offer", "start"); }
  else {
    const rb = el("reset-btn");
    if (rb && rb.offsetParent !== null) { text = "New"; action = () => rb.click(); }
    else action = () => window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (lbl) lbl.textContent = text;
  btn.classList.toggle("disabled", disabled);
  btn._action = disabled ? null : action;
}

// The "reveal the best five" control on the sidebar court (finished Daily only): a top-right toggle
// button (Best ⇄ Yours) and a caption with the record of whichever five is on court.
function updateCourtFlip(opt, optView) {
  const ctrl = el("court-flip-ctrl"), cap = el("court-caption");
  if (!ctrl || !cap) return;
  if (!opt) { ctrl.classList.add("hidden"); cap.classList.add("hidden"); return; }
  ctrl.classList.remove("hidden"); cap.classList.remove("hidden");
  const my = state.dailyMyRec || { wins: 0, losses: 0 };
  ctrl.innerHTML = `${icon("spin")}<span class="cfc-lbl">${optView ? "Yours" : "Best"}</span>`;
  cap.innerHTML = optView
    ? `<b>Best possible</b> · ${opt.wins}–${opt.losses}${optExtras(opt)}`
    : `<b>Your five</b> · ${my.wins}–${my.losses}${myExtras()}`;
  ctrl.onclick = flipCourt;
}
// Your OWN 6th man / coach / home arena — the pieces off the five-spot court — so "Your five" reads as a
// full team, matching the "Best possible" caption (which lists the same via optExtras).
function myExtras() {
  const bits = [];
  if (state.sixth) bits.push(`6th ${surname(state.sixth.playerName)}`);
  const co = chosenCoach();
  if (co && co.coach) bits.push(`Coach ${co.coach.name.split(",")[0]}`);
  const ar = chosenArena();
  if (ar && ar.name) bits.push(ar.name);
  return bits.length ? `<span class="cfc-extra">${bits.join(" · ")}</span>` : "";
}

// The extras behind the "best possible" record — the 6th man, coach and home arena the ceiling used
// (none of which fit on the five-spot court), so the higher record reads as earned, not mysterious.
function optExtras(opt) {
  const bits = [];
  if (opt.sixth) bits.push(`6th ${surname(opt.sixth.playerName)}`);
  if (opt.coach && opt.coach.coach) bits.push(`Coach ${opt.coach.coach.name.split(",")[0]}`);
  if (opt.arena && opt.arena.name) bits.push(opt.arena.name);
  return bits.length ? `<span class="cfc-extra">${bits.join(" · ")}</span>` : "";
}

let courtFlipping = false;
// Flip the sidebar court between your five and the optimal five — turn to edge-on, swap the discs
// while invisible, then turn back from the far side (a clean flip without a mirrored back face).
function flipCourt() {
  if (courtFlipping || !dailyOptimalForCourt()) return;
  courtFlipping = true;
  const wrap = el("court-wrap");
  const onHalf = (e) => {
    if (e.target !== wrap || e.propertyName !== "transform") return;
    wrap.removeEventListener("transitionend", onHalf);
    state.courtView = state.courtView === "optimal" ? "you" : "optimal";
    renderCourt();
    renderSixth(); renderBench(); renderVenue(); // swap the 6th / coach / arena in sync with the five
    wrap.style.transition = "none";
    wrap.style.transform = "perspective(1200px) rotateY(-90deg)";
    requestAnimationFrame(() => {
      wrap.style.transition = "transform 0.24s ease-out";
      wrap.style.transform = "perspective(1200px) rotateY(0deg)";
      setTimeout(() => { wrap.style.transition = ""; wrap.style.transform = ""; courtFlipping = false; }, 260);
    });
  };
  wrap.addEventListener("transitionend", onHalf);
  wrap.style.transition = "transform 0.24s ease-in";
  wrap.style.transform = "perspective(1200px) rotateY(90deg)";
}

function sortedPool(pool) {
  let list = [...pool.players];
  const soloPos = soloPosDaily(); if (soloPos) list = list.filter((p) => p.pos === soloPos); // rule-breaker day: only that position is draftable
  if (state.posFilter !== "ALL") list = list.filter((p) => p.pos === state.posFilter);
  // Price is a Salary-only sort — most expensive first (like the stat sorts, big at the top).
  // Everywhere else (or if "price" lingers after leaving Salary) fall back to the minutes default.
  const key = state.sortBy === "price" && !salaryMode() ? "mpg" : state.sortBy;
  if (key === "price") { list.sort((a, b) => priceOf(b) - priceOf(a)); return list; }
  const val = (p) => (key === "mpg" ? (p.mpg ?? 0) : (p.box[key] ?? 0));
  list.sort((a, b) => val(b) - val(a)); // purely the chosen stat (minutes by default)
  return list;
}

// Sort-dropdown options. Salary mode tacks on a Price sort — the one mode where a player's cost is
// part of the puzzle; keeps the select from blanking if "price" lingers after switching modes.
function sortOptions() {
  if (state.sortBy === "price" && !salaryMode()) state.sortBy = "mpg";
  const opts = salaryMode() ? [...SORTS, ["price", "€"]] : SORTS;
  return opts.map(([v, l]) => `<option value="${v}"${state.sortBy === v ? " selected" : ""}>${l}</option>`).join("");
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
  const sortSel = sortOptions();
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
    // Fixed-board (Daily/Versus/weekly Dynasty): his slot IS open, but taking him now would strand a
    // position the remaining forced picks can't fill. Say so — otherwise the card just greys out with
    // no reason ("why can't I pick this guard when a guard spot is open?").
    else if (!ok && fixedBoardArr())
      tag = `<span class="tag strand" title="A later pick can only fill certain positions — taking him now would leave a spot none of them can cover. Draft the scarcer position from this club first.">would strand a slot</span>`;
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
    // Salary: the € price IS the player's PIR, so no separate PIR chip — the number speaks for itself.
    const priceChip = salaryMode()
      ? `<span class="price${affordable ? "" : " over"}" title="Price = EuroLeague PIR">${formatMoney(priceOf(p))}</span>` : "";
    card.innerHTML =
      `<div class="card-top">${avatar(p, pool.teamCode)}` +
        `<div class="who"><div class="name">${prettyName(p.playerName)}</div>` +
        `<div class="sub"><span class="pos">${posLabel(p)}</span><span class="mpg">${p.mpg.toFixed(0)} mpg</span></div></div>` +
        priceChip + `</div>` +
      `<div class="line">${boxLine(p, true)}</div>` + tag;
    grid.appendChild(card);
  });
}

// Bare player spend (starters + 6th), no coach, no captain surcharge — the base every commit-time
// affordability check builds on.
const playersSpent = () => filled().reduce((a, s) => a + priceOf(s), 0) + (state.sixth ? priceOf(state.sixth) : 0);

// Salary only: the starter cards for the captain step. FREE (he doubles his impact in the sim, costs
// nothing), so every starter is a valid pick — exactly one is always selected. The €value shown is
// the player's price (= his PIR), a hint at who's the strongest to build around.
function captainSection() {
  if (!salaryMode()) return "";
  // Salary: order the starters by price, most expensive first (the priciest man is the likely focal point).
  const cards = filled().slice().sort((a, b) => priceOf(b) - priceOf(a)).map((s) => {
    const sel = state.captain === s.playerCode;
    const st = clubStyle(s._src.teamCode);
    return `<button class="cap-card${sel ? " sel" : ""}" data-cap="${s.playerCode}" style="--team:${st.primary}">` +
      `<span class="cap-crest" style="background:${st.primary};color:${textOn(st.primary)};box-shadow:inset 0 0 0 2px ${st.secondary}">${st.abbr}</span>` +
      `<div class="cap-body">` +
        `<div class="cc-name">${prettyName(s.playerName)}</div>` +
        `<div class="cap-sub">${posLabel(s)} · ${s._src.seasonLabel} · ${formatMoney(priceOf(s))}</div>` +
        `<div class="cap-line">${boxLine(s, true)}</div>` +
      `</div>` +
      (sel ? `<span class="cap-c">C</span>` : "") +
    `</button>`;
  }).join("");
  return `<div class="cap-cards">${cards}</div>`;
}

// Keep the mandatory Salary picks valid. Captain is free → default/repair to your best (highest-PIR)
// starter. Coach is a cheap hire → default to the best-fit affordable, or a free caretaker if even
// the journeyman won't fit (rare). Re-run each render so a user's change re-settles both.
function reconcileSalaryCommit() {
  if (!salaryMode()) return;
  const players = playersSpent();
  const starters = filled();
  if (!captainPlayer() && starters.length) { // default/repair the (free) captain to your best man
    const best = starters.slice().sort((a, b) => (b.pir ?? 0) - (a.pir ?? 0))[0];
    state.captain = best ? best.playerCode : null;
  }
  const opts = coachOptions(); // sorted best-fit first
  const coachFits = (e) => players + coachCost(e.coach) <= SALARY_CAP;
  const cur = chosenCoach();
  if (!cur || !coachFits(cur)) state.coachName = (opts.find(coachFits) || {}).coach?.name || null;
}

// Endgame, in the left (players) area. Two steps before the record is revealed:
//   1) spin for your home arena   2) pick your coach   (Salary: + name a captain)  -> Play.
function renderCommit() {
  const box = el("commit");
  if (!complete() || state.revealed) { box.classList.add("hidden"); _commitStep = null; return; }
  box.classList.remove("hidden");

  // Salary Step 0 — name your CAPTAIN, before the arena. Free and mandatory; his ×2 impact shows
  // live on the category bars, so you pick who the offense runs through by watching the bars shift.
  if (salaryMode() && !state.captainConfirmed) {
    if (!captainPlayer() && filled().length) { // default to your best (highest-PIR) man
      const best = filled().slice().sort((a, b) => (b.pir ?? 0) - (a.pir ?? 0))[0];
      state.captain = best ? best.playerCode : null;
    }
    box.innerHTML = `<div class="commit-inner"><h3>Name your captain</h3>` +
      `<p class="captain-sub">Your captain runs the offense, and his impact counts <b>double</b>.</p>` +
      salaryLineHTML() +
      captainSection() +
      `<button id="captain-done" class="spin-btn">Confirm captain →</button></div>`;
    box.querySelectorAll(".cap-card").forEach((b) =>
      b.addEventListener("click", () => { state.captain = b.dataset.cap || state.captain; render(); }));
    el("captain-done").addEventListener("click", () => { state.captainConfirmed = true; render(); });
    if (commitStepEntered("captain")) revealCatBars();
    return;
  }

  // Step 1 — spin the arena
  if (!state.arenaSpun) {
    if (state.arenaRolling) {
      box.innerHTML = `<div class="commit-inner"><h3>Finding your home floor…</h3>` +
        `<div class="reels"><div class="reel-box arena" id="arena-reel">···</div></div></div>`;
    } else {
      // show the candidate buildings first, then spin among them
      // DISPLAY ORDER ONLY: strongest atmosphere first, so the list reads as a ranked set of prizes
      // (it used to follow court-slot order, PG→SG→…, which said nothing). Deliberately sorting a COPY
      // here — spinArena() indexes its weighted pool by the order arenaChoices() returns, and the Daily
      // draw is seeded and mirrored by the server resolver, so reordering that would change outcomes.
      const list = arenaChoices()
        .slice()
        .sort((a, b) => arenaFor(state.slots[b]._src.teamCode, state.slots[b].season).rating
                      - arenaFor(state.slots[a]._src.teamCode, state.slots[a].season).rating)
        .map((i) => {
        const s = state.slots[i], a = arenaFor(s._src.teamCode, s.season);
        return `<li>${badge(s._src.teamCode)} <b>${a.name}</b> <span class="muted">${s._src.seasonLabel}` +
          ` · <span class="flames">${arenaFlames(a.rating)}</span></span></li>`;
      }).join("");
      box.innerHTML = `<div class="commit-inner"><h3>Your five is set</h3>` +
        `<p>Spin for your <b>home arena</b>:</p>` +
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
  // we default to the best-fit (the one who had most of your five), and the player can switch. In
  // Salary the coach is a PAID hire (priced by pedigree) and reconcileSalaryCommit keeps the
  // mandatory captain + coach affordable together.
  let opts = coachOptions();
  // Display order: grouped by TYPE (archetype), then strongest (pedigree) first — consistent everywhere.
  opts = opts.slice().sort((a, b) =>
    archetypeLabel(a.coach).localeCompare(archetypeLabel(b.coach)) || (b.coach.pedigree || 0) - (a.coach.pedigree || 0));
  // Default AFTER the sort, so the pre-selected card is the FIRST one you see. (It used to default to
  // the best-FIT coach and then get re-sorted, which scattered the highlight into the middle of the list.)
  if (salaryMode()) reconcileSalaryCommit();
  else if (opts.length && !state.coachName) state.coachName = opts[0].coach.name;
  const coachRoom = SALARY_CAP - playersSpent(); // salary: budget left for the coach (captain is free)
  const card = (name, arch, priced, disabled) => {
    const sel = (state.coachName || "") === name;
    return `<button class="coach-card${sel ? " sel" : ""}" data-coach="${name}"${disabled ? " disabled" : ""}>` +
      `<div class="cc-name">${prettyName(name)}${priced}</div>` +
      `<div class="cc-arch">${arch}</div></button>`;
  };
  // The exact category deltas are hidden by design — you pick a coach on his identity
  // (archetype) and fit (how many of your five he had), read against your category bars, not by
  // reading off "+4.0 defense". The pedigree tier still shows as a badge.
  const cards = opts.map((e) => {
    const ped = pedigreeLabel(e.coach);
    const pedTag = ped ? `<span class="cc-ped">${ped}</span>` : "";
    const cost = coachCost(e.coach);
    const priced = salaryMode() ? ` <span class="cc-price">${formatMoney(cost)}</span>` : "";
    const disabled = salaryMode() && (state.coachName || "") !== e.coach.name && cost > coachRoom;
    return card(e.coach.name, `${archetypeLabel(e.coach)}${pedTag} · Coached ${e.count} of your 6`, priced, disabled);
  }).join("");

  const playLabel = state.mode === "versus"
    ? (state.versusRole === "create" ? "Mint challenge code" : "Play the duel")
    : "Play the season";
  // Salary caretaker: eligible coaches exist but the budget can't afford any → an interim coach (free, no boost).
  const caretaker = salaryMode() && opts.length && !state.coachName;
  const coachHead = salaryMode() ? "Hire your coach" : "Pick your coach";
  box.innerHTML = `<div class="commit-inner"><h3>${coachHead}</h3>` +
    salaryLineHTML() +
    (opts.length
      ? `<div class="coach-cards">${cards}</div>`
      : `<p>No coach on record managed any of your five.</p>`) +
    (caretaker ? `<p class="coach-note">No coach fits your remaining budget, so you'll field an <b>interim coach</b> (no boost). Free up room to hire one.</p>` : "") +
    `<button id="play-btn" class="spin-btn">${playLabel}</button></div>`;
  box.querySelectorAll(".coach-card").forEach((b) =>
    b.addEventListener("click", () => { state.coachName = b.dataset.coach || null; render(); }));
  if (commitStepEntered("coach")) revealCatBars();
  el("play-btn").addEventListener("click", () => {
    state.revealed = true;
    if (state.mode === "daily" && !state.dailyPractice) saveDailyResult();
    else if (state.mode === "versus") {
      state.versusResult = state.versusRole === "create" ? { code: makeChallengeCode() } : runDuel();
      render();
      return;
    }
    startReveal();
    // On a phone the reveal animates in the result card, which is often off-screen from the Play
    // button — scroll to it so you actually watch the season play out.
    scrollToOnMobile("result-card", "start");
  });
}

// Persist the finished daily (record, stage, category grid) and update the streak.
function saveDailyResult() {
  const res = myProjection();
  const post = runPostseason(state.slots, state.data.seasons, state.pools, res.wins, state.sixth, curDailyBoss());
  // Capture the CHOICES (not the score) for the leaderboard — the server re-simulates them. Saved
  // WITH the result so a later page load can still post (the in-memory copy is lost on reload).
  const submission = buildDailySubmission();
  const result = {
    wins: res.wins, losses: res.losses, stage: post.stage, label: post.label,
    categoryScores: res.categoryScores,
    // capture the share-card data NOW (the roster is live) so the lockout — which clears the
    // roster — can still redraw the image card later.
    card: shareCardData(),
    submission,
  };
  const already = loadDaily(state.dailyDayKey);
  state.dailyStreak = already ? currentStreak() : saveDaily(result, state.dailyDayKey);
  state.dailySubmission = submission;
  state.dailySubmitted = false;
  state.dlView = "result"; // a fresh ranked play opens on the detailed result, not a stale board view
  state.dailyMyRec = { wins: res.wins, losses: res.losses }; // your record, for the court flip caption
  // Feats (and their celebration) are unlocked from the result render path once the reveal settles —
  // see renderResult — so a newly earned badge pops after you see the outcome, not before.
}

// The compact, verifiable record of what you drafted: which of the six draws each pick came from
// and which player, plus the chosen coach. The server rebuilds the board and re-runs the engine.
function buildDailySubmission() {
  // Assign each pick a DISTINCT draw that actually contains it. Normal boards → one match per player
  // (matched on teamCode AND seasonLabel, since a board can hold two draws of the same club in
  // different seasons). A Legends board has SIX identical draws, so the used-set just hands out
  // distinct slots in order — otherwise every legend would map to draw 0 and collide.
  const used = new Set();
  const slotFor = (pl) => {
    const idx = state.dailyBoard.findIndex((pool, i) => !used.has(i) &&
      pool.teamCode === pl._src.teamCode && pool.seasonLabel === pl._src.seasonLabel &&
      pool.players.some((p) => p.playerCode === pl.playerCode));
    if (idx >= 0) used.add(idx);
    return idx;
  };
  const starters = state.slots.map((s) => ({ slot: slotFor(s), code: s.playerCode })); // court order
  const sixth = { slot: slotFor(state.sixth), code: state.sixth.playerCode };
  const co = chosenCoach();
  return { dayKey: state.dailyDayKey, starters, sixth, coach: co ? co.coach.code : null };
}

/* ---------------- Daily leaderboard ---------------- */

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Mount the leaderboard into the lockout recap: a one-time name prompt, then the standings.
// Every failure is soft - a missing/undeployed backend just shows "offline", never breaks daily.
async function mountLeaderboard() {
  const box = el("leaderboard");
  if (!box) return;
  const id = getIdentity();
  if (!id || !id.name) { box.innerHTML = nameFormHTML(); wireNameForm(box); return; }

  box.innerHTML = `<div class="lb-head">Today's leaderboard</div><div class="lb-load">Loading…</div>`;
  // Post the run, but NEVER let a post failure hide the standings - the board is fetched separately.
  // Recover the submission from the saved result if this is a fresh load (it's idempotent server-side).
  const saved = loadDaily(state.dailyDayKey);
  const submission = state.dailySubmission || (saved && saved.submission);
  if (submission && !state.dailySubmitted) {
    try { noteFounder(await submitDaily({ ...submission, name: id.name, uid: id.uid, country: id.country || "", team: id.team || "", badge: selectedBadge() })); state.dailySubmitted = true; }
    catch (e) { /* keep going - we still show the board below */ }
  }
  try {
    const data = await fetchLeaderboard(state.dailyDayKey, id.uid);
    box.innerHTML = leaderboardHTML(data, id);
    const change = el("lb-change-name");
    if (change) change.addEventListener("click", (e) => {
      e.preventDefault(); box.innerHTML = nameFormHTML(id.name); wireNameForm(box);
    });
  } catch (e) {
    box.innerHTML = `<div class="lb-head">Today's leaderboard</div>` +
      `<div class="lb-off">Leaderboard is temporarily unavailable - try again in a bit.</div>`;
  }
}

function nameFormHTML(current = "") {
  return `<div class="lb-head">Join the leaderboard</div>` +
    `<p class="lb-note">Pick a display name - no sign-up. It's saved on this device.</p>` +
    `<div class="lb-name"><input id="lb-name-input" type="text" maxlength="20" placeholder="Your name" ` +
      `value="${escapeHTML(current)}" autocomplete="off" spellcheck="false" />` +
      `<button id="lb-name-save" class="mini-btn">Save & post</button></div>`;
}

function wireNameForm(box, remount = mountLeaderboard) {
  const input = el("lb-name-input"), save = el("lb-name-save");
  const commit = () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    saveName(v);
    remount();
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
    const cup = r.stage === "champion" ? ` <span class="lb-cup" title="EuroLeague Champions">${icon("trophy", "gold")}</span>` : "";
    return `<tr class="${mine ? "me" : ""}"><td class="lb-rank">${r.rank}</td>` +
      `<td class="lb-name-cell">${lbNameInner(r)}</td>` +
      `<td class="lb-rec">${r.wins}–${r.losses}${cup}</td><td class="lb-stage">${escapeHTML(r.label || "")}</td></tr>`;
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
  state.msTraveled = false; // let the missed-standings marker travel again for this fresh reveal
  state.championCelebrated = false; // re-arm the champion trophy pop-up for this fresh reveal
  state.resultView = "bracket"; // the reveal plays out on the bracket, round by round
  render();
  const post = runPostseason(state.slots, state.data.seasons, state.pools,
    myProjection().wins, state.sixth, curDailyBoss());
  // Reveal order: record (stage 0) → seeding (stage 1) → each round in turn → verdict. The extra
  // +1 step is the seeding, so a bracket with N rounds has N+1 reveal steps. A MISSED season gets a
  // slower, three-beat reveal with more umpf: record (0) → the ladder + the slowly-travelling marker
  // (1) → the finish/verdict line pops in as it lands (2) → the category readout settles (done).
  // Every record opens on the standings ladder (beat 1: marker travels to your seed/finish). A missed
  // season then pops its verdict (total 2). A made postseason adds that ladder beat BEFORE the bracket
  // entry + each round (total = rounds + 2). Slower steps so each beat lands with a pause ("gradual").
  const total = post.rounds.length ? post.rounds.length + 2 : 2;
  // Recursive timer so ONLY the ladder beat is long (the marker travels slowly up the whole board),
  // while the bracket rounds keep a normal pace. The ladder shows at stage 1; the wait UNTIL stage 2
  // must cover the slow travel, so it's LADDER_TRAVEL_MS + a beat.
  clearInterval(revealTimer);
  const tick = () => {
    state.revealStage++;
    if (state.revealStage > total) { state.resultView = "summary"; render(); return; } // settle on Summary
    render();
    const wait = state.revealStage === 1 ? LADDER_TRAVEL_MS + 550 : 1300; // stage 1 = the slow ladder travel
    revealTimer = setTimeout(tick, wait);
  };
  revealTimer = setTimeout(tick, 1100); // record → ladder
}


// The category-balance popup (mobile): a peek button by the court opens the current bars, which
// otherwise scroll out of view while drafting. Reuses the live #cat-bars markup, so it's always
// up to date the moment it opens.
function openCatModal() {
  const box = el("cat-modal");
  const bars = el("cat-bars") ? el("cat-bars").innerHTML : "";
  const gate = el("gate-note") ? el("gate-note").textContent : "";
  box.innerHTML =
    `<div class="cat-modal-back" data-close="1"></div>` +
    `<div class="cat-modal-card" role="dialog" aria-modal="true" aria-label="Category balance">` +
      `<button class="cat-modal-x" data-close="1" type="button" aria-label="Close">✕</button>` +
      `<h2 class="cat-modal-h">Category balance</h2>` +
      `<div class="cat-modal-bars">${bars}</div>` +
      (gate ? `<p class="cat-modal-gate">${gate}</p>` : "") +
    `</div>`;
  box.classList.remove("hidden");
  box.querySelectorAll('[data-close="1"]').forEach((e) => e.addEventListener("click", closeCatModal));
}
function closeCatModal() { el("cat-modal").classList.add("hidden"); }

// The court popup (mobile): the inline court is hidden while drafting (the bottom tray shows the five),
// so this button pops the full court on demand. It MOVES the live #court-wrap node into the modal
// (not a clone — the court uses element IDs, so a copy would collide) and returns it on close.
let _courtHome = null; // remembers where #court-wrap lives when not popped
function openCourtModal() {
  const box = el("court-modal"), wrap = el("court-wrap");
  if (!box || !wrap) return;
  _courtHome = { parent: wrap.parentNode, next: wrap.nextElementSibling };
  box.innerHTML =
    `<div class="cat-modal-back" data-close="1"></div>` +
    `<div class="cat-modal-card court-modal-card" role="dialog" aria-modal="true" aria-label="Your team">` +
      `<button class="cat-modal-x" data-close="1" type="button" aria-label="Close">✕</button>` +
      `<h2 class="cat-modal-h">Your team</h2>` +
      `<div class="court-modal-holder"></div>` +
      courtModalExtrasHTML() +
    `</div>`;
  box.querySelector(".court-modal-holder").appendChild(wrap);
  box.classList.remove("hidden");
  renderCourt(); // repaint the discs now that the node lives in the modal
  box.querySelectorAll('[data-close="1"]').forEach((e) => e.addEventListener("click", closeCourtModal));
}
function closeCourtModal() {
  const box = el("court-modal"), wrap = el("court-wrap");
  if (box) box.classList.add("hidden");
  // Return the court to its home in the sidebar so the inline layout (and the result flip) still work.
  if (wrap && _courtHome && _courtHome.parent) {
    if (_courtHome.next && _courtHome.next.parentNode === _courtHome.parent) _courtHome.parent.insertBefore(wrap, _courtHome.next);
    else _courtHome.parent.appendChild(wrap);
    _courtHome = null;
  }
}
const courtModalOpen = () => el("court-modal") && !el("court-modal").classList.contains("hidden");

// The 6th man, home arena and coach for the Court popup — the pieces that don't fit on the five-spot
// court but are part of your team. Shows each as soon as it's set, with a "comes later" placeholder
// before that (the 6th is a bench pick; the arena is spun and the coach chosen after your five).
function courtModalExtrasHTML() {
  const row = (lbl, valHTML, pending) =>
    `<div class="cm-row${pending ? " pending" : ""}"><span class="cm-lbl">${lbl}</span><span class="cm-val">${valHTML}</span></div>`;
  const rows = [];
  if (state.sixth) {
    const st = clubStyle(state.sixth._src.teamCode);
    rows.push(row("6th man",
      `<span class="cm-disc" style="background:${st.primary};color:${textOn(st.primary)}">${monogram(state.sixth.playerName)}</span>` +
      `${surname(state.sixth.playerName)} <span class="cm-sub">${state.sixth._src.seasonLabel}</span>`));
  } else {
    rows.push(row("6th man", "Bench pick, still open", true));
  }
  const a = state.arenaSpun ? chosenArena() : null;
  rows.push(a
    ? row("Arena", `${a.name} <span class="flames">${arenaFlames(a.rating)}</span>`)
    : row("Arena", "Spun after your five", true));
  const c = chosenCoach();
  rows.push(c
    ? row("Coach", `${prettyName(c.coach.name)}`)
    : row("Coach", "Chosen after your five", true));
  return `<div class="cm-extras">${rows.join("")}</div>`;
}

function renderCats() {
  // On the final screen the balance lives inside the record card instead (see renderResult).
  const wrap = el("sidebar-cats");
  const peek = el("cat-peek");
  const showBars = !(complete() && state.revealed);
  if (peek) peek.classList.toggle("hidden", !showBars); // mobile peek button follows the inline bars
  if (!showBars) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const picks = filled();
  // Include the captain (his ×2 impact shows on the bars the moment he's named); the coach is null
  // until his own step, so the bars build up players → +captain → +coach across the commit flow.
  // A benched 6th man also nudges the bars (his positive z's, discounted), so compute the projection
  // whenever there's a starter OR a 6th — otherwise benching a player first left the bars dead-flat.
  const res = (picks.length || state.sixth) ? projectRecord(picks, state.data.seasons, undefined, 1, coachCatDeltas(), state.sixth, captainCode()) : null;
  updateCatBars(el("cat-bars"), res, picks.length);
  el("gate-note").textContent = res && picks.length >= 2 ? `Weakest link: ${capCat(weakestBarCat(res.categoryScores, picks.length))}` : "";
}

// The summary list, revealed one step at a time: seeding first (shown ≥ 1), then each round.
function renderRounds(post, res, shown) {
  if (shown < 1) return "";
  const seed = seedFor(res.wins);
  const entryNote = res.wins >= 24 ? "Straight into the playoffs"
    : res.wins >= 20 ? "Into the play-in" : "Missed the postseason";
  const seedLine =
    `<div class="round seed pop"><span class="rname">Seed</span>` +
    `<span class="rbody">${seed ? ordinal(seed) + " seed" : "-"} · ${entryNote}</span></div>`;
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
  if (wins >= 30) return 1;                        // 30+ (79%+) is a win rate no real EuroLeague team has
                                                   // ever posted → effectively a locked 1st seed
  if (wins >= 24) return Math.max(2, Math.min(6, 30 - wins)); // 29-28→2, 27→3, 26→4, 25→5, 24→6
  if (wins >= 20) return Math.min(10, 30 - wins);  // 23→7, 22→8, 21→9, 20→10
  return null; // missed the postseason
}
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 - n % 10 === 10) ? 0 : n % 10] || "th");

// Where a MISSED-postseason record finishes in the 20-team table (11th–20th). Seeds 1–10 make the
// postseason (seedFor); below that we spread the field so a strong near-miss lands ~11th and a bottom
// team lands last. Per design, 6–7 wins (and anything below) is always dead last, 20th.
function finishFor(wins) {
  const seed = seedFor(wins);
  if (seed) return seed;                                   // 1–10 reached the play-in / playoffs
  const pos = 11 + Math.round(((19 - wins) / (19 - 7)) * 9); // 19→11th … 7→20th
  return Math.max(11, Math.min(20, pos));
}

// The "you missed the postseason" panel — a 20-slot league ladder (playoffs / play-in / out) with your
// finish lit, so a season that never reached a bracket still lands on a real, staged standings reveal
// instead of stopping dead. `shown` gates it into the same round-by-round reveal cadence.
// The 20-team final-standings ladder with the orange "you" marker that travels (see animateMissedMarker)
// from 20th up to your finishing position `pos`. Shown for EVERY record now — a missed season lands here
// with a verdict `finish` line; a postseason team lands on its SEED here, then the bracket takes over
// (finish = "" for those; the bracket entry carries "3rd seed"). `finish` is held to shown >= 2 so it
// pops in as a beat after the travel.
function standingsLadderHTML(pos, shown, finish) {
  if (shown < 1) return "";
  const cells = Array.from({ length: 20 }, (_, i) => {
    const p = i + 1, tier = p <= 6 ? "po" : p <= 10 ? "pi" : "out";
    return `<span class="ms-cell ${tier}"></span>`; // the orange "you" marker is a travelling overlay (below)
  }).join("");
  return `<div class="missed-standings">` +
    `<div class="ms-head pop">Final standings</div>` +
    // The label reads from data-pos and the marker COUNTS UP as it climbs, so the final placing isn't
    // sitting there before the animation runs (it gave the answer away).
    `<div class="ms-ladder" data-pos="${pos}">${cells}<div class="ms-marker" data-pos="${state.msTraveled ? ordinal(pos) : ordinal(20)}"></div></div>` +
    `<div class="ms-scale"><span>1st</span><span>20th</span></div>` +
    `<div class="ms-legend"><span class="ms-k po"></span>Playoffs<span class="ms-k pi"></span>Play-in<span class="ms-k out"></span>Out</div>` +
    ((finish && shown >= 2) ? finish : "") +
  `</div>`;
}
function missedStandingHTML(res, shown, label) {
  const pos = finishFor(res.wins);
  const msg = (label || "").replace(/\.$/, ""); // the verdict, inline next to the finish (no trailing period)
  const finish = `<div class="ms-finish pop"><b>${ordinal(pos)}</b> of 20${msg ? ` · ${msg}` : ""}</div>`;
  return standingsLadderHTML(pos, shown, finish);
}

// How long the orange marker takes to travel from the 20th cell up to your seed/finish. Shared with the
// reveal timer (startReveal), which holds the ladder beat this long before the next beat lands.
const LADDER_TRAVEL_MS = 1800;
// The orange marker RATCHETS up from 20th, snapping through EACH position it passes (with a little tick
// pulse), decelerating to a crawl as it nears your seed/finish — so it reads as counting through the
// standings, not gliding. Once travelled (state.msTraveled), a re-render places it statically.
let markerTimer = null;
function animateMissedMarker(card) {
  const ladder = card.querySelector(".ms-ladder");
  if (!ladder) return;
  const marker = ladder.querySelector(".ms-marker");
  const cells = ladder.querySelectorAll(".ms-cell");
  const pos = +ladder.dataset.pos;
  if (!marker || cells.length < 20 || !pos) return;
  const center = (i) => cells[i].offsetLeft + cells[i].offsetWidth / 2;
  // The marker wears the COLOUR of the tier it's currently on (green playoffs / gold play-in / grey out)
  // as it climbs, and only turns to our orange when it lands on your final position.
  const tierBg = (i) => { const q = i + 1; return q <= 6 ? "var(--good)" : q <= 10 ? "var(--gate)" : "var(--muted)"; };
  const targetIdx = pos - 1;
  marker.style.width = cells[0].offsetWidth + "px";
  marker.style.transition = "none"; // no glide — each hop is an instant snap, the tick pulse marks it
  if (state.msTraveled) { marker.style.left = center(targetIdx) + "px"; marker.style.background = "var(--accent)"; marker.dataset.pos = ordinal(pos); return; } // already shown
  state.msTraveled = true;
  clearTimeout(markerTimer);
  const path = []; for (let i = 19; i >= targetIdx; i--) path.push(i); // 20th → … → your position
  const n = path.length, T = LADDER_TRAVEL_MS, p = 1.9; // p>1 → fast off the 20th, crawling at the end
  const at = (j) => T * Math.pow(j / n, p);             // when hop j lands (cumulative, decelerating)
  marker.style.left = center(19) + "px"; marker.style.background = tierBg(19); marker.style.boxShadow = "none";
  marker.dataset.pos = ordinal(20);
  marker.getBoundingClientRect();
  let j = 0;
  const hop = () => {
    const isLast = j === n - 1;
    marker.style.left = center(path[j]) + "px";
    marker.dataset.pos = ordinal(path[j] + 1); // the placing it's standing on right now
    marker.style.background = isLast ? "var(--accent)" : tierBg(path[j]); // tier colour en route, orange on arrival
    marker.style.boxShadow = isLast ? "" : "none";                        // restore the accent glow only at the finish
    marker.classList.remove("tick"); void marker.offsetWidth; marker.classList.add("tick"); // retrigger the pulse
    j++;
    if (j < n) markerTimer = setTimeout(hop, Math.max(28, at(j + 1) - at(j)));
  };
  markerTimer = setTimeout(hop, Math.max(28, at(1)));
}

// The REAL bracket view: an entry node (your seed / finish) then each tie as a two-sided matchup
// with both scores, the winner highlighted. Same `shown` reveal as the summary list.
function renderBracket(post, res, shown, hideEntry = false) {
  const seed = seedFor(res.wins);
  const entryNote = res.wins >= 24 ? "Straight into the playoffs"
    : res.wins >= 20 ? "Into the play-in" : "Missed the postseason";
  // shown: 0 = nothing yet, 1 = seeding, 2 = +round 1, … (record is revealed separately, above).
  // hideEntry (GOAT: the seed line is revealed as its own step) ⇒ no entry row and `shown` counts
  // ROUNDS directly (shown 1 = round 1).
  const entry = (!hideEntry && shown >= 1)
    ? `<div class="bk-entry pop">` +
        (seed ? `<span class="bk-seed">${ordinal(seed)} seed</span>` : `<span class="bk-seed miss">-</span>`) +
        `<span class="bk-entry-note">${entryNote}</span>` +
      `</div>`
    : "";

  const rounds = post.rounds.slice(0, hideEntry ? shown : Math.max(0, shown - 1)).map((r) => {
    const tally = r.series ? r.series.split(/[^\d]+/) : null; // "3–1" → ["3","1"], dash-agnostic
    const you = tally ? tally[0] : r.us;
    const oppSc = tally ? tally[1] : r.them;
    const kind = r.series ? "Best-of-5" : "";
    const club = `${clubStyle(r.opp.teamCode).abbr} ${r.opp.seasonLabel}`;
    // Tap-to-expand: reveal the exact five this club fielded against you, so the opponent is a real
    // team you can inspect (and judge for yourself) - not an arbitrary club-season string.
    const five = r.five || [];
    const fiveBlock = five.length
      ? `<div class="bk-five">` +
          `<div class="bk-five-head">${badge(r.opp.teamCode)} ${r.opp.teamName} <span class="muted">${r.opp.seasonLabel}</span></div>` +
          five.map((p) => dynStatRow(p, r.opp.teamCode)).join("") +
        `</div>`
      : "";
    return `<details class="bk-tie ${r.win ? "won" : "out"} pop">` +
      `<summary class="bk-tie-sum">` +
        `<div class="bk-tie-head"><span class="bk-rname">${r.name}</span>` +
          (kind ? `<span class="bk-kind">${kind}</span>` : "") +
          (five.length ? `<span class="bk-expand">their five ▾</span>` : "") + `</div>` +
        `<div class="bk-match">` +
          `<div class="bk-side ${r.win ? "adv" : "eliminated"}"><span class="bk-team">You</span><span class="bk-sc">${you}</span></div>` +
          `<div class="bk-side ${r.win ? "eliminated" : "adv"}"><span class="bk-team">${club}</span><span class="bk-sc">${oppSc}</span></div>` +
        `</div>` +
      `</summary>` +
      fiveBlock +
    `</details>`;
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
      `<span class="dyn-prow-pos">${posLabel(p)}${from ? ` · ${from}` : ""}</span></span>` +
    `<span class="dyn-prow-box">${boxLine(p)}</span>` +
  `</${tag}>`;
}

const dynHeader = (d, note) =>
  `<div class="dyn-head"><div class="dyn-streak">${icon("flame", "f-streak")} <b>${d.streak}</b> <span>streak</span></div>` +
    `<div class="dyn-round">${note}</div></div>`;

// Full-court spots: your five fill the bottom half (basket at the bottom), the opponent's the top
// half (basket at the top) - the half-court SLOTS mirrored into each end.
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
// `tinted` controls the home-club colour wash - off during the home/away spin, then animated in (CSS
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
const dynBoardTitle = (board) => (board === "alltime" ? `${icon("crown")} All-time streaks` : `${icon("calendar")} This week · ${board}`);

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
  if (d.boardErr) { box.innerHTML = `<div class="dyn-lb-status off">Leaderboard offline - your streak: ${icon("flame", "f-streak")} ${d.streak}</div>`; return; }
  box.innerHTML = `<div class="dyn-lb-status">Posting your run…</div>`;
  ensureDynSubmit();
}

function renderDynNameEntry(box, title) {
  box.innerHTML =
    `<div class="dyn-lb-head">${title || `${icon("crown")} All-time streaks`}</div>` +
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
    board, name: id.name, uid: id.uid, country: id.country || "", team: id.team || "", badge: selectedBadge(),
    seed: d.seed, startFive: d.startFive,
    arena: d.arena ? { teamCode: d.arena.teamCode, season: d.arena.season } : null,
    choices: d.choices,
  }).then(noteFounder);
}

function renderDynBoard(box, data, title) {
  const rows = (data.top || []).map((r) =>
    `<li class="${data.you && r.rank === data.you.rank ? "me" : ""}"><span class="lb-rank">${r.rank}</span>` +
    `<span class="lb-name">${esc(r.name)}</span><span class="lb-streak">${icon("flame", "f-streak")} ${r.streak}</span></li>`).join("");
  box.innerHTML =
    (title == null ? `<div class="dyn-lb-head">${icon("crown")} All-time streaks</div>` : title ? `<div class="dyn-lb-head">${title}</div>` : "") +
    (rows ? `<ol class="dyn-lb-list">${rows}</ol>` : `<div class="dyn-lb-status">Be the first to post a streak.</div>`) +
    (data.you ? `<div class="dyn-lb-you">You're <b>#${data.you.rank}</b> of ${data.total} · best <b>${icon("flame", "f-streak")} ${data.you.streak}</b></div>` : "");
}

// Fetch + render a board into a container (read-only), with graceful offline handling.
async function loadDynBoard(container, board) {
  const id = getIdentity();
  container.innerHTML = `<div class="dyn-lb-status">Loading…</div>`;
  try { renderDynBoard(container, await fetchDynastyBoard(board, id && id.uid), dynBoardTitle(board)); }
  catch (e) { container.innerHTML = `<div class="dyn-lb-status off">Leaderboard offline.</div>`; }
}

/* ---------------- leaderboard hub — 3 modes, each with two boards ---------------- */

// Short postseason label for a leaderboard row (#6: the result is visible next to the score).
const STAGE_SHORT = {
  champion: "Champions", lostfinal: "Runner-up", finalfour: "Final Four", playoffs: "Playoffs",
  playin: "Play-in", almost: "Missed", rebuild: "Rebuild", relegation: "Relegated",
};
const stageShort = (st) => STAGE_SHORT[st] || "";

const HUB = [
  // Sub-tab order is consistent everywhere: the recurring board (Daily / Weekly) on the LEFT, All-time on the RIGHT.
  { mode: "classic", label: "Classic", ic: "ball", legend: "classic", subs: [
    { id: "daily", label: "Daily", fetch: (uid, scope) => fetchLeaderboard(utcDayKey(), uid, scope), render: (b, d) => recordBoard(b, d) },
    { id: "alltime", label: "All-time", fetch: (uid, scope) => fetchClassicAllTime(uid, scope), render: (b, d) => scoreBoard(b, d, {}) },
  ] },
  { mode: "salary", label: "Salary", ic: "coins", legend: "salary", subs: [
    { id: "alltime", label: "All-time", fetch: (uid, scope) => fetchSalaryAllTime(uid, scope), render: (b, d) => scoreBoard(b, d, { salary: true }) },
  ] },
  // Dynasty's mark is the FLAME (its win-streak identity — same icon the help card and the Dynasty-10
  // badge use). It was "swords", which is Versus's mark, so the two modes read as the same thing.
  { mode: "dynasty", label: "Dynasty", ic: "flame", legend: "dynasty", subs: [
    { id: "weekly", label: "Weekly", fetch: (uid, scope) => fetchDynastyBoard(weekKey(), uid, scope), render: (b, d) => renderDynBoard(b, d, "") },
    { id: "alltime", label: "All-time", fetch: (uid, scope) => fetchDynastyBoard("alltime", uid, scope), render: (b, d) => renderDynBoard(b, d, "") },
  ] },
  { mode: "goat", label: "G.O.A.T.", ic: "star", legend: "goat", subs: [
    { id: "daily", label: "Daily", fetch: (uid, scope) => fetchGoatLeaderboard(utcDayKey(), uid, scope), render: (b, d) => scoreBoard(b, d, { goat: true }) },
    { id: "alltime", label: "All-time", fetch: (uid, scope) => fetchGoatAllTime(uid, scope), render: (b, d) => scoreBoard(b, d, { goat: true }) },
  ] },
];
// A country/team board only crowns a #1 once it has at least this many players — otherwise "1st of 1"
// is hollow, so we show a "come fill the board" nudge instead (the solo-leader-as-bait framing).
const MIN_POOL_TITLE = 3;
const HUB_LEGENDS = {
  classic: "Classic score:<ul><li><b>100 per regular-season win</b> - a 38-0 season = 3,800.</li><li><b>+100</b> per playoff win.</li><li><b>−100</b> per playoff loss.</li><li><b>+100</b> per Final Four game.</li><li>Plus each Final Four game's <b>point margin</b> (win by 12 → +12).</li></ul>",
  goat: "G.O.A.T. score:<ul><li><b>100</b> per regular-season win - a 38-0 season = 3,800.</li><li><b>+100</b> per playoff win.</li><li><b>−100</b> per playoff loss.</li><li><b>+100</b> per Final Four game.</li><li>Plus each Final Four game's <b>point margin</b> (win by 12 → +12).</li><li><b>+250</b> per individual award (MVP, Best Defender, Final Four MVP).</li><li><b>+500</b> for the full <b>G.O.A.T. season</b>.</li></ul>",
  salary: "Salary score:<ul><li><b>100</b> per regular-season win - a 38-0 season = 3,800.</li><li><b>+100</b> per playoff win.</li><li><b>−100</b> per playoff loss.</li><li><b>+100</b> per Final Four game.</li><li>Plus each Final Four game's <b>point margin</b> (win by 12 → +12).</li><li><b>+50</b> per €1M left <b>unspent</b> under the €100M cap, scaled by your win rate.</li></ul>",
  dynasty: "Ranked by your <b>longest winning streak</b>.",
};
let hubMode = "classic", hubSub = "alltime", hubLegend = false, hubScope = "world";

function openHub() { el("lb-hub").classList.remove("hidden"); renderHub(); loadCrews(); }
function closeHub() { el("lb-hub").classList.add("hidden"); }

// Fetch the player's crews into state (soft-fails offline), then refresh the hub if it's open.
async function loadCrews() {
  const id = getIdentity();
  if (!id || !id.uid) { state.crews = []; return; }
  try {
    const d = await fetchCrews(id.uid);
    state.crews = d.crews || [];
    if (!el("lb-hub").classList.contains("hidden")) renderHub();
  } catch (e) { /* offline — leave state.crews as-is */ }
}

/* ---- Crews management modal (create / join / leave private friend leagues) ---- */
const ensureUid = () => getIdentity() || saveProfile({}); // mint a device id if there isn't one yet
function openCrews() { el("crews-modal").classList.remove("hidden"); renderCrews(); loadCrews(); }
function closeCrews() { el("crews-modal").classList.add("hidden"); }
function renderCrews(msg) {
  const box = el("crews-modal");
  const crews = state.crews || [];
  const mine = crews.length
    ? `<ul class="crew-list">${crews.map((c) =>
        `<li><span class="crew-nm">👥 ${esc(c.name)}</span>` +
        `<span class="crew-meta">${c.members} member${c.members === 1 ? "" : "s"} · code <b class="crew-code">${esc(c.id)}</b></span>` +
        `<button class="crew-leave mini-btn" data-crew="${esc(c.id)}">Leave</button></li>`).join("")}</ul>`
    : `<p class="crew-empty">You're not in any crews yet - create one and share its code, or join a friend's.</p>`;
  box.innerHTML =
    `<div class="crews-backdrop" data-close="1"></div>` +
    `<div class="crews-card" role="dialog" aria-modal="true" aria-label="Crews">` +
      `<button class="crews-close" data-close="1" aria-label="Close">✕</button>` +
      `<h2 class="crews-title">👥 Crews</h2>` +
      `<p class="crews-sub">Private leagues for your friends. Everyone in a crew competes on its own board across every mode - share the code to invite people.</p>` +
      (msg ? `<div class="crews-msg">${esc(msg)}</div>` : "") +
      `<div class="crews-yours">${mine}</div>` +
      `<div class="crews-form"><input id="crew-new-name" class="pf-input" maxlength="20" placeholder="New crew name" autocomplete="off" />` +
        `<button id="crew-create" class="play-btn">Create</button></div>` +
      `<div class="crews-or">or</div>` +
      `<div class="crews-form"><input id="crew-code" class="pf-input" maxlength="12" placeholder="Enter a crew code" autocomplete="off" autocapitalize="characters" />` +
        `<button id="crew-join" class="mini-btn">Join</button></div>` +
    `</div>`;
  box.querySelectorAll("[data-close]").forEach((e) => (e.onclick = closeCrews));
  el("crew-create").onclick = doCreateCrew;
  el("crew-join").onclick = doJoinCrew;
  box.querySelectorAll(".crew-leave").forEach((b) => (b.onclick = () => doLeaveCrew(b.dataset.crew)));
}
async function doCreateCrew() {
  const name = (el("crew-new-name").value || "").trim();
  if (!name) return;
  const id = ensureUid();
  try {
    const d = await createCrew({ name, uid: id.uid, player: id.name || "" });
    hubScope = "crew:" + d.crew.id; // point the hub's lens at the new crew
    await loadCrews();
    renderCrews(`Created “${d.crew.name}” - share code ${d.crew.id} with your friends.`);
  } catch (e) { renderCrews(e.message || "Couldn't create the crew - try again."); }
}
async function doJoinCrew() {
  const code = (el("crew-code").value || "").trim();
  if (!code) return;
  const id = ensureUid();
  try {
    const d = await joinCrew({ code, uid: id.uid, player: id.name || "" });
    hubScope = "crew:" + d.crew.id;
    await loadCrews();
    renderCrews(`Joined “${d.crew.name}” - ${d.crew.members} member${d.crew.members === 1 ? "" : "s"}.`);
  } catch (e) { renderCrews(e.message || "Couldn't join that crew."); }
}
async function doLeaveCrew(code) {
  const id = getIdentity(); if (!id) return;
  try {
    await leaveCrew({ code, uid: id.uid });
    if (hubScope === "crew:" + code) hubScope = "world";
    await loadCrews();
    renderCrews("Left the crew.");
  } catch (e) { renderCrews(e.message || "Couldn't leave - try again."); }
}

function renderHub() {
  const box = el("lb-hub");
  const cur = HUB.find((m) => m.mode === hubMode);
  if (!cur.subs.some((s) => s.id === hubSub)) hubSub = cur.subs[0].id; // clamp when switching modes
  const id = getIdentity() || {};
  const crews = state.crews || [];
  // Clamp the scope if it's no longer backed (profile cleared, or left the crew).
  if ((hubScope === "country" && !id.country) || (hubScope === "team" && !id.team)) hubScope = "world";
  if (hubScope.startsWith("crew:") && !crews.some((c) => "crew:" + c.id === hubScope)) hubScope = "world";
  const modeTabs = HUB.map((m) => `<button class="hub-tab${m.mode === hubMode ? " on" : ""}" data-mode="${m.mode}">${icon(m.ic)} ${m.label}</button>`).join("");
  const subTabs = cur.subs.map((s) => `<button class="hub-subtab${s.id === hubSub ? " on" : ""}" data-sub="${s.id}">${s.label}</button>`).join("");
  // Scope lens — World, your country/team (once set), one chip per crew, and a manager button.
  const chip = (sc, html) => `<button class="hub-scope${hubScope === sc ? " on" : ""}" data-scope="${sc}">${html}</button>`;
  const scopeChips =
    chip("world", "🌍 World") +
    (id.country ? chip("country", `${countryFlag(id.country)} ${esc((countryByCode(id.country) || {}).name || id.country)}`) : "") +
    (id.team ? chip("team", `${lbTeamBadge(id.team)} ${esc(teamName(id.team) || id.team)}`) : "") +
    crews.map((c) => chip("crew:" + c.id, `👥 ${esc(c.name)}`)).join("") +
    `<button class="hub-crews-btn" id="hub-crews-btn">＋ Crews</button>`;
  box.innerHTML =
    `<div class="hub-backdrop" data-close="1"></div>` +
    `<div class="hub-card" role="dialog" aria-modal="true" aria-label="Leaderboards">` +
      `<button class="hub-close" data-close="1" aria-label="Close">✕</button>` +
      `<h2 class="hub-title">${icon("trophy", "gold")} Leaderboards</h2>` +
      `<div class="hub-tabs">${modeTabs}</div>` +
      `<div class="hub-subrow"><div class="hub-subtabs">${subTabs}</div>` +
        `<button class="hub-legend-btn" id="hub-legend-btn">${hubLegend ? "Hide" : "How scoring works"}</button></div>` +
      (scopeChips ? `<div class="hub-scopes">${scopeChips}</div>` : "") +
      (hubLegend ? `<div class="hub-legend">${HUB_LEGENDS[cur.legend]}</div>` : "") +
      `<div class="hub-body" id="hub-body"><div class="dyn-lb-status">Loading…</div></div>` +
    `</div>`;
  box.querySelectorAll("[data-close]").forEach((e) => (e.onclick = closeHub));
  box.querySelectorAll(".hub-tab").forEach((b) => (b.onclick = () => { hubMode = b.dataset.mode; renderHub(); }));
  box.querySelectorAll(".hub-subtab").forEach((b) => (b.onclick = () => { hubSub = b.dataset.sub; renderHub(); }));
  box.querySelectorAll(".hub-scope").forEach((b) => (b.onclick = () => { hubScope = b.dataset.scope; renderHub(); }));
  const cb = el("hub-crews-btn"); if (cb) cb.onclick = openCrews;
  el("hub-legend-btn").onclick = () => { hubLegend = !hubLegend; renderHub(); };
  loadHubBoard();
}

// The scope object passed to the fetchers: null (World) | {country} | {team} | {crew}, from the lens.
function hubScopeObj() {
  const id = getIdentity() || {};
  if (hubScope === "country" && id.country) return { country: id.country };
  if (hubScope === "team" && id.team) return { team: id.team };
  if (hubScope.startsWith("crew:")) return { crew: hubScope.slice(5) };
  return null;
}
// Human label for the current non-World scope (for the min-pool nudge).
function hubScopeLabel() {
  const id = getIdentity() || {};
  if (hubScope === "country" && id.country) return (countryByCode(id.country) || {}).name || id.country;
  if (hubScope === "team" && id.team) return teamName(id.team) || id.team;
  if (hubScope.startsWith("crew:")) { const c = (state.crews || []).find((x) => "crew:" + x.id === hubScope); return c ? c.name : ""; }
  return "";
}

async function loadHubBoard() {
  const body = el("hub-body"); if (!body) return;
  const cur = HUB.find((m) => m.mode === hubMode);
  const sub = cur.subs.find((s) => s.id === hubSub) || cur.subs[0];
  const id = getIdentity();
  const scope = hubScopeObj();
  try {
    const data = await sub.fetch(id && id.uid, scope);
    sub.render(body, data);
    // Min-pool nudge: a country/team board with < 3 players can't crown a #1 yet — invite framing.
    // Crews are private and deliberately small, so a crew of two still crowns a #1 (no nudge).
    if (scope && !scope.crew && (data.total || 0) < MIN_POOL_TITLE) {
      body.insertAdjacentHTML("beforeend",
        `<div class="hub-bait">🌱 Only ${data.total || 0} in <b>${esc(hubScopeLabel())}</b> so far - the #1 crown needs ${MIN_POOL_TITLE}. Share King of Europe to fill your board!</div>`);
    }
  } catch (e) { body.innerHTML = `<div class="dyn-lb-status off">Leaderboard offline.</div>`; }
}

// A SCORE-ranked board (Classic all-time, G.O.A.T. daily + all-time): score is the headline, with the
// record + result + hardware shown beneath it (#6).
function scoreBoard(box, data, opts = {}) {
  const rows = (data.top || []).map((r) => {
    const mark = opts.goat && r.goat_season ? ` ${icon("crown", "gold")}` : (r.stage === "champion" ? ` ${icon("trophy", "gold")}` : "");
    const aw = opts.goat && r.awards ? ` · ${r.awards}★` : "";
    const saved = opts.salary && r.unspent != null ? ` · ${formatMoney(r.unspent)} left` : ""; // efficiency shown on the Salary board
    return `<li class="${data.you && r.rank === data.you.rank ? "me" : ""}"><span class="lb-rank">${r.rank}</span>` +
      `<span class="lb-name">${lbNameInner(r)}</span>` +
      `<span class="lb-val"><b>${(r.score || 0).toLocaleString()}</b>` +
        `<span class="lb-sub">${r.wins}–${r.losses} · ${stageShort(r.stage)}${mark}${aw}${saved}</span></span></li>`;
  }).join("");
  box.innerHTML =
    (rows ? `<ol class="dyn-lb-list score">${rows}</ol>` : `<div class="dyn-lb-status">No scores yet - be the first.</div>`) +
    (data.you ? `<div class="dyn-lb-you">You're <b>#${data.you.rank}</b> of ${data.total} · best <b>${(data.you.score || 0).toLocaleString()}</b></div>` : "");
}

// Daily Classic board: record (W–L) + result mark, ranked by wins.
function recordBoard(box, data) {
  const rows = (data.top || []).map((r) => {
    const cup = r.stage === "champion" ? ` ${icon("trophy", "gold")}` : "";
    return `<li class="${data.you && r.rank === data.you.rank ? "me" : ""}"><span class="lb-rank">${r.rank}</span>` +
      `<span class="lb-name">${lbNameInner(r)}</span>` +
      `<span class="lb-val"><b>${r.wins}–${r.losses}</b><span class="lb-sub">${stageShort(r.stage)}${cup}</span></span></li>`;
  }).join("");
  box.innerHTML =
    (rows ? `<ol class="dyn-lb-list score">${rows}</ol>` : `<div class="dyn-lb-status">No entries yet today.</div>`) +
    (data.you ? `<div class="dyn-lb-you">You're <b>#${data.you.rank}</b> of ${data.total} · <b>${data.you.wins}–${data.you.losses}</b></div>` : "");
}

// The Dynasty lobby: choose the Weekly shared challenge or an Endless run, with this week's standings.
function renderDynastyLobby(box) {
  const wk = weekKey();
  const played = loadWeekly(wk);
  box.innerHTML =
    `<div class="mode-lobby">` +
    modeIntroHTML("flame", "f-streak", "Dynasty") +
    `<div class="dyn-lobby">` +
      `<div class="dyn-lobby-card weekly">` +
        `<div class="dlc-tag">${icon("calendar")} Weekly Challenge</div>` +
        `<h3>The same gauntlet for everyone</h3>` +
        `<p>This week's fixed board, one ranked run. Streaks compared worldwide.</p>` +
        (played
          ? `<div class="dlc-done">Played this week - ${icon("flame", "f-streak")} <b>${played.streak}</b>. New board Monday.</div>`
          : `<button id="dyn-weekly-go" class="play-btn">Play this week</button>`) +
      `</div>` +
      `<div class="dyn-lobby-card endless">` +
        `<div class="dlc-tag">${icon("infinity")} Endless Run</div>` +
        `<h3>Draft your own five</h3>` +
        `<p>Free draft, a fresh gauntlet every time. Chase your best streak.</p>` +
        `<button id="dyn-endless-go" class="play-btn">Start a run</button>` +
      `</div>` +
    `</div>` +
    `</div>`;
  const wg = el("dyn-weekly-go"); if (wg) wg.addEventListener("click", () => enterDynastySub("weekly"));
  const eg = el("dyn-endless-go"); if (eg) eg.addEventListener("click", () => enterDynastySub("endless"));
  // No inline standings here — the lobby is the mode's front door, and the board is one tap away in
  // the Leaderboards hub. Keeps Dynasty and G.O.A.T.'s opening screens identical in shape.
}

function renderDynasty(card) {
  const d = state.dynasty;
  const opp = d.opp;
  const oppName = `${badge(opp.teamCode)} <b>${opp.teamName}</b> <span class="muted">${opp.seasonLabel}</span>`;

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
      `<div class="dyn-loc-spin"><span class="dyn-loc-cap">Home or away -</span> ` +
        `<span class="dyn-loc-reel" id="dyn-loc-reel">· · ·</span></div>` +
      `<div class="dyn-abovecourt">${badge(opp.teamCode)} ${opp.teamName} <span class="muted">${opp.seasonLabel}</span></div>` +
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
    if (!d.featsChecked) { d.featsChecked = true; checkFeats({ dynastyStreak: d.streak }); } // Dynasty 10/20 feats

    const onBoard = d.overView === "board";
    const toggle = `<button id="dyn-view-toggle" class="dyn-view-toggle">${onBoard ? "← My run" : `${icon("trophy", "gold")} Leaderboard`}</button>`;
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
          `<div class="dyn-streak-big">${icon("flame", "f-streak")} ${d.streak}</div>` +
          `<div class="dyn-streak-cap">win streak</div>` +
          `<div class="dyn-scoreline loss">Lost ${lg.theirs}–${lg.mine} · fell to ${oppName}</div>` +
          `<div class="result-cats-wrap"><div class="rc-head">Where your dynasty ended up</div>` +
            `<div class="result-cats">${catBarsHTML(res)}</div>` +
            gateLineHTML(res) +
          `</div>` +
          (d.streak > 0 ? `<button id="dyn-share-card" class="ghost-btn dl-lb-btn">${icon("copy")} Copy run card</button>` : "") +
          again +
        `</div>`;
      const gb = el("rc-gate-btn"); if (gb) gb.addEventListener("click", () => showTeamReport(res));
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
      `<p class="dyn-sub">Recruit one from ${opp.teamName} - you'll choose who to release next.</p>` +
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
    `<div class="dyn-loc ${d.home ? "home" : "away"}">${d.home ? `${icon("home")} Home · ` + (d.arena ? d.arena.name : "your floor") : `${icon("plane")} Away · ` + opp.arenaName}</div>` +
    `<div class="dyn-abovecourt">${badge(opp.teamCode)} ${opp.teamName} <span class="muted">${opp.seasonLabel}</span></div>` +
    dynastyCourtHTML(d, true) +
    `<div class="dyn-play-wrap"><button id="dyn-play" class="play-btn">▶ Play the game</button></div>`;
  el("dyn-play").addEventListener("click", playGauntletGame);
}

/* ================= GOAT mode ================= */

const goatFmt = (s, v) => (s === "ts" ? Math.round((v || 0) * 100) + "%" : Math.round((v || 0) * 10) / 10);
const goatStatOf = (p, s) => (s === "ts" ? p.box.ts : p.box[s] || 0);

function renderGoat() {
  el("commit").classList.add("hidden");
  el("result-card").classList.add("hidden");
  const box = el("offer");
  box.classList.remove("spun-in", "legends");
  box.style.removeProperty("--team");
  if (!state.goat) state.goat = { phase: "home", sub: null, homeClub: null, base: null, grafts: [], donor: null, usedIds: [], dailyBoard: null, dayKey: null, scenario: null, practice: false, submitted: false };
  const g = state.goat;
  if (!g.sub) return renderGoatLobby(box, g);          // Free vs Daily
  // Daily: today's ranked attempt already spent (and not practising) → the lockout recap + board.
  if (g.sub === "daily" && !g.practice && g.phase !== "result" && loadGoatDaily(g.dayKey)) return renderGoatDailyLockout(box, g);
  // The reel while spinning — same markup + rollTo animation the Classic draft uses.
  if (state.spinning) {
    box.innerHTML = `<div class="reel-wrap" id="reel-wrap"><div class="reel-label">Drawing…</div>` +
      `<div class="reels"><div class="reel-box" id="reel-club">···</div>` +
      `<div class="reel-box year" id="reel-year">····</div></div></div>`;
    return;
  }
  if (g.phase === "result") return renderGoatResult(box);
  if (!state.offer) return renderGoatIntro(box, g);   // no club drawn yet → the "spin" prompt for this step
  return renderGoatBoard(box, g);                     // a club is showing → pick from it
}

// The G.O.A.T. lobby: Free play vs today's Daily challenge (mirrors the Dynasty lobby).
function renderGoatLobby(box, g) {
  const dayKey = utcDayKey();
  const played = loadGoatDaily(dayKey);
  box.innerHTML =
    `<div class="goat-wrap goat-intro">` +
      modeIntroHTML("star", "gold", "G.O.A.T.") +
      // Recurring challenge LEFT, free run RIGHT — the same order as the leaderboard sub-tabs and the
      // Dynasty lobby. ("Classic" was renamed Endless: it collided with the actual Classic mode.)
      `<div class="dyn-lobby">` +
        `<div class="dyn-lobby-card weekly">` +
          `<div class="dlc-tag">${icon("calendar")} Daily challenge</div>` +
          `<h3>The same board for everyone</h3>` +
          `<p>One board, shared worldwide today. One ranked run.</p>` +
          (played
            ? `<div class="dlc-done">Played today - <b>${played.wins}–${played.losses}</b>. New board tomorrow.</div>`
            : `<button id="goat-daily-go" class="play-btn">Play today's board</button>`) +
        `</div>` +
        `<div class="dyn-lobby-card endless">` +
          `<div class="dlc-tag">${icon("infinity")} Endless</div>` +
          `<h3>Spin your own clubs</h3>` +
          `<p>A fresh club and five source spins, every time.</p>` +
          `<button id="goat-free-go" class="play-btn">Build a G.O.A.T.</button>` +
        `</div>` +
      `</div>` +
      // TEMP: scenario preview (unranked, does not submit). Remove this block when scenarios go live for real.
      `<div class="goat-scen-preview">` +
        `<div class="gsp-tag">${icon("star", "gold")} Preview scenarios (practice, unranked)</div>` +
        `<div class="gsp-row">` +
          GOAT_SCENARIOS.map((s) => `<button class="gsp-btn" data-scen="${s.id}"><b>${s.title}</b><span>${s.team}</span></button>`).join("") +
        `</div>` +
      `</div>` +
    `</div>`;
  box.querySelectorAll(".gsp-btn").forEach((b) => b.addEventListener("click", () => enterGoatScenarioPreview(b.dataset.scen)));
  el("goat-free-go").addEventListener("click", () => enterGoatSub("free"));
  const dg = el("goat-daily-go"); if (dg) dg.addEventListener("click", () => enterGoatSub("daily"));
  const pl = el("goat-daily-go"); if (!pl && played) { /* already played: entering daily shows the lockout */ }
  // let a played-today card still open the lockout/leaderboard
  if (played) { const card = box.querySelector(".dyn-lobby-card.weekly"); if (card) { card.style.cursor = "pointer"; card.addEventListener("click", () => enterGoatSub("daily")); } }
}

// Enter a G.O.A.T. sub-mode. Daily builds today's fixed board once; Free is the classic spin flow.
function enterGoatSub(sub) {
  const g = state.goat;
  g.sub = sub;
  g.practice = false;
  g.scenario = null; // cleared here; set only on a real scenario day below (never leaks into Free)
  if (sub === "daily") {
    g.dayKey = utcDayKey();
    g.scenario = goatScenarioFor(g.dayKey); // a scenario day pins the home club (+ locks the base for icons)
    g.dailyBoard = buildGoatDailyBoard(state.pools, goatDaySeed(g.dayKey), state.data.seasons, g.scenario);
  }
  render();
}

// TEMP: play any scenario now as an unranked practice run (never submits, never touches the leaderboard).
// Remove this together with the lobby preview block once scenarios are live for real.
function enterGoatScenarioPreview(scenId) {
  const g = state.goat;
  const scen = goatScenarioById(scenId);
  if (!scen) return;
  g.sub = "daily";
  g.practice = true; // unranked: bypasses the daily lockout and the save/submit
  g.dayKey = utcDayKey();
  g.scenario = scen;
  g.dailyBoard = buildGoatDailyBoard(state.pools, goatDaySeed(g.dayKey + "|prev|" + scenId), state.data.seasons, scen);
  g.homeClub = null; g.base = null; g.grafts = []; g.donor = null; g.usedIds = [];
  g.phase = "home"; g.submitted = false; g.reveal = null; g.featsChecked = false;
  state.offer = null;
  render();
}

// The animated spin — reuses the Classic reel (rollTo). Never re-rolls; a fresh club each time,
// deduped against your home club and clubs you've already grafted from.
function goatSpin() {
  if (state.spinning || state.offer) return;
  const g = state.goat;
  // Daily: the clubs are FIXED — the reel just lands on today's predetermined home / donor club.
  if (g.sub === "daily") {
    const target = !g.homeClub ? g.dailyBoard.home : g.dailyBoard.donors[g.grafts.length];
    rollTo(target, { club: true, year: true });
    return;
  }
  const used = new Set([g.homeClub && g.homeClub.id, ...(g.usedIds || [])].filter(Boolean));
  let target = null;
  for (let i = 0; i < 80; i++) {
    const t = spin(state.pools);
    if (used.has(t.id)) continue;
    if (!g.homeClub && !canFieldFive(t)) continue; // the home club must be able to field your four-man cast
    target = t; break;
  }
  rollTo(target || spin(state.pools), { club: true, year: true });
}

// A slim scenario banner kept on screen through the build, so the mission stays in view.
function goatScenarioBanner(g) {
  const s = g.scenario;
  if (!s) return "";
  return `<div class="goat-scen-banner"><span class="gsb-t">${icon("star", "gold")} ${s.title}</span><span class="muted">${s.team}</span></div>`;
}

// The "spin" prompt: the intro (home) or the running builder card + a spin button (each graft).
function renderGoatIntro(box, g) {
  const daily = g.sub === "daily";
  const scen = g.scenario;
  if (!g.homeClub) {
    const head = scen
      ? `<div class="goat-scen-tag">${icon("star", "gold")} Scenario</div>` +
        `<h2 class="goat-h">${scen.title}</h2>` +
        `<p class="goat-scen-team">${scen.team}</p>` +
        `<p class="goat-scen-flavor">${scen.flavor}</p>` +
        `<p class="goat-hint">${scen.base ? `Your base is locked: ${scen.lead} is your hero. Take one stat from each of five sources to lift him.` : "Pick any base from the club, then take one stat from each of five sources."}</p>`
      : `<div class="goat-big-icon">${icon("star", "gold")}</div>` +
        `<h2 class="goat-h">${daily ? `${icon("calendar")} Daily G.O.A.T.` : "Build your G.O.A.T."}</h2>` +
        `<p class="goat-sub">Pick a base player, then take one stat from each of five more.</p>`;
    const btn = scen ? (scen.base ? "Meet your hero" : `Reveal ${scen.team}`) : (daily ? "Reveal today's home club" : "Spin your home club");
    box.innerHTML =
      `<div class="goat-wrap goat-intro${scen ? " goat-scen-intro" : ""}">${head}` +
        `<button id="goat-spin" class="spin-btn">${btn}</button>` +
      `</div>`;
  } else {
    const goat = buildGoat(g.base, g.grafts);
    box.innerHTML = `<div class="goat-wrap">${goatBuilderCard(goat, g)}` +
      `<div class="goat-spinrow"><div class="goat-step">${daily ? `${icon("calendar")} ` : ""}Take ${g.grafts.length + 1} of 5</div>` +
      `<button id="goat-spin" class="spin-btn">${daily ? "Reveal next source" : "Spin a player"}</button></div></div>`;
  }
  el("goat-spin").addEventListener("click", goatSpin);
}

function goatBuilderCard(goat, g) {
  const slots = GRAFT_STATS.map((s) => {
    const d = goat.source[s];
    return `<div class="gs${d ? " grafted" : " atbase"}"><span class="gs-lbl">${STAT_LABEL[s]}</span>` +
      `<span class="gs-val">${goatFmt(s, goatStatOf(goat, s))}</span>` +
      `<span class="gs-src${d ? "" : " base"}">${d ? surname(d.playerName) : "base"}</span></div>`;
  }).join("");
  return `<div class="goat-card">` +
    `<div class="goat-card-id">${badge(goat.teamCode)} <b>${surname(goat.playerName)}</b> <span class="muted">${POS_FULL[goat.pos]} · ${g.homeClub.teamName} ${g.homeClub.seasonLabel}</span></div>` +
    `<div class="goat-slots">${slots}</div></div>`;
}

// A donor is selected — show the focused stat picker (which of his six stats to graft).
function goatStatPicker(goat, donor) {
  // All six stats are always offered — you can re-take a stat you already took (overwriting it with a
  // new donor's value). Already-taken stats are marked "held" so it's clear which ones you'd replace.
  const stats = GRAFT_STATS.map((s) => {
    const dv = goatStatOf(donor, s), cv = goatStatOf(goat, s), up = dv > cv, held = !!goat.source[s];
    return `<button class="gsb ${up ? "up" : "down"}${held ? " held" : ""}" data-stat="${s}"><span class="gsb-lbl">${STAT_LABEL[s]}</span>` +
      `<span class="gsb-val">${goatFmt(s, dv)}</span><span class="gsb-cmp">${up ? "▲" : "▼"} now ${goatFmt(s, cv)}</span></button>`;
  }).join("");
  return `<div class="goat-picker-wrap"><div class="goat-step">Take a stat from ${surname(donor.playerName)}</div>` +
    `<div class="goat-picker">${stats}</div><button id="goat-cancel" class="mini-btn">← a different player</button></div>`;
}

// The club board — the SAME card grid the Classic draft uses (sort/filter, spun-in cascade), so the
// player-select screen matches. Clicking a card picks your base (home club) or a graft donor.
function renderGoatBoard(box, g) {
  const grafting = !!g.homeClub;
  // Icon scenario: the base is locked — show the hero to confirm instead of a free base grid.
  if (!grafting && g.scenario && g.scenario.base) return renderGoatLockedBase(box, g, state.offer);
  const goat = grafting ? buildGoat(g.base, g.grafts) : null;

  // a donor is selected → replace the grid with the focused stat picker (like Classic's placement step)
  if (grafting && g.donor) {
    box.innerHTML = `<div class="goat-wrap">${goatBuilderCard(goat, g)}${goatStatPicker(goat, g.donor)}</div>`;
    box.querySelectorAll(".gsb").forEach((b) => b.addEventListener("click", () => goatGraft(b.dataset.stat)));
    el("goat-cancel").addEventListener("click", () => { g.donor = null; render(); });
    return;
  }

  const pool = state.offer, s = clubStyle(pool.teamCode);
  const list = sortedPool(pool);
  const sortSel = sortOptions();
  const posBtns = ["ALL", "G", "F", "C"].map((p) => `<button class="pos-btn${state.posFilter === p ? " on" : ""}" data-pos="${p}">${p === "ALL" ? "All" : p}</button>`).join("");
  box.classList.toggle("spun-in", state.justSpun);
  box.style.setProperty("--team", s.primary);

  box.innerHTML =
    `<div class="goat-wrap goat-board">` +
      goatScenarioBanner(g) +
      (grafting ? goatBuilderCard(goat, g) : "") +
      `<div class="goat-step">${grafting ? `Take ${g.grafts.length + 1} of 5 · pick a player` : (g.scenario ? `Step 1 · pick your base from ${g.scenario.team}` : "Step 1 · pick your base player")}</div>` +
      (grafting ? "" : `<p class="goat-hint">His line is your G.O.A.T.'s start, his position is locked, and this club fills your other four.</p>`) +
      `<div class="offer-head" style="border-color:${s.primary}">` + badge(pool.teamCode) +
        `<div><div class="club">${pool.teamName} <span class="season">${pool.seasonLabel}</span></div>` +
        `<div class="sub">${pool.players.length} players</div></div></div>` +
      `<div class="pool-tools"><label class="sort-lbl">Sort <select id="sort-sel">${sortSel}</select></label>` +
      `<div class="pos-filter">${posBtns}</div></div>` +
      `<div class="pool-grid" id="pool-grid"></div>` +
    `</div>`;

  el("sort-sel").addEventListener("change", (e) => { state.sortBy = e.target.value; render(); });
  box.querySelectorAll(".pos-btn").forEach((b) => b.addEventListener("click", () => { state.posFilter = b.dataset.pos; render(); }));

  const grid = el("pool-grid");
  if (!list.length) { grid.innerHTML = `<p class="empty-hint">No ${POS_FULL[state.posFilter] || ""}s in this squad.</p>`; return; }
  list.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.code = p.playerCode;
    card.style.setProperty("--team", s.primary);
    if (state.justSpun) card.style.setProperty("--i", idx);
    card.addEventListener("click", () => goatPickCard(p));
    card.innerHTML =
      `<div class="card-top">${avatar(p, pool.teamCode)}` +
        `<div class="who"><div class="name">${prettyName(p.playerName)}</div>` +
        `<div class="sub"><span class="pos">${posLabel(p)}</span><span class="mpg">${p.mpg.toFixed(0)} mpg</span></div></div></div>` +
      `<div class="line">${boxLine(p, true)}</div>`;
    grid.appendChild(card);
  });
}

// Icon scenario base step. Either the hero is FIXED (`base.code` → one card + confirm) or you PICK
// from a curated set of legends (`base.pick` → the debate, e.g. Micic or Larkin) — a card each, click
// to build around him. Everything else (grafting) is the same. The resolver enforces the allowed set.
function renderGoatLockedBase(box, g, pool) {
  const b = g.scenario.base;
  const codes = b.pick || [b.code];
  const legends = codes.map((c) => pool.players.find((p) => p.playerCode === c)).filter(Boolean);
  if (!legends.length) return; // guarded: the resolver also enforces the lock
  const isPick = legends.length > 1;
  const s = clubStyle(pool.teamCode);
  box.style.setProperty("--team", s.primary);
  const cardFor = (lp) =>
    `<div class="card locked-base" data-code="${lp.playerCode}" style="--team:${s.primary}">` +
      `<div class="card-top">${avatar(lp, pool.teamCode)}` +
        `<div class="who"><div class="name">${prettyName(lp.playerName)}</div>` +
        `<div class="sub"><span class="pos">${posLabel(lp)}</span><span class="mpg">${lp.mpg.toFixed(0)} mpg</span></div></div></div>` +
      `<div class="line">${boxLine(lp, true)}</div>` +
      (isPick ? `<div class="lb-pick-cta">Build around ${surname(lp.playerName)} →</div>` : "") +
    `</div>`;
  box.innerHTML =
    `<div class="goat-wrap goat-board goat-scen-board">` +
      goatScenarioBanner(g) +
      `<div class="goat-step">${isPick ? "Pick your legend" : "Your hero is locked in"}</div>` +
      `<div class="offer-head" style="border-color:${s.primary}">${badge(pool.teamCode)}` +
        `<div><div class="club">${pool.teamName} <span class="season">${pool.seasonLabel}</span></div>` +
        `<div class="sub">${g.scenario.goalLine}</div></div></div>` +
      `<div class="pool-grid${isPick ? " pick-grid" : ""}">${legends.map(cardFor).join("")}</div>` +
      (isPick ? "" : `<button id="goat-lock-go" class="spin-btn">Build around ${surname(legends[0].playerName)}</button>`) +
    `</div>`;
  if (isPick) box.querySelectorAll(".locked-base").forEach((c) =>
    c.addEventListener("click", () => goatPickCard(legends.find((p) => p.playerCode === c.dataset.code))));
  else el("goat-lock-go").addEventListener("click", () => goatPickCard(legends[0]));
}

function goatPickCard(p) {
  const g = state.goat;
  if (!g.homeClub) {                        // pick your base → his club becomes home, move to grafting
    g.base = p; g.homeClub = state.offer; state.offer = null; g.phase = "graft"; render();
  } else {                                  // select / deselect a graft donor
    g.donor = g.donor && g.donor.playerCode === p.playerCode ? null : p;
    render();
  }
}

function goatGraft(stat) {
  const g = state.goat;
  g.grafts.push({ stat, donor: g.donor });
  g.usedIds = [...(g.usedIds || []), state.offer.id];
  g.donor = null; state.offer = null;
  if (g.grafts.length >= 5) g.phase = "result";
  render();
}

const GOAT_REVEAL_MS = 1000; // base pace of the staged result reveal (awards + bracket rounds are slower)

// Build the ordered reveal STEPS: record → seeding → each earned regular-season award (All-EL → Best
// Defender → Top Scorer → MVP) → the bracket REVEALED ROUND BY ROUND → verdict → Final Four MVP →
// the GOAT's stat line. Each step is { html } (a block), { award, html } (paced slower), or
// { bracket: k } (render the bracket showing k rounds — collapsed to the max shown in renderGoatResult).
function goatRevealItems(goat, five, res, post, aw, scenario = null) {
  const steps = [];
  steps.push({ html: `<div class="record${res.wins === GAMES ? " perfect" : ""} pop">${res.wins}–${res.losses}</div>` });
  const seed = seedFor(res.wins);
  const entryNote = res.wins >= 24 ? "Straight into the playoffs" : res.wins >= 20 ? "Into the play-in" : "Missed the postseason";
  steps.push({ html: `<div class="goat-seed pop">${seed ? ordinal(seed) + " seed · " : ""}${entryNote}</div>` });
  // Awards reveal one at a time but accumulate in a single horizontal row (each is an inline badge).
  for (const a of aw.awards.filter((x) => x.id !== "f4mvp")) {
    steps.push({ award: true, html: `<span class="goat-badge pop${a.id === "mvp" || a.id === "topscorer" ? " gold" : ""}">${a.label}</span>` });
  }
  // The bracket unfolds one round at a time (Play-in → Playoffs → Semifinal → Final), then the verdict.
  for (let k = 1; k <= post.rounds.length; k++) steps.push({ bracket: k });
  steps.push({ html: `<div class="verdict stage-${post.stage} pop">${post.label}</div>` });
  // Scenario payoff: name the achievement when you finish the run, or the hurdle you fell at.
  if (scenario) {
    if (post.stage === "champion")
      steps.push({ html: `<div class="goat-scen-done pop">${icon("trophy", "gold")} You did it. ${scenario.team} are champions of Europe.</div>` });
    else
      steps.push({ html: `<div class="goat-scen-miss pop">${scenario.goalLine} Not this time.</div>` });
  }
  if (post.stage === "champion") {
    if (aw.finalFourMVP && aw.finalFourMVP.isGoat) steps.push({ award: true, html: `<span class="goat-badge pop gold">Final Four MVP</span>` });
    else if (aw.finalFourMVP) steps.push({ html: `<p class="goat-f4-steal pop">Final Four MVP went to teammate <b>${surname(aw.finalFourMVP.winner)}</b> - your G.O.A.T. wasn't the story of the weekend.</p>` });
  }
  const line = GRAFT_STATS.map((s) => {
    const d = goat.source[s];
    return `<div class="gl-stat"><span class="gl-v">${goatFmt(s, goatStatOf(goat, s))}</span>` +
      `<span class="gl-l">${STAT_LABEL[s]}</span><span class="gl-src${d ? "" : " base"}">${d ? surname(d.playerName) : "base"}</span></div>`;
  }).join("");
  const cast = five.filter((p) => !p.goat).map((p) => `<span class="goat-mate"><b>${p.pos}</b> ${surname(p.playerName)}</span>`).join("");
  const sig = five.map((p) => p.playerCode).join("|");
  const rounds = post.rounds.map((r) => {
    const isSeries = !!r.series;               // the Playoffs round is a best-of-five → show averages (15.6)
    const gl = goatGameLine(goat, r.name, sig, isSeries);
    const n = (v) => (isSeries ? v.toFixed(1) : v); // single games stay whole numbers
    return `<div class="goat-round"><span class="gr-name">${r.name}</span>` +
      `<span class="gr-line"><b>${n(gl.pts)}</b> pts · <b>${n(gl.reb)}</b> reb · <b>${n(gl.ast)}</b> ast · ${n(gl.stl)} stl · ${n(gl.blk)} blk · ${Math.round(gl.ts * 100)}% TS</span></div>`;
  }).join("");
  steps.push({ html:
    `<div class="pop">` +
      (aw.goatSeason ? `<div class="goat-slam">${icon("crown", "gold")} THE G.O.A.T. SEASON</div>` : "") +
      `<div class="goat-line">${line}</div>` +
      `<div class="goat-cast-line"><span class="muted">Cast:</span> ${cast}</div>` +
      (rounds ? `<div class="goat-rounds"><div class="gr-head">Your G.O.A.T. through the bracket</div>${rounds}</div>` : "") +
    `</div>` });
  return steps;
}

// Render the revealed steps, collapsing all shown bracket steps into ONE bracket at the highest
// revealed round (so it grows in place instead of stacking).
function goatRevealHTML(steps, shown, post, res) {
  let maxBracket = 0;
  for (let i = 0; i < shown; i++) if (steps[i].bracket) maxBracket = Math.max(maxBracket, steps[i].bracket);
  let out = "", bracketDrawn = false;
  for (let i = 0; i < shown; i++) {
    const s = steps[i];
    if (s.bracket) { if (!bracketDrawn) { out += `<div class="pop goat-bracket-wrap"><div class="goat-bracket">${renderBracket(post, res, maxBracket, true)}</div></div>`; bracketDrawn = true; } }
    else out += s.html;
  }
  return out;
}

function renderGoatResult(box) {
  const g = state.goat;
  const seasons = state.data.seasons;
  const goat = buildGoat(g.base, g.grafts, seasons); // seasons ⇒ apply the freak cap for the sim + awards
  const five = goatFive(goat, g.homeClub, seasons);
  if (!five) {
    box.innerHTML = `<div class="goat-wrap"><p class="goat-hint">This club can't field a legal five around your G.O.A.T. <button id="goat-again" class="mini-btn">↻ New G.O.A.T.</button></p></div>`;
    el("goat-again").addEventListener("click", reset); return;
  }
  const res = projectRecord(five, seasons, undefined, 1, g.scenario ? g.scenario.homeLift || null : null);
  const post = runPostseason(five, seasons, state.pools, res.wins, null, 0, g.scenario ? g.scenario.path : null);
  const aw = computeAwards(goat, five, seasons, res, post, goatPool());
  const items = goatRevealItems(goat, five, res, post, aw, g.scenario);

  if (g.reveal == null) { g.reveal = 1; scheduleGoatReveal(items); } // kick off the staged reveal
  const shown = Math.min(g.reveal, items.length);
  const done = shown >= items.length;
  // Unlock feats this G.O.A.T. run earned (free or daily), once — perfect/champion/final-four + the
  // full G.O.A.T. season.
  if (done && !g.featsChecked) { g.featsChecked = true; checkFeats({ wins: res.wins, stage: post.stage, goatSeason: aw.goatSeason }); }

  const isDaily = g.sub === "daily";
  const score = goatScore({ wins: res.wins, post, awardCount: aw.awards.length, goatSeason: aw.goatSeason });
  // On a finished DAILY run, lock in the result once (ranked only) so re-entry shows the recap.
  if (done && isDaily && !g.practice && !loadGoatDaily(g.dayKey)) {
    saveGoatDaily({
      wins: res.wins, losses: res.losses, stage: post.stage, label: post.label, score,
      awards: aw.awards.map((a) => a.label), goatSeason: aw.goatSeason,
      card: goatShareCardData(goat, five, res, post, aw),
      submission: buildGoatDailySubmission(g),
    }, g.dayKey);
  }
  const dailyPanel = (done && isDaily)
    ? `<div class="goat-score">Daily score <b>${score.toLocaleString()}</b></div>` +
      (g.practice ? `<p class="dl-practice-note">Practice run - not counted.</p>` : `<div id="goat-leaderboard" class="lb"></div>`)
    : "";
  const primary = isDaily
    ? `<button id="goat-again" class="play-btn">← G.O.A.T. lobby</button>`
    : `<button id="goat-again" class="play-btn">↻ New G.O.A.T.</button>`;

  box.innerHTML =
    `<div class="goat-wrap goat-result">` +
      goatScenarioBanner(g) +
      `<div class="goat-card-id big">${badge(goat.teamCode)} <b>${surname(goat.playerName)}</b> <span class="muted">${POS_FULL[goat.pos]} · ${g.homeClub.teamName} ${g.homeClub.seasonLabel}</span></div>` +
      goatRevealHTML(items, shown, post, res) +
      dailyPanel +
      (done
        ? `<div class="goat-actions">${primary}<button id="goat-card-btn" class="ghost-btn dl-lb-btn">${icon("copy")} Copy results</button></div>`
        : `<div class="reveal-dots" id="goat-skip">•••</div>`) +
    `</div>`;
  if (done) {
    el("goat-again").addEventListener("click", () => { if (isDaily) g.sub = null; reset(); });
    el("goat-card-btn").addEventListener("click", (e) => copyGoatShareCard(e.currentTarget, goat, five, res, post, aw));
    if (isDaily && !g.practice) mountGoatLeaderboard();
  } else { const s = el("goat-skip"); if (s) s.addEventListener("click", () => { g.reveal = items.length; clearTimeout(goatRevealTimer); render(); }); }
}

// Compact, verifiable record of a daily build: base code + which stat came from each donor draw
// (graft i is taken from donor draw i). The server rebuilds the board and re-runs the engine.
function buildGoatDailySubmission(g) {
  return {
    dayKey: g.dayKey,
    base: { code: g.base.playerCode },
    grafts: g.grafts.map((gr, i) => ({ slot: i, stat: gr.stat, code: gr.donor.playerCode })),
  };
}

// The Daily G.O.A.T. lockout recap: today's saved result + the leaderboard, with practice + lobby.
function renderGoatDailyLockout(box, g) {
  const r = loadGoatDaily(g.dayKey);
  box.innerHTML =
    `<div class="goat-wrap goat-result">` +
      goatScenarioBanner(g) +
      `<div class="dl-badge">${icon("lock")} Today's G.O.A.T.</div>` +
      `<div class="record${r.wins === GAMES ? " perfect" : ""}">${r.wins}–${r.losses}</div>` +
      `<div class="verdict stage-${r.stage}">${r.label}</div>` +
      (r.goatSeason ? `<div class="goat-slam">${icon("crown", "gold")} THE G.O.A.T. SEASON</div>` : "") +
      `<div class="goat-score">Daily score <b>${(r.score || 0).toLocaleString()}</b></div>` +
      (r.card ? `<div class="goat-actions"><button id="goat-card-btn" class="ghost-btn dl-lb-btn">${icon("copy")} Copy results</button></div>` : "") +
      `<div id="goat-leaderboard" class="lb"></div>` +
      `<p class="dl-note">One ranked attempt a day - new board tomorrow.</p>` +
      `<div class="goat-actions">` +
        `<button id="goat-practice" class="ghost-btn">Practice today's board (unranked)</button>` +
        `<button id="goat-lobby" class="play-btn">← G.O.A.T. lobby</button>` +
      `</div>` +
    `</div>`;
  const cb = el("goat-card-btn"); if (cb && r.card) cb.addEventListener("click", () => copyCard(cb, () => buildGoatShareCanvas(r.card)));
  el("goat-practice").addEventListener("click", () => { g.practice = true; reset(); });
  el("goat-lobby").addEventListener("click", () => { g.sub = null; reset(); });
  mountGoatLeaderboard();
}

// Mount the Daily G.O.A.T. leaderboard: a one-time name prompt, then post the run + show standings.
// Every failure is soft — a missing/undeployed backend just shows "offline", never breaks the mode.
async function mountGoatLeaderboard() {
  const box = el("goat-leaderboard"); if (!box) return;
  const g = state.goat;
  const id = getIdentity();
  if (!id || !id.name) { box.innerHTML = nameFormHTML(); wireNameForm(box, mountGoatLeaderboard); return; }
  box.innerHTML = `<div class="lb-head">Today's G.O.A.T. leaderboard</div><div class="lb-load">Loading…</div>`;
  const saved = loadGoatDaily(g.dayKey);
  const submission = saved && saved.submission;
  if (submission && !g.submitted) {
    try { noteFounder(await submitGoatDaily({ ...submission, name: id.name, uid: id.uid, country: id.country || "", team: id.team || "", badge: selectedBadge() })); g.submitted = true; }
    catch (e) { /* keep going — still show the board below */ }
  }
  try {
    const data = await fetchGoatLeaderboard(g.dayKey, id.uid);
    box.innerHTML = goatLeaderboardHTML(data, id);
    const change = el("lb-change-name");
    if (change) change.addEventListener("click", (e) => { e.preventDefault(); box.innerHTML = nameFormHTML(id.name); wireNameForm(box, mountGoatLeaderboard); });
  } catch (e) {
    box.innerHTML = `<div class="lb-head">Today's G.O.A.T. leaderboard</div>` +
      `<div class="lb-off">Leaderboard is temporarily unavailable - try again in a bit.</div>`;
  }
}

function goatLeaderboardHTML(data, id) {
  const you = data.you;
  const rows = (data.top || []).map((r) => {
    const mine = you && r.name === you.name && r.rank === you.rank;
    const mark = r.goat_season
      ? ` <span class="lb-cup" title="THE G.O.A.T. SEASON">${icon("crown", "gold")}</span>`
      : (r.stage === "champion" ? ` <span class="lb-cup" title="EuroLeague Champions">${icon("trophy", "gold")}</span>` : "");
    const hw = r.awards ? `${r.awards}★` : "";
    return `<tr class="${mine ? "me" : ""}"><td class="lb-rank">${r.rank}</td>` +
      `<td class="lb-name-cell">${lbNameInner(r)}</td>` +
      `<td class="lb-rec">${r.wins}–${r.losses}${mark}</td><td class="lb-stage">${hw}</td></tr>`;
  }).join("");
  const total = data.total || 0;
  const youLine = you
    ? `<div class="lb-you">You: <b>#${you.rank}</b> of ${total} · ${you.wins}–${you.losses}` +
      ` · <a href="#" id="lb-change-name" class="dl-link">change name</a></div>`
    : `<div class="lb-you"><a href="#" id="lb-change-name" class="dl-link">Set a name to post</a></div>`;
  return `<div class="lb-head">Today's G.O.A.T. leaderboard <span class="lb-count">${total} played</span></div>` +
    (rows ? `<table class="lb-table"><tbody>${rows}</tbody></table>` : `<div class="lb-off">Be the first to post today.</div>`) +
    youLine;
}

// Advance the GOAT result reveal one step at a time until everything's shown. Each step sets its own
// pause: awards and bracket rounds linger a little longer so they have room to land.
function scheduleGoatReveal(steps) {
  clearTimeout(goatRevealTimer);
  const total = steps.length;
  const delayBefore = (i) => { const s = steps[i]; if (!s) return GOAT_REVEAL_MS; if (s.award) return 1500; if (s.bracket) return 1200; return GOAT_REVEAL_MS; };
  const tick = () => {
    const g = state.goat;
    if (!g || g.phase !== "result" || g.reveal >= total) return;
    g.reveal++;
    render();
    if (g.reveal < total) goatRevealTimer = setTimeout(tick, delayBefore(g.reveal));
  };
  goatRevealTimer = setTimeout(tick, delayBefore(state.goat ? state.goat.reveal : 1));
}

// Whether the sidebar court's "reveal the best" flip is available right now: a finished, ranked
// Daily with a computable ceiling. Computes + caches the optimal TEAM once per game.
function dailyOptimalForCourt() {
  if (state.mode !== "daily" || state.dailyPractice || !complete() || !state.revealed) return null;
  if (state.dailyOptimal === undefined) {
    try { state.dailyOptimal = computeOptimalTeam(state.dailyBoard); }
    catch (e) { state.dailyOptimal = null; }
  }
  return state.dailyOptimal;
}

// The best possible SIX from today's board — not just the best five. The five-only optimum was
// shown before, but a real playthrough also gets a coach, a home arena and a 6th man, so the
// "best" court routinely projected a WORSE record than the player's own. We now take the top few
// candidate fives and, on each, layer the strongest 6th man, coach and arena the board allows, so
// the ceiling is a true team ceiling (always ≥ any real run). Cached; runs once per Daily.
function bestArenaFor(five) {
  const seen = new Map(); // arena-era key -> building + how many of the five played there
  five.forEach((s) => {
    const k = arenaKey(s._src.teamCode, s.season);
    if (!seen.has(k)) seen.set(k, { base: arenaFor(s._src.teamCode, s.season), count: 0, teamCode: s._src.teamCode });
    seen.get(k).count++;
  });
  let best = null;
  for (const v of seen.values()) {
    const mult = 1 + (v.base.mult - 1) * (v.count / 5); // share-scaled, same as the live game
    if (!best || mult > best.mult) best = { ...v.base, count: v.count, mult, teamCode: v.teamCode };
  }
  return best;
}

function computeOptimalTeam(board) {
  const seasons = state.data.seasons;
  const roles = SLOTS.map((s) => s.pos);
  const cands = optimalFiveCandidates(board, seasons, roles, 6); // a handful of strong fives to seed from
  if (!cands.length) return null;

  // Every board player (stamped with its pool's _src) is a candidate 6th man.
  const allPlayers = [];
  for (const pool of board) for (const pl of pool.players) {
    allPlayers.push({ ...pl, _src: { teamCode: pool.teamCode, teamName: pool.teamName, seasonLabel: pool.seasonLabel } });
  }

  let best = null;
  for (const cand of cands) {
    const five = cand.five;
    const fiveCodes = new Set(five.map((p) => p.playerCode));
    const arena = bestArenaFor(five);
    const aMult = arena ? arena.mult : 1;
    // Strongest bench-value players not already starting (bounded — the gate-lift usually comes from
    // one of the very best available bodies).
    const sixthCands = allPlayers
      .filter((p) => !fiveCodes.has(p.playerCode))
      .sort((a, b) => benchValue(b) - benchValue(a))
      .slice(0, 5);
    for (const sixth of [null, ...sixthCands]) {
      const six = sixth ? [...five, sixth] : five;
      const coachTries = [null, ...eligibleCoaches(six, state.data)]; // best eligible coach, or none
      for (const co of coachTries) {
        const deltas = co ? coachDeltas(co) : null;
        const rec = projectRecord(five, seasons, undefined, aMult, deltas, sixth);
        if (!best || rec.wins > best.wins || (rec.wins === best.wins && rec.S > best.S)) {
          best = { five, sixth, coach: co, arena, wins: rec.wins, losses: rec.losses, S: rec.S };
        }
      }
    }
  }
  return best;
}

// Build + open the Team Report popup for the current five (the clickable weakest-link line). `res`
// is the projection whose category scores/gate we're explaining (result screen vs Dynasty differ).
function showTeamReport(res, champion = false) {
  const co = chosenCoach();
  const ar = chosenArena();
  const report = teamReport(res, filled(), {
    sixth: state.sixth,
    coachLabel: co ? archetypeLabel(co.coach) : null,
    coachName: co ? co.coach.name : null,
    coachPedigree: co ? pedigreeLabel(co.coach) : null, // only Legendary/Elite hires get a shout-out
    arena: ar ? { name: ar.name, rating: ar.rating } : null,
    champion, // EuroLeague title → a victory-lap report (praise, no Fix, weakness reframed as overcome)
  }, state.data);
  openTeamReport(report);
}
// The tappable weakest-link line → opens the Team Report. Shared by every result screen.
const gateLineHTML = (res) =>
  `<button class="rc-gate" id="rc-gate-btn" type="button">${GATE_PHRASE[weakestBarCat(res.categoryScores)] || ""}` +
  `<span class="rc-gate-i">${icon("info")}</span></button>`;
// Champion: instead of hiding the report entirely, a celebratory line that opens the victory-lap report.
const championLineHTML = () =>
  `<button class="rc-gate rc-champ" id="rc-champ-btn" type="button">${icon("trophy", "gold")} Your championship team` +
  `<span class="rc-gate-i">${icon("info")}</span></button>`;

function renderResult() {
  const card = el("result-card");
  if (inGauntlet()) { card.classList.remove("hidden"); renderDynasty(card); return; }
  if (!complete() || !state.revealed) { card.classList.add("hidden"); return; }
  if (state.mode === "versus") { renderVersusResult(card); return; }
  const res = myProjection();
  const perfect = res.wins === GAMES;
  const post = runPostseason(state.slots, state.data.seasons, state.pools, res.wins, state.sixth, curDailyBoss());
  // Beats: standings ladder (1) → [made: bracket entry (2) → each round] OR [missed: verdict (2)].
  // So a made postseason has rounds+2 beats, a missed season 2 — must match startReveal's `total`.
  const total = post.rounds.length ? post.rounds.length + 2 : 2;
  const done = state.revealStage > total; // all beats shown -> reveal the verdict + brag
  card.classList.remove("hidden");
  if (state.classicView == null) state.classicView = "result";

  // Classic's all-time board sits behind a TOP-RIGHT toggle (like Daily/Dynasty), not inline at the
  // bottom. Post silently first so you're ranked even if you never open it.
  // Classic AND Salary share the all-time-board flow (post silently, then a top-right Leaderboard
  // toggle). They differ only in which submit/board they use (Salary is scored on unspent budget).
  const classicLb = done && (state.mode === "classic" || state.mode === "salary");
  const isSalaryLb = state.mode === "salary";
  if (classicLb) {
    (isSalaryLb ? ensureSalarySubmit : ensureClassicSubmit)();
    if (!state.featsChecked) { state.featsChecked = true; checkFeats({ wins: res.wins, stage: post.stage }); }
  }
  const classicToggle = classicLb
    ? `<button id="classic-view-toggle" class="dyn-view-toggle">${state.classicView === "board" ? "← My result" : `${icon("trophy", "gold")} Leaderboard`}</button>`
    : "";
  if (classicLb && state.classicView === "board") {
    card.className = "result-card has-toggle";
    card.innerHTML = classicToggle + `<div id="classic-lb" class="lb"></div>` +
      `<button id="play-again" class="play-btn">↻ Play again</button>`;
    el("classic-view-toggle").addEventListener("click", () => { state.classicView = "result"; renderResult(); });
    el("play-again").addEventListener("click", () => reset());
    (isSalaryLb ? mountSalaryLeaderboard : mountClassicLeaderboard)();
    return;
  }

  // A finished, ranked Daily cycles three views IN the result card on live state (no reset): the
  // detailed result (below), the leaderboard, and today's recap. Board + today early-return here,
  // mirroring Classic's board view. Practice runs skip the cycle (unranked).
  const dailyCycle = done && state.mode === "daily" && !state.dailyPractice;
  if (dailyCycle) { ensureDailySubmit(); state.dailyMyRec = { wins: res.wins, losses: res.losses }; } // post silently + stash your record for the court caption
  if (dailyCycle && state.dlView === "board") {
    card.className = "result-card has-toggle";
    card.innerHTML = `<button id="dl-to-today" class="dyn-view-toggle">${icon("lock")} Today's result</button>` +
      `<div id="leaderboard" class="lb"></div>`;
    el("dl-to-today").addEventListener("click", () => { state.dlView = "today"; renderResult(); });
    mountLeaderboard();
    return;
  }
  if (dailyCycle && state.dlView === "today") {
    const recap = dailyRecapBody();
    card.className = "result-card has-toggle";
    card.innerHTML =
      `<button id="dl-to-board" class="dyn-view-toggle">${icon("trophy", "gold")} Leaderboard</button>` +
      recap.html +
      `<button id="dl-see-detail" class="play-btn ghost-play">${icon("chart")} See detailed results</button>` +
      `<button id="dl-practice" class="play-btn">↻ Practice today's board (unranked)</button>`;
    wireDailyRecapCopy(recap);
    el("dl-to-board").addEventListener("click", () => { state.dlView = "board"; renderResult(); });
    el("dl-see-detail").addEventListener("click", () => { state.dlView = "result"; renderResult(); });
    el("dl-practice").addEventListener("click", () => { state.dailyPractice = true; state.dlView = "result"; reset(); });
    return;
  }

  // Share text (spoiler-free) that "Copy result" copies from a hidden <pre>. Daily uses the dated,
  // streak-aware grid; Classic/Salary a compact line. (Versus has its own screen, never reaches here.)
  const isDaily = state.mode === "daily";
  const shareTxt = isDaily
    ? shareText({
        dayKey: state.dailyDayKey, wins: res.wins, losses: res.losses,
        label: post.label, stage: post.stage, categoryScores: res.categoryScores,
        streak: state.dailyStreak,
      })
    : (() => {
        const icon = STAGE_ICON[post.stage] ? " " + STAGE_ICON[post.stage] : "";
        const cap = salaryMode() ? ` · ${formatMoney(salarySpent())}` : "";
        const modeLabel = salaryMode() ? "Salary Cap" : "Classic";
        return `👑 King of Europe - ${modeLabel}\n${res.wins}–${res.losses} · ${post.label}${icon}${cap}\nhttps://king-of-europe.pages.dev`;
      })();

  // Bottom actions. Classic/Salary: Play again. Daily: NO bottom primary — the leaderboard is a
  // top-right toggle (dl-to-board) like the other modes, which frees the bottom for the copy buttons.
  const primaryBtn = isDaily
    ? ""
    : `<button id="play-again" class="play-btn">↻ Play again</button>`;
  // Daily keeps both copies (the spoiler-free grid text is the whole point of a Daily brag) below a
  // divider. Classic/Salary put Play again + a single "Copy Result" (the image card) side by side, so
  // both fit on screen without scrolling — the text line copy is dropped.
  const actionsBlock = isDaily
    ? (state.dailyPractice ? `<p class="dl-practice-note">Practice run - not counted.</p>` : "") +
      primaryBtn +
      `<div class="share-box copy-row">` +
        `<pre class="share-pre" id="share-pre" hidden>${shareTxt}</pre>` +
        `<button id="share-btn" class="mini-btn">Copy result</button>` +
        `<button id="image-btn" class="ghost-btn dl-lb-btn">Copy image (Spoilers)</button>` +
      `</div>`
    : `<div class="result-actions-row">` +
        primaryBtn +
        `<button id="image-btn" class="play-btn ghost-play copy-result-btn">${icon("copy")} Copy Result</button>` +
      `</div>`;

  // Category bars live in the SUMMARY view only — the Bracket view stays lean so record + bracket +
  // actions all fit on one screen (per the playtest note).
  const catsBlock =
    `<div class="result-cats-wrap pop"><div class="rc-head">Category balance</div>` +
      `<div class="result-cats">${catBarsHTML(res)}</div>` +
      (post.stage === "champion" ? championLineHTML() : perfect ? "" : gateLineHTML(res)) +
    `</div>`;

  const hasBracket = post.rounds.length > 0;
  // Toggle appears only once the reveal has settled; Summary sits first (left) as the default view,
  // Bracket second. During the reveal there's no toggle and the bracket plays out on its own.
  const toggle = (done && hasBracket)
    ? `<div class="view-toggle">` +
        `<button class="vt-btn${state.resultView === "summary" ? " on" : ""}" data-view="summary">Summary</button>` +
        `<button class="vt-btn${state.resultView === "bracket" ? " on" : ""}" data-view="bracket">Bracket</button>` +
      `</div>`
    : "";
  // EVERY record now opens on the standings ladder (marker travels to your seed/finish). For a made
  // postseason, that ladder is beat 1 and the bracket follows, offset by one stage (entry at beat 2,
  // rounds after). A missed season shows the ladder + its inline verdict line.
  // The finish-ladder is the reveal's centrepiece and pairs naturally with the bracket (seed → bracket),
  // so it shows DURING the reveal and in the Bracket view only — never in the settled Summary, where it
  // was the same finish shown a second time. resultView stays "bracket" all through the reveal, then
  // flips to "summary" on settle, so this one flag gates both the ladder and the bracket/rounds body.
  const onBracket = state.resultView === "bracket";
  const viewBody = hasBracket
    ? (onBracket ? standingsLadderHTML(finishFor(res.wins), state.revealStage, null) : "") +
      (onBracket
        ? renderBracket(post, res, state.revealStage - 1)
        : renderRounds(post, res, state.revealStage - 1))
    : missedStandingHTML(res, state.revealStage, post.label);
  const showCats = !hasBracket || state.resultView === "summary";

  // Daily result view (A) gets a top-right Leaderboard toggle → the board (B).
  const dailyResultToggle = dailyCycle
    ? `<button id="dl-to-board" class="dyn-view-toggle">${icon("trophy", "gold")} Leaderboard</button>`
    : "";
  card.className = "result-card" + (classicLb || dailyCycle ? " has-toggle" : "");
  card.innerHTML =
    classicToggle + dailyResultToggle +
    `<div class="reg-label">Regular season</div>` +
    `<div class="record${perfect ? " perfect" : ""} pop">${res.wins}–${res.losses}</div>` +
    toggle +
    viewBody +
    (done
      ? // Salary: your tab + the unspent budget the board scores on, right on the result (the top
        // budget bar is long gone by now).
        salaryLineHTML() +
        // a MISSED season carries its verdict inline in the standings finish line, so skip the separate
        // verdict here (it was the same info twice); bracket + perfect seasons keep the verdict line.
        (hasBracket ? `<div class="verdict stage-${post.stage} pop">${post.label}</div>` : "") +
        (perfect ? `<div class="perfect-note">A perfect regular season.</div>` : "") +
        (showCats ? catsBlock : "") +
        actionsBlock
      : `<div class="reveal-dots">•••</div>`);

  card.querySelectorAll(".vt-btn").forEach((b) =>
    b.addEventListener("click", () => { state.resultView = b.dataset.view; renderResult(); }));
  animateMissedMarker(card); // travel the orange marker to your seed/finish (once per game; no-op if no ladder)
  // EuroLeague Champion: pop the trophy celebration once, after the "EuroLeague Champions." verdict lands.
  if (done && post.stage === "champion" && !state.championCelebrated) {
    state.championCelebrated = true;
    setTimeout(celebrateChampion, 650);
  }
  const dtb = el("dl-to-board");
  if (dtb) dtb.addEventListener("click", () => { state.dlView = "board"; renderResult(); });
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
  const gb = el("rc-gate-btn");
  if (gb) gb.addEventListener("click", () => showTeamReport(res));
  const cb = el("rc-champ-btn");
  if (cb) cb.addEventListener("click", () => showTeamReport(res, true)); // champion → victory-lap report
  const cvt = el("classic-view-toggle");
  if (cvt) cvt.addEventListener("click", () => { state.classicView = "board"; renderResult(); });
  // Unlock any feats this finished season earned (once per run). Classic is handled above; here we
  // cover the record/stage feats for Salary + Daily (Versus/Dynasty have their own paths).
  if (done && !state.featsChecked) { state.featsChecked = true; checkFeats({ wins: res.wins, stage: post.stage, dailyStreak: isDaily ? state.dailyStreak : 0 }); }
}

// The compact, verifiable record of a Classic five for the all-time board: each pick's club-season +
// code, the sixth man, the chosen coach, and which slot's club hosted (the won arena). The server
// rebuilds the exact players and re-runs the engine for the authoritative score (see resolveClassic.js).
function buildClassicSubmission() {
  const enc = (s) => ({ code: s.playerCode, teamCode: s._src.teamCode, seasonLabel: s._src.seasonLabel });
  const co = chosenCoach();
  return {
    starters: state.slots.map(enc),
    sixth: state.sixth ? enc(state.sixth) : null,
    coach: co ? co.coach.code : null,
    arenaSlot: state.arenaSlot,
  };
}

// ONE post per finished game, memoized. The silent post (ensureClassicSubmit) and opening the
// Leaderboard both await this SAME promise, so the board never fetches before the row has landed —
// the response already carries your ranked row. Without a name yet it resolves to null (not memoized,
// so it retries the moment a name is set). On failure the memo is cleared so a later open can retry.
function submitClassicOnce() {
  const id = getIdentity();
  if (!id || !id.name) return Promise.resolve(null);
  if (!state.classicSubmitPromise) {
    state.classicSubmitPromise = submitClassic({ ...buildClassicSubmission(), name: id.name, uid: id.uid, country: id.country || "", team: id.team || "", badge: selectedBadge() })
      .then((data) => { noteFounder(data); state.classicSubmitted = true; return data; })
      .catch((e) => { state.classicSubmitPromise = null; throw e; });
  }
  return state.classicSubmitPromise;
}

// Silently post a finished Classic run (needs a name; no UI), so you're ranked even if you never open
// the Leaderboard toggle — mirrors Daily's ensureDailySubmit.
async function ensureClassicSubmit() {
  if (state.mode !== "classic") return;
  try { await submitClassicOnce(); } catch (e) { /* offline/rejected — opening the board retries */ }
}

// After the name form saves a name, clear the memo so we post under the new name, then re-render.
function onClassicNameSet() { state.classicSubmitPromise = null; state.classicSubmitted = false; mountClassicLeaderboard(); }

async function mountClassicLeaderboard() {
  const box = el("classic-lb"); if (!box) return;
  const id = getIdentity();
  if (!id || !id.name) { box.innerHTML = nameFormHTML(); wireNameForm(box, onClassicNameSet); return; }
  box.innerHTML = `<div class="lb-head">All-time leaderboard</div><div class="lb-load">Loading…</div>`;
  try {
    // Post-then-show (or reuse the in-flight/done post); if already posted this game, fetch fresh. If
    // the POST hiccups (transient network/D1), fall back to a read-only fetch so the board still shows
    // — your row lands on the next open. Only if BOTH fail do we show "unavailable".
    let data;
    if (state.classicSubmitted) {
      data = await fetchClassicAllTime(id.uid);
    } else {
      try { data = await submitClassicOnce(); }
      catch (e) { data = await fetchClassicAllTime(id.uid); }
    }
    box.innerHTML = classicLbHTML(data || await fetchClassicAllTime(id.uid), id);
    const change = el("lb-change-name");
    if (change) change.addEventListener("click", (e) => { e.preventDefault(); box.innerHTML = nameFormHTML(id.name); wireNameForm(box, onClassicNameSet); });
  } catch (e) {
    box.innerHTML = `<div class="lb-head">All-time leaderboard</div><div class="lb-off">Leaderboard is temporarily unavailable - try again in a bit.</div>`;
  }
}

function classicLbHTML(data, id) {
  const you = data.you;
  const rows = (data.top || []).slice(0, 10).map((r) => {
    const mine = you && r.rank === you.rank && r.name === you.name;
    const cup = r.stage === "champion" ? ` ${icon("trophy", "gold")}` : "";
    return `<tr class="${mine ? "me" : ""}"><td class="lb-rank">${r.rank}</td><td class="lb-name-cell">${escapeHTML(r.name)}</td>` +
      `<td class="lb-rec"><b>${(r.score || 0).toLocaleString()}</b></td><td class="lb-stage">${r.wins}–${r.losses}${cup}</td></tr>`;
  }).join("");
  const total = data.total || 0;
  const youLine = you
    ? `<div class="lb-you">You: <b>#${you.rank}</b> of ${total} · best <b>${(you.score || 0).toLocaleString()}</b> · <a href="#" id="lb-change-name" class="dl-link">change name</a></div>`
    : `<div class="lb-you"><a href="#" id="lb-change-name" class="dl-link">Set a name to post</a></div>`;
  return `<div class="lb-head">All-time leaderboard <span class="lb-count">${total} played</span></div>` +
    (rows ? `<table class="lb-table"><tbody>${rows}</tbody></table>` : `<div class="lb-off">Be the first to post a score.</div>`) + youLine;
}

/* ---------------- Salary-cap all-time leaderboard (mirrors Classic + captain, scored on unspent) ---- */

function buildSalarySubmission() {
  return { ...buildClassicSubmission(), captain: state.captain || null };
}
function submitSalaryOnce() {
  const id = getIdentity();
  if (!id || !id.name) return Promise.resolve(null);
  if (!state.salarySubmitPromise) {
    state.salarySubmitPromise = submitSalary({ ...buildSalarySubmission(), name: id.name, uid: id.uid, country: id.country || "", team: id.team || "", badge: selectedBadge() })
      .then((data) => { noteFounder(data); state.salarySubmitted = true; return data; })
      .catch((e) => { state.salarySubmitPromise = null; throw e; });
  }
  return state.salarySubmitPromise;
}
async function ensureSalarySubmit() {
  if (state.mode !== "salary") return;
  try { await submitSalaryOnce(); } catch (e) { /* offline/rejected — opening the board retries */ }
}
function onSalaryNameSet() { state.salarySubmitPromise = null; state.salarySubmitted = false; mountSalaryLeaderboard(); }

async function mountSalaryLeaderboard() {
  const box = el("classic-lb"); if (!box) return; // reuses the shared all-time board container
  const id = getIdentity();
  if (!id || !id.name) { box.innerHTML = nameFormHTML(); wireNameForm(box, onSalaryNameSet); return; }
  box.innerHTML = `<div class="lb-head">All-time leaderboard</div><div class="lb-load">Loading…</div>`;
  try {
    let data;
    if (state.salarySubmitted) data = await fetchSalaryAllTime(id.uid);
    else { try { data = await submitSalaryOnce(); } catch (e) { data = await fetchSalaryAllTime(id.uid); } }
    box.innerHTML = salaryLbHTML(data || await fetchSalaryAllTime(id.uid), id);
    const change = el("lb-change-name");
    if (change) change.addEventListener("click", (e) => { e.preventDefault(); box.innerHTML = nameFormHTML(id.name); wireNameForm(box, onSalaryNameSet); });
  } catch (e) {
    box.innerHTML = `<div class="lb-head">All-time leaderboard</div><div class="lb-off">Leaderboard is temporarily unavailable - try again in a bit.</div>`;
  }
}

function salaryLbHTML(data, id) {
  const you = data.you;
  const rows = (data.top || []).slice(0, 10).map((r) => {
    const mine = you && r.rank === you.rank && r.name === you.name;
    const cup = r.stage === "champion" ? ` ${icon("trophy", "gold")}` : "";
    const saved = r.unspent != null ? `<td class="lb-saved" title="Budget left under the cap">${formatMoney(r.unspent)}</td>` : `<td></td>`;
    return `<tr class="${mine ? "me" : ""}"><td class="lb-rank">${r.rank}</td><td class="lb-name-cell">${escapeHTML(r.name)}</td>` +
      `<td class="lb-rec"><b>${(r.score || 0).toLocaleString()}</b></td>${saved}<td class="lb-stage">${r.wins}–${r.losses}${cup}</td></tr>`;
  }).join("");
  const total = data.total || 0;
  const youLine = you
    ? `<div class="lb-you">You: <b>#${you.rank}</b> of ${total} · best <b>${(you.score || 0).toLocaleString()}</b> · <a href="#" id="lb-change-name" class="dl-link">change name</a></div>`
    : `<div class="lb-you"><a href="#" id="lb-change-name" class="dl-link">Set a name to post</a></div>`;
  return `<div class="lb-head">Salary all-time <span class="lb-count">${total} played</span></div>` +
    (rows ? `<table class="lb-table"><tbody>${rows}</tbody></table>` : `<div class="lb-off">Be the first to post a score.</div>`) + youLine;
}

/* ---------------- shareable PNG card ---------------- */

// Gather everything the card needs from the finished game state.
function shareCardData() {
  const res = myProjection();
  const post = runPostseason(state.slots, state.data.seasons, state.pools, res.wins, state.sixth, curDailyBoss());
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
  const sx = state.sixth;
  const sxSt = sx ? clubStyle(sx._src.teamCode) : null;
  return {
    modeLabel: salaryMode() ? "Salary Cap" : state.mode === "daily" ? "Daily" : "Classic",
    wins: res.wins, losses: res.losses, perfect: res.wins === GAMES,
    stage: post.stage, label: post.label,
    icon: STAGE_ICON[post.stage] || "",
    streak: state.mode === "daily" ? (state.dailyStreak || 0) : 0,
    five,
    sixth: sx ? { name: surname(sx.playerName), abbr: sxSt.abbr, season: sx._src.seasonLabel } : null,
    coachName: co ? prettyName(co.coach.name) : "No coach", coachStyle: co ? archetypeLabel(co.coach) : "",
    salary: salaryMode() ? formatMoney(salarySpent()) : null,
    arena: ar ? ar.name : null,
    homeColor: homeSt ? homeSt.primary : null, homeAbbr: homeSt ? homeSt.abbr : null,
  };
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
    fellTo: d.opp ? `${d.opp.teamName} ${d.opp.seasonLabel}` : null,
    fellScore: d.lastGame ? `${d.lastGame.theirs}–${d.lastGame.mine}` : null,
  };
}


// A G.O.A.T. run's shareable card: the mythical player's freak stat line (with donor credits), his
// record + hardware, and his supporting cast — the bragging payoff for the build-a-superplayer mode.
function goatShareCardData(goat, five, res, post, aw) {
  const g = state.goat;
  const stats = GRAFT_STATS.map((s) => {
    const d = goat.source[s];
    return { label: STAT_LABEL[s], val: goatFmt(s, goatStatOf(goat, s)), src: d ? surname(d.playerName) : "base" };
  });
  const seed = seedFor(res.wins);
  const entryNote = res.wins >= 24 ? "Straight into the playoffs" : res.wins >= 20 ? "Into the play-in" : "Missed the postseason";
  const bs = clubStyle(goat.teamCode);
  return {
    name: surname(goat.playerName),
    club: `${g.homeClub.teamName} ${g.homeClub.seasonLabel}`,
    badge: { abbr: bs.abbr, primary: bs.primary, secondary: bs.secondary, ink: textOn(bs.primary) },
    wins: res.wins, losses: res.losses, perfect: res.wins === GAMES,
    seedNote: (seed ? ordinal(seed) + " seed · " : "") + entryNote,
    stage: post.stage, goatSeason: aw.goatSeason,
    awards: aw.awards.map((a) => a.label),
    stats,
    // the full five in slot order (2G/2F/1C), the G.O.A.T. flagged so he's highlighted in the lineup.
    lineup: five.map((p) => ({ pos: p.pos, name: surname(p.playerName), isGoat: !!p.goat })),
  };
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
  const draw = () => {
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
  };
  // Modern cards draw display text in Archivo — make sure the webfont is loaded before we rasterise,
  // otherwise the canvas silently falls back to the sans. (No-op/instant once it's already cached.)
  if (currentLook() === "modern" && document.fonts && document.fonts.load) {
    document.fonts.load('800 150px "Archivo"').then(draw, draw);
  } else draw();
}
// "1st in {country}" brag for a share card — only real: you must be #1 in your country on the given
// board, and the country pool must clear MIN_POOL_TITLE (no hollow "1st of 1"). "" if not / offline.
async function countryRankBrag(fetchFn) {
  const id = getIdentity();
  if (!id || !id.country || !id.uid) return "";
  try {
    const data = await fetchFn(id.uid, { country: id.country });
    if (data && data.you && data.you.rank === 1 && (data.total || 0) >= MIN_POOL_TITLE) {
      const c = countryByCode(id.country);
      return `1st in ${c ? c.name : id.country}`;
    }
  } catch (e) { /* offline — no brag */ }
  return "";
}
async function copyShareCard(btn) {
  const fetchFn = salaryMode() ? null
    : state.mode === "daily" ? ((uid, sc) => fetchLeaderboard(utcDayKey(), uid, sc))
    : fetchClassicAllTime;
  const brag = fetchFn ? await countryRankBrag(fetchFn) : "";
  copyCard(btn, () => buildShareCanvas({ ...shareCardData(), brag }));
}
async function copyDynastyShareCard(btn) {
  const brag = await countryRankBrag((uid, sc) => fetchDynastyBoard("alltime", uid, sc));
  copyCard(btn, () => buildDynastyShareCanvas({ ...dynastyShareCardData(), brag }));
}
const copyGoatShareCard = (btn, goat, five, res, post, aw) =>
  copyCard(btn, () => buildGoatShareCanvas(goatShareCardData(goat, five, res, post, aw)));
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
    const me = myProjection();
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
  const shareTxt = `⚔️ King of Europe - Versus\nMy five ${iWon ? "beat" : "lost to"} ${opp.label} ${d.aWins}–${d.bWins}`;
  card.innerHTML =
    `<div class="reg-label">Best of seven</div>` +
    `<div class="record${iWon ? " perfect" : ""} pop">${d.aWins}–${d.bWins}</div>` +
    `<div class="verdict ${iWon ? "stage-champion" : "stage-relegation"} pop">${iWon ? `You win the series ${icon("trophy", "gold")}` : "You lost the series"}</div>` +
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
