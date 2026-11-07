const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function createAudio(supported = true) {
  const nodes = [];
  const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  class FakeContext {
    constructor() { this.state = "suspended"; this.currentTime = 0; }
    resume() { this.state = "running"; return Promise.resolve(); }
    createOscillator() {
      const node = { frequency: parameter, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } };
      nodes.push(node);
      return node;
    }
    createGain() { return { gain: parameter, connect() {}, disconnect() {} }; }
  }
  const button = {
    attrs: {}, events: {},
    addEventListener(name, handler) { this.events[name] = handler; },
    setAttribute(key, value) { this.attrs[key] = value; }
  };
  const context = { window: supported ? { AudioContext: FakeContext } : {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "arcade-audio.js"), "utf8"), context);
  return { audio: new context.window.ArcadeAudio(button), nodes, button };
}

test("audio is lazy and only starts after unlock", () => {
  const { audio, nodes } = createAudio();
  audio.play("jump");
  assert.equal(nodes.length, 0);
  audio.unlock();
  audio.play("jump");
  assert.equal(nodes.length, 1);
  audio.play("coin");
  assert.equal(nodes.length, 3);
});

test("muting immediately stops all scheduled notes and blocks new sounds", () => {
  const { audio, nodes, button } = createAudio();
  audio.unlock();
  audio.play("start");
  assert.equal(nodes.length, 4);
  button.events.click();
  assert.ok(nodes.every(node => node.stopped));
  assert.equal(button.attrs["aria-pressed"], "false");
  audio.play("chomp");
  assert.equal(nodes.length, 4);
  button.events.click();
  audio.play("chomp");
  assert.equal(nodes.length, 5);
});

test("stop silences active sounds and effects cover both games", () => {
  const { audio, nodes } = createAudio();
  audio.unlock();
  for (const effect of ["start", "jump", "coin", "stomp", "hurt", "win", "lose", "chomp", "power", "ghost", "shot", "quack", "duckHit", "dogLaugh", "bark"]) {
    const count = nodes.length;
    audio.play(effect);
    assert.ok(nodes.length > count, effect);
  }
  assert.ok(nodes.length > 20);
  audio.stop();
  assert.ok(nodes.every(node => node.stopped));
  assert.equal(audio.nodes.size, 0);
});

test("unsupported browsers can still play without audio", () => {
  const { audio, button } = createAudio(false);
  assert.doesNotThrow(() => { audio.unlock(); audio.play("start"); audio.stop(); button.events.click(); });
});
