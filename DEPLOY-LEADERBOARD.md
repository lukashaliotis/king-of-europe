# Deploying King of Europe + the Daily leaderboard (Tier 1)

This puts the **whole game online for friends** AND turns on the **global Daily leaderboard** in
one deploy, on **Cloudflare Pages** (free tier is plenty).

- The static game is served from the repo root (same as before).
- The leaderboard is three serverless functions in `functions/` + a small **D1** (SQLite) database.
- Scores are **re-simulated server-side** from your picks, so a record can't be forged.

Identity is **name-only**: each device stores a random id + a display name in the browser. No
accounts, no passwords.

---

## One-time setup (~10 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and Node installed.
All commands run from the project root (`38-0/`). `npx` fetches wrangler on demand — no global
install needed.

### 1. Log in

```bash
npx wrangler login
```

### 2. Create the database

```bash
npx wrangler d1 create koe-leaderboard
```

It prints a `database_id`. Open **`wrangler.toml`** and replace `PASTE_DATABASE_ID_HERE` with it.

### 3. Create the table (remote)

```bash
npx wrangler d1 execute koe-leaderboard --remote --file=functions/schema.sql
```

### 4. Deploy

```bash
npx wrangler pages deploy . --project-name king-of-europe
```

The first deploy creates the Pages project and prints your public URL
(`https://king-of-europe.pages.dev`). **Send that link to friends — that's the whole game, and
it now has a leaderboard.**

> If the leaderboard shows "offline" after the first deploy, the D1 binding isn't attached yet:
> in the Cloudflare dashboard go to **Workers & Pages → king-of-europe → Settings → Functions →
> D1 database bindings**, add **Variable name `DB` → database `koe-leaderboard`**, then redeploy.

---

## Updating later

Re-run step 4 (`npx wrangler pages deploy . --project-name king-of-europe`) any time you change
the game. Or connect the repo to Cloudflare Pages (dashboard → **Create → Pages → Connect to
Git**, build command *none*, output directory `/`) so every push auto-deploys — just remember to
add the `DB` binding once in the project settings.

---

## Test it locally first (optional)

```bash
# create the table in a LOCAL copy of the db
npx wrangler d1 execute koe-leaderboard --local --file=functions/schema.sql
# run the site + functions + local d1 together
npx wrangler pages dev .
```

Open the printed `http://localhost:8788`, play a Daily, finish it, and the leaderboard panel
appears in the recap. (Plain `python3 -m http.server` still works for the game, but the
leaderboard needs the functions, so use `wrangler pages dev` when testing that part.)

---

## What each piece is

| Path | Role |
|---|---|
| `functions/api/submit.js` | POST your picks → re-simulates → stores the authoritative record. |
| `functions/api/leaderboard.js` | GET today's standings + your rank. |
| `functions/_lib/` | Shared helpers (dataset loader, name sanitiser, D1 queries). |
| `functions/schema.sql` | The `scores` table (one row per day per device). |
| `web/src/resolve.js` | The isomorphic re-simulation engine — same code the browser runs. |
| `web/src/leaderboard.js` | Client: identity, submit, fetch. Degrades to "offline" with no backend. |
| `wrangler.toml` | Ties the Pages project to the D1 database. |

## Cost & limits

Cloudflare's free tier covers a friends-scale game comfortably: Pages is unlimited static
requests; D1 free tier is 5 GB and millions of reads/day. One row per player per day is tiny.
