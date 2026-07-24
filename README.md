# 🎮 Gmfy

**Create, play & share your own 3D games — right in the browser.**

Gmfy is a kid-friendly 3D game maker. Build worlds with simple builder tools,
bring them to life with snap-together **block coding**, then play them and
share them with friends or your whole class.

![Modes](https://img.shields.io/badge/modes-Edu%20%7C%20Home-blue) ![No build step](https://img.shields.io/badge/build-none-green) ![Offline](https://img.shields.io/badge/works-offline-orange)

## ✨ Features

- **3D builder tools** — place, erase and paint blocks on a grid with a live
  ghost preview. Special blocks: 🪙 coins, 🏁 goal flags, 🔥 lava, 🟣 bouncy pads.
- **Easy block coding** — drag Scratch-style blocks (`when game starts`,
  `say…`, `add score`, `repeat`, `wait`, `win the game`…) to script your game.
  No typing required.
- **Play mode** — a third-person voxel platformer runtime with jumping,
  physics, coins, score, timer and win/lose screens (plus retro sound effects).
- **Two modes:**
  - 🏫 **Edu Mode** — teachers create a class and get a 6-character
    **Class Code**. Students join with the code and share their games to the
    Class Library, where classmates can play and remix them.
  - 🏠 **Home Mode** — build for yourself and impress your friends: every game
    exports as a **game code** anyone can paste into Gmfy to play.
- **Share codes** — games serialize to portable `GMFY1.…` codes; copy, send,
  paste, play. Works across devices with no server and no accounts.

## 🚀 Running it

It's a fully static site — no build step, no dependencies to install
(Three.js is vendored in `vendor/`).

```bash
# any static server works:
npx serve .
# or:
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` directly from disk
works too.

## 🕹️ Controls

| Where | Keys |
| --- | --- |
| **Editor** | Left-click: use tool · Right-drag: orbit camera · Scroll: zoom |
| **Play** | WASD / arrows: move · Space: jump · Mouse drag: camera · R: restart |

## 🗂️ Project layout

```
index.html      app shell (all screens)
css/style.css   styling
js/storage.js   localStorage persistence, class codes, share codes
js/engine.js    shared Three.js scene building, avatar, sounds
js/blocks.js    block-coding palette, drag & drop, interpreter
js/editor.js    3D builder tools + orbit camera
js/player.js    play-mode runtime (physics, HUD, events)
js/main.js      app flow / glue
vendor/         vendored Three.js
```

## 📝 Notes

- Everything is stored in your browser's `localStorage`; nothing leaves your
  device except the share codes you copy yourself.
- Class Libraries are per-device (there's no backend) — share codes are the
  way to move games between machines.
- A starter game, **Coin Canyon**, is created on first run so there's
  something to play immediately.
