/* ============ Gmfy engine — shared Three.js scene building ============
 * Turns a game's block list into meshes. Used by both the editor and the player.
 * Blocks live on an integer grid; a block at (x,y,z) is a unit cube centred at
 * (x + .5, y + .5, z + .5).
 */
(function () {
  const GROUND_SIZE = 64;

  const BLOCK_TYPES = {
    normal: { label: "Block" },
    coin:   { label: "Coin",   color: "#ffd60a" },
    goal:   { label: "Goal",   color: "#52d273" },
    lava:   { label: "Lava",   color: "#ff6d00" },
    bouncy: { label: "Bouncy", color: "#d15cff" },
  };

  function key(x, y, z) { return x + "," + y + "," + z; }

  function makeRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  }

  function makeBaseScene(skyColor) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(skyColor || "#7ec8ff");
    scene.fog = new THREE.Fog(scene.background, 60, 140);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x445588, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
    sun.position.set(18, 32, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(GROUND_SIZE, 1, GROUND_SIZE),
      new THREE.MeshLambertMaterial({ color: 0x6abe5e })
    );
    ground.position.set(0, -0.5, 0);
    ground.receiveShadow = true;
    ground.name = "ground";
    scene.add(ground);

    const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE, 0xffffff, 0xffffff);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.position.y = 0.01;
    scene.add(grid);

    return { scene, ground, grid };
  }

  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 24);

  function createBlockMesh(block) {
    let mesh;
    switch (block.type) {
      case "coin": {
        const mat = new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.7, roughness: 0.25, emissive: 0x332200 });
        mesh = new THREE.Mesh(coinGeo, mat);
        mesh.rotation.x = Math.PI / 2;
        break;
      }
      case "goal": {
        const group = new THREE.Group();
        const base = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: 0x52d273, emissive: 0x0a5522 }));
        base.scale.set(1, 0.2, 1);
        base.position.y = -0.4;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
          new THREE.MeshLambertMaterial({ color: 0xdddddd }));
        pole.position.y = 0.3;
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.04),
          new THREE.MeshLambertMaterial({ color: 0x52d273 }));
        flag.position.set(0.3, 0.75, 0);
        group.add(base, pole, flag);
        mesh = group;
        break;
      }
      case "lava": {
        const mat = new THREE.MeshStandardMaterial({ color: 0xff6d00, emissive: 0xcc2200, emissiveIntensity: 0.7, roughness: 0.9 });
        mesh = new THREE.Mesh(cubeGeo, mat);
        mesh.scale.y = 0.96;
        break;
      }
      case "bouncy": {
        const mat = new THREE.MeshStandardMaterial({ color: 0xd15cff, roughness: 0.3, metalness: 0.1 });
        mesh = new THREE.Mesh(cubeGeo, mat);
        break;
      }
      default: {
        const mat = new THREE.MeshLambertMaterial({ color: block.color || "#e0e0e0" });
        mesh = new THREE.Mesh(cubeGeo, mat);
      }
    }
    mesh.traverse ? mesh.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }) : null;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    mesh.userData.block = block;
    return mesh;
  }

  /* Builds all block meshes into the scene. Returns a map key -> mesh. */
  function buildBlocks(scene, blocks) {
    const map = new Map();
    for (const b of blocks) {
      const mesh = createBlockMesh(b);
      scene.add(mesh);
      map.set(key(b.x, b.y, b.z), mesh);
    }
    return map;
  }

  /* Animated bits (coin spin, flag wave) — call every frame with elapsed seconds. */
  function animateBlocks(meshMap, t) {
    for (const mesh of meshMap.values()) {
      const b = mesh.userData.block;
      if (!b) continue;
      if (b.type === "coin") {
        mesh.rotation.z = t * 2.5;
        mesh.position.y = b.y + 0.5 + Math.sin(t * 3 + b.x + b.z) * 0.08;
      } else if (b.type === "goal") {
        mesh.rotation.y = Math.sin(t * 1.5) * 0.15;
      }
    }
  }

  function makeSpawnMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.06, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.4, 12),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 })
    );
    arrow.position.y = 0.9;
    arrow.rotation.x = Math.PI;
    group.add(ring, arrow);
    return group;
  }

  /* Simple blocky avatar for play mode. */
  function makeAvatar() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffb703 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.35), bodyMat);
    body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshLambertMaterial({ color: 0xffe0b3 }));
    head.position.y = 1.15;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const eyeGeo = new THREE.BoxGeometry(0.07, 0.1, 0.05);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.11, 1.18, -0.235);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.11;
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3a86ff });
    const legGeo = new THREE.BoxGeometry(0.2, 0.4, 0.25);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, 0.2, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    group.add(body, head, eyeL, eyeR, legL, legR);
    group.traverse((o) => { o.castShadow = true; });
    group.userData.legs = [legL, legR];
    return group;
  }

  /* ---- tiny sound effects (WebAudio, no assets) ---- */
  let audioCtx = null;
  function beep(freq, dur, type, vol) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio blocked — fine */ }
  }
  const sounds = {
    coin: () => { beep(900, 0.08, "square"); setTimeout(() => beep(1400, 0.12, "square"), 70); },
    jump: () => beep(300, 0.12, "triangle", 0.1),
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, "triangle", 0.1), i * 130)),
    zap: () => beep(120, 0.25, "sawtooth", 0.12),
    pop: () => beep(600, 0.06, "sine", 0.1),
  };

  window.GmfyEngine = {
    GROUND_SIZE, BLOCK_TYPES, key,
    makeRenderer, makeBaseScene, createBlockMesh, buildBlocks, animateBlocks,
    makeSpawnMarker, makeAvatar, sounds,
  };
})();
