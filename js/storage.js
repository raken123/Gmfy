/* ============ Gmfy storage — profiles, games, classes, share codes ============
 * Everything is persisted in localStorage so Gmfy works fully offline.
 * Share codes ("GMFY1.<base64>") carry a whole game between devices/friends.
 */
(function () {
  const KEY_PROFILE = "gmfy.profile";
  const KEY_GAMES = "gmfy.games";
  const KEY_CLASSES = "gmfy.classes";
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

  /* ---- profile (current session: mode + name + class) ---- */
  function getProfile() { return read(KEY_PROFILE, null); }
  function setProfile(profile) { write(KEY_PROFILE, profile); }
  function clearProfile() { localStorage.removeItem(KEY_PROFILE); }

  /* ---- games ---- */
  function newGame(author) {
    return {
      id: uid(),
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
  function getGames() { return read(KEY_GAMES, []); }
  function saveGame(game) {
    const games = getGames();
    game.updated = Date.now();
    const i = games.findIndex((g) => g.id === game.id);
    if (i >= 0) games[i] = game; else games.unshift(game);
    write(KEY_GAMES, games);
  }
  function deleteGame(id) {
    write(KEY_GAMES, getGames().filter((g) => g.id !== id));
  }
  function getGame(id) {
    return getGames().find((g) => g.id === id) || null;
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
    getProfile, setProfile, clearProfile,
    newGame, getGames, saveGame, deleteGame, getGame,
    createClass, getClass, shareToClass, removeFromClass,
    encodeGame, decodeGame, uid,
  };
})();
