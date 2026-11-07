(() => {
  "use strict";

  const dialog = document.getElementById("pacman-dialog");
  const canvas = document.getElementById("pacman-canvas");
  const ctx = canvas.getContext("2d");
  const scoreLabel = document.getElementById("pacman-score");
  const message = document.getElementById("pacman-message");
  const pauseButton = document.getElementById("pacman-pause");
  const audio = new window.ArcadeAudio(document.getElementById("pacman-sound"));
  const tile = 24;
  const maze = [
    "#####################",
    "#o........#........o#",
    "#.###.###.#.###.###.#",
    "#...................#",
    "#.###.#.#####.#.###.#",
    "#.....#...#...#.....#",
    "###.#.###.#.###.#.###",
    "#...#..... .....#...#",
    "#.#####.#####.#####.#",
    "#.......#...#.......#",
    "#####.#.#.#.#.#.#####",
    "#.....#...#...#.....#",
    "#.###.###.#.###.###.#",
    "#...#...........#...#",
    "###.#.#.#####.#.#.###",
    "#.....#...#...#.....#",
    "#.#######.#.#######.#",
    "#......... .........#",
    "#.###.#.#####.#.###.#",
    "#...#.#...#...#.#...#",
    "###.#.###.#.###.#.###",
    "#o.................o#",
    "#####################"
  ];
  const directions = {
    left: { x: -1, y: 0, angle: Math.PI },
    right: { x: 1, y: 0, angle: 0 },
    up: { x: 0, y: -1, angle: -Math.PI / 2 },
    down: { x: 0, y: 1, angle: Math.PI / 2 }
  };
  const keyDirections = {
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down"
  };
  let player, ghosts, pellets, points, lives, power, invincible;
  let state = "ready", wanted = "left", elapsed = 0;
  let playerTimer = 0, ghostTimer = 0, frame = 0, lastTime = 0;

  function walkable(x, y) {
    return y >= 0 && y < maze.length && x >= 0 && x < maze[0].length && maze[y][x] !== "#";
  }

  function canMove(actor, direction) {
    const delta = directions[direction];
    return walkable(actor.x + delta.x, actor.y + delta.y);
  }

  function updateScore() {
    scoreLabel.textContent = `Scor: ${points} \u00b7 Vieti: ${lives} \u00b7 Puncte ramase: ${pellets.size}`;
  }

  function resetActors() {
    player = { x: 10, y: 17, direction: "left" };
    ghosts = [
      { x: 10, y: 7, color: "#ed8278" },
      { x: 9, y: 7, color: "#efb1cf" },
      { x: 11, y: 7, color: "#8cd3c9" }
    ].map(ghost => ({ ...ghost, homeX: ghost.x, homeY: ghost.y, direction: "up", sleeping: 0 }));
    wanted = "left";
    power = 0;
    invincible = 1.5;
    playerTimer = 0;
    ghostTimer = 0;
  }

  function restart() {
    audio.stop();
    audio.unlock();
    points = 0;
    lives = 3;
    elapsed = 0;
    pellets = new Map();
    maze.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell === "." || cell === "o") pellets.set(`${x},${y}`, cell);
    }));
    resetActors();
    state = "playing";
    pauseButton.textContent = "Pauza";
    message.textContent = "Aduna toate punctele. Super-bilele iti permit sa mananci fantome!";
    updateScore();
    canvas.focus();
    audio.play("start");
  }

  function collect() {
    const key = `${player.x},${player.y}`;
    const pellet = pellets.get(key);
    if (!pellet) return;
    pellets.delete(key);
    points += pellet === "o" ? 50 : 10;
    if (pellet === "o") {
      power = 7;
      audio.play("power");
      message.textContent = "Super-putere! Urmareste fantomele albastre timp de 7 secunde.";
    } else {
      audio.play("chomp");
    }
    if (pellets.size === 0) {
      state = "won";
      audio.stop();
      audio.play("win");
      message.textContent = `Ai castigat cu ${points} puncte! Apasa R sau Reincepe.`;
    }
    updateScore();
  }

  function checkGhosts() {
    for (const ghost of ghosts) {
      if (ghost.sleeping > 0 || ghost.x !== player.x || ghost.y !== player.y) continue;
      if (power > 0) {
        points += 200;
        ghost.x = ghost.homeX;
        ghost.y = ghost.homeY;
        ghost.sleeping = 2;
        audio.play("ghost");
        updateScore();
      } else if (invincible <= 0) {
        lives--;
        audio.stop();
        if (lives <= 0) {
          state = "lost";
          audio.play("lose");
          message.textContent = "Fantomele te-au prins! Apasa R sau Reincepe.";
        } else {
          resetActors();
          audio.play("hurt");
          message.textContent = "Mai ai o sansa! Cauta super-bilele din colturi.";
        }
        updateScore();
        return true;
      }
    }
    return false;
  }

  // A distance field lets ghosts navigate corridors without crossing walls.
  function distancesFrom(x, y) {
    const distances = new Map([[`${x},${y}`, 0]]);
    const queue = [{ x, y }];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const delta of Object.values(directions)) {
        const nx = cell.x + delta.x, ny = cell.y + delta.y;
        const key = `${nx},${ny}`;
        if (!walkable(nx, ny) || distances.has(key)) continue;
        distances.set(key, distances.get(`${cell.x},${cell.y}`) + 1);
        queue.push({ x: nx, y: ny });
      }
    }
    return distances;
  }

  function moveGhosts() {
    const distances = distancesFrom(player.x, player.y);
    ghosts.forEach((ghost, index) => {
      if (ghost.sleeping > 0) return;
      let options = Object.keys(directions).filter(direction => canMove(ghost, direction));
      const previous = directions[ghost.direction];
      const forward = options.filter(direction => {
        const delta = directions[direction];
        return delta.x !== -previous.x || delta.y !== -previous.y;
      });
      if (forward.length) options = forward;
      options.sort((a, b) => {
        const da = directions[a], db = directions[b];
        const distanceA = distances.get(`${ghost.x + da.x},${ghost.y + da.y}`) ?? 999;
        const distanceB = distances.get(`${ghost.x + db.x},${ghost.y + db.y}`) ?? 999;
        return power > 0 ? distanceB - distanceA : distanceA - distanceB;
      });
      // Occasionally scatter instead of following the exact same route.
      const scatter = power <= 0 && Math.floor(elapsed / 8) % 3 === 0 && index > 0;
      const direction = scatter ? options[(Math.floor(elapsed) + index) % options.length] : options[0];
      if (!direction) return;
      ghost.direction = direction;
      ghost.x += directions[direction].x;
      ghost.y += directions[direction].y;
    });
  }

  function update(dt) {
    if (state !== "playing") return;
    elapsed += dt;
    const oldPower = power;
    power = Math.max(0, power - dt);
    if (oldPower > 0 && power === 0) message.textContent = "Super-puterea s-a terminat. Evita fantomele!";
    invincible = Math.max(0, invincible - dt);
    ghosts.forEach(ghost => { ghost.sleeping = Math.max(0, ghost.sleeping - dt); });
    playerTimer += dt;
    ghostTimer += dt;
    if (playerTimer >= 0.13) {
      playerTimer -= 0.13;
      if (canMove(player, wanted)) player.direction = wanted;
      if (canMove(player, player.direction)) {
        player.x += directions[player.direction].x;
        player.y += directions[player.direction].y;
      }
      collect();
      if (state === "playing" && checkGhosts()) return;
    }
    if (state !== "playing") return;
    if (ghostTimer >= (power > 0 ? 0.3 : 0.23)) {
      ghostTimer = 0;
      moveGhosts();
      checkGhosts();
    }
  }

  function togglePause() {
    if (state !== "playing" && state !== "paused") return;
    state = state === "playing" ? "paused" : "playing";
    if (state === "paused") audio.stop();
    else audio.unlock();
    pauseButton.textContent = state === "paused" ? "Continua" : "Pauza";
    message.textContent = state === "paused" ? "Pauza. Apasa P sau Continua." : "Aduna punctele si evita fantomele!";
  }

  function circle(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGhost(ghost, time) {
    if (ghost.sleeping > 0) return;
    const x = ghost.x * tile + tile / 2, y = ghost.y * tile + tile / 2;
    const flash = power > 0 && (power > 2 || Math.floor(time / 180) % 2 === 0);
    ctx.fillStyle = flash ? "#587dd4" : ghost.color;
    ctx.beginPath();
    ctx.arc(x, y - 2, 9, Math.PI, 0);
    ctx.lineTo(x + 9, y + 9);
    for (let i = 0; i < 3; i++) {
      ctx.lineTo(x + 6 - i * 6, y + 5);
      ctx.lineTo(x + 3 - i * 6, y + 9);
    }
    ctx.lineTo(x - 9, y - 2);
    ctx.fill();
    const delta = directions[ghost.direction];
    for (const offset of [-4, 4]) {
      circle(x + offset, y - 2, 3.6, "#fff5df");
      circle(x + offset + delta.x * 1.5, y - 2 + delta.y * 1.5, 1.7, "#203a45");
    }
  }

  function draw(time) {
    ctx.fillStyle = "#102328";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    maze.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell !== "#") return;
      ctx.fillStyle = "#18393e";
      ctx.strokeStyle = "#548f91";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x * tile + 3, y * tile + 3, tile - 6, tile - 6, 5);
      ctx.fill();
      ctx.stroke();
    }));
    for (const [key, kind] of pellets) {
      const [x, y] = key.split(",").map(Number);
      const radius = kind === "o" ? 5 + Math.sin(time / 140) : 2.3;
      circle(x * tile + tile / 2, y * tile + tile / 2, radius, "#ffe1a2");
    }
    ghosts.forEach(ghost => drawGhost(ghost, time));
    if (invincible <= 0 || Math.floor(time / 110) % 2 === 0) {
      const x = player.x * tile + tile / 2, y = player.y * tile + tile / 2;
      const mouth = 0.12 + (Math.sin(time / 65) + 1) * 0.17;
      const angle = directions[player.direction].angle;
      ctx.fillStyle = "#ffda5b";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, 9.5, angle + mouth, angle + Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
    }
    if (power > 0 && state === "playing") {
      ctx.fillStyle = "#8cd3c9";
      ctx.fillRect(tile, 6, (canvas.width - tile * 2) * power / 7, 4);
    }
    if (state === "paused" || state === "won" || state === "lost") {
      ctx.fillStyle = "#102328dd";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffda5b";
      ctx.font = "bold 36px Georgia";
      ctx.fillText(state === "won" ? "Ai castigat!" : state === "lost" ? "Joc terminat" : "Pauza", canvas.width / 2, 255);
      ctx.font = "15px Trebuchet MS";
      ctx.fillStyle = "#f5edcf";
      ctx.fillText(state === "paused" ? "P / Continua" : "R / Reincepe", canvas.width / 2, 290);
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

  document.getElementById("play-pacman").addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    restart();
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  });
  document.getElementById("pacman-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    cancelAnimationFrame(frame);
    audio.stop();
    state = "ready";
    document.getElementById("play-pacman").focus();
  });
  document.getElementById("pacman-restart").addEventListener("click", restart);
  pauseButton.addEventListener("click", togglePause);
  window.addEventListener("keydown", event => {
    if (!dialog.open) return;
    if (keyDirections[event.code]) {
      event.preventDefault();
      wanted = keyDirections[event.code];
    }
    if (event.repeat) return;
    if (event.code === "KeyP") togglePause();
    if (event.code === "KeyR") restart();
  });
  window.addEventListener("blur", () => {
    if (dialog.open && state === "playing") togglePause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dialog.open && state === "playing") togglePause();
  });
  document.querySelectorAll("[data-pacman-dir]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      wanted = button.dataset.pacmanDir;
    });
    // Also support keyboard and assistive-technology button activation.
    button.addEventListener("click", () => { wanted = button.dataset.pacmanDir; });
    button.addEventListener("contextmenu", event => event.preventDefault());
  });
})();
