// First-run "How to play" overlay + a persistent "?" that reopens it. The share feature brings
// in cold newcomers, and the game's best mechanic (the category gate) is invisible without a
// word — so we explain the loop once, up front, and keep help one click away.

import { icon } from "./icons.js";
import { COUNTRIES } from "./countries.js";
import { TEAMS } from "./teams.js";
import { getIdentity, saveProfile } from "./leaderboard.js";

const SEEN_KEY = "koe-onboarded";

const STEPS = [
  {
    icon: "crown",
    title: "Welcome to King of Europe",
    body: "Spin a EuroLeague <b>club and year</b>, draft players, and chase a perfect <b>38–0</b> " +
      "season and the <b>trophy</b>. Tap <b>?</b> any time for the full rules of each mode.",
  },
  {
    icon: "crown", identity: true,
    title: "Claim your spot",
    body: "Add a <b>name</b> and <b>country</b> to appear on the leaderboards - and unlock " +
      "<b>country</b> and <b>club</b> rankings. You can change these anytime in settings.",
  },
];

let step = 0;

function hasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return false; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
}

function open(fromStart = 0) {
  step = fromStart;
  document.getElementById("onboarding").classList.remove("hidden");
  render();
}
function close() {
  captureIdentity(); // persist whatever's typed if we're leaving the identity step
  markSeen();
  document.getElementById("onboarding").classList.add("hidden");
}

// The final step lets a first-timer set name + country + club so they show up on the boards without
// having to discover the settings popup. Prefilled from any existing profile; escaped for the value.
function identityFields(s) {
  const id = getIdentity() || {};
  const attr = (v) => String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const countryOpts = `<option value="">🌍 Country…</option>` +
    COUNTRIES.map((c) => `<option value="${c.code}"${c.code === id.country ? " selected" : ""}>${c.flag} ${c.name}</option>`).join("");
  const teamOpts = `<option value="">🏀 Favorite club…</option>` +
    TEAMS.map((t) => `<option value="${t.code}"${t.code === id.team ? " selected" : ""}>${t.name}</option>`).join("");
  return `<p class="ob-body">${s.body}</p>` +
    `<div class="ob-identity">` +
      `<input id="ob-name" class="pf-input" type="text" maxlength="20" placeholder="Your name" autocomplete="off" value="${attr(id.name)}" />` +
      `<select id="ob-country" class="pf-select" aria-label="Country">${countryOpts}</select>` +
      `<select id="ob-team" class="pf-select" aria-label="Favorite club">${teamOpts}</select>` +
    `</div>`;
}

// Read the identity form (if it's on screen) into the stored profile and let the app repaint.
function captureIdentity() {
  const n = document.getElementById("ob-name");
  if (!n) return; // not currently on the identity step
  const c = document.getElementById("ob-country"), t = document.getElementById("ob-team");
  saveProfile({ name: n.value, country: c ? c.value : "", team: t ? t.value : "" });
  document.dispatchEvent(new Event("koe:profile"));
}

function render() {
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const dots = STEPS.map((_, i) => `<span class="ob-dot${i === step ? " on" : ""}"></span>`).join("");
  document.getElementById("onboarding").innerHTML =
    `<div class="ob-backdrop" data-close="1"></div>` +
    `<div class="ob-card" role="dialog" aria-modal="true" aria-label="How to play">` +
      `<button class="ob-skip" data-act="skip" type="button">Skip</button>` +
      `<div class="ob-icon">${icon(s.icon, s.iconCls || "")}</div>` +
      `<h2 class="ob-title">${s.title}</h2>` +
      (s.identity ? identityFields(s) : `<p class="ob-body">${s.body}</p>`) +
      `<div class="ob-dots">${dots}</div>` +
      `<div class="ob-nav">` +
        `<button class="ghost-btn ob-back" data-act="back" type="button"${step === 0 ? " disabled" : ""}>Back</button>` +
        `<button class="spin-btn ob-next" data-act="next" type="button">${last ? (s.identity ? "Start playing" : "Got it, let's spin") : "Next"}</button>` +
      `</div>` +
    `</div>`;

  const box = document.getElementById("onboarding");
  box.querySelector('[data-act="skip"]').onclick = close;
  box.querySelector('[data-act="back"]').onclick = () => { if (step > 0) { captureIdentity(); step--; render(); } };
  box.querySelector('[data-act="next"]').onclick = () => {
    if (last) close();
    else { captureIdentity(); step++; render(); }
  };
  box.querySelector(".ob-backdrop").onclick = close;
}

// Per-mode "how to play" - the "?" is mode-aware, so it always explains the mode you're in.
const MODE_HELP = {
  classic: {
    icon: "ball", title: "Classic",
    body: "Spin a EuroLeague <b>club + year</b> and draft <b>five starters</b> (2 guards, 2 forwards, 1 center) plus a <b>6th man</b>. Spin a <b>home arena</b>, pick a <b>coach</b>, then play a <b>38-game season</b> and a <b>playoff bracket</b>. Your record is capped by your <b>weakest category</b> - balance beats stacking.",
  },
  daily: {
    icon: "calendar", title: "Daily",
    body: "The <b>same six draws</b> for everyone today - <b>no re-spins</b>. Draft your best five (+6th), you get <b>one ranked attempt</b>, then compare on the <b>leaderboard</b>. A fresh board drops at midnight UTC.",
  },
  versus: {
    icon: "swords", title: "Versus",
    body: "Draft from a <b>shared board</b>, then <b>mint a code</b> and send it to a friend. They draft from the same board, and the sim plays a <b>best-of-seven</b> between your two fives.",
  },
  salary: {
    icon: "coins", title: "Salary Cap",
    body: "Like Classic, but every player has a <b>price</b> and you build under a <b>salary cap</b>. A player's price in <b>€M is his EuroLeague PIR</b> (Performance Index Rating) - so scorers cost and role players stretch the budget. Squeeze a title contender out of the cap.",
  },
  dynasty: {
    icon: "flame", iconCls: "f-streak", title: "Dynasty",
    body: "Draft a <b>five</b>, then survive an <b>endless gauntlet</b>: beat a club and <b>loot one of their players</b> (swapping one of yours out), then face a tougher team. Your <b>win streak</b> is the score. <b>Weekly</b> is the identical challenge for everyone; <b>Endless</b> is a free draft chasing the all-time board.",
  },
  goat: {
    icon: "star", iconCls: "gold", title: "G.O.A.T.",
    body: "Pick a <b>base player</b> - his real line is your start, his club is your cast. Then <b>take one stat from each of five more players</b> (Points, Rebounds, Assists, TS%, Steals, Blocks) to build one mythical talent. Simulate the season and chase the hardware - <b>MVP, Best Defender, Final Four MVP</b>. 38-0 + the title + the awards = <b>the G.O.A.T. season</b>.",
  },
};

function openModeHelp(mode) {
  const h = MODE_HELP[mode] || MODE_HELP.classic;
  const box = document.getElementById("onboarding");
  box.classList.remove("hidden");
  box.innerHTML =
    `<div class="ob-backdrop" data-close="1"></div>` +
    `<div class="ob-card" role="dialog" aria-modal="true" aria-label="How to play">` +
      `<button class="ob-skip" data-act="skip" type="button">✕</button>` +
      `<div class="ob-icon">${icon(h.icon, h.iconCls || "")}</div>` +
      `<h2 class="ob-title">How to play - ${h.title}</h2>` +
      `<p class="ob-body">${h.body}</p>` +
      `<div class="ob-nav one"><button class="spin-btn" data-act="next" type="button">Got it</button></div>` +
      `<button class="ob-intro-link" data-act="intro" type="button">Full intro →</button>` +
    `</div>`;
  box.querySelector('[data-act="skip"]').onclick = close;
  box.querySelector('[data-act="next"]').onclick = close;
  box.querySelector('[data-act="intro"]').onclick = () => open(0); // the full first-run carousel
  box.querySelector(".ob-backdrop").onclick = close;
}

// A small popup explaining today's special Daily (theme name + what it changes). Shown when you tap
// the daily-type chip. Reuses the intro card; its own close (doesn't touch the onboarding-seen flag).
export function openThemeInfo(theme, mark) {
  const box = document.getElementById("onboarding");
  box.classList.remove("hidden");
  box.innerHTML =
    `<div class="ob-backdrop" data-close="1"></div>` +
    `<div class="ob-card" role="dialog" aria-modal="true" aria-label="Today's Daily">` +
      `<button class="ob-skip" data-close="1" type="button">✕</button>` +
      `<div class="ob-theme-emoji">${mark || theme.emoji}</div>` +
      `<h2 class="ob-title">${theme.name}</h2>` +
      `<p class="ob-body">${theme.desc}</p>` +
      `<div class="ob-nav one"><button class="spin-btn" data-close="1" type="button">Got it</button></div>` +
    `</div>`;
  const shut = () => box.classList.add("hidden");
  box.querySelectorAll("[data-close]").forEach((e) => (e.onclick = shut));
}

// The Team Report popup — the position-aware strengths/weaknesses/hint behind the weakest-link line.
// `report` = { strengths:[{cat,text}], weaknesses:[{cat,text}], hint, gate } from teamreport.js.
const CAT_LABEL = { scoring: "Scoring", rebounding: "Rebounding", playmaking: "Playmaking", defense: "Defense", efficiency: "Efficiency", coach: "Coach", bench: "Bench", arena: "Home", interior: "Interior" };
export function openTeamReport(report) {
  const box = document.getElementById("onboarding");
  box.classList.remove("hidden");
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const row = (f, kind) =>
    `<li class="tr-item tr-${kind}"><span class="tr-cat">${CAT_LABEL[f.cat] || f.cat}</span><span class="tr-text">${esc(f.text)}</span></li>`;
  const strengths = report.strengths.length
    ? `<div class="tr-group"><h3 class="tr-h tr-good">Strengths</h3><ul class="tr-list">${report.strengths.map((f) => row(f, "good")).join("")}</ul></div>` : "";
  const weaknesses = report.weaknesses.length
    ? `<div class="tr-group"><h3 class="tr-h tr-bad">Weaknesses</h3><ul class="tr-list">${report.weaknesses.map((f) => row(f, "bad")).join("")}</ul></div>` : "";
  const hint = report.hint ? `<div class="tr-hint"><b>Fix:</b> ${esc(report.hint)}</div>` : "";
  // Champion: a triumphant closing line instead of the Weaknesses list + Fix (weaknesses/hint are
  // empty here) — it names any flaw the team overcame, framed as part of the achievement.
  const triumph = report.triumph
    ? `<div class="tr-triumph">${icon("trophy", "gold")} ${esc(report.triumph)}</div>` : "";
  box.innerHTML =
    `<div class="ob-backdrop" data-close="1"></div>` +
    `<div class="ob-card tr-card" role="dialog" aria-modal="true" aria-label="Team report">` +
      `<button class="ob-skip" data-close="1" type="button">✕</button>` +
      `<h2 class="ob-title">${report.triumph ? "Champions of Europe" : "Team report"}</h2>` +
      strengths + weaknesses + hint + triumph +
      `<div class="ob-nav one"><button class="spin-btn" data-close="1" type="button">Got it</button></div>` +
    `</div>`;
  const shut = () => box.classList.add("hidden");
  box.querySelectorAll("[data-close]").forEach((e) => (e.onclick = shut));
}

// Wire the "?" help button (mode-aware) and auto-open the full intro once for first-timers.
export function initOnboarding() {
  const help = document.getElementById("help-btn");
  if (help) help.addEventListener("click", () => openModeHelp(document.body.dataset.mode || "classic"));

  document.addEventListener("keydown", (e) => {
    const box = document.getElementById("onboarding");
    if (!box || box.classList.contains("hidden")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && step < STEPS.length - 1) { captureIdentity(); step++; render(); }
    else if (e.key === "ArrowLeft" && step > 0) { captureIdentity(); step--; render(); }
  });

  if (!hasSeen()) open(0);
}
