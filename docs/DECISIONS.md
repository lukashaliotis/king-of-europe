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
