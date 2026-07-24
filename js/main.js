/* ============ Gmfy main — app flow ============
 * Screens, Edu/Home modes, class codes, dashboards, sharing and the glue
 * between the editor, block coding and the player.
 */
(function () {
  const S = window.GmfyStore;
  const B = window.GmfyBlocks;

  let profile = null;          // { mode:'edu'|'home', name, role?, classCode? }
  let editingGame = null;      // game currently open in the editor
  let playReturn = "dashboard";// where Exit from play goes: 'dashboard' | 'editor'
  let shareGameRef = null;     // game shown in the share modal

  const $ = (id) => document.getElementById(id);

  /* ---- screens ---- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
    if (id === "screen-editor") GmfyEditor.resize();
    if (id === "screen-play") GmfyPlayer.resize();
  }

  /* ---- modals ---- */
  function openModal(id) {
    $("modal-backdrop").hidden = false;
    document.querySelectorAll(".modal").forEach((m) => (m.hidden = m.id !== id));
  }
  function closeModal() { $("modal-backdrop").hidden = true; }

  function copyText(text, doneCb) {
    const done = () => doneCb && doneCb();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
    done();
  }

  /* ============ landing & entry ============ */
  $("btn-mode-edu").addEventListener("click", () => showScreen("screen-edu"));
  $("btn-mode-home").addEventListener("click", () => showScreen("screen-home"));
  document.querySelectorAll(".btn-back").forEach((b) =>
    b.addEventListener("click", () => showScreen(b.dataset.goto)));

  $("btn-enter-home").addEventListener("click", () => {
    const name = $("home-name").value.trim() || "Player";
    profile = { mode: "home", name };
    S.setProfile(profile);
    enterDashboard();
  });

  $("btn-join-class").addEventListener("click", () => {
    const name = $("edu-student-name").value.trim();
    const code = $("edu-class-code").value.trim().toUpperCase();
    const err = $("edu-join-error");
    if (!name) { err.textContent = "Please enter your name!"; return; }
    if (!/^[A-Z0-9]{6}$/.test(code)) { err.textContent = "Class Codes are 6 letters/numbers, like ABC123."; return; }
    err.textContent = "";
    // If this device hasn't seen the class yet, register it so the library works locally.
    if (!S.getClass(code)) {
      const classes = JSON.parse(localStorage.getItem("gmfy.classes") || "{}");
      classes[code] = { code, name: "Class " + code, teacher: "", games: [], created: Date.now() };
      localStorage.setItem("gmfy.classes", JSON.stringify(classes));
    }
    profile = { mode: "edu", role: "student", name, classCode: code };
    S.setProfile(profile);
    enterDashboard();
  });

  $("btn-create-class").addEventListener("click", () => {
    const teacher = $("edu-teacher-name").value.trim() || "Teacher";
    const className = $("edu-class-name").value.trim() || "My Class";
    const cls = S.createClass(className, teacher);
    profile = { mode: "edu", role: "teacher", name: teacher, classCode: cls.code };
    S.setProfile(profile);
    $("created-class-code").textContent = cls.code;
    openModal("modal-class-created");
  });
  $("btn-copy-class-code").addEventListener("click", (e) => {
    copyText($("created-class-code").textContent, () => { e.target.textContent = "✅ Copied!"; });
  });
  $("btn-enter-class").addEventListener("click", () => { closeModal(); enterDashboard(); });

  $("btn-logout").addEventListener("click", () => {
    S.clearProfile();
    profile = null;
    showScreen("screen-landing");
  });
  $("btn-dash-logo").addEventListener("click", () => showScreen("screen-landing"));

  /* ============ dashboard ============ */
  function enterDashboard() {
    const isEdu = profile.mode === "edu";
    const badge = $("dash-mode-badge");
    badge.textContent = isEdu ? "EDU MODE" : "HOME MODE";
    badge.className = "badge " + (isEdu ? "edu" : "home");
    $("dash-username").textContent = profile.name;
    const pill = $("dash-classcode");
    pill.textContent = isEdu ? "Class: " + profile.classCode : "";
    $("tab-class").style.display = isEdu ? "" : "none";
    selectTab("mine");
    renderGrids();
    showScreen("screen-dashboard");
  }

  $("dash-classcode").addEventListener("click", () => {
    copyText(profile.classCode, () => {
      const pill = $("dash-classcode");
      pill.textContent = "Copied! ✅";
      setTimeout(() => { pill.textContent = "Class: " + profile.classCode; }, 1200);
    });
  });

  function selectTab(tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    document.querySelectorAll(".tab-page").forEach((p) => p.classList.toggle("active", p.id === "page-" + tab));
  }
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => { selectTab(t.dataset.tab); renderGrids(); }));

  const GAME_EMOJIS = ["🌋", "🏰", "🌈", "🚀", "🐉", "🏝️", "❄️", "🌵", "🎢", "🧊"];
  function gameEmoji(g) {
    let h = 0;
    for (const ch of g.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return GAME_EMOJIS[h % GAME_EMOJIS.length];
  }

  function gameCard(g, opts) {
    const card = document.createElement("div");
    card.className = "game-card";
    const blocks = g.blocks ? g.blocks.length : 0;
    const coins = g.blocks ? g.blocks.filter((b) => b.type === "coin").length : 0;
    card.innerHTML =
      '<div class="g-emoji">' + gameEmoji(g) + "</div>" +
      '<div class="g-name"></div>' +
      '<div class="g-meta">by <span class="g-author"></span> · ' + blocks + " blocks · 🪙 " + coins + "</div>" +
      '<div class="g-actions"></div>';
    card.querySelector(".g-name").textContent = g.name;
    card.querySelector(".g-author").textContent = g.author || "?";
    const actions = card.querySelector(".g-actions");
    const addBtn = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = "btn " + cls;
      b.textContent = label;
      b.addEventListener("click", fn);
      actions.appendChild(b);
    };
    addBtn("▶ Play", "primary", () => playGame(g, "dashboard"));
    if (opts.editable) {
      addBtn("✏️ Edit", "secondary", () => openEditor(g));
      addBtn("📤 Share", "ghost", () => openShareModal(g));
      addBtn("🗑", "ghost", () => {
        if (confirm('Delete "' + g.name + '"? This can\'t be undone.')) {
          S.deleteGame(g.id);
          renderGrids();
        }
      });
    } else {
      addBtn("🎨 Remix", "secondary", () => {
        const copy = JSON.parse(JSON.stringify(g));
        copy.id = S.uid();
        copy.name = g.name + " (remix)";
        copy.author = profile.name;
        S.saveGame(copy);
        selectTab("mine");
        renderGrids();
      });
      if (profile.role === "teacher") {
        addBtn("🗑", "ghost", () => {
          if (confirm('Remove "' + g.name + '" from the class library?')) {
            S.removeFromClass(profile.classCode, g.id);
            renderGrids();
          }
        });
      }
    }
    return card;
  }

  function renderGrids() {
    const mine = S.getGames();
    const gridM = $("grid-mine");
    gridM.innerHTML = "";
    mine.forEach((g) => gridM.appendChild(gameCard(g, { editable: true })));
    $("empty-mine").hidden = mine.length > 0;

    if (profile && profile.mode === "edu") {
      const cls = S.getClass(profile.classCode);
      const games = cls ? cls.games : [];
      $("class-note").textContent = cls
        ? "📚 " + (cls.name || "Class " + cls.code) + " — games shared by everyone in class " + profile.classCode
        : "";
      const gridC = $("grid-class");
      gridC.innerHTML = "";
      games.forEach((g) => gridC.appendChild(gameCard(g, { editable: false })));
      $("empty-class").hidden = games.length > 0;
    }
  }

  $("btn-new-game").addEventListener("click", () => {
    const g = S.newGame(profile.name);
    S.saveGame(g);
    openEditor(g);
  });

  /* ---- import ---- */
  $("btn-import").addEventListener("click", () => {
    const msg = $("import-msg");
    const game = S.decodeGame($("import-code").value);
    if (!game) {
      msg.textContent = "Hmm, that code doesn't look right. Make sure you copied the whole thing!";
      msg.className = "hint";
      return;
    }
    S.saveGame(game);
    $("import-code").value = "";
    msg.textContent = '✅ "' + game.name + '" by ' + game.author + " added to My Games!";
    msg.className = "hint ok";
    renderGrids();
  });

  /* ---- share ---- */
  function openShareModal(g) {
    shareGameRef = g;
    $("share-code").value = S.encodeGame(g);
    $("share-msg").textContent = "";
    $("btn-copy-code").textContent = "📋 Copy Code";
    $("btn-share-class").hidden = !(profile.mode === "edu");
    openModal("modal-share");
  }
  $("btn-copy-code").addEventListener("click", () => {
    copyText($("share-code").value, () => { $("btn-copy-code").textContent = "✅ Copied!"; });
  });
  $("btn-share-class").addEventListener("click", () => {
    if (S.shareToClass(profile.classCode, shareGameRef, profile.name)) {
      $("share-msg").textContent = "✅ Shared to class " + profile.classCode + "! Classmates on this device can see it in the Class Library.";
      $("share-msg").className = "hint ok";
      renderGrids();
    }
  });
  document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModal));
  $("modal-backdrop").addEventListener("click", (e) => {
    if (e.target === $("modal-backdrop")) closeModal();
  });

  /* ============ editor ============ */
  function openEditor(g) {
    editingGame = g;
    showScreen("screen-editor");
    GmfyEditor.open(g);
    B.loadWorkspace($("block-workspace"), g.scripts);
    $("code-drawer").classList.remove("open");
  }

  function saveEditorGame() {
    const g = GmfyEditor.syncGame();
    if (!g) return null;
    g.scripts = B.serializeWorkspace($("block-workspace"));
    S.saveGame(g);
    return g;
  }

  $("btn-editor-exit").addEventListener("click", () => {
    saveEditorGame();
    GmfyEditor.close();
    editingGame = null;
    enterDashboard();
  });

  $("btn-editor-code").addEventListener("click", () => $("code-drawer").classList.toggle("open"));
  $("btn-code-close").addEventListener("click", () => $("code-drawer").classList.remove("open"));

  $("btn-editor-test").addEventListener("click", () => {
    const g = saveEditorGame();
    if (g) playGame(g, "editor");
  });

  /* ============ play ============ */
  function playGame(g, returnTo) {
    playReturn = returnTo;
    showScreen("screen-play");
    GmfyPlayer.start(JSON.parse(JSON.stringify(g)), exitPlay);
  }
  function exitPlay() {
    GmfyPlayer.stop();
    if (playReturn === "editor" && editingGame) {
      showScreen("screen-editor");
      GmfyEditor.resize();
    } else {
      enterDashboard();
    }
  }
  $("btn-play-exit").addEventListener("click", exitPlay);
  $("btn-overlay-exit").addEventListener("click", exitPlay);
  $("btn-play-again").addEventListener("click", () => GmfyPlayer.restart());

  /* ============ sample game (first run) ============ */
  function seedSample() {
    if (localStorage.getItem("gmfy.seeded")) return;
    localStorage.setItem("gmfy.seeded", "1");
    const g = S.newGame("Team Gmfy");
    g.name = "Coin Canyon (starter)";
    g.sky = "#8ecdff";
    g.spawn = { x: 0, y: 1, z: 8 };
    const add = (x, y, z, type, color) => g.blocks.push({ x, y, z, type, color });
    // path with rising steps
    for (let z = 6; z >= -2; z--) add(0, 0, z, "normal", "#8d5524");
    add(0, 1, -3, "normal", "#8d5524");
    add(0, 2, -4, "normal", "#8d5524");
    // lava moat around a bouncy shortcut
    for (let x = -2; x <= 2; x++) add(x, 0, -6, "lava");
    add(0, 0, -5, "bouncy");
    // landing platform + coins
    for (let x = -2; x <= 2; x++) for (let z = -10; z <= -8; z++) add(x, 0, z, "normal", "#6abe5e");
    add(-2, 1, 4, "coin"); add(2, 1, 2, "coin"); add(0, 1, 0, "coin");
    add(0, 3, -4, "coin"); add(-1, 1, -9, "coin"); add(1, 1, -9, "coin");
    // towers for decoration
    for (let y = 0; y < 3; y++) { add(-3, y, -9, "normal", "#3a86ff"); add(3, y, -9, "normal", "#3a86ff"); }
    add(0, 1, -9, "goal");
    g.scripts = [
      { event: "ev_start", blocks: [
        { type: "say", args: { text: "Grab the coins, reach the flag!", secs: 3 } },
      ]},
      { event: "ev_coin", blocks: [
        { type: "add_score", args: { n: 5 } },
      ]},
      { event: "ev_lava", blocks: [
        { type: "say", args: { text: "Ouch! Watch out for lava! 🔥", secs: 2 } },
      ]},
    ];
    S.saveGame(g);
  }

  /* ============ boot ============ */
  GmfyEditor.init();
  GmfyPlayer.init();
  B.initPalette($("block-palette"));
  B.initTrash($("ws-trash"));
  B.makeDropZone($("block-workspace"));
  seedSample();

  profile = S.getProfile();
  if (profile && profile.mode) enterDashboard();
  else showScreen("screen-landing");
})();
