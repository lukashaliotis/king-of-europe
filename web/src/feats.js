// Feat badges — achievements shown by your name on the leaderboards. You UNLOCK feats by playing
// (tracked per-device in localStorage), then pick ONE in the badge gallery to display. The displayed
// badge is self-declared (sent with submissions like country/team) — fine for a friends game; the
// underlying results are server-verified anyway. Emoji marks render on the phone-first audience.
//
// Ordered as a sensible progression — a launch badge, then the season ladder (Final Four → Champion →
// Perfect), the Daily streak ladder (7 → 30), the Dynasty ladder (10 → 20), and finally the pinnacle
// (G.O.A.T. Season). Milestones within a family go low → high. `emoji` shows in the Classic look; in
// Modern the gallery/rows use `icon` (an SVG from icons.js) so badges match the rest of the UI.

export const FEATS = [
  { id: "founder",     emoji: "⭐", icon: "star",     label: "Founder",        how: "One of the first 10 players." },
  { id: "finalfour",   emoji: "🏅", icon: "medal",    label: "Final Four",     how: "Reach the Final Four." },
  { id: "champion",    emoji: "🏆", icon: "trophy",   label: "Champion",       how: "Win the EuroLeague title." },
  { id: "perfect",     emoji: "💯", icon: "target",   label: "Perfect Season", how: "Finish a season 38-0." },
  { id: "daily7",      emoji: "📅", icon: "calendar", label: "Daily 7",        how: "Keep a 7-day Daily streak." },
  { id: "daily30",     emoji: "🗓️", icon: "calendar", label: "Daily 30",       how: "Keep a 30-day Daily streak." },
  { id: "dyn10",       emoji: "🔥", icon: "flame",    label: "Dynasty 10",     how: "Reach a 10-win Dynasty streak." },
  { id: "dyn20",       emoji: "⚡", icon: "bolt",     label: "Dynasty 20",     how: "Reach a 20-win Dynasty streak." },
  { id: "goat_season", emoji: "🐐", icon: "crown",    label: "G.O.A.T. Season", how: "38-0 + the title + every award in G.O.A.T. mode." },
];

const BY_ID = Object.fromEntries(FEATS.map((f) => [f.id, f]));
export const featById = (id) => BY_ID[id] || null;
export const featEmoji = (id) => (BY_ID[id] ? BY_ID[id].emoji : "");

const FEATS_KEY = "koe-feats", BADGE_KEY = "koe-badge";

/** Set of unlocked feat ids (from localStorage). */
export function unlockedFeats() {
  try { return new Set(JSON.parse(localStorage.getItem(FEATS_KEY) || "[]").filter((id) => BY_ID[id])); }
  catch (e) { return new Set(); }
}
export const hasFeat = (id) => unlockedFeats().has(id);

/** Unlock a feat; returns true if it was NEWLY unlocked (for a celebratory toast). */
export function unlockFeat(id) {
  if (!BY_ID[id]) return false;
  const s = unlockedFeats();
  if (s.has(id)) return false;
  s.add(id);
  try { localStorage.setItem(FEATS_KEY, JSON.stringify([...s])); } catch (e) { /* ignore */ }
  return true;
}

/** Unlock every feat implied by a finished game. Returns the ids newly unlocked this call. */
export function unlockFeatsFor({ wins, stage, goatSeason, dynastyStreak, dailyStreak } = {}) {
  const got = [];
  const tryUnlock = (id, cond) => { if (cond && unlockFeat(id)) got.push(id); };
  tryUnlock("perfect", wins === 38);
  tryUnlock("champion", stage === "champion");
  tryUnlock("finalfour", stage === "finalfour" || stage === "lostfinal" || stage === "champion");
  tryUnlock("goat_season", !!goatSeason);
  tryUnlock("dyn10", (dynastyStreak || 0) >= 10);
  tryUnlock("dyn20", (dynastyStreak || 0) >= 20);
  tryUnlock("daily7", (dailyStreak || 0) >= 7);
  tryUnlock("daily30", (dailyStreak || 0) >= 30);
  return got;
}

/** The chosen displayed badge id — but only if it's still a real, unlocked feat ("" otherwise). */
export function selectedBadge() {
  let id = "";
  try { id = localStorage.getItem(BADGE_KEY) || ""; } catch (e) { /* ignore */ }
  return id && hasFeat(id) ? id : "";
}
/** Choose the displayed badge ("" to show none). */
export function setBadge(id) {
  try { if (id) localStorage.setItem(BADGE_KEY, id); else localStorage.removeItem(BADGE_KEY); }
  catch (e) { /* ignore */ }
}
