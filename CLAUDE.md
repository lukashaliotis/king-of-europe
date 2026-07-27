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
