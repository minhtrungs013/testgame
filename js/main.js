// Survival MVP - phase 1: third-person character, gathering (wood/stone/berries),
// vitals (health/hunger/stamina), day/night cycle.
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Gather } from './gather.js';
import { UI } from './ui.js';
import { heightAt } from './noise.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.FogExp2(0x9ab8d0, 0.0075);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

const hemi = new THREE.HemisphereLight(0xbdd8f0, 0x3a4a2a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const world = new World(scene);
const player = new Player(scene);
const ui = new UI();
const gather = new Gather(scene, world, player, ui, camera);
ui.refreshInv(player.inv);

// ---------------- input: pointer-lock mouse look + drag fallback ----------------
const input = { keys: new Set(), jump: false };
let locked = false;    // pointer-lock mode
let lockless = false;  // fallback: hold left mouse and drag to look (no pointer lock)
const startOverlay = document.getElementById('start');
const lockPill = document.getElementById('lockstate');

function refreshOverlay() {
  startOverlay.classList.toggle('hidden', locked || lockless);
  lockPill.textContent = locked ? '🔒' : lockless ? '✋ kéo chuột để xoay' : '🔓';
  lockPill.title = locked ? 'Chuột đã khóa' : lockless ? 'Chế độ kéo chuột' : 'Chuột chưa khóa — bấm vào màn hình';
}

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  input.keys.add(e.code);
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'KeyE') gather.strike();
  if (e.code === 'KeyF' && player.eatBerry()) { ui.refreshInv(player.inv); ui.toast('Ăn quả mọng: +22 độ no'); }
  if (e.code === 'Escape' && lockless) { lockless = false; refreshOverlay(); } // back to menu
});
addEventListener('keyup', (e) => input.keys.delete(e.code));

const playing = () => startOverlay.classList.contains('hidden') && !player.dead;
// pointer-lock mode: click strikes
canvas.addEventListener('mousedown', (e) => { if (locked && e.button === 0 && playing()) gather.strike(); });

// lockless mode: drag to look, quick click strikes
let dragging = false, dragMoved = 0, lx = 0, ly = 0;
canvas.addEventListener('mousedown', (e) => {
  if (!locked && lockless && e.button === 0) { dragging = true; dragMoved = 0; lx = e.clientX; ly = e.clientY; }
});
addEventListener('mouseup', (e) => {
  if (!locked && lockless && dragging && e.button === 0) {
    dragging = false;
    if (dragMoved < 6 && playing()) gather.strike();
  }
});

const clampDelta = (v) => Number.isFinite(v) ? THREE.MathUtils.clamp(v, -80, 80) : 0;
addEventListener('mousemove', (e) => {
  if (locked) {
    // pointer-lock deltas: clamp each event so a spike can't whip the camera around
    let dx = e.movementX, dy = e.movementY;
    if (e.getCoalescedEvents) {
      const evs = e.getCoalescedEvents();
      if (evs.length > 1) { dx = 0; dy = 0; for (const c of evs) { dx += c.movementX || 0; dy += c.movementY || 0; } }
    }
    player.camYaw -= clampDelta(dx) * 0.0024;
    player.camPitch = THREE.MathUtils.clamp(player.camPitch - clampDelta(dy) * 0.0024, -1.15, 0.9);
    return;
  }
  if (lockless && dragging) {
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (Number.isFinite(dx + dy)) {
      player.camYaw -= dx * 0.0042;
      player.camPitch = THREE.MathUtils.clamp(player.camPitch - dy * 0.0042, -1.15, 0.9);
    }
  }
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  refreshOverlay();
});
document.addEventListener('pointerlockerror', () => {
  ui.toast('Trình duyệt chặn khóa chuột — hãy bấm "Chơi không khóa chuột"');
});
refreshOverlay();

// NOTE: the #start overlay covers the canvas, so the click-to-play handler must
// live on the overlay too (a canvas-only listener never fires while it is up).
function lockPointer() {
  if (locked || lockless) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => ui.toast('Không khóa được chuột — hãy bấm "Chơi không khóa chuột"'));
  } catch { /* older browsers: ignore */ }
}
function resumeGame() {
  if (lockless) { startOverlay.classList.add('hidden'); return; } // resume drag mode
  lockPointer();
}
canvas.addEventListener('click', resumeGame);
startOverlay.addEventListener('click', resumeGame);
document.getElementById('btn-lockless').addEventListener('click', (e) => {
  e.stopPropagation(); // don't trigger the overlay's resumeGame
  lockless = true;
  refreshOverlay();
  ui.toast('Chế độ kéo chuột: giữ chuột trái và kéo để xoay camera, bấm nhanh để thu thập, ESC để về menu');
});

document.getElementById('btn-respawn').addEventListener('click', () => {
  player.respawn(); ui.hideDeath(); ui.refreshInv(player.inv);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- day / night ----------------
const DAY_LEN = 480; // seconds per full day
let dayT = 0.28;     // start in the morning
const skyDay = new THREE.Color(0x87b5e0), skyNight = new THREE.Color(0x0a1026);
const skySet = new THREE.Color(0xe08a4a);
const sunDay = new THREE.Color(0xfff2dd), sunNight = new THREE.Color(0x4a5a9a);

function updateDayNight(dt) {
  dayT = (dayT + dt / DAY_LEN) % 1;
  const ang = dayT * Math.PI * 2 - Math.PI / 2; // 0 = sunrise
  const elev = Math.sin(ang);                   // -1..1
  const azim = Math.cos(ang);
  const px = player.pos.x, pz = player.pos.z;
  sun.position.set(px + azim * 60, Math.max(elev, -0.25) * 80 + 8, pz + 30);
  sun.target.position.set(px, 0, pz);
  const dayK = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
  const setK = Math.max(0, 1 - Math.abs(elev) * 4) * (elev > -0.15 ? 1 : 0);
  scene.background.copy(skyNight).lerp(skyDay, dayK).lerp(skySet, setK * 0.55);
  scene.fog.color.copy(scene.background);
  sun.intensity = 0.12 + dayK * 2.1;
  sun.color.copy(sunNight).lerp(sunDay, dayK);
  hemi.intensity = 0.25 + dayK * 0.7;
  const clock = document.getElementById('clock');
  const hh = Math.floor(dayT * 24), mm = Math.floor((dayT * 24 - hh) * 60);
  clock.textContent = `Ngày 1 — ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${dayK < 0.25 ? ' 🌙' : ''}`;
}

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let toastT = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;

  player.update(dt, input, world, time);
  // defensive: a single bad mouse event must never corrupt the camera forever
  if (!Number.isFinite(player.camYaw)) player.camYaw = 0;
  if (!Number.isFinite(player.camPitch)) player.camPitch = 0.4;
  player.updateCamera(camera, dt);
  world.update(dt, time);
  gather.update(dt);
  updateDayNight(dt);
  ui.updateVitals(player);

  if (player.dead) ui.showDeath();

  // first-time hints
  toastT += dt;
  if (toastT > 1 && !frame.h1) { frame.h1 = 1; ui.toast('Dùng WASD để di chuyển, chuột để nhìn xung quanh'); }
  if (toastT > 6 && !frame.h2) { frame.h2 = 1; ui.toast('Nhắm vào cây/đá rồi nhấn E (hoặc chuột trái) để thu thập'); }

  renderer.render(scene, camera);
}
frame();
