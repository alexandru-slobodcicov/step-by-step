const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

function createRig(reducedMotion = false) {
  const makeElement = (bounds) => {
    const classes = new Set();
    return {
      classes, style: {}, attributes: {}, bounds,
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
      },
      getBoundingClientRect() { return this.bounds; },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
  };
  const pond = makeElement({ left: 10, top: 10 });
  const elements = {
    "#rod-tip": makeElement({ left: 110, top: 20, width: 4, height: 4 }),
    "#blaster-tip": makeElement({ left: 90, top: 60, width: 6, height: 6 }),
    "#pitchfork-tip": makeElement({ left: 120, top: 40, width: 6, height: 6 }),
    "#line": makeElement(),
    "#fishing-wire": makeElement(),
    "#wire-path": makeElement(),
  };
  pond.querySelector = (selector) => elements[selector];
  const context = {
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => {},
  };
  vm.runInNewContext(readFileSync(resolve(__dirname, "rig.js"), "utf8"), context);
  return { rig: new context.window.FishingRig(pond), pond, elements };
}

test("wire starts at the fisherman's rod and lowers progressively, not instantly", () => {
  const { rig, elements } = createRig();
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(1000);
  assert.equal(rig.position.x, 102);
  assert.equal(rig.position.y, 12);
  rig.frame(1600);
  assert.equal(rig.position.x, 260);
  assert.ok(rig.position.y > 12 && rig.position.y < 240);
  assert.ok(elements["#wire-path"].attributes.d.startsWith("M 102 12 "));
  rig.frame(2200);
  assert.equal(rig.position.y, 240);
  assert.equal(rig.lowering, false);
  assert.equal(elements["#line"].style.top, "240px");
});

test("line tracks the fish after biting and stays attached to the rod on resize", () => {
  const { rig, elements } = createRig();
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(2200);
  rig.aim({ x: 280, y: 190 });
  elements["#rod-tip"].bounds.left = 150;
  rig.frame(2300);
  assert.equal(rig.position.x, 280);
  assert.equal(rig.position.y, 190);
  assert.ok(elements["#wire-path"].attributes.d.startsWith("M 142 12 "));
});

test("escape or a finished catch hides both hook and wire", () => {
  const { rig, pond, elements } = createRig();
  rig.lowerTo({ x: 260, y: 240 });
  rig.reset();
  assert.equal(rig.active, false);
  assert.equal(pond.classes.has("casting"), false);
  assert.equal(elements["#line"].classes.has("active"), false);
  assert.equal(elements["#fishing-wire"].classes.has("active"), false);
});

test("reduced motion skips the lowering animation", () => {
  const { rig } = createRig(true);
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(1000);
  assert.equal(rig.position.x, 260);
  assert.equal(rig.position.y, 240);
});

test("space beam starts at the robot's blaster and switching back restores the rod", () => {
  const { rig, elements } = createRig();
  rig.setEnvironment("star-wars");
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(2200);
  assert.ok(elements["#wire-path"].attributes.d.startsWith("M 83 53 L "));
  rig.reset();
  rig.setEnvironment("fish-pond");
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(2200);
  assert.ok(elements["#wire-path"].attributes.d.startsWith("M 102 12 Q "));
});

test("support badge lowers from the demon's pitchfork with a curved lanyard", () => {
  const { rig, elements } = createRig();
  rig.setEnvironment("hell-support");
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(2200);
  assert.ok(elements["#wire-path"].attributes.d.startsWith("M 113 33 Q "));
  assert.equal(rig.position.y, 240);
  rig.reset();
  rig.setEnvironment("fish-pond");
  rig.lowerTo({ x: 260, y: 240 });
  rig.frame(2200);
  assert.ok(elements["#wire-path"].attributes.d.startsWith("M 102 12 Q "));
});
