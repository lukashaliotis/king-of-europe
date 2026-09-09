## Backup worker (2026-09-09)

The leaderboards run on D1 (`koe-leaderboard`) and had **no backup**. Nine tables — the Daily,
Classic, Salary, Dynasty and G.O.A.T. boards, the device roll, and `crews`/`crew_members`, the
private friend leagues people create and join. `data/players.json` can be re-baked from the pipeline;
none of this can.

`backup-worker/` is now a separate Worker with its own `wrangler.toml`, its own KV namespace
(`king-of-europe-backup-BACKUPS_KV`), and a weekly cron (Mondays 03:00 UTC), matching book-crate and
the-crate. It keeps the last 26 snapshots (~six months).

- https://king-of-europe-backup.lukashaliotis.workers.dev
- `GET /run` — snapshot now · `GET /list` — what is stored · `GET /peek?key=<key>` — download one back

Two deliberate differences from the other crates' workers:

- **Tables are discovered from `sqlite_master`, not hardcoded.** This schema grew a table at a time
  (Classic, Salary, G.O.A.T. all-time and crews all arrived after the first board). A hardcoded list
  silently stops covering whatever was added last, which is the one failure a backup must not have.
- **`/peek` exists.** The other workers can write a snapshot but not read one back out; without a
  restore path a backup is only a promise.

Verified end to end: a real snapshot ran (29 rows across all 9 tables) and was read back as valid
JSON. The workspace `CLAUDE.md` registry had 38-0 listed as a plain static site with no Cloudflare
resources — corrected, since the isolation guardrail cannot protect a database it does not know about.

## Regression suite + an order-dependence bug (2026-09-09)

`npm run check` — `node:test`, no dependencies, ~4 seconds. 53 tests across engine, report,
archetypes, postseason, data, anti-cheat and difficulty bands.

**It found a real bug on the first run.** `projectRecord` re-centres a five onto its era using one
season's baked `catOffset`, chosen by scanning for the roster's modal year and keeping the FIRST
season to reach the highest count. Every normal mode draws each pick from a different club-season, so
all five counts were 1 and the "modal year" was just whoever sat in the first slot: **the same five
arranged differently produced a different record in 64% of drafts**, and the man at point guard
silently decided the whole team's era adjustment.

Fixed by averaging the five men's own season offsets — order-independent, truer (a five spanning 2003
to 2023 belongs to a blended era, not to one member's year), and it collapses to the old behaviour
exactly when the five DO share a season. Order-dependence 64% -> 0%; difficulty unchanged (skilled
median 29-30, 38-0 2.2%).

Bands are deliberately wide — tripwires for a real shift, not pins on exact numbers.

## Splitting app.js — first two modules (2026-09-09)

`app.js` was 4,472 lines and 308 top-level declarations: the draft flow, six modes, every render, the
reveal animation, the leaderboards and the modals, all closing over one shared `state`. Measured the
coupling per section first (how many app-level names each block still needs) and took the two with the
best size-to-coupling ratio rather than attacking the biggest blocks:

- **`sharecanvas.js`** (337 lines) — the PNG share card. Pure drawing: takes a plain data object and a
  canvas, returns pixels. Needed exactly ONE app-level name (`currentLook`), which turned out to be the
  inverse of `isClassicLook` already exported by `icons.js`, so the module has zero app dependencies.
  The `*ShareCardData` collectors stay in app.js next to the state they read — what a card LOOKS like
  and what it SAYS are different jobs, and only the second needs to know how the game works.
- **`catbars.js`** (66 lines) — the category-balance bars and the weak-link label. Pure presentation,
  and kept together deliberately: the geometry and the label MUST agree, and they once didn't.

`app.js` 4,472 -> 4,070. Verified by loading the app (29 resources, zero failures, bars render, court
and spin present) and by drawing a real share card offscreen and checking it painted.

Two things worth remembering for the next pass:

- **`render` (884 lines, 73 app-level references) and GOAT (881 / 61) are the real monoliths**, and
  both are far more coupled than anything moved so far. They need state threading, not a cut-and-paste.
- **This repo is not under version control.** A refactor of this size was done against a manual copy in
  `.refactor-backup/`, which is not a substitute. `git init` before the next one.

