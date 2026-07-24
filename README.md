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
- **Classroom tools (Edu):**
  - **Roster** — classes hold up to **30 students**; teachers see everyone's
    points and credits and can remove students.
  - 📝 **Assignments** — teachers post assignments with instructions and max
    points; students submit one of their games; teachers play the submission
    and grade it with points.
  - 🎟 **Credits** — teachers reward good points with credits. Students spend
    them in the **Credit Shop** to unlock special items *for a limited time*:
    🌟 Glow Block (3 days), ⚡ Speed Pad (3 days), 📍 Checkpoint (3 days) and
    🌈 Rainbow Colors (7 days). Locked items show a 🔒 in the editor until
    unlocked. (Home players and teachers have everything from the start.)
  - 🎪 **Playgrounds** — teachers open free-build spaces where students create
    in their free time, capped at **5 playground games per student per day**;
    creations publish to the playground automatically on every save.
- **3D builder tools** — place, erase and paint blocks on a grid with a live
  ghost preview. Special blocks: 🪙 coins, 🏁 goal flags, 🔥 lava, 🟣 bouncy pads.
- **Easy block coding** — drag Scratch-style blocks (`when game starts`,
  `say…`, `add score`, `repeat`, `wait`, `win the game`…) to script your game.
  No typing required.
- **Play mode** — a third-person voxel platformer runtime with jumping,
  physics, coins, score, timer and win/lose screens (plus retro sound effects).
- **Share codes** — games serialize to portable `GMFY1.…` codes; copy, send,
  paste, play. Works across devices with no server.
- **Subscriptions** *(simulated — demo checkout, no real payments)*:
  - **Free** — 3 game slots and all the core tools.
  - **Pro ($6/month)** — 10 game slots, a ✨ **PRO tag** next to your name,
    🔗 **Play Links** that open your game instantly in any browser (even for
    friends who don't have Gmfy), and 👥 **local multiplayer** (P1: WASD +
    Space, P2: arrows + Enter, shared camera that zooms to fit both).
  - **Max ($90/month)** — unlimited games, everything in Pro, plus
    📸 **Smart Snapshots** (high-res cinematic renders with bloom, color
    grade, vignette and letterbox — download and send to your friends) and
    👁 **First Person Mode** (toggle with the HUD button or `F`).
  - **Edu ($90/month)** — the Max feature set for teachers, and it covers the
    whole class: every student in the class gets Max features automatically.
  - Playground builds never count against game slots — they only use the
    5-per-day playground allowance.
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

## 📱 Android app (Cordova)

The `mobile/` folder is a Cordova project that wraps Gmfy as a native
Android app for phones and tablets (Android 7.0+, phones and tablets,
portrait or landscape — the touch controls and responsive layout kick in
automatically).

Two ways to get the APK:

1. **GitHub Actions** — the *Build Android APK (Cordova)* workflow builds a
   debug APK on every change under `mobile/` (or run it manually from the
   Actions tab) and uploads it as the `gmfy-debug-apk` artifact.
2. **Locally** — with Node 18+, Java 17+, and the Android SDK
   (`ANDROID_HOME` set):

   ```bash
   ./mobile/build.sh
   # → mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk
   ```

It's a debug-signed APK: install it by opening it on the device and allowing
installs from unknown sources. For a Play-Store release you'd build
`--release` and sign with your own keystore.

## 🍎 iOS

The same `mobile/` Cordova project also targets iOS (iOS 13+, iPhone & iPad).
Three ways onto an Apple device, from easiest to most official:

1. **Add to Home Screen (no build at all)** — open the hosted Gmfy site in
   Safari → Share → *Add to Home Screen*. Gmfy ships a web manifest and
   apple-touch icons, so it installs as a full-screen home-screen app with
   the Gmfy icon. This is the zero-friction path for classrooms.
2. **Unsigned IPA from CI** — the *Build iOS App (Cordova)* workflow builds
   the app on a macOS runner with code signing disabled and uploads
   `gmfy-ios-unsigned-ipa`. Sideload it onto your own device with
   [AltStore](https://altstore.io) or Sideloadly using a free Apple ID
   (free-account sideloads expire after 7 days — re-sideload to renew).
3. **App Store / TestFlight** — requires an Apple Developer account
   ($99/year) and signing on a Mac: `npx cordova build ios --device` with
   your team's provisioning profile, then upload via Xcode.

Apple doesn't allow installing arbitrary unsigned apps, so unlike Android
there's no direct "open the file" install — option 1 or 2 is the practical
route without a developer account.

## 🖥️ Desktop apps (Electron)

The `desktop/` folder wraps Gmfy as a native desktop app for
**macOS** (.dmg/.zip), **Windows** (installer + portable .exe) and
**Linux** (.AppImage/.deb).

Two ways to get them:

1. **GitHub Actions** — the *Build Desktop Apps (Electron)* workflow builds
   all three platforms on native runners (run it from the Actions tab, or it
   triggers on `desktop/` changes) and uploads `gmfy-desktop-macos`,
   `gmfy-desktop-windows` and `gmfy-desktop-linux` artifacts.
2. **Locally** — with Node 18+:

   ```bash
   ./desktop/build.sh   # builds the targets for your current OS
   # → desktop/dist/
   ```

   On Linux, the script also cross-builds the Windows installer if wine is
   installed. macOS targets can only be built on a Mac.

The desktop builds are unsigned: macOS Gatekeeper will ask you to
right-click → Open the first time, and Windows SmartScreen will show a
"More info → Run anyway" prompt. Signing with your own developer
certificates removes those prompts.

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
