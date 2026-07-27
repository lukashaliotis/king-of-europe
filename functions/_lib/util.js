// Shared helpers for the Pages Functions. Files under _lib are not routed.

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

// A display name: printable, trimmed, capped. Strips control characters and angle brackets so a
// name can never inject markup into the leaderboard, but keeps spaces, letters, and digits.
const STRIP = new RegExp("[\\u0000-\\u001f\\u007f<>]", "g");
export const cleanName = (s) =>
  String(s || "").replace(STRIP, "").replace(/\s+/g, " ").trim().slice(0, 20);

// The Worker isolate is reused across requests, so parse the 2.4 MB dataset once and keep it.
let DATA_CACHE = null;
export async function loadDataset(env, request) {
  if (DATA_CACHE) return DATA_CACHE;
  const res = await env.ASSETS.fetch(new URL("/data/players.json", request.url));
  if (!res.ok) throw new Error("dataset unavailable");
  DATA_CACHE = await res.json();
  return DATA_CACHE;
}
