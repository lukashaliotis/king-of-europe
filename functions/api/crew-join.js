// POST /api/crew-join — { code, uid, player } → join an existing crew by its code. Caps membership
// per device so the scope-chip row stays sane. Idempotent (re-joining is a no-op).
import { json, cleanName, cleanCode } from "../_lib/util.js";

const MAX_CREWS = 12; // per device

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }
  const { code, uid, player } = body || {};
  const cc = cleanCode(code, 12);
  if (!cc) return json({ ok: false, error: "a crew code is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  const crew = await env.DB.prepare(`SELECT crew_id, name FROM crews WHERE crew_id = ?1`).bind(cc).first();
  if (!crew) return json({ ok: false, error: "no crew has that code" }, 404);

  // Already a member? Just return it (idempotent). Otherwise enforce the per-device cap.
  const mine = await env.DB.prepare(`SELECT 1 FROM crew_members WHERE crew_id = ?1 AND uid = ?2`).bind(cc, uid).first();
  if (!mine) {
    const cntRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crew_members WHERE uid = ?1`).bind(uid).first();
    if (cntRow && cntRow.n >= MAX_CREWS) return json({ ok: false, error: `you're already in ${MAX_CREWS} crews` }, 400);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO crew_members (crew_id, uid, name, joined_at) VALUES (?1, ?2, ?3, ?4)`
    ).bind(cc, uid, cleanName(player), Date.now()).run();
  }

  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ?1`).bind(cc).first();
  return json({ ok: true, crew: { id: cc, name: crew.name, members: total ? total.n : 1 } });
}
