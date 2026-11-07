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
    addEventListener() {}
  };
  const canvas = document.getElementById("duckhunt-canvas");
  canvas.width = 960;
  canvas.height = 540;
  canvas.getBoundingClientRect = () => ({ left: 20, top: 100, width: 480, height: 270 });
  canvas.getContext = () => new Proxy({}, { get: () => () => {} });
  const window = element();
  window.ArcadeAudio = class {
    unlock() {}
    stop() { sounds.push("stop"); }
    play(name) { sounds.push(name); }
  };
  const context = { document, window, HTMLButtonElement: class {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "duckhunt.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.game = {
      restart, update, draw, shoot, togglePause, pointerPosition, keys, aim,
      get ducks() { return ducks; },
      get state() { return state; },
      get phase() { return phase; },
      get dogMood() { return dogMood; },
      get hits() { return hits; },
      get points() { return points; },
      get round() { return round; },
      get ammo() { return ammo; },
      get timer() { return timer; },
      get history() { return history; }
    };
  })();`), context);
  context.game.restart();
  return { ...context, sounds, elements };
}

function advance(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) game.update(1 / 120);
}

function hitAll(game) {
  for (const duck of game.ducks) {
    game.shoot(duck.x, duck.y);
    advance(game, 0.2);
  }
}

test("game starts with two flying ducks, three cartridges, and start sounds", () => {
  const { game, sounds } = createGame();
  assert.equal(game.ducks.length, 2);
  assert.equal(game.ammo, 3);
  assert.equal(game.round, 1);
  assert.ok(sounds.includes("start"));
  assert.ok(sounds.includes("quack"));
  const x = game.ducks[0].x;
  advance(game, 0.3);
  assert.notEqual(game.ducks[0].x, x);
});

test("a hit gives points, consumes one cartridge, and plays hit and shot sounds", () => {
  const { game, sounds } = createGame();
  const duck = game.ducks[0];
  game.shoot(duck.x, duck.y);
  assert.equal(game.hits, 1);
  assert.equal(game.ammo, 2);
  assert.ok(game.points > 0);
  assert.equal(duck.falling, true);
  assert.ok(sounds.includes("shot"));
  assert.ok(sounds.includes("duckHit"));
  advance(game, 0.2);
  game.shoot(duck.x, duck.y);
  assert.equal(game.hits, 1);
});

test("rapid input cannot bypass the shot cooldown", () => {
  const { game } = createGame();
  game.shoot(0, 0);
  game.shoot(0, 0);
  assert.equal(game.ammo, 2);
});

test("three misses make ducks escape and the dog laugh", () => {
  const { game, sounds } = createGame();
  for (let i = 0; i < 3; i++) {
    game.shoot(0, 0);
    advance(game, 0.2);
  }
  assert.equal(game.ammo, 0);
  assert.equal(game.phase, "escape");
  advance(game, 1.3);
  assert.equal(game.phase, "result");
  assert.equal(game.dogMood, "laugh");
  assert.ok(sounds.includes("dogLaugh"));
  assert.equal(game.history.length, 2);
  assert.doesNotThrow(() => game.draw(500));
});

test("running out of time also makes the dog laugh", () => {
  const { game } = createGame();
  advance(game, 9.6);
  assert.equal(game.phase, "result");
  assert.equal(game.dogMood, "laugh");
});

test("catching both ducks makes the dog retrieve them and bark", () => {
  const { game, sounds } = createGame();
  hitAll(game);
  assert.equal(game.phase, "result");
  assert.equal(game.dogMood, "happy");
  assert.equal(game.hits, 2);
  assert.ok(sounds.includes("bark"));
  const ammo = game.ammo;
  game.shoot(0, 0);
  assert.equal(game.ammo, ammo);
  assert.doesNotThrow(() => game.draw(500));
  advance(game, 2.7);
  assert.equal(game.round, 2);
  assert.equal(game.ammo, 3);
});

test("letting one duck escape still triggers the laugh", () => {
  const { game } = createGame();
  game.shoot(game.ducks[0].x, game.ducks[0].y);
  advance(game, 9.6);
  assert.equal(game.dogMood, "laugh");
  assert.equal(game.hits, 1);
});

test("pause freezes the ducks, timer and ammo; restart resets all progress", () => {
  const { game } = createGame();
  const x = game.ducks[0].x, timer = game.timer;
  game.togglePause();
  advance(game, 1);
  game.shoot(x, game.ducks[0].y);
  assert.equal(game.ducks[0].x, x);
  assert.equal(game.timer, timer);
  assert.equal(game.ammo, 3);
  game.restart();
  assert.equal(game.state, "playing");
  assert.equal(game.hits, 0);
  assert.equal(game.history.length, 0);
});

test("the tenth round ends in victory after enough hits, with no eleventh round", () => {
  const { game, sounds } = createGame();
  for (let i = 0; i < 10; i++) {
    hitAll(game);
    advance(game, 2.7);
  }
  assert.equal(game.state, "won");
  assert.equal(game.round, 10);
  assert.equal(game.hits, 20);
  assert.equal(game.history.length, 20);
  assert.ok(sounds.includes("win"));
});

test("missing every duck ends the game after ten rounds", () => {
  const { game, sounds } = createGame();
  for (let i = 0; i < 10; i++) advance(game, 12.5);
  assert.equal(game.state, "lost");
  assert.equal(game.round, 10);
  assert.equal(game.history.length, 20);
  assert.ok(sounds.includes("lose"));
});

test("pointer coordinates account for canvas scaling and touch input fires", () => {
  const { game, elements } = createGame();
  const duck = game.ducks[0];
  const point = game.pointerPosition({ clientX: 140, clientY: 255 });
  assert.equal(point.x, 240);
  assert.equal(point.y, 310);
  elements.get("duckhunt-canvas").events.pointerdown({
    button: 0, isPrimary: true, clientX: duck.x / 2 + 20,
    clientY: duck.y / 2 + 100, preventDefault() {}
  });
  assert.equal(game.hits, 1);
});

test("keyboard aiming, firing, launch and close work", () => {
  const { game, elements, window } = createGame();
  elements.get("play-duckhunt").events.click();
  assert.equal(elements.get("duckhunt-dialog").open, true);
  window.events.keydown({ code: "ArrowRight", preventDefault() {} });
  advance(game, 0.1);
  assert.ok(game.aim.x > 480);
  window.events.keyup({ code: "ArrowRight" });
  window.events.keydown({ code: "Space", preventDefault() {} });
  assert.equal(game.ammo, 2);
  elements.get("duckhunt-close").events.click();
  assert.equal(elements.get("duckhunt-dialog").open, false);
  assert.equal(game.state, "ready");
  assert.equal(game.keys.size, 0);
});
