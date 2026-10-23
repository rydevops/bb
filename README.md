# Baldi's Basics 3D

A fan-made **3D mobile-friendly PWA** clone of *Baldi's Basics Classic Remastered*, built with three.js and plain ES modules. No build step: it runs straight from GitHub Pages.

Collect all **7 notebooks**, answer the math problems, and **escape the schoolhouse** before Baldi's ruler gets you.

## Features
- 3D school (halls, 10 classrooms, locked Principal's office, two exits) with a pixel-art look
- Baldi: sleeps until your first notebook, then chases by ear and by sight with a ruler-slap speed pulse; gets faster with every notebook and angrier with every wrong answer
- Math notebooks with on-screen keypad (3 problems each, harder as you go) and Baldi voice (Web Speech API)
- After the 7th notebook the exits open and the escape alarm starts
- Items (3 slots): Zesty Bar, BSODA, Alarm Clock, Quarter, Principal's Keys, Safety Scissors; BSODA vending machines
- Characters: Playtime (jump-rope timing game), It's a Bully (steals items), Gotta Sweep (sweeps everyone down the hall), Principal of the Thing (no running in the halls → detention)
- Stamina/running, minimap toggle, pause, jump-scare, win/lose screens
- Fully procedural art and synthesised music/SFX (no external assets)
- Installable PWA, works offline (service worker), landscape fullscreen, touch controls

## Controls
| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | left stick |
| Look | mouse | drag right side |
| Run | Shift | RUN button |
| Use / take / open | E, Space or click | USE |
| Use item | F or right-click | ITEM (or tap the slot) |
| Select slot | 1-3 / wheel | tap slot |
| Map / Pause | M / Esc, P | top-right buttons |

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy
`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on pushes to `main` (enable *Settings → Pages → Source: GitHub Actions*).

## Credits
three.js (MIT, in `vendor/`). Fan tribute to Baldi's Basics by Basically Games; not affiliated. All art, sound and code here are original.
