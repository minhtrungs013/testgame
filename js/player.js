import * as THREE from 'three';
import { heightAt } from './noise.js';

// ---------------------------------------------------------------------------
// Third-person survivor: low-poly humanoid, WASD + mouse orbit (pointer lock),
// walk/run/jump, simple procedural walk animation + tool swing.
// ---------------------------------------------------------------------------

export const WALK_SPEED = 4.5, RUN_SPEED = 7.5;

function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, heightAt(0, 0), 0);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;      // character facing (away from the default camera)
    // default view: camera above-behind, looking down at the survivor and the
    // ground ahead, so the crosshair naturally lands on trees/rocks while walking
    this.camYaw = 0; this.camPitch = 0.4;
    this.onGround = true;
    this.walkPhase = 0;
    this.swingT = 0;         // tool swing animation 1 -> 0
    this.hp = 100; this.hunger = 100; this.stamina = 100;
    this.inv = { wood: 0, stone: 0, berry: 0 };
    this.dead = false;

    const g = this.root = new THREE.Group();
    const skin = 0xd9a06b, skinD = 0xbd865a, jacket = 0xb45a2a, jacketD = 0x8a431f,
          pants = 0x33404e, pantsD = 0x27313d, boots = 0x2b2119, pack = 0x6b4a2b;

    // ---- legs: thigh (hip pivot) + shin (knee pivot) + boot ----
    const buildLeg = (sx) => {
      const hip = new THREE.Group(); hip.position.set(0.12 * sx, 0.92, 0); g.add(hip);
      box(0.17, 0.42, 0.19, pants, 0, -0.21, 0, hip);            // thigh
      box(0.18, 0.1, 0.2, pantsD, 0, -0.38, 0, hip);             // knee pad
      const knee = new THREE.Group(); knee.position.set(0, -0.44, 0); hip.add(knee);
      box(0.15, 0.38, 0.16, pants, 0, -0.19, 0, knee);           // shin
      box(0.16, 0.11, 0.3, boots, 0, -0.4, 0.05, knee);         // boot
      box(0.16, 0.05, 0.06, 0x1a1512, 0, -0.36, -0.09, knee);   // heel
      return { hip, knee };
    };
    const legL = buildLeg(-1), legR = buildLeg(1);
    this.legL = legL.hip; this.kneeL = legL.knee;
    this.legR = legR.hip; this.kneeR = legR.knee;

    // ---- upper body group (pivot at hips so it can lean/sway) ----
    const upper = this.upper = new THREE.Group();
    upper.position.set(0, 0.92, 0); g.add(upper);
    box(0.4, 0.2, 0.26, pants, 0, 0.04, 0, upper);               // pelvis
    box(0.42, 0.08, 0.28, 0x4a3020, 0, 0.15, 0, upper);         // belt
    box(0.1, 0.09, 0.03, 0x777777, 0.12, 0.15, 0.14, upper);     // belt buckle
    box(0.46, 0.46, 0.3, jacket, 0, 0.44, 0, upper);            // chest
    box(0.07, 0.4, 0.02, jacketD, 0, 0.44, 0.155, upper);        // zipper
    box(0.32, 0.1, 0.26, jacketD, 0, 0.7, 0, upper);            // collar
    // backpack with straps + bedroll
    box(0.34, 0.44, 0.22, pack, 0, 0.44, -0.26, upper);
    box(0.36, 0.14, 0.24, 0x8a7a5a, 0, 0.72, -0.26, upper);      // bedroll
    box(0.38, 0.05, 0.24, 0x4a3520, 0, 0.6, -0.26, upper);       // roll strap
    box(0.08, 0.46, 0.03, 0x4a3520, -0.15, 0.44, 0.155, upper);  // shoulder straps
    box(0.08, 0.46, 0.03, 0x4a3520, 0.15, 0.44, 0.155, upper);

    // ---- arms: upper arm (shoulder pivot) + forearm (elbow pivot) ----
    const buildArm = (sx) => {
      const sh = new THREE.Group(); sh.position.set(0.3 * sx, 0.62, 0); upper.add(sh);
      box(0.15, 0.2, 0.16, jacket, 0, -0.04, 0, sh);             // shoulder pad
      box(0.13, 0.3, 0.14, jacket, 0, -0.24, 0, sh);             // upper arm
      const el = new THREE.Group(); el.position.set(0, -0.4, 0); sh.add(el);
      box(0.12, 0.28, 0.13, jacketD, 0, -0.14, 0, el);           // forearm
      box(0.12, 0.12, 0.12, skin, 0, -0.32, 0, el);             // hand
      return { sh, el };
    };
    const armL = buildArm(-1), armR = buildArm(1);
    this.armL = armL.sh; this.elbowL = armL.el;
    this.armR = armR.sh; this.elbowR = armR.el;

    // ---- neck + head ----
    box(0.13, 0.1, 0.13, skinD, 0, 0.76, 0, upper);             // neck
    const head = this.head = new THREE.Group();
    head.position.set(0, 0.88, 0); upper.add(head);
    box(0.28, 0.3, 0.28, skin, 0, 0.02, 0, head);
    box(0.06, 0.08, 0.05, skinD, 0, -0.02, 0.155, head);        // nose
    box(0.05, 0.09, 0.06, skin, -0.165, 0.02, 0, head);         // ears
    box(0.05, 0.09, 0.06, skin, 0.165, 0.02, 0, head);
    box(0.05, 0.065, 0.02, 0x1a1a1a, -0.065, 0.04, 0.145, head); // eyes
    box(0.05, 0.065, 0.02, 0x1a1a1a, 0.065, 0.04, 0.145, head);
    box(0.32, 0.1, 0.32, 0x3a4a3a, 0, 0.2, -0.01, head);        // cap
    box(0.3, 0.035, 0.17, 0x3a4a3a, 0, 0.155, 0.21, head);      // cap brim

    // starter axe in the right hand
    const axe = new THREE.Group();
    axe.position.set(0, -0.32, 0.08); axe.rotation.x = 0.4;
    this.elbowR.add(axe);
    box(0.05, 0.72, 0.05, 0x6a4a2a, 0, 0.22, 0, axe);
    box(0.06, 0.16, 0.22, 0x9a9a9a, 0, 0.54, 0.06, axe);
    this.axe = axe;

    this.root.position.copy(this.pos);
    scene.add(this.root);
  }

  get headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z); }

  swing() { if (this.swingT <= 0) this.swingT = 1; }

  eatBerry() {
    if (this.inv.berry > 0 && this.hunger < 100) {
      this.inv.berry--;
      this.hunger = Math.min(100, this.hunger + 22);
      return true;
    }
    return false;
  }

  respawn() {
    this.pos.set(0, heightAt(0, 0), 0);
    this.vel.set(0, 0, 0);
    this.hp = 70; this.hunger = 60; this.stamina = 100;
    this.dead = false;
  }

  update(dt, input, world, time) {
    if (this.dead) return;
    // --- movement input (camera-relative) ---
    const f = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
    const r = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
    const wantRun = (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')) && f > 0;
    const canRun = wantRun && this.stamina > 1;
    const speed = canRun ? RUN_SPEED : WALK_SPEED;
    if (canRun) this.stamina = Math.max(0, this.stamina - dt * 14);
    else this.stamina = Math.min(100, this.stamina + dt * (f || r ? 8 : 16));

    // camera-relative movement: W = away from camera, A/D = strafe
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    const wish = new THREE.Vector3((-sin * f + cos * r), 0, (-cos * f - sin * r));
    if (wish.lengthSq() > 0) wish.normalize();
    const accel = this.onGround ? 26 : 8;
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, dt * accel / Math.max(1, speed));
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, dt * accel / Math.max(1, speed));

    // --- jump & gravity ---
    if (input.jump && this.onGround) { this.vel.y = 6.5; this.onGround = false; input.jump = false; }
    this.vel.y -= 20 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    world.collide(this.pos, 0.45);
    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.02) this.onGround = false;
    // don't walk off the world edge
    const rr = Math.hypot(this.pos.x, this.pos.z);
    if (rr > 122) { this.pos.x *= 122 / rr; this.pos.z *= 122 / rr; }

    // --- facing: turn smoothly toward the movement direction ---
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.6) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
    }

    // --- vitals ---
    this.hunger = Math.max(0, this.hunger - dt * 0.22);
    if (this.hunger <= 0) this.hp = Math.max(0, this.hp - dt * 2.5);
    if (this.hp <= 0) this.dead = true;

    // --- animation: procedural walk/run with knees, elbows and body lean ---
    // runK blends the gait from walk (0) to run (1)
    const runK = THREE.MathUtils.clamp((hSpeed - 3.4) / (RUN_SPEED - 3.4), 0, 1);
    this.walkPhase += dt * (2.4 + hSpeed * 1.55);
    const ph = this.walkPhase;
    const sw = Math.min(1, hSpeed / 2.5);   // 0 idle -> 1 moving
    const airK = this.onGround ? 0 : 1;
    const thighAmp = (0.62 + 0.38 * runK) * sw;
    // thighs swing opposite; knees flex (heel toward butt) as the leg swings through
    const kneeAmp = (0.5 + 1.5 * runK) * sw;
    const kneeL = kneeAmp * Math.max(0, Math.sin(ph - Math.PI / 2)) + 0.07 * sw;
    const kneeR = kneeAmp * Math.max(0, Math.sin(ph + Math.PI / 2)) + 0.07 * sw;
    this.legL.rotation.x = Math.sin(ph) * thighAmp * (1 - airK) + 0.3 * airK;
    this.legR.rotation.x = Math.sin(ph + Math.PI) * thighAmp * (1 - airK) + 0.45 * airK;
    this.kneeL.rotation.x = kneeL * (1 - airK) + 0.85 * airK;
    this.kneeR.rotation.x = kneeR * (1 - airK) + 0.35 * airK;
    // arms counter-swing; elbows bend more (pumping) when running
    const armAmp = (0.5 + 0.45 * runK) * sw;
    const elbowBase = 0.22 + 1.05 * runK;
    this.armL.rotation.x = -Math.sin(ph) * armAmp * (1 - airK) - 0.1 * airK;
    this.elbowL.rotation.x = -(elbowBase * sw + Math.max(0, Math.sin(ph + 1.1)) * 0.35 * runK * sw) * (1 - airK) - 0.25 * airK;
    // right arm: swing the axe when striking, otherwise counter-swing
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 3.2);
      const k = 1 - this.swingT; // 0 -> 1
      this.armR.rotation.x = -2.4 * Math.sin(k * Math.PI) + 0.3;
      this.elbowR.rotation.x = -0.5;
    } else {
      this.armR.rotation.x = -Math.sin(ph + Math.PI) * armAmp * (1 - airK) - 0.1 * airK;
      this.elbowR.rotation.x = -(elbowBase * sw + Math.max(0, Math.sin(ph + Math.PI + 1.1)) * 0.35 * runK * sw) * (1 - airK) - 0.25 * airK;
    }
    // torso: lean forward with speed, sway side to side, head stays level
    const lean = (0.06 * sw + 0.17 * runK) * (1 - airK);
    this.upper.rotation.x = lean;
    this.upper.rotation.z = Math.sin(ph) * 0.04 * sw * (1 - airK);
    this.head.rotation.x = -lean * 0.65;
    this.head.rotation.y = Math.sin(ph) * 0.03 * sw;
    // vertical bob (twice per stride) + idle breathing
    const bob = Math.abs(Math.sin(ph)) * (0.03 + 0.05 * runK) * sw * (1 - airK);
    const breathe = Math.sin(time * 1.8) * 0.012 * (1 - sw);
    this.upper.position.y = 0.92 - bob;   // hips dip with each step, feet stay planted
    this.root.position.set(this.pos.x, this.pos.y + breathe, this.pos.z);
    this.root.rotation.y = this.yaw;
  }

  // mouse-look camera (pointer lock or drag fallback); no auto-follow — the
  // player aims the camera, WASD moves relative to it
  updateCamera(camera, dt) {
    const dist = 5.2;
    const cx = this.camYaw, cp = this.camPitch;
    const fx = -Math.sin(cx) * Math.cos(cp), fz = -Math.cos(cx) * Math.cos(cp), fy = -Math.sin(cp);
    const hx = this.pos.x, hy = this.pos.y + 1.9, hz = this.pos.z;
    let camX = hx - fx * dist, camY = hy - fy * dist, camZ = hz - fz * dist;
    const minY = heightAt(camX, camZ) + 0.35;
    if (camY < minY) camY = minY;
    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), Math.min(1, dt * 14));
    camera.lookAt(hx + fx * 2, hy + fy * 2 - 0.4, hz + fz * 2);
  }
}
