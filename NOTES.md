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

## Floor spacing in the engine (2026-09-09)

The Team Report had learned to name a crowded paint, but the sim did not care — and the omission had
a DIRECTION. Interior players post the rebounds and blocks the engine rewards, so stacking bigs was a
mild optimum: measured over realistic drafts, team spacing correlated -0.14 with S and -0.11 with
wins, and the worst-spaced tenth of teams won MORE than the best-spaced tenth (median 5 against 4,
2.5 bigs against 1.7). The model and the write-up disagreed and the model was the wrong one.

`data.js deriveSpacing` now attaches a per-player floor-spacing z — share of his own shots taken from
outside, judged against same-season same-position peers, gp-shrunk and clamped to ±3. Era-relative
because the league's shot diet has moved further in 25 years than anything else in this data.

The engine damps `SPACING_CATEGORIES` (scoring, efficiency) when the five's average spacing sits
below `spacingSlack`. Same shape and same reasoning as the usage collision: each player's own
shooting is already in his numbers, but nothing expressed that five non-shooters make EACH OTHER
worse. Upside only, and deliberately NOT rebounding or defense — a lineup of bigs really does board.

Tuned against a drafter that optimises UNDER the term, which is the only measurement that means
anything: the point is to change what a good player BUILDS, not to tax what he built before. At
0.10 / 0.9 the optimiser's average five goes from -0.28 spacing to -0.15 and 2.27 bigs to 2.16.
Classic skilled: median 30 -> 29, 38-0 2.2% -> 1.7%. A perfect season now also requires spacing the
floor, which is the intended consequence.

Caught while testing: the first derivation had no reliability shrinkage, so a 7-game centre who took
two threes a night in 2009 came back at z 8.6 and could drag a whole five on his own. 54 rows cleared
|z| > 3; none do now.

## Category bars: a per-stage reference (2026-09-10)

Centring the bars on "typical" (the change that made the bar geometry and the weak-link label agree)
had a bug I did not catch: the reference was a FINISHED team, and the bars are drawn while you draft.
An untouched board — every category score exactly 0 — is a long way below a finished five, so it drew
five long bars. It read as though you already had a team before pressing Spin.

`catZ` now takes a STAGE. `STAGE_MEAN` has one row per number of picks made: row 0 is all zeroes, so
an untouched board reads as exactly typical for an untouched board and draws nothing; rows 1-5 are
the bare five as it comes together; row 6 is the finished build (five + sixth man + coach + arena),
which is what the result screen and the Team Report look at, and remains the default.

The bars are now meaningful from the first pick rather than telling every partial roster it is far
below par at everything.

## "What three bigs?" — career-modal interior (2026-09-10)

A report said "All three bigs share the floor" over a court showing a guard, a wing and a centre.
The three it meant were Clancy, Eze and **Bodiroga** — a 2.05m point-forward and one of the great
European wings.

`interior` was computed per SEASON, so a tweener disagreed with himself. Bodiroga read as a wing in
2001, 2002 and 2006 and as an interior big in 2003 and 2004, because in those two years his
three-point volume dipped and the height term carried him barely over the line: bigness +0.44 and
+0.83, against +1.0 to +5.2 for every genuine big.

`pos` has been career-modal since the start, for exactly this reason ("the roster API disagrees with
itself for tweeners"). `interior` now is too — per-season score first, then a games-weighted career
vote, centres and guards skipping it. Raising the per-season bar instead was tried and is worse: it
clears Bodiroga but also drops a Mirotić season and a Shengelia season, and moves twice as many rows
(5.5% against 2.7%).

Second half of the same complaint: the court ALWAYS draws one SF, one PF and one C, because those are
SLOTS rather than readings of who the players are. So "three bigs" would look wrong against it even
when the classification is right. The shape lines now name them — "All three bigs (Martin, Childress
& Chiacig) share the floor" — which answers the question on the line itself.

## Category bars: reverted to the growing design (2026-09-10)

Lukas: "the bars are terrible again. I want them like they were before... it's too much up and down
for me, I have expressed this before which is why the code was like that before!" He is right, and
the original design was deliberate.

WHAT I GOT WRONG. The bars and the Team Report used different measures and disagreed about which
category was shortest 55% of the time. That was real — but I fixed the wrong side. The bars were
never the problem; the report was. Instead of moving the report onto the bars' measure I moved the
bars onto a centre-anchored one, which is arguably more informative and much worse to watch: a
part-built roster sits below a finished one in EVERY category, so the bars sat left of centre and
lurched with every pick. Then I patched that with a per-stage reference — a second change to prop up
the first — rather than asking whether the first was right.

NOW. One measure, `catRatio` — a category as a share of its own typical level. The bars grow from an
empty board and only move as their own score moves; the weak-link label and the report's `standing`
run on the same ratio, so the picture and the words cannot disagree. The report moved, the bars did
not.

The cost, stated plainly: ranking by score/mean over-weights the categories with the smallest means,
so playmaking and efficiency take the weak-link slot more often than scoring does. That is a real
property of this measure and it is the trade I am making, because watching the bars build is the
point of them.

Guarded now by a test that measures how often a pick-to-pick bar move goes BACKWARDS, so the next
person to find this "more informative" gets a failure instead of a shipped regression.

## "Doncic is the only perimeter defender" (2026-09-10)

A report listed **Luka Doncic** — coming off the bench — as the five's only perimeter defender. His
1.2 steals a game as an 18-year-old at Real Madrid clear the stopper bar, defense was the listed
weakness, and the bench line walked the capabilities in a fixed order and took the first one the five
happened to need. So a volume scorer was described as a stopper.

The root of it: steals are a gambling stat as much as a defensive one, the same blind spot that makes
`defense = steals + blocks` unable to see team defense. What a player's numbers DO and what he can be
CALLED are different questions, and only the first was being asked.

Each archetype now declares `supplies` — the one capability it can credibly be described as
providing — and a role claim has to agree with it. `volume_scorer` supplies nothing, so Doncic falls
through to the ordinary bench lines and is praised for elite scoring instead. 0 mismatched claims
across 2,500 reports.

Also added the weak link efficiency never had. Every other category could name the man responsible;
efficiency shrugged ("too many contested, low-value shots"). Team TS% is usage-weighted, so the man
who drags it is the one taking a big share of the shots and missing them. Where there is no such man
the shrug STAYS — checked, and in those reports the top-usage player shoots 58% TS, so there is
genuinely nobody to name. Generic lines overall: 5.2% -> 4.1%.

