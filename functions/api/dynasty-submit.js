// POST /api/dynasty-submit — a Dynasty run's seed + starting five + recruit choices come in; the
// gauntlet is re-simulated server-side (resolveDynasty) to get the AUTHORITATIVE streak, and the
// player's BEST streak for the board is kept. The client can submit choices, never a streak.
import { resolveDynasty } from "../../web/src/resolveDynasty.js";
import { weekKey } from "../../web/src/daily.js";
import { json, cleanName, cleanCode, cleanFeat, loadDataset } from "../_lib/util.js";
import { dynastyBoardFor, stampFounder } from "../_lib/board.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }

  const { board, name, uid, country, team, badge, seed, startFive, arena, choices } = body || {};
  if (board !== "alltime" && board !== weekKey()) return json({ ok: false, error: "invalid or closed board" }, 400);
  const dispName = cleanName(name);
  const cc = cleanCode(country, 2), ct = cleanCode(team, 8), cb = cleanFeat(badge);
  if (!dispName) return json({ ok: false, error: "a display name is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  let data;
  try { data = await loadDataset(env, request); }
  catch { return json({ ok: false, error: "server data unavailable" }, 503); }

  const res = resolveDynasty(data, { board, seed, startFive, arena, choices });
  if (!res.ok) return json(res, 400);

  const now = Date.now();
  const founder = await stampFounder(env, uid, now);
  // Keep the BEST streak per (board, device): update only when this run beats the stored one.
  await env.DB.prepare(
    `INSERT INTO dynasty_scores (board, uid, name, streak, seed, country, team, badge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(board, uid) DO UPDATE SET
         name = excluded.name, streak = excluded.streak, seed = excluded.seed,
         country = excluded.country, team = excluded.team, badge = excluded.badge, created_at = excluded.created_at
       WHERE excluded.streak > dynasty_scores.streak`
  ).bind(board, uid, dispName, res.streak, (Number(seed) || 0) >>> 0, cc, ct, cb, now).run();

  const boardData = await dynastyBoardFor(env, board, uid);
  return json({ ok: true, streak: res.streak, founder, ...boardData });
}
