import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AnimalId } from '../config';
import { mulberry32, smoothstep } from '../util';

// Your own head, seen from just behind and above (the "rider's view"), and
// whole-body figures for the mirage and the grassland. Both share one sculpted
// skull per animal: a sphere pulled forward into a face that tapers and drops
// toward the muzzle, painted with vertex colours rather than extra meshes.

const COAT: Record<AnimalId, { coat: string; dark: string; inner: string; muzzle: string; sheen: string }> = {
  ox: { coat: '#7a5236', dark: '#3a2a20', inner: '#c79a86', muzzle: '#d8c6b0', sheen: '#c99a72' },
  horse: { coat: '#7d4526', dark: '#1a1411', inner: '#4a3022', muzzle: '#2e2420', sheen: '#c98a5a' },
  donkey: { coat: '#8f8a83', dark: '#36302c', inner: '#d9cfc2', muzzle: '#e6ddd0', sheen: '#d6d0c6' },
};

/** skull proportions: width, face length, how much the face narrows, how far the muzzle drops */
const SHAPE: Record<AnimalId, { wide: number; face: number; taper: number; drop: number }> = {
  ox: { wide: 1.3, face: 0.42, taper: 0.28, drop: 0.2 },
  horse: { wide: 0.85, face: 0.6, taper: 0.45, drop: 0.3 },
  donkey: { wide: 0.86, face: 0.54, taper: 0.36, drop: 0.27 },
};

const tmpC = new THREE.Color();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Drives the wind in every mane, forelock and tail; main.ts advances it. */
export const hairClock = { value: 0 };

function furMaterial(kind: AnimalId) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.78,
    sheen: 0.6,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(COAT[kind].sheen),
  });
}

/** Weld seams (so smooth shading has no creases), then recompute normals. */
function weld(geo: THREE.BufferGeometry) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const out = mergeVertices(geo, 1e-5);
  out.computeVertexNormals();
  return out;
}

function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), tmpC);
    colors.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ── hair ────────────────────────────────────────────────────────────────
// Manes and tails are hundreds of single strands: one tapered ribbon, instanced,
// each rooted on the body, pointed outward and curving toward the ground.

/** One strand: a ribbon along +y (0..1) narrowing to a point, curling toward -z; darker at the root. */
const STRAND = (() => {
  const seg = 6;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.5 * Math.pow(1 - t, 0.6);
    pos.push(-w, t, -t * t, w, t, -t * t);
    const k = 0.7 + 0.45 * t;
    col.push(k, k, k, k, k, k);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
})();

interface Strand {
  root: THREE.Vector3;
  /** the way the strand leaves the skin */
  dir: THREE.Vector3;
  length: number;
  width: number;
  /** how far the tip curls toward the ground */
  bend: number;
}

function hair(strands: Strand[], color: string, sway: number, seed = 5) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 });
  const uSway = { value: sway };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = hairClock;
    shader.uniforms.uSway = uSway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;')
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        // the wind moves tips, not roots
        float seed = dot(instanceMatrix[3].xyz, vec3(41.3, 17.1, 29.7));
        float reach = position.y * position.y * uSway;
        mvPosition.x += sin(uTime * 1.9 + seed) * reach;
        mvPosition.y += cos(uTime * 2.3 + seed) * reach * 0.4;
        mvPosition.z += sin(uTime * 1.3 + seed * 1.7) * reach * 0.6;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  const mesh = new THREE.InstancedMesh(STRAND, mat, strands.length);
  const rand = mulberry32(seed);
  const base = new THREE.Color(color);
  const m = new THREE.Matrix4();
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), t = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  strands.forEach((st, i) => {
    y.copy(st.dir).normalize();
    // local -z points to the ground, so the curl always falls
    z.copy(down).addScaledVector(y, -down.dot(y)).negate();
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
    z.normalize();
    x.crossVectors(y, z);
    const roll = (rand() - 0.5) * 1.2;
    t.copy(x);
    x.multiplyScalar(Math.cos(roll)).addScaledVector(z, Math.sin(roll));
    z.multiplyScalar(Math.cos(roll)).addScaledVector(t, -Math.sin(roll));
    m.makeBasis(x.multiplyScalar(st.width), y.multiplyScalar(st.length), z.multiplyScalar(st.bend));
    m.setPosition(st.root);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tmpC.copy(base).multiplyScalar(0.8 + rand() * 0.45));
  });
  mesh.frustumCulled = false;
  return mesh;
}

/** Strands along the crest of a neck: `up` gives the crest side, `fall` the side the hair drops to. */
function crestHair(
  count: number,
  at: (s: number, root: THREE.Vector3, up: THREE.Vector3, along: THREE.Vector3) => void,
  o: { lift: number; fall: THREE.Vector3; droop?: number; length: [number, number]; width: number; bend: number },
  seed: number,
) {
  const rand = mulberry32(seed);
  const strands: Strand[] = [];
  const up = new THREE.Vector3(), along = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const root = new THREE.Vector3();
    at(rand(), root, up, along);
    root.addScaledVector(o.fall, (rand() - 0.5) * 0.03);
    const dir = up
      .clone()
      .multiplyScalar(o.lift)
      .addScaledVector(o.fall, 0.8 + rand() * 0.3)
      .addScaledVector(along, (rand() - 0.5) * 0.4);
    dir.y -= (o.droop ?? 0) * (0.8 + rand() * 0.4);
    strands.push({
      root,
      dir,
      length: o.length[0] + rand() * (o.length[1] - o.length[0]),
      width: o.width * (0.7 + rand() * 0.6),
      bend: o.bend * (0.6 + rand() * 0.8),
    });
  }
  return strands;
}

/** A tuft growing from a small patch: roots scattered in a box, all leaning one way. */
function tuft(count: number, centre: THREE.Vector3, spread: THREE.Vector3, dir: THREE.Vector3, length: [number, number], width: number, bend: number, seed: number) {
  const rand = mulberry32(seed);
  const strands: Strand[] = [];
  for (let i = 0; i < count; i++) {
    strands.push({
      root: centre.clone().add(new THREE.Vector3((rand() - 0.5) * spread.x, (rand() - 0.5) * spread.y, (rand() - 0.5) * spread.z)),
      dir: dir.clone().add(new THREE.Vector3((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.6)),
      length: length[0] + rand() * (length[1] - length[0]),
      width: width * (0.7 + rand() * 0.6),
      bend: bend * (0.5 + rand()),
    });
  }
  return strands;
}

const skullCache = new Map<AnimalId, THREE.BufferGeometry>();

/** The head, origin at the poll (between the ears), face toward -z. */
function skullGeometry(kind: AnimalId) {
  const cached = skullCache.get(kind);
  if (cached) return cached;
  const s = SHAPE[kind];
  const c = COAT[kind];
  let geo: THREE.BufferGeometry = new THREE.SphereGeometry(1, 32, 22);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // remember the unit-sphere coordinates for painting
  const unit: [number, number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    unit.push([x, y, z]);
    const f = smoothstep(-0.1, 1, -z);
    let yy = y * 0.12 * (1 - 0.25 * f);
    // the jaw is deeper than the brow, and the cheeks flare at the back
    if (y < 0) yy *= 1 + 0.45 * (1 - f);
    yy -= Math.pow(f, 1.6) * s.drop;
    const jowl = 1 + 0.18 * smoothstep(0, -0.8, y) * (1 - f);
    pos.setXYZ(i, x * 0.15 * s.wide * (1 - s.taper * f) * jowl, yy, z < 0 ? z * s.face : z * 0.13);
  }
  // paint on the deformed sphere before welding (welding keeps attributes per vertex)
  const coat = new THREE.Color(c.coat), dark = new THREE.Color(c.dark), muzzle = new THREE.Color(c.muzzle);
  const blaze = new THREE.Color('#efe5d6');
  let i = 0;
  paint(geo, (_x, _y, _z, out) => {
    const [x, y, z] = unit[i++];
    const f = smoothstep(-0.1, 1, -z);
    out.copy(coat).lerp(dark, smoothstep(0.1, -0.9, y) * 0.4);
    out.multiplyScalar(1 + 0.1 * Math.max(0, y) * (1 - f));
    if (kind === 'horse') out.lerp(blaze, smoothstep(0.3, 0.12, Math.abs(x)) * smoothstep(0.3, 0.55, f) * smoothstep(-0.1, 0.4, y));
    if (kind === 'donkey') out.lerp(muzzle, smoothstep(0.1, -0.6, y) * smoothstep(0.4, 0.8, f) * 0.6);
    out.lerp(muzzle, smoothstep(0.78, 0.97, f));
  });
  geo = weld(geo);
  skullCache.set(kind, geo);
  return geo;
}

/** A tube along `points` whose radius follows `radius(t)`, squashed sideways by `squash`. */
function tube(points: THREE.Vector3[], radius: (t: number) => number, squash: THREE.Vector3, radial = 16, tubular = 16) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, p);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(p).multiplyScalar(r).multiply(squash).add(p);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  return { geo: weld(geo), curve };
}

/** A cupped, leaf-shaped ear; opening faces -z. Outer coat with a darker tip, inner lighter. */
function ear(len: number, width: number, kind: AnimalId, tipFrom: number) {
  const c = COAT[kind];
  const geo = new THREE.ConeGeometry(1, 1, 14, 8, true, Math.PI * 1.3, Math.PI * 1.4);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i);
    const leaf = Math.pow(1 - t, 0.75) * (1 + 0.35 * Math.sin(Math.PI * t));
    const k = 1 - t > 1e-4 ? leaf / (1 - t) : 0;
    pos.setXYZ(i, pos.getX(i) * k * width, t * len, pos.getZ(i) * k * width * 0.7 + t * t * width * 0.25);
  }
  geo.computeVertexNormals();
  const base = new THREE.Color(c.coat), tip = new THREE.Color(c.dark);
  paint(geo, (_x, y, _z, out) => out.copy(base).lerp(tip, smoothstep(tipFrom, 1, y / len)));
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
    new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c.inner, roughness: 0.95, side: THREE.BackSide })),
  );
  return g;
}

function horn(side: number) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * 0.16, 0.02, 0.02),
    new THREE.Vector3(side * 0.26, 0.1, -0.04),
    new THREE.Vector3(side * 0.24, 0.22, -0.12),
  ]);
  const tubular = 16, radial = 8;
  const geo = new THREE.TubeGeometry(curve, tubular, 0.045, radial, false);
  // taper toward the tip
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, p);
    const k = 1 - 0.85 * (i / tubular);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(p).multiplyScalar(k).add(p);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  const base = new THREE.Color('#e9dfc8'), tip = new THREE.Color('#5a4a3a');
  paint(geo, (_x, y, _z, out) => out.copy(base).lerp(tip, smoothstep(0.7, 1, (y - min.y) / (max.y - min.y))));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
}

function eyes(kind: AnimalId, skull: THREE.Object3D) {
  const s = SHAPE[kind];
  const mat = new THREE.MeshStandardMaterial({ color: '#160f0b', roughness: 0.2 });
  const geo = new THREE.SphereGeometry(0.02, 10, 8);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(geo, mat);
    e.position.set(side * 0.15 * s.wide * (1 - s.taper * 0.25) * 0.96, -0.012, -0.11);
    e.scale.set(0.8, 1, 1.3);
    skull.add(e);
  }
}

/** Ears (and horns) on a skull; returns the ear pivots that twitch. `tilt` is the skull's own pitch, undone for the ears. */
function dress(kind: AnimalId, skull: THREE.Object3D, tilt = 0) {
  const ears: THREE.Object3D[] = [];
  const addEar = (mesh: THREE.Object3D, x: number, y: number, z: number, out: number, back: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.set(back - tilt, 0, -out * Math.sign(x));
    pivot.userData.rest = back - tilt;
    pivot.add(mesh);
    skull.add(pivot);
    ears.push(pivot);
  };
  if (kind === 'horse') {
    for (const s of [-1, 1]) addEar(ear(0.14, 0.042, kind, 0.75), s * 0.065, 0.1, -0.02, 0.1, 0.12);
  } else if (kind === 'donkey') {
    for (const s of [-1, 1]) addEar(ear(0.26, 0.062, kind, 0.7), s * 0.07, 0.09, 0.01, 0.28, 0.2);
  } else {
    for (const s of [-1, 1]) {
      const hm = horn(s);
      hm.position.set(s * 0.1, 0.07, -0.02);
      skull.add(hm);
      addEar(ear(0.12, 0.055, kind, 0.6), s * 0.19, 0.0, 0.03, 1.35, 0.1);
    }
  }
  eyes(kind, skull);
  return ears;
}

export interface HeadRig {
  group: THREE.Group;
  /** the skull; nods with each step */
  skull: THREE.Group;
  /** ears that twitch; rotation.x is animated around their rest pose */
  ears: THREE.Object3D[];
}

/** Head and neck in camera space, low in the view. Attach to the camera. */
export function buildHead(kind: AnimalId): HeadRig {
  if (kind === 'horse') return buildHorseHead();
  const c = COAT[kind];
  const fur = furMaterial(kind);
  const group = new THREE.Group();
  const skull = new THREE.Group();
  const wide = SHAPE[kind].wide;

  // the neck sweeps from behind the skull down out of view
  const radius = (t: number) => (0.1 + 0.15 * t) * wide;
  const { geo: neckGeo, curve } = tube(
    [new THREE.Vector3(0, -0.46, -0.88), new THREE.Vector3(0, -0.72, -0.62), new THREE.Vector3(0, -1.08, -0.42), new THREE.Vector3(0, -1.55, -0.3)],
    radius,
    new THREE.Vector3(0.8, 1, 1),
  );
  const coat = new THREE.Color(c.coat), dark = new THREE.Color(c.dark);
  paint(neckGeo, (_x, y, _z, out) => out.copy(coat).lerp(dark, smoothstep(-0.6, -1.5, y) * 0.35));
  group.add(new THREE.Mesh(neckGeo, fur));

  // carried higher than the figures' heads, so the brow and nose show past the poll
  const tilt = 0.42;
  const pose = new THREE.Group();
  pose.rotation.x = tilt;
  pose.add(new THREE.Mesh(skullGeometry(kind), fur));
  skull.add(pose);
  const ears = dress(kind, pose, tilt);

  if (kind === 'donkey') {
    // a short, stiff mane standing up along the crest
    const crest = crestHair(
      520,
      (u, root, up, along) => {
        const t = 0.02 + u * 0.8;
        curve.getPointAt(t, root);
        curve.getTangentAt(t, along);
        up.crossVectors(along, X).normalize();
        root.addScaledVector(up, radius(t) * 0.92);
      },
      { lift: 2.2, fall: X, droop: -1.2, length: [0.06, 0.1], width: 0.012, bend: 0.01 },
      21,
    );
    group.add(hair(crest, '#4a3f37', 0.006));
  } else {
    // a curly tuft on the poll, between the horns
    pose.add(hair(tuft(90, new THREE.Vector3(0, 0.105, 0), new THREE.Vector3(0.15, 0.02, 0.08), new THREE.Vector3(0, 1, -0.4), [0.035, 0.06], 0.022, 0.03, 31), '#4f3322', 0.004));
  }

  return finishHead(group, skull, ears);
}

/**
 * The horse keeps the first version's proportions (round poll, face angled down,
 * small ears close together), which read best from behind; only the surfaces are finer.
 */
function buildHorseHead(): HeadRig {
  const c = COAT.horse;
  const fur = furMaterial('horse');
  const coat = new THREE.Color(c.coat), dark = new THREE.Color(c.dark);
  const solid = (geo: THREE.BufferGeometry, color = coat) => paint(weld(geo), (_x, _y, _z, out) => out.copy(color));
  const group = new THREE.Group();
  const skull = new THREE.Group();
  const wide = 0.85;

  const neck = new THREE.Mesh(
    paint(weld(new THREE.CylinderGeometry(0.13 * wide, 0.24 * wide, 1.0, 24, 4, true)), (_x, y, _z, out) =>
      out.copy(coat).lerp(dark, smoothstep(0.2, -0.5, y) * 0.3),
    ),
    fur,
  );
  neck.position.set(0, -0.76, -0.6);
  neck.rotation.x = -0.9;
  group.add(neck);

  // the mane: long hair from the poll down the crest, falling to the right
  const centre = new THREE.Vector3(0, -0.76, -0.6);
  const axis = new THREE.Vector3(0, Math.cos(0.9), -Math.sin(0.9));
  const crestUp = new THREE.Vector3(0, Math.sin(0.9), Math.cos(0.9));
  const crest = crestHair(
    560,
    (u, root, up, along) => {
      const s = 0.5 - Math.pow(u, 1.4) * 0.95;
      root.copy(centre).addScaledVector(axis, s).addScaledVector(crestUp, (0.157 - 0.094 * s) * 0.92);
      up.copy(crestUp);
      along.copy(axis);
    },
    { lift: 0.5, fall: X, droop: 0.55, length: [0.2, 0.34], width: 0.011, bend: 0.12 },
    11,
  );
  group.add(hair(crest, c.dark, 0.02));

  const back = new THREE.Mesh(solid(new THREE.SphereGeometry(0.15, 28, 20)), fur);
  back.scale.set(wide, 0.95, 1.25);
  skull.add(back);
  const face = new THREE.Mesh(solid(new THREE.CylinderGeometry(0.075 * wide, 0.12 * wide, 0.5, 24, 4)), fur);
  face.position.set(0, -0.12, -0.27);
  face.rotation.x = -1.05;
  skull.add(face);
  const nose = new THREE.Mesh(solid(new THREE.SphereGeometry(0.09 * wide, 20, 14), new THREE.Color(c.muzzle)), fur);
  nose.position.set(0, -0.25, -0.48);
  nose.scale.set(1, 0.8, 1.1);
  skull.add(nose);
  // forelock, falling forward over the brow
  skull.add(hair(tuft(60, new THREE.Vector3(0, 0.11, -0.08), new THREE.Vector3(0.05, 0.01, 0.03), new THREE.Vector3(0, -0.4, -1), [0.08, 0.13], 0.011, 0.04, 12), c.dark, 0.008));

  const ears = dress('horse', skull);
  return finishHead(group, skull, ears);
}

function finishHead(group: THREE.Group, skull: THREE.Group, ears: THREE.Object3D[]): HeadRig {
  skull.position.set(0, -0.4, -0.95);
  group.scale.setScalar(0.9);
  group.position.y = -0.03;
  group.add(skull);
  group.traverse((o) => {
    o.castShadow = false;
    o.frustumCulled = false;
  });
  return { group, skull, ears };
}

/** A whole animal for distant views. Faces +x; legs swing around rotation.z. */
export function buildFigure(kind: AnimalId) {
  const c = COAT[kind];
  const fur = furMaterial(kind);
  const coat = new THREE.Color(c.coat), dark = new THREE.Color(c.dark), muzzle = new THREE.Color(c.muzzle);
  const g = new THREE.Group();
  const big = kind === 'ox';
  const sideways = new THREE.Vector3(1, 1, 0.82);

  // body: a barrel, deeper at the chest, paler underneath
  const len = big ? 1.0 : 0.95, r = big ? 0.42 : 0.33;
  const bodyGeo = new THREE.CapsuleGeometry(r, len, 8, 18);
  bodyGeo.rotateZ(Math.PI / 2);
  const bp = bodyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const chest = 1 + 0.1 * smoothstep(-0.2, 0.5, x) - 0.06 * smoothstep(0, -0.6, x);
    bp.setXYZ(i, x, bp.getY(i) * chest, bp.getZ(i) * chest * 0.88);
  }
  const body = new THREE.Mesh(
    paint(weld(bodyGeo), (_x, y, _z, out) => out.copy(coat).lerp(kind === 'donkey' ? muzzle : dark, smoothstep(0, -r, y) * 0.45)),
    fur,
  );
  body.position.y = 1.15;
  g.add(body);

  // legs: tapered, coat above and dark toward the hoof
  const legs: THREE.Mesh[] = [];
  const legGeo = new THREE.CylinderGeometry(big ? 0.08 : 0.065, big ? 0.06 : 0.045, 0.95, 8, 4);
  legGeo.translate(0, -0.475, 0);
  paint(legGeo, (_x, y, _z, out) => out.copy(coat).lerp(dark, smoothstep(-0.45, -0.85, y)));
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const dx = len / 2 + r * 0.25;
  for (const [x, z] of [[dx, 0.17], [dx, -0.17], [-dx, 0.17], [-dx, -0.17]]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, 1.0, z);
    g.add(leg);
    legs.push(leg);
  }

  // neck and head
  const shoulder = new THREE.Vector3(len / 2 + 0.05, 1.3, 0);
  const poll = big ? new THREE.Vector3(1.12, 1.5, 0) : new THREE.Vector3(1.02, 1.9, 0);
  const nr = (t: number) => (big ? 0.3 - 0.12 * t : 0.24 - 0.12 * t);
  const { geo: neckGeo, curve } = tube(
    [shoulder, shoulder.clone().lerp(poll, 0.5).add(new THREE.Vector3(0.04, 0.06, 0)), poll],
    nr,
    sideways,
    12,
    10,
  );
  paint(neckGeo, (_x, _y, _z, out) => out.copy(coat));
  g.add(new THREE.Mesh(neckGeo, fur));
  if (kind !== 'ox') {
    const horse = kind === 'horse';
    const crest = crestHair(
      horse ? 200 : 150,
      (u, root, up, along) => {
        const t = 0.05 + u * 0.95;
        curve.getPointAt(t, root);
        curve.getTangentAt(t, along);
        up.crossVectors(along, Z).normalize().negate();
        root.addScaledVector(up, nr(t) * 0.9);
      },
      horse ? { lift: 0.6, fall: Z, length: [0.18, 0.3], width: 0.035, bend: 0.14 } : { lift: 3, fall: Z, length: [0.07, 0.11], width: 0.03, bend: 0.015 },
      41,
    );
    g.add(hair(crest, c.dark, horse ? 0.03 : 0.008));
  }

  const skull = new THREE.Group();
  skull.add(new THREE.Mesh(skullGeometry(kind), fur));
  dress(kind, skull);
  skull.position.copy(poll).add(new THREE.Vector3(0.02, 0.02, 0));
  // turn the face to +x first, then pitch it in the figure's own plane
  skull.rotation.order = 'ZYX';
  skull.rotation.set(0, -Math.PI / 2, big ? 0.1 : -0.15);
  skull.scale.setScalar(big ? 1.15 : 1.0);
  g.add(skull);

  // tail
  if (kind === 'ox') {
    const { geo } = tube([new THREE.Vector3(-0.95, 1.4, 0), new THREE.Vector3(-1.02, 1.0, 0), new THREE.Vector3(-1.0, 0.6, 0)], () => 0.025, sideways, 6, 8);
    paint(geo, (_x, _y, _z, out) => out.copy(coat));
    g.add(new THREE.Mesh(geo, fur));
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: c.dark, roughness: 1 }));
    tuft.position.set(-1.0, 0.56, 0);
    tuft.scale.set(1, 1.6, 1);
    g.add(tuft);
  } else if (kind === 'horse') {
    const root = new THREE.Vector3(-len / 2 - r * 0.85, 1.32, 0);
    g.add(hair(tuft(110, root, new THREE.Vector3(0.06, 0.06, 0.08), new THREE.Vector3(-0.6, -1, 0), [0.55, 0.8], 0.05, 0.25, 51), c.dark, 0.05));
  } else {
    const root = new THREE.Vector3(-len / 2 - r * 0.85, 1.32, 0);
    const { geo } = tube(
      [root, root.clone().add(new THREE.Vector3(-0.18, -0.15, 0)), root.clone().add(new THREE.Vector3(-0.24, -0.6, 0))],
      (t) => 0.025 + 0.04 * smoothstep(0.6, 1, t),
      sideways,
      8,
      10,
    );
    paint(geo, (_x, _y, _z, out) => out.copy(dark));
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  }

  g.traverse((o) => (o.castShadow = true));
  return { group: g, legs };
}
