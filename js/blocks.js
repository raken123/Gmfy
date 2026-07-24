/* ============ Gmfy block coding ============
 * Scratch-style snap blocks: drag from the palette into the workspace.
 * Event ("when ...") blocks start a stack; action blocks stack under them.
 * Scripts serialize to plain JSON stored on the game, and a tiny async
 * interpreter runs them during play.
 */
(function () {
  const DEFS = {
    /* events */
    ev_start: { cat: "event", parts: ["when ▶ game starts"] },
    ev_coin:  { cat: "event", parts: ["when 🪙 a coin is collected"] },
    ev_goal:  { cat: "event", parts: ["when 🏁 the goal is reached"] },
    ev_lava:  { cat: "event", parts: ["when 🔥 lava is touched"] },
    ev_jump:  { cat: "event", parts: ["when 🕴 the player jumps"] },
    /* actions */
    say:       { cat: "looks", parts: ["say", { k: "text", type: "text", def: "Hello!" }, "for", { k: "secs", type: "number", def: 2, min: 0, max: 20 }, "s"] },
    add_score: { cat: "action", parts: ["add", { k: "n", type: "number", def: 10, min: -1000, max: 1000 }, "to ⭐ score"] },
    set_sky:   { cat: "looks", parts: ["set sky color to", { k: "color", type: "color", def: "#ff9e6d" }] },
    set_speed: { cat: "action", parts: ["set player speed to", { k: "n", type: "number", def: 6, min: 1, max: 20 }] },
    set_jump:  { cat: "action", parts: ["set jump power to", { k: "n", type: "number", def: 8, min: 1, max: 25 }] },
    teleport:  { cat: "action", parts: ["teleport player to 🚩 start"] },
    play_sound:{ cat: "looks", parts: ["play sound", { k: "sound", type: "select", def: "coin", options: ["coin", "jump", "win", "zap", "pop"] }] },
    win:       { cat: "action", parts: ["🏆 win the game"] },
    lose:      { cat: "action", parts: ["💀 lose the game"] },
    /* control */
    wait:   { cat: "control", parts: ["wait", { k: "secs", type: "number", def: 1, min: 0, max: 30 }, "seconds"] },
    repeat: { cat: "control", parts: ["repeat", { k: "n", type: "number", def: 3, min: 1, max: 50 }, "times"], container: true },
  };

  const PALETTE_ORDER = [
    ["Events", ["ev_start", "ev_coin", "ev_goal", "ev_lava", "ev_jump"]],
    ["Actions", ["add_score", "set_speed", "set_jump", "teleport", "win", "lose"]],
    ["Looks & Sound", ["say", "set_sky", "play_sound"]],
    ["Control", ["wait", "repeat"]],
  ];

  let dragPayload = null; // { source: 'palette'|'workspace', type, el }
  document.addEventListener("dragend", () => {
    dragPayload = null;
    clearDragOver();
  });

  /* ---- DOM builders ---- */
  function buildBlockEl(type, args) {
    const def = DEFS[type];
    const el = document.createElement("div");
    el.className = "code-block cat-" + def.cat;
    el.dataset.type = type;
    el.draggable = true;
    for (const part of def.parts) {
      if (typeof part === "string") {
        const span = document.createElement("span");
        span.textContent = part;
        el.appendChild(span);
      } else {
        const input = part.type === "select" ? document.createElement("select") : document.createElement("input");
        input.dataset.arg = part.k;
        if (part.type === "select") {
          for (const opt of part.options) {
            const o = document.createElement("option");
            o.value = o.textContent = opt;
            input.appendChild(o);
          }
          input.value = (args && args[part.k]) || part.def;
        } else {
          input.type = part.type;
          input.value = args && args[part.k] !== undefined ? args[part.k] : part.def;
          if (part.type === "number") { input.min = part.min; input.max = part.max; }
        }
        // keep clicks in inputs from starting a drag
        input.addEventListener("mousedown", (e) => e.stopPropagation());
        input.draggable = false;
        el.appendChild(input);
      }
    }
    return el;
  }

  /* A container block ("repeat") gets a slot for child blocks. */
  function buildWorkspaceBlock(type, args, children) {
    const def = DEFS[type];
    const blockEl = buildBlockEl(type, args);
    if (!def.container) {
      attachWorkspaceDrag(blockEl);
      return blockEl;
    }
    const wrap = document.createElement("div");
    wrap.className = "c-block-wrap";
    wrap.dataset.type = type;
    const slot = document.createElement("div");
    slot.className = "block-slot";
    makeDropZone(slot);
    wrap.appendChild(blockEl);
    wrap.appendChild(slot);
    if (children) for (const child of children) slot.appendChild(buildWorkspaceBlock(child.type, child.args, child.children));
    blockEl.draggable = false;
    wrap.draggable = true;
    attachWorkspaceDrag(wrap);
    return wrap;
  }

  function attachWorkspaceDrag(el) {
    el.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      dragPayload = { source: "workspace", el };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "gmfy-block");
    });
    attachTouchDrag(el, () => ({ source: "workspace", el }));
  }

  /* ---- drop zones ---- */
  function clearDragOver() {
    document.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
  }

  /* Events only snap to the workspace root; actions only inside stacks/slots. */
  function zoneAccepts(zone, type) {
    const def = DEFS[type];
    if (!def) return false;
    return (def.cat === "event") === zone.classList.contains("block-workspace");
  }

  function performDrop(zone, payload, targetEl) {
    const type = payload.type || (payload.el && payload.el.dataset.type);
    const def = DEFS[type];
    if (!def || !zoneAccepts(zone, type)) return;

    let node;
    if (payload.source === "palette") {
      node = def.cat === "event" ? buildStack(type) : buildWorkspaceBlock(type);
    } else {
      node = payload.el; // moving an existing block (or whole stack)
      if (node.contains(zone)) return; // no dropping into yourself
    }
    // insert before the block we're hovering over, else append
    const after = targetEl ? targetEl.closest(".code-block, .c-block-wrap, .script-stack") : null;
    if (after && zone.contains(after) && after !== node && after.parentElement === zone) {
      zone.insertBefore(node, after);
    } else {
      zone.appendChild(node);
    }
  }

  function makeDropZone(zone) {
    zone.addEventListener("dragover", (e) => {
      if (!dragPayload) return;
      const type = dragPayload.type || dragPayload.el.dataset.type;
      if (!zoneAccepts(zone, type)) return;
      e.preventDefault();
      e.stopPropagation();
      clearDragOver();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearDragOver();
      if (!dragPayload) return;
      const payload = dragPayload;
      dragPayload = null;
      performDrop(zone, payload, e.target);
    });
  }

  /* ---- touch drag & drop ----
   * HTML5 drag events don't exist on touch, so: long-press (~220ms) a block to
   * lift it, a ghost follows the finger, release over a stack/slot to drop
   * (or over the trash to delete). A quick swipe still scrolls normally.
   */
  const touchDrag = { pending: null, active: null, timer: 0 };

  function attachTouchDrag(el, payloadFn) {
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT") return;
      e.stopPropagation(); // the innermost block wins
      const t = e.touches[0];
      clearTimeout(touchDrag.timer);
      touchDrag.pending = { payloadFn, x: t.clientX, y: t.clientY };
      touchDrag.timer = setTimeout(() => {
        if (touchDrag.pending) startTouchDrag(touchDrag.pending);
      }, 220);
    }, { passive: true });
  }

  function startTouchDrag(pending) {
    const payload = pending.payloadFn();
    dragPayload = payload;
    const src = payload.el || null;
    const ghost = (src || buildBlockEl(payload.type)).cloneNode(true);
    ghost.classList.add("touch-drag-ghost");
    if (src) {
      ghost.style.width = src.offsetWidth + "px";
      src.classList.add("touch-drag-src");
    }
    document.body.appendChild(ghost);
    touchDrag.active = { payload, ghost };
    touchDrag.pending = null;
    moveGhost(pending.x, pending.y);
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function moveGhost(x, y) {
    touchDrag.active.ghost.style.left = x + "px";
    touchDrag.active.ghost.style.top = y - 24 + "px";
  }

  function touchZoneAt(x, y) {
    const under = document.elementFromPoint(x, y); // ghost is pointer-events:none
    if (!under || !dragPayload) return { zone: null, under: null };
    const type = dragPayload.type || (dragPayload.el && dragPayload.el.dataset.type);
    const trash = under.closest("#ws-trash");
    if (trash && dragPayload.source === "workspace") return { zone: trash, under, isTrash: true };
    const zone = under.closest(".stack-body, .block-slot, .block-workspace");
    if (zone && zoneAccepts(zone, type)) return { zone, under };
    return { zone: null, under };
  }

  document.addEventListener("touchmove", (e) => {
    if (touchDrag.pending) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - touchDrag.pending.x, t.clientY - touchDrag.pending.y) > 12) {
        clearTimeout(touchDrag.timer);
        touchDrag.pending = null; // finger is scrolling, not lifting a block
      }
      return;
    }
    if (!touchDrag.active) return;
    e.preventDefault();
    const t = e.touches[0];
    moveGhost(t.clientX, t.clientY);
    clearDragOver();
    const { zone } = touchZoneAt(t.clientX, t.clientY);
    if (zone) zone.classList.add("drag-over");
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    clearTimeout(touchDrag.timer);
    touchDrag.pending = null;
    if (!touchDrag.active) return;
    const t = e.changedTouches[0];
    const { payload, ghost } = touchDrag.active;
    ghost.remove();
    touchDrag.active = null;
    clearDragOver();
    if (payload.el) payload.el.classList.remove("touch-drag-src");
    const { zone, under, isTrash } = touchZoneAt(t.clientX, t.clientY);
    dragPayload = null;
    if (isTrash) { payload.el.remove(); return; }
    if (zone) performDrop(zone, payload, under);
  });

  function buildStack(eventType, blocks) {
    const stack = document.createElement("div");
    stack.className = "script-stack";
    stack.dataset.event = eventType;
    stack.dataset.type = eventType; // so drop validation treats a moved stack as an event
    stack.draggable = true;
    attachWorkspaceDrag(stack);
    const head = buildBlockEl(eventType);
    head.draggable = false;
    const body = document.createElement("div");
    body.className = "stack-body";
    makeDropZone(body);
    stack.appendChild(head);
    stack.appendChild(body);
    if (blocks) for (const b of blocks) body.appendChild(buildWorkspaceBlock(b.type, b.args, b.children));
    return stack;
  }

  /* ---- palette ---- */
  function initPalette(paletteEl) {
    paletteEl.innerHTML = "";
    for (const [catName, types] of PALETTE_ORDER) {
      const label = document.createElement("div");
      label.className = "palette-cat";
      label.textContent = catName;
      paletteEl.appendChild(label);
      for (const type of types) {
        const el = buildBlockEl(type);
        el.addEventListener("dragstart", (e) => {
          dragPayload = { source: "palette", type };
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData("text/plain", "gmfy-block");
        });
        attachTouchDrag(el, () => ({ source: "palette", type }));
        paletteEl.appendChild(el);
      }
    }
  }

  function initTrash(trashEl) {
    trashEl.addEventListener("dragover", (e) => {
      if (dragPayload && dragPayload.source === "workspace") {
        e.preventDefault();
        trashEl.classList.add("drag-over");
      }
    });
    trashEl.addEventListener("dragleave", () => trashEl.classList.remove("drag-over"));
    trashEl.addEventListener("drop", (e) => {
      e.preventDefault();
      trashEl.classList.remove("drag-over");
      if (dragPayload && dragPayload.source === "workspace") dragPayload.el.remove();
      dragPayload = null;
      clearDragOver();
    });
  }

  /* ---- (de)serialization ---- */
  function serializeBlockEl(el) {
    const isWrap = el.classList.contains("c-block-wrap");
    const blockEl = isWrap ? el.querySelector(":scope > .code-block") : el;
    const type = el.dataset.type;
    const args = {};
    blockEl.querySelectorAll(":scope > input, :scope > select").forEach((input) => {
      args[input.dataset.arg] = input.type === "number" ? Number(input.value) : input.value;
    });
    const out = { type, args };
    if (isWrap) {
      const slot = el.querySelector(":scope > .block-slot");
      out.children = Array.from(slot.children).map(serializeBlockEl);
    }
    return out;
  }

  function serializeWorkspace(workspaceEl) {
    return Array.from(workspaceEl.querySelectorAll(":scope > .script-stack")).map((stack) => ({
      event: stack.dataset.event,
      blocks: Array.from(stack.querySelector(":scope > .stack-body").children).map(serializeBlockEl),
    }));
  }

  function loadWorkspace(workspaceEl, scripts) {
    workspaceEl.querySelectorAll(":scope > .script-stack").forEach((n) => n.remove());
    for (const script of scripts || []) {
      if (!DEFS[script.event]) continue;
      workspaceEl.appendChild(buildStack(script.event, script.blocks));
    }
  }

  /* ---- interpreter (used by the player) ----
   * api: { say, addScore, setSky, setSpeed, setJump, teleport, playSound, win, lose, isOver }
   */
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

  async function execBlocks(blocks, api) {
    for (const b of blocks || []) {
      if (api.isOver()) return;
      const a = b.args || {};
      switch (b.type) {
        case "say":        await api.say(String(a.text || ""), clamp(a.secs, 0, 20, 2)); break;
        case "add_score":  api.addScore(clamp(a.n, -1000, 1000, 10)); break;
        case "set_sky":    api.setSky(a.color || "#ff9e6d"); break;
        case "set_speed":  api.setSpeed(clamp(a.n, 1, 20, 6)); break;
        case "set_jump":   api.setJump(clamp(a.n, 1, 25, 8)); break;
        case "teleport":   api.teleport(); break;
        case "play_sound": api.playSound(a.sound || "coin"); break;
        case "win":        api.win(); return;
        case "lose":       api.lose(); return;
        case "wait":       await sleep(clamp(a.secs, 0, 30, 1)); break;
        case "repeat": {
          const times = clamp(a.n, 1, 50, 3);
          for (let i = 0; i < times; i++) {
            if (api.isOver()) return;
            await execBlocks(b.children, api);
          }
          break;
        }
      }
    }
  }

  function clamp(v, min, max, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  /* Fire every stack registered for an event (fire-and-forget async). */
  function fireEvent(scripts, eventType, api) {
    for (const script of scripts || []) {
      if (script.event === eventType) {
        execBlocks(script.blocks, api).catch(() => {});
      }
    }
  }

  window.GmfyBlocks = {
    DEFS, initPalette, initTrash, makeDropZone,
    serializeWorkspace, loadWorkspace, fireEvent,
  };
})();
