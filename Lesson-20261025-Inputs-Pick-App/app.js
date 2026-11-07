(() => {
  const STORAGE_KEY = "fishing-app-people";
  const ESCAPE_CHANCE = 30;
  const SHIPS = { clownfish: "X-wing", shark: "Star Destroyer", "sea-bass": "TIE fighter" };
  const CALLERS = { clownfish: "Furious ghost", shark: "Three-headed manager", "sea-bass": "Possessed printer" };
  const validEnvironment = (value) => ["star-wars", "hell-support"].includes(value) ? value : "fish-pond";

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $("add-form"),
    nameInput: $("name-input"),
    bulkInput: $("bulk-input"),
    bulkAdd: $("bulk-add"),
    list: $("people-list"),
    count: $("count"),
    sound: $("sound-btn"),
    empty: $("pond-empty"),
    cast: $("cast-btn"),
    clear: $("clear-btn"),
    pond: $("pond"),
    result: $("result"),
    history: $("history"),
    environment: $("environment"),
    heading: $("page-title"),
    description: $("page-description"),
    hint: $("game-hint"),
  };

  let people = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  let fishEls = new Map();
  let casting = false;
  let environment = validEnvironment(localStorage.getItem("fishing-app-environment"));
  const sound = new PondSound();
  const rig = new FishingRig(els.pond);
  const scene = new Pond3D($("pond-canvas"), els.pond, rig);
  els.pond.classList.toggle("is-3d", scene.available);
  const themed = (pond, space, hell = pond) => environment === "hell-support" ? hell : environment === "star-wars" ? space : pond;

  function applyEnvironment() {
    const space = environment === "star-wars";
    const hell = environment === "hell-support";
    els.environment.value = environment;
    els.pond.classList.toggle("space", space);
    document.body.classList.toggle("space-theme", space);
    els.pond.classList.toggle("hell", hell);
    document.body.classList.toggle("hell-theme", hell);
    scene.setEnvironment(environment);
    rig.setEnvironment(environment);
    sound.environment = environment;
    els.heading.textContent = themed("Gone Fishing", "Galactic Catch", "Hell's Customer Support");
    els.description.textContent = themed(
      "Add participants, cast the line, and see who gets caught!",
      "Assemble your fleet. Let R2-D2 bring in a lucky pilot.",
      "Your suffering is important to us. Please remain on the line. Forever."
    );
    els.hint.textContent = themed(
      "Sharks, sea bass & clownfish all put up a fight! A 30% chance to escape; landed fish leave the pond for good.",
      "X-wings, Star Destroyers & TIE fighters resist capture! A 30% chance to escape; captured ships leave the sector for good.",
      "Ghosts, possessed printers & three-headed managers are on hold. A 30% chance of transfer; resolved callers leave the queue for good."
    );
    els.pond.setAttribute("aria-label", themed(
      "A fisherman casting into a 3D pond of participant fish",
      "R2-D2 using a tractor blaster in a star-filled galaxy of participant spacecraft",
      "A headset-wearing junior demon fishing callers from a lava lake surrounded by cubicles"
    ));
    document.querySelector(".pond-badge").textContent = `${themed("LIVE POND", "STAR WARS", "ETERNAL HOLD")} / ${scene.available ? "3D" : "2D FALLBACK"}`;
    $("history-heading").textContent = themed("Catch history", "Catch history", "Closed tickets & transfers");
    els.empty.innerHTML = themed(
      "Your next catch starts here.<br /><small>Add names to bring the pond to life.</small>",
      "A galaxy of possibilities.<br /><small>Add names to launch your fleet.</small>",
      "No callers on hold. Suspicious.<br /><small>Add names. Misery loves a waiting list.</small>"
    );
  }

  function renderSound() {
    els.sound.textContent = `Sound: ${sound.muted ? "off" : "on"}`;
    els.sound.setAttribute("aria-pressed", String(sound.muted));
    els.sound.setAttribute("aria-label", sound.muted ? "Unmute sound" : "Mute sound");
  }

  // Unbiased random integer in [0, max) using the Web Crypto API.
  function randomInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % max;
  }

  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(people));

  function addPeople(names) {
    if (casting) return;
    const existing = new Set(people.map((p) => p.toLowerCase()));
    names
      .map((n) => n.trim())
      .filter(Boolean)
      .forEach((n) => {
        if (!existing.has(n.toLowerCase())) {
          people.push(n);
          existing.add(n.toLowerCase());
        }
      });
    save();
    render();
    sound.play("add");
  }

  function removePerson(name) {
    if (casting) return;
    people = people.filter((p) => p !== name);
    save();
    render();
  }

  function render() {
    els.list.innerHTML = "";
    people.forEach((name) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = name;
      const btn = document.createElement("button");
      btn.textContent = "x";
      btn.title = `Remove ${name}`;
      btn.setAttribute("aria-label", `Remove ${name}`);
      btn.disabled = casting;
      btn.addEventListener("click", () => removePerson(name));
      li.append(span, btn);
      els.list.appendChild(li);
    });
    els.count.textContent = `${people.length} participant${people.length === 1 ? "" : "s"} ${themed("in the pond", "in the sector", "on eternal hold")}`;
    els.cast.disabled = casting || people.length === 0;
    els.clear.disabled = casting || people.length === 0;
    els.nameInput.disabled = casting;
    els.bulkInput.disabled = casting;
    els.bulkAdd.disabled = casting;
    els.environment.disabled = casting;
    els.form.querySelector("button").disabled = casting;
    els.empty.hidden = people.length > 0;
    els.cast.textContent = casting ? themed("Fishing...", "Capturing...", "Escalating...") : themed("Cast the line", "Activate blaster", "Answer the damned call");
    renderPond();
  }

  function randomPosition() {
    const { clientWidth: w, clientHeight: h } = els.pond;
    return { x: 20 + randomInt(Math.max(1, w - 160)), y: 70 + randomInt(Math.max(1, h - 160)) };
  }

  function renderPond() {
    for (const [name, el] of fishEls) {
      if (!people.includes(name)) {
        el.remove();
        fishEls.delete(name);
        scene.remove(name);
      }
    }
    people.forEach((name) => {
      if (fishEls.has(name)) return;
      const el = document.createElement("div");
      el.className = "fish";
      const body = document.createElement("span");
      body.className = "body";
      body.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = name;
      el.append(body, label);
      const { x, y } = randomPosition();
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      els.pond.appendChild(el);
      fishEls.set(name, el);
      const type = scene.add(name, el);
      el.classList.add(type.id);
      el.dataset.species = type.id;
      el.dataset.fishLabel = type.label;
    });
    for (const [name, el] of fishEls) {
      el.title = `${name} - ${themed(el.dataset.fishLabel, SHIPS[el.dataset.species], CALLERS[el.dataset.species])}`;
    }
  }

  function swim() {
    if (casting || scene.available) return;
    for (const el of fishEls.values()) {
      const { x, y } = randomPosition();
      el.classList.toggle("flip", x > parseFloat(el.style.left));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function cast() {
    if (casting || people.length === 0) return;
    casting = true;
    sound.play("cast");
    render();
    els.result.className = "result";
    els.result.textContent = themed("Casting the line...", "Deploying the tractor beam...", "You are caller number... two million. Casting the ID badge...");

    const winner = people[randomInt(people.length)];
    const fish = fishEls.get(winner);
    let hook;
    if (scene.available) {
      scene.cast(winner);
    } else {
      const pondBounds = els.pond.getBoundingClientRect();
      const bounds = fish.getBoundingClientRect();
      const x = bounds.left - pondBounds.left;
      hook = {
        x: x + 100 < els.pond.clientWidth - 40 ? x + 100 : Math.max(35, x - 65),
        y: Math.min(els.pond.clientHeight - 40, Math.max(150, bounds.top - pondBounds.top + 10)),
      };
      rig.lowerTo(hook);
    }
    await wait(1300);
    els.result.textContent = themed("A fish is swimming toward the bait...", "A ship is approaching the tractor beacon...", 'Someone spotted the bait: "Speak to a real person."');
    if (scene.available) {
      scene.approach(winner);
    } else {
      // Freeze the current interpolated position before starting a new swim.
      const pondBounds = els.pond.getBoundingClientRect();
      const bounds = fish.getBoundingClientRect();
      const bodyWidth = fish.querySelector(".body").getBoundingClientRect().width;
      const turn = hook.x > bounds.left - pondBounds.left + bodyWidth / 2 ? 1 : -1;
      fish.style.transition = "none";
      fish.style.left = `${bounds.left - pondBounds.left}px`;
      fish.style.top = `${bounds.top - pondBounds.top}px`;
      void fish.offsetWidth;
      fish.classList.add("approaching");
      fish.classList.toggle("flip", turn < 0);
      fish.style.transition = "";
      fish.style.left = `${hook.x - (turn > 0 ? bodyWidth : 0)}px`;
      fish.style.top = `${hook.y - 10}px`;
    }
    await wait(1200);
    fish.classList.remove("approaching");
    scene.catch(winner);
    els.result.textContent = themed("Something's biting...", "Tractor lock acquired...", '"Finally! A real demon!"');
    sound.play("bite");
    await wait(400);

    fish.classList.add("fighting");
    els.pond.classList.add("fighting");
    scene.fight(winner);
    els.result.textContent = `${winner} ${themed("is fighting the hook!", "is fighting the tractor beam!", "demands a manager! All three heads decline.")}`;
    sound.play("fight");
    await wait(2600 + randomInt(1000));
    fish.classList.remove("fighting");
    els.pond.classList.remove("fighting");

    if (randomInt(100) < ESCAPE_CHANCE) {
      scene.escape(winner);
      fish.classList.add("escaped");
      rig.reset();
      els.result.className = "result escape";
      els.result.textContent = `${winner} ${themed("escaped! Back in the pond.", "escaped! Back in the sector.", 'shouts "TRANSFER ME!" Back in the queue.')}`;
      sound.play("escape");
      const li = document.createElement("li");
      li.className = "escape";
      li.textContent = `${winner} - ${themed("escaped", "escaped", "transferred (still your problem)")} - ${new Date().toLocaleTimeString()}`;
      els.history.prepend(li);
      await wait(1000);
      fish.classList.remove("escaped");
      casting = false;
      render();
      swim();
      return;
    }

    // Reel in.
    fish.classList.add("caught");
    scene.reel(winner);
    sound.play("reel");
    for (const el of fishEls.values()) if (el !== fish) el.classList.add("faded");
    if (!scene.available) {
      rig.raiseTo({ x: hook.x, y: 20 });
      fish.style.top = "10px";
    }
    await wait(1300);

    els.result.className = "result win";
    els.result.textContent = `${winner} ${themed("got caught!", "was captured!", 'says "That solved my problem." HR has been notified.')}`;
    sound.play("win");
    const li = document.createElement("li");
    li.textContent = `${winner} - ${themed("", "", "ticket closed; two more opened - ")}${new Date().toLocaleTimeString()}`;
    els.history.prepend(li);

    // Persist the catch at reveal, so a reload cannot put the fish back.
    people = people.filter((name) => name !== winner);
    save();
    render();
    await wait(2000);
    for (const el of fishEls.values()) el.classList.remove("faded");
    rig.reset();
    casting = false;
    render();
    swim();
  }

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    addPeople([els.nameInput.value]);
    els.nameInput.value = "";
    els.nameInput.focus();
  });

  els.bulkAdd.addEventListener("click", () => {
    addPeople(els.bulkInput.value.split(/[\n,]/));
    els.bulkInput.value = "";
  });

  els.clear.addEventListener("click", () => {
    if (casting) return;
    if (!confirm("Remove all participants?")) return;
    people = [];
    save();
    render();
  });

  els.cast.addEventListener("click", cast);
  els.environment.addEventListener("change", () => {
    if (casting) {
      els.environment.value = environment;
      return;
    }
    environment = validEnvironment(els.environment.value);
    localStorage.setItem("fishing-app-environment", environment);
    applyEnvironment();
    render();
  });
  els.sound.addEventListener("click", () => {
    sound.toggle();
    renderSound();
    if (!sound.muted) sound.play("add");
  });

  renderSound();
  applyEnvironment();
  render();
  setInterval(swim, 2600);
})();
