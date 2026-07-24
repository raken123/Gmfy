/* ============ Gmfy main — app flow ============
 * Accounts (Home / Student / Teacher), screens, dashboards, sharing and the
 * glue between the editor, block coding and the player.
 */
(function () {
  const S = window.GmfyStore;
  const B = window.GmfyBlocks;

  let account = null;          // logged-in account
  let editingGame = null;      // game currently open in the editor
  let playReturn = "dashboard";// where Exit from play goes: 'dashboard' | 'editor'
  let shareGameRef = null;     // game shown in the share modal
  let pendingAccount = null;   // account waiting on a PIN
  let signupType = null;

  const AVATARS = ["🙂", "😎", "🦊", "🐼", "🐸", "🦄", "🤖", "👾", "🐙", "🦖", "🐱", "🚀"];

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

  const TYPE_LABEL = { home: "HOME", student: "STUDENT", teacher: "TEACHER" };
  const TYPE_BADGE = { home: "home", student: "edu", teacher: "edu" };

  /* ============ landing — account picker ============ */
  function renderAccountGrid() {
    const grid = $("account-grid");
    grid.innerHTML = "";
    for (const acc of S.getAccounts()) {
      const card = document.createElement("button");
      card.className = "account-card";
      card.innerHTML =
        '<span class="acc-avatar"></span>' +
        '<span class="acc-name"></span>' +
        '<span class="acc-type"></span>';
      card.querySelector(".acc-avatar").textContent = acc.avatar;
      card.querySelector(".acc-name").textContent = acc.name + (acc.pin ? " 🔒" : "");
      card.querySelector(".acc-type").textContent =
        acc.type === "home" ? "🏠 Home" : acc.type === "student" ? "🎒 Student" : "🍎 Teacher";
      card.addEventListener("click", () => tryLogin(acc));
      grid.appendChild(card);
    }
    const add = document.createElement("button");
    add.className = "account-card add";
    add.innerHTML = '<span class="acc-avatar">＋</span><span class="acc-name">New Account</span><span class="acc-type">Home · Student · Teacher</span>';
    add.addEventListener("click", () => openSignup());
    grid.appendChild(add);
  }

  function tryLogin(acc) {
    if (!acc.pin) return login(acc);
    pendingAccount = acc;
    $("pin-title").textContent = "🔒 Hi " + acc.name + "!";
    $("pin-sub").textContent = "Enter your 4-digit PIN to unlock your account.";
    $("pin-input").value = "";
    $("pin-error").textContent = "";
    openModal("modal-pin");
    setTimeout(() => $("pin-input").focus(), 50);
  }
  $("btn-pin-ok").addEventListener("click", () => {
    if (!pendingAccount) return;
    if ($("pin-input").value === pendingAccount.pin) {
      closeModal();
      const acc = pendingAccount;
      pendingAccount = null;
      login(acc);
    } else {
      $("pin-error").textContent = "That's not it — try again!";
      $("pin-input").value = "";
      $("pin-input").focus();
    }
  });
  $("pin-input") && $("pin-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-pin-ok").click();
  });

  function login(acc) {
    account = acc;
    S.setSession(acc.id);
    seedStarterFor(acc);
    enterDashboard();
  }

  /* ============ sign up ============ */
  function openSignup() {
    signupType = null;
    document.querySelectorAll(".type-card").forEach((c) => c.classList.remove("active"));
    $("signup-fields").hidden = true;
    $("signup-name").value = "";
    $("signup-pin").value = "";
    $("signup-classcode").value = "";
    $("signup-classname").value = "";
    $("signup-error").textContent = "";
    showScreen("screen-signup");
  }

  document.querySelectorAll(".type-card").forEach((card) => {
    card.addEventListener("click", () => {
      signupType = card.dataset.actype;
      document.querySelectorAll(".type-card").forEach((c) => c.classList.toggle("active", c === card));
      $("signup-fields").hidden = false;
      $("signup-classcode-wrap").hidden = signupType !== "student";
      $("signup-classname-wrap").hidden = signupType !== "teacher";
    });
  });

  // avatar picker
  (function buildAvatarRow() {
    const row = $("avatar-row");
    AVATARS.forEach((a, i) => {
      const b = document.createElement("button");
      b.className = "avatar-btn" + (i === 0 ? " active" : "");
      b.type = "button";
      b.textContent = a;
      b.addEventListener("click", () => {
        row.querySelectorAll(".avatar-btn").forEach((n) => n.classList.remove("active"));
        b.classList.add("active");
      });
      row.appendChild(b);
    });
  })();

  $("btn-signup-create").addEventListener("click", () => {
    const err = $("signup-error");
    const name = $("signup-name").value.trim();
    const pin = $("signup-pin").value.trim();
    const avatar = ($("avatar-row").querySelector(".avatar-btn.active") || {}).textContent || "🙂";
    if (!signupType) { err.textContent = "Pick an account type first!"; return; }
    if (!name) { err.textContent = "Please enter your name!"; return; }
    if (pin && !/^\d{4}$/.test(pin)) { err.textContent = "PINs are exactly 4 digits (or leave it empty)."; return; }

    let classCode = "";
    if (signupType === "student") {
      classCode = $("signup-classcode").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(classCode)) {
        err.textContent = "Class Codes are 6 letters/numbers, like ABC123.";
        return;
      }
      S.registerClass(classCode);
    }
    const acc = S.createAccount({ name, type: signupType, avatar, pin, classCode });
    if (signupType === "teacher") {
      const className = $("signup-classname").value.trim() || name + "'s Class";
      const cls = S.createClass(className, name);
      acc.classCode = cls.code;
      S.updateAccount(acc);
      account = acc;
      S.setSession(acc.id);
      seedStarterFor(acc);
      $("created-class-code").textContent = cls.code;
      $("btn-copy-class-code").textContent = "📋 Copy Code";
      openModal("modal-class-created");
      return; // dashboard entered from the modal's button
    }
    login(acc);
  });

  $("btn-copy-class-code").addEventListener("click", (e) => {
    copyText($("created-class-code").textContent, () => { e.target.textContent = "✅ Copied!"; });
  });
  $("btn-enter-class").addEventListener("click", () => { closeModal(); enterDashboard(); });

  document.querySelectorAll(".btn-back").forEach((b) =>
    b.addEventListener("click", () => { renderAccountGrid(); showScreen(b.dataset.goto); }));

  $("btn-logout").addEventListener("click", () => {
    S.clearSession();
    account = null;
    renderAccountGrid();
    showScreen("screen-landing");
  });
  $("btn-dash-logo").addEventListener("click", () => {
    renderAccountGrid();
    showScreen("screen-landing");
  });

  /* ============ starter game (seeded per account) ============ */
  function seedStarterFor(acc) {
    if (acc.seeded) return;
    acc.seeded = true;
    S.updateAccount(acc);
    const g = S.newGame("Team Gmfy", acc.id);
    g.name = "Coin Canyon (starter)";
    g.sky = "#8ecdff";
    g.spawn = { x: 0, y: 1, z: 8 };
    const add = (x, y, z, type, color) => g.blocks.push({ x, y, z, type, color });
    for (let z = 6; z >= -2; z--) add(0, 0, z, "normal", "#8d5524");
    add(0, 1, -3, "normal", "#8d5524");
    add(0, 2, -4, "normal", "#8d5524");
    for (let x = -2; x <= 2; x++) add(x, 0, -6, "lava");
    add(0, 0, -5, "bouncy");
    for (let x = -2; x <= 2; x++) for (let z = -10; z <= -8; z++) add(x, 0, z, "normal", "#6abe5e");
    add(-2, 1, 4, "coin"); add(2, 1, 2, "coin"); add(0, 1, 0, "coin");
    add(0, 3, -4, "coin"); add(-1, 1, -9, "coin"); add(1, 1, -9, "coin");
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

  /* ============ dashboard ============ */
  const isEdu = () => account && (account.type === "student" || account.type === "teacher");

  function enterDashboard() {
    const badge = $("dash-mode-badge");
    badge.textContent = TYPE_LABEL[account.type];
    badge.className = "badge " + TYPE_BADGE[account.type];
    $("dash-avatar").textContent = account.avatar;
    $("dash-username").textContent = account.name;
    const pill = $("dash-classcode");
    pill.textContent = isEdu() && account.classCode ? "Class: " + account.classCode : "";
    $("tab-class").style.display = isEdu() ? "" : "none";
    selectTab("mine");
    renderGrids();
    showScreen("screen-dashboard");
  }

  $("dash-classcode").addEventListener("click", () => {
    copyText(account.classCode, () => {
      const pill = $("dash-classcode");
      pill.textContent = "Copied! ✅";
      setTimeout(() => { pill.textContent = "Class: " + account.classCode; }, 1200);
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
        copy.owner = account.id;
        copy.name = g.name + " (remix)";
        copy.author = account.name;
        S.saveGame(copy);
        selectTab("mine");
        renderGrids();
      });
      if (account.type === "teacher") {
        addBtn("🗑", "ghost", () => {
          if (confirm('Remove "' + g.name + '" from the class library?')) {
            S.removeFromClass(account.classCode, g.id);
            renderGrids();
          }
        });
      }
    }
    return card;
  }

  function renderGrids() {
    const mine = S.getGames(account.id);
    const gridM = $("grid-mine");
    gridM.innerHTML = "";
    mine.forEach((g) => gridM.appendChild(gameCard(g, { editable: true })));
    $("empty-mine").hidden = mine.length > 0;

    if (isEdu()) {
      const cls = S.getClass(account.classCode);
      const games = cls ? cls.games : [];
      $("class-note").textContent = cls
        ? "📚 " + (cls.name || "Class " + cls.code) + " — games shared by everyone in class " + account.classCode
        : "";
      const gridC = $("grid-class");
      gridC.innerHTML = "";
      games.forEach((g) => gridC.appendChild(gameCard(g, { editable: false })));
      $("empty-class").hidden = games.length > 0;
    }
  }

  $("btn-new-game").addEventListener("click", () => {
    const g = S.newGame(account.name, account.id);
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
    game.owner = account.id;
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
    $("btn-share-class").hidden = !(isEdu() && account.classCode);
    openModal("modal-share");
  }
  $("btn-copy-code").addEventListener("click", () => {
    copyText($("share-code").value, () => { $("btn-copy-code").textContent = "✅ Copied!"; });
  });
  $("btn-share-class").addEventListener("click", () => {
    if (S.shareToClass(account.classCode, shareGameRef, account.name)) {
      $("share-msg").textContent = "✅ Shared to class " + account.classCode + "! Classmates on this device can see it in the Class Library.";
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

  /* ============ boot ============ */
  document.body.classList.toggle(
    "can-touch",
    "ontouchstart" in window || navigator.maxTouchPoints > 0
  );
  GmfyEditor.init();
  GmfyPlayer.init();
  B.initPalette($("block-palette"));
  B.initTrash($("ws-trash"));
  B.makeDropZone($("block-workspace"));
  S.migrate();

  const sessionId = S.getSession();
  const sessionAcc = sessionId ? S.getAccount(sessionId) : null;
  if (sessionAcc) {
    account = sessionAcc;
    seedStarterFor(account);
    enterDashboard();
  } else {
    renderAccountGrid();
    showScreen("screen-landing");
  }
})();
