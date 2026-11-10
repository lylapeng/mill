import * as THREE from 'three';
import { meadowHeight, mulberry32 } from '../util';
import { pineGeometry } from './land';
import { addSnow } from './snow';

// The Christmas grassland (season.ts): pine woods on the snow, and a little way ahead a tall
// tree hung with warm lights, a star on top, with stags standing round it.

/** Where the tree stands: just left of the line you run along at first, about ten seconds out. */
export const TREE_AT = new THREE.Vector3(-9, 0, 70);
TREE_AT.y = meadowHeight(TREE_AT.x, TREE_AT.z);

const UP = new THREE.Vector3(0, 1, 0);

function pineMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  addSnow(m);
  return m;
}

/** Scattered pines over the field, kept off the first stretch of the run and out of the tree's clearing. */
export function pineWoods(foliage: THREE.Color): THREE.Group {
  const rand = mulberry32(17);
  const tiers: { pos: THREE.Vector3; scale: number; r: number }[] = [];
  const trunks: THREE.Vector3[] = [];
  for (let n = 0; n < 900 && trunks.length < 280; n++) {
    const x = (rand() - 0.5) * 340, z = -80 + rand() * 460;
    if (Math.abs(x) < 9 && z < 50) continue;
    if (Math.hypot(x - TREE_AT.x, z - TREE_AT.z) < 16) continue;
    const s = 1.1 + rand() * 1.1;
    const base = new THREE.Vector3(x, meadowHeight(x, z) - 0.1, z);
    trunks.push(base);
    [1.3, 1.05, 0.82, 0.58].forEach((ts, b) =>
      tiers.push({ pos: base.clone().add(new THREE.Vector3(0, (0.75 + b * 0.72) * s, 0)), scale: ts * s, r: rand() }),
    );
  }
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();

  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.16, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#5e4634', roughness: 1 }), trunks.length);
  trunks.forEach((p, i) => trunkMesh.setMatrixAt(i, m4.compose(p, q.identity(), sc.setScalar(1.6))));

  const tierMesh = new THREE.InstancedMesh(pineGeometry(), pineMaterial(), tiers.length);
  tiers.forEach((t, i) => {
    q.setFromAxisAngle(UP, t.r * Math.PI * 2);
    tierMesh.setMatrixAt(i, m4.compose(t.pos, q, sc.setScalar(t.scale)));
    tierMesh.setColorAt(i, c.copy(foliage).multiplyScalar(0.85 + t.r * 0.3));
  });
  group.add(trunkMesh, tierMesh);
  return group;
}

/** The tree, its lights and star. `update` turns the star and lets the lights breathe. */
export class ChristmasTree {
  readonly group = new THREE.Group();
  private star: THREE.Mesh;
  private lights: THREE.InstancedMesh;
  private lightBase: THREE.Color[] = [];

  constructor(foliage: THREE.Color) {
    const rand = mulberry32(25);
    this.group.position.copy(TREE_AT);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 1.6, 7), new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 1 }));
    trunk.position.y = 0.8;
    this.group.add(trunk);

    // seven tiers, broad at the foot, about seven and a half metres to the tip
    const geo = pineGeometry();
    const mat = pineMaterial();
    const tiers: [number, number][] = [];
    for (let b = 0; b < 7; b++) tiers.push([0.8 + b * 0.95, 3.0 - b * 0.38]);
    const tierMesh = new THREE.InstancedMesh(geo, mat, tiers.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    tiers.forEach(([y, s], i) => {
      q.setFromAxisAngle(UP, i * 0.9);
      tierMesh.setMatrixAt(i, m4.compose(new THREE.Vector3(0, y, 0), q, sc.setScalar(s)));
      tierMesh.setColorAt(i, c.copy(foliage).multiplyScalar(0.9 + (i % 2) * 0.12));
    });
    tierMesh.castShadow = true;
    this.group.add(tierMesh);

    // bulbs along each tier's rim, brighter than white so the bloom picks them up
    const palette = [new THREE.Color(3.2, 2.5, 1.5), new THREE.Color(3.4, 0.8, 0.55), new THREE.Color(3.4, 2.2, 0.7)];
    const spots: THREE.Vector3[] = [];
    tiers.forEach(([y, s]) => {
      const n = Math.round(s * 9);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rand() * 0.4;
        const r = s * (0.86 + rand() * 0.08);
        spots.push(new THREE.Vector3(Math.cos(a) * r, y + 0.04 + s * 0.05, Math.sin(a) * r));
      }
    });
    this.lights = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), spots.length);
    spots.forEach((p, i) => {
      this.lights.setMatrixAt(i, m4.compose(p, q.identity(), sc.setScalar(1)));
      const base = palette[Math.floor(rand() * palette.length)];
      this.lightBase.push(base);
      this.lights.setColorAt(i, base);
    });
    this.group.add(this.lights);

    const top = tiers[tiers.length - 1];
    this.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.4), toneMapped: false }));
    this.star.scale.set(1, 1.3, 0.45);
    this.star.position.y = top[0] + top[1] * 1.2 + 0.3;
    this.group.add(this.star);

    // a warm glow on the snow around it
    const glow = new THREE.PointLight('#ffb66e', 80, 26, 2);
    glow.position.y = 2.2;
    this.group.add(glow);
  }

  update(time: number) {
    this.star.rotation.y = time * 0.4;
    const c = new THREE.Color();
    for (let i = 0; i < this.lightBase.length; i++) {
      const k = 0.7 + 0.3 * Math.sin(time * 1.3 + i * 2.39);
      this.lights.setColorAt(i, c.copy(this.lightBase[i]).multiplyScalar(k));
    }
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
  }
}
