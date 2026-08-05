# King of Europe — Design Decisions & Deferred Backlog

This is the running log of design decisions, the things we deliberately **shelved**, and — for
each shelved item — **enough spec to actually apply it later**. If you (the user) come back and say
"do the dual-type coaches" or "add the Efficient archetype," an assistant should be able to read the
relevant section here and implement it without re-deriving the design.

Status legend: **DEFERRED** (decided, not built) · **QUEUED** (agreed next steps) · **REJECTED**
(tried/considered, ruled out) · **APPLIED** (done — kept here for context).

---

## 1. Dual-type coaches — DEFERRED (current model is single-type)

**Decision:** keep coaches single-archetype **for now**. Revisit later; this is the leading future
direction for the coach layer.

**Why it's attractive:** real coaches are two things at once (it's why single-bucket tagging kept
being contentious — Jasikevičius, Trinchieri, etc.). Dual types are more realistic, resolve the
tagging debates, and read better on the card ("Defensive · Motion").

**How to apply (spec):**
- Each coach gets a **primary** archetype (full weight) and an **optional secondary** (partial).
- Blend the two delta vectors **65% primary / 35% secondary**, per category. This keeps the net
  power (~+4) the same as a single specialist — it just spreads the boost across two identities and
  lowers the peak, so a matched *pure* specialist still patches a given gate harder.
- **Net cap:** ensure a blended coach's summed positive delta never exceeds a single specialist's
  (~+4) — the 65/35 weighting already does this; add an explicit clamp if a combo drifts high.
- **Tradeoff-cancellation caveat:** pairing opposite penalties (e.g. Defensive −scoring + Up-tempo
  +scoring) can erase the downside → an all-upside coach. Either accept "well-rounded = slightly
  safer" (fine, since it never spikes as high) or renormalize the blend to preserve one net penalty.
- **Label:** `"<Primary> · <Secondary>"`.
- **Code touch-points:** `web/src/coaches.js` — `HAND_ARCHETYPES` becomes `code -> {primary,
  secondary?}` (or `[primary, secondary]`); `coachDeltas()` blends the two `ARCHETYPES[x].deltas`
  vectors 0.65/0.35 before the existing `× share × pedigree`; `coachLabel()`/`archetypeLabel()`
  render the "A · B" string. Everything downstream (gate, sim) is unchanged.

**Worked example — "Defensive · Motion" (0.65 Defensive + 0.35 Motion):**

| | Scoring | Rebounding | Playmaking | Defense | Efficiency | Net |
|--|--|--|--|--|--|--|
| Blend 65/35 | −1.0 | — | +1.4 | +2.3 | +1.3 | ~+4.0 |

Clear defense-first identity, rewards ball movement, still pays a scoring tax.

**Suggested dual tags if we adopt it** (primary · secondary, using the 6-style palette below):
Jasikevičius = Up-tempo · Motion · Trinchieri = Defensive · Physical · Messina = Efficient · Balanced.

---

## 2. Coach archetype palette revision — DEFERRED

Current palette (in `ARCHETYPES`, `web/src/coaches.js`): **Defensive, Up-tempo, Motion, Physical,
Balanced**. Deltas are at full roster share, then `× share × pedigree`.

**Shelved changes to apply when asked:**

1. **Add an "Efficient" archetype** (fills the one category with no spike). Proposed deltas:
   `efficiency +4.0, scoring +1.5, playmaking −1.5`. Real feel: Messina / Pešić (half-court maestro).
2. **Retire "Physical"** *(optional / linked to the coach reclassifications)* — only Saša Obradović
   used it and the data didn't back him as rebound-dominant. If retired, fold him into Defensive.
   NOTE: keeping Physical is also fine — it's the **Rebounding** spike, so retiring it leaves
   Rebounding with no dedicated patch. Decide together with the "one spike per category" principle.
3. **Rebalance "Balanced"** — currently `+1.2 to all five` (net **+6.0**, and the only archetype with
   **no downside** → a lazy no-risk default). Proposed: `+0.9 to all five` (net +4.5) so it matches
   the specialists' power budget and is a true "jack of all trades, master of none."
4. **Spike magnitude** — currently spike ≈ +4, secondary ≈ +1.5, tradeoff ≈ −1.5. Optionally make
   specialists **swingier** (bigger spike + bigger penalty) for a more situational feel.

**The "one spike per category + generalist" ideal** (clean 6): Defensive→Defense, Up-tempo→Scoring,
Motion→Playmaking, Physical→Rebounding, **Efficient→Efficiency** (new), Balanced→generalist.

**Optional flavor variants** (only if we want >1 style per category):
- **Havoc / Press:** Defense + Scoring(transition), −Efficiency (aggressive/gambling D vs grind).
- **Iso / Star-centric:** Scoring + Efficiency, −Playmaking (feed one star vs share-the-ball).
- **Inside / Post:** Rebounding + Scoring, −Playmaking (post-up bigs vs board-crashers).

**Naming options** discussed: Up-tempo≈Run-and-gun/Pace · Motion≈Ball-movement/Pass-first ·
Efficient≈System/Half-court maestro · Physical≈Bruiser/Glass-crashers · Defensive≈Lockdown/Grinder.

---

## 3. Pending single-coach reclassifications — QUEUED (not yet applied)

From the coach review. Data probe (team box-score aggregates) shown in brackets:
- **Ivković → Legendary** — **APPLIED** (`WAG` pedigree bumped to LEGEND in `coaches.js`).
- **Jasikevičius → Motion** — **APPLIED** (`ADG` retagged; data ast-rate +0.43, Barça/Žalgiris identity).
- **Trinchieri** — user floated Up-tempo; data says the opposite (tempo −0.75, reb −0.87 = grinding)
  → **kept Defensive** (APPLIED, comment annotated in `coaches.js`).
- **Pianigiani** — user floated Physical; data kills it (reb −0.49) → **kept Up-tempo** (APPLIED).
- **Physical tier populated** — **APPLIED**: Ivanović (`WAW`) + Pešić (`WCT`) moved Defensive→Physical,
  joining Saša Obradović → 3 Physical coaches (Defensive still 9). Retiring Physical is now off the
  table — with rebounding the gate ~22%, a rebounding-patch coach is wanted.

---

## 4. Legends coach & arena — DEFERRED (coach) / REJECTED (arena)

Context: when a five includes Legend(s) (the gold "European Legends" pool).
- **Legendary arena — REJECTED.** A no-name "legendary arena" is hollow; cut for good.
- **Legendary coach — DEFERRED (leaning no).** User's concern: bolting a bonus onto a Legend pick
  cheapens the "singular wow" of drafting a Legend. If ever built, spec: a curated legend-era coach
  (**Aleksandar Nikolić**, NOT Obradović who's in the regular pool), eligible when the five contains
  Legend(s), effect **share-scaled by Legend count / 5**, and a **high-variance archetype (big spike
  up + a real drawback elsewhere, e.g. Defense +6 / Scoring −3)** so he's never an auto-pick. Also
  measure in the diagnostic (§5) that he doesn't distort. Structural note: a Legend contributes a
  "LEG" club with no real coach/arena, so Legend-heavy fives naturally get fewer coach options + a
  neutral arena — an accepted thematic gap, not a balance bug.

---

## 5. Model diagnostic (category balance) — QUEUED (read-only)

Answers "are the 5 player categories balanced / is Playmaking overrated?" empirically. For thousands
of drafts, report per category: (a) **how often it is the gate** (never the gate → too easy →
overweighted), (b) **marginal wins from +1 std**. The engine is shared across all four modes, so
this is one test. No changes until the numbers say so. (Build under `sim/`.)

---

## 6. Legends real stats — RESEARCHED → keep estimates

Researched (2026). Finding: **only scoring is reliably documented** for these players' European
primes; rebounds/assists/steals/blocks/TS% were not recorded per-game in 1980s–90s European leagues.
The verified scoring *matches our estimates* (Petrović ~28–34 Euro / est 28; Galis 30+ / est 30;
Kukoč ~19–20 / est 20; Sabonis prime ~22 / est 22). So **no verified full line exists to swap in —
estimates retained** and confirmed sound. Only revisit if a structured historical source surfaces.
Optional cosmetic nudge available: Petrović scoring 28→~30 (his European-competition prime was 33.8
at Cibona / 28.3 at Real) — deferred as it risks making one legend an outlier.

---

## 7. Team-completeness check + mystery club — DONE

- Audited distinct spinnable clubs per season: **24 (2002–15) → 16 (2016–18) → 18 (2019–24) → 20
  (2025)**, matching EuroLeague's real field-size history exactly. **No teams dropped by the
  pipeline.** (2001 = 31, the inaugural big field.)
- **`MCT`** had **0 player rows** → dead entry, **removed** from `web/src/clubs.js`. (`GSS` was the
  other unnamed one — identified as **Zastal/Stelmet Zielona Góra**, Hala CRS.)

---

## 8. Player categories — the deeper questions (Tier 3, needs a pipeline re-bake) — DEFERRED

Current 5: Scoring=pts, Rebounding=reb, Playmaking=ast−TO, **Defense=steals+blocks**, Efficiency=TS%.
- **Defense is "havoc," not team defense.** Steals+blocks measures individual disruption; real
  defense (forcing bad shots, rim protection, positioning) lives in **opponents' points allowed**,
  which the dataset does NOT contain. Least-honest category. Fixing it needs the pipeline to fetch
  team/opponent defensive stats.
- **No spacing / 3-point category.** A floor-spacer and a rim-runner both read as "scoring/
  efficiency." Adding Spacing needs a re-bake (3PA/3P%).
- Possible Tier-3 shape: split Defense into rim vs perimeter, add Spacing → 6–7 categories. Big job.

---

## 9. Arena rating scale — DECIDED (review in 0–3, store in 1–10)

Ratings are **reviewed/edited in a "home edge" 0–3 scale** (0 = neutral/no effect, 3 = max ~+4.5%),
but **stored internally as 1–10** (`NEUTRAL 6.5, SPREAD 3.5, MAX_SWING 0.045`) — so the review is
intuitive and the win-impact math is untouched. Conversion: `edge = (rating − 6.5) × 6/7`;
`swing% = edge × 1.5`. If ever we want the *file itself* in 0–3, rescale `NEUTRAL→0, SPREAD→3` and
convert `arenaFlames`/`arenaSVG` thresholds accordingly (impact stays identical). — DEFERRED.

---

## 10. Deploy / ops backlog — DEFERRED

- **Direct deploy is the current flow:** the assistant is logged in to Cloudflare on the user's Mac
  and publishes with `npx wrangler pages deploy . --project-name king-of-europe --branch main
  --commit-dirty=true`. Live at **https://king-of-europe.pages.dev** (Pages + Functions + D1).
- **Git auto-deploy — DEFERRED.** Connect the Pages project to the GitHub repo so pushes auto-build
  (mainly useful once the *user* edits directly). CLI `git push` isn't authed on this machine — the
  user pushes via **GitHub Desktop → "Push origin"** (there are usually a couple of unpushed backup
  commits waiting).
- **Analytics — DEFERRED.** Enable Cloudflare Web Analytics (no cookies) on the Pages project to see
  real usage before deciding what to build next.

---

## 11. Postseason overhaul — APPLIED (backend) / bracket-view + share-card QUEUED (frontend)

The bracket used to ignore the season you played: a 20–23 bubble team reached the Final Four **62%**
of the time and won the title **11%** (measured, `sim/bracket_diag.mjs`). Three backend fixes, all in
`web/src/postseason.js` unless noted, all validated and mode-agnostic (regular-season 38-0 difficulty
and the wins-only leaderboard are untouched):

- **Seeding handicap — APPLIED.** Effective bracket strength `S = baseS + SEED_COEF·(wins − SEED_PIVOT)`
  (`SEED_COEF 0.62`, `SEED_PIVOT 26`). Great record = high seed/home court/favourite; bubble = underdog.
- **Deep-round escalation — APPLIED.** Semi opponent `+1.2`, Final opponent `+2.6`, so even a juggernaut
  faces a real gauntlet (title stays earned, not automatic).
- **Opponent realism — APPLIED.** `opponentTable` now ranks by a **depth-adjusted** score (best five +
  `DEPTH_WEIGHT 0.15` × strength of the 6th-man-onward) so one-star minnows sink; `pickOpponent` draws
  **weighted toward the strong end of each band** (`rng()*rng()`); bands tightened (playoffs 18→12%,
  semi 6→5%, final 2→1.5%, play-in 35–65→28–55%). GAME strength is still the five that takes the floor;
  depth only affects who you're matched against. NOTE: the data has **no real standings** — "realism" is
  a paper-strength+depth proxy, not actual W-L.
- **Resulting curve** (4000 drafts): reach FF 32-38 **99%** / 28-31 **86%** / 24-27 **58%** / 20-23 **16%**;
  win title **60% / 16% / 6% / 0.2%**; overall title **4.5%** (was 8.1%).

**Daily winnability floor — APPLIED** (`web/src/daily.js`). Everyone shares the board, so a weak draw =
a day nobody can go deep (measured: **74%** of natural boards had an optimal five below Final-capable).
`buildDailyBoard(..., seasons)` now computes the board's **optimal legal five** (`optimalFiveStrength`,
a 6×perm search over best-by-position, top-4 re-scored through the real engine) and **deterministically
re-seeds** (golden-ratio stride, ≤40 attempts) until it clears `FLOOR_WINS = 31` (Final-capable). Gated
behind the `seasons` arg so **Versus is unchanged**; client (`app.js`) and server (`resolve.js`) pass
`data.seasons` and land on the identical board (anti-cheat intact). Validated: floored optimum median 34
wins (p10 31); ~70 distinct clubs still appear across 180 days (variety preserved). User decisions:
floor = Final-capable; daily bracket randomness stays **per-five** (consistent with other modes).

**Real bracket view + toggle — APPLIED** (`web/src/app.js`, `web/src/style.css`). A seeded bracket
ladder: an entry node (`seedFor(wins)` → 1st–6th straight in, 7th–10th play-in) then each tie as a
two-sided matchup with both scores, winner highlighted green, losing tie edged red, connected by a
spine. A `Bracket / Summary` toggle (`state.resultView`, default `bracket`) switches to the original
lighter round-list (`renderRounds`), which is KEPT. Verified rendering in the preview.

**Court-card share (PNG) — APPLIED** (`app.js`: `buildShareCanvas`/`drawCourt`/`shareCardData`/
`saveShareCard`). A 1080×1350 canvas card: header, big record + stage (gold trophy for champions),
a stylized half-court with the five as club-coloured discs (monogram + surname + club abbr/season,
text only — no logos), the coach line (name · style), and the site link. `saveShareCard` uses the
native share sheet where available (`navigator.canShare({files})`, mobile) and falls back to a PNG
download. Buttons: Classic/Salary "📸 Save as image"; Daily keeps its spoiler-free text share and
adds an opt-in "📸 Share full card (image)". Verified the render in preview. Follow-up (user): removed
the bottom half-court arc, and added the home venue BOTH ways — a soft home-club colour wash + faint
centre-court abbr on the floor, plus a "🏟 Arena" line above the coach.

## 12. Playtest batch — APPLIED

From a live playtest:
- **Difficulty softened ("Balanced" profile, `sim/softtune.mjs`).** Measured a brutal skill cliff: a
  casual "chase points" five had a **median of 7 wins and went 0-38 ~4%** of the time. Two new engine
  levers + a gentler curve: `gateFloor 0.35` (a blind spot caps you but no longer zeroes an otherwise
  strong roster — the 0-38 cause), `winFloor 0.05` (even a poor five steals a few), `leagueS 18→16`,
  `gameSteep 0.23→0.22`. Result: casual median ~12 (0-38 → 0.7%), skilled median ~29, 38-0 ~3.2%.
  FF curve re-checked (`bracket_diag`): 20-23 reach FF 6%, juggernaut title 47%, overall title 6.0% —
  still good, no seed re-tune needed. The gate floor deliberately trades a little "weak-link matters"
  for not punishing a single blind spot with a winless season.
- **Category bars rebuilt** (`app.js catBarsHTML`, `style.css`) — iterated with the user to this final
  form: bars show the RUNNING TOTAL so they **build gradually** as you draft (empty → full over the
  five picks, the behaviour the user liked in the original), single on-brand ORANGE fill, weakest link
  by highlighted LABEL only. The fix for the old skew (playmaking, typical ~2.2, always looked half as
  full as rebounding, typical ~4.6): each category is divided by ITS OWN typical (`CAT_TYPICAL`, now
  exported; `CAT_SPAN 2.0`) rather than one global number, so a typical playmaking fills the same as a
  typical rebounding. Rejected along the way: a red→amber→green heat scale ("doesn't sit well"), and a
  `×5/n` full-five projection (flung every bar to the extremes on the first pick — killed the build).
- **Coach labels** (`coaches.js`): derived-tilt labels now use the archetype vocabulary — scoring→
  "Up-tempo", rebounding→"Physical" (no more off-palette "Scoring"/"Rebounding" tags). The efficiency
  style was later renamed **"Efficient" → "System"** (user's pick — a disciplined, half-court,
  high-percentage coach; fits the style-noun register of the others). If the planned efficiency
  ARCHETYPE (§2.1) is ever added, label it **System**.
- **Arena badges** (`app.js`): the club's 3-letter colour badge now shows beside each building in the
  arena candidate list AND the spin reel.
- **TS% display clamped** to ≤100% (`app.js boxLine`): Aleksandar Mitrovic (PAR 2009-10, 7 gp @ 2.9 mpg)
  showed 129% TS — a tiny-sample artifact, the only such player; he was already unqualified and
  contributes ~nothing to the sim. Display-only clamp.
- **Non-issue:** "Elan Chalonnais 2012-13 Jean-Baptiste-Adolphe" — real player (Michel
  Jean-Baptiste-Adolphe, the hyphenated part is the surname). No change.

## 13. Result-screen + share polish — APPLIED

- **Share image → clipboard-first** (`app.js copyShareCard`). Button is now "📋 Copy image" (Daily:
  "📋 Copy full card"); primary action copies the PNG to the clipboard via `ClipboardItem`, falling
  back to the native share sheet then a download. A `sharingCard` guard stops the double-fire that
  produced two copies/downloads.
- **Sequential reveal** (`startReveal`, `renderBracket`, `renderRounds`). Reveal order is now
  record → seeding → each round in turn → verdict (revealStage: 0 record, 1 seeding, 2+ rounds; total
  = rounds+1). The summary view gained a matching "Seed" line.
- **Bracket fits one screen** (`renderControl` hides `#control-bar` once revealed — the dead spin bar
  was eating ~46px above the record; plus compacted result-card/bracket CSS). Common (3-tie) champions
  now fit without scrolling; the rare 4-tie play-in champion still needs a taller screen.
- **Coach count** (`coaches.js`, `app.js`, `resolve.js`): capital "Coached", and now over ALL SIX
  (starters + sixth man) — callers pass six and `coachDeltas` share is `count/6`. Difficulty re-checked
  (skilled median 29, 38-0 3.5% — unchanged; the greedy now also picks a sixth that helps the coach).
- **In-app court** (`index.html`): removed the bottom half-court arc — its ends read as two odd
  diagonal lines in the bottom corners (same arc already dropped from the PNG card).

## 14. Versus challenge code — shortened + box fit — APPLIED

The old code was a ~200-char base64 JSON blob (`KOE-V1-…`) that overflowed its box. Rewritten
(`web/src/versus.js`, prefix `KOE2-`): since both players share the same seeded six-draw board, picks
are stored BY REFERENCE to the board — just the player CODE per draw (season/club implied), plus the
base36 seed, the bench draw index, the arena draw index, and the coach's short code. No base64 (all
ASCII, readable). ~65 chars, e.g. `KOE2-msak5.ATP,003469,002100,001413,008811,LEG_SABONIS.5.0.001869`.
`reconstructTeam(env, data, board)` now takes the shared board (built from the seed before reconstruct
in `versusAccept`) and looks each code up in its draw; coach matched by CODE; arena from the host
draw. Round-trip verified 40/40 seeds incl. legend boards. Box fit: `.share-pre` got
`overflow-wrap: anywhere` so any code wraps instead of overflowing. Old `KOE-V1-` codes no longer
decode (ephemeral, acceptable).

## Rejected approaches (don't re-litigate without new data)

- **Auto-deriving coach archetypes from box scores — REJECTED (twice).** Player box scores track the
  **roster, not the coach**, and contain **no team-defense signal** (opponent points). Probe result:
  the data even reads **Ataman as low-tempo** (−0.70), which nobody believes. Hand-rating (for the
  ~42 that matter) + targeted web research is the accurate route; the data is at best a noisy
  tiebreaker.

---

## Applied so far (context)
- **Arenas:** expanded to **83 clubs** (51 added) so no spinnable club shows "Neutral venue";
  atmosphere-tuned ratings (research-backed: Zvezda ↑, Beşiktaş/SAP Garden ↑, Monaco/Zenit ↓, London
  kept as a −0.4 "meme"). `web/src/arenas.js`.
- **Onboarding:** trimmed 5 → 4 slides; intro now mentions the EuroLeague trophy.
- **Coach:** Ivković → Legendary (rest of the coach batch still open — see §3).
- **Team data:** dead `MCT` removed; **KK Zadar** added (MIN_ROSTER 6→5 in `data.js`, since you pick
  one player per spin; blue/white in `clubs.js`).
- **Spin variety:** weighting flattened **linear → √(top-5 strength)** (`data.js`) — elite clubs' spin
  share roughly halved, ~70 more club-years in regular rotation.
- **Difficulty re-tune:** because the flatter spin serves weaker club-years, the win curve was
  recalibrated `leagueS 18→16.5, gameSteep 0.26→0.23` (`engine.js`) to hold median 25 / 38-0 ~2% /
  p90 35 — **same difficulty, more variety.** (sim/retune2.mjs grid updated to the new locked pair.)

- **Relative gate + 6th-man buff (DONE):** gate now judges each category vs its typical level
  (`CAT_TYPICAL`/`GATE_SHIFT` in `engine.js`) → weakest link spread **reb 22% / playmaking 29% /
  defense 21% / efficiency 20% / scoring 8%** (was 83% on playmaking+efficiency). 6th man buffed
  `BENCH_MINUTES 0.55→0.80` (~+1.3→+1.8 wins). Re-tuned **leagueS 18, gameSteep 0.26→0.23** to hold
  median 25 / 38-0 1.8% / p90 35 — same difficulty. `sim/category_diag.mjs`, `sim/retune2.mjs`.
- **Share button (DONE):** every mode's result screen now has a copy-able share (Classic/Salary got
  a generic one; Daily/Versus already had theirs); all shares now include the site link.

## Still to do next
- **Career-modal positions — APPLIED.** Each player is now collapsed to ONE position for the whole
  game: the one he played most (gp-weighted, ties → most-recent season), via `applyCareerPositions()`
  in `data.js`, called inside `buildClubSeasons` so app + sim + server re-sim all agree. 279/5669 rows
  changed; population dist barely moves (F 2202→2222, G 2311→2291, C unchanged). Hunter → C
  everywhere; OLY 2015 gains a 2nd center, DYN 2006 a 2nd forward. Difficulty held (38-0 1.67%,
  median 24, p90 35). Feeds position-relative z-scoring, so career centers are judged vs centers.
- **Coach batch — APPLIED** (see §3). Physical tier populated (Ivanović + Pešić), Jasikevičius→Motion,
  Trinchieri/Pianigiani kept per data. **Dual-type still DEFERRED** (§1) per user ("keep it as it is").
- **Scoring still binds least (8%):** greedy always grabs a scorer, so scoring rarely dips. Optional
  deeper lever if we want "find a big scorer" to matter more: variance-normalize the gate (scale each
  category by its spread, not just centre its mean).
- **Championship rate:** measure the true title rate (with coach+arena+6th); if >~10%, toughen the
  Final Four / Final opponents rather than the regular season.

## 15. Dynasty (new mode — in build)

A roguelike **gauntlet**: build a squad, then survive an endless run of single games against ever-
stronger clubs, **looting one player from every team you beat**. Your **win streak is the score**.
The snowball (recruit as you win) is the hook; a great run should read as "Lukas went on a 13-win
streak," not "34-4." Locked design (user, this session):

- **Start — uniform-spin draft, no coach.** Same draft UI as Classic, but the spin is **UNWEIGHTED**
  (ignore `pool.weight`) so you start with a *modest, representative* squad and *earn* your dynasty by
  looting — rather than being nudged toward strong clubs (the √top-5 bias other modes use, `data.js:80`).
  Squad = **6 players: 5 legal starters (2G/2F/1C) + 1 sixth man.** No coach layer in v1 (keeps every
  recruit decision clean; arena/home stays). Then spin your **home arena** as in Classic.
- **Gauntlet, one game per opponent.** Each round *r*: spin an opponent club-year whose best legal five
  clears a **rising strength floor F(r)**; roll **home/away** (home → your arena edge, away → their
  arena edge, ~±4.5% on win prob); play **one seeded game** at `p = gameProbability(myS, oppS)` ± the
  home edge. Win → streak++ and recruit; **first loss ends the run.** Single game (not a series) keeps
  the streak count clean and every round genuinely tense — an 88% favourite still loses sometimes,
  which *is* the roguelike.
- **Forced recruit-and-replace** (the heart). Beat a team → you **must** take exactly one of their
  players **and cut one of yours** (1 in, 1 out, squad stays 6). Your **starting five must stay legal
  (2G/2F/1C)**; the sixth man is any position. Poaching their centre often forces you to drop *your*
  centre, or take a guard you don't need and bench a star to stay legal — that **positional squeeze**
  is the difficulty, and it sharpens as opponents strengthen.
- **Split-court visual (phase 2):** your five on one half, the opponent's on the other; after the
  home/away spin the **whole court tints to the home team's colour** (as now), and the **simulated
  final score animates in above the court.**
- **Difficulty target:** endless, single-elimination; a **great run (p90) ~10-15, tuned a touch
  harder.** The opponent ramp F(r) + home edge are calibrated **empirically** against real rosters in
  `sim/dynasty_calib.mjs` (model: uniform draft, greedy recruit-and-cut, single game vs a rising floor),
  never by eye — same rule as the win curve.
  - **Key finding:** opponents are capped at real-roster strength (best-five S: p50≈4.9, p90≈11.4,
    max≈21.9) but a looted squad grows past 30, so real rosters ALONE can't end a great run — a
    perfect-play run went to the 60-round cap. Fix = a **per-round ESCALATION** handicap on the
    opponent's effective strength (`oppEff = oppBestFiveS + esc·(r−1)`), exactly like the postseason
    seed handicap, so even a superteam eventually falls.
  - **Locked (initial):** draw floor `F0=3, slope=1.0`, cap `Fmax≈13.4` (opp p95), home/away
    `±4.5%` (real arena mult), **`esc=1.1`** → EXPERT median 4, p75 8, **p90 12, p95 15**, max ~23;
    CASUAL median 2, p90 6. Chosen over the harder `esc=1.3` (p95 13) so the **exceptional run reaches
    ~15** and the leaderboard spreads out (user). Re-verify in the phase-3 pass once the loop is played
    (the model assumes perfect greedy recruit + a flat ±4% edge; real numbers may shift).
- **Two leaderboards (phase 4):** a **Weekly** shared-seed gauntlet (everyone faces the identical
  opponents + home/away — most viral, friends compare the exact run) and an **All-time best streak.**
  Both **server-verified** by re-simming the run (extend the resolve.js / Pages Functions / D1
  anti-cheat already built for Daily).
- **Build order:** (1) core local loop, (2) split-court + animated score, (3) calibration pass feeds
  (1)'s numbers, (4) the two leaderboards.
- **Split court DONE (2026-08-05c):** the matchup + game now render a full vertical court in the main
  panel — opponent's five on the top half (basket at top), yours on the bottom (basket at bottom),
  the whole floor tinted the HOME club's colour (you at home, them away) with its abbr watermark. The
  simulated score sits ABOVE the court during the game. `DYN_YOU`/`DYN_OPP` mirror the half-court
  SLOTS into each end; `dynastyCourtHTML()` + `DYN_COURT_SVG` (reuses `.c-floor`/`.c-line`). Sidebar
  still shows your five + arena + category bars as the persistent squad reference. Remaining Dynasty
  work: (4) the two leaderboards; (3) recalibrate for 5v5 after real play.
- **Revision (user, 2026-08-05b):** (1) **5v5, not 6v6** — dropped the 6th man in Dynasty so opponents
  and you both field five, and every recruit is a like-for-like positional swap (take their centre →
  drop yours) with no bench to park a dud. (2) Opponent + **home/away are now spin animations** (reel
  reveal), not instant. (3) **Win % removed** from the matchup (a coin-flip number cheapened it). (4)
  **Score reveals quarter by quarter** like a live sim (scoreline carries per-quarter splits). (5)
  "Loot the vanquished" → **"Pick 1 player"**. (6) Recruit is now **two screens** — pick the incoming
  player (full box stats shown), then a second screen to choose who to release (incoming stats + your
  same-position players' stats side by side, off-position greyed) — so it's not blind. (7) Run-over
  screen drops the flavour line for a **Classic-style weakest-area readout** (category bars + "Not
  enough X"). Squad model: `dynasty.js` now `orderFive`/`canSwap` on a 5-array (position-locked swaps);
  `complete()`/`hasRoomFor`/`renderSixth` gate out the 6th man in Dynasty.
- **Also this session:** placed players are now **locked** — the send-away × on the court was removed
  entirely (dead `removePick`/`restoreOfferFrom`/`poolForPlaced` chain deleted). "Play again" moved
  above the copy buttons so it's visible without scrolling.
