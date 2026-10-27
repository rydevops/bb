# JD's Basics Classic Remastered

A free first-person stealth-horror **parody of 90s edutainment software**, built as an installable, offline-capable mobile web app (PWA) and hosted on GitHub Pages. Collect 7 notebooks while JD, who hears every noise, hunts you, then escape through one of four exits.

Fan-made tribute; all art, music and code are original and generated in the browser. No accounts, ads, analytics or third-party requests.

## The school (all styles)
A Classic-style schoolhouse. You start at the **south exit** and walk into a four-way hub. The **yellow swinging doors** to the west, east and north stay locked until you collect **notebook 2** (the first two classrooms are beside the hub). Beyond them a hall ring surrounds **7 classrooms, 5 faculty rooms, the Principal's office, a cafeteria and JD's room**, with **4 exits** (south start, west, east, and through the cafeteria). The map is data in `js/map.js` and is checked by `tests/map.test.mjs`. Mirror Mode flips it.

## What's in the game (spec: `JD's Basics Classic Remastered Design Document`)
- **Styles**: Classic, Party (wrapped presents that shuffle, balloons, party hats, candle finale), Demo (Math Machines answered with balloons, random events: Gravity Chaos / Fog / Flood / broken ruler, more items), plus **Null** (unlocked by default) and **Glitch** (appears after you beat Null) styles (silent hunter, boss fight, journal ending).
- **Modes**: Story, Endless (any style, score = notebooks), Free Run (no JD, nothing unlocks).
- **Fun Settings**: Hard Mode, Lights Out, Mirror Mode; unlocked by beating Demo / Party / Classic. **Null Style is available from the start.**
- **JD AI** (`js/ai.js`, tuned by `config/ai.json`): bursts timed to ruler slaps; slap gap 3.0 s → 1.0 s by notebooks held, temporary anger per wrong answer (0.135 / 0.27 / 0.405 s, decays 0.2 s per second), `minGap` floor; Wander / Follow / Chase states; noise priority detention > alarm > exit > wrong answer > door; Tape and apple effects. Notebook 1 is friendly if you get it all right (he gives you a Quarter); every later notebook ends with an impossible problem.
- **Cast** (`config/characters.json`): Principal of the Thing (detention), Playtime (jump-rope minigame, Scissors cut the rope), It's a Bully (blocks a hall until you hand over an item; the Principal can send him to detention), Gotta Sweep (pushes everyone; Big Ol' Boots), 1st Prize (pushes only the player), Arts and Crafters (shy until 7 notebooks, then staring at him is a mistake), Null.
- **Items** (3 slots): BSODA, Quarter, Safety Scissors, Zesty Bar, Principal's Keys, JD's Least Favorite Tape, Alarm Clock, WD-NoSquee, Door Lock, Big Ol' Boots, An Apple for JD.
- 16 local **trophies**, high scores and best times, saved in IndexedDB (schema-versioned, persistent storage requested) with export / import / reset.
- **Look**: low-res 3D (320×180 / 427×240 / 640×360 render target scaled with nearest-neighbour), ordered-dither + reduced colour depth post-process, crude low-poly JD, dithered cut-out characters.
- **Audio**: all 13 music cues, effects, ambience and Null's radio voice are synthesised in WebAudio; separate music / effects / voice buses with ducking; subtitles for every voice line (Null's are stored obfuscated); "Tap to start" gate unlocks audio.
- **Mobile**: landscape two-thumb controls (floating stick in the left third, drag-look on the right two thirds, hold-to-run, TAP, USE, hold-to-look-behind, inventory at the top), left-handed layout, haptics, wake lock, safe-area insets, rotate screen + auto-pause in portrait, Reduce Flashing, high-contrast HUD, photosensitivity notice.
- **PWA**: manifest per spec, iOS meta tags + one-time "Add to Home Screen" card, Android install button, offline precache, automatic update check on open (applied at the menu, never mid-run).

## Lesson-B (the -B mod)
A separate mode, **Lesson-B**, implements *Project LESSON-B* (`-B Clone Game Spec`). Pick it in the Style column; Story or Practice, four difficulties, a 6-digit seed and share codes.
- **Teacher**: rhythm pursuit (wait, ruler slap, 0.45 s burst) with `avgSpeed = 4 + 1.6N + 1.2A` and `W = max(0.9, 2.6 - 0.2N - 0.1A)`; friendly at his desk until you collect notebook 1, which wakes him (his first anger). Noise priority, ringing alarm, Static Tape disorientation, Fizz knockback, escape-phase alarm.
- **No math questions** in this mode: notebooks are collected on touch. (The other styles keep the You Can Think Pad, addition and subtraction only.)
- **Hallway characters**: Principal (warning then detention), Bully, Sweeper, Rope kid, Hug-bot, Crafter, with the spec's states, activation notebooks, active cap and 15 s mercy.
- **Items**: Zest Bar, Brace Lock, Master Keys, Fizz Can, Quarter, Alarm Clock, Static Tape, Safety Scissors, Hinge Oil, Map; vending machines and tape decks.
- Detention (15 s + 10 s per prior, cap 60), escape phase, results with rank S-D, share codes, 5 extra trophies, mood curve, danger vignette, timer, jump-scare intensity setting.
- **Data-driven**: tuning lives in `data/lessonb/*.json`. The **-B variant layer** is `data/lessonb/variants/b.json` (notebook count, Teacher overrides, enabled characters/items, detention, and `chars.custom[]` data-only characters with `spawn`, `speed`, `senses`, `onPlayerContact` = `stun | teleport | stealItem | drainStamina | catch`). Edit that file to add the real -B differences; no code changes needed.
- Not implemented from that spec: gamepad and key rebinding, Challenge/Endless modes, replay export, dynamic resolution, the Cruel fake exit, door-choice loop quirk. The school is the shared Classic-style map (rooms are assigned roles: Teacher's Study = JD's room, Cafeteria, Art Room = a faculty room, Faculty Lounge = a faculty room; the seven classrooms hold the notebooks).

## Controls
| Action | Touch | Desktop |
|---|---|---|
| Move | stick (left third) | WASD |
| Look | drag right side | mouse |
| Run | hold RUN | Shift |
| Interact | TAP, or tap an object in the middle | E / click |
| Use item | USE | F / right-click |
| Item slot | tap top slots | 1-3 / wheel |
| Look behind | hold ⟲ | C |
| Map / Pause | buttons | M / Esc, P |

## Develop
No build step. `python3 -m http.server 8000` (or `npm run serve`) and open http://localhost:8000.
`npm test` runs the JD speed-table simulation (spec §3 tuning note) and the precache budget checks.

## Deploy
`.github/workflows/pages.yml` runs the tests, stamps `sw.js` with the commit SHA (so every deploy is a new version) and publishes the repository root. Set *Settings → Pages → Source: GitHub Actions*.

## Deliberate differences from the spec
- **No Vite / TypeScript**: plain ES modules with a vendored three.js (kept from the earlier version), so there is no build to break on GitHub Pages.
- **Audio is generated in code** rather than shipped as AAC files, so the audio budget is zero bytes.
- **Network-first service worker** (not cache-first) so updates always arrive; the precache is the offline fallback. File names are not content-hashed.
- The renderer fills the whole screen (internal width follows the aspect ratio) instead of letterboxing to 16:9.
- Not implemented: Chaos Mode and Debug Mode (spec leaves them undefined), the pay phone, glass windows, and the rare fake-crash screen.
- Playtime keeps the easier tuning requested earlier (slower marker, wide green zone) with the spec's 5 jumps.
- Math is addition and subtraction only (requested earlier).
