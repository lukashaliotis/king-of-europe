# 38-0 — EuroLeague Perfect Season

## What this is

A browser game. The player spins for a EuroLeague club + era, drafts a starting five from
players who actually played for that club in that era, and a simulation projects their
regular-season record. A perfect season is 38-0 (the EuroLeague expanded to 20 teams and a
38-round regular season in 2025-26).

Modelled on the NBA game "82-0". Same shape, different league, different maths.

**The point of the game is to be argued about.** Every design decision below serves that.
A result nobody wants to screenshot is a failed result.

---

## Locked decisions

These are settled. Do not re-litigate or "improve" them without asking.

### Scope
- **Seasons: 2001-02 through 2025-26.** 25 seasons.
- **2000-01 is deliberately excluded.** That season the sport split into FIBA SuproLeague and
  the ULEB Euroleague, running as two parallel competitions with a groups format. It is the
  ugliest edge case in EuroLeague history and costs almost nothing to skip.
- Modern era only. Pre-2001 legends (Galis, Petrović, Sabonis, Kukoč) are **out of scope** —
  see Deferred.

### Legal / IP
- Player names and statistics are facts. Fine to use.
- **No club crests, no logos, no player photographs.** Text names and original badges only.
- Carry a "not affiliated with EuroLeague Basketball" line.

### Simulation
- **Deterministic, not stochastic.** The same five players must always produce the same record.
  Rolling 38 coin flips would mean two players with identical rosters get different results,
  which destroys shareability and any future leaderboard.
- **Era-adjusted.** Raw stats are not comparable across 25 seasons of pace and scoring change.
  Z-score each player against their own season's distribution.
- **Category-gated.** Team strength is capped by the *weakest* category, not the average.
  This is the single most important mechanic in the engine — it is what forces trade-offs and
  makes the result arguable. A team of five scorers with no rebounding must be hard-capped.
- **Non-linear win curve.** The last three wins must cost more strength than the first twenty.

### The 38 vs 82 calibration (do not skip this)
A 99% per-game win rate sweeps 82 games only ~44% of the time (`0.99^82`).
The same 99% sweeps **38** games ~68% of the time (`0.99^38`).

**A shorter season makes perfection substantially easier at identical strength.** Copying
82-0's calibration onto 38 games makes 38-0 cheap and destroys its prestige. To keep
perfection comparably rare, the top-end per-game win probability needs to sit nearer **97.9%**
(`0.44^(1/38)`). Tune the curve *harder* than the NBA version, not softer. This is
counterintuitive and easy to get backwards.

### Stack
- Static, client-side, no backend for v1. One baked JSON data file.
- Deploys free (Vercel / Netlify).
- A backend is only needed for a global leaderboard — deferred.

---

## Open questions — do NOT invent answers to these

1. **Does the EuroLeague API reach back before 2007-08?**
   This decides the entire data pipeline and is unresolved. The Kaggle datasets stop at
   2007-08 because that is where the *box score* endpoints begin — but PIR became an official
   EuroLeague stat from 2000-01, so the *stats leaders* endpoint may reach further back.

   **This is step one of the project.** Test `euroleague_api`'s player-stats endpoint with
   `season=2000`. Five minutes of work that determines whether the pipeline is one clean source
   or two stitched together. Report the result before writing anything else.

2. **Curve parameters.** Gamma, logistic midpoint and steepness must be tuned empirically
   against real rosters. Do not guess them and declare victory. Typical rolls should land
   24-30 wins; 38-0 should be rare.

3. **Club pool for the spin.** Needs a curated list of storied clubs, not "all current 20".
   EuroLeague licences rotate; there are no permanent franchises. Candidates: Panathinaikos,
   Olympiacos, Real Madrid, Barcelona, CSKA, Maccabi, Fenerbahçe, Efes, Partizan, Crvena
   Zvezda, Žalgiris, Virtus Bologna, Baskonia, Siena, ASVEL. Not yet final.

4. **Era bucket boundaries.** Probably ~5-year windows, unconfirmed.

---

## Data pipeline

A one-time offline job producing a single baked JSON. **Not** a live pipeline.

### Sources (pending the API test above)

**Tier 1 — Official EuroLeague API**, `live.euroleague.net/api/`. Undocumented but open.
Python wrapper: `pip install euroleague-api`. Confirmed coverage 2007-08 → present. Rich
(box scores, play-by-play, native PIR). A ready-made Kaggle dataset built off it also exists.

**Tier 2 — Basketball-Reference**, covers 2000-01 → present, i.e. the pre-2007 gap.
- `/international/euroleague/{year}_totals.html` → per-player season totals (the core table)
- `/international/euroleague/{year}.html` → standings, team totals
- `/international/teams/{club}/{year}.html` → per-season roster

~25 pages for the whole scope.

### Known gotchas

- **BR hides tables inside HTML comments.** A naive `pandas.read_html` returns nothing. Strip
  the comment markers before parsing. This costs hours if you don't know it.
- **Club display names are sponsor-polluted and change nearly every year.** The 2007-08
  standings alone contain "AXA FC Barcelona", "Montepaschi Siena", "TAU Cerámica",
  "Lottomatica Roma", "Armani Jeans Milano", "La Fortezza Bologna". **The BR URL slug is
  canonical and stable** — TAU Cerámica lives at `/teams/vitoria/`, La Fortezza Bologna at
  `/teams/virtus-bologna/`. Use the slug as the club ID. Never the display name.
- **Rate-limit politely.** Sports Reference's terms restrict automated collection; they sell
  data licensing. This is a one-time personal-project fetch of ~25 pages, but be considerate
  and cache aggressively so it only ever runs once.

### The PIR problem

The real formula is:

```
PIR = (PTS + REB + AST + STL + BLK + FoulsDrawn)
    - (MissedFG + MissedFT + TO + ShotsRejected + FoulsCommitted)
```

**Fouls drawn** and **shots rejected** are EuroLeague-native stats. Basketball-Reference's
international pages are built on the NBA stat model and almost certainly carry neither.
So BR yields NBA-style efficiency, *not* true PIR.

**Decision: use a PIR-approximation consistently across all 25 seasons** (drop the FD and SR
terms everywhere), rather than mixing true PIR post-2007 with an approximation pre-2007.
Slightly "wrong" versus official numbers, but internally consistent — and consistency is what
matters for a game built entirely on cross-era comparison. Nobody will audit a single player's
number; everybody will notice if 2004 players are systematically underrated.

*If the API test in Open Questions #1 passes, this decision is void and we use true PIR
throughout from one source.*

---

## Sim engine

### Explicitly rejected

**A PIR threshold.** If the rule is `sum(PIR) > X`, the optimal strategy is "pick the five
highest-PIR players", which is a lookup, not a decision. No trade-off, no argument, solved in
an afternoon. Nobody screenshots a lookup. This was considered and killed.

### Architecture

```
For each player, per category (scoring / rebounding / playmaking / defense / efficiency):
    z = (player_stat - season_mean) / season_std       # era adjustment

C_k       = team score in category k (sum of z across the five)
gate      = min(C_k) over all categories                # the weakest link
S         = total_strength × (gate ^ gamma)
wins      = 38 × logistic(S)                            # non-linear, harsh at the top
```

The `min()` is the heart of it. Everything else is tuning.

---

## Phase 2 — designed, deliberately not built yet

Three additions are specced but **must not be built until the base 5-man sim has been played
~50 times**. Each is a knob multiplying into the same output; four interacting systems cannot
be calibrated simultaneously, and the curve has to be *felt* before it can be tuned.

Each wrinkle is assigned a **distinct layer** so nothing compounds chaotically:

| Wrinkle    | Touches                          | Rationale                          |
|------------|----------------------------------|------------------------------------|
| 5 starters | Strength                         | The bulk of the score              |
| 6th man    | Strength, usage-discounted       | Same currency, different rate      |
| Coach      | Category scores (the gate)       | Patches the weakest link           |
| Arena      | Win curve output only, ±3–5%     | Decides the summit, nothing else   |

### Arena
The strongest differentiator — 82-0 structurally cannot do this, because NBA building identity
is weak while EuroLeague *is* its buildings.

- **Must not add to strength.** A flat additive is a free bonus with no decision. It multiplies
  the *win curve output* only, ±3–5%. Because the top of the curve is a cliff, a 3% swing near
  perfection is decisive while being irrelevant mid-table. The roster gets you to 36-2; OAKA
  gets you to 38-0.
- **Capacity ≠ atmosphere, and capacity is the trap** because it's the one objective number
  available. Pionir (~8k) is more feared than Belgrade Arena (~20k). Hand-rate these.
- **No per-season ratings.** Atmosphere doesn't change year to year. What changes is clubs
  moving buildings (Valencia's Roig Arena, Efes, Monaco, Dubai). Model as
  `(club, building, year_range)`.
- Consider folding arena into the club spin rather than a separate spin — spin
  Panathinaikos-2011, you *get* OAKA. Truer to life and keeps the pick count down.

### Coach
- **Flat rating rejected** — same dead mechanic as arena-as-bonus.
- **Coach modifies category scores, i.e. patches the gate.** Since `min()` caps the ceiling, a
  defensive coach raising the defensive floor is enormous if defence is your hole and worthless
  if it isn't. That makes coach a *situational* pick, not a "best available" one.
  Obradović / Ivković / Itoudis → defensive floor. Ataman / Jasikevičius → tempo and scoring up,
  efficiency down. Messina → balance.
- **Data shape: tenure ranges, not season rows.** `(coach, club, from_year, to_year)`.
  ~40 notable coaches × a few stints ≈ 100 hand-entered rows off Wikipedia. Then **join to
  player-seasons on (club, season)** and "played under this coach" derives itself. Never
  hand-tag player-coach pairs.
- **Every modifier must be visible on the result card.** "Obradović coached 3 of your 5" is a
  brag people screenshot. Hidden synergy is unarguable, and 82-0 works because you can look at
  five names and argue.

### Sixth man
- **MPG is a bad usage proxy** — it measures playing time, not usage. A 30-minute defensive
  specialist is *low* usage; an 18-minute bench gunner is *high* usage. Using MPG gets it
  backwards on exactly the players the mechanic exists for.
- **USG% is derivable** from BR (per-player FGA, FTA, TOV, MP + team totals):
  ```
  USG% = 100 × ((FGA + 0.44×FTA + TOV) × (TmMP/5))
              / (MP × (TmFGA + 0.44×TmFTA + TmTOV))
  ```
  Or use **FGA per minute** — captures "needs the ball" nearly as well, one division, no team
  totals required. Sufficient for a game.
- **Bench value = f(usage).** High usage → ~60-70% of value. Low usage → ~90-95%.
  Self-balancing, zero hand-tagging.
- Frame as a *discount*, not a penalty — punishing a good roll feels bad. Lean into the
  inversion it creates: a low-usage, high-motor role player is genuinely better in the 6th slot
  than a star. That "wait, seriously?" moment is what gets shared.

### Also deferred
- Global leaderboard (needs a backend — Supabase or similar).
- Community-voted arena ratings. Turns the subjectivity problem into the engagement engine;
  potentially the most viral mechanic available. Needs a backend.
- A hand-curated pre-2001 "Hall of Fame" tier (~20-30 icons, estimated stats).

---

## Non-goals

- Club logos, crests, player photographs.
- Live / in-season data. The dataset is baked once.
- Native mobile app.
- Pre-2001 seasons in v1.
- Any attempt to be a serious analytics tool. This is a bar argument with a scoreboard.

---

## Build order

1. Test whether the API reaches season 2000. Report back before proceeding.
2. Build the data pipeline; bake the JSON. Confirm the schema before writing the game.
3. Build the sim engine. Play it ~50 times. Tune the curve until 38-0 feels earned.
4. Build the UI last. It is the least interesting part and the most tempting to start with.
5. Only then revisit Phase 2, in order: arena → coach → sixth man.
