const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function createCarousel() {
  const document = {};
  const element = (active = false) => {
    const classes = new Set(active ? ["activ"] : []);
    return {
      attrs: {}, clicks: 0,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      setAttribute(name, value) { this.attrs[name] = value; },
      click() { this.clicks++; },
      focus() { document.activeElement = this; }
    };
  };
  const slides = [element(true), element(), element()];
  const dots = [element(), element(), element()];
  const selectors = Object.fromEntries(
    [".prev", ".next", ".carusel", ".image-count", ".status-number", ".status-title"].map(key => [key, element()])
  );
  document.querySelectorAll = selector => selector === ".slide" ? slides : dots;
  document.querySelector = selector => selectors[selector];
  const context = { document };
  vm.createContext(context);
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { slides, dots, selectors, document };
}

function checkActive(slides, index) {
  assert.deepEqual(slides.map(slide => slide.classList.contains("activ")), slides.map((_, i) => i === index));
}

test("carousel follows the PDF markup and has no separate launch buttons", () => {
  assert.match(html, /class="carusel"/);
  const slides = [...html.matchAll(/<div class="slide(?: activ)?"[^>]*>/g)].map(match => match[0]);
  assert.equal(slides.length, 3);
  for (const [i, id] of ["play-game", "play-pacman", "play-duckhunt"].entries()) {
    assert.ok(slides[i].includes(`id="${id}"`));
    assert.ok(slides[i].includes('role="button"'));
    assert.ok(slides[i].includes('tabindex="0"'));
    assert.ok(slides[i].includes('aria-haspopup="dialog"'));
    assert.doesNotMatch(html, new RegExp(`<button[^>]*id="${id}"`));
  }
  assert.match(html, /\.slide \{ display: none;/);
  assert.match(html, /\.slide\.activ \{ display: block;/);
});

test("next and previous wrap around with exactly one active slide", () => {
  const { slides, selectors } = createCarousel();
  checkActive(slides, 0);
  selectors[".prev"].onclick();
  checkActive(slides, 2);
  selectors[".next"].onclick();
  checkActive(slides, 0);
  selectors[".next"].onclick();
  checkActive(slides, 1);
});

test("dots update the active slide, accessible state and caption", () => {
  const { slides, dots, selectors } = createCarousel();
  dots[2].onclick();
  checkActive(slides, 2);
  assert.equal(dots[2].attrs["aria-current"], "true");
  assert.equal(dots[0].attrs["aria-current"], "false");
  assert.equal(selectors[".status-title"].textContent, "Duck Hunt");
  assert.equal(selectors[".status-number"].textContent, "03 / 03");
});

test("Enter and Space activate each whole slide without reaching game key handlers", () => {
  const { slides } = createCarousel();
  for (const slide of slides) {
    for (const key of ["Enter", " "]) {
      let prevented = false, stopped = false;
      slide.onkeydown({ key, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
      assert.equal(prevented, true);
      assert.equal(stopped, true);
    }
    assert.equal(slide.clicks, 2);
  }
});

test("holding an activation key does not repeatedly launch a game", () => {
  const { slides } = createCarousel();
  slides[0].onkeydown({ key: " ", repeat: true, preventDefault() {}, stopPropagation() {} });
  assert.equal(slides[0].clicks, 0);
});

test("arrow-key navigation moves focus to the newly visible slide", () => {
  const { slides, selectors, document } = createCarousel();
  selectors[".carusel"].onkeydown({ key: "ArrowRight", preventDefault() {} });
  checkActive(slides, 1);
  assert.equal(document.activeElement, slides[1]);
  selectors[".carusel"].onkeydown({ key: "ArrowLeft", preventDefault() {} });
  checkActive(slides, 0);
  assert.equal(document.activeElement, slides[0]);
});
