// ---------------------------------------------------------------------------
// UI: vitals bars, inventory, interact prompt, toasts, floating pickup text.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.promptEl = $('prompt');
    this.toastsEl = $('toasts');
    this.floatLayer = $('float-layer');
  }

  setPrompt(html) {
    if (this.promptEl.innerHTML !== html) {
      this.promptEl.innerHTML = html;
      this.promptEl.style.opacity = html ? 1 : 0;
    }
  }

  updateVitals(p) {
    $('hp-fill').style.width = `${Math.max(0, p.hp)}%`;
    $('hunger-fill').style.width = `${Math.max(0, p.hunger)}%`;
    $('st-fill').style.width = `${Math.max(0, p.stamina)}%`;
    $('hp-fill').classList.toggle('low', p.hp < 30);
    $('hunger-fill').classList.toggle('low', p.hunger < 30);
  }

  refreshInv(inv) {
    $('inv-wood').textContent = inv.wood;
    $('inv-stone').textContent = inv.stone;
    $('inv-berry').textContent = inv.berry;
  }

  toast(msg) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    this.toastsEl.appendChild(d);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 2400);
  }

  floatText(text, worldPos, camera, color = '#fff') {
    const v = worldPos.clone().project(camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * innerWidth;
    const y = (-v.y * 0.5 + 0.5) * innerHeight;
    const d = document.createElement('div');
    d.className = 'float-txt';
    d.textContent = text;
    d.style.left = `${x}px`; d.style.top = `${y}px`; d.style.color = color;
    this.floatLayer.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  showDeath() { $('death').classList.remove('hidden'); }
  hideDeath() { $('death').classList.add('hidden'); }
}
