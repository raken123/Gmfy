/* ============ Gmfy editor — 3D builder tools ============
 * Left-click applies the active tool (build / erase / paint / set start),
 * right-drag orbits the camera, wheel zooms. A translucent ghost cube
 * previews where the next block will land.
 */
(function () {
  const E = window.GmfyEngine;

  const COLORS = [
    "#e0e0e0", "#8d5524", "#6abe5e", "#3a86ff", "#ffbe0b",
    "#ff5d73", "#9b5de5", "#00bbf9", "#334155",
  ];

  let renderer, scene, camera, ground, meshMap, spawnMarker, ghost;
  let game = null;
  let active = false;
  let tool = "build";
  let blockType = "normal";
  let color = COLORS[0];
  let lockedTypes = new Set(); // block types this account hasn't unlocked
  let toastTimer = null;

  // orbit state
  const orbit = { target: new THREE.Vector3(0, 2, 0), dist: 18, yaw: 0.7, pitch: 0.5 };
  let dragging = false, lastX = 0, lastY = 0;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function init() {
    const canvas = document.getElementById("editor-canvas");
    renderer = E.makeRenderer(canvas);
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

    buildColorGrid(COLORS);

    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        tool = btn.dataset.tool;
        document.querySelectorAll(".tool-btn").forEach((n) => n.classList.remove("active"));
        btn.classList.add("active");
      });
    });
    document.querySelectorAll(".type-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("locked")) {
          showToast("🔒 Unlock this in the Credit Shop!");
          return;
        }
        blockType = btn.dataset.btype;
        document.querySelectorAll(".type-btn").forEach((n) => n.classList.remove("active"));
        btn.classList.add("active");
        // picking a block type implies you want to build
        document.querySelector('.tool-btn[data-tool="build"]').click();
        btn.classList.add("active");
      });
    });

    document.getElementById("sky-color").addEventListener("input", (e) => {
      if (!game) return;
      game.sky = e.target.value;
      scene.background = new THREE.Color(game.sky);
      scene.fog.color.copy(scene.background);
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", () => { dragging = false; });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      orbit.dist = Math.max(5, Math.min(70, orbit.dist + e.deltaY * 0.02));
    }, { passive: false });
    window.addEventListener("resize", resize);

    /* touch: tap = use tool, one-finger drag = orbit, pinch = zoom */
    const touch = { mode: null, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: false, dist: 0 };
    const pinchDist = (e) => Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touch.mode = "single";
        touch.x = touch.sx = t.clientX;
        touch.y = touch.sy = t.clientY;
        touch.t0 = performance.now();
        touch.moved = false;
      } else if (e.touches.length === 2) {
        touch.mode = "pinch";
        touch.dist = pinchDist(e);
      }
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (touch.mode === "pinch" && e.touches.length >= 2) {
        const d = pinchDist(e);
        if (d > 0) orbit.dist = Math.max(5, Math.min(70, orbit.dist * (touch.dist / d)));
        touch.dist = d;
      } else if (touch.mode === "single" && e.touches.length === 1) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - touch.sx, t.clientY - touch.sy) > 8) touch.moved = true;
        if (touch.moved) {
          orbit.yaw -= (t.clientX - touch.x) * 0.008;
          orbit.pitch = Math.max(0.08, Math.min(1.45, orbit.pitch + (t.clientY - touch.y) * 0.006));
        }
        touch.x = t.clientX; touch.y = t.clientY;
      }
    }, { passive: false });
    canvas.addEventListener("touchend", (e) => {
      if (touch.mode === "single" && !touch.moved &&
          performance.now() - touch.t0 < 500 && e.changedTouches.length) {
        const t = e.changedTouches[0];
        applyToolAt(t.clientX, t.clientY);
      }
      if (e.touches.length === 0) touch.mode = null;
      else if (e.touches.length === 1) { // dropping from pinch back to one finger
        touch.mode = "single";
        touch.x = touch.sx = e.touches[0].clientX;
        touch.y = touch.sy = e.touches[0].clientY;
        touch.moved = true; // don't treat the pinch remainder as a tap
      }
    });
  }

  function buildColorGrid(colors) {
    const grid = document.getElementById("color-grid");
    grid.innerHTML = "";
    colors.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "color-swatch" + (i === 0 ? " active" : "");
      b.style.background = c;
      b.title = c;
      b.addEventListener("click", () => {
        color = c;
        grid.querySelectorAll(".color-swatch").forEach((n) => n.classList.remove("active"));
        b.classList.add("active");
      });
      grid.appendChild(b);
    });
    color = colors[0];
  }

  function applyTypeLocks() {
    document.querySelectorAll(".type-btn").forEach((btn) => {
      const locked = lockedTypes.has(btn.dataset.btype);
      btn.classList.toggle("locked", locked);
      if (locked && btn.classList.contains("active")) {
        btn.classList.remove("active");
        blockType = "normal";
        document.querySelector('.type-btn[data-btype="normal"]').classList.add("active");
      }
    });
  }

  function showToast(msg) {
    let toast = document.getElementById("editor-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "editor-toast";
      toast.className = "editor-toast";
      document.querySelector(".editor-canvas-wrap").appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  /* opts: { lockedTypes: Set<string>, extraColors: string[] } */
  function open(g, opts) {
    opts = opts || {};
    lockedTypes = opts.lockedTypes || new Set();
    buildColorGrid(COLORS.concat(opts.extraColors || []));
    applyTypeLocks();
    game = g;
    const base = E.makeBaseScene(game.sky);
    scene = base.scene;
    ground = base.ground;
    meshMap = E.buildBlocks(scene, game.blocks);

    spawnMarker = E.makeSpawnMarker();
    scene.add(spawnMarker);
    updateSpawnMarker();

    ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    );
    ghost.visible = false;
    scene.add(ghost);

    document.getElementById("editor-game-name").value = game.name;
    document.getElementById("sky-color").value = game.sky;

    active = true;
    resize();
    requestAnimationFrame(loop);
  }

  function close() {
    active = false;
    if (game) {
      game.name = document.getElementById("editor-game-name").value.trim() || "Untitled Game";
    }
    return game;
  }

  /* Pull latest edits into the game object (used before test play / save). */
  function syncGame() {
    if (game) {
      game.name = document.getElementById("editor-game-name").value.trim() || "Untitled Game";
    }
    return game;
  }

  function updateSpawnMarker() {
    spawnMarker.position.set(game.spawn.x + 0.5, game.spawn.y, game.spawn.z + 0.5);
  }

  function resize() {
    if (!renderer) return;
    const wrap = document.querySelector(".editor-canvas-wrap");
    if (!wrap || !wrap.clientWidth) return;
    renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
  }

  function setPointer(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const targets = [ground, ...meshMap.values()];
    const hits = raycaster.intersectObjects(targets, true);
    return hits.length ? hits[0] : null;
  }

  /* Grid cell for placement: step off the hit face along its normal. */
  function placementCell(hit) {
    const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    // normals are in object space; blocks/ground are axis-aligned so world == object here
    const p = hit.point.clone().add(n.multiplyScalar(0.5));
    const cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    if (cell.y < 0) cell.y = 0;
    const half = E.GROUND_SIZE / 2;
    if (cell.x < -half || cell.x >= half || cell.z < -half || cell.z >= half || cell.y > 40) return null;
    return cell;
  }

  function hitBlockRoot(hit) {
    let obj = hit.object;
    while (obj && !obj.userData.block && obj.parent) obj = obj.parent;
    return obj && obj.userData.block ? obj : null;
  }

  function onMouseDown(e) {
    if (e.button === 2 || e.button === 1) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      return;
    }
    if (e.button !== 0) return;
    applyToolAt(e.clientX, e.clientY);
  }

  function applyToolAt(clientX, clientY) {
    if (!game) return;
    setPointer({ clientX, clientY });
    const hit = pick();
    if (!hit) return;

    if (tool === "build") {
      const cell = placementCell(hit);
      if (!cell) return;
      const k = E.key(cell.x, cell.y, cell.z);
      if (meshMap.has(k)) return;
      const block = { x: cell.x, y: cell.y, z: cell.z, type: blockType };
      if (blockType === "normal") block.color = color;
      game.blocks.push(block);
      const mesh = E.createBlockMesh(block);
      scene.add(mesh);
      meshMap.set(k, mesh);
      E.sounds.pop();
    } else if (tool === "erase") {
      const root = hitBlockRoot(hit);
      if (!root) return;
      const b = root.userData.block;
      const k = E.key(b.x, b.y, b.z);
      scene.remove(root);
      meshMap.delete(k);
      game.blocks = game.blocks.filter((x) => x !== b);
    } else if (tool === "paint") {
      const root = hitBlockRoot(hit);
      if (!root || root.userData.block.type !== "normal") return;
      root.userData.block.color = color;
      root.material.color.set(color);
    } else if (tool === "spawn") {
      const cell = placementCell(hit);
      if (!cell) return;
      game.spawn = { x: cell.x, y: cell.y, z: cell.z };
      updateSpawnMarker();
      E.sounds.pop();
    }
  }

  function onMouseMove(e) {
    if (!active) return;
    if (dragging) {
      orbit.yaw -= (e.clientX - lastX) * 0.006;
      orbit.pitch = Math.max(0.08, Math.min(1.45, orbit.pitch + (e.clientY - lastY) * 0.005));
      lastX = e.clientX; lastY = e.clientY;
      return;
    }
    if (e.target !== renderer.domElement) { ghost.visible = false; return; }
    setPointer(e);
    const hit = pick();
    if (hit && (tool === "build" || tool === "spawn")) {
      const cell = placementCell(hit);
      if (cell) {
        ghost.visible = true;
        ghost.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
        return;
      }
    }
    ghost.visible = false;
  }

  function loop(t) {
    if (!active) return;
    requestAnimationFrame(loop);
    camera.position.set(
      orbit.target.x + orbit.dist * Math.cos(orbit.pitch) * Math.sin(orbit.yaw),
      orbit.target.y + orbit.dist * Math.sin(orbit.pitch),
      orbit.target.z + orbit.dist * Math.cos(orbit.pitch) * Math.cos(orbit.yaw)
    );
    camera.lookAt(orbit.target);
    E.animateBlocks(meshMap, t / 1000);
    renderer.render(scene, camera);
  }

  window.GmfyEditor = { init, open, close, syncGame, resize };
})();
