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

/** { uid, name } or null if no name has been chosen yet. */
export function getIdentity() {
  try {
    const raw = JSON.parse(localStorage.getItem(ID_KEY) || "null");
    if (raw && raw.uid) return raw;
  } catch (e) { /* ignore */ }
  return null;
}

/** Persist a chosen display name (minting a device id on first use). */
export function saveName(name) {
  const cur = getIdentity() || { uid: randomId() };
  cur.name = String(name || "").trim().slice(0, 20);
  try { localStorage.setItem(ID_KEY, JSON.stringify(cur)); } catch (e) { /* ignore */ }
  return cur;
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

export async function fetchLeaderboard(dayKey, uid) {
  const q = new URLSearchParams({ day: dayKey });
  if (uid) q.set("uid", uid);
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

export async function fetchDynastyBoard(board, uid) {
  const q = new URLSearchParams({ board });
  if (uid) q.set("uid", uid);
  const res = await fetch(`${API}/api/dynasty-board?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "leaderboard unavailable");
  return data;
}
