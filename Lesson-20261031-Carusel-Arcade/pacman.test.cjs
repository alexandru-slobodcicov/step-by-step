const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { test } = require("node:test");

function createGame() {
  const elements = new Map();
  const sounds = [];
  const element = () => ({
    events: {}, textContent: "", open: false,
    addEventListener(name, handler) { this.events[name] = handler; },
    focus() {},
    showModal() { this.open = true; },
    close() { this.open = false; this.events.close(); }
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const canvas = document.getElementById("pacman-canvas");
  canvas.width = 504;
  canvas.height = 552;
  canvas.getContext = () => new Proxy({}, { get: () => () => {} });
  const window = element();
  window.ArcadeAudio = class {
    unlock() {}
    stop() {}
    play(name) { sounds.push(name); }
  };
  const context = { document, window, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "pacman.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.game = {
      restart, update, draw, collect, checkGhosts, moveGhosts, togglePause,
      maze, walkable, distancesFrom,
      direction(value) { wanted = value; },
      setInvincible(value) { invincible = value; },
      get player() { return player; },
      get ghosts() { return ghosts; },
      get pellets() { return pellets; },
      get points() { return points; },
      get lives() { return lives; },
      get power() { return power; },
      get state() { return state; }
    };
  })();`), context);
  context.game.restart();
  return { ...context, elements, sounds };
}

function advance(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) game.update(1 / 120);
}

test("maze fits the canvas and every pellet is reachable", () => {
  const { game } = createGame();
  assert.equal(game.maze.length, 23);
  assert.ok(game.maze.every(row => row.length === 21));
  const distances = game.distancesFrom(10, 17);
  for (const key of game.pellets.keys()) assert.ok(distances.has(key), key);
});

test("Pac-Man moves, collects points, and makes a chomp sound", () => {
  const { game, sounds } = createGame();
  const count = game.pellets.size;
  advance(game, 0.14);
  assert.equal(game.player.x, 9);
  assert.equal(game.player.y, 17);
  assert.equal(game.points, 10);
  assert.equal(game.pellets.size, count - 1);
  assert.ok(sounds.includes("chomp"));
});

test("walls block movement and buffered turns work at the next junction", () => {
  const { game } = createGame();
  game.player.x = 1; game.player.y = 1; game.player.direction = "left";
  game.direction("up");
  advance(game, 0.14);
  assert.equal(game.player.x, 1);
  assert.equal(game.player.y, 1);
  game.direction("down");
  advance(game, 0.14);
  assert.equal(game.player.y, 2);
});

test("power pellets enable eating ghosts, with power and ghost sounds", () => {
  const { game, sounds } = createGame();
  game.player.x = 1; game.player.y = 1;
  game.collect();
  assert.equal(game.points, 50);
  assert.equal(game.power, 7);
  const ghost = game.ghosts[0];
  ghost.x = 1; ghost.y = 1;
  game.checkGhosts();
  assert.equal(game.points, 250);
  assert.equal(ghost.sleeping, 2);
  assert.equal(ghost.x, ghost.homeX);
  assert.ok(sounds.includes("power"));
  assert.ok(sounds.includes("ghost"));
});

test("colliding with a ghost costs one life and keeps collected points", () => {
  const { game, sounds } = createGame();
  advance(game, 0.14);
  game.setInvincible(0);
  game.ghosts[0].x = game.player.x;
  game.ghosts[0].y = game.player.y;
  game.checkGhosts();
  assert.equal(game.lives, 2);
  assert.equal(game.points, 10);
  assert.equal(game.player.x, 10);
  assert.ok(sounds.includes("hurt"));
});

test("ghost pathfinding never crosses maze walls", () => {
  const { game } = createGame();
  for (let i = 0; i < 100; i++) {
    game.moveGhosts();
    game.ghosts.forEach(ghost => assert.ok(game.walkable(ghost.x, ghost.y)));
  }
});

test("power expires, pause freezes the game, restart resets points and lives", () => {
  const { game } = createGame();
  game.player.x = 1; game.player.y = 1;
  game.collect();
  game.togglePause();
  advance(game, 1);
  assert.equal(game.power, 7);
  game.togglePause();
  game.direction("left");
  advance(game, 7.1);
  assert.equal(game.power, 0);
  game.restart();
  assert.equal(game.points, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.state, "playing");
});

test("collecting the final pellet wins and plays the win sound", () => {
  const { game, sounds } = createGame();
  game.pellets.clear();
  game.pellets.set("10,17", ".");
  game.collect();
  assert.equal(game.state, "won");
  assert.ok(sounds.includes("win"));
  assert.doesNotThrow(() => game.draw(100));
});

test("losing all lives ends the game with a sound", () => {
  const { game, sounds } = createGame();
  for (let i = 0; i < 3; i++) {
    game.setInvincible(0);
    game.ghosts[0].x = game.player.x;
    game.ghosts[0].y = game.player.y;
    game.checkGhosts();
  }
  assert.equal(game.state, "lost");
  assert.ok(sounds.includes("lose"));
});

test("launch, close, keyboard direction, pause and restart", () => {
  const { game, elements, window } = createGame();
  elements.get("play-pacman").events.click();
  assert.equal(elements.get("pacman-dialog").open, true);
  window.events.keydown({ code: "ArrowRight", preventDefault() {} });
  advance(game, 0.14);
  assert.equal(game.player.x, 11);
  window.events.keydown({ code: "KeyP" });
  assert.equal(game.state, "paused");
  window.events.keydown({ code: "KeyR" });
  assert.equal(game.state, "playing");
  elements.get("pacman-close").events.click();
  assert.equal(elements.get("pacman-dialog").open, false);
  assert.equal(game.state, "ready");
});
