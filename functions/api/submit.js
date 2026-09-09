// POST /api/submit — a player's Daily choices come in; the engine is re-run server-side to get
// the AUTHORITATIVE record, which is what gets stored. One ranked row per (day, device).
import { resolveDaily } from "../../web/src/resolve.js";
import { utcDayKey } from "../../web/src/daily.js";
import { json, cleanName, cleanCode, cleanFeat, loadDataset } from "../_lib/util.js";
import { leaderboardFor, stampFounder } from "../_lib/board.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }

  const { dayKey, name, uid, country, team, badge, starters, sixth, coach } = body || {};

  // Only today's board is rankable — no back-filling past days for an easy record.
  if (dayKey !== utcDayKey()) return json({ ok: false, error: "you can only post today's board" }, 400);
  const dispName = cleanName(name);
  const cc = cleanCode(country, 2), ct = cleanCode(team, 8), cb = cleanFeat(badge);
  if (!dispName) return json({ ok: false, error: "a display name is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  let data;
  try { data = await loadDataset(env, request); }
  catch { return json({ ok: false, error: "server data unavailable" }, 503); }

  const result = resolveDaily(data, dayKey, { starters, sixth, coach });
  if (!result.ok) return json(result, 400);

  const now = Date.now();
  const founder = await stampFounder(env, uid, now);
  // Insert only if this device hasn't already posted today — the one-attempt lockout, enforced
  // server-side too. A repeat submit is a no-op and just returns the standings.
  await env.DB.prepare(
    `INSERT INTO scores (day_key, uid, name, wins, losses, stage, label, country, team, badge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(day_key, uid) DO NOTHING`
  ).bind(dayKey, uid, dispName, result.wins, result.losses, result.stage, result.label, cc, ct, cb, now).run();

  const board = await leaderboardFor(env, dayKey, uid);
  return json({
    ok: true,
    founder,
    result: { wins: result.wins, losses: result.losses, stage: result.stage, label: result.label },
    ...board,
  });
}
