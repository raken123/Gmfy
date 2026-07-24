/* ============ Gmfy player — play mode runtime ============
 * Third-person voxel platformer runtime: WASD + jump, axis-separated AABB
 * collision against the block grid, coins/goal/lava/bouncy behaviours, and
 * the API that block-coding scripts talk to.
 */
(function () {
  const E = window.GmfyEngine;
  const B = window.GmfyBlocks;

  const GRAVITY = 24;
  const PLAYER_W = 0.5;  // half-extents: 0.25
  const PLAYER_H = 1.5;

  let renderer, scene, camera, meshMap, avatar;
  let game = null;
  let active = false;
  let over = false;
  let onExit = null;

  const keys = {};
  const cam = { yaw: 0.6, pitch: 0.35, dist: 8 };
  let dragging = false, lastX = 0, lastY = 0;

  const state = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    onGround: false,
    speed: 6,
    jumpPower: 8,
    coins: 0,
    score: 0,
    startTime: 0,
  };

  let solids = new Map();   // "x,y,z" -> block (things you collide with)
  let coinsMap = new Map(); // "x,y,z" -> block
  let sayTimer = null;
  let lastFrame = 0;

  function init() {
    const canvas = document.getElementById("play-canvas");
    renderer = E.makeRenderer(canvas);
    camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);

    window.addEventListener("keydown", (e) => {
      if (!active) return;
      keys[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyR") restart();
    });
    window.addEventListener("keyup", (e) => { keys[e.code] = false; });

    canvas.addEventListener("mousedown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", (e) => {
      if (!active || !dragging) return;
      cam.yaw -= (e.clientX - lastX) * 0.006;
      cam.pitch = Math.max(-0.1, Math.min(1.3, cam.pitch + (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      cam.dist = Math.max(3, Math.min(20, cam.dist + e.deltaY * 0.01));
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", resize);
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
    teleport() { respawn(false); },
    playSound(name) { (E.sounds[name] || E.sounds.pop)(); },
    win: () => finish(true),
    lose: () => finish(false),
  };

  function start(g, exitCb) {
    game = g;
    onExit = exitCb;
    over = false;
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

    avatar = E.makeAvatar();
    scene.add(avatar);

    state.speed = 6;
    state.jumpPower = 8;
    state.coins = 0;
    state.score = 0;
    state.startTime = performance.now();
    document.getElementById("play-title").textContent = game.name;
    document.getElementById("play-overlay").hidden = true;
    document.getElementById("hud-say").hidden = true;
    updateHud();
    respawn(true);

    active = true;
    lastFrame = performance.now();
    resize();
    requestAnimationFrame(loop);
    B.fireEvent(game.scripts, "ev_start", api);
  }

  function restart() {
    if (!active) return;
    stop();
    start(game, onExit);
  }

  function stop() {
    active = false;
    clearTimeout(sayTimer);
    document.getElementById("hud-say").hidden = true;
    for (const k of Object.keys(keys)) keys[k] = false;
  }

  function respawn(resetCam) {
    state.pos.set(game.spawn.x + 0.5, game.spawn.y + 0.1, game.spawn.z + 0.5);
    state.vel.set(0, 0, 0);
    if (resetCam) { cam.yaw = 0.6; cam.pitch = 0.35; cam.dist = 8; }
  }

  function finish(won) {
    if (over) return;
    over = true;
    (won ? E.sounds.win : E.sounds.zap)();
    const secs = Math.floor((performance.now() - state.startTime) / 1000);
    document.getElementById("overlay-emoji").textContent = won ? "🏆" : "💀";
    document.getElementById("overlay-title").textContent = won ? "You win!" : "Game over";
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

  /* Does the player AABB at `pos` overlap any solid voxel? */
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

  function moveAxis(axis, amount) {
    if (!amount) return null;
    state.pos[axis] += amount;
    const hit = collides(state.pos);
    if (hit) {
      const hw = PLAYER_W / 2;
      if (axis === "y") {
        if (amount < 0) {
          state.pos.y = Math.floor(state.pos.y) + 1;
          state.onGround = true;
        } else {
          state.pos.y = Math.floor(state.pos.y + PLAYER_H) - PLAYER_H - 0.001;
        }
        state.vel.y = 0;
      } else {
        const p = state.pos[axis];
        state.pos[axis] = amount > 0
          ? Math.floor(p + hw) - hw - 0.001
          : Math.ceil(p - hw) + hw + 0.001;
        state.vel[axis] = 0;
      }
    }
    return hit;
  }

  function blockBelow() {
    const hw = PLAYER_W / 2 - 0.02;
    const y = Math.floor(state.pos.y - 0.06);
    const cells = [
      [state.pos.x - hw, state.pos.z - hw], [state.pos.x + hw, state.pos.z - hw],
      [state.pos.x - hw, state.pos.z + hw], [state.pos.x + hw, state.pos.z + hw],
    ];
    for (const [cx, cz] of cells) {
      const b = solids.get(E.key(Math.floor(cx), y, Math.floor(cz)));
      if (b) return b;
    }
    return null;
  }

  function step(dt) {
    // input → desired velocity, camera-relative
    let ix = 0, iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz -= 1;
    if (keys.KeyS || keys.ArrowDown) iz += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;
    const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
    const vx = (ix * cos + iz * sin) * state.speed;
    const vz = (-ix * sin + iz * cos) * state.speed;
    state.vel.x = vx;
    state.vel.z = vz;

    if ((keys.Space) && state.onGround) {
      state.vel.y = state.jumpPower;
      state.onGround = false;
      E.sounds.jump();
      B.fireEvent(game.scripts, "ev_jump", api);
    }

    state.vel.y -= GRAVITY * dt;
    state.vel.y = Math.max(state.vel.y, -40);

    state.onGround = false;
    const hitY = moveAxis("y", state.vel.y * dt);
    const hitX = moveAxis("x", state.vel.x * dt);
    const hitZ = moveAxis("z", state.vel.z * dt);

    // touching special solids
    const touched = [hitY, hitX, hitZ].filter(Boolean);
    const under = state.onGround ? blockBelow() : null;
    if (under) touched.push(under);
    for (const b of touched) {
      if (b.type === "lava") return touchLava();
      if (b.type === "goal") return touchGoal();
      if (b.type === "bouncy" && b === under) {
        state.vel.y = state.jumpPower * 1.7;
        state.onGround = false;
        E.sounds.jump();
      }
    }

    // goal is not a full solid feel-wise — also allow walking into its space via proximity
    // coins: proximity collect
    const px = state.pos.x, py = state.pos.y, pz = state.pos.z;
    for (const [k, b] of coinsMap) {
      const dx = b.x + 0.5 - px, dy = b.y + 0.5 - (py + 0.7), dz = b.z + 0.5 - pz;
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
    if (state.pos.y < -12) touchLava();
  }

  function touchLava() {
    E.sounds.zap();
    respawn(false);
    B.fireEvent(game.scripts, "ev_lava", api);
  }

  function touchGoal() {
    B.fireEvent(game.scripts, "ev_goal", api);
    finish(true);
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

    if (!over) step(dt);

    // avatar follows physics position; face movement direction
    avatar.position.copy(state.pos);
    const moving = Math.abs(state.vel.x) + Math.abs(state.vel.z) > 0.5;
    if (moving) {
      avatar.rotation.y = Math.atan2(-state.vel.x, -state.vel.z);
      const swing = Math.sin(t / 90) * 0.5;
      avatar.userData.legs[0].rotation.x = swing;
      avatar.userData.legs[1].rotation.x = -swing;
    } else {
      avatar.userData.legs[0].rotation.x = 0;
      avatar.userData.legs[1].rotation.x = 0;
    }

    // camera orbit around player
    const target = new THREE.Vector3(state.pos.x, state.pos.y + 1.2, state.pos.z);
    camera.position.set(
      target.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      target.y + cam.dist * Math.sin(cam.pitch),
      target.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
    );
    camera.lookAt(target);

    // timer
    if (!over) {
      const secs = Math.floor((t - state.startTime) / 1000);
      document.getElementById("hud-time").textContent =
        Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
    }

    E.animateBlocks(meshMap, t / 1000);
    renderer.render(scene, camera);
  }

  window.GmfyPlayer = { init, start, stop, restart, resize };
})();
