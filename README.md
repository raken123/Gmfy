# 🎮 Gmfy

**Create, play & share your own 3D games — right in the browser.**

Gmfy is a kid-friendly 3D game maker. Build worlds with simple builder tools,
bring them to life with snap-together **block coding**, then play them and
share them with friends or your whole class.

![Modes](https://img.shields.io/badge/modes-Edu%20%7C%20Home-blue) ![No build step](https://img.shields.io/badge/build-none-green) ![Offline](https://img.shields.io/badge/works-offline-orange)

## ✨ Features

- **Accounts** — local profiles with avatars and an optional 4-digit PIN.
  Three kinds, each with its own game library:
  - 🏠 **Home** — build for yourself and impress your friends: every game
    exports as a **game code** anyone can paste into Gmfy to play.
  - 🎒 **Student** — join your class with a 6-character **Class Code** and
    share games to the Class Library, where classmates can play and remix them.
  - 🍎 **Teacher** — create a class, get its Class Code to hand out, and
    curate the Class Library (teachers can remove shared games).
- **3D builder tools** — place, erase and paint blocks on a grid with a live
  ghost preview. Special blocks: 🪙 coins, 🏁 goal flags, 🔥 lava, 🟣 bouncy pads.
- **Easy block coding** — drag Scratch-style blocks (`when game starts`,
  `say…`, `add score`, `repeat`, `wait`, `win the game`…) to script your game.
  No typing required.
- **Play mode** — a third-person voxel platformer runtime with jumping,
  physics, coins, score, timer and win/lose screens (plus retro sound effects).
- **Share codes** — games serialize to portable `GMFY1.…` codes; copy, send,
  paste, play. Works across devices with no server.
- **Mobile & touch friendly** — responsive layout down to phone screens, plus
  full touch controls:
  - Editor: **tap** to use the active tool, **one-finger drag** to orbit,
    **pinch** to zoom.
  - Play: on-screen **virtual joystick** + **jump button**, drag to move the
    camera.
  - Block coding: **long-press** a block to lift it, drag it into a stack (or
    the trash) with your finger.

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

| Where | Desktop | Touch |
| --- | --- | --- |
| **Editor** | Left-click: use tool · Right-drag: orbit · Scroll: zoom | Tap: use tool · Drag: orbit · Pinch: zoom |
| **Play** | WASD / arrows: move · Space: jump · Mouse drag: camera · R: restart | Joystick: move · ⬆ button: jump · Drag: camera |
| **Block coding** | Drag & drop with the mouse | Long-press a block, then drag |

## 🗂️ Project layout

```
index.html      app shell (all screens)
css/style.css   styling + responsive layout
js/storage.js   localStorage persistence: accounts, games, classes, share codes
js/engine.js    shared Three.js scene building, avatar, sounds
js/blocks.js    block-coding palette, drag & drop (mouse + touch), interpreter
js/editor.js    3D builder tools + orbit camera (mouse + touch)
js/player.js    play-mode runtime (physics, HUD, events, virtual joystick)
js/main.js      app flow / glue
vendor/         vendored Three.js
```

## 📝 Notes

- Everything is stored in your browser's `localStorage`; nothing leaves your
  device except the share codes you copy yourself.
- Accounts (and their PINs) are a friendly local lock, not real security —
  they live on the device, per browser.
- Class Libraries are per-device (there's no backend) — share codes are the
  way to move games between machines.
- Each new account gets the starter game **Coin Canyon** so there's
  something to play immediately.
