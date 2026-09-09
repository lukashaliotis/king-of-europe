// D1 reads for the leaderboards. Ordering is the ranking key DESC, then earliest submission first —
// so a tie is broken in favour of whoever posted it sooner.
//
// SCOPE: every board can be filtered to a single country or team ("World" = no filter). The scope
// COLUMN is chosen from a fixed whitelist (safe to inline in SQL); the scope VALUE is always bound.
// Rank/total are computed WITHIN the scope, so "you're #1 in Greece" is your rank among Greeks only.

// A scope → { cond(alias), val }: cond(alias) builds the SQL condition (alias is "" for the top query
// or "s2." inside a rank subquery); val is always bound. Country/team are column filters; a crew is a
// membership subquery. The column names + subquery shape are fixed here (safe); only val is bound.
function scopeOf(scope) {
  if (!scope) return null;
  if (scope.country) return { cond: (a) => `${a}country = ?`, val: String(scope.country) };
  if (scope.team) return { cond: (a) => `${a}team = ?`, val: String(scope.team) };
  if (scope.crew) return { cond: (a) => `${a}uid IN (SELECT uid FROM crew_members WHERE crew_id = ?)`, val: String(scope.crew) };
  return null;
}

// Stamp a device's first-seen time (once) and report whether it's a FOUNDER — one of the first 10
// players ever to submit. Tie-break by uid so the cutoff is deterministic.
export async function stampFounder(env, uid, now) {
  await env.DB.prepare(`INSERT OR IGNORE INTO players (uid, created_at) VALUES (?1, ?2)`).bind(uid, now).run();
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM players p2
               WHERE p2.created_at < p.created_at
                  OR (p2.created_at = p.created_at AND p2.uid < p.uid)) AS ahead
       FROM players p WHERE p.uid = ?1`
  ).bind(uid).first();
  return !!row && row.ahead < 10;
}

// Daily Classic standings for a day (record-ranked). `scope` = null | {country} | {team}.
export async function leaderboardFor(env, dayKey, uid, scope, limit = 20) {
  const s = scopeOf(scope), filt = s ? ` AND ${s.cond("")}` : "";
  const top = await env.DB.prepare(
    `SELECT name, wins, losses, stage, label, country, team, badge
       FROM scores WHERE day_key = ?${filt}
       ORDER BY wins DESC, created_at ASC LIMIT ?`
  ).bind(...(s ? [dayKey, s.val, limit] : [dayKey, limit])).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE day_key = ?${filt}`
  ).bind(...(s ? [dayKey, s.val] : [dayKey])).first();

  let you = null;
  if (uid) {
    you = await env.DB.prepare(
      `SELECT name, wins, losses, stage, label, country, team, badge,
              (SELECT COUNT(*) + 1 FROM scores s2
                 WHERE s2.day_key = s.day_key${s ? ` AND ${s.cond("s2.")}` : ""}
                   AND (s2.wins > s.wins OR (s2.wins = s.wins AND s2.created_at < s.created_at))) AS rank
         FROM scores s WHERE s.day_key = ? AND s.uid = ?`
    ).bind(...(s ? [s.val, dayKey, uid] : [dayKey, uid])).first();
  }

  const rows = (top.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
  return { total: totalRow ? totalRow.n : 0, top: rows, you: you || null };
}

// Daily G.O.A.T. standings for a day (composite-score ranked).
export async function goatBoardFor(env, dayKey, uid, scope, limit = 20) {
  const s = scopeOf(scope), filt = s ? ` AND ${s.cond("")}` : "";
  const top = await env.DB.prepare(
    `SELECT name, score, wins, losses, stage, label, awards, goat_season, country, team, badge
       FROM goat_scores WHERE day_key = ?${filt}
       ORDER BY score DESC, created_at ASC LIMIT ?`
  ).bind(...(s ? [dayKey, s.val, limit] : [dayKey, limit])).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM goat_scores WHERE day_key = ?${filt}`
  ).bind(...(s ? [dayKey, s.val] : [dayKey])).first();

  let you = null;
  if (uid) {
    you = await env.DB.prepare(
      `SELECT name, score, wins, losses, stage, label, awards, goat_season, country, team, badge,
              (SELECT COUNT(*) + 1 FROM goat_scores s2
                 WHERE s2.day_key = s.day_key${s ? ` AND ${s.cond("s2.")}` : ""}
                   AND (s2.score > s.score OR (s2.score = s.score AND s2.created_at < s.created_at))) AS rank
         FROM goat_scores s WHERE s.day_key = ? AND s.uid = ?`
    ).bind(...(s ? [s.val, dayKey, uid] : [dayKey, uid])).first();
  }

  const rows = (top.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
  return { total: totalRow ? totalRow.n : 0, top: rows, you: you || null };
}

// Score-ranked ALL-TIME standings from a table with a single best-ever row per uid (classic_scores
// or goat_alltime). `cols` is the extra display columns beyond the shared set.
async function allTimeBoardFor(env, table, uid, cols, scope, limit) {
  const s = scopeOf(scope), filt = s ? ` WHERE ${s.cond("")}` : "";
  const sel = ["name", "score", "wins", "losses", "stage", "label", "country", "team", "badge", ...cols].join(", ");
  const top = await env.DB.prepare(
    `SELECT ${sel} FROM ${table}${filt} ORDER BY score DESC, created_at ASC LIMIT ?`
  ).bind(...(s ? [s.val, limit] : [limit])).all();
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}${filt}`)
    .bind(...(s ? [s.val] : [])).first();
  let you = null;
  if (uid) {
    you = await env.DB.prepare(
      `SELECT ${sel},
              (SELECT COUNT(*) + 1 FROM ${table} s2
                 WHERE ${s ? `${s.cond("s2.")} AND ` : ""}(s2.score > s.score OR (s2.score = s.score AND s2.created_at < s.created_at))) AS rank
         FROM ${table} s WHERE s.uid = ?`
    ).bind(...(s ? [s.val, uid] : [uid])).first();
  }
  const rows = (top.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
  return { total: totalRow ? totalRow.n : 0, top: rows, you: you || null };
}

export const classicBoardFor = (env, uid, scope, limit = 20) => allTimeBoardFor(env, "classic_scores", uid, [], scope, limit);
export const salaryBoardFor = (env, uid, scope, limit = 20) => allTimeBoardFor(env, "salary_scores", uid, ["unspent"], scope, limit);
export const goatAllTimeBoardFor = (env, uid, scope, limit = 20) => allTimeBoardFor(env, "goat_alltime", uid, ["awards", "goat_season"], scope, limit);

// Dynasty streak standings for a board ("alltime" or a week key), streak-ranked.
export async function dynastyBoardFor(env, board, uid, scope, limit = 20) {
  const s = scopeOf(scope), filt = s ? ` AND ${s.cond("")}` : "";
  const top = await env.DB.prepare(
    `SELECT name, streak, country, team, badge FROM dynasty_scores WHERE board = ?${filt}
       ORDER BY streak DESC, created_at ASC LIMIT ?`
  ).bind(...(s ? [board, s.val, limit] : [board, limit])).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dynasty_scores WHERE board = ?${filt}`
  ).bind(...(s ? [board, s.val] : [board])).first();

  let you = null;
  if (uid) {
    you = await env.DB.prepare(
      `SELECT name, streak, country, team, badge,
              (SELECT COUNT(*) + 1 FROM dynasty_scores s2
                 WHERE s2.board = s.board${s ? ` AND ${s.cond("s2.")}` : ""}
                   AND (s2.streak > s.streak OR (s2.streak = s.streak AND s2.created_at < s.created_at))) AS rank
         FROM dynasty_scores s WHERE s.board = ? AND s.uid = ?`
    ).bind(...(s ? [s.val, board, uid] : [board, uid])).first();
  }

  const rows = (top.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
  return { total: totalRow ? totalRow.n : 0, top: rows, you: you || null };
}
