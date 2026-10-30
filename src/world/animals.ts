import * as THREE from 'three';
import type { AnimalId } from '../config';

// Your own head, seen from just behind and above (the "rider's view"), and
// small whole-body figures for the mirage and the grassland.

const COAT: Record<AnimalId, { coat: string; dark: string; inner: string; muzzle: string }> = {
  ox: { coat: '#7a5236', dark: '#3a2a20', inner: '#c79a86', muzzle: '#d8c6b0' },
  horse: { coat: '#8a5531', dark: '#2e2019', inner: '#5a3a2a', muzzle: '#4a3326' },
  donkey: { coat: '#8f8a83', dark: '#36302c', inner: '#d9cfc2', muzzle: '#e6ddd0' },
};

const mat = (color: string, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });

function gradientGeometry(geo: THREE.BufferGeometry, base: THREE.Color, tip: THREE.Color, tipFrom: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / (max.y - min.y);
    c.copy(base).lerp(tip, THREE.MathUtils.smoothstep(t, tipFrom, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function ear(len: number, width: number, coat: string, tip: string, tipFrom: number) {
  const geo = new THREE.ConeGeometry(width, len, 7, 4);
  geo.translate(0, len / 2, 0);
  geo.scale(1, 1, 0.5);
  gradientGeometry(geo, new THREE.Color(coat), new THREE.Color(tip), tipFrom);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
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
  gradientGeometry(geo, new THREE.Color('#e9dfc8'), new THREE.Color('#5a4a3a'), 0.7);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
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
  const c = COAT[kind];
  const coat = mat(c.coat);
  const group = new THREE.Group();
  const skull = new THREE.Group();
  const ears: THREE.Object3D[] = [];
  const wide = kind === 'ox' ? 1.35 : kind === 'horse' ? 0.85 : 1;

  // neck sweeping down out of view
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * wide, 0.24 * wide, 1.0, 9), coat);
  neck.position.set(0, -0.76, -0.6);
  neck.rotation.x = -0.9;
  group.add(neck);

  // the back of the skull, with the face running forward and down
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), coat);
  back.scale.set(wide, 0.95, 1.25);
  skull.add(back);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * wide, 0.12 * wide, 0.5, 8), coat);
  face.position.set(0, -0.12, -0.27);
  face.rotation.x = -1.05;
  skull.add(face);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09 * wide, 8, 6), mat(c.muzzle));
  nose.position.set(0, -0.25, -0.48);
  nose.scale.set(1, 0.8, 1.1);
  skull.add(nose);

  const addEar = (mesh: THREE.Mesh, x: number, y: number, z: number, out: number, back: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.set(back, 0, -out * Math.sign(x));
    pivot.userData.rest = back;
    pivot.add(mesh);
    skull.add(pivot);
    ears.push(pivot);
  };

  if (kind === 'horse') {
    for (const s of [-1, 1]) addEar(ear(0.14, 0.04, c.coat, c.dark, 0.8), s * 0.065, 0.1, -0.02, 0.1, 0.12);
  } else if (kind === 'donkey') {
    for (const s of [-1, 1]) addEar(ear(0.34, 0.06, c.coat, c.dark, 0.72), s * 0.08, 0.09, 0, 0.3, 0.2);
  } else {
    for (const s of [-1, 1]) {
      const hm = horn(s);
      hm.position.set(s * 0.1, 0.07, -0.02);
      skull.add(hm);
      addEar(ear(0.1, 0.045, c.coat, c.inner, 0.5), s * 0.2, 0.0, 0.04, 1.35, 0.1);
    }
  }

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

/** A small low-poly figure for distant views. Faces +x. */
export function buildFigure(kind: AnimalId) {
  const c = COAT[kind];
  const coat = new THREE.MeshStandardMaterial({ color: c.coat, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: c.dark, roughness: 1, flatShading: true });
  const g = new THREE.Group();
  const big = kind === 'ox';
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(big ? 0.42 : 0.33, big ? 1.0 : 0.95, 3, 7), coat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.15;
  g.add(body);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.5, 0.18], [0.5, -0.18], [-0.5, 0.18], [-0.5, -0.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.95, 5), dark);
    leg.geometry.translate(0, -0.475, 0);
    leg.position.set(x, 1.0, z);
    g.add(leg);
    legs.push(leg);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.7, 6), coat);
  neck.position.set(0.78, 1.5, 0);
  neck.rotation.z = big ? -0.9 : -0.55;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), coat);
  head.position.set(1.05, big ? 1.55 : 1.78, 0);
  head.rotation.z = -0.5;
  g.add(head);
  const earLen = kind === 'donkey' ? 0.3 : 0.14;
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.04, earLen, 4), dark);
    e.position.set(0.92, (big ? 1.68 : 1.95) + earLen / 2, s * 0.08);
    e.rotation.x = s * 0.3;
    g.add(e);
  }
  if (kind !== 'ox') {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 4), dark);
    tail.position.set(-0.85, 0.95, 0);
    tail.rotation.z = -0.3;
    g.add(tail);
  }
  g.traverse((o) => (o.castShadow = true));
  return { group: g, legs };
}
