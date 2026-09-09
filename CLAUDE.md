# 38-0

A browser game: spin a EuroLeague club + era, draft a starting five from players who actually
played there, and a sim projects your regular-season record. Perfect season is 38-0.

**Read `docs/SPEC.md` before doing any design or implementation work.** It contains the locked
decisions, the open questions, and the phasing. Several obvious-looking "improvements" have
already been considered and rejected for reasons documented there.

## Layout

- `pipeline/` — Python. One-time offline job that fetches source data and bakes `data/players.json`.
  Run rarely. Cache aggressively.
- `web/` — the game. Static, client-side, no backend.
- `data/` — the baked JSON. Committed.
- `docs/SPEC.md` — the design.

## Working agreements

- **Don't answer the Open Questions in SPEC.md by guessing.** Flag them and ask.
- **Don't tune the win curve by intuition.** It gets calibrated against real rosters, empirically.
- Phase 2 features (arena, coach, sixth man) are specced but **out of scope** until the base
  5-man sim has been played and tuned. Don't build ahead.
- The pipeline and the game are separate concerns. Don't blur them.
- No club logos, crests, or player photos. Ever. Text names only.

## Conventions

- Club identity is the **EuroLeague API `team.code`** (stable), never the display name.
  (The v3 API reaches back to 2000 with true PIR, so the Basketball-Reference tier in SPEC.md
  was dropped — single source. See the build-plan deltas.)
- All player stats are era-adjusted (z-scored per season) before use, with reliability
  shrinkage `z * gp/(gp+K)` so short pre-2016 seasons don't inflate. Raw stats are never
  compared across seasons.
- Engine tuning params (reliabilityK, gate transform, win curve) live in `web/src/engine.js`
  `DEFAULT_PARAMS` — the single source of truth shared by the browser and `sim/` harness.
- `data/players.json` holds **only** what `pipeline/build_dataset.py` writes. `web/src/data.js`
  derives `posRaw`/`bigness`/`interior`/`pos5` and collapses `pos` at load time — never persist
  that mutated object back to the file, or a re-bake silently changes the data's shape.
  Run `node pipeline/check_data.mjs` to verify. Name/position corrections belong in the
  pipeline's `*_NAME_FIXES` maps or `data.js`'s `POS_FIX`, never hand-edited into the JSON.
- Player **archetypes** (`web/src/archetypes.js`) are season-specific and era-relative: shot diet is
  a PERCENTILE within the player's own season and position group, never an absolute bar. A fixed bar
  is what made the report tell a team holding Pleiss to sign a stretch big. Any change to the rules
  must keep `node sim/archetype_check.mjs` at 27/27 — it pins named seasons of undisputed prototypes
  (Tavares, Mirotić, Calathes, Shved...) so a rule tweak can't quietly re-label the league.
- The Team Report's `standing` is **fractional deviation** (`score/typical - 1`), which orders
  categories exactly like the bars in `app.js catBarGeom`. Don't reintroduce `score - typical`: it
  ranks differently 55% of the time and makes the write-up disagree with the picture above it.

## Checks

`npm run check` before any deploy — `pipeline/check_data.mjs` (data shape), `sim/archetype_check.mjs`
(27 pinned prototypes), then the `test/` suite. About four seconds, no dependencies, `node:test` only.

The suite guards the invariants that are easy to break by accident and slow to notice: engine
determinism and **draft-order independence**, the anti-cheat client/server round trip, the Team
Report's contradiction rules, the play-in shape, position-appropriate archetype capabilities, and
wide **difficulty bands** for Classic and Salary. The bands are tripwires, not pins — if one fails,
check whether difficulty genuinely moved before widening it.

`npm run balance` and `npm run report-audit` print the fuller diagnostics those bands come from.
