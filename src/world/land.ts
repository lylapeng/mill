import * as THREE from 'three';
import { WALK_RADIUS } from '../config';
import { clamp, damp, mulberry32, smoothstep, yardHeight } from '../util';
import { FLOWER_COLORS, type Palette } from './palette';

// Ground, hills, mountains and everything that grows as the scene level rises.
// Each growable item carries a threshold; `shown` eases toward the scene level
// and items fade in (scale up) as it passes their threshold.

interface Growable {
  pos: THREE.Vector3;
  rotY: number;
  scale: number;
  threshold: number;
  /** stable per-item random, used for colour variation */
  r: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function growth(item: Growable, shown: number) {
  return smoothstep(item.threshold, item.threshold + 0.45, shown);
}

function writeInstances(mesh: THREE.InstancedMesh, items: Growable[], shown: number) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    tmpQ.setFromAxisAngle(UP, it.rotY);
    tmpS.setScalar(Math.max(1e-4, it.scale * growth(it, shown)));
    tmpM.compose(it.pos, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Spread item thresholds over [from, to] scene levels, staggered within a level. */
function thresholdFor(rand: () => number, from: number, to: number) {
  const level = from + Math.floor(rand() * (to - from + 1));
  return level - 1 + rand() * 0.5;
}

function addSway(material: THREE.MeshStandardMaterial, time: { value: number }, amount: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 seed = instanceMatrix[3].xz;
        #else
          vec2 seed = vec2(0.0);
        #endif
        float bend = max(position.y, 0.0);
        transformed.x += sin(uTime * 1.7 + seed.x * 0.7 + seed.y * 0.3) * ${amount.toFixed(3)} * bend;
        transformed.z += cos(uTime * 1.3 + seed.y * 0.6) * ${(amount * 0.6).toFixed(3)} * bend;`,
      );
  };
}

export class Land {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private shown = 1;
  private target = 1;
  private lastWritten = -1;

  private ground!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private groundNoise!: Float32Array;
  private groundPath!: Float32Array;
  private groundYard!: Float32Array;

  private mountainMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 });
  private grass!: THREE.InstancedMesh;
  private grassItems: Growable[] = [];
  private flowers!: THREE.InstancedMesh;
  private flowerItems: Growable[] = [];
  private trunks!: THREE.InstancedMesh;
  private crowns!: THREE.InstancedMesh;
  private treeItems: Growable[] = [];
  private crownItems: (Growable & { tree: number })[] = [];
  private fence = new THREE.Group();
  private fenceItem: Growable = { pos: new THREE.Vector3(), rotY: 0, scale: 1, threshold: 2.2, r: 0 };
  private house = new THREE.Group();
  private houseItem: Growable = { pos: new THREE.Vector3(-15, 0, -11), rotY: 0.6, scale: 1, threshold: 3.3, r: 0 };
  private windowMat = new THREE.MeshStandardMaterial({ color: '#3a3a40', emissive: '#ffb860', emissiveIntensity: 0 });

  constructor() {
    const rand = mulberry32(7);
    this.buildGround(rand);
    this.buildMountains(rand);
    this.buildTrees(rand);
    this.buildGrass(rand);
    this.buildFlowers(rand);
    this.buildFence();
    this.buildHouse();
  }

  private buildGround(rand: () => number) {
    const geo = new THREE.PlaneGeometry(560, 560, 180, 180);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    this.groundNoise = new Float32Array(n);
    this.groundPath = new Float32Array(n);
    this.groundYard = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i) + (rand() - 0.5) * 1.2;
      const z = pos.getZ(i) + (rand() - 0.5) * 1.2;
      const r = Math.hypot(x, z);
      pos.setXYZ(i, x, yardHeight(x, z) + (r > 16 ? (rand() - 0.5) * 0.25 : 0), z);
      this.groundNoise[i] = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.0) * Math.cos(z * 0.13 - x * 0.05);
      this.groundPath[i] = Math.exp(-((r - WALK_RADIUS) ** 2) / 0.35);
      this.groundYard[i] = 1 - smoothstep(4, 11, r);
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  private buildMountains(rand: () => number) {
    const count = 34;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.15;
      const r = 170 + rand() * 70;
      const h = 18 + rand() * 40;
      const geo = new THREE.ConeGeometry(36 + rand() * 34, h, 9, 4);
      // break the cone into a weathered ridge: jitter, soften the peak
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v) / h + 0.5;
        const k = 1 + (rand() - 0.5) * 0.35 * (1 - y);
        p.setXYZ(v, p.getX(v) * k, (p.getY(v) + (rand() - 0.5) * h * 0.08) * (y > 0.9 ? 0.92 : 1), p.getZ(v) * k);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.mountainMat);
      m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
      m.rotation.y = rand() * Math.PI;
      m.scale.set(1 + rand() * 0.6, 0.75 + rand() * 0.3, 0.6 + rand() * 0.4);
      this.group.add(m);
    }
  }

  private buildTrees(rand: () => number) {
    const count = 54;
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 20; tries++) {
        const a = rand() * Math.PI * 2;
        const r = 10 + Math.pow(rand(), 0.8) * 62;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (Math.hypot(x + 15, z + 11) > 7) break;
      }
      const s = 0.8 + rand() * 0.7;
      this.treeItems.push({
        pos: new THREE.Vector3(x, yardHeight(x, z) - 0.1, z),
        rotY: rand() * Math.PI * 2,
        scale: s,
        threshold: thresholdFor(rand, 2, 18),
        r: rand(),
      });
    }
    // nearest trees appear first so the yard changes visibly
    this.treeItems.sort((a, b) => a.threshold - b.threshold);

    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6);
    trunkGeo.translate(0, 1.1, 0);
    this.trunks = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: '#6a4e38', flatShading: true, roughness: 1 }),
      this.treeItems.length,
    );
    this.trunks.castShadow = true;
    this.group.add(this.trunks);

    for (let t = 0; t < this.treeItems.length; t++) {
      const tree = this.treeItems[t];
      const blobs = 3;
      for (let b = 0; b < blobs; b++) {
        const ang = (b / blobs) * Math.PI * 2 + tree.r * 6;
        const off = new THREE.Vector3(Math.cos(ang) * 0.55, 2.4 + b * 0.35, Math.sin(ang) * 0.55);
        off.multiplyScalar(tree.scale);
        this.crownItems.push({
          pos: off.add(tree.pos),
          rotY: rand() * Math.PI,
          scale: tree.scale * (0.85 + rand() * 0.4),
          threshold: tree.threshold,
          r: tree.r,
          tree: t,
        });
      }
    }
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    const crownMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
    addSway(crownMat, this.time, 0.03);
    this.crowns = new THREE.InstancedMesh(crownGeo, crownMat, this.crownItems.length);
    this.crowns.castShadow = true;
    this.crowns.setColorAt(0, tmpC.set('#fff'));
    this.group.add(this.crowns);
  }

  private buildGrass(rand: () => number) {
    // a tuft: five thin bent blades
    const blades: THREE.BufferGeometry[] = [];
    for (let b = 0; b < 5; b++) {
      const g = new THREE.PlaneGeometry(0.04, 0.36, 1, 3);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + 0.18;
        const taper = 1 - y / 0.36;
        p.setXYZ(i, p.getX(i) * taper, y, y * y * 0.8);
      }
      g.rotateY((b / 5) * Math.PI * 2 + rand());
      g.translate((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12);
      blades.push(g);
    }
    const geo = mergeGeometries(blades);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    addSway(mat, this.time, 0.12);

    const count = 2600;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      // dense near the yard, thinning out
      const r = clearOfPath(1.8 + Math.pow(rand(), 1.6) * 46, 0.75, rand);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const near = r < 9;
      this.grassItems.push({
        pos: new THREE.Vector3(x, yardHeight(x, z) - 0.02, z),
        rotY: rand() * Math.PI * 2,
        scale: 0.6 + rand() * 0.55,
        threshold: thresholdFor(rand, near ? 2 : 3, near ? 10 : 14),
        r: rand(),
      });
    }
    this.grass = new THREE.InstancedMesh(geo, mat, count);
    this.grass.setColorAt(0, tmpC.set('#fff'));
    this.grass.receiveShadow = true;
    this.group.add(this.grass);
  }

  private buildFlowers(rand: () => number) {
    const head = new THREE.IcosahedronGeometry(0.035, 0);
    head.scale(1, 0.55, 1);
    head.translate(0, 0.2, 0);
    const stem = new THREE.CylinderGeometry(0.003, 0.004, 0.2, 3);
    stem.translate(0, 0.1, 0);
    const geo = mergeGeometries([head, stem]);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true });
    addSway(mat, this.time, 0.08);
    const count = 1600;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = clearOfPath(2 + Math.pow(rand(), 1.3) * 38, 0.85, rand);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.flowerItems.push({
        pos: new THREE.Vector3(x, yardHeight(x, z), z),
        rotY: rand() * Math.PI * 2,
        scale: 0.7 + rand() * 0.6,
        threshold: thresholdFor(rand, 6, 20),
        r: rand(),
      });
    }
    this.flowers = new THREE.InstancedMesh(geo, mat, count);
    for (let i = 0; i < count; i++) {
      const it = this.flowerItems[i];
      this.flowers.setColorAt(i, FLOWER_COLORS[Math.floor(it.r * FLOWER_COLORS.length)]);
    }
    this.group.add(this.flowers);
  }

  private buildFence() {
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5c40', flatShading: true, roughness: 1 });
    const R = 8.2;
    const posts = 30;
    for (let i = 0; i < posts; i++) {
      if (i === 0) continue; // the gate
      const a = (i / posts) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 5), wood);
      post.position.set(Math.cos(a) * R, 0.55, Math.sin(a) * R);
      post.castShadow = true;
      this.fence.add(post);
      if (i < posts - 1) {
        const len = 2 * R * Math.sin(Math.PI / posts);
        for (const h of [0.45, 0.85]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, len), wood);
          const mid = a + Math.PI / posts;
          rail.position.set(Math.cos(mid) * R * Math.cos(Math.PI / posts), h, Math.sin(mid) * R * Math.cos(Math.PI / posts));
          rail.rotation.y = -mid;
          this.fence.add(rail);
        }
      }
    }
    this.group.add(this.fence);
  }

  private buildHouse() {
    const wall = new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#4f5566', flatShading: true, roughness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: '#6a4c36', roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.8, 4), wall);
    body.position.y = 1.4;
    // gabled roof: a triangle extruded along the long side
    const gable = new THREE.Shape([new THREE.Vector2(-2.5, 0), new THREE.Vector2(2.5, 0), new THREE.Vector2(0, 1.7)]);
    const roofGeo = new THREE.ExtrudeGeometry(gable, { depth: 6.8, bevelEnabled: false });
    roofGeo.translate(0, 0, -3.4);
    roofGeo.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.8;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.08), wood);
    door.position.set(0.8, 0.85, 2.02);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.08), this.windowMat);
    win.position.set(-1.4, 1.6, 2.02);
    for (const m of [body, roof]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.house.add(body, roof, door, win);
    this.house.position.copy(this.houseItem.pos);
    this.house.position.y = yardHeight(this.houseItem.pos.x, this.houseItem.pos.z);
    this.house.rotation.y = this.houseItem.rotY;
    this.group.add(this.house);
  }

  setLevel(level: number, instant = false) {
    this.target = level;
    if (instant) this.shown = level;
  }

  /** True while new things are still growing in. */
  get growing() {
    return Math.abs(this.shown - this.target) > 0.002;
  }

  applyPalette(p: Palette) {
    // ground colours
    const col = this.ground.geometry.attributes.color as THREE.BufferAttribute;
    const soil = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      const n = this.groundNoise[i];
      const yard = this.groundYard[i];
      const lush = clamp(p.lushness * 1.35 - (1 - n) * 0.45 - yard * 0.55);
      soil.copy(p.soilDry).lerp(p.soilLush, lush);
      soil.lerp(p.path, Math.min(1, this.groundPath[i] * 0.9 + yard * 0.15));
      soil.multiplyScalar(0.86 + n * 0.26);
      col.setXYZ(i, soil.r, soil.g, soil.b);
    }
    col.needsUpdate = true;

    this.mountainMat.color.copy(p.mountain);

    // grass: dry straw → fresh green
    for (let i = 0; i < this.grassItems.length; i++) {
      const it = this.grassItems[i];
      tmpC.copy(p.soilDry).lerp(p.soilLush, clamp(p.lushness * 1.2 + it.r * 0.2));
      tmpC.multiplyScalar(1.05 + it.r * 0.25);
      this.grass.setColorAt(i, tmpC);
    }
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;

    for (let i = 0; i < this.crownItems.length; i++) {
      const it = this.crownItems[i];
      const toBlossom = smoothstep(it.r - 0.08, it.r + 0.08, p.blossomMix);
      tmpC.copy(p.foliage).multiplyScalar(0.85 + it.r * 0.3).lerp(p.blossom, toBlossom);
      this.crowns.setColorAt(i, tmpC);
    }
    if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;

    this.windowMat.emissiveIntensity = p.moteGlow * 2.2;
  }

  update(dt: number, time: number) {
    this.time.value = time;
    this.shown = damp(this.shown, this.target, 1.6, dt);
    if (Math.abs(this.shown - this.lastWritten) < 0.001) return;
    this.lastWritten = this.shown;
    const s = this.shown;
    writeInstances(this.grass, this.grassItems, s);
    writeInstances(this.flowers, this.flowerItems, s);
    writeInstances(this.trunks, this.treeItems, s);
    writeInstances(this.crowns, this.crownItems, s);
    for (const [obj, item] of [[this.fence, this.fenceItem], [this.house, this.houseItem]] as const) {
      const g = growth(item, s);
      obj.visible = g > 0.001;
      obj.scale.set(1, Math.max(1e-3, g), 1);
    }
  }
}

/** Push a radius off the walking path so nothing grows where you step. */
function clearOfPath(r: number, half: number, rand: () => number) {
  if (Math.abs(r - WALK_RADIUS) >= half) return r;
  return r < WALK_RADIUS ? WALK_RADIUS - half - rand() * 0.4 : WALK_RADIUS + half + rand() * 0.6;
}

function mergeGeometries(geos: THREE.BufferGeometry[]) {
  // tiny local merge (position/normal/uv only) to avoid pulling in BufferGeometryUtils for two call sites
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
