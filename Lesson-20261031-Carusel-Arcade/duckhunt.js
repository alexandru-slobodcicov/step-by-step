(() => {
  "use strict";

  const dialog = document.getElementById("duckhunt-dialog");
  const canvas = document.getElementById("duckhunt-canvas");
  const ctx = canvas.getContext("2d");
  const scoreLabel = document.getElementById("duckhunt-score");
  const message = document.getElementById("duckhunt-message");
  const pauseButton = document.getElementById("duckhunt-pause");
  const audio = new window.ArcadeAudio(document.getElementById("duckhunt-sound"));
  const keys = new Set();
  const aim = { x: 480, y: 230 };
  let ducks = [], history = [];
  let state = "ready", phase = "flight", dogMood = "waiting";
  let round = 1, points = 0, hits = 0, ammo = 3, timer = 0;
  let elapsed = 0, shotCooldown = 0, shotFlash = 0, resultTime = 0;
  let lastTime = 0, frame = 0;

  function updateScore() {
    scoreLabel.textContent = `Scor: ${points} \u00b7 Runda: ${round} / 10 \u00b7 Cartuse: ${ammo} \u00b7 Rate: ${hits} / 20`;
  }

  function startRound() {
    ammo = 3;
    timer = 8.5 - round * 0.25;
    phase = "flight";
    dogMood = "waiting";
    shotCooldown = 0;
    ducks = [0, 1].map(index => ({
      x: 240 + index * 440, y: 310 + index * 40,
      vx: (index ? -1 : 1) * (125 + round * 12),
      vy: -75 - Math.random() * 55,
      seed: Math.random() * 8, hit: false, falling: false
    }));
    message.textContent = `Runda ${round}: doua rate, trei cartuse. Tinteste si trage!`;
    audio.play("quack");
    updateScore();
  }

  function restart() {
    audio.stop();
    audio.unlock();
    points = 0;
    hits = 0;
    round = 1;
    elapsed = 0;
    history = [];
    keys.clear();
    aim.x = 480;
    aim.y = 230;
    shotFlash = 0;
    state = "playing";
    pauseButton.textContent = "Pauza";
    startRound();
    audio.play("start");
    canvas.focus();
  }

  function finishRound() {
    phase = "result";
    resultTime = 0;
    const caught = ducks.filter(duck => duck.hit).length;
    history.push(...ducks.map(duck => duck.hit));
    dogMood = caught < 2 ? "laugh" : "happy";
    audio.play(dogMood === "laugh" ? "dogLaugh" : "bark");
    message.textContent = caught < 2
      ? `Au scapat ${2 - caught} rate! Cainele rade: ha-ha-ha!`
      : "Doua din doua! Cainele iti aduce ratele. Bravo!";
  }

  function shoot(x, y) {
    if (state !== "playing" || phase !== "flight" || ammo === 0 || shotCooldown > 0) return;
    aim.x = x;
    aim.y = y;
    ammo--;
    shotCooldown = 0.18;
    shotFlash = 0.07;
    audio.play("shot");
    // An elliptical hit area includes the wings and is usable on a phone.
    const target = ducks.find(duck => !duck.hit && ((x - duck.x) / 46) ** 2 + ((y - duck.y) / 34) ** 2 <= 1);
    if (target) {
      target.hit = true;
      target.falling = true;
      hits++;
      points += 100 + round * 25 + Math.floor(timer) * 10;
      audio.play("duckHit");
      message.textContent = "Nimerit!";
    }
    updateScore();
    if (ducks.every(duck => duck.hit)) finishRound();
    else if (ammo === 0) {
      phase = "escape";
      resultTime = 0;
      message.textContent = "Fara cartuse! Ratele ramase au scapat...";
    }
  }

  function togglePause() {
    if (state !== "playing" && state !== "paused") return;
    state = state === "playing" ? "paused" : "playing";
    keys.clear();
    if (state === "paused") audio.stop();
    else audio.unlock();
    pauseButton.textContent = state === "paused" ? "Continua" : "Pauza";
    message.textContent = state === "paused" ? "Pauza. Apasa P sau Continua." : "Tinteste ratele. Cainele este cu ochii pe tine!";
  }

  function update(dt) {
    if (state !== "playing") return;
    elapsed += dt;
    shotCooldown = Math.max(0, shotCooldown - dt);
    shotFlash = Math.max(0, shotFlash - dt);
    const dx = Number(keys.has("ArrowRight") || keys.has("KeyD")) - Number(keys.has("ArrowLeft") || keys.has("KeyA"));
    const dy = Number(keys.has("ArrowDown") || keys.has("KeyS")) - Number(keys.has("ArrowUp") || keys.has("KeyW"));
    aim.x = Math.max(0, Math.min(canvas.width, aim.x + dx * 450 * dt));
    aim.y = Math.max(0, Math.min(canvas.height, aim.y + dy * 450 * dt));
    for (const duck of ducks) {
      if (duck.falling) {
        duck.y = Math.min(470, duck.y + 360 * dt);
      } else if (phase === "flight") {
        duck.x += duck.vx * dt;
        duck.y += (duck.vy + Math.sin(elapsed * 3 + duck.seed) * 50) * dt;
        if (duck.x < 50 || duck.x > 910) {
          duck.x = Math.max(50, Math.min(910, duck.x));
          duck.vx *= -1;
        }
        if (duck.y < 65 || duck.y > 365) {
          duck.y = Math.max(65, Math.min(365, duck.y));
          duck.vy *= -1;
        }
      } else if (phase === "escape") {
        duck.y -= 350 * dt;
      }
    }
    if (phase === "flight") {
      timer = Math.max(0, timer - dt);
      if (timer === 0) {
        phase = "escape";
        resultTime = 0;
        message.textContent = "Timpul a expirat! Ratele zboara mai departe.";
      }
    } else if (phase === "escape") {
      resultTime += dt;
      if (resultTime >= 1.2) finishRound();
    } else if (phase === "result") {
      resultTime += dt;
      if (resultTime >= 2.6) {
        if (round < 10) {
          round++;
          startRound();
        } else {
          state = hits >= 12 ? "won" : "lost";
          audio.play(state === "won" ? "win" : "lose");
          message.textContent = hits >= 12
            ? `Ai castigat! ${hits} din 20 de rate si ${points} puncte. R pentru o noua partida.`
            : `Ai nimerit ${hits} din 20. Ai nevoie de 12! Apasa R sau Reincepe.`;
        }
      }
    }
  }

  function rect(color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function ellipse(color, x, y, rx, ry) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDuck(duck, time) {
    if (duck.y >= 468 || duck.y < -60) return;
    ctx.save();
    ctx.translate(Math.round(duck.x), Math.round(duck.y));
    ctx.scale(duck.vx < 0 ? -1 : 1, 1);
    if (duck.hit) ctx.rotate(Math.PI / 2);
    const wing = !duck.hit && Math.sin(time / 75 + duck.seed) > 0;
    rect("#293d3b", -28, -8, 50, 28);
    rect("#f5eace", -19, -4, 35, 19);
    rect("#486d65", -20, wing ? -38 : 9, 15, 30);
    rect("#486d65", -33, wing ? -49 : 30, 18, 16);
    rect("#f5eace", -35, wing ? -54 : 40, 16, 9);
    rect("#3b8161", 9, -27, 29, 27);
    rect("#3b8161", 6, -19, 20, 33);
    rect("#f5eace", 8, -2, 19, 5);
    rect("#e8b85a", 36, -16, 20, 8);
    rect("#1c3535", 27, -23, 5, 5);
    rect("#293d3b", -38, -5, 15, 12);
    rect("#d4974e", -6, 20, 14, 5);
    ctx.restore();
  }

  function drawDog(time) {
    if (phase !== "result" && state !== "won" && state !== "lost") return;
    const laughing = dogMood === "laugh";
    const rise = Math.min(1, resultTime / 0.35);
    const bob = laughing ? Math.sin(time / 65) * 4 : Math.sin(time / 200) * 2;
    ctx.save();
    ctx.translate(480, 460 - 140 * rise + bob);
    rect("#b98550", -44, 56, 88, 110);
    rect("#e7c99a", -26, 87, 52, 65);
    rect("#bb8955", -49, 0, 98, 83);
    rect("#654a32", -65, 0, 23, 67);
    rect("#654a32", 42, 0, 23, 67);
    if (laughing) {
      rect("#382f27", -29, 24, 21, 5);
      rect("#382f27", -26, 19, 15, 5);
      rect("#382f27", 8, 24, 21, 5);
      rect("#382f27", 11, 19, 15, 5);
    } else {
      rect("#fff0d4", -28, 17, 16, 22);
      rect("#fff0d4", 12, 17, 16, 22);
      rect("#382f27", -21, 21, 7, 13);
      rect("#382f27", 14, 21, 7, 13);
    }
    rect("#f0d8ad", -36, 40, 72, 34);
    rect("#382f27", -15, 33, 30, 18);
    rect("#573e2e", -23, 59, 46, laughing ? 28 : 14);
    rect("#fff2d3", -19, 59, 38, 8);
    if (laughing) {
      rect("#d19b61", -43, 76, 26, 32);
      rect("#d19b61", 17, 76, 26, 32);
      ctx.fillStyle = "#293f31";
      ctx.font = "bold 22px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText("HA! HA! HA!", 0, -22);
    } else {
      rect("#d19b61", -71, 85, 27, 29);
      rect("#d19b61", 44, 85, 27, 29);
      for (const x of [-85, 85]) {
        ellipse("#586c57", x, 124, 18, 28);
        ellipse("#3b8161", x, 96, 14, 14);
        rect("#e8b85a", x + 10, 94, 13, 6);
      }
    }
    ctx.restore();
  }

  function draw(time) {
    rect("#a3d7df", 0, 0, 960, 540);
    ellipse("#f5edbb", 805, 85, 42, 42);
    for (const x of [110, 415, 670]) {
      rect("#edf2d9", x, 78, 105, 23);
      rect("#edf2d9", x + 24, 61, 57, 47);
    }
    ctx.fillStyle = "#a0bb7a";
    ctx.beginPath();
    ctx.moveTo(0, 425);
    ctx.quadraticCurveTo(240, 230, 460, 425);
    ctx.quadraticCurveTo(720, 220, 960, 425);
    ctx.fill();
    rect("#7b5c3d", 78, 190, 26, 270);
    ellipse("#5a8050", 75, 210, 90, 80);
    ellipse("#658a52", 120, 155, 68, 65);
    ellipse("#5a8050", 30, 143, 60, 65);
    rect("#749451", 0, 434, 960, 106);
    ducks.forEach(duck => drawDuck(duck, time));
    drawDog(time);
    rect("#52763f", 0, 466, 960, 74);
    for (let x = 0; x < 960; x += 22) {
      rect("#52763f", x, 452 + (x % 3) * 3, 7, 18);
      rect("#52763f", x + 9, 459, 5, 13);
    }
    rect("#243e32", 16, 490, 928, 38);
    ctx.font = "bold 13px Trebuchet MS";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f7ebcd";
    ctx.fillText(`RATE ${hits} / 20`, 33, 514);
    for (let i = 0; i < 20; i++) {
      const caught = i < history.length ? history[i] : phase !== "result" && ducks[i - history.length]?.hit;
      const color = caught ? "#f1ce66" : i < history.length ? "#c57d6b" : "#56715c";
      ellipse(color, 218 + i * 24, 509, 7, 7);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#f7ebcd";
    ctx.fillText("MINIM 12 / 20", 925, 514);
    if (phase === "flight") {
      rect("#244d43cc", 755, 20, 185, 37);
      ctx.fillStyle = "#fff1cc";
      ctx.font = "bold 15px Trebuchet MS";
      ctx.fillText(`TIMP: ${timer.toFixed(1)} s`, 924, 45);
    }
    if (phase === "escape") {
      ctx.textAlign = "center";
      ctx.fillStyle = "#344f3e";
      ctx.font = "bold 28px Georgia";
      ctx.fillText("Au scapat!", 480, 100);
    }
    if (state === "playing" && phase === "flight") {
      ctx.strokeStyle = shotFlash > 0 ? "#ffe593" : "#fff9dc";
      ctx.lineWidth = shotFlash > 0 ? 4 : 2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, shotFlash > 0 ? 23 : 14, 0, Math.PI * 2);
      for (const delta of [-1, 1]) {
        ctx.moveTo(aim.x + delta * 8, aim.y);
        ctx.lineTo(aim.x + delta * 24, aim.y);
        ctx.moveTo(aim.x, aim.y + delta * 8);
        ctx.lineTo(aim.x, aim.y + delta * 24);
      }
      ctx.stroke();
    }
    if (state === "paused" || state === "won" || state === "lost") {
      rect("#193c32d9", 0, 0, 960, 540);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff1c9";
      ctx.font = "bold 43px Georgia";
      ctx.fillText(state === "paused" ? "Pauza" : state === "won" ? "Vanator de top!" : "Cainele a ras ultimul!", 480, 240);
      ctx.font = "18px Trebuchet MS";
      ctx.fillText(state === "paused" ? "P / Continua" : `${hits} / 20 rate \u00b7 ${points} puncte \u00b7 R / Reincepe`, 480, 280);
    }
  }

  function tick(time) {
    if (!dialog.open) return;
    let remaining = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      update(step);
      remaining -= step;
    }
    draw(time);
    frame = requestAnimationFrame(tick);
  }

  function pointerPosition(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height))
    };
  }

  canvas.addEventListener("pointermove", event => Object.assign(aim, pointerPosition(event)));
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    canvas.focus();
    const point = pointerPosition(event);
    shoot(point.x, point.y);
  });
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  document.getElementById("play-duckhunt").addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    restart();
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  });
  document.getElementById("duckhunt-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    audio.stop();
    keys.clear();
    state = "ready";
    document.getElementById("play-duckhunt").focus();
  });
  document.getElementById("duckhunt-restart").addEventListener("click", restart);
  pauseButton.addEventListener("click", togglePause);
  const movementKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"];
  window.addEventListener("keydown", event => {
    if (!dialog.open) return;
    if (event.target instanceof HTMLButtonElement && (event.code === "Space" || event.code === "Enter")) return;
    if (movementKeys.includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) shoot(aim.x, aim.y);
    }
    if (event.repeat) return;
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyR") restart();
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    if (dialog.open && state === "playing") togglePause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dialog.open && state === "playing") togglePause();
  });
})();
