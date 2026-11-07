const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

function createPond() {
  let now = 1000;
  const context = {
    window: { matchMedia: () => ({ matches: false }) },
    performance: { now: () => now },
  };
  vm.runInNewContext(readFileSync(resolve(__dirname, "pond.js"), "utf8"), context);
  const pond = new context.window.Pond3D({ getContext: () => null, clientWidth: 650, clientHeight: 460 }, {});
  pond.setTime = (value) => { now = value; };
  return pond;
}

test("participants get distinct clownfish, shark and sea bass models in rotation", () => {
  const pond = createPond();
  const types = ["Alice", "Bob", "Charlie", "Diana"].map((name) => pond.add(name, {}));
  assert.deepEqual(types.map((type) => type.id), ["clownfish", "shark", "sea-bass", "clownfish"]);
  assert.ok(types[1].size[0] > types[0].size[0], "Sharks have a longer silhouette");
  assert.notDeepEqual(Array.from(types[0].color), Array.from(types[2].color));
});

test("escape resets the hook, fight and lift state without replacing the fish", () => {
  const pond = createPond();
  pond.add("Alice", {});
  const fish = pond.fish.get("Alice");
  pond.catch("Alice");
  pond.fight("Alice");
  assert.equal(fish.caught, true);
  assert.equal(fish.fighting, true);
  pond.reel("Alice");
  assert.equal(fish.fighting, false);
  assert.equal(fish.lift, 1000);
  fish.position = [1, 2, 3];
  pond.escape("Alice");
  assert.equal(pond.fish.get("Alice"), fish);
  assert.equal(fish.caught, false);
  assert.equal(fish.fighting, false);
  assert.equal(fish.lift, 0);
  assert.equal(fish.returning.from, fish.position);
  assert.equal(fish.type.id, "clownfish");
  pond.catch("Alice");
  assert.equal(fish.returning, null);
});

test("species have distinct drawing geometry and only clownfish get white bands", () => {
  const pond = createPond();
  pond.sphere = "sphere";
  pond.fin = "tail";
  pond.dorsal = "dorsal";
  const calls = [];
  pond.draw = (...args) => calls.push(args);
  for (const name of ["Nemo", "Shark", "Bass"]) pond.add(name, {});
  for (const [name, fish] of pond.fish) {
    calls.length = 0;
    pond.drawFish(fish, 0, 0, 0, 1, 1, 0.5);
    assert.equal(calls.some((call) => call[5] === 1), name === "Nemo");
    const dorsal = calls.find((call) => call[0] === "dorsal");
    assert.equal(dorsal[2][1], name === "Shark" ? 0.95 : 0.4);
    assert.equal(pond.pose, null);
  }
});

test("casting leaves the fish swimming and places the bait a swim away", () => {
  const pond = createPond();
  const targets = [];
  pond.rig = { lowerTo: (point) => targets.push(point) };
  pond.add("Alice", {});
  const fish = pond.fish.get("Alice");
  pond.updateFish(fish, 1000);
  const before = Array.from(fish.position);
  pond.cast("Alice");
  assert.deepEqual(Array.from(fish.position), before);
  assert.equal(fish.caught, false);
  assert.equal(fish.approaching, undefined);
  assert.ok(Math.abs(pond.castState.hook[0] - before[0]) >= 1);
  assert.equal(targets.length, 1);
  pond.updateFish(fish, 1500);
  assert.notDeepEqual(Array.from(fish.position), before);
});

test("fish swim continuously to the bait and their mouths meet it before biting", () => {
  for (const index of [0, 1, 2]) {
    const pond = createPond();
    for (let i = 0; i <= index; i++) pond.add(String(i), {});
    const fish = pond.fish.get(String(index));
    pond.updateFish(fish, 1000);
    pond.cast(String(index));
    pond.approach(String(index));
    const from = Array.from(fish.position);
    pond.updateFish(fish, 1000);
    assert.deepEqual(Array.from(fish.position), from, "Approach starts without teleporting");
    pond.updateFish(fish, 1600);
    assert.notDeepEqual(Array.from(fish.position), from);
    assert.equal(fish.caught, false);
    pond.updateFish(fish, 2200);
    const mouthX = fish.position[0] + fish.turn * pond.mouthOffset(fish);
    assert.ok(Math.abs(mouthX - pond.castState.hook[0]) < 0.000001);
    assert.ok(Math.abs(fish.position[1] + 0.03 - pond.castState.hook[1]) < 0.000001);
  }
});

test("biting does not jump the fish from its final approach position", () => {
  const pond = createPond();
  pond.add("Alice", {});
  const fish = pond.fish.get("Alice");
  pond.updateFish(fish, 1000);
  pond.cast("Alice");
  pond.approach("Alice");
  pond.setTime(2200);
  pond.updateFish(fish, 2200);
  const arrived = Array.from(fish.position);
  pond.catch("Alice");
  assert.equal(fish.caught, true);
  assert.equal(fish.approaching, null);
  pond.updateFish(fish, 2210);
  assert.deepEqual(Array.from(fish.position), arrived);
});

test("environment is a visual switch: identical positions, targets and fight physics", () => {
  const pond = createPond();
  const space = createPond();
  for (const scene of [pond, space]) {
    scene.add("Alice", {});
    scene.fish.get("Alice").phase = 1;
  }
  space.setEnvironment("star-wars");
  for (const scene of [pond, space]) {
    const fish = scene.fish.get("Alice");
    scene.updateFish(fish, 1000);
    scene.cast("Alice");
    scene.approach("Alice");
    scene.updateFish(fish, 2200);
    scene.setTime(2200);
    scene.catch("Alice");
    scene.fight("Alice");
    scene.updateFish(fish, 2600);
  }
  assert.deepEqual(Array.from(pond.castState.hook), Array.from(space.castState.hook));
  assert.deepEqual(Array.from(pond.fish.get("Alice").position), Array.from(space.fish.get("Alice").position));
  const fish = space.fish.get("Alice");
  space.setEnvironment("fish-pond");
  assert.equal(space.fish.get("Alice"), fish);
  assert.equal(fish.fighting, true);
});

test("spacecraft use distinct mechanical meshes instead of fish fins and bands", () => {
  const scene = createPond();
  scene.sphere = "sphere";
  scene.cube = "cube";
  scene.destroyer = "destroyer";
  const calls = [];
  scene.draw = (...args) => calls.push(args);
  for (const name of ["X-wing", "Destroyer", "TIE"]) scene.add(name, {});
  for (const [name, fish] of scene.fish) {
    calls.length = 0;
    scene.drawShip(fish, 0, 0, 0, 1, 1, 0.5);
    assert.ok(calls.some((call) => call[0] === "cube"));
    assert.equal(calls.some((call) => call[0] === "destroyer"), name === "Destroyer");
    assert.equal(calls.some((call) => call[5] === 1), false);
    assert.equal(scene.pose, null);
  }
});

test("support callers have ghost, three-headed manager and printer geometry", () => {
  const scene = createPond();
  scene.sphere = "sphere";
  scene.cube = "cube";
  scene.dorsal = "horn";
  const calls = [];
  scene.draw = (...args) => calls.push(args);
  for (const name of ["Ghost", "Manager", "Printer"]) scene.add(name, {});
  const models = [];
  for (const [name, fish] of scene.fish) {
    calls.length = 0;
    scene.drawCaller(fish, 0, 0, 0, 1, 1, 0.5);
    assert.equal(calls.filter((call) => call[0] === "horn").length, name === "Manager" ? 6 : 0);
    assert.ok(calls.every((call) => call[0] !== undefined));
    assert.equal(calls.some((call) => call[5] === 1), false);
    assert.equal(scene.pose, null);
    models.push(JSON.stringify(calls));
  }
  assert.equal(new Set(models).size, 3);
});

test("Hell's support preserves targets, approach and struggle physics for every species", () => {
  for (const name of ["Ghost", "Manager", "Printer"]) {
    const scenes = [createPond(), createPond()];
    scenes[1].setEnvironment("hell-support");
    assert.equal(scenes[1].environment, "hell-support");
    for (const scene of scenes) {
      for (const caller of ["Ghost", "Manager", "Printer"]) scene.add(caller, {});
      const fish = scene.fish.get(name);
      fish.phase = 1;
      scene.updateFish(fish, 1000);
      scene.cast(name);
      scene.approach(name);
      scene.updateFish(fish, 2200);
      scene.setTime(2200);
      scene.catch(name);
      scene.fight(name);
      scene.updateFish(fish, 2600);
    }
    assert.deepEqual(Array.from(scenes[0].castState.hook), Array.from(scenes[1].castState.hook));
    assert.deepEqual(Array.from(scenes[0].fish.get(name).position), Array.from(scenes[1].fish.get(name).position));
  }
});
