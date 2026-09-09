import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRecord } from "../web/src/engine.js";
import { runPostseason } from "../web/src/postseason.js";
import { resolveClassicAllTime } from "../web/src/resolveClassic.js";
import { coachDeltas } from "../web/src/coaches.js";
import { arenaFor, arenaKey } from "../web/src/arenas.js";
import { encodeChallenge, decodeChallenge } from "../web/src/versus.js";
import { data, pools, builds } from "./helpers.mjs";

// The server re-simulates every submission with the same modules the browser ran, and the client
// submits CHOICES rather than a score. That only holds up if the two paths agree exactly — a drift
// either rejects honest players or lets a forged one through, and neither shows up until it matters.
test("the server reproduces the client's season exactly", () => {
  let checked = 0;
  for (const b of builds(300, "spread", 3001)) {
    const srcs = b.five.map((p) => ({ code: p.playerCode, teamCode: p._src.teamCode, seasonLabel: p._src.seasonLabel }));
    const arenaSlot = 0;
    const host = b.five[arenaSlot];
    const base = arenaFor(host._src.teamCode, host.season);
    const key = arenaKey(host._src.teamCode, host.season);
    const share = b.five.filter((x) => arenaKey(x._src.teamCode, x.season) === key).length / 5;
    const mult = 1 + (base.mult - 1) * share;

    const client = projectRecord(b.five, data.seasons, undefined, mult, b.coach ? coachDeltas(b.coach) : null, b.sixth);
    const clientPost = runPostseason(b.five, data.seasons, pools, client.wins, b.sixth, 0);

    const server = resolveClassicAllTime(data, {
      starters: srcs,
      sixth: b.sixth ? { code: b.sixth.playerCode, teamCode: b.sixth._src.teamCode, seasonLabel: b.sixth._src.seasonLabel } : null,
      coach: b.coach ? b.coach.coach.code : null,
      arenaSlot,
    });
    assert.ok(server.ok, `server rejected an honest build: ${server.error}`);
    assert.equal(server.wins, client.wins, "server and client disagree on the record");
    assert.equal(server.stage, clientPost.stage, "server and client disagree on the postseason");
    checked++;
  }
  assert.ok(checked > 200, `only ${checked} round-trips ran`);
});

test("the server refuses a roster that isn't five men", () => {
  for (const bad of [[], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6]]) {
    const r = resolveClassicAllTime(data, { starters: bad, sixth: null, coach: null, arenaSlot: null });
    assert.equal(r.ok, false, "accepted a roster of the wrong size");
  }
});

test("the server refuses a player who was never on that club-season", () => {
  const b = builds(1, "spread", 3002)[0];
  const srcs = b.five.map((p) => ({ code: p.playerCode, teamCode: p._src.teamCode, seasonLabel: p._src.seasonLabel }));
  srcs[0] = { ...srcs[0], code: "NOT_A_REAL_CODE" };
  const r = resolveClassicAllTime(data, { starters: srcs, sixth: null, coach: null, arenaSlot: null });
  assert.equal(r.ok, false, "accepted a fabricated player");
});

test("a Versus challenge code survives the round trip", () => {
  const b = builds(1, "spread", 3003)[0];
  const board = b.five.map((p) => ({ players: [p] }));
  board.push({ players: [b.sixth] });
  const code = encodeChallenge({ seed: 123456, board, slots: b.five, sixth: b.sixth, arenaSlotIdx: 0, coachCode: "" });
  const env = decodeChallenge(code);
  assert.equal(env.seed, 123456);
  assert.equal(env.codes.length, 6);
  assert.deepEqual(env.codes.slice(0, 5), b.five.map((p) => p.playerCode));
});

test("a corrupted challenge code is refused, not misread", () => {
  for (const bad of ["", "hello", "KOE2-", "KOE2-abc.def", "KOE2-zz.a,b,c.0.0."]) {
    assert.throws(() => decodeChallenge(bad), `accepted a corrupt code: ${bad}`);
  }
});
