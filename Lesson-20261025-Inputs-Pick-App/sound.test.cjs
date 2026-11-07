const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

function createSound(muted = false) {
  const context = {
    window: {},
    localStorage: { getItem: () => String(muted), setItem: () => {} },
  };
  vm.runInNewContext(readFileSync(resolve(__dirname, "sound.js"), "utf8"), context);
  return new context.window.PondSound();
}

test("support effects use finite hold music and telephone tones, not splashes", () => {
  const sound = createSound();
  sound.environment = "hell-support";
  const notes = [];
  sound.tone = (...args) => notes.push(args);
  sound.splash = () => assert.fail("Support effects should not splash");
  for (const effect of ["add", "cast", "bite", "fight", "escape", "reel", "win"]) {
    notes.length = 0;
    sound.play(effect);
    assert.ok(notes.length > 0 && notes.length <= 8);
    assert.ok(notes.every(([frequency, offset, duration]) => frequency > 0 && offset + duration < 3));
  }
});

test("muted or unsupported audio remains optional for the support environment", () => {
  for (const muted of [false, true]) {
    const sound = createSound(muted);
    sound.environment = "hell-support";
    for (const effect of ["cast", "fight", "win"]) assert.doesNotThrow(() => sound.play(effect));
    assert.equal(sound.context, null);
  }
});
