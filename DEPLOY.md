# Deploying King of Europe (Tier 0 — static, no backend)

The whole game is static files. Nothing to build, no server, no environment variables.

## What ships
Only these are needed at runtime:

```
index.html          ← entry point (repo root)
web/src/*.js         ← the game code (ES modules)
web/src/style.css
data/players.json    ← the baked dataset (2.4 MB), fetched at load
.nojekyll            ← tells GitHub Pages to serve files as-is
```

`pipeline/`, `sim/`, and `docs/` are dev-only and harmless if also uploaded.

## Paths
- `index.html` references assets as `web/src/...` (root-relative-friendly).
- The dataset is fetched **relative to the module** (`new URL("../../data/players.json",
  import.meta.url)` in `web/src/data.js`), so it resolves the same whether the site is served
  from the repo root or the local dev server.

## Deploy options (publish directory = the repo root)

**GitHub Pages**
1. Push the repo to GitHub.
2. Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Your site: `https://<user>.github.io/<repo>/`.

**Netlify / Cloudflare Pages**
- New site from the repo. Build command: *(none)*. Publish directory: `.` (root). Deploy.

**Vercel**
- Import the repo. Framework preset: "Other". Output/root directory: `.`. Deploy.

**Anything else / local check**
- Any static file server pointed at the repo root works, e.g. `npx serve .` then open `/`.

## Note
No accounts, leaderboards, or shared state yet — Daily is deterministic per UTC date and Versus
travels via its copy-paste code, so both already work with zero backend. Adding a global Daily
leaderboard is "Tier 1" (a serverless function + a small DB, validating scores by re-running the
deterministic engine server-side).
