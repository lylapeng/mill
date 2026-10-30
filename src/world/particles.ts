import * as THREE from 'three';
import { mulberry32 } from '../util';
import type { Palette } from './palette';

// Motes drift through the yard: dust at first, pollen later, fireflies at the end.
// Petals fall once the trees blossom. Both are single draw calls.

const moteVert = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying float vBlink;
void main() {
  vec3 p = position;
  float t = uTime * (0.15 + aSeed.x * 0.2);
  p.x += sin(t + aSeed.y * 6.28) * 1.6;
  p.z += cos(t * 0.8 + aSeed.z * 6.28) * 1.6;
  p.y += sin(t * 1.3 + aSeed.w * 6.28) * 0.5;
  vBlink = 0.5 + 0.5 * sin(uTime * (1.2 + aSeed.x * 2.0) + aSeed.y * 40.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed.w) * (10.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const moteFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
uniform float uOpacity;
varying float vBlink;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = mix(a * 0.35, a * (0.15 + 0.85 * vBlink * vBlink), uGlow);
  gl_FragColor = vec4(uColor * (1.0 + uGlow * 2.5), a * uOpacity);
}`;

const petalVert = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying float vSpin;
void main() {
  vec3 p = position;
  float fall = mod(p.y - uTime * (0.35 + aSeed.x * 0.3), 9.0);
  p.y = fall;
  p.x += sin(uTime * 0.7 + aSeed.y * 6.28) * 1.2 + uTime * 0.25;
  p.z += cos(uTime * 0.5 + aSeed.z * 6.28) * 1.0;
  p.x = mod(p.x + 26.0, 52.0) - 26.0;
  vSpin = uTime * (1.0 + aSeed.w * 2.0) + aSeed.y * 6.28;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uPixelRatio * (2.0 + aSeed.w * 1.5) * (10.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const petalFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vSpin;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vSpin), co = cos(vSpin);
  c = mat2(co, -s, s, co) * c;
  c.x *= 2.2 * (0.6 + 0.4 * abs(sin(vSpin * 0.7)));
  float a = smoothstep(0.5, 0.35, length(c));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (0.9 + 0.2 * c.y), a * uOpacity);
}`;

function cloud(count: number, radius: number, yMin: number, yMax: number, seed: number) {
  const rand = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2 + Math.sqrt(rand()) * radius;
    pos.set([Math.cos(a) * r, yMin + rand() * (yMax - yMin), Math.sin(a) * r], i * 3);
    seeds.set([rand(), rand(), rand(), rand()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  return geo;
}

export class Particles {
  readonly group = new THREE.Group();
  private moteMat: THREE.ShaderMaterial;
  private petalMat: THREE.ShaderMaterial;
  private time = { value: 0 };
  private pixelRatio = { value: 1 };

  constructor() {
    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: moteVert,
      fragmentShader: moteFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.time,
        uPixelRatio: this.pixelRatio,
        uSize: { value: 2 },
        uColor: { value: new THREE.Color() },
        uGlow: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    const motes = new THREE.Points(cloud(520, 24, 0.2, 5, 11), this.moteMat);
    motes.frustumCulled = false;

    this.petalMat = new THREE.ShaderMaterial({
      vertexShader: petalVert,
      fragmentShader: petalFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: this.time,
        uPixelRatio: this.pixelRatio,
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0 },
      },
    });
    const petals = new THREE.Points(cloud(320, 24, 0, 9, 23), this.petalMat);
    petals.frustumCulled = false;
    this.group.add(motes, petals);
  }

  setPixelRatio(r: number) {
    this.pixelRatio.value = r;
  }

  applyPalette(p: Palette) {
    const m = this.moteMat.uniforms;
    m.uColor.value.copy(p.mote);
    m.uSize.value = p.moteSize;
    m.uGlow.value = p.moteGlow;
    this.petalMat.uniforms.uColor.value.copy(p.blossom);
    this.petalMat.uniforms.uOpacity.value = p.petals * 0.9;
  }

  update(time: number) {
    this.time.value = time;
  }
}
