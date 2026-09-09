// Client side of the Daily leaderboard. Identity is name-only: a random device id kept in
// localStorage ties your streak to you without any account or password. Every call degrades
// gracefully — if the backend isn't deployed (e.g. local dev, or the static-only build), the
// game plays exactly as before and the leaderboard panel just says it's offline.

const API = ""; // same origin in production (Cloudflare Pages Functions under /api)
const ID_KEY = "koe-id";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** { uid, name, country?, team? } or null if no name has been chosen yet. */
export function getIdentity() {
  try {
    const raw = JSON.parse(localStorage.getItem(ID_KEY) || "null");
    if (raw && raw.uid) return raw;
  } catch (e) { /* ignore */ }
  return null;
}

/** Persist profile fields (minting a device id on first use). Any field left `undefined` is kept
 *  as-is, so callers can update just the name, or just the country/team. `country` is an ISO-2 code,
 *  `team` an app team code — both self-declared, empty string clears. */
export function saveProfile({ name, country, team } = {}) {
  const cur = getIdentity() || { uid: randomId() };
  if (name !== undefined) cur.name = String(name || "").trim().slice(0, 20);
  if (country !== undefined) cur.country = String(country || "").slice(0, 2).toUpperCase();
  if (team !== undefined) cur.team = String(team || "").slice(0, 8).toUpperCase();
  try { localStorage.setItem(ID_KEY, JSON.stringify(cur)); } catch (e) { /* ignore */ }
  return cur;
}

/** Persist just the display name (back-compat shim over saveProfile). */
export const saveName = (name) => saveProfile({ name });

/** Profile fields to attach to every leaderboard submission (or null if no identity yet). */
export function submitIdentity() {
  const id = getIdentity();
  return id ? { uid: id.uid, name: id.name, country: id.country || "", team: id.team || "" } : null;
}

export async function submitDaily(payload) {
  const res = await fetch(`${API}/api/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `submit failed (${res.status})`);
  return data;
}

// Add the leaderboard SCOPE to a query: scope = null|"world" (nothing), {country} or {team}. The
// server ranks WITHIN that scope, so a board can show "you're #1 in Greece" / among your club's fans.
function withScope(q, scope) {
  if (scope && scope.country) q.set("country", scope.country);
  else if (scope && scope.team) q.set("team", scope.team);
  else if (scope && scope.crew) q.set("crew", scope.crew);
  return q;
}

/* ---------------- Crews (private friend leagues) ---------------- */

async function crewPost(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}
export const createCrew = (payload) => crewPost("/api/crew-create", payload);
export const joinCrew = (payload) => crewPost("/api/crew-join", payload);
export const leaveCrew = (payload) => crewPost("/api/crew-leave", payload);
export async function fetchCrews(uid) {
  if (!uid) return { ok: true, crews: [] };
  const res = await fetch(`${API}/api/crew-list?uid=${encodeURIComponent(uid)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "crews unavailable");
  return data;
}

export async function fetchLeaderboard(dayKey, uid, scope) {
  const q = new URLSearchParams({ day: dayKey });
  if (uid) q.set("uid", uid);
  withScope(q, scope);
  const res = await fetch(`${API}/api/leaderboard?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "leaderboard unavailable");
  return data;
}

/* ---------------- Dynasty streak leaderboards ---------------- */

// Submit a finished run (seed + starting five + recruit choices); the server re-simulates and returns
// the authoritative streak + the board. `board` is "alltime" or a week key.
export async function submitDynasty(payload) {
  const res = await fetch(`${API}/api/dynasty-submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `submit failed (${res.status})`);
  return data;
}

export async function fetchDynastyBoard(board, uid, scope) {
  const q = new URLSearchParams({ board });
  if (uid) q.set("uid", uid);
  withScope(q, scope);
  const res = await fetch(`${API}/api/dynasty-board?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "leaderboard unavailable");
  return data;
}

/* ---------------- Daily G.O.A.T. leaderboard ---------------- */

// Submit a finished daily build (base + five grafts); the server re-simulates and returns the
// authoritative record + composite score + the day's standings.
export async function submitGoatDaily(payload) {
  const res = await fetch(`${API}/api/goat-submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `submit failed (${res.status})`);
  return data;
}

export async function fetchGoatLeaderboard(dayKey, uid, scope) {
  const q = new URLSearchParams({ day: dayKey });
  if (uid) q.set("uid", uid);
  withScope(q, scope);
  const res = await fetch(`${API}/api/goat-leaderboard?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "leaderboard unavailable");
  return data;
}

async function getBoard(path, uid, scope) {
  const q = new URLSearchParams();
  if (uid) q.set("uid", uid);
  withScope(q, scope);
  const qs = q.toString();
  const res = await fetch(`${API}${path}${qs ? "?" + qs : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "leaderboard unavailable");
  return data;
}
export const fetchClassicAllTime = (uid, scope) => getBoard("/api/classic-leaderboard", uid, scope);
export const fetchSalaryAllTime = (uid, scope) => getBoard("/api/salary-leaderboard", uid, scope);
export const fetchGoatAllTime = (uid, scope) => getBoard("/api/goat-alltime-leaderboard", uid, scope);

// Submit a finished Salary-cap build (roster + captain + sixth + coach + won arena); the server
// re-validates the cap and re-sims for the authoritative record + score, keeping this device's best.
export async function submitSalary(payload) {
  const res = await fetch(`${API}/api/salary-submit`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `submit failed (${res.status})`);
  return data;
}

// Submit a finished Classic five (roster + sixth + coach + won arena); the server re-sims for the
// authoritative record + score and keeps this device's best-ever.
export async function submitClassic(payload) {
  const res = await fetch(`${API}/api/classic-submit`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `submit failed (${res.status})`);
  return data;
}
