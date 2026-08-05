// GET /api/dynasty-board?board=alltime&uid=... — Dynasty streak standings for a board ("alltime" or
// a week key), plus the caller's own rank when a device id is supplied.
import { json } from "../_lib/util.js";
import { dynastyBoardFor } from "../_lib/board.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const board = url.searchParams.get("board") || "alltime";
  const uid = url.searchParams.get("uid") || null;
  try {
    const data = await dynastyBoardFor(env, board, uid);
    return json({ ok: true, board, ...data });
  } catch {
    return json({ ok: false, error: "leaderboard unavailable" }, 503);
  }
}
