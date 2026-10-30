import * as THREE from 'three';
import { WALK_RADIUS, tierOf } from '../config';
import { clamp, mulberry32 } from '../util';

// The mill, built from primitives. Each tier adds a layer of machinery on top
// of the previous ones; nothing is ever removed, so the yard tells its history.

const mats = {
  stone: new THREE.MeshStandardMaterial({ color: '#9b978e', roughness: 0.95, flatShading: true }),
  stoneDark: new THREE.MeshStandardMaterial({ color: '#7d7a73', roughness: 1, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#7b5a3e', roughness: 0.9, flatShading: true }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#5a412d', roughness: 1, flatShading: true }),
  tile: new THREE.MeshStandardMaterial({ color: '#4e5568', roughness: 0.75, flatShading: true }),
  flour: new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: 1 }),
  brass: new THREE.MeshStandardMaterial({ color: '#c9a050', metalness: 0.85, roughness: 0.32 }),
  iron: new THREE.MeshStandardMaterial({ color: '#3d3a3a', metalness: 0.6, roughness: 0.45 }),
  belt: new THREE.MeshStandardMaterial({ color: '#2b211b', roughness: 0.9 }),
  glowGold: new THREE.MeshStandardMaterial({ color: '#2a2418', emissive: '#ffd27a', emissiveIntensity: 1.6 }),
  glowCyan: new THREE.MeshStandardMaterial({ color: '#18242a', emissive: '#a6ecff', emissiveIntensity: 1.1 }),
  slab: new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
};

function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, y = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.y = y + h / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function gearGeometry(outer: number, inner: number, teeth: number, depth: number, hole = 0.08) {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = i % 4 < 2 ? outer : inner;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  shape.holes.push(h);
  // spokes as cut-outs
  const spokes = 5;
  for (let s = 0; s < spokes; s++) {
    const a0 = (s / spokes) * Math.PI * 2 + 0.25;
    const a1 = a0 + (Math.PI * 2) / spokes - 0.5;
    const p = new THREE.Path();
    const r0 = hole + 0.08, r1 = inner - 0.08;
    p.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    p.absarc(0, 0, r1, a0, a1, false);
    p.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
    p.absarc(0, 0, r0, a1, a0, true);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// the brass and steam tiers share one drivetrain; these place its parts
const CROWN_Y = 2.6;
const SHAFT_TOP = 3.43;
const DRIVE_Y = 2.95;
const PULLEY_Z = 4.95;
const PULLEY_R = 0.24;
const FLY_Y = 1.25;
const FLY_R = 0.7;

export class Mill {
  readonly group = new THREE.Group();
  /** turns with the walking angle: upper stone, axle, beam */
  private rotor = new THREE.Group();
  private tierGroups: THREE.Group[] = [];
  private pop: number[] = [1, 1, 1, 1, 1];
  private tier = -1;
  private flourPile: THREE.Mesh;
  /** the line shaft under the crossbeam: pinion, shaft and pulley spin together around z */
  private drive = new THREE.Group();
  private flywheel = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private steam: THREE.Points;
  private steamTime = { value: 0 };
  private slabs: THREE.InstancedMesh;

  constructor() {
    for (let t = 0; t < 5; t++) {
      const g = new THREE.Group();
      g.visible = false;
      this.tierGroups.push(g);
      this.group.add(g);
    }
    this.group.add(this.rotor);

    // tier 0 — 石磨: pedestal, two stones, axle and the beam you push
    const base = this.tierGroups[0];
    base.visible = true;
    base.add(cyl(1.3, 1.4, 0.5, 18, mats.stoneDark));
    base.add(cyl(1.0, 1.02, 0.4, 20, mats.stone, 0.5));
    const chute = box(0.5, 0.08, 0.3, mats.wood);
    chute.position.set(1.45, 0.45, 0);
    chute.rotation.z = -0.35;
    base.add(chute);
    this.flourPile = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 12), mats.flour);
    this.flourPile.position.set(1.75, 0.14, 0);
    this.flourPile.receiveShadow = true;
    base.add(this.flourPile);

    this.rotor.add(cyl(0.97, 0.97, 0.36, 20, mats.stone, 0.92));
    const hopper = cyl(0.22, 0.12, 0.22, 10, mats.woodDark, 1.28);
    this.rotor.add(hopper);
    this.rotor.add(cyl(0.07, 0.07, 1.9, 8, mats.woodDark, 1.0));
    const beamArm = new THREE.Group();
    beamArm.rotation.y = 0.13; // the harness sits a little behind your head
    const beamLen = WALK_RADIUS - 0.25;
    const beam = box(beamLen, 0.13, 0.13, mats.wood);
    beam.position.set(beamLen / 2 + 0.2, 1.12, 0);
    beamArm.add(beam);
    const yoke = box(0.1, 0.55, 0.1, mats.woodDark);
    yoke.position.set(beamLen + 0.15, 1.05, 0);
    beamArm.add(yoke);
    this.rotor.add(beamArm);

    // flagstones under the path appear with the first mill upgrade
    const rand = mulberry32(3);
    const slabCount = 46;
    this.slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.slab, slabCount);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < slabCount; i++) {
      const a = (i / slabCount) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * WALK_RADIUS, 0.02 + rand() * 0.02, Math.sin(a) * WALK_RADIUS);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + (rand() - 0.5) * 0.08);
      m4.compose(pos, q, new THREE.Vector3(1.05 + rand() * 0.15, 0.06, (Math.PI * 2 * WALK_RADIUS) / slabCount - 0.05));
      this.slabs.setMatrixAt(i, m4);
      this.slabs.setColorAt(i, c.set('#b8b0a2').multiplyScalar(0.85 + rand() * 0.25));
    }
    this.slabs.receiveShadow = true;
    this.tierGroups[1].add(this.slabs);

    this.buildFrame(this.tierGroups[1]);
    this.buildBrass(this.tierGroups[2]);
    this.steam = this.buildSteam(this.tierGroups[3]);
    this.buildStar(this.tierGroups[4]);
  }

  /** 木架磨: two A-frame posts outside the path, a crossbeam and a small roof over the stones */
  private buildFrame(g: THREE.Group) {
    for (const side of [-1, 1]) {
      const post = cyl(0.13, 0.16, 3.6, 7, mats.wood);
      post.position.set(0, 1.8, side * 4.5);
      g.add(post);
      const foot = cyl(0.3, 0.36, 0.25, 7, mats.stoneDark);
      foot.position.set(0, 0.12, side * 4.5);
      g.add(foot);
      const brace = box(0.1, 1.6, 0.1, mats.woodDark);
      brace.position.set(0, 3.0, side * 3.95);
      brace.rotation.x = side * 0.7;
      g.add(brace);
    }
    const cross = box(0.22, 0.24, 9.4, mats.wood);
    cross.position.set(0, 3.55, 0);
    g.add(cross);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 6), mats.tile);
    roof.position.set(0, 4.1, 0);
    roof.castShadow = true;
    g.add(roof);
    const finial = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mats.woodDark);
    finial.position.set(0, 4.62, 0);
    g.add(finial);
  }

  /** 铜轮磨: brass bands on the stones, a crown gear on the axle driving a line shaft under the crossbeam */
  private buildBrass(g: THREE.Group) {
    for (const [r, y] of [[1.02, 0.52], [1.02, 0.88], [1.33, 0.48]] as const) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 40), mats.brass);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    // the axle now reaches up into a bearing under the crossbeam; the crown gear sits on it
    const turning = new THREE.Group();
    turning.userData.rotor = true;
    turning.add(cyl(0.07, 0.07, SHAFT_TOP - 2.9, 8, mats.iron, 2.9));
    const crown = new THREE.Mesh(gearGeometry(0.85, 0.74, 28, 0.12), mats.brass);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = CROWN_Y;
    crown.castShadow = true;
    turning.add(crown, cyl(0.15, 0.15, 0.22, 10, mats.brass, CROWN_Y - 0.11));
    g.add(turning);
    const bearing = box(0.24, 0.24, 0.24, mats.iron);
    bearing.position.set(0, 3.4, 0);
    g.add(bearing);

    // the pinion rests on the crown gear's rim; its shaft runs along under the
    // crossbeam, through the post, to a pulley on the far side
    this.drive.position.set(0, DRIVE_Y, 0);
    const pinion = new THREE.Mesh(gearGeometry(0.28, 0.21, 10, 0.1, 0.05), mats.brass);
    pinion.position.z = 0.8;
    const from = 0.7, to = PULLEY_Z + 0.08;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, to - from, 8), mats.iron);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = (from + to) / 2;
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(PULLEY_R, PULLEY_R, 0.12, 20), mats.brass);
    pulley.rotation.x = Math.PI / 2;
    pulley.position.z = PULLEY_Z;
    this.drive.add(pinion, shaft, pulley);
    this.drive.traverse((o) => (o.castShadow = true));
    g.add(this.drive);
    for (const z of [1.75, 3.3]) {
      const hanger = box(0.05, 3.43 - DRIVE_Y, 0.05, mats.iron);
      hanger.position.set(0, (3.43 + DRIVE_Y) / 2, z);
      const block = box(0.16, 0.14, 0.12, mats.iron);
      block.position.set(0, DRIVE_Y, z);
      g.add(hanger, block);
    }
    const plate = box(0.34, 0.3, 0.04, mats.iron);
    plate.position.set(0, DRIVE_Y, 4.5 + 0.17);
    g.add(plate);
  }

  /** 蒸汽磨: a boiler behind the far post; its flywheel drives the line shaft by a belt */
  private buildSteam(g: THREE.Group) {
    const bz = 6.15;
    const boiler = cyl(0.75, 0.8, 2.0, 18, mats.iron);
    boiler.position.z = bz;
    g.add(boiler);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.brass);
    dome.position.set(0, 2.0, bz);
    g.add(dome);
    for (const y of [0.3, 1.0, 1.7]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.03, 6, 36), mats.brass);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, y, bz);
      g.add(band);
    }
    const chimney = cyl(0.12, 0.16, 3.0, 10, mats.iron);
    chimney.position.set(0.3, 2.3, bz + 0.25);
    g.add(chimney);
    const firebox = box(0.5, 0.4, 0.06, mats.glowGold);
    firebox.position.set(0.6, 0.45, bz + 0.5);
    firebox.rotation.y = 0.9;
    g.add(firebox);

    // flywheel between boiler and post, in line with the pulley above it
    const rim = new THREE.Mesh(new THREE.TorusGeometry(FLY_R, 0.07, 6, 30), mats.iron);
    this.flywheel.add(rim);
    for (let i = 0; i < 6; i++) {
      const spoke = box(0.05, FLY_R * 2 - 0.05, 0.05, mats.iron);
      spoke.rotation.z = (i / 6) * Math.PI;
      this.flywheel.add(spoke);
    }
    this.flywheel.position.set(0, FLY_Y, PULLEY_Z);
    g.add(this.flywheel);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, bz - 0.75 - PULLEY_Z, 8), mats.iron);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, FLY_Y, (PULLEY_Z + bz - 0.75) / 2);
    g.add(axle);
    // the belt: two straight runs from the pulley rim down to the flywheel rim
    for (const side of [-1, 1]) {
      const top = new THREE.Vector2(side * PULLEY_R, DRIVE_Y);
      const bottom = new THREE.Vector2(side * FLY_R, FLY_Y);
      const run = top.clone().sub(bottom);
      const belt = box(0.025, run.length(), 0.08, mats.belt);
      belt.position.set((top.x + bottom.x) / 2, (top.y + bottom.y) / 2, PULLEY_Z);
      belt.rotation.z = -Math.atan2(run.x, run.y);
      g.add(belt);
    }

    // steam: soft puffs rising and widening
    const count = 60;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([0.3, 5.3, bz + 0.25], i * 3);
      seed[i] = i / count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.steamTime },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aSeed;
        varying float vLife;
        void main() {
          float life = fract(aSeed + uTime * 0.18);
          vLife = life;
          vec3 p = position + vec3(life * 2.2 + sin(aSeed * 40.0) * 0.3 * life, life * 3.5, cos(aSeed * 30.0) * 0.4 * life);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (40.0 + life * 160.0) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife) * 0.45;
          gl_FragColor = vec4(vec3(0.97), a);
        }`,
    });
    const steam = new THREE.Points(geo, mat);
    steam.frustumCulled = false;
    g.add(steam);
    return steam;
  }

  /** 星辉磨: engraved light in the stones, rings floating above, glowing seams along the path */
  private buildStar(g: THREE.Group) {
    for (const [r, mat] of [[0.55, mats.glowGold], [0.8, mats.glowCyan]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 48), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.29;
      ring.userData.rotor = true;
      const holder = new THREE.Group();
      holder.add(ring);
      holder.userData.rotor = true;
      g.add(holder);
    }
    for (const r of [WALK_RADIUS - 0.58, WALK_RADIUS + 0.58]) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01, 4, 128), mats.glowGold);
      seam.rotation.x = Math.PI / 2;
      seam.position.y = 0.06;
      g.add(seam);
    }
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45 + i * 0.22, 0.012, 6, 96), i === 1 ? mats.glowCyan : mats.glowGold);
      ring.position.y = 2.0 + i * 0.25;
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
      this.rings.push(ring);
      g.add(ring);
    }
  }

  setLevel(level: number, instant = false) {
    const tier = tierOf(level);
    for (let t = 0; t < 5; t++) {
      const show = t <= tier;
      const g = this.tierGroups[t];
      if (show && !g.visible) this.pop[t] = instant ? 1 : 0;
      g.visible = show;
    }
    this.tier = tier;
    const pile = 0.6 + level * 0.06;
    this.flourPile.scale.set(pile, pile, pile);
  }

  update(dt: number, time: number, angle: number) {
    this.rotor.rotation.y = -angle;
    // children flagged as rotor ride along with the stones
    for (const g of this.tierGroups) {
      for (const child of g.children) if (child.userData.rotor) child.rotation.y = -angle;
    }
    this.drive.rotation.z = angle * 3.1;
    // an open belt: same direction, slowed by the pulley/flywheel ratio
    this.flywheel.rotation.z = angle * 3.1 * (PULLEY_R / FLY_R);
    this.rings.forEach((r, i) => {
      r.rotation.z = time * (0.15 + i * 0.07) * (i % 2 ? -1 : 1);
      r.position.y = 2.0 + i * 0.25 + Math.sin(time * 0.8 + i) * 0.06;
    });
    this.steamTime.value = time;
    this.steam.visible = this.tier >= 3;

    for (let t = 0; t < 5; t++) {
      if (this.pop[t] >= 1) continue;
      this.pop[t] = Math.min(1, this.pop[t] + dt / 1.4);
      const k = this.pop[t];
      // ease-out-back for a gentle overshoot
      const s = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      this.tierGroups[t].scale.setScalar(clamp(s, 0.001, 1.2));
    }
  }
}
