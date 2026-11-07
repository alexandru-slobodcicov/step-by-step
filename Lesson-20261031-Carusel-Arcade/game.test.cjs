const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const path = require("node:path");

function createGame() {
  const elements = new Map();
  const makeElement = () => ({
    events: {}, textContent: "", open: false,
    addEventListener(name, handler) { this.events[name] = handler; },
    focus() {},
    showModal() { this.open = true; },
    close() { this.open = false; this.events.close(); }
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const canvas = document.getElementById("game-canvas");
  canvas.width = 960;
  canvas.height = 480;
  canvas.getContext = () => new Proxy({}, { get: () => () => {} });
  const context = {
    document, window: makeElement(), HTMLButtonElement: class {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "arcade-audio.js"), "utf8"), context);
  context.sounds = [];
  context.window.ArcadeAudio.prototype.play = name => context.sounds.push(name);
  const source = fs.readFileSync(path.join(__dirname, "game.js"), "utf8");
  // Expose closure state in the test VM only; the browser keeps it private.
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.game = {
      restart, update, draw, togglePause, loseLife, keys,
      jump() { jumpQueued = true; },
      get player() { return player; },
      get coins() { return coins; },
      get enemies() { return enemies; },
      get state() { return state; },
      get lives() { return lives; }
    };
  })();`), context);
  context.game.restart();
  return { ...context, elements };
}

function advance(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) game.update(1 / 120);
}

test("player starts on the ground and walks right", () => {
  const { game } = createGame();
  advance(game, 0.2);
  assert.equal(game.player.y, 380);
  assert.equal(game.player.grounded, true);
  game.keys.add("ArrowRight");
  advance(game, 0.3);
  assert.ok(game.player.x > 130);
});

test("jump lands and cannot be repeated in midair", () => {
  const { game } = createGame();
  game.jump();
  advance(game, 0.1);
  assert.ok(game.player.y < 330);
  const velocity = game.player.vy;
  game.jump();
  game.update(1 / 120);
  assert.ok(game.player.vy > velocity);
  advance(game, 1);
  assert.equal(game.player.y, 380);
});

test("player can jump onto the first elevated platform", () => {
  const { game } = createGame();
  game.player.x = 180;
  game.keys.add("KeyD");
  game.jump();
  advance(game, 0.6);
  game.keys.clear();
  advance(game, 0.6);
  assert.equal(game.player.y, 274);
  assert.equal(game.player.grounded, true);
});

test("coins are collected once", () => {
  const { game } = createGame();
  game.player.x = 180;
  advance(game, 0.1);
  assert.equal(game.coins.filter(coin => coin.taken).length, 1);
  advance(game, 0.1);
  assert.equal(game.coins.filter(coin => coin.taken).length, 1);
});

test("falling into a pit loses one life and resets the player", () => {
  const { game } = createGame();
  game.player.x = 1040;
  advance(game, 1);
  assert.equal(game.lives, 2);
  assert.equal(game.player.x, 60);
});

test("the two pits can be crossed by jumping", () => {
  for (const [start, landing] of [[945, 1110], [2065, 2240]]) {
    const { game } = createGame();
    game.enemies.forEach(enemy => { enemy.alive = false; });
    game.player.x = start;
    game.keys.add("KeyD");
    game.jump();
    advance(game, 0.85);
    assert.equal(game.lives, 3);
    assert.ok(game.player.x >= landing);
    assert.equal(game.player.grounded, true);
  }
});

test("stomping an enemy defeats it and bounces the player", () => {
  const { game } = createGame();
  const enemy = game.enemies[0];
  game.player.x = enemy.x;
  game.player.y = enemy.y - game.player.h - 1;
  game.player.vy = 200;
  game.player.grounded = false;
  game.update(1 / 120);
  assert.equal(enemy.alive, false);
  assert.ok(game.player.vy < 0);
});

test("side contact costs a life when invulnerability expires", () => {
  const { game } = createGame();
  game.player.x = game.enemies[0].x;
  game.player.invincible = 0;
  game.update(1 / 120);
  assert.equal(game.lives, 2);
});

test("pause freezes movement; restarting restores all state", () => {
  const { game } = createGame();
  game.togglePause();
  game.keys.add("KeyD");
  advance(game, 1);
  assert.equal(game.player.x, 60);
  assert.equal(game.state, "paused");
  game.restart();
  assert.equal(game.state, "playing");
  assert.equal(game.keys.size, 0);
  assert.equal(game.lives, 3);
});

test("three lost lives end the game, and the flag wins it", () => {
  const { game } = createGame();
  game.loseLife(); game.loseLife(); game.loseLife();
  assert.equal(game.state, "lost");
  game.restart();
  game.player.x = 3245;
  game.update(1 / 120);
  assert.equal(game.state, "won");
  assert.doesNotThrow(() => game.draw(100));
});

test("launch and close use the dialog without changing the carousel", () => {
  const { game, elements } = createGame();
  elements.get("play-game").events.click();
  assert.equal(elements.get("game-dialog").open, true);
  assert.equal(game.state, "playing");
  elements.get("game-close").events.click();
  assert.equal(elements.get("game-dialog").open, false);
  assert.equal(game.state, "ready");
});

test("Mario triggers start, jump, coin, damage, defeat and victory sounds", () => {
  const { game, sounds } = createGame();
  assert.ok(sounds.includes("start"));
  game.jump();
  game.update(1 / 120);
  assert.ok(sounds.includes("jump"));
  game.player.x = 180;
  game.player.y = 360;
  game.coins[0].taken = false;
  game.update(1 / 120);
  assert.ok(sounds.includes("coin"));
  game.loseLife();
  assert.ok(sounds.includes("hurt"));
  game.loseLife(); game.loseLife();
  assert.ok(sounds.includes("lose"));
  game.restart();
  game.player.x = 3245;
  game.update(1 / 120);
  assert.ok(sounds.includes("win"));
});
