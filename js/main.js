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

  /* Credit Shop catalog: time-limited unlocks students buy with credits. */
  const SHOP_ITEMS = [
    { id: "glow",       emoji: "🌟", name: "Glow Block",     desc: "A shining block that pulses with light.",              cost: 3, days: 3, kind: "block" },
    { id: "speed",      emoji: "⚡", name: "Speed Pad",      desc: "Players zoom while running across it!",                cost: 4, days: 3, kind: "block" },
    { id: "checkpoint", emoji: "📍", name: "Checkpoint",     desc: "Players respawn at the last checkpoint they touched.", cost: 5, days: 3, kind: "block" },
    { id: "rainbow",    emoji: "🌈", name: "Rainbow Colors", desc: "Six extra shiny colors for your blocks.",              cost: 2, days: 7, kind: "colors" },
  ];
  const RAINBOW_COLORS = ["#ffd700", "#ff6ad5", "#7cffcb", "#b967ff", "#01cdfe", "#fffb96"];

  /* Which editor extras this account may use. Students earn them through the
   * Credit Shop; Home players and teachers get everything. */
  function editorOptsFor(acc) {
    if (!acc || acc.type !== "student") {
      return { lockedTypes: new Set(), extraColors: RAINBOW_COLORS };
    }
    const locked = new Set();
    for (const it of SHOP_ITEMS) {
      if (it.kind === "block" && !S.hasUnlock(acc, it.id)) locked.add(it.id);
    }
    return { lockedTypes: locked, extraColors: S.hasUnlock(acc, "rainbow") ? RAINBOW_COLORS : [] };
  }

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
    // students created before the roster existed get added on login
    if (acc.type === "student" && acc.classCode) S.joinRoster(acc.classCode, acc);
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
      if (!S.classHasSpace(classCode)) {
        err.textContent = "That class is full (" + S.MAX_STUDENTS + " students). Ask your teacher!";
        return;
      }
      S.registerClass(classCode);
    }
    const acc = S.createAccount({ name, type: signupType, avatar, pin, classCode });
    if (signupType === "student") S.joinRoster(classCode, acc);
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
    $("tab-assign").style.display = isEdu() ? "" : "none";
    $("tab-pg").style.display = isEdu() ? "" : "none";
    $("tab-students").style.display = account.type === "teacher" ? "" : "none";
    $("tab-shop").style.display = account.type === "student" ? "" : "none";
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
    t.addEventListener("click", () => {
      selectTab(t.dataset.tab);
      renderGrids();
      if (t.dataset.tab === "assign") renderAssignments();
      if (t.dataset.tab === "pg") renderPlaygroundList();
      if (t.dataset.tab === "students") renderStudents();
      if (t.dataset.tab === "shop") renderShop();
    }));

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
        if (opts.playground) {
          addBtn("🗑", "ghost", () => {
            if (confirm('Remove "' + g.name + '" from this playground?')) {
              S.removeFromPlayground(account.classCode, opts.playground, g.id);
              openPlayground(opts.playground);
            }
          });
        } else {
          addBtn("🗑", "ghost", () => {
            if (confirm('Remove "' + g.name + '" from the class library?')) {
              S.removeFromClass(account.classCode, g.id);
              renderGrids();
            }
          });
        }
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
    GmfyEditor.open(g, editorOptsFor(account));
    B.loadWorkspace($("block-workspace"), g.scripts);
    $("code-drawer").classList.remove("open");
  }

  function saveEditorGame() {
    const g = GmfyEditor.syncGame();
    if (!g) return null;
    g.scripts = B.serializeWorkspace($("block-workspace"));
    S.saveGame(g);
    // playground games publish themselves to the playground on every save
    if (g.pg) S.publishToPlayground(g.pg.classCode, g.pg.pgId, g, account.name);
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

  /* ============ assignments ============ */
  let currentAssignment = null;

  function renderAssignments() {
    const cls = S.getClass(account.classCode);
    const list = $("assign-list");
    list.innerHTML = "";
    const assignments = cls ? cls.assignments : [];
    const isTeacher = account.type === "teacher";
    $("btn-new-assign").hidden = !isTeacher;

    if (isTeacher) {
      $("assign-stats").textContent = assignments.length + " assignment" + (assignments.length === 1 ? "" : "s");
    } else {
      const pts = S.studentPoints(account.classCode, account.id);
      const credits = S.getCredits(account.classCode, account.id);
      $("assign-stats").textContent = "⭐ Your points: " + pts + " · 🎟 Credits: " + credits;
    }

    $("empty-assign").hidden = assignments.length > 0;
    $("empty-assign").textContent = isTeacher
      ? "No assignments yet — create one and your students will see it here!"
      : "No assignments yet. Check back after your teacher posts one!";

    for (const a of assignments) {
      const row = document.createElement("button");
      row.className = "list-row";
      let status;
      if (isTeacher) {
        const graded = a.submissions.filter((s) => typeof s.points === "number").length;
        status = a.submissions.length + " submitted · " + graded + " graded";
      } else {
        const sub = a.submissions.find((s) => s.studentId === account.id);
        status = !sub ? "⏳ Not submitted"
          : typeof sub.points === "number" ? "✅ Graded: " + sub.points + " / " + a.maxPoints + " pts"
          : "📤 Submitted — waiting for grade";
      }
      row.innerHTML =
        '<span class="lr-emoji">📝</span>' +
        '<span class="lr-main"><span class="lr-title"></span><span class="lr-sub"></span></span>' +
        '<span class="lr-side">' + a.maxPoints + " pts</span>";
      row.querySelector(".lr-title").textContent = a.title;
      row.querySelector(".lr-sub").textContent = status;
      row.addEventListener("click", () => openAssignmentDetail(a.id));
      list.appendChild(row);
    }
  }

  $("btn-new-assign").addEventListener("click", () => {
    $("an-title").value = "";
    $("an-desc").value = "";
    $("an-points").value = 100;
    $("an-error").textContent = "";
    openModal("modal-assign-new");
  });
  $("btn-an-create").addEventListener("click", () => {
    const title = $("an-title").value.trim();
    if (!title) { $("an-error").textContent = "Give the assignment a title!"; return; }
    S.addAssignment(account.classCode, {
      title, desc: $("an-desc").value.trim(), maxPoints: $("an-points").value,
    });
    closeModal();
    renderAssignments();
  });

  function openAssignmentDetail(aid) {
    const cls = S.getClass(account.classCode);
    const a = cls && cls.assignments.find((x) => x.id === aid);
    if (!a) return;
    currentAssignment = aid;
    $("ad-title").textContent = "📝 " + a.title;
    $("ad-desc").textContent = a.desc || "";
    $("ad-meta").textContent = "Max points: " + a.maxPoints;
    const isTeacher = account.type === "teacher";
    $("ad-student").hidden = isTeacher;
    $("ad-teacher").hidden = !isTeacher;
    $("btn-ad-delete").hidden = !isTeacher;
    if (isTeacher) renderSubmissions(a);
    else renderMySubmission(a);
    openModal("modal-assign-detail");
  }

  function renderMySubmission(a) {
    const sub = a.submissions.find((s) => s.studentId === account.id);
    $("ad-status").textContent = !sub ? "You haven't submitted yet. Pick one of your games:"
      : typeof sub.points === "number"
        ? "✅ Graded: " + sub.points + " / " + a.maxPoints + " points! Resubmitting clears the grade."
        : "📤 Submitted “" + sub.game.name + "” — you can resubmit until it's graded.";
    const sel = $("ad-game-select");
    sel.innerHTML = "";
    for (const g of S.getGames(account.id)) {
      const o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.name;
      sel.appendChild(o);
    }
    $("ad-error").textContent = "";
    $("btn-ad-submit").textContent = sub ? "📤 Resubmit" : "📤 Submit";
  }

  $("btn-ad-submit").addEventListener("click", () => {
    const g = S.getGame($("ad-game-select").value);
    if (!g) { $("ad-error").textContent = "Pick a game first — build one if you haven't!"; return; }
    S.submitAssignment(account.classCode, currentAssignment, {
      studentId: account.id, studentName: account.name, game: g,
    });
    openAssignmentDetail(currentAssignment);
    renderAssignments();
  });

  function renderSubmissions(a) {
    const wrap = $("ad-submissions");
    wrap.innerHTML = "";
    if (!a.submissions.length) {
      wrap.innerHTML = '<p class="page-note">No submissions yet.</p>';
      return;
    }
    for (const sub of a.submissions) {
      const row = document.createElement("div");
      row.className = "sub-row";
      row.innerHTML =
        '<span class="lr-main"><span class="lr-title"></span><span class="lr-sub"></span></span>' +
        '<button class="btn small secondary sub-play">▶ Play</button>' +
        '<input type="number" class="sub-points" min="0" max="' + a.maxPoints + '" placeholder="pts">' +
        '<button class="btn small primary sub-grade">✔ Grade</button>' +
        '<button class="btn small ghost sub-credit" title="Give 1 credit">＋🎟</button>';
      row.querySelector(".lr-title").textContent = sub.studentName + " — “" + sub.game.name + "”";
      row.querySelector(".lr-sub").textContent = typeof sub.points === "number"
        ? "Graded: " + sub.points + " / " + a.maxPoints : "Waiting for grade";
      const input = row.querySelector(".sub-points");
      if (typeof sub.points === "number") input.value = sub.points;
      row.querySelector(".sub-play").addEventListener("click", () => {
        closeModal();
        playGame(sub.game, "dashboard");
      });
      row.querySelector(".sub-grade").addEventListener("click", () => {
        if (input.value === "") return;
        S.gradeSubmission(account.classCode, a.id, sub.studentId, input.value);
        openAssignmentDetail(a.id);
        renderAssignments();
      });
      row.querySelector(".sub-credit").addEventListener("click", (e) => {
        if (S.addCredits(account.classCode, sub.studentId, 1)) {
          e.target.textContent = "✅";
          setTimeout(() => { e.target.textContent = "＋🎟"; }, 900);
        }
      });
      wrap.appendChild(row);
    }
  }

  $("btn-ad-delete").addEventListener("click", () => {
    if (confirm("Delete this assignment and all its submissions?")) {
      S.deleteAssignment(account.classCode, currentAssignment);
      closeModal();
      renderAssignments();
    }
  });

  /* ============ students roster (teacher) ============ */
  function renderStudents() {
    const cls = S.getClass(account.classCode);
    const roster = cls ? cls.roster : [];
    $("students-note").textContent =
      "👥 " + roster.length + " / " + S.MAX_STUDENTS + " students — reward good points with 🎟 credits. " +
      "Students spend credits in their Credit Shop to unlock special items for a few days.";
    $("empty-students").hidden = roster.length > 0;
    const list = $("students-list");
    list.innerHTML = "";
    for (const r of roster) {
      const pts = S.studentPoints(account.classCode, r.id);
      const row = document.createElement("div");
      row.className = "sub-row";
      row.innerHTML =
        '<span class="lr-emoji"></span>' +
        '<span class="lr-main"><span class="lr-title"></span><span class="lr-sub"></span></span>' +
        '<button class="btn small primary st-c1">＋1 🎟</button>' +
        '<button class="btn small secondary st-c5">＋5 🎟</button>' +
        '<button class="btn small ghost st-remove" title="Remove from class">✕</button>';
      row.querySelector(".lr-emoji").textContent = r.avatar || "🙂";
      row.querySelector(".lr-title").textContent = r.name;
      row.querySelector(".lr-sub").textContent = "⭐ " + pts + " points · 🎟 " + r.credits + " credits";
      row.querySelector(".st-c1").addEventListener("click", () => {
        S.addCredits(account.classCode, r.id, 1); renderStudents();
      });
      row.querySelector(".st-c5").addEventListener("click", () => {
        S.addCredits(account.classCode, r.id, 5); renderStudents();
      });
      row.querySelector(".st-remove").addEventListener("click", () => {
        if (confirm("Remove " + r.name + " from the class? They can rejoin with the Class Code.")) {
          S.removeFromRoster(account.classCode, r.id);
          renderStudents();
        }
      });
      list.appendChild(row);
    }
  }

  /* ============ credit shop (student) ============ */
  function timeLeft(expires) {
    const ms = expires - Date.now();
    if (ms <= 0) return "expired";
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? d + "d " + h + "h left" : h > 0 ? h + "h left" : "less than 1h left";
  }

  function renderShop() {
    const credits = S.getCredits(account.classCode, account.id);
    const pts = S.studentPoints(account.classCode, account.id);
    $("shop-balance").innerHTML =
      "🎟 <b>" + credits + "</b> credits &nbsp;·&nbsp; ⭐ " + pts + " points";
    const grid = $("shop-grid");
    grid.innerHTML = "";
    for (const it of SHOP_ITEMS) {
      const unlocked = S.hasUnlock(account, it.id);
      const card = document.createElement("div");
      card.className = "shop-card" + (unlocked ? " unlocked" : "");
      card.innerHTML =
        '<span class="shop-emoji">' + it.emoji + "</span>" +
        '<span class="shop-name"></span>' +
        '<span class="shop-desc"></span>' +
        '<span class="shop-status"></span>' +
        '<button class="btn small primary shop-buy"></button>';
      card.querySelector(".shop-name").textContent = it.name;
      card.querySelector(".shop-desc").textContent = it.desc;
      const status = card.querySelector(".shop-status");
      const buy = card.querySelector(".shop-buy");
      if (unlocked) {
        status.textContent = "✅ Unlocked · " + timeLeft(S.unlockExpiry(account, it.id));
        buy.textContent = "Extend · " + it.cost + " 🎟";
      } else {
        status.textContent = "Unlocks for " + it.days + " days";
        buy.textContent = "Unlock · " + it.cost + " 🎟";
      }
      if (credits < it.cost) buy.disabled = true;
      buy.addEventListener("click", () => {
        if (!S.spendCredits(account.classCode, account.id, it.cost)) return;
        S.grantUnlock(account, it.id, it.days);
        E_confetti();
        renderShop();
      });
      grid.appendChild(card);
    }
  }
  function E_confetti() { GmfyEngine.sounds.win(); }

  /* ============ playgrounds ============ */
  let currentPlayground = null;

  function renderPlaygroundList() {
    $("pg-list-view").hidden = false;
    $("pg-detail-view").hidden = true;
    const cls = S.getClass(account.classCode);
    const pgs = cls ? cls.playgrounds : [];
    const isTeacher = account.type === "teacher";
    $("btn-new-pg").hidden = !isTeacher;
    $("pg-stats").textContent = isTeacher
      ? pgs.length + " playground" + (pgs.length === 1 ? "" : "s")
      : "🎨 Free-build spaces from your teacher — you can create " + S.PG_DAILY_LIMIT + " playground games per day.";
    $("empty-pg").hidden = pgs.length > 0;
    $("empty-pg").textContent = isTeacher
      ? "No playgrounds yet — create one so your students can build in their free time!"
      : "No playgrounds yet. Your teacher can open one for free-time building!";
    const list = $("pg-list");
    list.innerHTML = "";
    for (const pg of pgs) {
      const row = document.createElement("button");
      row.className = "list-row";
      row.innerHTML =
        '<span class="lr-emoji">🎪</span>' +
        '<span class="lr-main"><span class="lr-title"></span><span class="lr-sub"></span></span>' +
        '<span class="lr-side">' + pg.games.length + " games</span>";
      row.querySelector(".lr-title").textContent = pg.title;
      row.querySelector(".lr-sub").textContent = pg.desc || "Free build!";
      row.addEventListener("click", () => openPlayground(pg.id));
      list.appendChild(row);
    }
  }

  function openPlayground(pgId) {
    const cls = S.getClass(account.classCode);
    const pg = cls && cls.playgrounds.find((p) => p.id === pgId);
    if (!pg) return;
    currentPlayground = pgId;
    $("pg-list-view").hidden = true;
    $("pg-detail-view").hidden = false;
    $("pg-detail-title").textContent = "🎪 " + pg.title;
    $("pg-detail-desc").textContent = pg.desc || "";
    if (account.type === "student") {
      const used = S.playgroundQuotaUsed(account);
      const left = Math.max(0, S.PG_DAILY_LIMIT - used);
      $("pg-quota-note").textContent = "🕐 " + left + " of " + S.PG_DAILY_LIMIT + " creations left today";
      $("btn-pg-create").disabled = left <= 0;
    } else {
      $("pg-quota-note").textContent = "";
      $("btn-pg-create").disabled = false;
    }
    const grid = $("pg-games");
    grid.innerHTML = "";
    $("empty-pg-games").hidden = pg.games.length > 0;
    for (const g of pg.games) {
      const card = gameCard(g, { editable: false, playground: pgId });
      grid.appendChild(card);
    }
  }

  $("btn-pg-back").addEventListener("click", renderPlaygroundList);

  $("btn-new-pg").addEventListener("click", () => {
    $("pn-title").value = "";
    $("pn-desc").value = "";
    openModal("modal-pg-new");
  });
  $("btn-pn-create").addEventListener("click", () => {
    const title = $("pn-title").value.trim();
    if (!title) return;
    S.addPlayground(account.classCode, { title, desc: $("pn-desc").value.trim() });
    closeModal();
    renderPlaygroundList();
  });

  $("btn-pg-create").addEventListener("click", () => {
    const cls = S.getClass(account.classCode);
    const pg = cls && cls.playgrounds.find((p) => p.id === currentPlayground);
    if (!pg) return;
    if (account.type === "student") {
      if (S.playgroundQuotaUsed(account) >= S.PG_DAILY_LIMIT) {
        openPlayground(currentPlayground); // refresh the disabled state
        return;
      }
      S.usePlaygroundQuota(account);
    }
    const g = S.newGame(account.name, account.id);
    g.name = pg.title + " build";
    g.pg = { classCode: account.classCode, pgId: pg.id };
    S.saveGame(g);
    S.publishToPlayground(account.classCode, pg.id, g, account.name);
    openEditor(g);
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
