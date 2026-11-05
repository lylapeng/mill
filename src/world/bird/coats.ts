// Three birds share one body (songbird.ts) and differ in paint. A coat says what colour
// every point of the body and every kind of feather is, how big the bird is, and how it
// reads from far off in a flock (flock.ts).

export type Species = 'bluetit' | 'greattit' | 'sparrow';
export const SPECIES: Species[] = ['bluetit', 'greattit', 'sparrow'];

export type C = [number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const hex = (h: number): C => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const mixC = (a: C, b: C, t: number): C => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
export function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return mix(mix(hash(xi, yi), hash(xi + 1, yi), u), mix(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
const piece = (x: number, pts: number[][]) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return mix(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return pts[pts.length - 1][1];
};

/** one row of the feather atlas per kind */
export enum K { Primary, Secondary, Tertial, Greater, Covert, Tail, Scapular, PrimaryCovert, Shield }
export const ROWS = 9;

/** a point on the body. `up`: 0 belly, 1 back. `az`, `el`: its direction from the middle of the head */
export interface Spot { x: number; ax: number; z: number; up: number; az: number; el: number }

export interface Coat {
  /** body length in metres */
  size: number;
  /** multiplies the leg colour */
  legs: number;
  body(s: Spot): C;
  /** `u` root to tip, `e` 0 at the shaft to 1 at the edge, `outer` the narrow leading vane */
  feather(row: K, u: number, e: number, outer: boolean): C;
  /** belly, back, head, wing as seen from a distance */
  far: [number, number, number, number];
}

export const WHITE = hex(0xf5f2e8);
export const INK = hex(0x0f1420);
export const VENT = hex(0xe9e6d2);

// the head's outlines, shared by all three: they are the same shape of bird
const collarAt = (az: number) => piece(az, [[0, -0.64], [0.6, -0.6], [1.2, -0.56], [1.9, -0.48], [2.5, -0.1], [3.14, 0.1]]);
const eyeAt = (az: number) => piece(az, [[0, -0.04], [0.9, 0.18], [2.3, 0.2], [3.14, 0.1]]);
const eyeHalf = (az: number) => piece(az, [[0, 0.07], [1.15, 0.09], [2.3, 0.1], [3.14, 0.2]]);
const capAt = (az: number) => piece(az, [[0, 0.38], [1.15, 0.42], [2.4, 0.4], [3.14, 0.36]]);

// ---------- blue tit (Cyanistes caeruleus) ----------
const bluetit = (() => {
  const CAP = hex(0x2f7fd6), NAVY = hex(0x16284c), COLLAR = hex(0x446c9b), YEL = hex(0xf3d53f);
  const FLANK = hex(0xcfc264), OLIVE = hex(0x8ea048), RUMP = hex(0x6f9a8a);
  const BLUE = hex(0x2c76cc), DEEP = hex(0x1d4f9a), SLATE = hex(0x28344c), GREY = hex(0x4a5a72);
  const coat: Coat = {
    size: 0.2,
    legs: 0x3f4d6b,
    far: [0xf3d53f, 0x8ea048, 0xf5f2e8, 0x2c76cc],
    body({ ax, z, up, az, el }) {
      // olive back, yellow front
      let c = mixC(YEL, FLANK, smooth(0.4, 0.65, up) * 0.45);
      c = mixC(c, OLIVE, smooth(0.6, 0.76, up));
      c = mixC(c, RUMP, smooth(-0.12, -0.3, z) * smooth(0.55, 0.75, up));
      c = mixC(c, VENT, smooth(-0.05, -0.3, z) * (1 - smooth(0.3, 0.55, up)));
      // the faint dark line down the belly
      c = mixC(c, VENT, (1 - smooth(0.07, 0.17, ax)) * smooth(0.2, 0.04, z) * (1 - smooth(0.2, 0.4, up)));
      const lw = 0.012 + 0.03 * smooth(0.38, 0.2, z) * smooth(-0.02, 0.1, z); // tapers at both ends
      const line = (1 - smooth(lw, lw + 0.018, ax)) * smooth(0.42, 0.28, up) * smooth(-0.02, 0.06, z) * (1 - smooth(0.34, 0.39, z));
      c = mixC(c, NAVY, line);
      if (z < 0.1) return c;

      const collar = collarAt(az);
      const headMask = smooth(collar - 0.03, collar + 0.03, el);
      const face = mixC(c, WHITE, headMask);
      // dark collar and bib
      const band = smooth(collar - 0.27, collar - 0.21, el) * (1 - smooth(collar - 0.01, collar + 0.05, el));
      let f = mixC(face, COLLAR, band);
      const bib = (1 - smooth(0.2, 0.34, az)) * (1 - smooth(-0.3, -0.2, el));
      f = mixC(f, INK, bib);
      // eye line
      const eye = eyeAt(az), half = eyeHalf(az);
      f = mixC(f, INK, 1 - smooth(half - 0.03, half + 0.02, Math.abs(el - eye)));
      // blue cap, ringed in white
      const cap = capAt(az);
      f = mixC(f, CAP, smooth(cap - 0.03, cap + 0.03, el));
      // nape: blue-black joins eye line to collar
      const nape = smooth(2.0, 2.6, az) * smooth(collar - 0.1, collar, el) * (1 - smooth(eye + 0.12, eye + 0.2, el));
      f = mixC(f, COLLAR, nape);
      const out = mixC(c, f, smooth(0.175, 0.195, z));
      // a dark collar closes the head off cleanly from the back
      const ringBand = smooth(0.17, 0.18, z) * (1 - smooth(0.195, 0.205, z)) * smooth(collar - 0.2, collar - 0.1, el) * (1 - smooth(cap - 0.03, cap + 0.03, el));
      return mixC(out, COLLAR, ringBand);
    },
    feather(r, u, e, outer) {
      let cc: C;
      switch (r) {
        case K.Primary: return outer ? mixC(BLUE, hex(0x7fb6e8), smooth(0.55, 1, e)) : mixC(SLATE, GREY, e * 0.4);
        case K.Secondary: cc = outer ? BLUE : mixC(DEEP, SLATE, smooth(0.1, 0.8, e)); return mixC(cc, WHITE, smooth(0.955, 0.985, u) * 0.75);
        case K.Tertial: cc = mixC(mixC(DEEP, BLUE, 0.5), SLATE, smooth(0.2, 1, e) * 0.6); return mixC(cc, WHITE, smooth(0.9, 0.94, u + (e - 0.5) * 0.04));
        case K.Greater: cc = mixC(BLUE, DEEP, e * 0.5); return mixC(cc, WHITE, smooth(0.84, 0.885, u));
        case K.Covert: return mixC(hex(0x3589e0), DEEP, smooth(0.5, 1, e) * 0.5);
        case K.Tail: return outer ? mixC(BLUE, hex(0x9cc4e6), smooth(0.7, 1, e)) : mixC(DEEP, SLATE, e * 0.7);
        case K.Scapular: return mixC(OLIVE, hex(0x83964a), e * 0.5);
        case K.Shield: cc = mixC(hex(0x3a8fe4), hex(0x2468bd), smooth(0.1, 0.85, u)); return mixC(cc, WHITE, smooth(0.855, 0.875, u));
        default: return mixC(hex(0x2a5fa8), SLATE, e * 0.6);
      }
    },
  };
  return coat;
})();

// ---------- great tit (Parus major): black head, white cheek, a black stripe down a yellow front ----------
const greattit = (() => {
  const BLACK = hex(0x14161d), YEL = hex(0xecd03c), FLANK = hex(0xd6c766), MANTLE = hex(0x7f9c48);
  const RUMP = hex(0x7a8fa3), NAPE = hex(0xe9e4b8);
  const STEEL = hex(0x6d8499), DUSK = hex(0x39434f), DARK = hex(0x262b33);
  const coat: Coat = {
    size: 0.235, // the biggest of the three, and it should look it next to the blue tit
    legs: 0x4c5a70,
    far: [0xecd03c, 0x7f9c48, 0x14161d, 0x6d8499],
    body({ ax, z, up, az, el }) {
      let c = mixC(YEL, FLANK, smooth(0.4, 0.65, up) * 0.4);
      c = mixC(c, MANTLE, smooth(0.6, 0.76, up));
      c = mixC(c, RUMP, smooth(-0.12, -0.3, z) * smooth(0.55, 0.75, up));
      c = mixC(c, VENT, smooth(-0.14, -0.34, z) * (1 - smooth(0.3, 0.55, up)));
      // the stripe: broad on the chest, narrowing to the vent
      const lw = mix(0.022, 0.066, smooth(-0.22, 0.26, z));
      const stripe = (1 - smooth(lw, lw + 0.016, ax)) * smooth(0.46, 0.34, up) * smooth(-0.3, -0.2, z);
      c = mixC(c, BLACK, stripe);
      if (z < 0.1) return c;

      const collar = collarAt(az);
      // everything above the collar line is black, and a band carries that round under the cheek
      const band = smooth(collar - 0.2, collar - 0.12, el);
      let f = mixC(c, BLACK, band);
      // the white cheek, from the bill's corner back to the side of the neck
      const eye = eyeAt(az);
      const top = eye - 0.07;
      const bottom = collar + 0.05;
      const cheek = smooth(0.26, 0.4, az) * (1 - smooth(1.85, 2.15, az))
        * smooth(bottom - 0.03, bottom + 0.03, el) * (1 - smooth(top - 0.03, top + 0.03, el));
      f = mixC(f, WHITE, cheek);
      // the small pale patch on the nape
      const nape = smooth(2.65, 2.85, az) * smooth(-0.03, 0.02, el) * (1 - smooth(0.16, 0.22, el));
      f = mixC(f, NAPE, nape);
      return mixC(c, f, smooth(0.165, 0.19, z));
    },
    feather(r, u, e, outer) {
      let cc: C;
      switch (r) {
        case K.Primary: return outer ? mixC(STEEL, hex(0xa9bac8), smooth(0.55, 1, e)) : mixC(DARK, DUSK, e * 0.5);
        case K.Secondary: cc = outer ? STEEL : mixC(DUSK, DARK, smooth(0.1, 0.8, e)); return mixC(cc, WHITE, smooth(0.955, 0.985, u) * 0.6);
        case K.Tertial: cc = mixC(DUSK, DARK, e * 0.5); cc = mixC(cc, hex(0xc9d3c4), smooth(0.72, 0.9, e) * 0.85); return mixC(cc, WHITE, smooth(0.9, 0.94, u + (e - 0.5) * 0.04));
        case K.Greater: cc = mixC(STEEL, DUSK, e * 0.6); return mixC(cc, WHITE, smooth(0.74, 0.79, u)); // the white wing bar
        case K.Covert: return mixC(STEEL, DUSK, smooth(0.4, 1, e) * 0.6);
        case K.Tail: return outer ? mixC(STEEL, WHITE, smooth(0.35, 0.8, e)) : mixC(DUSK, DARK, e * 0.7);
        case K.Scapular: return mixC(MANTLE, hex(0x72883f), e * 0.5);
        case K.Shield: cc = mixC(hex(0x7690a6), hex(0x566b7e), smooth(0.1, 0.85, u)); return mixC(cc, WHITE, smooth(0.8, 0.825, u));
        default: return mixC(DUSK, DARK, e * 0.6);
      }
    },
  };
  return coat;
})();

// ---------- tree sparrow (Passer montanus), the 麻雀 of Chinese towns ----------
const sparrow = (() => {
  const CHESTNUT = hex(0x7c3f20), BLACK = hex(0x17140f), CHEEK = hex(0xefe9db), BELLY = hex(0xf2eee5), CHEST = hex(0xd9d1c3);
  const FLANK = hex(0xc6ad8d), REAR = hex(0xb39670), BACK = hex(0x8d5f37), STREAK = hex(0x33241a), RUMP = hex(0x9c8461);
  const BROWN = hex(0x8c5e36), RUFOUS = hex(0xb17a47), UMBER = hex(0x4a3425), DARK = hex(0x30241b);
  const coat: Coat = {
    size: 0.215,
    legs: 0xa9806a,
    far: [0xd6c5ab, 0x8d5f37, 0x7c3f20, 0x8c5e36],
    body({ x, z, up, az, el }) {
      // white only down the middle of the belly, greyer on the chest, warming through
      // light brown along the flanks, and browner towards the tail
      let c = mixC(BELLY, CHEST, smooth(0.08, 0.3, z));
      c = mixC(c, mixC(FLANK, REAR, smooth(0.15, -0.2, z)), smooth(0.14, 0.46, up));
      c = mixC(c, BACK, smooth(0.56, 0.72, up));
      c = mixC(c, RUMP, smooth(-0.12, -0.3, z) * smooth(0.55, 0.75, up));
      // dark streaks along the back
      const streak = smooth(0.52, 0.68, noise(x * 24 + 7, z * 6)) * smooth(0.62, 0.74, up) * smooth(-0.2, -0.05, z);
      c = mixC(c, STREAK, streak * 0.85);
      if (z < 0.1) return c;

      const collar = collarAt(az);
      // pale cheek and a pale half-collar running on round the neck
      let f = mixC(c, CHEEK, smooth(collar - 0.14, collar - 0.06, el) * (1 - smooth(1.9, 2.5, az) * 0.4));
      // the black spot on the cheek is what tells a tree sparrow from the rest
      const spot = Math.hypot((az - 1.42) / 0.26, (el + 0.14) / 0.12);
      f = mixC(f, BLACK, 1 - smooth(0.8, 1.15, spot));
      // small black bib
      const bib = (1 - smooth(0.22, 0.36, az + el * 0.5)) * (1 - smooth(-0.1, -0.03, el)) * smooth(collar - 0.08, collar, el);
      f = mixC(f, BLACK, bib);
      // black from the bill to the eye
      const eye = eyeAt(az);
      const lore = (1 - smooth(0.85, 1.05, az)) * (1 - smooth(0.02, 0.06, Math.abs(el - eye)));
      f = mixC(f, BLACK, lore);
      // chestnut cap, down the nape
      const capLine = eye + 0.08;
      const cap = Math.max(smooth(capLine - 0.03, capLine + 0.03, el), smooth(2.3, 2.7, az) * smooth(collar + 0.02, collar + 0.1, el));
      f = mixC(f, CHESTNUT, cap);
      return mixC(c, f, smooth(0.165, 0.19, z));
    },
    feather(r, u, e, outer) {
      let cc: C;
      switch (r) {
        case K.Primary: return outer ? mixC(RUFOUS, hex(0xc9a378), smooth(0.55, 1, e)) : mixC(DARK, UMBER, e * 0.5);
        case K.Secondary: cc = outer ? RUFOUS : mixC(UMBER, DARK, smooth(0.1, 0.8, e)); return mixC(cc, hex(0xd9c6a4), smooth(0.955, 0.985, u) * 0.6);
        case K.Tertial: cc = mixC(DARK, UMBER, e * 0.5); return mixC(cc, RUFOUS, smooth(0.55, 0.9, e));
        case K.Greater: cc = mixC(BROWN, UMBER, e * 0.6); return mixC(cc, WHITE, smooth(0.8, 0.84, u) * 0.9);
        case K.Covert: cc = mixC(hex(0x96552c), UMBER, smooth(0.5, 1, e) * 0.5); return mixC(cc, WHITE, smooth(0.8, 0.86, u) * 0.8);
        case K.Tail: return outer ? mixC(BROWN, RUFOUS, smooth(0.4, 1, e)) : mixC(UMBER, DARK, e * 0.7);
        case K.Scapular: return mixC(BACK, STREAK, e * 0.5);
        case K.Shield: {
          // chestnut shoulder and two thin pale bars
          cc = mixC(hex(0x96552c), BROWN, smooth(0.1, 0.8, u));
          cc = mixC(cc, WHITE, smooth(0.5, 0.52, u) * (1 - smooth(0.56, 0.58, u)) * 0.9);
          return mixC(cc, WHITE, smooth(0.84, 0.86, u) * 0.95);
        }
        default: return mixC(UMBER, DARK, e * 0.6);
      }
    },
  };
  return coat;
})();

export const COATS: Record<Species, Coat> = { bluetit, greattit, sparrow };
