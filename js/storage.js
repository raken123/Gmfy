/* ============ Gmfy storage — accounts, games, classes, share codes ============
 * Everything is persisted in localStorage so Gmfy works fully offline.
 * Accounts are local profiles (Home / Student / Teacher) with their own game
 * libraries. Share codes ("GMFY1.<base64>") carry a whole game between
 * devices/friends.
 */
(function () {
  const KEY_ACCOUNTS = "gmfy.accounts";
  const KEY_SESSION = "gmfy.session";
  const KEY_GAMES = "gmfy.games";
  const KEY_CLASSES = "gmfy.classes";
  const KEY_PROFILE = "gmfy.profile"; // legacy (pre-accounts) — migrated on boot
  const CODE_PREFIX = "GMFY1.";
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusing 0/O, 1/I/L

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---- accounts ---- */
  function getAccounts() { return read(KEY_ACCOUNTS, []); }
  function saveAccounts(list) { write(KEY_ACCOUNTS, list); }
  function createAccount(data) {
    const acc = {
      id: uid(),
      name: String(data.name || "Player").slice(0, 24),
      type: ["home", "student", "teacher"].includes(data.type) ? data.type : "home",
      avatar: data.avatar || "🙂",
      pin: data.pin || "", // optional 4-digit lock (kept simple — this is a local, kid-level lock)
      classCode: data.classCode || "",
      created: Date.now(),
    };
    const list = getAccounts();
    list.push(acc);
    saveAccounts(list);
    return acc;
  }
  function updateAccount(acc) {
    const list = getAccounts();
    const i = list.findIndex((a) => a.id === acc.id);
    if (i >= 0) { list[i] = acc; saveAccounts(list); }
  }
  function getAccount(id) {
    return getAccounts().find((a) => a.id === id) || null;
  }
  function deleteAccount(id) {
    saveAccounts(getAccounts().filter((a) => a.id !== id));
    write(KEY_GAMES, readAllGames().filter((g) => g.owner !== id));
    if (getSession() === id) clearSession();
  }
  function setSession(id) { write(KEY_SESSION, id); }
  function getSession() { return read(KEY_SESSION, null); }
  function clearSession() { localStorage.removeItem(KEY_SESSION); }

  /* One-time migration from the pre-accounts profile format. */
  function migrate() {
    const legacy = read(KEY_PROFILE, null);
    if (!legacy || getAccounts().length) {
      if (legacy) localStorage.removeItem(KEY_PROFILE);
      return;
    }
    const acc = createAccount({
      name: legacy.name,
      type: legacy.mode === "edu" ? (legacy.role || "student") : "home",
      classCode: legacy.classCode || "",
    });
    // hand every existing game to the migrated account
    const games = readAllGames();
    for (const g of games) if (!g.owner) g.owner = acc.id;
    write(KEY_GAMES, games);
    localStorage.removeItem(KEY_PROFILE);
  }

  /* ---- games ---- */
  function newGame(author, ownerId) {
    return {
      id: uid(),
      owner: ownerId || "",
      name: "My New Game",
      author: author || "Anonymous",
      sky: "#7ec8ff",
      spawn: { x: 0, y: 1, z: 4 },
      blocks: [], // {x,y,z,type,color}
      scripts: [], // [{event, blocks:[{type,args,children}]}]
      created: Date.now(),
      updated: Date.now(),
    };
  }
  function readAllGames() { return read(KEY_GAMES, []); }
  function getGames(ownerId) {
    const all = readAllGames();
    return ownerId ? all.filter((g) => g.owner === ownerId) : all;
  }
  function saveGame(game) {
    const games = readAllGames();
    game.updated = Date.now();
    const i = games.findIndex((g) => g.id === game.id);
    if (i >= 0) games[i] = game; else games.unshift(game);
    write(KEY_GAMES, games);
  }
  function deleteGame(id) {
    write(KEY_GAMES, readAllGames().filter((g) => g.id !== id));
  }
  function getGame(id) {
    return readAllGames().find((g) => g.id === id) || null;
  }

  /* ---- classes (Edu mode) ---- */
  function getClasses() { return read(KEY_CLASSES, {}); }
  function makeClassCode() {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
  }
  function createClass(name, teacher) {
    const classes = getClasses();
    let code = makeClassCode();
    while (classes[code]) code = makeClassCode();
    classes[code] = { code, name, teacher, games: [], created: Date.now() };
    write(KEY_CLASSES, classes);
    return classes[code];
  }
  function getClass(code) {
    return getClasses()[(code || "").toUpperCase().trim()] || null;
  }
  /* Students may join a class this device hasn't seen — register a shell for it. */
  function registerClass(code) {
    const classes = getClasses();
    if (!classes[code]) {
      classes[code] = { code, name: "Class " + code, teacher: "", games: [], created: Date.now() };
      write(KEY_CLASSES, classes);
    }
    return classes[code];
  }
  function shareToClass(code, game, authorName) {
    const classes = getClasses();
    const cls = classes[code];
    if (!cls) return false;
    const snapshot = JSON.parse(JSON.stringify(game));
    snapshot.author = authorName || game.author;
    snapshot.sharedAt = Date.now();
    const i = cls.games.findIndex((g) => g.id === game.id);
    if (i >= 0) cls.games[i] = snapshot; else cls.games.unshift(snapshot);
    write(KEY_CLASSES, classes);
    return true;
  }
  function removeFromClass(code, gameId) {
    const classes = getClasses();
    const cls = classes[code];
    if (!cls) return;
    cls.games = cls.games.filter((g) => g.id !== gameId);
    write(KEY_CLASSES, classes);
  }

  /* ---- share codes ---- */
  function encodeGame(game) {
    const slim = {
      name: game.name, author: game.author, sky: game.sky,
      spawn: game.spawn, blocks: game.blocks, scripts: game.scripts,
    };
    const json = JSON.stringify(slim);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_");
    return CODE_PREFIX + b64;
  }
  function decodeGame(code) {
    try {
      const trimmed = (code || "").trim();
      if (!trimmed.startsWith(CODE_PREFIX)) return null;
      const b64 = trimmed.slice(CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
      const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!data || !Array.isArray(data.blocks)) return null;
      const game = newGame(data.author);
      game.name = String(data.name || "Imported Game").slice(0, 40);
      game.author = String(data.author || "A friend").slice(0, 24);
      game.sky = /^#[0-9a-fA-F]{6}$/.test(data.sky || "") ? data.sky : "#7ec8ff";
      game.spawn = data.spawn && typeof data.spawn.x === "number" ? data.spawn : game.spawn;
      game.blocks = data.blocks.filter((b) =>
        b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)
      ).slice(0, 5000);
      game.scripts = Array.isArray(data.scripts) ? data.scripts : [];
      return game;
    } catch (e) {
      return null;
    }
  }

  window.GmfyStore = {
    getAccounts, createAccount, updateAccount, getAccount, deleteAccount,
    setSession, getSession, clearSession, migrate,
    newGame, getGames, saveGame, deleteGame, getGame,
    createClass, getClass, registerClass, shareToClass, removeFromClass,
    encodeGame, decodeGame, uid,
  };
})();
