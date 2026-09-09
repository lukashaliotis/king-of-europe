import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyCareerPositions, deriveRoles, buildClubSeasons } from "../web/src/data.js";
import { CATEGORIES } from "../web/src/engine.js";
import { data, pools } from "./helpers.mjs";

test("players.json still holds only what the pipeline writes", () => {
  // data.js MUTATES the loaded object at runtime (pos, posRaw, bigness, interior, pos5). Persisting
  // that back would silently change the file's shape on the next re-bake. check_data.mjs is the guard.
  const out = execFileSync("node", ["pipeline/check_data.mjs"], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
  assert.match(out, /^OK:/m, out);
});

test("every player row is complete enough to draft", () => {
  for (const p of data.players) {
    assert.ok(p.playerCode && p.playerName, "player with no identity");
    assert.ok(Number.isFinite(p.season), `${p.playerName}: no season`);
    assert.ok(["G", "F", "C"].includes(p.pos), `${p.playerName}: odd position ${p.pos}`);
    for (const k of CATEGORIES) assert.ok(Number.isFinite(p.cat[k]), `${p.playerName}: cat.${k}`);
  }
});

test("every season the data references has baked metadata", () => {
  for (const p of data.players) {
    const meta = data.seasons[String(p.season)];
    assert.ok(meta, `season ${p.season} has no metadata`);
    assert.ok(meta.label, `season ${p.season} has no label`);
    assert.ok(meta.catStats, `season ${p.season} has no category baselines`);
  }
});

test("derived roles are stable and idempotent", () => {
  const twice = JSON.parse(JSON.stringify({ players: data.players.slice(0, 400).map((p) => ({ ...p })), seasons: data.seasons }));
  applyCareerPositions(twice); deriveRoles(twice);
  const first = twice.players.map((p) => `${p.pos}|${p.pos5}|${p.interior}`);
  applyCareerPositions(twice); deriveRoles(twice);
  const second = twice.players.map((p) => `${p.pos}|${p.pos5}|${p.interior}`);
  assert.deepEqual(second, first, "re-deriving roles changed them");
});

test("a centre is always interior and a guard never is", () => {
  for (const p of data.players) {
    if (!p.box) continue;
    if (p.pos === "C") { assert.equal(p.interior, true, `${p.playerName}: centre not interior`); assert.equal(p.pos5, "C"); }
    if (p.pos === "G") { assert.equal(p.interior, false, `${p.playerName}: guard marked interior`); assert.ok(["PG", "SG"].includes(p.pos5)); }
  }
});

test("the hand-corrected positions are actually applied", () => {
  // POS_FIX exists because the roster feed logs a few players under the role they filled in one spell.
  // If a code ever stops matching, the fix silently stops working — this is the tripwire.
  const expect = { AZM: "F", "000229": "G", "005789": "G", "013371": "G", CTN: "G" };
  for (const [code, pos] of Object.entries(expect)) {
    const rows = data.players.filter((p) => p.playerCode === code);
    assert.ok(rows.length, `POS_FIX targets ${code}, which is no longer in the dataset`);
    for (const r of rows) assert.equal(r.pos, pos, `${r.playerName} should be ${pos}`);
  }
});

test("every club-season pool can field a legal five", () => {
  for (const pool of pools) {
    assert.ok(pool.players.length >= 5, `${pool.teamName} ${pool.seasonLabel} has ${pool.players.length}`);
    assert.ok(pool.weight > 0, `${pool.teamName}: non-positive spin weight`);
    assert.ok(!pool.teamCode.includes(";"), "a mid-season transfer row leaked into the pools");
  }
});

test("the pools are strongest-first, which the offer screen relies on", () => {
  for (const pool of pools.slice(0, 200)) {
    assert.ok(pool.ceiling >= 0 || Number.isFinite(pool.ceiling), `${pool.teamName}: bad ceiling`);
  }
  assert.ok(pools.length > 500, `only ${pools.length} club-seasons`);
});

test("the interior flag is a career reading, not a per-season coin flip", () => {
  // Judged one season at a time, a tweener disagrees with himself: Dejan Bodiroga — a 2.05m
  // point-forward, one of the great European wings — read as a wing in three seasons and an interior
  // big in the two where his three-point volume dipped and his height carried him over the line. A
  // five holding him was told "all three bigs share the floor" over a court showing a guard, a wing
  // and a centre. `pos` has always been career-modal for exactly this reason; `interior` now is too.
  const byCode = new Map();
  for (const p of data.players) {
    if (!p.box || p.pos === "C" || p.pos === "G") continue;
    if (!byCode.has(p.playerCode)) byCode.set(p.playerCode, []);
    byCode.get(p.playerCode).push(p.interior);
  }
  for (const [code, flags] of byCode) {
    const uniq = new Set(flags);
    assert.equal(uniq.size, 1, `${code} flips interior between seasons`);
  }
});

test("known wings are wings and known bigs are bigs", () => {
  const roleOf = (frag) => {
    const rows = data.players.filter((p) => p.box && p.gp >= 8 && p.playerName.toUpperCase().includes(frag));
    assert.ok(rows.length, `${frag} is no longer in the dataset`);
    return rows.filter((p) => p.interior).length / rows.length;
  };
  for (const w of ["BODIROGA", "WEEMS", "PRELDŽIĆ"]) assert.equal(roleOf(w), 0, `${w} should never be interior`);
  for (const b of ["MIROTIĆ", "SHENGELIA", "VESELÝ", "PLEISS", "MITOGLOU"]) assert.equal(roleOf(b), 1, `${b} should always be interior`);
});
