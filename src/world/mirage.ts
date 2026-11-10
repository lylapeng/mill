import * as THREE from 'three';
import { mulberry32, yardHeight } from '../util';
import { Animal, hasModel, type Breed } from './models';
import { winter } from '../season';

// A grassland floating above the horizon, with its upside-down reflection
// below — the way real desert mirages look. It shimmers less every time you
// fail to reach it (uClarity), which is how the pity system is felt, not read.
// At Christmas (season.ts) it is silver, pines on the ridge and a herd of stags running.

const vert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uTime;
uniform float uClarity;
uniform float uFigure;
varying float vY;
varying float vX;
void main() {
  vec3 transformed = position;
  #include <skinbase_vertex>
  #include <skinning_vertex>
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  float wob = 1.0 - uClarity * 0.75;
  world.x += sin(world.y * 1.4 + uTime * 2.3) * 0.35 * wob + sin(world.y * 4.1 - uTime * 3.7) * 0.12 * wob;
  world.z += cos(world.y * 1.1 + uTime * 1.9) * 0.35 * wob;
  world.y += sin(world.x * 0.35 + uTime * 1.6) * 0.18 * wob;
  // the hills fade by their own coordinates; the running animals never fade at the edges
  vY = uFigure > 0.5 ? 2.0 : position.y;
  vX = uFigure > 0.5 ? 0.0 : position.x;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHaze;
uniform float uOpacity;
uniform float uClarity;
uniform float uTime;
uniform float uMirror;
uniform float uSilver;
varying float vY;
varying float vX;
void main() {
  float clear = 0.35 + 0.6 * uClarity;
  vec3 c = mix(uHaze, uColor, clear * (uMirror > 0.5 ? 0.55 : 1.0));
  // horizontal heat bands drifting upward
  float bands = 0.88 + 0.12 * sin(vY * 9.0 - uTime * 5.0 + sin(vX * 0.3) * 2.0);
  c *= bands;
  // silver: a slow sheen sweeping across, as light runs over metal (the base stays mid-grey, or against a pale
  // winter horizon and the bloom it washed out into a white band)
  float sheen = pow(max(0.0, sin(vX * 0.12 + vY * 0.5 - uTime * 0.7)), 10.0);
  c += vec3(0.32, 0.34, 0.38) * sheen * uSilver;
  // the image lifts off the horizon; its reflection fades away from the seam
  float edge = smoothstep(-0.3, 1.2, vY);
  if (uMirror > 0.5) edge *= (1.0 - smoothstep(1.0, 7.0, vY)) * 0.4;
  float sideFade = 1.0 - smoothstep(24.0, 36.0, abs(vX));
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
    uSilver: { value: 0 },
  };
  private herd: { animal: Animal; speed: number }[] = [];
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
    const snowy = winter();
    this.uniforms.uSilver.value = snowy ? 1 : 0;
    const look = snowy
      ? { far: '#8a95a8', mid: '#a1abbb', near: '#b9c2cf', crown: '#6c788c', trunk: '#5f6a7c', herd: '#4a566b' }
      : { far: '#9fb8a8', mid: '#7fc46a', near: '#a6dc72', crown: '#5f9e52', trunk: '#5c6b48', herd: '#5b7a4a' };
    layer(look.far, -6, 7.5, 1.6, 1.7);
    layer(look.mid, -3, 5.0, 1.2, 4.1);
    layer(look.near, 0, 2.6, 0.7, 0.3);

    // a few trees on the middle ridge: round in summer, pines in the snow
    const crown = snowy ? new THREE.ConeGeometry(1.1, 3.2, 6) : new THREE.IcosahedronGeometry(1.4, 0);
    for (let i = 0; i < (snowy ? 9 : 7); i++) {
      const x = -26 + rand() * 52;
      const y = 5.0 + Math.sin(x * 0.11 + 4.1) * 1.2 + Math.sin(x * 0.27 + 8.2) * 0.48;
      for (const [g, m] of [[inner, 0], [mirror, 1]] as const) {
        const t = new THREE.Mesh(crown, this.material(look.crown, m));
        t.position.set(x, y + (snowy ? 1.9 : 1.2), -2.5);
        if (!snowy) t.scale.set(1, 1.3, 1);
        const trunk = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.6), this.material(look.trunk, m));
        trunk.position.set(x, y + 0.2, -2.6);
        g.add(trunk, t);
      }
    }

    // free animals running along the near ridge; in the snow, a herd of stags
    const stags = snowy && hasModel('stag');
    const kinds: Breed[] = stags ? ['stag', 'stag', 'stag', 'stag', 'stag', 'stag'] : ['horse', 'whiteHorse', 'donkey', 'ox', 'horse'];
    const silhouette = this.material(look.herd, 0, 1);
    kinds.forEach((kind, i) => {
      const a = new Animal(kind);
      a.setMaterial(silhouette);
      a.castShadow = false;
      a.play('Gallop', 0);
      a.update(rand() * 2);
      a.root.rotation.y = Math.PI / 2; // run along +x
      a.root.scale.setScalar(stags ? 1.5 : 1.6);
      a.root.position.set(-20 + i * (stags ? 7.5 : 9) + rand() * 4, 2.0, 0.5);
      inner.add(a.root);
      this.herd.push({ animal: a, speed: 3.5 + rand() * 1.5 });
    });

    this.group.add(inner, mirror);
    this.group.visible = false;
  }

  private material(color: string, mirror: number, figure = 0) {
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
        uFigure: { value: figure },
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
      const root = h.animal.root;
      root.position.x += dt * h.speed;
      if (root.position.x > 26) root.position.x = -26;
      h.animal.update(dt);
    }
  }
}
