# JD's Basics Classic Remastered

A free first-person stealth-horror **parody of 90s edutainment software**, built as an installable, offline-capable mobile web app (PWA) and hosted on GitHub Pages. Collect 7 notebooks while JD, who hears every noise, hunts you, then escape through one of four exits.

Fan-made tribute; all art, music and code are original and generated in the browser. No accounts, ads, analytics or third-party requests.

## What's in the game (spec: `JD's Basics Classic Remastered Design Document`)
- **Styles**: Classic, Party (wrapped presents that shuffle, balloons, party hats, candle finale), Demo (Math Machines answered with balloons, random events: Gravity Chaos / Fog / Flood / broken ruler, more items), plus hidden **Null** and **Glitch** styles (silent hunter, boss fight, journal ending).
- **Modes**: Story, Endless (any style, score = notebooks), Free Run (no JD, nothing unlocks).
- **Fun Settings**: Hard Mode, Lights Out, Mirror Mode; unlocked by beating Demo / Party / Classic. Beating story with all of them on unlocks Null Style.
- **JD AI** (`js/ai.js`, tuned by `config/ai.json`): bursts timed to ruler slaps; slap gap 3.0 s → 1.0 s by notebooks held, temporary anger per wrong answer (0.135 / 0.27 / 0.405 s, decays 0.2 s per second), `minGap` floor; Wander / Follow / Chase states; noise priority detention > alarm > exit > wrong answer > door; Tape and apple effects. Notebook 1 is friendly if you get it all right (he gives you a Quarter); every later notebook ends with an impossible problem.
- **Cast** (`config/characters.json`): Principal of the Thing (detention), Playtime (jump-rope minigame, Scissors cut the rope), It's a Bully (blocks a hall until you hand over an item; the Principal can send him to detention), Gotta Sweep (pushes everyone; Big Ol' Boots), 1st Prize (pushes only the player), Arts and Crafters (shy until 7 notebooks, then staring at him is a mistake), Null.
- **Items** (3 slots): BSODA, Quarter, Safety Scissors, Zesty Bar, Principal's Keys, JD's Least Favorite Tape, Alarm Clock, WD-NoSquee, Door Lock, Big Ol' Boots, An Apple for JD.
- 16 local **trophies**, high scores and best times, saved in IndexedDB (schema-versioned, persistent storage requested) with export / import / reset.
- **Look**: low-res 3D (320×180 / 427×240 / 640×360 render target scaled with nearest-neighbour), ordered-dither + reduced colour depth post-process, crude low-poly JD, dithered cut-out characters.
- **Audio**: all 13 music cues, effects, ambience and Null's radio voice are synthesised in WebAudio; separate music / effects / voice buses with ducking; subtitles for every voice line (Null's are stored obfuscated); "Tap to start" gate unlocks audio.
- **Mobile**: landscape two-thumb controls (floating stick in the left third, drag-look on the right two thirds, hold-to-run, TAP, USE, hold-to-look-behind, inventory at the top), left-handed layout, haptics, wake lock, safe-area insets, rotate screen + auto-pause in portrait, Reduce Flashing, high-contrast HUD, photosensitivity notice.
- **PWA**: manifest per spec, iOS meta tags + one-time "Add to Home Screen" card, Android install button, offline precache, automatic update check on open (applied at the menu, never mid-run).

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
