/* Grok Snake - a retro neon take on the classic phone snake game.
   Plain JavaScript, no dependencies. */
(function () {
  "use strict";

  // ---------- Config ----------
  var COLS = 20;
  var ROWS = 20;
  var START_LEN = 3;
  var BASE_TICK = 150;   // ms per move at the start
  var MIN_TICK = 60;     // fastest speed
  var SPEEDUP = 4;       // ms faster per food eaten
  var HI_KEY = "grokSnake.highScore";
  var FOOD_COLORS = ["#ff2fd0", "#ffe14d", "#19f3ff", "#ff8a1f", "#7dff3a"];

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("board");
  var ctx = canvas.getContext("2d");
  var wrap = $("boardWrap");
  var stage = $("stage");
  var scoreEl = $("score");
  var hiEl = $("hiscore");
  var titleHiEl = $("titleHi");
  var finalScoreEl = $("finalScore");
  var newHiEl = $("newHi");
  var screens = { title: $("titleScreen"), paused: $("pauseScreen"), over: $("overScreen") };

  // ---------- State ----------
  var state = "title"; // title | playing | paused | over
  var snake, dir, dirQueue, food, foodColor, score, hiScore, tickMs, acc, lastTime, particles, flash;
  var cell = 16;
  var dpr = 1;

  hiScore = loadHi();
  var isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  if (isTouch) document.body.classList.add("is-touch");

  function loadHi() {
    try { return parseInt(localStorage.getItem(HI_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function saveHi() {
    try { localStorage.setItem(HI_KEY, String(hiScore)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Game logic ----------
  function reset() {
    var cx = Math.floor(COLS / 2) - 2, cy = Math.floor(ROWS / 2);
    snake = [];
    for (var i = 0; i < START_LEN; i++) snake.push({ x: cx - i, y: cy });
    dir = { x: 1, y: 0 };
    dirQueue = [];
    score = 0;
    tickMs = BASE_TICK;
    acc = 0;
    particles = [];
    flash = 0;
    placeFood();
    updateHud();
  }

  function placeFood() {
    var free = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (!snake.some(function (s) { return s.x === x && s.y === y; })) free.push({ x: x, y: y });
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
    foodColor = FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)];
  }

  function queueDir(name) {
    var map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    var d = map[name];
    if (!d) return;
    if (state === "title" || state === "over") { start(); }
    if (state === "paused") { resume(); }
    var last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return; // no reversing
    if (dirQueue.length < 3) dirQueue.push(d);
  }

  function step() {
    if (dirQueue.length) dir = dirQueue.shift();
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    var willEat = food && head.x === food.x && head.y === food.y;

    // Wall collision
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return gameOver();
    // Self collision (tail moves away unless we're growing)
    var body = willEat ? snake : snake.slice(0, -1);
    for (var i = 0; i < body.length; i++) {
      if (body[i].x === head.x && body[i].y === head.y) return gameOver();
    }

    snake.unshift(head);
    if (willEat) {
      score += 10;
      tickMs = Math.max(MIN_TICK, BASE_TICK - (snake.length - START_LEN) * SPEEDUP);
      burst(food.x, food.y, foodColor);
      placeFood();
      updateHud();
    } else {
      snake.pop();
    }
  }

  function start() {
    reset();
    setState("playing");
  }
  function pause() { if (state === "playing") setState("paused"); }
  function resume() { if (state === "paused") { lastTime = performance.now(); setState("playing"); } }
  function togglePause() { state === "playing" ? pause() : resume(); }

  function gameOver() {
    flash = 1;
    var isNew = score > hiScore;
    if (isNew) { hiScore = score; saveHi(); }
    finalScoreEl.textContent = score;
    newHiEl.classList.toggle("show", isNew && score > 0);
    updateHud();
    setState("over");
  }

  function setState(s) {
    state = s;
    screens.title.classList.toggle("show", s === "title");
    screens.paused.classList.toggle("show", s === "paused");
    screens.over.classList.toggle("show", s === "over");
    document.body.dataset.state = s;
  }

  function updateHud() {
    scoreEl.textContent = score;
    hiEl.textContent = hiScore;
    titleHiEl.textContent = hiScore;
  }

  // ---------- Particles ----------
  function burst(gx, gy, color) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2, v = 0.06 + Math.random() * 0.12;
      particles.push({ x: gx + 0.5, y: gy + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color: color });
    }
  }

  // ---------- Rendering ----------
  function resize() {
    var hudH = 0;
    var availW = stage.clientWidth - 24;
    var availH = stage.clientHeight - 24;
    var size = Math.max(160, Math.min(availW, availH, 720));
    cell = Math.max(6, Math.floor(size / COLS));
    var w = cell * COLS, h = cell * ROWS;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    document.documentElement.style.setProperty("--board", (w + 16) + "px");
    draw(0);
  }

  function hsl(h, s, l) { return "hsl(" + h + "," + s + "%," + l + "%)"; }

  function draw(t) {
    var w = cell * COLS, h = cell * ROWS;
    ctx.fillStyle = "#0b0919";
    ctx.fillRect(0, 0, w, h);

    // Checker + dot grid
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) { ctx.fillStyle = "#0f0c22"; ctx.fillRect(x * cell, y * cell, cell, cell); }
      }
    }
    ctx.fillStyle = "rgba(124,120,168,0.25)";
    var dot = Math.max(1, Math.floor(cell / 10));
    for (var gy = 1; gy < ROWS; gy++) for (var gx = 1; gx < COLS; gx++) ctx.fillRect(gx * cell - dot / 2, gy * cell - dot / 2, dot, dot);

    if (!snake) return;
    var px = Math.max(1, Math.floor(cell / 8)); // "pixel" size for pixel-art details

    // Food: pulsing pixel gem
    if (food) {
      var pulse = (Math.sin(t / 140) + 1) / 2;
      var fx = food.x * cell, fy = food.y * cell;
      ctx.save();
      ctx.shadowColor = foodColor;
      ctx.shadowBlur = cell * (0.6 + pulse * 0.6);
      ctx.fillStyle = foodColor;
      var inset = Math.round(px * (1.5 - pulse));
      // pixel diamond-ish block
      ctx.fillRect(fx + px * 2 + inset, fy + px + inset, cell - px * 4 - inset * 2, cell - px * 2 - inset * 2);
      ctx.fillRect(fx + px + inset, fy + px * 2 + inset, cell - px * 2 - inset * 2, cell - px * 4 - inset * 2);
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(fx + px * 2 + inset, fy + px * 2 + inset, px, px);
    }

    // Snake: rainbow neon body with a gap between segments
    var n = snake.length;
    var hueBase = (t / 30) % 360;
    for (var i = n - 1; i >= 0; i--) {
      var s = snake[i];
      var hue = (hueBase + 140 - i * 12 + 360) % 360;
      var gap = i === 0 ? 0 : px;
      ctx.save();
      ctx.shadowColor = hsl(hue, 100, 60);
      ctx.shadowBlur = i === 0 ? cell * 0.9 : cell * 0.4;
      ctx.fillStyle = i === 0 ? "#7dff3a" : hsl(hue, 100, 58);
      ctx.fillRect(s.x * cell + gap, s.y * cell + gap, cell - gap * 2, cell - gap * 2);
      ctx.restore();
      // highlight pixel
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(s.x * cell + gap + px, s.y * cell + gap + px, px, px);
    }
    drawEyes(snake[0], px);

    // Particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var q = particles[p];
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x * cell - px, q.y * cell - px, px * 2, px * 2);
    }
    ctx.globalAlpha = 1;

    // Crash flash
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,47,208," + (flash * 0.45) + ")";
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawEyes(head, px) {
    var hx = head.x * cell, hy = head.y * cell;
    var e = Math.max(2, px * 2);
    ctx.fillStyle = "#07060f";
    var a, b;
    if (dir.x !== 0) {
      var ex = dir.x > 0 ? hx + cell - e - px * 2 : hx + px * 2;
      a = [ex, hy + px * 2]; b = [ex, hy + cell - e - px * 2];
    } else {
      var ey = dir.y > 0 ? hy + cell - e - px * 2 : hy + px * 2;
      a = [hx + px * 2, ey]; b = [hx + cell - e - px * 2, ey];
    }
    ctx.fillRect(a[0], a[1], e, e);
    ctx.fillRect(b[0], b[1], e, e);
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt / 16; p.y += p.vy * dt / 16;
      p.life -= dt / 450;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt / 400);
  }

  function loop(now) {
    var dt = lastTime ? Math.min(100, now - lastTime) : 0;
    lastTime = now;
    if (state === "playing") {
      acc += dt;
      while (acc >= tickMs && state === "playing") { acc -= tickMs; step(); }
    }
    updateParticles(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  // ---------- Input: keyboard ----------
  var KEYS = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right"
  };
  window.addEventListener("keydown", function (e) {
    var d = KEYS[e.code] || KEYS[e.key];
    if (d) { e.preventDefault(); queueDir(d); return; }
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (state === "title" || state === "over") start();
      else togglePause();
      return;
    }
    if (e.code === "KeyP" || e.code === "Escape") { e.preventDefault(); togglePause(); }
  });

  // ---------- Input: touch swipes ----------
  var touchStart = null;
  document.addEventListener("touchstart", function (e) {
    if (e.target.closest && e.target.closest("button")) return;
    var t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("touchend", function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // a tap, handled by click
    if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? "right" : "left");
    else queueDir(dy > 0 ? "down" : "up");
  }, { passive: true });

  // ---------- Input: buttons & overlays ----------
  Array.prototype.forEach.call(document.querySelectorAll(".dir"), function (btn) {
    var fire = function (e) {
      e.preventDefault();
      btn.classList.add("pressed");
      setTimeout(function () { btn.classList.remove("pressed"); }, 120);
      queueDir(btn.dataset.dir);
    };
    btn.addEventListener("touchstart", fire, { passive: false });
    btn.addEventListener("mousedown", fire);
  });
  $("pauseBtn").addEventListener("click", function () {
    if (state === "playing" || state === "paused") togglePause();
  });
  screens.title.addEventListener("click", start);
  screens.paused.addEventListener("click", resume);
  $("restartBtn").addEventListener("click", function (e) { e.stopPropagation(); start(); });
  screens.over.addEventListener("click", function () {
    // ignore the tap that may arrive right after crashing
    if (performance.now() - overAt > 400) start();
  });
  var overAt = 0;
  var _gameOver = gameOver;
  gameOver = function () { overAt = performance.now(); _gameOver(); };

  // Auto-pause when the tab is hidden
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 150); });

  // ---------- Small read-only test hook ----------
  window.grokSnake = {
    getState: function () {
      return {
        state: state, score: score, hiScore: hiScore, tickMs: tickMs,
        length: snake ? snake.length : 0,
        head: snake ? { x: snake[0].x, y: snake[0].y } : null,
        dir: dir ? { x: dir.x, y: dir.y } : null,
        food: food ? { x: food.x, y: food.y } : null,
        snake: snake ? snake.map(function (s) { return { x: s.x, y: s.y }; }) : [],
        cols: COLS, rows: ROWS
      };
    }
  };

  // ---------- Boot ----------
  reset();
  setState("title");
  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  requestAnimationFrame(loop);
})();
