// Shape guard for data/players.json — run before committing or deploying.
//
// The baked file must contain ONLY what pipeline/build_dataset.py writes. web/src/data.js derives
// posRaw / bigness / interior / pos5 and collapses `pos` to a career position AT LOAD TIME, mutating
// the in-memory object. Persisting that mutated object back to disk (which had happened) silently
// changes the file's shape and meaning, so a later `python3 pipeline/build_dataset.py` produces a
// DIFFERENT file: raw per-season `pos`, and none of the derived fields. This check fails loudly on that.
//
//   node pipeline/check_data.mjs
import fs from "fs";

const CANONICAL = new Set([
  "season", "playerCode", "playerName", "teamCode", "teamName",
  "gp", "gs", "mpg", "cat", "box", "pir", "pos", "height", "q",
]);
const DERIVED = ["posRaw", "bigness", "interior", "pos5"]; // added at load; must never be persisted

const d = JSON.parse(fs.readFileSync(new URL("../data/players.json", import.meta.url), "utf8"));
const seen = new Set();
for (const p of d.players) for (const k of Object.keys(p)) seen.add(k);

const leaked = DERIVED.filter((k) => seen.has(k));
const unknown = [...seen].filter((k) => !CANONICAL.has(k));
const missing = [...CANONICAL].filter((k) => !seen.has(k));

let bad = false;
if (leaked.length) { console.error("FAIL: runtime-derived fields persisted into data/players.json:", leaked.join(", ")); bad = true; }
if (unknown.length) { console.error("FAIL: unexpected field(s) in data/players.json:", unknown.join(", ")); bad = true; }
if (missing.length) { console.error("FAIL: missing expected field(s):", missing.join(", ")); bad = true; }

if (bad) {
  console.error("\nFix: restore `pos` from `posRaw`, delete the derived fields, and re-save.");
  process.exit(1);
}
console.log(`OK: ${d.players.length} player rows, ${Object.keys(d.coaches).length} coaches, canonical shape.`);
