(() => {
  "use strict";

  const dialog = document.getElementById("game-dialog");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const score = document.getElementById("game-score");
  const message = document.getElementById("game-message");
  const pauseButton = document.getElementById("game-pause");
  const audio = new window.ArcadeAudio(document.getElementById("game-sound"));
  const keys = new Set();
  const touchKeys = new Set();
  const worldWidth = 3400;
  const groundY = 416;
  const platforms = [
    { x: 0, y: groundY, w: 1000, h: 64 },
    { x: 1110, y: groundY, w: 1010, h: 64 },
    { x: 2240, y: groundY, w: 1160, h: 64 },
    { x: 260, y: 310, w: 160, h: 24 },
    { x: 500, y: 240, w: 160, h: 24 },
    { x: 790, y: 310, w: 130, h: 24 },
    { x: 1290, y: 310, w: 160, h: 24 },
    { x: 1540, y: 235, w: 150, h: 24 },
    { x: 1840, y: 310, w: 150, h: 24 },
    { x: 2380, y: 310, w: 160, h: 24 },
    { x: 2640, y: 240, w: 150, h: 24 },
    { x: 2900, y: 310, w: 140, h: 24 }
  ];
  const coinPositions = [
    [180, 360], [330, 270], [575, 200], [850, 270],
    [1190, 360], [1360, 270], [1610, 195], [1910, 270],
    [2310, 360], [2450, 270], [2710, 200], [2970, 270]
  ];
  // A small, hand-drawn sprite: red cap, moustache, blue overalls.
  const sprite = [
    ".....RRRRRR.....", "....RRRRRRRRRR..",
    "....HHHSSK......", "...HSHSSSKSS....",
    "...HSHHSSSKSS...", "....HSSSSKKKK...",
    ".....SSSSSS.....", "....RRBRBR......",
    "...RRRBRBRRR....", "..RRRRBBBBRRRR..",
    "..SSRBGBGBRSSS..", "..SSSBBBBBBSSS..",
    "....BBBBBBBB....", "....BBBBBBBB....",
    "....BBB..BBB....", "...BBB....BBB...",
    "..HHHH....HHHH..", ".HHHHH....HHHHH."
  ];
  const palette = { R: "#df4337", H: "#663d2a", S: "#ffd19a", K: "#342d29", B: "#2b65c4", G: "#ffda68" };
  let player, coins, enemies, camera, lives, state = "ready";
  let frame = 0;
  let lastTime = 0;
  let jumpQueued = false;
  let coyoteTime = 0;

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateScore() {
    score.textContent = `Monede: ${coins.filter(coin => coin.taken).length} / ${coins.length} \u00b7 Vieti: ${lives}`;
  }

  function resetPlayer() {
    player = { x: 60, y: groundY - 36, w: 32, h: 36, vx: 0, vy: 0, grounded: true, facing: 1, invincible: 1.5 };
    camera = 0;
    coyoteTime = 0;
    jumpQueued = false;
    keys.clear();
    touchKeys.clear();
  }

  function restart() {
    audio.stop();
    audio.unlock();
    lives = 3;
    coins = coinPositions.map(([x, y]) => ({ x, y, w: 18, h: 22, taken: false }));
    enemies = [
      { x: 580, min: 460, max: 800 },
      { x: 1450, min: 1180, max: 1730 },
      { x: 1940, min: 1770, max: 2050 },
      { x: 2540, min: 2300, max: 2790 },
      { x: 3040, min: 2880, max: 3170 }
    ].map(enemy => ({ ...enemy, y: groundY - 28, w: 30, h: 28, vx: -65, alive: true }));
    resetPlayer();
    state = "playing";
    pauseButton.textContent = "Pauza";
    message.textContent = "Aduna monede, sari peste inamici si ajungi la steag!";
    updateScore();
    canvas.focus();
    audio.play("start");
  }

  function loseLife() {
    lives--;
    updateScore();
    if (lives <= 0) {
      audio.play("lose");
      state = "lost";
      keys.clear();
      touchKeys.clear();
      message.textContent = "Ai ramas fara vieti. Apasa R sau Reincepe pentru o noua aventura.";
    } else {
      audio.play("hurt");
      resetPlayer();
      message.textContent = "Mai incearca! Sari pe inamici pentru a-i elimina.";
    }
  }

  function togglePause() {
    if (state !== "playing" && state !== "paused") return;
    state = state === "playing" ? "paused" : "playing";
    if (state === "paused") audio.stop();
    else audio.unlock();
    keys.clear();
    touchKeys.clear();
    jumpQueued = false;
    pauseButton.textContent = state === "paused" ? "Continua" : "Pauza";
    message.textContent = state === "paused" ? "Pauza. Apasa P sau Continua." : "Aduna monede si ajungi la steag!";
  }

  function update(dt) {
    if (state !== "playing") return;
    player.invincible = Math.max(0, player.invincible - dt);
    const left = keys.has("ArrowLeft") || keys.has("KeyA") || touchKeys.has("left");
    const right = keys.has("ArrowRight") || keys.has("KeyD") || touchKeys.has("right");
    player.vx = (Number(right) - Number(left)) * 260;
    if (player.vx) player.facing = Math.sign(player.vx);
    coyoteTime = player.grounded ? 0.09 : Math.max(0, coyoteTime - dt);
    if (jumpQueued && (player.grounded || coyoteTime > 0)) {
      player.vy = -660;
      audio.play("jump");
      player.grounded = false;
      coyoteTime = 0;
    }
    jumpQueued = false;
    player.x = Math.max(0, Math.min(worldWidth - player.w, player.x + player.vx * dt));
    for (const platform of platforms) {
      if (!overlaps(player, platform)) continue;
      if (player.vx > 0) player.x = platform.x - player.w;
      else if (player.vx < 0) player.x = platform.x + platform.w;
    }
    const oldY = player.y;
    player.vy = Math.min(player.vy + 1700 * dt, 850);
    player.y += player.vy * dt;
    player.grounded = false;
    for (const platform of platforms) {
      if (!overlaps(player, platform)) continue;
      if (player.vy >= 0 && oldY + player.h <= platform.y + 1) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.grounded = true;
      } else if (player.vy < 0 && oldY >= platform.y + platform.h - 1) {
        player.y = platform.y + platform.h;
        player.vy = 0;
      }
    }
    for (const coin of coins) {
      if (!coin.taken && overlaps(player, coin)) {
        coin.taken = true;
        audio.play("coin");
        updateScore();
      }
    }
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.x += enemy.vx * dt;
      if (enemy.x <= enemy.min || enemy.x >= enemy.max) {
        enemy.x = Math.max(enemy.min, Math.min(enemy.max, enemy.x));
        enemy.vx *= -1;
      }
      if (!overlaps(player, enemy)) continue;
      if (player.vy > 0 && oldY + player.h <= enemy.y + 12) {
        enemy.alive = false;
        audio.play("stomp");
        player.vy = -420;
      } else if (player.invincible <= 0) {
        loseLife();
        return;
      }
    }
    if (player.y > 560) {
      loseLife();
      return;
    }
    if (player.x >= 3240) {
      state = "won";
      audio.play("win");
      message.textContent = `Ai castigat! Ai adunat ${coins.filter(coin => coin.taken).length} din ${coins.length} monede. Apasa R pentru o noua aventura.`;
    }
    camera = Math.max(0, Math.min(worldWidth - canvas.width, player.x - 300));
  }

  function rect(color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function drawPlayer(time) {
    if (player.invincible > 0 && Math.floor(time / 90) % 2) return;
    ctx.save();
    ctx.translate(Math.round(player.x + 16), Math.round(player.y));
    ctx.scale(player.facing, 1);
    const stride = player.grounded && player.vx ? Math.sin(time / 65) * 2 : 0;
    sprite.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel !== ".") rect(palette[pixel], x * 2 - 16 + (y > 13 ? stride : 0), y * 2, 2, 2);
    }));
    ctx.restore();
  }

  function draw(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    rect("#a7dce7", 0, 0, 960, 480);
    ctx.save();
    ctx.translate(-Math.round(camera * 0.25), 0);
    for (let x = 0; x < worldWidth; x += 410) {
      rect("#eaf5e6", x + 100, 66, 112, 27);
      rect("#eaf5e6", x + 124, 48, 62, 56);
      ctx.fillStyle = "#8ebf9b";
      ctx.beginPath();
      ctx.moveTo(x - 130, groundY);
      ctx.lineTo(x + 130, 210);
      ctx.lineTo(x + 390, groundY);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(-Math.round(camera), 0);
    for (const platform of platforms) {
      const ground = platform.y === groundY;
      rect(ground ? "#a9774d" : "#bf7848", platform.x, platform.y, platform.w, platform.h);
      rect(ground ? "#59864c" : "#e6b46c", platform.x, platform.y, platform.w, 7);
      for (let x = platform.x; x < platform.x + platform.w - 8; x += 32) {
        rect(ground ? "#835c3d" : "#955b38", x + 8, platform.y + 16, 18, 3);
      }
    }
    for (const coin of coins) {
      if (coin.taken) continue;
      const y = coin.y + Math.sin(time / 180 + coin.x) * 3;
      rect("#b97b23", coin.x + 3, y, 12, 22);
      rect("#ffdc65", coin.x, y + 3, 18, 16);
      rect("#fff0a3", coin.x + 5, y + 4, 4, 13);
      rect("#dba13d", coin.x + 12, y + 4, 3, 13);
    }
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      rect("#8a4f37", enemy.x + 5, enemy.y, 20, 6);
      rect("#a96540", enemy.x, enemy.y + 6, 30, 15);
      rect("#ffedcd", enemy.x + 5, enemy.y + 7, 7, 9);
      rect("#ffedcd", enemy.x + 18, enemy.y + 7, 7, 9);
      rect("#302c29", enemy.x + 9, enemy.y + 10, 3, 5);
      rect("#302c29", enemy.x + 18, enemy.y + 10, 3, 5);
      const step = Math.sin(time / 100) * 2;
      rect("#463b2e", enemy.x - step, enemy.y + 22, 12, 6);
      rect("#463b2e", enemy.x + 18 + step, enemy.y + 22, 12, 6);
    }
    rect("#f6ebc8", 3260, 176, 5, 240);
    rect("#df4337", 3265, 184, 65, 42);
    rect("#e8bd61", 3255, 166, 15, 12);
    drawPlayer(time);
    ctx.restore();
    if (state === "paused" || state === "won" || state === "lost") {
      rect("#173b35c9", 0, 0, 960, 480);
      ctx.fillStyle = "#fff1c9";
      ctx.textAlign = "center";
      ctx.font = "bold 46px Georgia";
      ctx.fillText(state === "won" ? "Ai castigat!" : state === "lost" ? "Mai incearca!" : "Pauza", 480, 222);
      ctx.font = "18px Trebuchet MS";
      ctx.fillText(state === "paused" ? "P sau Continua pentru a reveni" : "R sau Reincepe pentru o noua aventura", 480, 263);
    }
  }

  function tick(time) {
    if (!dialog.open) return;
    // Small physics steps prevent tunnelling through platforms on slow frames.
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

  document.getElementById("play-game").addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    restart();
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  });
  document.getElementById("game-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    audio.stop();
    cancelAnimationFrame(frame);
    keys.clear();
    touchKeys.clear();
    state = "ready";
    document.getElementById("play-game").focus();
  });
  document.getElementById("game-restart").addEventListener("click", restart);
  pauseButton.addEventListener("click", togglePause);

  const movementKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "KeyA", "KeyD", "KeyW", "Space"];
  const jumpKeys = ["ArrowUp", "KeyW", "Space"];
  window.addEventListener("keydown", event => {
    if (!dialog.open) return;
    // Preserve Enter/Space activation of dialog buttons.
    if (event.target instanceof HTMLButtonElement && (event.code === "Space" || event.code === "Enter")) return;
    if (movementKeys.includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
      if (jumpKeys.includes(event.code) && !event.repeat && state === "playing") jumpQueued = true;
    }
    if (event.repeat) return;
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyR") restart();
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    touchKeys.clear();
    if (dialog.open && state === "playing") togglePause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dialog.open && state === "playing") togglePause();
  });
  document.querySelectorAll("[data-game-key]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const key = button.dataset.gameKey;
      touchKeys.add(key);
      if (key === "jump" && state === "playing") jumpQueued = true;
    });
    const release = () => touchKeys.delete(button.dataset.gameKey);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", event => event.preventDefault());
  });
})();
