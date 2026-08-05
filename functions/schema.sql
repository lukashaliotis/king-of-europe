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

-- Dynasty streak leaderboards. One BEST-EVER row per (board, device): board is "alltime" or a week
-- key like "2026-W32". The streak is always what the server re-simulated from the run's seed +
-- choices (see resolveDynasty.js), never a number the client sent.
CREATE TABLE IF NOT EXISTS dynasty_scores (
  board      TEXT    NOT NULL,          -- "alltime" | week key "YYYY-Www"
  uid        TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  streak     INTEGER NOT NULL,
  seed       INTEGER,                   -- the run's seed (replay/debug)
  created_at INTEGER NOT NULL,          -- epoch ms; ties break earliest-first
  PRIMARY KEY (board, uid)
);
CREATE INDEX IF NOT EXISTS idx_dynasty_rank ON dynasty_scores (board, streak DESC, created_at ASC);
