// POST /api/classic-submit — a Classic five (roster + sixth + coach + won arena) comes in; the season
// is re-simulated server-side (resolveClassicAllTime) for the AUTHORITATIVE record + score. The
// player's BEST-EVER score is kept. The client submits choices, never a score.
import { resolveClassicAllTime } from "../../web/src/resolveClassic.js";
import { json, cleanName, cleanCode, cleanFeat, loadDataset } from "../_lib/util.js";
import { classicBoardFor, stampFounder } from "../_lib/board.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }

  const { name, uid, country, team, badge, starters, sixth, coach, arenaSlot } = body || {};
  const dispName = cleanName(name);
  const cc = cleanCode(country, 2), ct = cleanCode(team, 8), cb = cleanFeat(badge);
  if (!dispName) return json({ ok: false, error: "a display name is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  let data;
  try { data = await loadDataset(env, request); }
  catch { return json({ ok: false, error: "server data unavailable" }, 503); }

  const result = resolveClassicAllTime(data, { starters, sixth, coach, arenaSlot });
  if (!result.ok) return json(result, 400);

  const now = Date.now();
  const founder = await stampFounder(env, uid, now);
  // Keep the BEST score per device: update only when this beats the stored one.
  await env.DB.prepare(
    `INSERT INTO classic_scores (uid, name, score, wins, losses, stage, label, country, team, badge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(uid) DO UPDATE SET
         name = excluded.name, score = excluded.score, wins = excluded.wins, losses = excluded.losses,
         stage = excluded.stage, label = excluded.label,
         country = excluded.country, team = excluded.team, badge = excluded.badge, created_at = excluded.created_at
       WHERE excluded.score > classic_scores.score`
  ).bind(uid, dispName, result.score, result.wins, result.losses, result.stage, result.label, cc, ct, cb, now).run();

  const board = await classicBoardFor(env, uid);
  return json({ ok: true, founder, result: { wins: result.wins, losses: result.losses, stage: result.stage, label: result.label, score: result.score }, ...board });
}
