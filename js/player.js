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
    this.yaw = 0;            // character facing
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
    const skin = 0xd8a878, jacket = 0xb45a2a, pants = 0x33404e, boots = 0x2a2018;
    // legs (pivot at hip)
    this.legL = new THREE.Group(); this.legL.position.set(-0.11, 0.9, 0); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.11, 0.9, 0); g.add(this.legR);
    box(0.15, 0.82, 0.17, pants, 0, -0.41, 0, this.legL);
    box(0.15, 0.82, 0.17, pants, 0, -0.41, 0, this.legR);
    box(0.16, 0.1, 0.28, boots, 0, -0.85, 0.045, this.legL);
    box(0.16, 0.1, 0.28, boots, 0, -0.85, 0.045, this.legR);
    // torso
    box(0.42, 0.58, 0.26, jacket, 0, 1.2, 0, g);
    box(0.44, 0.1, 0.28, 0x4a3020, 0, 0.93, 0, g); // belt
    // backpack + bedroll (survivor look)
    box(0.32, 0.42, 0.2, 0x6a4a2a, 0, 1.26, -0.22, g);
    box(0.34, 0.12, 0.22, 0x8a7a5a, 0, 1.52, -0.22, g);
    // arms (pivot at shoulder)
    this.armL = new THREE.Group(); this.armL.position.set(-0.29, 1.44, 0); g.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.29, 1.44, 0); g.add(this.armR);
    box(0.13, 0.52, 0.14, jacket, 0, -0.25, 0, this.armL);
    box(0.13, 0.52, 0.14, jacket, 0, -0.25, 0, this.armR);
    box(0.12, 0.13, 0.13, skin, 0, -0.56, 0, this.armL); // hands
    box(0.12, 0.13, 0.13, skin, 0, -0.56, 0, this.armR);
    // head with cap and eyes
    const head = new THREE.Group(); head.position.set(0, 1.66, 0); g.add(head);
    box(0.26, 0.28, 0.26, skin, 0, 0, 0, head);
    box(0.045, 0.06, 0.02, 0x1a1a1a, -0.06, 0.02, 0.135, head);
    box(0.045, 0.06, 0.02, 0x1a1a1a, 0.06, 0.02, 0.135, head);
    box(0.3, 0.09, 0.3, 0x3a4a3a, 0, 0.17, -0.01, head); // cap
    box(0.3, 0.03, 0.15, 0x3a4a3a, 0, 0.13, 0.19, head); // cap brim
    // starter axe in the right hand
    const axe = new THREE.Group();
    axe.position.set(0, -0.58, 0.06); axe.rotation.x = 0.35;
    this.armR.add(axe);
    box(0.05, 0.7, 0.05, 0x6a4a2a, 0, 0.2, 0, axe);
    box(0.06, 0.15, 0.2, 0x9a9a9a, 0, 0.5, 0.05, axe);
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

    // --- facing ---
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

    // --- animation ---
    this.walkPhase += dt * (2 + hSpeed * 1.9);
    const sw = Math.min(1, hSpeed / 3) * 0.62;
    const airK = this.onGround ? 0 : 1;
    this.legL.rotation.x = Math.sin(this.walkPhase) * sw * (1 - airK) + 0.35 * airK;
    this.legR.rotation.x = Math.sin(this.walkPhase + Math.PI) * sw * (1 - airK) + 0.35 * airK;
    this.armL.rotation.x = Math.sin(this.walkPhase + Math.PI) * sw * 0.8;
    // right arm: swing the axe when striking, otherwise counter-swing
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 3.2);
      const k = 1 - this.swingT; // 0 -> 1
      this.armR.rotation.x = -2.4 * Math.sin(k * Math.PI) + 0.3;
    } else {
      this.armR.rotation.x = Math.sin(this.walkPhase) * sw * 0.8;
    }
    const breathe = Math.sin(time * 1.8) * 0.012;
    this.root.position.set(this.pos.x, this.pos.y + breathe, this.pos.z);
    this.root.rotation.y = this.yaw;
  }

  // freeLook = true while the player holds ALT: camera stays where the mouse put it.
  // Otherwise it eases back to the default follow angle (behind the survivor).
  updateCamera(camera, dt, freeLook = false) {
    if (!freeLook) {
      let d = this.yaw - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * Math.min(1, dt * 3.5);
      this.camPitch += (0.4 - this.camPitch) * Math.min(1, dt * 3.5);
    }
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
