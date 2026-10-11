import * as THREE from 'three';
import { heightAt, mulberry, valueNoise } from './noise.js';

// ---------------------------------------------------------------------------
// World: terrain, trees, rocks, berry bushes. Trees/rocks are harvestable
// resource nodes (hp -> shake -> fall/break -> respawn). All instanced.
// ---------------------------------------------------------------------------

const TREE_HP = 3, ROCK_HP = 4, RESPAWN_TIME = 60, BERRY_REGROW = 90;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function compose(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

export class World {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.rnd = mulberry(seed);
    this.colliders = [];
    this._buildTerrain();
    this._buildTrees();
    this._buildRocks();
    this._buildBushes();
  }

  // ---------------- terrain ----------------
  _buildTerrain() {
    const SIZE = 260, SEG = 130;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x5a8a3c), cGrass2 = new THREE.Color(0x6a9a44);
    const cDry = new THREE.Color(0x8a8a4a), cRock = new THREE.Color(0x7a7a72);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const n = valueNoise(x * 0.05, z * 0.05);
      c.copy(cGrass).lerp(cGrass2, n);
      if (n > 0.72) c.lerp(cDry, 0.5);                    // dry patches
      const slope = Math.abs(heightAt(x + 1.5, z) - y) + Math.abs(heightAt(x, z + 1.5) - y);
      if (slope > 1.1) c.lerp(cRock, Math.min(1, (slope - 1.1) * 0.8)); // rocky slopes
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.terrain = new THREE.Mesh(g, m);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  _scatter(count, minR, avoidSpawn) {
    const pts = [];
    let guard = count * 40;
    while (pts.length < count && guard-- > 0) {
      const x = (this.rnd() - 0.5) * 230, z = (this.rnd() - 0.5) * 230;
      if (Math.hypot(x, z) < avoidSpawn) continue;
      let ok = true;
      for (const p of pts) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < minR * minR) { ok = false; break; }
      }
      if (ok) pts.push({ x, z });
    }
    return pts;
  }

  // ---------------- trees ----------------
  _buildTrees() {
    const N = 130;
    const pts = this._scatter(N, 5, 10);
    const trunkG = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 7);
    trunkG.translate(0, 1.2, 0);
    const canG = new THREE.IcosahedronGeometry(1.7, 1);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1, flatShading: true });
    const canM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    this.trunkMesh = new THREE.InstancedMesh(trunkG, trunkM, pts.length);
    this.canopyMesh = new THREE.InstancedMesh(canG, canM, pts.length * 2);
    this.trunkMesh.castShadow = this.canopyMesh.castShadow = true;
    const leaf = new THREE.Color();
    this.trees = pts.map((p, i) => {
      const s = 0.8 + this.rnd() * 0.7;
      const y = heightAt(p.x, p.z) - 0.1;
      leaf.setHSL(0.29 + this.rnd() * 0.06, 0.45, 0.28 + this.rnd() * 0.1);
      this.canopyMesh.setColorAt(i * 2, leaf);
      this.canopyMesh.setColorAt(i * 2 + 1, leaf.clone().offsetHSL(0, 0, 0.05));
      this.colliders.push({ x: p.x, z: p.z, r: 0.55 * s });
      return {
        x: p.x, z: p.z, y, s, ry: this.rnd() * Math.PI * 2,
        hp: TREE_HP, alive: true, shakeT: 0, fallT: 0, fallDir: 1, respawnT: 0,
      };
    });
    this.trunkMesh.count = this.canopyMesh.count = 0; // written in _refreshTrees
    this._refreshTrees(0);
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.canopyMesh.instanceMatrix.needsUpdate = true;
    if (this.canopyMesh.instanceColor) this.canopyMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.trunkMesh, this.canopyMesh);
  }

  _treeMatrix(t, time, part) {
    // part: 0 = trunk, 1 = lower canopy, 2 = upper canopy
    const shake = t.shakeT > 0 ? Math.sin(time * 38) * 0.06 * t.shakeT : 0;
    const fall = t.fallT > 0 ? Math.min(1, t.fallT / 1.1) : 0;
    const fallA = fall * fall * 1.45 * t.fallDir; // ease-in tip over
    const grown = t.respawnT > 0 ? Math.min(1, 1 - t.respawnT / 3) : 1; // grow back
    const s = t.s * (t.alive ? 1 : Math.max(0.001, grown));
    let y, sy, sxz;
    if (part === 0) { y = 0; sy = s; sxz = s; }
    else if (part === 1) { y = 2.9 * s; sy = s * 1.15; sxz = s; }
    else { y = 4.3 * s; sy = s * 0.9; sxz = s * 0.72; }
    // world = translate(base) * rotY * rotZ(fall+shake) * translate(0, y, 0) * scale
    _e.set(0, t.ry, fallA + shake); _q.setFromEuler(_e);
    _p.set(t.x, t.y, t.z); _s.set(1, 1, 1);
    const base = new THREE.Matrix4().compose(_p, _q, _s);
    const local = compose(0, y, 0, 0, 0, 0, sxz, sy, sxz);
    return base.multiply(local);
  }

  _refreshTrees(time) {
    this.trees.forEach((t, i) => {
      this.trunkMesh.setMatrixAt(i, this._treeMatrix(t, time, 0));
      this.canopyMesh.setMatrixAt(i * 2, this._treeMatrix(t, time, 1));
      this.canopyMesh.setMatrixAt(i * 2 + 1, this._treeMatrix(t, time, 2));
    });
    this.trunkMesh.count = this.trees.length;
    this.canopyMesh.count = this.trees.length * 2;
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.canopyMesh.instanceMatrix.needsUpdate = true;
  }

  hitTree(i) {
    const t = this.trees[i];
    if (!t.alive) return 0;
    t.hp--; t.shakeT = 1;
    if (t.hp <= 0) {
      t.alive = false; t.fallT = 0.0001; t.fallDir = this.rnd() < 0.5 ? 1 : -1;
      t.respawnT = RESPAWN_TIME;
      return 2 + Math.floor(this.rnd() * 2); // wood drop
    }
    return 1;
  }

  // ---------------- rocks ----------------
  _buildRocks() {
    const pts = this._scatter(55, 6, 8);
    const g = new THREE.DodecahedronGeometry(1, 0);
    const m = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 1, flatShading: true });
    this.rockMesh = new THREE.InstancedMesh(g, m, pts.length);
    this.rockMesh.castShadow = this.rockMesh.receiveShadow = true;
    const c = new THREE.Color();
    this.rocks = pts.map((p, i) => {
      const s = 0.5 + this.rnd() * 1.1;
      c.setHSL(0.08, 0.04 + this.rnd() * 0.04, 0.45 + this.rnd() * 0.12);
      this.rockMesh.setColorAt(i, c);
      this.colliders.push({ x: p.x, z: p.z, r: s * 0.95 });
      return {
        x: p.x, z: p.z, y: heightAt(p.x, p.z), s,
        ry: this.rnd() * Math.PI * 2, rx: (this.rnd() - 0.5) * 0.4,
        hp: ROCK_HP, alive: true, shakeT: 0, respawnT: 0,
      };
    });
    this._refreshRocks(0);
    if (this.rockMesh.instanceColor) this.rockMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.rockMesh);
  }

  _refreshRocks(time) {
    this.rocks.forEach((r, i) => {
      const grown = r.respawnT > 0 ? Math.min(1, 1 - r.respawnT / 3) : 1;
      const crack = r.alive ? 1 - (ROCK_HP - r.hp) * 0.08 : 0.001;
      const s = r.s * crack * Math.max(0.001, grown);
      const shake = r.shakeT > 0 ? Math.sin(time * 42) * 0.05 * r.shakeT : 0;
      this.rockMesh.setMatrixAt(i,
        compose(r.x, r.y + s * 0.35, r.z, r.rx + shake, r.ry, 0, s, s * 0.8, s));
    });
    this.rockMesh.instanceMatrix.needsUpdate = true;
  }

  hitRock(i) {
    const r = this.rocks[i];
    if (!r.alive) return 0;
    r.hp--; r.shakeT = 1;
    if (r.hp <= 0) { r.alive = false; r.respawnT = RESPAWN_TIME; return 2 + Math.floor(this.rnd() * 2); }
    return 1;
  }

  // ---------------- berry bushes ----------------
  _buildBushes() {
    const pts = this._scatter(42, 7, 6);
    const bushG = new THREE.IcosahedronGeometry(0.85, 1);
    const bushM = new THREE.MeshStandardMaterial({ color: 0x3a5a26, roughness: 1, flatShading: true });
    const berryG = new THREE.SphereGeometry(0.11, 8, 6);
    const berryM = new THREE.MeshStandardMaterial({ color: 0xd83a4a, roughness: 0.6 });
    this.bushMesh = new THREE.InstancedMesh(bushG, bushM, pts.length);
    this.berryMesh = new THREE.InstancedMesh(berryG, berryM, pts.length * 3);
    this.bushMesh.castShadow = true;
    this.bushes = pts.map((p, i) => {
      const s = 0.8 + this.rnd() * 0.6;
      const y = heightAt(p.x, p.z);
      this.bushMesh.setMatrixAt(i, compose(p.x, y + 0.45 * s, p.z, 0, this.rnd() * 6, 0, s, s * 0.75, s));
      const berries = [];
      for (let b = 0; b < 3; b++) {
        const a = this.rnd() * Math.PI * 2;
        berries.push({ dx: Math.cos(a) * 0.55 * s, dy: (0.5 + this.rnd() * 0.35) * s, dz: Math.sin(a) * 0.55 * s });
      }
      this.colliders.push({ x: p.x, z: p.z, r: 0.8 * s });
      return { x: p.x, z: p.z, y, s, berries: 3, berryPos: berries, regrowT: 0 };
    });
    this.bushMesh.instanceMatrix.needsUpdate = true;
    this._refreshBerries();
    this.scene.add(this.bushMesh, this.berryMesh);
  }

  _refreshBerries() {
    this.bushes.forEach((b, i) => {
      for (let k = 0; k < 3; k++) {
        const bp = b.berryPos[k];
        const vis = k < b.berries;
        this.berryMesh.setMatrixAt(i * 3 + k,
          compose(b.x + bp.dx, b.y + bp.dy, b.z + bp.dz, 0, 0, 0,
            vis ? 1 : 0.0001, vis ? 1 : 0.0001, vis ? 1 : 0.0001));
      }
    });
    this.berryMesh.instanceMatrix.needsUpdate = true;
  }

  pickBerries(i) {
    const b = this.bushes[i];
    if (b.berries <= 0) return 0;
    const n = b.berries;
    b.berries = 0; b.regrowT = BERRY_REGROW;
    this._refreshBerries();
    return n;
  }

  // ---------------- per-frame ----------------
  collide(pos, radius) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + radius;
      if (d < min && d > 0.001) {
        pos.x = c.x + dx / d * min;
        pos.z = c.z + dz / d * min;
      }
    }
  }

  update(dt, time) {
    let treesDirty = false, rocksDirty = false;
    for (const t of this.trees) {
      if (t.shakeT > 0) { t.shakeT = Math.max(0, t.shakeT - dt * 2.2); treesDirty = true; }
      if (t.fallT > 0 && t.fallT < 1.2) { t.fallT = Math.min(1.2, t.fallT + dt); treesDirty = true; }
      if (t.respawnT > 0) {
        t.respawnT -= dt; treesDirty = true;
        if (t.respawnT <= 0) { t.alive = true; t.hp = TREE_HP; t.fallT = 0; }
      }
    }
    for (const r of this.rocks) {
      if (r.shakeT > 0) { r.shakeT = Math.max(0, r.shakeT - dt * 2.2); rocksDirty = true; }
      if (r.respawnT > 0) {
        r.respawnT -= dt; rocksDirty = true;
        if (r.respawnT <= 0) { r.alive = true; r.hp = ROCK_HP; }
      }
    }
    let berriesDirty = false;
    for (const b of this.bushes) {
      if (b.regrowT > 0) {
        b.regrowT -= dt; berriesDirty = true;
        if (b.regrowT <= 0) { b.berries = 3; this._refreshBerries(); berriesDirty = false; }
      }
    }
    if (treesDirty) this._refreshTrees(time);
    if (rocksDirty) this._refreshRocks(time);
    if (berriesDirty) this._refreshBerries();
  }
}
