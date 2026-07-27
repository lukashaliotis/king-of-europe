-- Daily leaderboard store (Cloudflare D1 / SQLite).
-- One authoritative row per (day, device). The record is always what the server re-simulated,
-- never a number the client sent.
CREATE TABLE IF NOT EXISTS scores (
  day_key    TEXT    NOT NULL,          -- UTC day, e.g. "2026-07-27"
  uid        TEXT    NOT NULL,          -- anonymous device id (localStorage)
  name       TEXT    NOT NULL,          -- display name (sanitised)
  wins       INTEGER NOT NULL,
  losses     INTEGER NOT NULL,
  stage      TEXT,                      -- postseason stage id
  label      TEXT,                      -- postseason verdict text
  created_at INTEGER NOT NULL,          -- epoch ms, ties break earliest-first
  PRIMARY KEY (day_key, uid)
);

-- Fast "today's top N, best first, earliest tie-breaker".
CREATE INDEX IF NOT EXISTS idx_scores_day_rank ON scores (day_key, wins DESC, created_at ASC);
