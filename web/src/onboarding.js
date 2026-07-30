// First-run "How to play" overlay + a persistent "?" that reopens it. The share feature brings
// in cold newcomers, and the game's best mechanic (the category gate) is invisible without a
// word — so we explain the loop once, up front, and keep help one click away.

const SEEN_KEY = "koe-onboarded";

const STEPS = [
  {
    icon: "👑",
    title: "Welcome to King of Europe",
    body: "Spin a EuroLeague club and year, draft five players who actually played there, and " +
      "chase a perfect <b>38–0</b> season — and the <b>EuroLeague trophy</b>.",
  },
  {
    icon: "🎰",
    title: "Draft your six",
    body: "Each spin draws <b>one club, one season</b> — take a single player, then spin again. " +
      "Six picks: <b>five starters</b> across PG·SG·SF·PF·C, plus <b>one on the bench</b>. " +
      "Each player once.",
  },
  {
    icon: "⚖️",
    title: "Balance wins",
    body: "Your record is capped by your <b>weakest category</b>, not your average — scoring, " +
      "rebounding, playmaking, defense, efficiency. One hole sinks the team, so " +
      "<b>balance beats stacking</b>.",
  },
  {
    icon: "🏆",
    title: "Arena, coach, play",
    body: "Spin a <b>home arena</b> for an edge and <b>pick a coach</b> to patch a weak spot, then " +
      "play. Win the season, then a <b>bracket for the trophy</b>. Try <b>Daily</b> for a shared " +
      "board and the <b>leaderboard</b>.",
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
  markSeen();
  document.getElementById("onboarding").classList.add("hidden");
}

function render() {
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const dots = STEPS.map((_, i) => `<span class="ob-dot${i === step ? " on" : ""}"></span>`).join("");
  document.getElementById("onboarding").innerHTML =
    `<div class="ob-backdrop" data-close="1"></div>` +
    `<div class="ob-card" role="dialog" aria-modal="true" aria-label="How to play">` +
      `<button class="ob-skip" data-act="skip" type="button">Skip</button>` +
      `<div class="ob-icon">${s.icon}</div>` +
      `<h2 class="ob-title">${s.title}</h2>` +
      `<p class="ob-body">${s.body}</p>` +
      `<div class="ob-dots">${dots}</div>` +
      `<div class="ob-nav">` +
        `<button class="ghost-btn ob-back" data-act="back" type="button"${step === 0 ? " disabled" : ""}>Back</button>` +
        `<button class="spin-btn ob-next" data-act="next" type="button">${last ? "Got it — let's spin" : "Next"}</button>` +
      `</div>` +
    `</div>`;

  const box = document.getElementById("onboarding");
  box.querySelector('[data-act="skip"]').onclick = close;
  box.querySelector('[data-act="back"]').onclick = () => { if (step > 0) { step--; render(); } };
  box.querySelector('[data-act="next"]').onclick = () => {
    if (last) close();
    else { step++; render(); }
  };
  box.querySelector(".ob-backdrop").onclick = close;
}

// Wire the "?" help button (always reopens) and auto-open once for first-timers.
export function initOnboarding() {
  const help = document.getElementById("help-btn");
  if (help) help.addEventListener("click", () => open(0));

  document.addEventListener("keydown", (e) => {
    const box = document.getElementById("onboarding");
    if (!box || box.classList.contains("hidden")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && step < STEPS.length - 1) { step++; render(); }
    else if (e.key === "ArrowLeft" && step > 0) { step--; render(); }
  });

  if (!hasSeen()) open(0);
}
