// A small songbird, built entirely in code. One skinned mesh: a lofted body with a per-pixel
// painted plumage texture, plus individual feathers on their own bones so the wing really
// folds and fans. Faces +Z, up +Y, the bird's left is +X. Which bird it is comes from the
// coat (coats.ts): the species share all of this and swap textures.
import * as THREE from 'three';
import { COATS, INK, K, ROWS, WHITE, hex, mix, mixC, noise, smooth, type C, type Species } from './coats';
import { SHAPE } from './shape';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// The body's outline is measured from the standing sprite (shape.ts, from tools/fit-3d-profile.py in
// the birdwatching repo), along the line of its lean: the fullest part is the chest, high up.
function shapeAt(z: number) {
  const i = Math.max(0, SHAPE.findIndex((r) => r[0] >= z) - 1);
  const a = SHAPE[i], b = SHAPE[Math.min(SHAPE.length - 1, i + 1)];
  const k = clamp01((z - a[0]) / Math.max(1e-6, b[0] - a[0]));
  return [mix(a[1], b[1], k), mix(a[2], b[2], k)];
}
const PROFILE: number[][] = [];
for (let i = 0; i <= 56; i++) {
  // denser towards both tips, where the curves close
  const z = -0.475 + (0.5 - 0.5 * Math.cos((i / 56) * Math.PI)) * 1.035;
  const [t, b] = shapeAt(z), h = Math.max(0.001, (t - b) / 2);
  // from the front the body is a wide ball and the head a narrower one on top of it
  const wide = 0.92 + 0.2 * smooth(0.36, 0.14, z) * smooth(-0.42, -0.12, z);
  PROFILE.push([z, (t + b) / 2, h * wide, h, h]);
}
const HEAD = V(0, 0.165, 0.39);

function ring(s: number) {
  const n = PROFILE.length - 1;
  const f = clamp01(s) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p = (k: number) => PROFILE[Math.max(0, Math.min(n, k))];
  const out = [0, 0, 0, 0, 0];
  for (let c = 0; c < 5; c++) {
    const a = p(i - 1)[c], b = p(i)[c], d = p(i + 1)[c], e = p(i + 2)[c];
    out[c] = 0.5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t * t + (3 * b - a - 3 * d + e) * t * t * t);
  }
  return out;
}
// phi: 0 = belly, PI = back
function surface(s: number, phi: number, out = V()) {
  const [z, cy, rx, rt, rb] = ring(s);
  const c = -Math.cos(phi);
  const shoulder = 1 - 0.26 * Math.max(0, c) * smooth(0.42, 0.26, z);
  return out.set(rx * Math.sin(phi) * shoulder, cy + c * (c > 0 ? rt : rb), z);
}
function sAt(z: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (ring(m)[0] < z) lo = m; else hi = m;
  }
  return lo;
}
/** x of the body surface at a given y, z (left side). */
function sideX(y: number, z: number) {
  const [, cy, rx, rt, rb] = ring(sAt(z));
  const d = y - cy;
  const r = d > 0 ? rt : rb;
  return rx * Math.sqrt(Math.max(0.02, 1 - (d / r) * (d / r)));
}

// ---------- plumage ----------
// plain pixel arrays rather than canvases: the WeChat mini game has no document
function pixels(data: Uint8Array, w: number, h: number) {
  const t = new THREE.DataTexture(data, w, h);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function paintBody(species: Species) {
  const W = 512, H = 256; // a small bird on screen, and this is painted on the phone
  const coat = COATS[species];
  const data = new Uint8Array(W * H * 4);
  const p = V(), q = V();
  for (let y = 0; y < H; y++) {
    const phi = ((y + 0.5) / H) * Math.PI * 2;
    for (let x = 0; x < W; x++) {
      const s = (x + 0.5) / W;
      surface(s, phi, p);
      const [, cy, , rt, rb] = ring(s);
      q.subVectors(p, HEAD);
      const ax = Math.abs(p.x);
      const c = coat.body({
        x: p.x, ax, z: p.z,
        up: clamp01(0.5 + (p.y - cy) / (2 * (p.y > cy ? rt : rb))),
        az: Math.atan2(ax, q.z),
        el: Math.atan2(q.y, Math.hypot(q.x, q.z)),
      });
      const i = (y * W + x) * 4;
      data[i] = 255 * clamp01(c[0]);
      data[i + 1] = 255 * clamp01(c[1]);
      data[i + 2] = 255 * clamp01(c[2]);
      data[i + 3] = 255;
    }
  }
  const map = pixels(data, W, H);
  map.wrapT = THREE.RepeatWrapping;
  return map;
}

// feather atlas: one row per feather kind. u: root -> tip, v: across the vane.
// flight feathers are pale grey underneath
function featherMaterial(map: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.62, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.74, .78, .84), .8);');
  };
  return m;
}

function paintFeathers(species: Species) {
  const coat = COATS[species];
  const W = 512, RH = 64, H = RH * ROWS;
  const data = new Uint8Array(W * H * 4);
  for (let r = 0; r < ROWS; r++) for (let j = 0; j < RH; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W, v = ((j + 0.5) / RH) * 2 - 1;
    const rach = -0.3;
    const outer = v < rach; // the narrow leading vane
    const e = outer ? (rach - v) / (1 + rach) : (v - rach) / (1 - rach);
    let cc = coat.feather(r, u, e, outer);
    const barbs = r === K.Shield ? 1 : 0.97 + 0.045 * Math.sin((u * 150 + Math.abs(v - rach) * 34) * 1.0) * (0.6 + 0.4 * noise(u * 40, v * 6 + r * 9));
    const shaft = r === K.Shield ? 0 : 1 - smooth(0.012, 0.03, Math.abs(v - rach));
    cc = mixC([cc[0] * barbs, cc[1] * barbs, cc[2] * barbs], hex(0x20242c), shaft * 0.6);
    const k = ((r * RH + j) * W + i) * 4;
    data[k] = 255 * clamp01(cc[0]); data[k + 1] = 255 * clamp01(cc[1]); data[k + 2] = 255 * clamp01(cc[2]); data[k + 3] = 255;
  }
  return pixels(data, W, H);
}

// ---------- mesh assembly ----------
class Soup {
  pos: number[] = []; uv: number[] = []; col: number[] = [];
  skin: number[] = []; wt: number[] = []; idx: number[] = [];
  groups: [number, number, number][] = [];
  begin() { return this.idx.length; }
  end(start: number, mat: number) { this.groups.push([start, this.idx.length - start, mat]); }
  v(x: number, y: number, z: number, u: number, v: number, c: C, b0: number, w0 = 1, b1 = 0, w1 = 0) {
    this.pos.push(x, y, z); this.uv.push(u, v); this.col.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2);
    this.skin.push(b0, b1, 0, 0); this.wt.push(w0, w1, 0, 0);
    return this.pos.length / 3 - 1;
  }
}

type Lim = { bone: number };

function featherMesh(g: Soup, bone: number, L: number, Wd: number, row: K, o: { y?: number; z?: number; x?: number; curve?: number; mirror?: boolean; round?: boolean } = {}) {
  const big = row === K.Shield;
  const nL = big ? 18 : 8, cols = big ? [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1] : [-1, -0.3, 0.35, 1];
  const m = o.mirror ? -1 : 1;
  const base = g.pos.length / 3;
  for (let i = 0; i <= nL; i++) {
    const t = i / nL;
    const prof = (o.round ? 0.08 + 0.92 * smooth(0, 0.42, t) : 0.34 + 0.66 * smooth(0, 0.16, t)) * Math.pow(1 - Math.pow(t, 6), 0.5);
    const half = (Wd / 2) * Math.max(prof, 0.002);
    for (const v of cols) {
      const x = v * half;
      const y = -(o.curve ?? 0.05) * L * t * t - v * v * Wd * 0.1 + (o.y ?? 0);
      g.v(m * (x + (o.x ?? 0)), y, -t * L + (o.z ?? 0), t, (row + 0.04 + ((v + 1) / 2) * 0.92) / ROWS, WHITE, bone);
    }
  }
  const n = cols.length;
  for (let i = 0; i < nL; i++) for (let j = 0; j < n - 1; j++) {
    const a = base + i * n + j, b = a + 1, c = a + n, d = c + 1;
    if (m > 0) g.idx.push(a, b, c, b, d, c); else g.idx.push(a, c, b, b, c, d);
  }
}

/** A tapered tube through points. */
function tube(g: Soup, pts: THREE.Vector3[], rad: (t: number) => [number, number], col: C | ((t: number) => C), bone: (t: number) => number, seg = 8) {
  const base = g.pos.length / 3;
  const up = V(0, 1, 0), side = V(), norm = V(), d = V();
  pts.forEach((p, i) => {
    const t = i / (pts.length - 1);
    d.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
    side.crossVectors(Math.abs(d.y) > 0.9 ? V(0, 0, 1) : up, d).normalize();
    norm.crossVectors(d, side).normalize();
    const [ra, rb] = rad(t);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const q = V().copy(p).addScaledVector(side, Math.cos(a) * ra).addScaledVector(norm, Math.sin(a) * rb);
      g.v(q.x, q.y, q.z, 0, 0, typeof col === 'function' ? col(t) : col, bone(t));
    }
  });
  const n = seg + 1;
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = base + i * n + k, b = a + 1, c = a + n, e = c + 1;
    g.idx.push(a, b, c, b, e, c);
  }
}

export interface Host {
  bone: THREE.Bone; mirror: boolean; hand: boolean;
  ext: THREE.Vector3; extQ: THREE.Quaternion;
  fold: THREE.Vector3; foldQ: THREE.Quaternion;
}
export interface Leg { thigh: THREE.Bone; shank: THREE.Bone; foot: THREE.Bone; hip: THREE.Vector3; side: number }

// How the head sits on the perch, relative to the body. Shared with rig.ts: seatHead() is measured in this pose.
export const SEAT = { neckX: 0.75, headX: 0.26, headY: 0.03, headZ: 0.085 };
const NECK_AT = [0.08, 0.22], HEAD_AT = [0.13, 0.33]; // y, z of the bones as bound
const SEAT_FROM = 0.2, SEAT_TO = 0.44, SEAT_CHIN = 0.51; // the stretch of body, in z, that the join is redrawn over

export const SHOULDER = V(0.175, 0.12, 0.16);
export const WRIST = V(0.4, 0, 0.03);
export const THIGH = 0.16, SHANK = 0.18;

function basis(dir: THREE.Vector3, normal: THREE.Vector3) {
  const z = dir.clone().negate().normalize();
  const x = V().crossVectors(normal, z).normalize();
  const y = V().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * The head bends down a long way from the body on the perch, and the throat is on the inside of that bend, so
 * the skin folds into a ledge where chest meets head. Wider weights would pull the chest in, so instead: pose the
 * loft, draw each line of the body from chest to chin again as one smooth curve, and put the vertices back where
 * the same weights will carry them onto that curve.
 */
function seatHead(g: Soup, NS: number, NA: number, iBody: number, iNeck: number, iHead: number) {
  const n = NA + 1;
  const { neckX, headX, headY, headZ } = SEAT;
  const cn = Math.cos(neckX), sn = Math.sin(neckX), ch = Math.cos(neckX + headX), sh = Math.sin(neckX + headX);
  const [ny, nz] = NECK_AT, [hy, hz] = HEAD_AT;
  // each bone as y' = a*y - b*z + ty, z' = b*y + a*z + tz
  const neckT = [cn, sn, ny - cn * ny + sn * nz, nz - sn * ny - cn * nz];
  const py = ny + cn * headY - sn * headZ, pz = nz + sn * headY + cn * headZ;
  const headT = [ch, sh, py - ch * hy + sh * hz, pz - sh * hy - ch * hz];
  const blend = (v: number) => {
    const m = [1, 0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const w = g.wt[v * 4 + k], t = g.skin[v * 4 + k] === iHead ? headT : g.skin[v * 4 + k] === iNeck ? neckT : null;
      if (!t) continue;
      for (let c = 0; c < 4; c++) m[c] += (t[c] - (c === 0 ? 1 : 0)) * w;
    }
    return m;
  };
  const posed = (v: number) => {
    const [a, b, ty, tz] = blend(v), y = g.pos[v * 3 + 1], z = g.pos[v * 3 + 2];
    return V(g.pos[v * 3], a * y - b * z + ty, b * y + a * z + tz);
  };
  const i0 = Math.ceil(sAt(SEAT_FROM) * NS);
  const p0 = V(), p1 = V(), t0 = V(), t1 = V(), q = V();
  for (let j = 0; j <= NA; j++) {
    const at = (i: number) => posed(i * n + j);
    // under the chin the head runs away forwards: the chest carries on up to it, and only then turns
    const under = smooth(0.2, 0.9, Math.cos((j / NA) * Math.PI * 2));
    const i1 = sAt(mix(SEAT_TO, SEAT_CHIN, under)) * NS, last = Math.floor(i1); // part way between rings, or neighbouring lines step
    p0.copy(at(i0)); p1.lerpVectors(at(last), at(last + 1), i1 - last);
    const chord = p0.distanceTo(p1);
    t0.subVectors(p0, at(i0 - 1)).setLength(chord * mix(1, 1.5, under));
    t1.subVectors(at(last + 1), at(last)).setLength(chord * mix(1, 0.35, under));
    for (let i = i0 + 1; i <= last; i++) {
      const t = (i - i0) / (i1 - i0), t2 = t * t, t3 = t2 * t;
      q.set(0, 0, 0)
        .addScaledVector(p0, 2 * t3 - 3 * t2 + 1).addScaledVector(t0, t3 - 2 * t2 + t)
        .addScaledVector(p1, -2 * t3 + 3 * t2).addScaledVector(t1, t3 - t2);
      const v = i * n + j;
      // the throat stays with the chest until it is nearly at the chin, or turning the head swings a flap of it out
      const w = smooth(0.55, 1, t), old = [0, 0, 0]; // head, neck, body
      for (let k = 0; k < 2; k++) {
        const b = g.skin[v * 4 + k];
        old[b === iHead ? 0 : b === iNeck ? 1 : 2] += g.wt[v * 4 + k];
      }
      const front = smooth(-0.3, 0.5, Math.cos((j / NA) * Math.PI * 2));
      g.skin.splice(v * 4, 3, iHead, iNeck, iBody);
      g.wt.splice(v * 4, 3, mix(old[0], w, front), mix(old[1], 0, front), mix(old[2], 1 - w, front));
      const [a, b, ty, tz] = blend(v), det = a * a + b * b, dy = q.y - ty, dz = q.z - tz;
      g.pos[v * 3] = q.x;
      g.pos[v * 3 + 1] = (a * dy + b * dz) / det;
      g.pos[v * 3 + 2] = (a * dz - b * dy) / det;
    }
  }
}

export function buildSongbird() {
  const g = new Soup();
  const bones: THREE.Bone[] = [];
  const add = (name: string, parent: THREE.Bone | null, x = 0, y = 0, z = 0) => {
    const b = new THREE.Bone();
    b.name = name; b.position.set(x, y, z);
    parent?.add(b);
    bones.push(b);
    return bones.length - 1;
  };
  const iRoot = add('root', null);
  const root = bones[iRoot];
  const iBody = add('body', root, 0, 0, 0);
  const body = bones[iBody];
  const iNeck = add('neck', body, 0, 0.08, 0.22);
  const neck = bones[iNeck];
  const iHead = add('head', neck, 0, 0.05, 0.11);
  const head = bones[iHead];
  const iJaw = add('jaw', head, 0, 0.03, 0.2);
  const iRump = add('rump', body, 0, 0.04, -0.36);
  const rump = bones[iRump];

  // body loft
  const NS = 72, NA = 40;
  const start = g.begin();
  const p = V();
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    for (let j = 0; j <= NA; j++) {
      const phi = (j / NA) * Math.PI * 2;
      surface(s, phi, p);
      // the chest stays with the body when the head turns level, and the tail moves on its own:
      // that way the profile as measured is what you see on the perch
      // by place on the ring and not by height, or the weights jump along the steep rings under the chin
      const up = smooth(0.15, 0.85, 0.5 - 0.5 * Math.cos(phi)), low = Math.max(up, smooth(0.3, 0.37, p.z));
      const wh = smooth(0.27, 0.42, p.z) * low, wn = smooth(0.08, 0.3, p.z) * (1 - wh) * low, wr = 0;
      let b0 = iBody, w0 = 1 - wn - wh - wr, b1 = iBody, w1 = 0;
      if (wh > 0) { b0 = iHead; w0 = wh; b1 = iNeck; w1 = 1 - wh; }
      else if (wn > 0) { b0 = iNeck; w0 = wn; b1 = iBody; w1 = 1 - wn; }
      else if (wr > 0) { b0 = iRump; w0 = wr; b1 = iBody; w1 = 1 - wr; }
      g.v(p.x, p.y, p.z, s, j / NA, WHITE, b0, w0, b1, w1);
    }
  }
  const n = NA + 1;
  seatHead(g, NS, NA, iBody, iNeck, iHead);
  for (let i = 0; i < NS; i++) for (let j = 0; j < NA; j++) {
    const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
    g.idx.push(a, b, c, b, d, c);
  }
  g.end(start, 0);

  // wings
  const fStart = g.begin();
  const hosts: Host[] = [];
  const spec: { kind: 'P' | 'S' | 'T'; L: number; off: THREE.Vector3; fan: number }[] = [];
  for (let i = 0; i < 3; i++) spec.push({ kind: 'T', L: 0.4 - i * 0.03, off: V(0.09 - i * 0.04, 0, -0.03), fan: 0.22 + i * 0.1 });
  for (let i = 0; i < 6; i++) spec.push({ kind: 'S', L: 0.47 + i * 0.006, off: V(0.13 + i * 0.05, 0, -0.03 + i * 0.012), fan: 0.1 - i * 0.05 });
  for (let i = 0; i < 9; i++) spec.push({ kind: 'P', L: 0.62 - Math.max(0, i - 5) * 0.035, off: V(i * 0.026, 0, 0.0 + i * 0.002), fan: -0.2 - i * 0.135 });
  // inner to outer, as the folded wing stacks
  const order = [...spec.slice(0, 3).reverse(), ...spec.slice(3), ...spec.slice(9)].filter((v, i, a) => a.indexOf(v) === i);

  for (const mirror of [false, true]) {
    order.forEach((h, k) => {
      const f = k / (order.length - 1);
      const m = mirror ? -1 : 1;
      const bi = add(`w${mirror ? 'R' : 'L'}${k}`, body);
      const bone = bones[bi];
      const W = h.kind === 'P' ? 0.095 : h.kind === 'S' ? 0.11 : 0.13;
      const row = h.kind === 'P' ? K.Primary : h.kind === 'S' ? K.Secondary : K.Tertial;
      featherMesh(g, bi, h.L, W, row, { mirror, curve: 0.06 });
      if (h.kind !== 'P') {
        featherMesh(g, bi, 0.27, 0.1, K.Greater, { y: 0.008, z: 0.02, mirror, curve: 0.05, round: true });
        featherMesh(g, bi, 0.17, 0.09, K.Covert, { y: 0.013, z: 0.05, mirror, curve: 0.05, round: true });
        featherMesh(g, bi, 0.13, 0.085, K.Covert, { y: 0.018, z: 0.1, mirror, curve: 0.05, round: true });
      } else {
        featherMesh(g, bi, 0.21, 0.07, K.PrimaryCovert, { y: 0.008, z: 0.02, mirror, curve: 0.05, round: true });
      }
      // folded: lying on the flank, tertials outermost and highest
      const ry = 0.14 - 0.165 * f, rz = 0.04 + 0.135 * f;
      const rx = sideX(ry, rz) + 0.012 + 0.018 * (1 - f);
      const fold = V(rx, ry, rz);
      const ty = 0.085 - 0.075 * f;
      const tz = rz - h.L * 0.98;
      let tipX = 0.05;
      for (let t = 0.3; t <= 1; t += 0.05) {
        const yy = mix(ry, ty, t), zz = mix(rz, tz, t);
        if (zz < -0.44) break;
        const need = sideX(yy, zz) + 0.016 + 0.014 * (1 - f);
        tipX = Math.max(tipX, rx + (need - rx) / t);
      }
      const tip = V(tipX, ty, tz);
      const dir = V().subVectors(tip, fold).normalize();
      const normal = V(0.95, 0.3 - 0.25 * f, 0).normalize();
      hosts.push({
        bone, mirror, hand: h.kind === 'P',
        ext: h.off.clone(),
        extQ: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), h.fan),
        fold, foldQ: basis(dir, normal),
      });
      void m;
    });
  }

  // the folded wing's coverts, as one smooth leaf; it hides as soon as the wing opens
  const shields: { bone: THREE.Bone; pos: THREE.Vector3; q: THREE.Quaternion }[] = [];
  for (const mirror of [false, true]) {
    const bi = add(`shield${mirror ? 'R' : 'L'}`, body);
    featherMesh(g, bi, 0.42, 0.2, K.Shield, { mirror, curve: 0.07, round: true });
    const h = hosts[7];
    const n = V(0, 1, 0).applyQuaternion(h.foldQ), back = V(0, 0, 1).applyQuaternion(h.foldQ);
    const pos = h.fold.clone().addScaledVector(n, 0.04).addScaledVector(back, 0.075);
    const q = h.foldQ.clone();
    if (mirror) { pos.x = -pos.x; q.set(q.x, -q.y, -q.z, q.w); }
    shields.push({ bone: bones[bi], pos, q });
  }

  // scapulars tuck the wing root under the back
  const scap: { bone: THREE.Bone; q: THREE.Quaternion; pos: THREE.Vector3 }[] = [];
  for (const m of [] as number[]) for (let i = 0; i < 5; i++) {
    const bi = add(`sc${m}${i}`, body);
    const phi = Math.PI * (0.83 - i * 0.045), z0 = 0.19 - i * 0.012, L = 0.23;
    const r0 = surface(sAt(z0), phi, V()), r1 = surface(sAt(z0 - L * 0.92), phi - 0.05, V());
    const ring0 = ring(sAt(z0));
    const n = V(r0.x, r0.y - ring0[1], 0).normalize();
    r0.addScaledVector(n, 0.004 + i * 0.002);
    r1.addScaledVector(n, 0.018 + i * 0.002);
    featherMesh(g, bi, L, 0.12, K.Scapular, { mirror: m < 0, curve: 0.04 });
    const q = basis(V().subVectors(r1, r0).normalize(), n);
    if (m < 0) { r0.x = -r0.x; q.set(q.x, -q.y, -q.z, q.w); }
    scap.push({ bone: bones[bi], q, pos: r0 });
  }

  // tail: eight feathers, the central pair on top
  const tail: { bone: THREE.Bone; side: number; order: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? -1 : 1, o = i >> 1;
    const lx = 0.008 + o * 0.009, ly = 0.02 - o * 0.008, lz = -0.03;
    const bi = add(`t${i}`, rump, side * lx, ly, lz);
    featherMesh(g, bi, 0.47 - o * 0.008, 0.078, K.Tail, { mirror: side < 0, curve: 0.015, x: lx, y: 0.04 + ly, z: -0.36 + lz });
    tail.push({ bone: bones[bi], side, order: o });
  }
  g.end(fStart, 1);

  // beak, legs
  const hStart = g.begin();
  const BEAK = hex(0x25272c), BEAK2 = hex(0x4a4e55);
  const upper: THREE.Vector3[] = [], lower: THREE.Vector3[] = [];
  const by0 = ring(sAt(0.52))[1];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    upper.push(V(0, by0 + 0.008 - 0.02 * t * t, 0.52 + t * 0.09));
    lower.push(V(0, by0 - 0.012 - 0.004 * t, 0.52 + t * 0.076));
  }
  tube(g, upper, (t) => [0.036 * (1 - t) + 0.002, 0.024 * (1 - t) + 0.002], (t) => mixC(BEAK, BEAK2, t * 0.5), () => iHead, 10);
  tube(g, lower, (t) => [0.031 * (1 - t) + 0.002, 0.014 * (1 - t) + 0.002], BEAK, () => iJaw, 10);

  g.end(hStart, 2);

  const lStart = g.begin();
  const legs: Leg[] = [];
  // grey here: the material's colour, from the coat, says what colour the legs are
  const LEG: C = [1, 1, 1], LEGD: C = [0.72, 0.72, 0.72], DOWN: C = [2.6, 2.6, 2.4];
  for (const side of [1, -1]) {
    const hip = V(side * 0.11, -0.13, -0.06);
    const t0 = add(`thigh${side}`, body, hip.x, hip.y, hip.z);
    const t1 = add(`shank${side}`, bones[t0], 0, -THIGH, 0);
    const t2 = add(`foot${side}`, bones[t1], 0, -SHANK, 0);
    const by = hip.y;
    const a = V(hip.x, by, hip.z), k = V(hip.x, by - THIGH, hip.z), f = V(hip.x, by - THIGH - SHANK, hip.z);
    tube(g, [a, a.clone().lerp(k, 0.45), k], (t) => { const r = mix(0.042, 0.018, smooth(0.1, 0.8, t)); return [r, r]; }, (t) => mixC(DOWN, LEG, smooth(0.55, 0.85, t)), () => t0);
    tube(g, [k, k.clone().lerp(f, 0.5), f], () => [0.0135, 0.0135], LEG, () => t1);
    const toes: [number, number, number][] = [[0, 0.17, 0], [0.42, 0.14, 0], [-0.42, 0.14, 0], [Math.PI, 0.13, 1]];
    for (const [ang, len] of toes) {
      const d = V(Math.sin(ang), 0, Math.cos(ang));
      const pts = [0, 0.33, 0.66, 1].map((t) => f.clone().addScaledVector(d, t * len).add(V(0, -0.012 - t * t * 0.03 + Math.sin(t * 3) * 0.012, 0)));
      tube(g, pts, (t) => { const r = mix(0.0125, 0.003, t * t); return [r, r]; }, (t) => mixC(LEG, LEGD, t), () => t2, 6);
    }
    legs.push({ thigh: bones[t0], shank: bones[t1], foot: bones[t2], hip: hip.clone(), side });
  }
  g.end(lStart, 4);

  // eyes
  const eStart = g.begin();
  const eyes: THREE.Vector3[] = [];
  for (const side of [1, -1]) {
    const s = sAt(0.49);
    const phi = side > 0 ? Math.PI * 0.55 : Math.PI * 1.45;
    const c = surface(s, phi, V());
    c.add(V(-side * 0.017, -0.001, -0.002));
    eyes.push(c);
    const base = g.pos.length / 3, R = 0.034, A = 14, B = 10;
    for (let i = 0; i <= B; i++) for (let j = 0; j <= A; j++) {
      const th = (i / B) * Math.PI, ph = (j / A) * Math.PI * 2;
      g.v(c.x + R * Math.sin(th) * Math.cos(ph), c.y + R * Math.cos(th), c.z + R * Math.sin(th) * Math.sin(ph), 0, 0, INK, iHead);
    }
    for (let i = 0; i < B; i++) for (let j = 0; j < A; j++) {
      const a = base + i * (A + 1) + j, b = a + 1, d = a + A + 1, e = d + 1;
      g.idx.push(a, b, d, b, e, d);
    }
  }
  g.end(eStart, 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(g.skin, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(g.wt, 4));
  geo.setIndex(g.idx);
  for (const [s, c, m] of g.groups) geo.addGroup(s, c, m);
  geo.computeVertexNormals();
  // weld the loft's seam
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i <= NS; i++) {
    const a = i * n, b = a + NA;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }

  const skins: Partial<Record<Species, { body: THREE.Texture; feathers: THREE.Texture }>> = {};
  const skin = (species: Species) => (skins[species] ??= { body: paintBody(species), feathers: paintFeathers(species) });
  const first = skin('bluetit');
  const bodyMat = new THREE.MeshStandardMaterial({ map: first.body, roughness: 0.78 });
  const featherMat = featherMaterial(first.feathers);
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48 });
  const mats = [
    bodyMat,
    featherMat,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, envMapIntensity: 0.5 }),
    legMat,
  ];
  /** repaint it as another bird; the same geometry and bones throughout */
  const wear = (species: Species) => {
    const s = skin(species);
    bodyMat.map = s.body;
    featherMat.map = s.feathers;
    legMat.color.setHex(COATS[species].legs);
  };
  wear('bluetit');
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh, root);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  const tris = g.idx.length / 3;
  return { group, mesh, wear, skin, hosts, legs, tail, scap, shields, body, neck, head, jaw: bones[iJaw], rump, tris, bones: bones.length };
}
export type Songbird = ReturnType<typeof buildSongbird>;
export type { Lim };
