/* ============ Gmfy player — play mode runtime ============
 * Third-person voxel platformer runtime: WASD + jump, axis-separated AABB
 * collision against the block grid, coins/goal/lava/bouncy behaviours, and
 * the API that block-coding scripts talk to.
 *
 * Extras (gated by subscription in main.js):
 *  - local 2-player mode (P1: WASD + Space, P2: arrows + Enter)
 *  - first-person mode
 *  - "smart snapshot" high-res cinematic capture
 */
(function () {
  const E = window.GmfyEngine;
  const B = window.GmfyBlocks;

  const GRAVITY = 24;
  const PLAYER_W = 0.5;  // half-extents: 0.25
  const PLAYER_H = 1.5;

  let renderer, scene, camera, meshMap;
  let game = null;
  let active = false;
  let over = false;
  let onExit = null;
  let twoPlayer = false;
  let fpMode = false;

  const keys = {};
  const cam = { yaw: 0.6, pitch: 0.35, dist: 8 };
  let dragging = false, lastX = 0, lastY = 0;

  /* shared match state (score etc.) + per-player physics states */
  const state = { speed: 6, jumpPower: 8, coins: 0, score: 0, startTime: 0 };
  let players = []; // [{pos, vel, onGround, avatar, label}]

  let solids = new Map();   // "x,y,z" -> block (things you collide with)
  let coinsMap = new Map(); // "x,y,z" -> block
  let sayTimer = null;
  let lastFrame = 0;

  const joy = { x: 0, z: 0 }; // virtual joystick vector, each axis in [-1, 1]

  function init() {
    const canvas = document.getElementById("play-canvas");
    renderer = E.makeRenderer(canvas);
    camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);

    window.addEventListener("keydown", (e) => {
      if (!active) return;
      keys[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyR") restart();
      if (e.code === "KeyF") toggleFirstPerson();
    });
    window.addEventListener("keyup", (e) => { keys[e.code] = false; });

    canvas.addEventListener("mousedown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", (e) => {
      if (!active || !dragging) return;
      cam.yaw -= (e.clientX - lastX) * 0.006;
      cam.pitch = clampPitch(cam.pitch + (e.clientY - lastY) * 0.005);
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      cam.dist = Math.max(3, Math.min(20, cam.dist + e.deltaY * 0.01));
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", resize);

    /* ---- touch: drag on canvas orbits the camera ---- */
    let camTouchId = null;
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (camTouchId === null && e.changedTouches.length) {
        const t = e.changedTouches[0];
        camTouchId = t.identifier;
        lastX = t.clientX; lastY = t.clientY;
      }
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (!active || camTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== camTouchId) continue;
        cam.yaw -= (t.clientX - lastX) * 0.008;
        cam.pitch = clampPitch(cam.pitch + (t.clientY - lastY) * 0.006);
        lastX = t.clientX; lastY = t.clientY;
      }
    }, { passive: false });
    const endCamTouch = (e) => {
      for (const t of e.changedTouches) if (t.identifier === camTouchId) camTouchId = null;
    };
    canvas.addEventListener("touchend", endCamTouch);
    canvas.addEventListener("touchcancel", endCamTouch);

    /* ---- virtual joystick + jump button ---- */
    const joyEl = document.getElementById("joystick");
    const knob = document.getElementById("joy-knob");
    const setJoy = (t) => {
      const r = joyEl.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2);
      let dy = t.clientY - (r.top + r.height / 2);
      const max = r.width / 2 - 16;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      joy.x = dx / max;
      joy.z = dy / max;
    };
    const clearJoy = () => {
      joy.x = 0; joy.z = 0;
      knob.style.transform = "";
    };
    joyEl.addEventListener("touchstart", (e) => { e.preventDefault(); setJoy(e.targetTouches[0]); }, { passive: false });
    joyEl.addEventListener("touchmove", (e) => { e.preventDefault(); setJoy(e.targetTouches[0]); }, { passive: false });
    joyEl.addEventListener("touchend", (e) => { if (!e.targetTouches.length) clearJoy(); });
    joyEl.addEventListener("touchcancel", clearJoy);

    const jumpBtn = document.getElementById("btn-jump");
    const jumpOn = (e) => { e.preventDefault(); keys.Space = true; };
    const jumpOff = () => { keys.Space = false; };
    jumpBtn.addEventListener("touchstart", jumpOn, { passive: false });
    jumpBtn.addEventListener("touchend", jumpOff);
    jumpBtn.addEventListener("touchcancel", jumpOff);
    jumpBtn.addEventListener("mousedown", jumpOn);
    jumpBtn.addEventListener("mouseup", jumpOff);
  }

  function clampPitch(p) {
    return fpMode ? Math.max(-1.25, Math.min(1.25, p)) : Math.max(-0.1, Math.min(1.3, p));
  }

  /* ---- script API ---- */
  const api = {
    isOver: () => over || !active,
    say(text, secs) {
      const el = document.getElementById("hud-say");
      el.textContent = text;
      el.hidden = !text;
      clearTimeout(sayTimer);
      return new Promise((resolve) => {
        sayTimer = setTimeout(() => { el.hidden = true; resolve(); }, Math.max(0.2, secs) * 1000);
      });
    },
    addScore(n) { state.score += n; updateHud(); },
    setSky(color) {
      scene.background = new THREE.Color(color);
      scene.fog.color.copy(scene.background);
    },
    setSpeed(n) { state.speed = n; },
    setJump(n) { state.jumpPower = n; },
    teleport() { players.forEach((p) => respawnPlayer(p)); },
    playSound(name) { (E.sounds[name] || E.sounds.pop)(); },
    win: () => finish(true),
    lose: () => finish(false),
  };

  function makePlayer(label, colors) {
    const avatar = E.makeAvatar(colors);
    scene.add(avatar);
    return {
      label,
      avatar,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      onGround: false,
    };
  }

  /* opts: { twoPlayer: bool } */
  function start(g, exitCb, opts) {
    opts = opts || {};
    game = g;
    onExit = exitCb;
    over = false;
    twoPlayer = !!opts.twoPlayer;
    fpMode = false;
    const base = E.makeBaseScene(game.sky);
    scene = base.scene;
    meshMap = E.buildBlocks(scene, game.blocks);

    solids = new Map();
    coinsMap = new Map();
    for (const b of game.blocks) {
      const k = E.key(b.x, b.y, b.z);
      if (b.type === "coin") coinsMap.set(k, b);
      else solids.set(k, b);
    }

    players = [makePlayer("Player 1")];
    if (twoPlayer) players.push(makePlayer("Player 2", { body: 0xff6ad5, legs: 0x2ec27e }));

    state.speed = 6;
    state.jumpPower = 8;
    state.coins = 0;
    state.score = 0;
    state.startTime = performance.now();
    document.getElementById("play-title").textContent =
      game.name + (twoPlayer ? " · 2P" : "");
    document.getElementById("play-overlay").hidden = true;
    document.getElementById("hud-say").hidden = true;
    updateHud();
    players.forEach((p, i) => respawnPlayer(p, i));
    cam.yaw = 0.6; cam.pitch = 0.35; cam.dist = twoPlayer ? 11 : 8;

    active = true;
    lastFrame = performance.now();
    resize();
    requestAnimationFrame(loop);
    B.fireEvent(game.scripts, "ev_start", api);
  }

  function restart() {
    if (!active) return;
    const opts = { twoPlayer };
    stop();
    start(game, onExit, opts);
  }

  function stop() {
    active = false;
    clearTimeout(sayTimer);
    document.getElementById("hud-say").hidden = true;
    for (const k of Object.keys(keys)) keys[k] = false;
    joy.x = 0; joy.z = 0;
    document.getElementById("joy-knob").style.transform = "";
  }

  function respawnPlayer(p, index) {
    const offset = twoPlayer ? (p === players[0] ? -0.6 : 0.6) : 0;
    p.pos.set(game.spawn.x + 0.5 + offset, game.spawn.y + 0.1, game.spawn.z + 0.5);
    p.vel.set(0, 0, 0);
  }

  function finish(won, winnerLabel) {
    if (over) return;
    over = true;
    (won ? E.sounds.win : E.sounds.zap)();
    const secs = Math.floor((performance.now() - state.startTime) / 1000);
    document.getElementById("overlay-emoji").textContent = won ? "🏆" : "💀";
    document.getElementById("overlay-title").textContent =
      won ? (twoPlayer && winnerLabel ? winnerLabel + " wins!" : "You win!") : "Game over";
    document.getElementById("overlay-sub").textContent =
      `⭐ Score ${state.score} · 🪙 ${state.coins} coins · ⏱ ${secs}s`;
    document.getElementById("play-overlay").hidden = false;
  }

  function updateHud() {
    document.getElementById("hud-coins").textContent = state.coins;
    document.getElementById("hud-score").textContent = state.score;
  }

  /* ---- physics ---- */
  function solidAt(x, y, z) {
    if (y < 0) return true; // the ground itself
    return solids.has(E.key(x, y, z));
  }

  /* Does a player AABB at `pos` overlap any solid voxel? */
  function collides(pos) {
    const hw = PLAYER_W / 2;
    const minX = Math.floor(pos.x - hw), maxX = Math.floor(pos.x + hw);
    const minY = Math.floor(pos.y),      maxY = Math.floor(pos.y + PLAYER_H);
    const minZ = Math.floor(pos.z - hw), maxZ = Math.floor(pos.z + hw);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (solidAt(x, y, z)) return solids.get(E.key(x, y, z)) || { type: "ground" };
    return null;
  }

  function moveAxis(p, axis, amount) {
    if (!amount) return null;
    p.pos[axis] += amount;
    const hit = collides(p.pos);
    if (hit) {
      const hw = PLAYER_W / 2;
      if (axis === "y") {
        if (amount < 0) {
          p.pos.y = Math.floor(p.pos.y) + 1;
          p.onGround = true;
        } else {
          p.pos.y = Math.floor(p.pos.y + PLAYER_H) - PLAYER_H - 0.001;
        }
        p.vel.y = 0;
      } else {
        const v = p.pos[axis];
        p.pos[axis] = amount > 0
          ? Math.floor(v + hw) - hw - 0.001
          : Math.ceil(v - hw) + hw + 0.001;
        p.vel[axis] = 0;
      }
    }
    return hit;
  }

  function blockBelow(p) {
    const hw = PLAYER_W / 2 - 0.02;
    const y = Math.floor(p.pos.y - 0.06);
    const cells = [
      [p.pos.x - hw, p.pos.z - hw], [p.pos.x + hw, p.pos.z - hw],
      [p.pos.x - hw, p.pos.z + hw], [p.pos.x + hw, p.pos.z + hw],
    ];
    for (const [cx, cz] of cells) {
      const b = solids.get(E.key(Math.floor(cx), y, Math.floor(cz)));
      if (b) return b;
    }
    return null;
  }

  function inputFor(p, index) {
    let ix = 0, iz = 0, jump = false;
    if (index === 0) {
      if (keys.KeyW) iz -= 1;
      if (keys.KeyS) iz += 1;
      if (keys.KeyA) ix -= 1;
      if (keys.KeyD) ix += 1;
      if (!twoPlayer) { // arrows double as P1 keys in single player
        if (keys.ArrowUp) iz -= 1;
        if (keys.ArrowDown) iz += 1;
        if (keys.ArrowLeft) ix -= 1;
        if (keys.ArrowRight) ix += 1;
      }
      ix += joy.x;
      iz += joy.z;
      jump = !!keys.Space;
    } else {
      if (keys.ArrowUp) iz -= 1;
      if (keys.ArrowDown) iz += 1;
      if (keys.ArrowLeft) ix -= 1;
      if (keys.ArrowRight) ix += 1;
      jump = !!(keys.Enter || keys.ShiftRight);
    }
    const len = Math.max(1, Math.hypot(ix, iz)); // clamp, but keep analog joystick values
    return { ix: ix / len, iz: iz / len, jump };
  }

  function stepPlayer(p, index, dt) {
    const input = inputFor(p, index);

    // standing on a speed pad? zoom!
    const standingOn = p.onGround ? blockBelow(p) : null;
    const boost = standingOn && standingOn.type === "speed" ? 1.8 : 1;

    const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
    p.vel.x = (input.ix * cos + input.iz * sin) * state.speed * boost;
    p.vel.z = (-input.ix * sin + input.iz * cos) * state.speed * boost;

    if (input.jump && p.onGround) {
      p.vel.y = state.jumpPower;
      p.onGround = false;
      E.sounds.jump();
      B.fireEvent(game.scripts, "ev_jump", api);
    }

    p.vel.y -= GRAVITY * dt;
    p.vel.y = Math.max(p.vel.y, -40);

    p.onGround = false;
    const hitY = moveAxis(p, "y", p.vel.y * dt);
    const hitX = moveAxis(p, "x", p.vel.x * dt);
    const hitZ = moveAxis(p, "z", p.vel.z * dt);

    // touching special solids
    const touched = [hitY, hitX, hitZ].filter(Boolean);
    const under = p.onGround ? blockBelow(p) : null;
    if (under) touched.push(under);
    for (const b of touched) {
      if (b.type === "lava") return touchLava(p);
      if (b.type === "goal") return touchGoal(p);
      if (b.type === "bouncy" && b === under) {
        p.vel.y = state.jumpPower * 1.7;
        p.onGround = false;
        E.sounds.jump();
      }
      if (b.type === "checkpoint") {
        const sp = { x: b.x, y: b.y + 1, z: b.z };
        if (game.spawn.x !== sp.x || game.spawn.y !== sp.y || game.spawn.z !== sp.z) {
          game.spawn = sp; // future respawns come back here
          E.sounds.pop();
          api.say("📍 Checkpoint!", 1.2);
        }
      }
    }

    // coins: proximity collect
    for (const [k, b] of coinsMap) {
      const dx = b.x + 0.5 - p.pos.x, dy = b.y + 0.5 - (p.pos.y + 0.7), dz = b.z + 0.5 - p.pos.z;
      if (dx * dx + dy * dy + dz * dz < 0.85) {
        coinsMap.delete(k);
        const mesh = meshMap.get(k);
        if (mesh) scene.remove(mesh);
        meshMap.delete(k);
        state.coins += 1;
        state.score += 10;
        E.sounds.coin();
        updateHud();
        B.fireEvent(game.scripts, "ev_coin", api);
      }
    }

    // fell off the world
    if (p.pos.y < -12) touchLava(p);
  }

  function touchLava(p) {
    E.sounds.zap();
    respawnPlayer(p);
    B.fireEvent(game.scripts, "ev_lava", api);
  }

  function touchGoal(p) {
    B.fireEvent(game.scripts, "ev_goal", api);
    finish(true, p.label);
  }

  /* ---- first person ---- */
  function toggleFirstPerson() {
    if (twoPlayer) return; // FPV is single-player only
    fpMode = !fpMode;
    cam.pitch = clampPitch(cam.pitch);
    return fpMode;
  }

  /* ---- smart snapshot: high-res render + cinematic grade ---- */
  function snapshot() {
    if (!renderer || !scene) return null;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 720;
    const scale = Math.min(2, 3200 / Math.max(w, h)); // cap output size
    const W = Math.round(w * scale), H = Math.round(h * scale);

    // render one extra-crisp frame
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ctx = out.getContext("2d");
    // base pass with a rich color grade
    ctx.filter = "saturate(1.35) contrast(1.14) brightness(1.04)";
    ctx.drawImage(canvas, 0, 0, W, H);
    ctx.filter = "none";
    // soft bloom: blurred lighten pass
    const bloom = document.createElement("canvas");
    bloom.width = W; bloom.height = H;
    const bctx = bloom.getContext("2d");
    bctx.filter = "blur(" + Math.round(W / 160) + "px) brightness(1.15)";
    bctx.drawImage(canvas, 0, 0, W, H);
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = "lighten";
    ctx.drawImage(bloom, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // warm sunlight tint
    const warm = ctx.createLinearGradient(0, 0, 0, H);
    warm.addColorStop(0, "rgba(255, 200, 120, 0.10)");
    warm.addColorStop(1, "rgba(80, 60, 160, 0.08)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);
    // vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    // cinematic letterbox
    const bar = Math.round(H * 0.055);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);

    // restore live view
    resize();
    return out.toDataURL("image/png");
  }

  function resize() {
    if (!renderer) return;
    const canvas = renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loop(t) {
    if (!active) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - lastFrame) / 1000);
    lastFrame = t;

    if (!over) players.forEach((p, i) => stepPlayer(p, i, dt));

    // avatars follow physics positions; face movement direction
    for (const p of players) {
      p.avatar.position.copy(p.pos);
      const moving = Math.abs(p.vel.x) + Math.abs(p.vel.z) > 0.5;
      if (moving) {
        p.avatar.rotation.y = Math.atan2(-p.vel.x, -p.vel.z);
        const swing = Math.sin(t / 90) * 0.5;
        p.avatar.userData.legs[0].rotation.x = swing;
        p.avatar.userData.legs[1].rotation.x = -swing;
      } else {
        p.avatar.userData.legs[0].rotation.x = 0;
        p.avatar.userData.legs[1].rotation.x = 0;
      }
    }

    const p1 = players[0];
    p1.avatar.visible = !fpMode;

    if (fpMode) {
      // camera rides at P1's eyes, cam.yaw/pitch is the look direction
      const head = new THREE.Vector3(p1.pos.x, p1.pos.y + 1.35, p1.pos.z);
      camera.position.copy(head);
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      camera.lookAt(head.x - Math.sin(cam.yaw) * cp, head.y - sp, head.z - Math.cos(cam.yaw) * cp);
    } else {
      // orbit target: P1, or the midpoint in 2P (zoom out as players spread)
      let target, dist = cam.dist;
      if (twoPlayer) {
        const p2 = players[1];
        target = new THREE.Vector3(
          (p1.pos.x + p2.pos.x) / 2, (p1.pos.y + p2.pos.y) / 2 + 1.2, (p1.pos.z + p2.pos.z) / 2);
        const spread = p1.pos.distanceTo(p2.pos);
        dist = Math.max(cam.dist, Math.min(22, spread * 1.1 + 6));
      } else {
        target = new THREE.Vector3(p1.pos.x, p1.pos.y + 1.2, p1.pos.z);
      }
      camera.position.set(
        target.x + dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
        target.y + dist * Math.sin(cam.pitch),
        target.z + dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
      );
      camera.lookAt(target);
    }

    // timer
    if (!over) {
      const secs = Math.floor((t - state.startTime) / 1000);
      document.getElementById("hud-time").textContent =
        Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
    }

    E.animateBlocks(meshMap, t / 1000);
    renderer.render(scene, camera);
  }

  window.GmfyPlayer = {
    init, start, stop, restart, resize,
    toggleFirstPerson, snapshot,
    isTwoPlayer: () => twoPlayer,
    isFirstPerson: () => fpMode,
    /* read-only peek at the live player position (used by tests/debugging) */
    getState: () => ({
      x: players[0] ? players[0].pos.x : 0,
      y: players[0] ? players[0].pos.y : 0,
      z: players[0] ? players[0].pos.z : 0,
      coins: state.coins, score: state.score,
    }),
  };
})();
