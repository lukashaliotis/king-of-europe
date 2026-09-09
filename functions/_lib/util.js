// Shared helpers for the Pages Functions. Files under _lib are not routed.

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

// A display name: printable, trimmed, capped. Strips control characters and angle brackets so a
// name can never inject markup into the leaderboard, but keeps spaces, letters, and digits.
const STRIP = new RegExp("[\\u0000-\\u001f\\u007f<>]", "g");
export const cleanName = (s) =>
  String(s || "").replace(STRIP, "").replace(/\s+/g, " ").trim().slice(0, 20);

// A profile code (country ISO-2 or team code): uppercase A–Z/0–9 only, short. Self-declared, so we
// don't validate against the master list here — just sanitise so it can't inject or bloat a row.
export const cleanCode = (s, max = 8) =>
  String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, max);

// A displayed feat/badge id: lowercase a–z/0–9/underscore (e.g. "goat_season"), short. Self-declared
// like country/team, so just sanitised, not validated against the catalog.
export const cleanFeat = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16);

// Parse a leaderboard scope from a request URL: ?country=GR or ?team=PAN → { country } | { team } |
// null (World). Country wins if both are present. Values are sanitised (bound in SQL regardless).
export function scopeFromUrl(url) {
  const country = cleanCode(url.searchParams.get("country"), 2);
  if (country) return { country };
  const team = cleanCode(url.searchParams.get("team"), 8);
  if (team) return { team };
  const crew = cleanCode(url.searchParams.get("crew"), 12); // a crew join-code
  if (crew) return { crew };
  return null;
}

// The Worker isolate is reused across requests, so parse the 2.4 MB dataset once and keep it.
let DATA_CACHE = null;
export async function loadDataset(env, request) {
  if (DATA_CACHE) return DATA_CACHE;
  const res = await env.ASSETS.fetch(new URL("/data/players.json", request.url));
  if (!res.ok) throw new Error("dataset unavailable");
  DATA_CACHE = await res.json();
  return DATA_CACHE;
}
