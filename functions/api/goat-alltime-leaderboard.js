// GET /api/goat-alltime-leaderboard?uid=... — the G.O.A.T. all-time standings (best score per
// device across all days), plus the caller's own rank.
import { json, scopeFromUrl } from "../_lib/util.js";
import { goatAllTimeBoardFor } from "../_lib/board.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") || null;
  try {
    return json({ ok: true, ...(await goatAllTimeBoardFor(env, uid, scopeFromUrl(url))) });
  } catch {
    return json({ ok: false, error: "leaderboard unavailable" }, 503);
  }
}
