// Deterministic value-noise + terrain height shared by every module.
export function hash2(x, z) {
  let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * valueNoise(x * f, z * f);
    amp *= 0.5; f *= 2.03;
  }
  return v; // 0..~1
}

// Rolling meadow hills. Keep the spawn area (0,0) fairly flat.
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const flat = Math.min(1, d / 25); // 0 near spawn -> 1 far away
  return (fbm(x * 0.018 + 7.3, z * 0.018 - 2.1) - 0.45) * 14 * flat;
}

// Seeded RNG for scatter placement (stable between reloads).
export function mulberry(seed) {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
