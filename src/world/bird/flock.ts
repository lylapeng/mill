import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COATS, SPECIES, type Species } from './coats';

// A few small birds crossing the sky. They're specks at this range, so each is a handful of
// triangles and not the full songbird. The path hangs off where the player is looking, so a
// player walking the circle still sees them cross.

export interface Pass {
  /** metres out from the camera */
  distance: number;
  height: number;
  /** seconds to cross */
  time: number;
  /** drawn this much over life size, or at this range a bird is two or three pixels */
  scale: number;
}

/** a bit wider than the widest screen, so they never appear out of nothing */
const SPAN = 1.1;
const MAX = 5;

const paint = (g: THREE.BufferGeometry, at: (y: number) => number) => {
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) c.setHex(at(p.getY(i))).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

function shapes(species: Species) {
  const [belly, back, head, wing] = COATS[species].far;
  const trunk = new THREE.SphereGeometry(0.2, 8, 6).scale(0.85, 0.85, 1.5);
  const skull = new THREE.SphereGeometry(0.14, 7, 5).translate(0, 0.05, 0.32);
  const tail = new THREE.BoxGeometry(0.11, 0.02, 0.42).translate(0, 0.02, -0.46);
  const body = mergeGeometries([
    paint(trunk.toNonIndexed(), (y) => (y > 0.02 ? back : belly)),
    paint(skull.toNonIndexed(), () => head),
    paint(tail.toNonIndexed(), () => wing),
  ])!;
  // one wing, out along +x from the shoulder
  const flat = new THREE.BufferGeometry();
  const o = [0, 0, 0.14], a = [0.3, 0, 0.16], b = [0.58, 0, 0.02], c = [0.42, 0, -0.16], d = [0, 0, -0.16];
  flat.setAttribute('position', new THREE.Float32BufferAttribute([...o, ...a, ...c, ...a, ...b, ...c, ...o, ...c, ...d], 3));
  paint(flat, () => wing);
  flat.computeVertexNormals();
  return { body, wing: flat };
}

class Member {
  readonly group = new THREE.Group();
  readonly left: THREE.Mesh;
  readonly right: THREE.Mesh;
  /** place in the flock */
  lag = 0; out = 0; up = 0;
  phase = 0;

  constructor(private bodies: Record<Species, THREE.Mesh>, wings: [THREE.Mesh, THREE.Mesh]) {
    [this.left, this.right] = wings;
    this.group.add(...Object.values(bodies), this.left, this.right);
    for (const m of [...Object.values(bodies), this.left, this.right]) m.frustumCulled = false;
  }

  wear(species: Species, wing: Record<Species, THREE.BufferGeometry>) {
    for (const s of SPECIES) this.bodies[s].visible = s === species;
    this.left.geometry = this.right.geometry = wing[species];
  }
}

export class Flock {
  readonly group = new THREE.Group();
  private members: Member[] = [];
  private wings = {} as Record<Species, THREE.BufferGeometry>;
  private pass: Pass | null = null;
  private clock = 0;
  private dir = 1;
  private count = 0;
  /** first frame draws them under the ground, so the shader isn't compiled mid-flight */
  private warm = true;

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    const geos = {} as Record<Species, THREE.BufferGeometry>;
    for (const s of SPECIES) {
      const g = shapes(s);
      geos[s] = g.body;
      this.wings[s] = g.wing;
    }
    for (let i = 0; i < MAX; i++) {
      const bodies = {} as Record<Species, THREE.Mesh>;
      for (const s of SPECIES) bodies[s] = new THREE.Mesh(geos[s], mat);
      const left = new THREE.Mesh(this.wings.bluetit, mat);
      const right = new THREE.Mesh(this.wings.bluetit, mat);
      left.position.set(0.14, 0.08, 0.06);
      right.position.set(-0.14, 0.08, 0.06);
      right.scale.x = -1;
      const m = new Member(bodies, [left, right]);
      this.members.push(m);
      this.group.add(m.group);
    }
    this.group.position.y = -50;
  }

  get flying() {
    return this.pass !== null;
  }

  start(pass: Pass) {
    this.pass = pass;
    this.clock = 0;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.count = 3 + Math.floor(Math.random() * (MAX - 2));
    this.group.position.y = 0;
    this.group.visible = true;
    this.members.forEach((m, i) => {
      m.group.visible = i < this.count;
      // winter flocks of these birds really are mixed
      m.wear(SPECIES[Math.floor(Math.random() * SPECIES.length)], this.wings);
      m.group.scale.setScalar(COATS.bluetit.size * pass.scale);
      m.lag = i * 0.055 + Math.random() * 0.03;
      m.out = (Math.random() - 0.5) * 0.14;
      m.up = (Math.random() - 0.5) * 0.16;
      m.phase = Math.random() * 10;
    });
  }

  /** `cx`, `cz`: the camera. `look`: which way it faces, as an angle in the walking plane */
  update(dt: number, cx: number, cz: number, look: number) {
    if (this.warm) {
      this.warm = false;
      return;
    }
    const p = this.pass;
    if (!p) {
      this.group.visible = false;
      return;
    }
    this.clock += dt;
    const u = this.clock / p.time;
    if (u >= 1 + 0.3) {
      this.pass = null;
      this.group.visible = false;
      return;
    }
    for (let i = 0; i < this.count; i++) {
      const m = this.members[i];
      const across = this.dir * (u * 2 - 1 - m.lag) * SPAN;
      const a = look + across;
      const r = p.distance * (1 + m.out);
      const t = this.clock + m.phase;
      // tits and sparrows bound along: a burst of beats, then a dip on closed wings
      const beat = t % 0.85;
      const flapping = beat < 0.58;
      m.group.position.set(
        cx - Math.sin(a) * r,
        p.height * (1 + m.up) + Math.sin((t / 0.85) * Math.PI * 2) * p.distance * 0.0125,
        cz + Math.cos(a) * r,
      );
      // along the arc, the way it's crossing
      m.group.rotation.y = -a - (this.dir * Math.PI) / 2;
      const flap = flapping ? 0.15 + Math.sin(t * 2 * Math.PI * 7) * 0.85 : -0.1;
      m.left.rotation.z = flap;
      m.right.rotation.z = -flap;
      const fold = flapping ? 1 : 0.42;
      m.left.scale.x = fold;
      m.right.scale.x = -fold;
    }
  }
}
