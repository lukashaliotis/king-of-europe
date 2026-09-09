// POST /api/salary-submit — a Salary-cap build (roster + sixth + coach + won arena + captain) comes
// in; the server re-validates the cap and re-simulates the season (resolveSalaryAllTime) for the
// AUTHORITATIVE record + score (Classic score + 50 per unspent €1M). The BEST-EVER score is kept.
import { resolveSalaryAllTime } from "../../web/src/resolveSalary.js";
import { json, cleanName, cleanCode, cleanFeat, loadDataset } from "../_lib/util.js";
import { salaryBoardFor, stampFounder } from "../_lib/board.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }

  const { name, uid, country, team, badge, starters, sixth, coach, arenaSlot, captain } = body || {};
  const dispName = cleanName(name);
  const cc = cleanCode(country, 2), ct = cleanCode(team, 8), cb = cleanFeat(badge);
  if (!dispName) return json({ ok: false, error: "a display name is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  let data;
  try { data = await loadDataset(env, request); }
  catch { return json({ ok: false, error: "server data unavailable" }, 503); }

  const result = resolveSalaryAllTime(data, { starters, sixth, coach, arenaSlot, captain });
  if (!result.ok) return json(result, 400);

  const now = Date.now();
  const founder = await stampFounder(env, uid, now);
  await env.DB.prepare(
    `INSERT INTO salary_scores (uid, name, score, wins, losses, stage, label, unspent, country, team, badge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT(uid) DO UPDATE SET
         name = excluded.name, score = excluded.score, wins = excluded.wins, losses = excluded.losses,
         stage = excluded.stage, label = excluded.label, unspent = excluded.unspent,
         country = excluded.country, team = excluded.team, badge = excluded.badge, created_at = excluded.created_at
       WHERE excluded.score > salary_scores.score`
  ).bind(uid, dispName, result.score, result.wins, result.losses, result.stage, result.label, result.unspent, cc, ct, cb, now).run();

  const board = await salaryBoardFor(env, uid);
  return json({ ok: true, founder, result: { wins: result.wins, losses: result.losses, stage: result.stage, label: result.label, score: result.score, unspent: result.unspent }, ...board });
}
