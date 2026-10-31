// Small shared helpers: seeded randomness, easing, deterministic terrain height.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const damp = (current: number, target: number, rate: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

/**
 * Vertical field of view that keeps at least `minWide` degrees across, so a tall
 * portrait screen widens the view instead of becoming a slit. Landscape keeps `fov`.
 */
export function fitFov(fov: number, aspect: number, minWide = 52) {
  const toRad = Math.PI / 180;
  const wide = 2 * Math.atan(Math.tan((fov * toRad) / 2) * aspect) / toRad;
  if (wide >= minWide) return fov;
  return Math.min(96, (2 * Math.atan(Math.tan((minWide * toRad) / 2) / aspect)) / toRad);
}

/** Rolling hills around the yard; flat where the mill stands. */
export function yardHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const hills =
    Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.7) * 3.2 +
    Math.sin(x * 0.11 + z * 0.07) * 1.1 +
    Math.sin(z * 0.19 - x * 0.05) * 0.4;
  return (hills + 1.5) * smoothstep(14, 70, r);
}

/** Gentle swells of the grassland. Must match `meadowHeightGLSL`. */
export function meadowHeight(x: number, z: number) {
  return Math.sin(x * 0.05) * Math.cos(z * 0.04) * 1.6 + Math.sin(x * 0.11 + z * 0.07) * 0.6;
}

export const meadowHeightGLSL = /* glsl */ `
float meadowHeight(vec2 p) {
  return sin(p.x * 0.05) * cos(p.y * 0.04) * 1.6 + sin(p.x * 0.11 + p.y * 0.07) * 0.6;
}`;
