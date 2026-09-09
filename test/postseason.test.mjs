import { test } from "node:test";
import assert from "node:assert/strict";
import { runPostseason } from "../web/src/postseason.js";
import { arenaFor, arenaTier, ratingToMult, ARENAS } from "../web/src/arenas.js";
import { data, pools, builds } from "./helpers.mjs";

const someFive = builds(40, "skilled", 4001).map((b) => b.five);
const run = (five, wins) => runPostseason(five, data.seasons, pools, wins, null, 0);
const playInGames = (post) => post.rounds.filter((r) => r.name.startsWith("Play-in")).length;

test("a bracket is well formed and never ends level", () => {
  for (const five of someFive) {
    for (const wins of [5, 12, 18, 21, 23, 26, 31, 38]) {
      const post = run(five, wins);
      assert.ok(post.stage && typeof post.label === "string", "malformed postseason result");
      for (const r of post.rounds) {
        if (r.us == null) continue;
        assert.ok(Number.isFinite(r.us) && Number.isFinite(r.them), "non-numeric score");
        assert.notEqual(r.us, r.them, `a tied game in ${r.name}`);
      }
    }
  }
});

test("the postseason is deterministic for a given five and record", () => {
  for (const five of someFive.slice(0, 15)) {
    const a = run(five, 24), b = run(five, 24);
    assert.equal(a.stage, b.stage);
    assert.equal(a.rounds.length, b.rounds.length);
  }
});

test("the play-in has the shape the real competition has", () => {
  // 7v8 -> the winner takes the 7th seed and the LOSER drops into a second game;
  // 9v10 -> the loser is out, and the survivor must win again for the last place.
  // So 7th/8th get two bites and 9th/10th have to win twice. Every play-in team used to get exactly
  // one game, which handed 9th and 10th a far easier route in than the competition does.
  for (const five of someFive) {
    for (const wins of [23, 22]) { // 7th, 8th
      const post = run(five, wins);
      const g = playInGames(post);
      assert.ok(g >= 1 && g <= 2, `seed from ${wins} wins played ${g} play-in games`);
      if (post.stage === "playin") assert.equal(g, 2, "a 7th/8th seed went out without its second chance");
    }
    for (const wins of [21, 20]) { // 9th, 10th
      const post = run(five, wins);
      const g = playInGames(post);
      assert.ok(g >= 1 && g <= 2, `seed from ${wins} wins played ${g} play-in games`);
      if (post.stage !== "playin") assert.equal(g, 2, "a 9th/10th seed reached the playoffs on one win");
    }
  }
});

test("only the play-in band ever plays a play-in game", () => {
  for (const five of someFive) {
    for (const wins of [0, 9, 15, 19]) assert.equal(playInGames(run(five, wins)), 0, `${wins} wins played a play-in game`);
    for (const wins of [24, 30, 38]) assert.equal(playInGames(run(five, wins)), 0, `${wins} wins played a play-in game`);
  }
});

test("a better record never means a worse outcome", () => {
  const RANK = { relegation: 0, rebuild: 1, almost: 2, playin: 3, playoffs: 4, finalfour: 5, lostfinal: 6, champion: 7 };
  for (const five of someFive) {
    // Compare across the cut lines only: within a band the seeded coin-flips can legitimately differ.
    assert.ok(RANK[run(five, 9).stage] <= RANK[run(five, 19).stage], "9 wins beat 19");
    assert.ok(RANK[run(five, 19).stage] <= RANK[run(five, 24).stage] + 1, "19 wins wildly beat 24");
  }
});

test("arena wording, flames and win multiplier stay in step", () => {
  // Palau Blaugrana once read "a real edge on the 19 home nights" while showing two flames, because
  // the sentence and the meter were driven by two different thresholds.
  for (const [teamCode, list] of Object.entries(ARENAS)) {
    for (const a of list) {
      const tier = arenaTier(a.rating);
      assert.ok(tier >= 1 && tier <= 5, `${a.name}: flame tier ${tier}`);
      const m = ratingToMult(a.rating);
      assert.ok(m > 0.9 && m < 1.1, `${a.name}: implausible multiplier ${m}`);
      if (tier >= 4) assert.ok(m > 1, `${a.name}: reads as an edge but is not one`);
      if (tier === 1) assert.ok(m <= 1, `${a.name}: reads as no advantage but helps`);
    }
  }
  const neutral = arenaFor("NOT_A_CLUB", 2010);
  assert.equal(neutral.mult, 1, "the fallback venue should be neutral");
});
