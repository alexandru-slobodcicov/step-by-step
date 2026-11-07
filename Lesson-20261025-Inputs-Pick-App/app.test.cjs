const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.value = "";
    this.dataset = {};
    this.textContent = "";
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    this.clientWidth = 650;
    this.clientHeight = 460;
  }
  set innerHTML(value) { this.children = []; }
  setAttribute(name, value) { this[name] = value; }
  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }
  appendChild(child) { this.append(child); }
  prepend(child) { this.children.unshift(child); }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  querySelector() { return this.button ||= new Element(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 50, height: 23 }; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  focus() {}
  fire(type) { return this.listeners[type]({ preventDefault() {} }); }
}

function createApp(initial = [], storage = new Map(), options = {}) {
  if (!storage.has("fishing-app-people")) storage.set("fishing-app-people", JSON.stringify(initial));
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const timers = [];
  const effects = [];
  const sceneFish = new Set();
  const sceneEvents = [];
  let roll = 99;
  const context = {
    document: { body: new Element(), getElementById: get, createElement: () => new Element(), querySelector: get },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    crypto: { getRandomValues: (values) => { values[0] = roll; return values; } },
    confirm: () => true,
    setInterval: () => {},
    setTimeout: (fn) => timers.push(fn),
    PondSound: class {
      muted = false;
      toggle() { this.muted = !this.muted; }
      play(effect) { effects.push(effect); }
    },
    FishingRig: class {
      setEnvironment() {}
      lowerTo() { get("line").classes.add("active"); }
      raiseTo() {}
      reset() { get("line").classes.delete("active"); }
    },
    Pond3D: class {
      setEnvironment() {}
      available = options.webgl !== false;
      add(name) { sceneFish.add(name); return { id: "shark", label: "Shark" }; }
      remove(name) { sceneFish.delete(name); }
      cast(name) { sceneEvents.push(["cast", name]); }
      approach(name) { sceneEvents.push(["approach", name]); }
      catch(name) { sceneEvents.push(["bite", name]); }
      fight(name) { sceneEvents.push(["fight", name]); }
      escape(name) { sceneEvents.push(["escape", name]); }
      reel(name) { sceneEvents.push(["reel", name]); }
    },
  };
  vm.runInNewContext(readFileSync(resolve(__dirname, "app.js"), "utf8"), context);
  return {
    get, storage, effects, sceneFish, sceneEvents,
    setRoll: (value) => { roll = value; },
    people: () => JSON.parse(storage.get("fishing-app-people")),
    async tick() {
      assert.ok(timers.length, "Expected a pending animation timer");
      timers.shift()();
      await Promise.resolve();
      await Promise.resolve();
    },
    async catchFish(escape = false) {
      roll = escape ? 0 : 99;
      const result = get("cast-btn").fire("click");
      for (let i = 0; i < (escape ? 5 : 6); i++) await this.tick();
      await result;
    },
  };
}

test("a single fish can be caught and stays removed after reload", async () => {
  const app = createApp(["Alice"]);
  assert.equal(app.get("cast-btn").disabled, false);
  await app.catchFish();
  assert.deepEqual(app.people(), []);
  assert.equal(app.sceneFish.size, 0);
  assert.equal(app.get("cast-btn").disabled, true);
  assert.equal(app.get("pond-empty").hidden, false);
  assert.equal(app.get("history").children.length, 1);
  assert.equal(app.get("result").textContent, "Alice got caught!");
  const reloaded = createApp([], app.storage);
  assert.equal(reloaded.sceneFish.size, 0);
  assert.deepEqual(reloaded.people(), []);
});

test("catches never repeat and all participants can be caught", async () => {
  const app = createApp(["Alice", "Bob", "Charlie"]);
  const caught = new Set();
  for (let remaining = 2; remaining >= 0; remaining--) {
    await app.catchFish();
    const winner = app.get("result").textContent.replace(" got caught!", "");
    assert.equal(caught.has(winner), false);
    caught.add(winner);
    assert.equal(app.people().length, remaining);
    assert.equal(app.sceneFish.size, remaining);
  }
  assert.equal(caught.size, 3);
  assert.deepEqual(app.effects, Array(3).fill(["cast", "bite", "fight", "reel", "win"]).flat());
});

test("catch is persisted at reveal, before the celebration finishes", async () => {
  const app = createApp(["Alice"]);
  const casting = app.get("cast-btn").fire("click");
  for (let i = 0; i < 5; i++) await app.tick();
  assert.deepEqual(app.people(), []);
  assert.equal(app.get("cast-btn").disabled, true);
  assert.deepEqual(createApp([], app.storage).people(), []);
  await app.tick();
  await casting;
});

test("casting locks edits and prevents concurrent casts", async () => {
  const app = createApp(["Alice", "Bob"]);
  const casting = app.get("cast-btn").fire("click");
  assert.equal(app.get("name-input").disabled, true);
  assert.equal(app.get("bulk-add").disabled, true);
  app.get("bulk-input").value = "Charlie";
  app.get("bulk-add").fire("click");
  app.get("clear-btn").fire("click");
  await app.get("cast-btn").fire("click");
  assert.deepEqual(app.people(), ["Alice", "Bob"]);
  for (let i = 0; i < 6; i++) await app.tick();
  await casting;
  assert.equal(app.get("history").children.length, 1);
  assert.equal(app.get("name-input").disabled, false);
});

test("adding names trims whitespace and deduplicates case-insensitively", () => {
  const app = createApp();
  app.get("bulk-input").value = " Alice, Bob\nalice\n\n Charlie ";
  app.get("bulk-add").fire("click");
  assert.deepEqual(app.people(), ["Alice", "Bob", "Charlie"]);
  assert.equal(app.sceneFish.size, 3);
  app.get("sound-btn").fire("click");
  assert.equal(app.get("sound-btn")["aria-pressed"], "true");
  assert.equal(app.get("sound-btn").textContent, "Sound: off");
});

test("hooked fish fight before reeling and inputs remain locked", async () => {
  const app = createApp(["Alice"]);
  const casting = app.get("cast-btn").fire("click");
  await app.tick();
  await app.tick();
  await app.tick();
  assert.equal(app.get("result").textContent, "Alice is fighting the hook!");
  assert.deepEqual(app.sceneEvents, [["cast", "Alice"], ["approach", "Alice"], ["bite", "Alice"], ["fight", "Alice"]]);
  assert.equal(app.get("pond").classes.has("fighting"), true);
  assert.equal(app.get("cast-btn").disabled, true);
  assert.deepEqual(app.people(), ["Alice"]);
  for (let i = 0; i < 3; i++) await app.tick();
  await casting;
  assert.equal(app.get("pond").classes.has("fighting"), false);
});

test("escaped fish return without removal, remain after reload, and can be caught later", async () => {
  const app = createApp(["Alice"]);
  await app.catchFish(true);
  assert.deepEqual(app.people(), ["Alice"]);
  assert.equal(app.sceneFish.size, 1);
  assert.equal(app.get("cast-btn").disabled, false);
  assert.equal(app.get("result").textContent, "Alice escaped! Back in the pond.");
  assert.deepEqual(app.sceneEvents, [["cast", "Alice"], ["approach", "Alice"], ["bite", "Alice"], ["fight", "Alice"], ["escape", "Alice"]]);
  assert.deepEqual(app.effects, ["cast", "bite", "fight", "escape"]);
  assert.equal(app.get("history").children[0].className, "escape");
  assert.equal(app.get("line").classes.has("active"), false);
  assert.equal(app.get("pond").classes.has("fighting"), false);
  assert.deepEqual(createApp([], app.storage).people(), ["Alice"]);
  await app.catchFish();
  assert.deepEqual(app.people(), []);
  assert.equal(app.get("history").children.length, 2);
});

test("escape chance has an exact 30 percent boundary", async () => {
  for (const [roll, escaped] of [[29, true], [30, false]]) {
    const app = createApp(["Alice"]);
    app.setRoll(roll);
    const casting = app.get("cast-btn").fire("click");
    for (let i = 0; i < (escaped ? 5 : 6); i++) await app.tick();
    await casting;
    assert.equal(app.people().length, escaped ? 1 : 0);
  }
});

test("2D fallback supports both escape and landing", async () => {
  const app = createApp(["Alice"], new Map(), { webgl: false });
  await app.catchFish(true);
  assert.deepEqual(app.people(), ["Alice"]);
  await app.catchFish();
  assert.deepEqual(app.people(), []);
});

test("the line lowers first, then the fish approaches, and only then bites", async () => {
  const app = createApp(["Alice"]);
  const casting = app.get("cast-btn").fire("click");
  assert.deepEqual(app.sceneEvents, [["cast", "Alice"]]);
  assert.deepEqual(app.effects, ["cast"]);
  await app.tick();
  assert.deepEqual(app.sceneEvents, [["cast", "Alice"], ["approach", "Alice"]]);
  assert.equal(app.get("result").textContent, "A fish is swimming toward the bait...");
  assert.deepEqual(app.effects, ["cast"]);
  await app.tick();
  assert.deepEqual(app.sceneEvents, [["cast", "Alice"], ["approach", "Alice"], ["bite", "Alice"]]);
  assert.deepEqual(app.effects, ["cast", "bite"]);
  for (let i = 0; i < 4; i++) await app.tick();
  await casting;
});

test("switching environments changes presentation without changing participants", () => {
  const app = createApp(["Alice", "Bob"]);
  const before = app.get("pond").children.slice();
  app.get("environment").value = "star-wars";
  app.get("environment").fire("change");
  assert.equal(app.get("pond").classes.has("space"), true);
  assert.equal(app.get("page-title").textContent, "Galactic Catch");
  assert.equal(app.get("cast-btn").textContent, "Activate blaster");
  assert.deepEqual(app.people(), ["Alice", "Bob"]);
  assert.deepEqual(app.get("pond").children, before);
  assert.equal(before[0].title, "Alice - Star Destroyer");
  assert.equal(app.storage.get("fishing-app-environment"), "star-wars");
  const reloaded = createApp([], app.storage);
  assert.equal(reloaded.get("environment").value, "star-wars");
  assert.equal(reloaded.get("pond").classes.has("space"), true);
  app.get("environment").value = "fish-pond";
  app.get("environment").fire("change");
  assert.equal(app.get("pond").classes.has("space"), false);
  assert.equal(before[0].title, "Alice - Shark");
});

test("environment switching is locked during a cast", async () => {
  const app = createApp(["Alice"]);
  const casting = app.get("cast-btn").fire("click");
  assert.equal(app.get("environment").disabled, true);
  app.get("environment").value = "star-wars";
  app.get("environment").fire("change");
  assert.equal(app.get("environment").value, "fish-pond");
  assert.equal(app.get("pond").classes.has("space"), false);
  for (let i = 0; i < 6; i++) await app.tick();
  await casting;
  assert.equal(app.get("environment").disabled, false);
});

test("Star Wars keeps the same escape, re-capture and saved removal rules", async () => {
  for (const webgl of [true, false]) {
    const app = createApp(["Alice"], new Map(), { webgl });
    app.get("environment").value = "star-wars";
    app.get("environment").fire("change");
    await app.catchFish(true);
    assert.deepEqual(app.people(), ["Alice"]);
    assert.equal(app.get("result").textContent, "Alice escaped! Back in the sector.");
    await app.catchFish();
    assert.deepEqual(app.people(), []);
    assert.equal(app.get("result").textContent, "Alice was captured!");
    assert.equal(createApp([], app.storage).sceneFish.size, 0);
  }
});

test("Hell's support switches and persists without replacing participants or models", () => {
  const app = createApp(["Alice", "Bob"]);
  const before = app.get("pond").children.slice();
  app.get("environment").value = "hell-support";
  app.get("environment").fire("change");
  assert.equal(app.get("pond").classes.has("hell"), true);
  assert.equal(app.get("pond").classes.has("space"), false);
  assert.equal(app.get("page-title").textContent, "Hell's Customer Support");
  assert.equal(app.get("cast-btn").textContent, "Answer the damned call");
  assert.equal(app.get("history-heading").textContent, "Closed tickets & transfers");
  assert.deepEqual(app.get("pond").children, before);
  assert.equal(before[0].title, "Alice - Three-headed manager");
  assert.deepEqual(app.people(), ["Alice", "Bob"]);
  const reloaded = createApp([], app.storage);
  assert.equal(reloaded.get("environment").value, "hell-support");
  assert.equal(reloaded.get("pond").classes.has("hell"), true);
  for (const value of ["star-wars", "fish-pond"]) {
    app.get("environment").value = value;
    app.get("environment").fire("change");
    assert.equal(app.get("pond").classes.has("hell"), false);
  }
  assert.equal(before[0].title, "Alice - Shark");
});

test("Hell's support keeps escape, re-capture and saved removal in 3D and fallback", async () => {
  for (const webgl of [true, false]) {
    const app = createApp(["Alice"], new Map(), { webgl });
    app.get("environment").value = "hell-support";
    app.get("environment").fire("change");
    await app.catchFish(true);
    assert.deepEqual(app.people(), ["Alice"]);
    assert.equal(app.get("result").textContent, 'Alice shouts "TRANSFER ME!" Back in the queue.');
    assert.match(app.get("history").children[0].textContent, /transferred \(still your problem\)/);
    await app.catchFish();
    assert.deepEqual(app.people(), []);
    assert.equal(app.get("result").textContent, 'Alice says "That solved my problem." HR has been notified.');
    assert.match(app.get("history").children[0].textContent, /ticket closed; two more opened/);
    assert.equal(createApp([], app.storage).sceneFish.size, 0);
    assert.equal(app.get("environment").disabled, false);
  }
});

test("support cast stages are themed and prevent environment changes until completion", async () => {
  const app = createApp(["Alice"]);
  app.get("environment").value = "hell-support";
  app.get("environment").fire("change");
  const casting = app.get("cast-btn").fire("click");
  assert.equal(app.get("environment").disabled, true);
  assert.match(app.get("result").textContent, /two million/);
  app.get("environment").value = "fish-pond";
  app.get("environment").fire("change");
  assert.equal(app.get("environment").value, "hell-support");
  await app.tick();
  assert.match(app.get("result").textContent, /Speak to a real person/);
  await app.tick();
  assert.match(app.get("result").textContent, /real demon/);
  await app.tick();
  assert.match(app.get("result").textContent, /All three heads decline/);
  for (let i = 0; i < 3; i++) await app.tick();
  await casting;
});

test("unknown saved environments safely fall back to Fish Pond", () => {
  const app = createApp([], new Map([["fishing-app-environment", "unknown"]]));
  assert.equal(app.get("environment").value, "fish-pond");
  assert.equal(app.get("page-title").textContent, "Gone Fishing");
});
