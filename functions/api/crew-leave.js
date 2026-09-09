// POST /api/crew-leave — { code, uid } → leave a crew. The crew + its scores stay; only this
// device's membership is removed (so the crew chip disappears for them).
import { json, cleanCode } from "../_lib/util.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }
  const { code, uid } = body || {};
  const cc = cleanCode(code, 12);
  if (!cc || !uid) return json({ ok: false, error: "invalid request" }, 400);
  await env.DB.prepare(`DELETE FROM crew_members WHERE crew_id = ?1 AND uid = ?2`).bind(cc, uid).run();
  return json({ ok: true });
}
