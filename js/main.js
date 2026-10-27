// Boot, input (touch / keyboard / mouse), main loop, PWA plumbing.
import { G, S, P, input, $, clamp, isTouch } from './state.js';
import { cfg, loadConfig } from './config.js';
import { Save } from './save.js';
import { createRenderer } from './render.js';
import { buildWorld, cellCenter } from './world.js';
import * as Snd from './audio.js';
import './actors.js';
import './modes.js';
import { loadLB } from './lessonb.js';
import * as LBAI from './lbai.js';
import { initGame, startRun, update, pause, resume, padInput, applyLook } from './game.js';
import { initUI, M, renderMenu } from './ui.js';

const BUILD = 'v13-pace';
const canvas = $('view');
let failures = 0, R = null, last = performance.now(), menuYaw = 0, lastOpts = null, wakeLock = null;
const keys = {}, stick = { x: 0, y: 0, cx: 0, cy: 0 };
let runBtn = false, behindBtn = false;
const settings = () => Save.settings;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const portrait = () => window.innerHeight > window.innerWidth * 1.05;

// ------------------------------------------------------------------ settings
function applySettings() {
  const s = settings();
  Snd.setVolumes(s.musicVol, s.sfxVol, s.voiceVol);
  document.body.classList.toggle('lefty', !!s.lefty); document.body.classList.toggle('hicontrast', !!s.hiContrast);
  R?.resize(s.quality); if (G.world) applyLook();
}
function checkOrientation() {
  const p = portrait(); $('rotate').classList.toggle('hidden', !p);
  if (p && (S.mode === 'play' || S.mode === 'playtime')) pause();      // pause when the device is in portrait
}
addEventListener('resize', () => { R?.resize(); checkOrientation(); });
addEventListener('orientationchange', () => setTimeout(() => { R?.resize(); checkOrientation(); }, 250));

// ------------------------------------------------------------------ screen wake lock
async function takeWake() { try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {} }
function dropWake() { try { wakeLock?.release(); } catch (e) {} wakeLock = null; }
G.hooks.onPause = dropWake; G.hooks.onResume = takeWake; G.hooks.onOver = () => { dropWake(); setTimeout(() => G.hooks.afterMenu?.(), 1500); };

// ------------------------------------------------------------------ flow
function hideRunUI() { $('clock').style.display = 'none'; ['hud', 'touch', 'math', 'play', 'scene', 'candle', 'scare', 'pause', 'over'].forEach((id) => $(id).classList.add('hidden')); $('hud').classList.remove('hud-off'); }
function start(style, run, fun, retrySeed) {
  if ((style === 'null' || style === 'glitch') && !sessionStorage.getItem('jd-flash-ok')) {
    if (!confirm('Photosensitivity notice: this style uses dimming lights, distortion and loud sounds. Turn on Reduce Flashing in Settings if you are sensitive. Continue?')) return;
    try { sessionStorage.setItem('jd-flash-ok', '1'); } catch (e) {}
  }
  const seed = style === 'lessonb' ? (retrySeed || M.lb.seed || LBAI.randSeed()) : 0;
  if (style === 'lessonb') G.lbOpts = { diff: M.lb.diff, seed, mode: run };
  Snd.init(); Snd.resume(); lastOpts = { style, run, fun: { ...fun }, seed, diff: M.lb.diff };
  G.hooks.show(null); hideRunUI(); $('hud').classList.remove('hidden'); if (isTouch) $('touch').classList.remove('hidden');
  Snd.music.stop(); G.musicWant = null;
  startRun(style, run, fun); applySettings();
  S.mode = 'play'; G.musicHold = 8; Snd.music.play('menuConfirm'); G.musicWant = 'menuConfirm';
  if (style === 'null' || style === 'glitch') { G.musicHold = 0; Snd.music.stop(); G.musicWant = null; }
  const intro = { classic: 'Find the <b>7 notebooks</b>. The yellow swinging doors open after notebook 2. JD hears every noise…', party: "It's a party! Presents hide your items. Find the <b>7 notebooks</b>.", demo: 'Demo Style: feed the Math Machines <b>balloons</b> to get notebooks.', null: 'Quiet. Collect the notebooks. Make no sound.', lessonb: 'Lesson-B: listen for the ruler slaps. Notebook 1 ends with an impossible problem…', glitch: 'Something is off in the school…' }[style];
  G.say(run === 'endless' ? 'Endless: collect as many notebooks as you can!' : run === 'free' ? 'Free Run: explore. There is no JD.' : intro, 5000);
  if (!isTouch) G.lockPointer(); else { try { document.documentElement.requestFullscreen?.()?.catch?.(() => {}); } catch (e) {} }
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (e) {}
  takeWake(); checkOrientation();
}
function exitToMenu() {
  Snd.music.stop(); Snd.ambienceStop(); Snd.sfx.alarmStop(); Snd.sfx.staticLoopStop(); document.exitPointerLock?.(); dropWake();
  G.lb?.cleanup?.(); S.mode = 'menu'; G.sceneCue = null; G.musicWant = null; hideRunUI(); G.clearNotebooks(); G.actors.hideAll?.();
  G.R.uniforms.glitch.value = 0; G.R.uniforms.hue.value = 0; G.R.uniforms.invert.value = 0; if (G.world) { G.world.wallMesh.rotation.set(0, 0, 0); applyLook(); }
  G.camera.rotation.z = 0; renderMenu(); G.hooks.show('menu'); if (Snd.isReady()) Snd.music.play('menuOpener'); checkOrientation(); G.hooks.afterMenu?.();
}
G.exitToMenu = exitToMenu;
G.actors.hideAll = () => { for (const a of G.actors.list) a.sprite.visible = false; G.actors.jd.model.visible = false; G.actors.jd.active = false; G.actors.principal.glow.visible = false; G.nullc.nullSprite.visible = G.nullc.loonSprite.visible = false; G.nullc.active = false; };

// ------------------------------------------------------------------ keyboard / mouse
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (S.mode === 'pad') { if (e.code === 'Enter' || e.code === 'NumpadEnter') padInput('OK'); else if (e.code === 'Backspace') padInput('⌫'); else if (/^[0-9]$/.test(e.key)) padInput(e.key); else if (e.key === '-') padInput('-'); e.preventDefault(); return; }
  if (S.mode === 'playtime' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); G.actors.jumpPress(); return; }
  if (e.repeat) return;
  if (S.mode !== 'play' && S.mode !== 'playtime') return;
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { input.act = true; e.preventDefault(); }
  if (e.code === 'KeyF' || e.code === 'KeyQ') input.use = true;
  if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { S.sel = +e.code.slice(-1) - 1; Snd.sfx.select(); G.renderSlots(); }
  if (e.code === 'KeyM') { S.map = !S.map; $('minimap').classList.toggle('hidden', !S.map); }
  if (e.code === 'KeyP' || e.code === 'Escape') pause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); Snd.suspend(); } else if (S.mode !== 'paused') { Snd.resume(); } if (!document.hidden && (S.mode === 'play' || S.mode === 'playtime')) takeWake(); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || S.mode !== 'play') return;
  const s = 0.0022 * settings().sens; P.yaw -= e.movementX * s; P.pitch = clamp(P.pitch - e.movementY * s, -1.2, 1.2);
});
addEventListener('mousedown', (e) => {
  if (S.mode !== 'play' && S.mode !== 'playtime') return;
  if (document.pointerLockElement !== canvas) { if (!isTouch && e.target === canvas) G.lockPointer(); return; }
  if (e.button === 0) input.act = true; else if (e.button === 2) input.use = true;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (S.mode !== 'play') return; S.sel = (S.sel + (e.deltaY > 0 ? 1 : 2)) % 3; Snd.sfx.select(); G.renderSlots(); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && S.mode === 'play' && !isTouch) pause(); });

// ------------------------------------------------------------------ touch: floating stick, look, tap-to-interact
const stickEl = $('stick'), knob = $('knob');
const stickT = { id: null }, lookT = { id: null, x: 0, y: 0, x0: 0, y0: 0, t0: 0 };
const isUi = (t) => !!(t.closest && t.closest('button, .slot, #math, #play, .screen, #hudBtns, #scene, #candle'));
const inStickZone = (x) => (settings().lefty ? x > window.innerWidth * 0.67 : x < window.innerWidth * 0.33);   // thumb lands in the outer third
function moveStick(x, y) { let dx = x - stick.cx, dy = y - stick.cy; const m = 50, d = Math.hypot(dx, dy); if (d > m) { dx = dx / d * m; dy = dy / d * m; } stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; }
function releaseStick() { stickT.id = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.style.left = stickEl.style.top = stickEl.style.bottom = stickEl.style.right = ''; }
G.releaseStick = releaseStick;
const touching = () => S.mode === 'play' || S.mode === 'playtime';
document.addEventListener('touchstart', (e) => {
  if (!touching()) return;
  for (const t of e.changedTouches) {
    if (isUi(e.target)) continue;
    if (inStickZone(t.clientX)) {
      if (stickT.id !== null) continue; stickT.id = t.identifier; stick.cx = t.clientX; stick.cy = t.clientY;
      const r = stickEl.getBoundingClientRect(); stickEl.style.left = (t.clientX - r.width / 2) + 'px'; stickEl.style.right = 'auto'; stickEl.style.top = (t.clientY - r.height / 2) + 'px'; stickEl.style.bottom = 'auto'; moveStick(t.clientX, t.clientY);
    } else if (lookT.id === null) { Object.assign(lookT, { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() }); }
  }
}, { passive: false });
document.addEventListener('touchmove', (e) => {
  if (!touching() && stickT.id === null && lookT.id === null) return;
  for (const t of e.changedTouches) {
    if (t.identifier === stickT.id) moveStick(t.clientX, t.clientY);
    else if (t.identifier === lookT.id) { const sc = 0.0055 * settings().sens; P.yaw -= (t.clientX - lookT.x) * sc; P.pitch = clamp(P.pitch - (t.clientY - lookT.y) * sc, -1.2, 1.2); lookT.x = t.clientX; lookT.y = t.clientY; }
  }
  if (S.mode !== 'title' && !e.target.closest?.('.screen, #trophyList')) e.preventDefault();
}, { passive: false });
const touchEnd = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stickT.id) releaseStick();
    if (t.identifier === lookT.id) {
      // a short tap in the middle of the view interacts with the object there
      const quick = performance.now() - lookT.t0 < 280, moved = Math.hypot(t.clientX - lookT.x0, t.clientY - lookT.y0);
      const cx = t.clientX / window.innerWidth, cy = t.clientY / window.innerHeight;
      if (quick && moved < 14 && cx > 0.3 && cx < 0.7 && cy > 0.2 && cy < 0.8 && touching()) input.act = true;
      lookT.id = null;
    }
  }
};
document.addEventListener('touchend', touchEnd); document.addEventListener('touchcancel', touchEnd);
document.addEventListener('gesturestart', (e) => e.preventDefault());
const hold = (el, on, off) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} on(); }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => el.addEventListener(ev, off)); };
hold($('tRun'), () => { runBtn = true; $('tRun').classList.add('on'); }, () => { runBtn = false; $('tRun').classList.remove('on'); });
hold($('tBehind'), () => { behindBtn = true; }, () => { behindBtn = false; });
$('tAct').addEventListener('pointerdown', (e) => { e.preventDefault(); input.act = true; });
$('tItem').addEventListener('pointerdown', (e) => { e.preventDefault(); input.use = true; });
$('btnMap').addEventListener('click', () => { S.map = !S.map; $('minimap').classList.toggle('hidden', !S.map); });
$('btnPause').addEventListener('click', pause);
$('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); G.actors.jumpPress(); });
$('cutBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); G.actors.cutRopeBtn(); });
(function keypad() { const kp = $('keypad'); ['7', '8', '9', '⌫', '4', '5', '6', '-', '1', '2', '3', '0', 'OK'].forEach((k) => { const b = document.createElement('button'); b.textContent = k === 'OK' ? 'ENTER' : k; if (k === 'OK') b.className = 'ok'; b.addEventListener('pointerdown', (e) => { e.preventDefault(); Snd.sfx.click(); padInput(k); }); kp.appendChild(b); }); })();

// pause / over buttons
$('resumeBtn').onclick = () => resume();
$('quitBtn').onclick = () => { $('quitConfirm').classList.remove('hidden'); };
$('quitNo').onclick = () => $('quitConfirm').classList.add('hidden');
$('quitYes').onclick = () => { $('quitConfirm').classList.add('hidden'); exitToMenu(); };
$('quitYes').addEventListener('pointerenter', () => {   // Null punishes quitting after a notebook, exactly like being caught
  if ((S.style === 'null' || S.style === 'glitch') && S.notebooks > 0 && S.mode === 'paused') { $('pause').classList.add('hidden'); $('quitConfirm').classList.add('hidden'); S.mode = 'play'; Snd.resume(); G.caught('null'); }
});
$('retryBtn').onclick = () => { if (!lastOpts) return; if (lastOpts.style === 'lessonb') M.lb.diff = lastOpts.diff; start(lastOpts.style, lastOpts.run, lastOpts.fun, lastOpts.seed); };
$('menuBtn').onclick = () => exitToMenu();

// ------------------------------------------------------------------ main loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  input.mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
  input.mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - stick.y;
  input.run = !!(keys.ShiftLeft || keys.ShiftRight || runBtn); input.behind = !!(keys.KeyC || behindBtn);
  try {
    if (S.mode === 'play' || S.mode === 'playtime') update(dt);
    else if (S.mode === 'pad' && !cfg.ai.padPausesWorld) update(dt);
    failures = 0;
  } catch (e) {   // a bug in one frame must never freeze the picture; give up cleanly if it keeps happening
    console.error(e);
    if (++failures > 60) { failures = 0; G.say('Something went wrong – back to the menu.', 3000, undefined, { force: true }); exitToMenu(); }
  }
  if (S.mode === 'menu' || S.mode === 'boot') menuYaw += dt * 0.12;
  const cam = G.camera, bob = Math.sin(P.bob) * 0.22 * (P.moving ? 1 : 0);
  if (S.mode === 'menu' || S.mode === 'boot') { cam.position.set(cellCenter(G.world.map.hubCam.x), 5, cellCenter(G.world.map.hubCam.z)); cam.rotation.set(0, menuYaw, 0); }
  else {
    let y = 5.2 + bob; if (S.event === 'gravity') y += 2.2 + Math.sin(S.time * 0.9) * 1.6; if (S.event === 'flood') y -= 0.4;
    cam.position.set(P.x, y, P.z); cam.rotation.set(P.pitch, P.yaw + (input.behind ? Math.PI : 0), cam.rotation.z);
  }
  R.render(now / 1000);
}

// ------------------------------------------------------------------ PWA: install + updates
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (!isStandalone()) $('installBtn').classList.remove('hidden'); });
addEventListener('appinstalled', () => $('installBtn').classList.add('hidden'));
$('installBtn').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('installBtn').classList.add('hidden'); };
$('iosOk').onclick = () => { settings().seenIosCard = true; Save.save('settings'); G.hooks.show('menu'); };
let updatePending = false;
function toast(msg) { let t = $('updateToast'); if (!t) { t = document.createElement('div'); t.id = 'updateToast'; document.body.appendChild(t); } t.textContent = msg; }
function applyUpdate() { if (!updatePending) return; if (S.mode === 'menu' || S.mode === 'boot' || S.mode === 'over') { toast('Updating…'); setTimeout(() => location.reload(), 300); } else toast('Update ready – it installs when you return to the menu'); }
G.hooks.afterMenu = applyUpdate;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had) return; updatePending = true; applyUpdate(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
}

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    await loadConfig(); await Save.load(); await loadLB();
    R = createRenderer(canvas); initGame(R);
    G.worlds[false] = buildWorld(R.scene, false); G.world = G.worlds[false]; G.root = G.world.root; applyLook();
    G.world.exitDoors.forEach((d) => { d.mesh.visible = true; });
    Object.assign(G.hooks, { start, applySettings }); initUI(G.hooks); applySettings(); S.mode = 'boot';
    $('bootMsg').textContent = 'A stealth-horror parody of 90s edutainment.'; $('tapBtn').classList.remove('hidden');
    $('hud').classList.add('hidden');
    requestAnimationFrame(frame);
  } catch (e) { $('bootMsg').textContent = 'Could not start: ' + e.message; console.error(e); }
}
$('tapBtn').onclick = () => {   // the tap that unlocks audio on iOS and Android
  Snd.init(); Snd.resume(); applySettings(); Snd.sfx.click();
  if (!settings().seenWarning) { $('warnReduce').checked = !!settings().reduceFlashing; G.hooks.show('warning'); Snd.music.play('warning'); return; }
  enterMenu();
};
$('warnOk').onclick = () => { settings().seenWarning = true; settings().reduceFlashing = $('warnReduce').checked; Save.save('settings'); Snd.music.stop(); enterMenu(); };
function enterMenu() {
  S.mode = 'menu'; renderMenu(); G.hooks.show('menu'); Snd.music.play('menuOpener');
  if (isIOS && !isStandalone() && !settings().seenIosCard) G.hooks.show('iosCard');
  if (isStandalone()) $('installBtn').classList.add('hidden');
  checkOrientation();
}
window.__game = { G, S, P, Save, cfg, BUILD, start, exitToMenu, update, M };
$('bootMsg').textContent = 'Loading… ' + BUILD;
boot();
