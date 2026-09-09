// King of Europe — scheduled backup worker.
//
// Weekly (see the cron in wrangler.toml) it snapshots the whole leaderboard D1 to JSON in Workers
// KV, keeping the most recent 26 (~six months). GET /run takes one now; GET /list shows what's
// stored; GET /peek?key=... returns one snapshot so a restore can be done by hand.
//
// WHY THIS EXISTS: the game's own data — every leaderboard row, and every crew people created and
// joined — lives only in D1 and cannot be regenerated from the repo. The dataset in data/players.json
// is reproducible from the pipeline; none of this is.
//
// Unlike the other crates' backup workers, this one DISCOVERS its tables from sqlite_master rather
// than listing them. The game's schema has grown table by table (Classic, Salary, G.O.A.T. all-time
// and crews each arrived after the first board), and a hardcoded list silently stops backing up
// whatever was added last — the exact failure a backup must not have.

const KEEP = 26;

type Env = {
  DB: D1Database;
  BACKUPS_KV: KVNamespace;
};

async function tableNames(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' ORDER BY name"
    )
    .all<{ name: string }>();
  return (rows.results || []).map((r) => r.name);
}

async function buildBackup(db: D1Database) {
  const names = await tableNames(db);
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const name of names) {
    // Table names come from sqlite_master, never from user input, so the interpolation is safe.
    const res = await db.prepare(`SELECT * FROM "${name}"`).all();
    tables[name] = res.results || [];
    counts[name] = tables[name].length;
  }
  return {
    format: "king-of-europe-db-backup",
    database: "koe-leaderboard",
    exportedAt: new Date().toISOString(),
    counts,
    tables,
  };
}

async function prune(kv: KVNamespace) {
  const list = await kv.list({ prefix: "backup-" });
  const keys = list.keys.map((k) => k.name).sort();
  for (let i = 0; i < keys.length - KEEP; i++) await kv.delete(keys[i]);
}

async function writeBackup(env: Env, stamp: string) {
  const backup = await buildBackup(env.DB);
  const key = `backup-${stamp}`;
  await env.BACKUPS_KV.put(key, JSON.stringify(backup));
  await prune(env.BACKUPS_KV);
  const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
  return { key, counts: backup.counts, total };
}

const text = (s: string, status = 200) =>
  new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(writeBackup(env, new Date().toISOString().slice(0, 10)));
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/run") {
      const { key, counts, total } = await writeBackup(
        env,
        new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
      );
      const lines = Object.entries(counts).map(([t, n]) => `  ${t.padEnd(16)} ${n}`);
      return text(`Backed up -> ${key}\n${lines.join("\n")}\n  ${"TOTAL".padEnd(16)} ${total}\n`);
    }

    if (url.pathname === "/list") {
      const list = await env.BACKUPS_KV.list({ prefix: "backup-" });
      const names = list.keys.map((k) => k.name).sort().reverse();
      return text(names.length ? names.join("\n") + "\n" : "no snapshots yet\n");
    }

    // Read one snapshot back — the restore path. Without this a backup is only a promise.
    if (url.pathname === "/peek") {
      const key = url.searchParams.get("key");
      if (!key || !key.startsWith("backup-")) return text("pass ?key=backup-YYYY-MM-DD\n", 400);
      const body = await env.BACKUPS_KV.get(key);
      if (!body) return text(`no such snapshot: ${key}\n`, 404);
      return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }

    return text(
      "king-of-europe backup worker\n" +
        "  GET /run              back up now\n" +
        "  GET /list             list stored snapshots\n" +
        "  GET /peek?key=<key>   download one snapshot as JSON\n"
    );
  },
};
