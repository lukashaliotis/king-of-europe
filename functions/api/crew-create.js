// POST /api/crew-create — { name, uid, player } → mint a short join code, create the crew, and add
// the creator as its first member. The crew_id IS the shareable code. Names are sanitised.
import { json, cleanName } from "../_lib/util.js";

// Unambiguous code alphabet (no I/O/0/1) so a shared code is easy to read and type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "malformed request" }, 400); }
  const { name, uid, player } = body || {};
  const crewName = cleanName(name);
  if (!crewName) return json({ ok: false, error: "a crew name is required" }, 400);
  if (!uid || typeof uid !== "string" || uid.length > 64) return json({ ok: false, error: "invalid device id" }, 400);

  const now = Date.now();
  let code = null;
  for (let tries = 0; tries < 8 && !code; tries++) {
    const c = genCode();
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO crews (crew_id, name, created_by, created_at) VALUES (?1, ?2, ?3, ?4)`
    ).bind(c, crewName, uid, now).run();
    if (r.meta && r.meta.changes > 0) code = c; // inserted → no code collision
  }
  if (!code) return json({ ok: false, error: "couldn't create a crew — try again" }, 500);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO crew_members (crew_id, uid, name, joined_at) VALUES (?1, ?2, ?3, ?4)`
  ).bind(code, uid, cleanName(player), now).run();

  return json({ ok: true, crew: { id: code, name: crewName, members: 1 } });
}
