import * as THREE from 'three';
import { mulberry32, yardHeight } from '../util';
import { buildFigure } from './animals';
import type { AnimalId } from '../config';

// A grassland floating above the horizon, with its upside-down reflection
// below — the way real desert mirages look. It shimmers less every time you
// fail to reach it (uClarity), which is how the pity system is felt, not read.

const vert = /* glsl */ `
uniform float uTime;
uniform float uClarity;
varying float vY;
varying float vX;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float wob = 1.0 - uClarity * 0.75;
  world.x += sin(world.y * 1.4 + uTime * 2.3) * 0.35 * wob + sin(world.y * 4.1 - uTime * 3.7) * 0.12 * wob;
  world.z += cos(world.y * 1.1 + uTime * 1.9) * 0.35 * wob;
  world.y += sin(world.x * 0.35 + uTime * 1.6) * 0.18 * wob;
  vY = position.y;
  vX = position.x;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uOpacity;
uniform float uClarity;
uniform float uTime;
uniform float uMirror;
varying float vY;
varying float vX;
void main() {
  float clear = 0.35 + 0.6 * uClarity;
  vec3 c = mix(uHaze, uColor, clear * (uMirror > 0.5 ? 0.55 : 1.0));
  // horizontal heat bands drifting upward
  float bands = 0.88 + 0.12 * sin(vY * 9.0 - uTime * 5.0 + sin(vX * 0.3) * 2.0);
  c *= bands;
  // the image lifts off the horizon; its reflection fades away from the seam
  float edge = smoothstep(-0.3, 1.2, vY);
  if (uMirror > 0.5) edge *= (1.0 - smoothstep(1.0, 7.0, vY)) * 0.4;
  float sideFade = smoothstep(36.0, 24.0, abs(vX));
  float a = uOpacity * clear * edge * sideFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}`;

export class Mirage {
  readonly group = new THREE.Group();
  private uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uClarity: { value: 0 },
    uHaze: { value: new THREE.Color() },
  };
  private herd: { obj: THREE.Group; legs: THREE.Mesh[]; phase: number; speed: number }[] = [];
  /** world-space direction (unit, horizontal) from the yard toward the mirage */
  readonly direction = new THREE.Vector3(1, 0, 0);

  constructor() {
    const rand = mulberry32(42);
    const inner = new THREE.Group();
    const mirror = new THREE.Group();
    mirror.scale.y = -1;

    const layer = (color: string, depth: number, height: number, amp: number, seed: number) => {
      const pts: THREE.Vector2[] = [new THREE.Vector2(-40, 0)];
      for (let i = 0; i <= 80; i++) {
        const x = -40 + i;
        const y = height + Math.sin(x * 0.11 + seed) * amp + Math.sin(x * 0.27 + seed * 2.0) * amp * 0.4;
        pts.push(new THREE.Vector2(x, y));
      }
      pts.push(new THREE.Vector2(40, 0));
      const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
      geo.translate(0, 0, depth);
      for (const [g, m] of [[inner, 0], [mirror, 1]] as const) {
        g.add(new THREE.Mesh(geo, this.material(color, m)));
      }
    };
    layer('#9fb8a8', -6, 7.5, 1.6, 1.7);
    layer('#7fc46a', -3, 5.0, 1.2, 4.1);
    layer('#a6dc72', 0, 2.6, 0.7, 0.3);

    // a few trees on the middle ridge
    const crown = new THREE.IcosahedronGeometry(1.4, 0);
    for (let i = 0; i < 7; i++) {
      const x = -26 + rand() * 52;
      const y = 5.0 + Math.sin(x * 0.11 + 4.1) * 1.2 + Math.sin(x * 0.27 + 8.2) * 0.48;
      for (const [g, m] of [[inner, 0], [mirror, 1]] as const) {
        const t = new THREE.Mesh(crown, this.material('#5f9e52', m));
        t.position.set(x, y + 1.2, -2.5);
        t.scale.set(1, 1.3, 1);
        const trunk = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.6), this.material('#5c6b48', m));
        trunk.position.set(x, y + 0.2, -2.6);
        g.add(trunk, t);
      }
    }

    // free animals running along the near ridge
    const kinds: AnimalId[] = ['horse', 'horse', 'donkey', 'ox', 'horse'];
    kinds.forEach((kind, i) => {
      const fig = buildFigure(kind);
      fig.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = this.material('#5b7a4a', 0);
      });
      fig.group.scale.setScalar(1.6);
      fig.group.position.set(-20 + i * 9 + rand() * 4, 2.2, 0.5);
      inner.add(fig.group);
      this.herd.push({ obj: fig.group, legs: fig.legs, phase: rand() * 6, speed: 2.5 + rand() * 1.5 });
    });

    this.group.add(inner, mirror);
    this.group.visible = false;
  }

  private material(color: string, mirror: number) {
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        ...this.uniforms,
        uColor: { value: new THREE.Color(color) },
        uMirror: { value: mirror },
      },
    });
  }

  /** Place the mirage on the horizon in the given direction. */
  place(angle: number, distance: number) {
    this.direction.set(Math.cos(angle), 0, Math.sin(angle));
    const x = this.direction.x * distance, z = this.direction.z * distance;
    // float a little above the horizon, larger than life
    this.group.position.set(x, Math.max(6, yardHeight(x, z) + 5), z);
    this.group.scale.setScalar(1.5);
    this.group.lookAt(0, this.group.position.y, 0);
  }

  set opacity(v: number) {
    this.uniforms.uOpacity.value = v;
    this.group.visible = v > 0.001;
  }
  get opacity() {
    return this.uniforms.uOpacity.value;
  }

  set clarity(v: number) {
    this.uniforms.uClarity.value = v;
  }

  setHaze(c: THREE.Color) {
    this.uniforms.uHaze.value.copy(c);
  }

  update(dt: number, time: number) {
    this.uniforms.uTime.value = time;
    if (!this.group.visible) return;
    for (const h of this.herd) {
      h.phase += dt * h.speed * 2.2;
      h.obj.position.x += dt * h.speed;
      if (h.obj.position.x > 26) h.obj.position.x = -26;
      h.obj.position.y = 2.2 + Math.abs(Math.sin(h.phase)) * 0.25;
      h.legs.forEach((l, i) => (l.rotation.z = Math.sin(h.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * 0.6));
    }
  }
}
