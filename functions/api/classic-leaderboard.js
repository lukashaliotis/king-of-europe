// GET /api/classic-leaderboard?uid=... — the Classic all-time standings (best score per device),
// plus the caller's own rank when a device id is supplied.
import { json, scopeFromUrl } from "../_lib/util.js";
import { classicBoardFor } from "../_lib/board.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") || null;
  try {
    return json({ ok: true, ...(await classicBoardFor(env, uid, scopeFromUrl(url))) });
  } catch {
    return json({ ok: false, error: "leaderboard unavailable" }, 503);
  }
}
