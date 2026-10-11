import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Gathering: aim at a tree / rock / bush within reach, press E (or click) to
// strike. Hits shake the node, break it at 0 hp, drop resources with a burst
// of particles and floating text.
// ---------------------------------------------------------------------------

const REACH = 3.4, COOLDOWN = 0.45;

export class Gather {
  constructor(scene, world, player, ui, camera) {
    this.scene = scene; this.world = world; this.player = player;
    this.ui = ui; this.camera = camera;
    this.cool = 0; this.target = null; this.pendingHit = 0;
    this._buildParticles();
  }

  _buildParticles() {
    const N = 90;
    const g = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const m = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.pMesh = new THREE.InstancedMesh(g, m, N);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.parts = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    this._pIdx = 0;
    const hide = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let i = 0; i < N; i++) this.pMesh.setMatrixAt(i, hide);
    this.scene.add(this.pMesh);
  }

  burst(pos, color, n = 10, spread = 2.4) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const pt = this.parts[this._pIdx];
      this._pIdx = (this._pIdx + 1) % this.parts.length;
      pt.life = 0.5 + Math.random() * 0.4;
      pt.p.copy(pos);
      pt.v.set((Math.random() - 0.5) * spread, 2 + Math.random() * 2.5, (Math.random() - 0.5) * spread);
      this.pMesh.setColorAt(this._pIdx, c);
    }
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
  }

  _updateParticles(dt) {
    const M = new THREE.Matrix4();
    let dirty = false;
    this.parts.forEach((pt, i) => {
      if (pt.life <= 0) return;
      pt.life -= dt; dirty = true;
      pt.v.y -= 9 * dt;
      pt.p.addScaledVector(pt.v, dt);
      const s = Math.max(0.0001, Math.min(1, pt.life * 2.5));
      M.makeScale(s, s, s); M.setPosition(pt.p);
      this.pMesh.setMatrixAt(i, M);
      if (pt.life <= 0) { M.makeScale(0.0001, 0.0001, 0.0001); M.setPosition(0, -100, 0); this.pMesh.setMatrixAt(i, M); }
    });
    if (dirty) this.pMesh.instanceMatrix.needsUpdate = true;
  }

  // pick the nearest node in front of the character (no precise camera aiming needed:
  // just walk up to a tree/rock facing it and the prompt appears)
  _findTarget() {
    const p = this.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); // character facing
    let best = null, bestD = REACH;
    const consider = (kind, i, x, y, z, ok) => {
      if (!ok) return;
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > REACH || d >= bestD) return;
      // roughly in front of the character (very close nodes count from any side)
      const dot = d > 0.001 ? (dx * fx + dz * fz) / d : 1;
      if (dot < 0.2 && d > 1.2) return;
      bestD = d; best = { kind, i, x, y, z };
    };
    const w = this.world;
    w.trees.forEach((t, i) => consider('tree', i, t.x, t.y + 2.2 * t.s, t.z, t.alive));
    w.rocks.forEach((r, i) => consider('rock', i, r.x, r.y + 0.8 * r.s, r.z, r.alive));
    w.bushes.forEach((b, i) => consider('bush', i, b.x, b.y + 0.6, b.z, b.berries > 0));
    return best;
  }

  strike() {
    if (this.cool > 0 || this.player.dead || !this.target) return;
    this.cool = COOLDOWN;
    this.player.swing();
    this.pendingHit = 0.22; // land the hit mid-swing
  }

  _applyHit() {
    const t = this.target, w = this.world, p = this.player;
    if (!t) return;
    if (t.kind === 'tree') {
      const wood = w.hitTree(t.i);
      this.burst(new THREE.Vector3(t.x, t.y + 1.6, t.z), 0x8a5a2a, 10);
      if (wood > 0) {
        p.inv.wood += wood;
        this.ui.floatText(`+${wood} Gỗ`, new THREE.Vector3(t.x, t.y + 2.6, t.z), this.camera, '#ffd23a');
        if (!w.trees[t.i].alive) this.ui.toast('Cây đã đổ! Sẽ mọc lại sau một lúc.');
      }
    } else if (t.kind === 'rock') {
      const stone = w.hitRock(t.i);
      this.burst(new THREE.Vector3(t.x, t.y + 0.9, t.z), 0x9a9a9a, 10);
      if (stone > 0) {
        p.inv.stone += stone;
        this.ui.floatText(`+${stone} Đá`, new THREE.Vector3(t.x, t.y + 1.6, t.z), this.camera, '#cfd8dc');
      }
    } else if (t.kind === 'bush') {
      const n = w.pickBerries(t.i);
      if (n > 0) {
        p.inv.berry += n;
        this.burst(new THREE.Vector3(t.x, t.y + 0.8, t.z), 0xd83a4a, 8);
        this.ui.floatText(`+${n} Quả mọng (nhấn F để ăn)`, new THREE.Vector3(t.x, t.y + 1.4, t.z), this.camera, '#ff8a9a');
      }
    }
    this.ui.refreshInv(p.inv);
  }

  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.pendingHit > 0) {
      this.pendingHit -= dt;
      if (this.pendingHit <= 0) this._applyHit();
    }
    this.target = this.player.dead ? null : this._findTarget();
    const u = this.ui;
    if (!this.target) u.setPrompt('');
    else if (this.target.kind === 'tree') u.setPrompt('Nhấn <b>E</b> / Chuột trái — Chặt cây');
    else if (this.target.kind === 'rock') u.setPrompt('Nhấn <b>E</b> / Chuột trái — Đập đá');
    else u.setPrompt('Nhấn <b>E</b> / Chuột trái — Hái quả');
    this._updateParticles(dt);
  }
}
