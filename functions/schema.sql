-- Daily leaderboard store (Cloudflare D1 / SQLite).
-- One authoritative row per (day, device). The record is always what the server re-simulated,
-- never a number the client sent.
-- `country` (ISO-2), `team` (app team code) and `badge` (chosen feat id) are self-declared profile
-- fields used for the country/team scopes and the flag/badge shown by each name; '' = unset.
CREATE TABLE IF NOT EXISTS scores (
  day_key    TEXT    NOT NULL,          -- UTC day, e.g. "2026-07-27"
  uid        TEXT    NOT NULL,          -- anonymous device id (localStorage)
  name       TEXT    NOT NULL,          -- display name (sanitised)
  wins       INTEGER NOT NULL,
  losses     INTEGER NOT NULL,
  stage      TEXT,                      -- postseason stage id
  label      TEXT,                      -- postseason verdict text
  country    TEXT    NOT NULL DEFAULT '',
  team       TEXT    NOT NULL DEFAULT '',
  badge      TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,          -- epoch ms, ties break earliest-first
  PRIMARY KEY (day_key, uid)
);
CREATE INDEX IF NOT EXISTS idx_scores_day_rank ON scores (day_key, wins DESC, created_at ASC);

-- Dynasty streak leaderboards. One BEST-EVER row per (board, device): board is "alltime" or a week
-- key like "2026-W32". The streak is always what the server re-simulated (resolveDynasty.js).
CREATE TABLE IF NOT EXISTS dynasty_scores (
  board      TEXT    NOT NULL,          -- "alltime" | week key "YYYY-Www"
  uid        TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  streak     INTEGER NOT NULL,
  seed       INTEGER,                   -- the run's seed (replay/debug)
  country    TEXT    NOT NULL DEFAULT '',
  team       TEXT    NOT NULL DEFAULT '',
  badge      TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,          -- epoch ms; ties break earliest-first
  PRIMARY KEY (board, uid)
);
CREATE INDEX IF NOT EXISTS idx_dynasty_rank ON dynasty_scores (board, streak DESC, created_at ASC);

-- Daily G.O.A.T. leaderboard. One authoritative row per (day, device). Ranked by a composite `score`
-- the server computes from the re-simulated build (resolveGoat.js). wins/stage/awards for display.
CREATE TABLE IF NOT EXISTS goat_scores (
  day_key     TEXT    NOT NULL,          -- UTC day, e.g. "2026-08-13"
  uid         TEXT    NOT NULL,          -- anonymous device id (localStorage)
  name        TEXT    NOT NULL,          -- display name (sanitised)
  score       INTEGER NOT NULL,          -- composite score (the ranking key)
  wins        INTEGER NOT NULL,
  losses      INTEGER NOT NULL,
  stage       TEXT,                      -- postseason stage id
  label       TEXT,                      -- postseason verdict text
  awards      INTEGER NOT NULL DEFAULT 0,-- number of individual awards earned
  goat_season INTEGER NOT NULL DEFAULT 0,-- 1 if the full G.O.A.T. season (38-0 + title + MVP + F4 MVP)
  country     TEXT    NOT NULL DEFAULT '',
  team        TEXT    NOT NULL DEFAULT '',
  badge       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,          -- epoch ms; ties break earliest-first
  PRIMARY KEY (day_key, uid)
);
CREATE INDEX IF NOT EXISTS idx_goat_day_rank ON goat_scores (day_key, score DESC, created_at ASC);

-- Classic ALL-TIME leaderboard. One BEST-EVER row per device (Classic is unlimited free play). Ranked
-- by the composite `score` the server re-computes from the submitted roster (resolveClassic.js).
CREATE TABLE IF NOT EXISTS classic_scores (
  uid        TEXT    NOT NULL,             -- anonymous device id
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,             -- the ranking key
  wins       INTEGER NOT NULL,
  losses     INTEGER NOT NULL,
  stage      TEXT,
  label      TEXT,
  country    TEXT    NOT NULL DEFAULT '',
  team       TEXT    NOT NULL DEFAULT '',
  badge      TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,             -- epoch ms; ties break earliest-first
  PRIMARY KEY (uid)
);
CREATE INDEX IF NOT EXISTS idx_classic_rank ON classic_scores (score DESC, created_at ASC);

-- Salary-cap ALL-TIME leaderboard. One BEST-EVER row per device. Ranked by the composite `score` the
-- server re-computes (resolveSalary.js): Classic score + 50 per unspent €1M. `unspent` kept for display.
CREATE TABLE IF NOT EXISTS salary_scores (
  uid        TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,             -- the ranking key
  wins       INTEGER NOT NULL,
  losses     INTEGER NOT NULL,
  stage      TEXT,
  label      TEXT,
  unspent    INTEGER NOT NULL DEFAULT 0,   -- €M left under the cap (efficiency, shown on the board)
  country    TEXT    NOT NULL DEFAULT '',
  team       TEXT    NOT NULL DEFAULT '',
  badge      TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid)
);
CREATE INDEX IF NOT EXISTS idx_salary_rank ON salary_scores (score DESC, created_at ASC);

-- G.O.A.T. ALL-TIME leaderboard. One BEST-EVER row per device across any G.O.A.T. build (free or
-- daily). Same composite score as the daily board (resolveGoat.js / goatScore).
CREATE TABLE IF NOT EXISTS goat_alltime (
  uid         TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  wins        INTEGER NOT NULL,
  losses      INTEGER NOT NULL,
  stage       TEXT,
  label       TEXT,
  awards      INTEGER NOT NULL DEFAULT 0,
  goat_season INTEGER NOT NULL DEFAULT 0,
  country     TEXT    NOT NULL DEFAULT '',
  team        TEXT    NOT NULL DEFAULT '',
  badge       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (uid)
);
CREATE INDEX IF NOT EXISTS idx_goat_alltime_rank ON goat_alltime (score DESC, created_at ASC);

-- Player registry: one row per device on its FIRST submission. Used to award the Founder badge to
-- the first 10 players (by created_at). Written INSERT OR IGNORE so the first stamp wins.
CREATE TABLE IF NOT EXISTS players (
  uid        TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid)
);
CREATE INDEX IF NOT EXISTS idx_players_seen ON players (created_at ASC);

-- Crews: private friend leagues. `crew_id` IS the shareable join code (short, uppercase). A crew
-- board = the standings filtered to its members (see the crew scope in _lib/board.js).
CREATE TABLE IF NOT EXISTS crews (
  crew_id    TEXT    NOT NULL,          -- the join code, e.g. "K7QF2M"
  name       TEXT    NOT NULL,
  created_by TEXT    NOT NULL,          -- creator's uid
  created_at INTEGER NOT NULL,
  PRIMARY KEY (crew_id)
);
CREATE TABLE IF NOT EXISTS crew_members (
  crew_id    TEXT    NOT NULL,
  uid        TEXT    NOT NULL,
  name       TEXT    NOT NULL DEFAULT '', -- cached display name (for a members list without a join)
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (crew_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_crew_by_uid ON crew_members (uid);
