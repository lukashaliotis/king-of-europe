// D1 reads for the leaderboard. Ordering is wins DESC, then earliest submission first — so a tie
// is broken in favour of whoever posted it sooner that day.

export async function leaderboardFor(env, dayKey, uid, limit = 20) {
  const top = await env.DB.prepare(
    `SELECT name, wins, losses, stage, label
       FROM scores WHERE day_key = ?1
       ORDER BY wins DESC, created_at ASC
       LIMIT ?2`
  ).bind(dayKey, limit).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE day_key = ?1`
  ).bind(dayKey).first();

  let you = null;
  if (uid) {
    you = await env.DB.prepare(
      `SELECT name, wins, losses, stage, label,
              (SELECT COUNT(*) + 1 FROM scores s2
                 WHERE s2.day_key = s.day_key
                   AND (s2.wins > s.wins OR (s2.wins = s.wins AND s2.created_at < s.created_at))) AS rank
         FROM scores s WHERE s.day_key = ?1 AND s.uid = ?2`
    ).bind(dayKey, uid).first();
  }

  const rows = (top.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
  return { total: totalRow ? totalRow.n : 0, top: rows, you: you || null };
}

// Dynasty streak standings for a board ("alltime" or a week key): best streak first, earliest
// submission breaking ties, plus the caller's own rank.
export async function dynastyBoardFor(env, board, uid, limit = 20) {
  const top = await env.DB.prepare(
    `SELECT name, streak FROM dynasty_scores WHERE board = ?1
       ORDER BY streak DESC, created_at ASC LIMIT ?2`
  ).bind(board, limit).all();

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM dynasty_scores WHERE board = ?1`
  ).bind(board).first();

  let you = null;
  if (uid) {
    you = await env.DB.prepare(
      `SELECT name, streak,
              (SELECT COUNT(*) + 1 FROM dynasty_scores s2
                 WHERE s2.board = s.board
                   AND (s2.streak > s.streak OR (s2.streak = s.streak AND s2.created_at < s.created_at))) AS rank
         FROM dynasty_scores s WHERE s.board = ?1 AND s.uid = ?2`
    ).bind(board, uid).first();
  }

  const rows = (top.results || []).map((r, i) => ({ ...r, rank: i + 1 }));
  return { total: totalRow ? totalRow.n : 0, top: rows, you: you || null };
}
