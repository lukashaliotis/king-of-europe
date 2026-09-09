// GET /api/crew-list?uid=... → the crews this device belongs to, with member counts, oldest first.
import { json } from "../_lib/util.js";

export async function onRequestGet({ request, env }) {
  const uid = new URL(request.url).searchParams.get("uid");
  if (!uid) return json({ ok: true, crews: [] });
  try {
    const rows = await env.DB.prepare(
      `SELECT c.crew_id AS id, c.name AS name,
              (SELECT COUNT(*) FROM crew_members m2 WHERE m2.crew_id = c.crew_id) AS members
         FROM crew_members m JOIN crews c ON c.crew_id = m.crew_id
        WHERE m.uid = ?1
        ORDER BY m.joined_at ASC`
    ).bind(uid).all();
    return json({ ok: true, crews: rows.results || [] });
  } catch {
    return json({ ok: false, error: "crews unavailable" }, 503);
  }
}
