// POST /api/goat-submit — a player's Daily G.O.A.T. choices (base + five grafts) come in; the build
// is re-simulated server-side (resolveGoatDaily) to get the AUTHORITATIVE record + composite score,
// which is what gets stored. One ranked row per (day, device); the client submits choices, never a score.
import { resolveGoatDaily } from "../../web/src/resolveGoat.js";
import { utcDayKey } from "../../web/src/daily.js";
import { json, cleanName, cleanCode, cleanFeat, loadDataset } from "../_lib/util.js";
import { goatBoardFor, stampFounder } from "../_lib/board.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }

  const { dayKey, name, uid, country, team, badge, base, grafts } = body || {};

  // Only today's board is rankable — no back-filling past days for an easy record.
  if (dayKey !== utcDayKey()) return json({ ok: false, error: "you can only post today's board" }, 400);
  const dispName = cleanName(name);
  const cc = cleanCode(country, 2), ct = cleanCode(team, 8), cb = cleanFeat(badge);
  if (!dispName) return json({ ok: false, error: "a display name is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  let data;
  try { data = await loadDataset(env, request); }
  catch { return json({ ok: false, error: "server data unavailable" }, 503); }

  const result = resolveGoatDaily(data, dayKey, { base, grafts });
  if (!result.ok) return json(result, 400);

  // One attempt per (day, device), enforced server-side too — a repeat submit is a no-op.
  const awards = result.awards.length, gs = result.goatSeason ? 1 : 0, now = Date.now();
  const founder = await stampFounder(env, uid, now);
  await env.DB.prepare(
    `INSERT INTO goat_scores (day_key, uid, name, score, wins, losses, stage, label, awards, goat_season, country, team, badge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
       ON CONFLICT(day_key, uid) DO NOTHING`
  ).bind(dayKey, uid, dispName, result.score, result.wins, result.losses, result.stage, result.label, awards, gs, cc, ct, cb, now).run();

  // Feed the G.O.A.T. ALL-TIME board too — keep this device's best score ever.
  await env.DB.prepare(
    `INSERT INTO goat_alltime (uid, name, score, wins, losses, stage, label, awards, goat_season, country, team, badge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
       ON CONFLICT(uid) DO UPDATE SET
         name = excluded.name, score = excluded.score, wins = excluded.wins, losses = excluded.losses,
         stage = excluded.stage, label = excluded.label, awards = excluded.awards,
         goat_season = excluded.goat_season, country = excluded.country, team = excluded.team, badge = excluded.badge, created_at = excluded.created_at
       WHERE excluded.score > goat_alltime.score`
  ).bind(uid, dispName, result.score, result.wins, result.losses, result.stage, result.label, awards, gs, cc, ct, cb, now).run();

  const board = await goatBoardFor(env, dayKey, uid);
  return json({
    ok: true,
    founder,
    result: { wins: result.wins, losses: result.losses, stage: result.stage, label: result.label,
              awards: result.awards, goatSeason: result.goatSeason, score: result.score },
    ...board,
  });
}
