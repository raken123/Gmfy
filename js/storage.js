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
  const MAX_STUDENTS = 30;      // roster cap per class
  const PG_DAILY_LIMIT = 5;     // playground creations per student per day

  function getClasses() { return read(KEY_CLASSES, {}); }
  function makeClassCode() {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return code;
  }
  /* Older saves may predate roster/assignments/playgrounds — fill them in. */
  function normalizeClass(cls) {
    if (!cls) return cls;
    if (!cls.roster) cls.roster = [];
    if (!cls.assignments) cls.assignments = [];
    if (!cls.playgrounds) cls.playgrounds = [];
    return cls;
  }
  function createClass(name, teacher) {
    const classes = getClasses();
    let code = makeClassCode();
    while (classes[code]) code = makeClassCode();
    classes[code] = {
      code, name, teacher, games: [],
      roster: [], assignments: [], playgrounds: [],
      created: Date.now(),
    };
    write(KEY_CLASSES, classes);
    return classes[code];
  }
  function getClass(code) {
    return normalizeClass(getClasses()[(code || "").toUpperCase().trim()] || null);
  }
  /* Students may join a class this device hasn't seen — register a shell for it. */
  function registerClass(code) {
    const classes = getClasses();
    if (!classes[code]) {
      classes[code] = {
        code, name: "Class " + code, teacher: "", games: [],
        roster: [], assignments: [], playgrounds: [],
        created: Date.now(),
      };
      write(KEY_CLASSES, classes);
    }
    return normalizeClass(classes[code]);
  }
  /* Load-mutate-save helper: fn receives the normalized class object. */
  function mutateClass(code, fn) {
    const classes = getClasses();
    const cls = classes[(code || "").toUpperCase().trim()];
    if (!cls) return null;
    normalizeClass(cls);
    const result = fn(cls);
    write(KEY_CLASSES, classes);
    return result === undefined ? true : result;
  }
  function shareToClass(code, game, authorName) {
    return !!mutateClass(code, (cls) => {
      const snapshot = JSON.parse(JSON.stringify(game));
      snapshot.author = authorName || game.author;
      snapshot.sharedAt = Date.now();
      const i = cls.games.findIndex((g) => g.id === game.id);
      if (i >= 0) cls.games[i] = snapshot; else cls.games.unshift(snapshot);
      return true;
    });
  }
  function removeFromClass(code, gameId) {
    mutateClass(code, (cls) => {
      cls.games = cls.games.filter((g) => g.id !== gameId);
    });
  }

  /* ---- roster (max 30 students) ---- */
  function joinRoster(code, student) {
    const res = mutateClass(code, (cls) => {
      if (cls.roster.some((r) => r.id === student.id)) return { ok: true, already: true };
      if (cls.roster.length >= MAX_STUDENTS) return { ok: false, reason: "full" };
      cls.roster.push({
        id: student.id, name: student.name, avatar: student.avatar || "🙂",
        credits: 0, joined: Date.now(),
      });
      return { ok: true };
    });
    return res || { ok: false, reason: "noclass" };
  }
  function removeFromRoster(code, studentId) {
    mutateClass(code, (cls) => {
      cls.roster = cls.roster.filter((r) => r.id !== studentId);
    });
  }
  function classHasSpace(code) {
    const cls = getClass(code);
    return !cls || cls.roster.length < MAX_STUDENTS;
  }

  /* ---- credits ---- */
  function getCredits(code, studentId) {
    const cls = getClass(code);
    const entry = cls && cls.roster.find((r) => r.id === studentId);
    return entry ? entry.credits : 0;
  }
  function addCredits(code, studentId, n) {
    return !!mutateClass(code, (cls) => {
      const entry = cls.roster.find((r) => r.id === studentId);
      if (!entry) return false;
      entry.credits = Math.max(0, entry.credits + n);
      return true;
    });
  }
  function spendCredits(code, studentId, n) {
    return mutateClass(code, (cls) => {
      const entry = cls.roster.find((r) => r.id === studentId);
      if (!entry || entry.credits < n) return false;
      entry.credits -= n;
      return true;
    }) === true;
  }

  /* ---- assignments ---- */
  function addAssignment(code, data) {
    return mutateClass(code, (cls) => {
      const a = {
        id: uid(),
        title: String(data.title || "Assignment").slice(0, 60),
        desc: String(data.desc || "").slice(0, 500),
        maxPoints: Math.max(1, Math.min(1000, Number(data.maxPoints) || 100)),
        created: Date.now(),
        submissions: [], // {studentId, studentName, game, submittedAt, points|null}
      };
      cls.assignments.unshift(a);
      return a;
    });
  }
  function deleteAssignment(code, aid) {
    mutateClass(code, (cls) => {
      cls.assignments = cls.assignments.filter((a) => a.id !== aid);
    });
  }
  function submitAssignment(code, aid, submission) {
    return !!mutateClass(code, (cls) => {
      const a = cls.assignments.find((x) => x.id === aid);
      if (!a) return false;
      const sub = {
        studentId: submission.studentId,
        studentName: submission.studentName,
        game: JSON.parse(JSON.stringify(submission.game)),
        submittedAt: Date.now(),
        points: null, // resubmitting resets the grade
      };
      const i = a.submissions.findIndex((s) => s.studentId === sub.studentId);
      if (i >= 0) a.submissions[i] = sub; else a.submissions.push(sub);
      return true;
    });
  }
  function gradeSubmission(code, aid, studentId, points) {
    return !!mutateClass(code, (cls) => {
      const a = cls.assignments.find((x) => x.id === aid);
      const sub = a && a.submissions.find((s) => s.studentId === studentId);
      if (!sub) return false;
      sub.points = Math.max(0, Math.min(a.maxPoints, Math.round(Number(points) || 0)));
      return true;
    });
  }
  /* Total graded points a student has earned in this class. */
  function studentPoints(code, studentId) {
    const cls = getClass(code);
    if (!cls) return 0;
    let total = 0;
    for (const a of cls.assignments)
      for (const s of a.submissions)
        if (s.studentId === studentId && typeof s.points === "number") total += s.points;
    return total;
  }

  /* ---- playgrounds ---- */
  function addPlayground(code, data) {
    return mutateClass(code, (cls) => {
      const pg = {
        id: uid(),
        title: String(data.title || "Playground").slice(0, 60),
        desc: String(data.desc || "").slice(0, 300),
        created: Date.now(),
        games: [],
      };
      cls.playgrounds.unshift(pg);
      return pg;
    });
  }
  function deletePlayground(code, pgId) {
    mutateClass(code, (cls) => {
      cls.playgrounds = cls.playgrounds.filter((p) => p.id !== pgId);
    });
  }
  function publishToPlayground(code, pgId, game, authorName) {
    return !!mutateClass(code, (cls) => {
      const pg = cls.playgrounds.find((p) => p.id === pgId);
      if (!pg) return false;
      const snapshot = JSON.parse(JSON.stringify(game));
      snapshot.author = authorName || game.author;
      snapshot.sharedAt = Date.now();
      const i = pg.games.findIndex((g) => g.id === game.id);
      if (i >= 0) pg.games[i] = snapshot; else pg.games.unshift(snapshot);
      return true;
    });
  }
  function removeFromPlayground(code, pgId, gameId) {
    mutateClass(code, (cls) => {
      const pg = cls.playgrounds.find((p) => p.id === pgId);
      if (pg) pg.games = pg.games.filter((g) => g.id !== gameId);
    });
  }

  /* ---- per-student daily playground quota ---- */
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function playgroundQuotaUsed(acc) {
    return acc.pgQuota && acc.pgQuota.date === todayStr() ? acc.pgQuota.used : 0;
  }
  function usePlaygroundQuota(acc) {
    if (!acc.pgQuota || acc.pgQuota.date !== todayStr()) acc.pgQuota = { date: todayStr(), used: 0 };
    acc.pgQuota.used += 1;
    updateAccount(acc);
  }

  /* ---- timed item unlocks (Credit Shop) ---- */
  function grantUnlock(acc, item, days) {
    acc.unlocks = (acc.unlocks || []).filter((u) => u.item !== item);
    acc.unlocks.push({ item, expires: Date.now() + days * 86400000 });
    updateAccount(acc);
  }
  function hasUnlock(acc, item) {
    return (acc.unlocks || []).some((u) => u.item === item && u.expires > Date.now());
  }
  function unlockExpiry(acc, item) {
    const u = (acc.unlocks || []).find((x) => x.item === item && x.expires > Date.now());
    return u ? u.expires : 0;
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
    MAX_STUDENTS, PG_DAILY_LIMIT,
    getAccounts, createAccount, updateAccount, getAccount, deleteAccount,
    setSession, getSession, clearSession, migrate,
    newGame, getGames, saveGame, deleteGame, getGame,
    createClass, getClass, registerClass, shareToClass, removeFromClass,
    joinRoster, removeFromRoster, classHasSpace,
    getCredits, addCredits, spendCredits,
    addAssignment, deleteAssignment, submitAssignment, gradeSubmission, studentPoints,
    addPlayground, deletePlayground, publishToPlayground, removeFromPlayground,
    playgroundQuotaUsed, usePlaygroundQuota,
    grantUnlock, hasUnlock, unlockExpiry,
    encodeGame, decodeGame, uid,
  };
})();
