// GET /api/leaderboard?day=YYYY-MM-DD&uid=... — today's standings (or a given day), plus the
// caller's own rank when a device id is supplied.
import { utcDayKey } from "../../web/src/daily.js";
import { json } from "../_lib/util.js";
import { leaderboardFor } from "../_lib/board.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const dayKey = url.searchParams.get("day") || utcDayKey();
  const uid = url.searchParams.get("uid") || null;
  try {
    const board = await leaderboardFor(env, dayKey, uid);
    return json({ ok: true, day: dayKey, ...board });
  } catch {
    return json({ ok: false, error: "leaderboard unavailable" }, 503);
  }
}
