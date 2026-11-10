import * as THREE from 'three';
import type { Palette } from './palette';

// Hand-made gradient sky. Its horizon colour is exactly the fog colour, so
// distant hills dissolve into it without a seam (the Preetham Sky can't do that).

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudTint;
uniform float uCloudCover;
uniform float uTime;
uniform float uStars;
uniform float uAurora;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, 0.0, 1.0);
  // rises quickly off the horizon but with a finite slope there (sqrt's infinite slope
  // bent the sun's glow into a bell around a low sun)
  vec3 col = mix(uHorizon, uTop, (1.0 - exp(-up * 3.2) * (1.0 + up * 1.1)) / 0.914);
  float sd = max(dot(d, uSunDir), 0.0);

  // warm glow around the sun and along the horizon beneath it. Both fall off with the
  // square of their distance (angle, height), so where they overlap near a low sun the
  // glow is a wide ellipse lying on the horizon; a linear height falloff made it a parabola.
  col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.5);
  col += uSunColor * 0.1 * exp(-up * up * 40.0) * (0.4 + 0.6 * sd);
  col += uSunColor * smoothstep(0.99935, 0.9997, sd) * 5.0;

  if (uStars > 0.0 && d.y > 0.0) {
    // sparse stars, higher up only, each twinkling at its own pace; under the clouds below
    vec3 cell = floor(d * 260.0);
    float h = hash(cell.xy + cell.z * 17.31);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    col += vec3(1.0, 0.96, 0.9) * step(0.9975, h) * tw * smoothstep(0.08, 0.45, d.y) * uStars;
  }

  if (uAurora > 0.0 && d.y > 0.0) {
    // curtains of light: a band that wanders in height around the sky, hung with fine
    // vertical rays that drift sideways; green at the foot, violet where it fades out on top
    float az = atan(d.z, d.x);
    float foot = 0.16 + 0.07 * sin(az * 2.0 + uTime * 0.03) + 0.04 * sin(az * 5.0 - uTime * 0.05);
    float above = d.y - foot;
    float curtain = smoothstep(-0.02, 0.03, above) * exp(-max(above, 0.0) * 5.0);
    // noise sampled on a circle, so the rays join up all the way round (atan jumps at the back)
    vec2 ring = normalize(d.xz + vec2(1e-5, 0.0));
    float rays = noise(ring * 4.2 + vec2(uTime * 0.02, uTime * 0.013)) * 0.7 + noise(ring * 11.0 + vec2(-uTime * 0.03, 3.0)) * 0.3;
    float sheet = 0.55 + 0.45 * sin(az * 3.0 + uTime * 0.07);
    float glow = curtain * (0.25 + rays * rays * 1.2) * sheet;
    vec3 auroraCol = mix(vec3(0.25, 1.0, 0.6), vec3(0.6, 0.35, 1.0), smoothstep(0.0, 0.3, above));
    col += auroraCol * glow * uAurora * 1.15;
  }

  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.15) * 1.1 + vec2(uTime * 0.0035, uTime * 0.0012);
    float n = fbm(uv * 1.7);
    float m = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.3, n);
    m *= smoothstep(0.0, 0.18, d.y);
    // self-shadow: sample a little toward the sun
    float shade = fbm(uv * 1.7 + uSunDir.xz * 0.06);
    vec3 lit = uCloudTint * (0.82 + 0.3 * smoothstep(0.35, 0.75, shade));
    lit += uSunColor * pow(sd, 5.0) * 0.35 * (1.0 - m);
    col = mix(col, mix(lit, uHorizon, 0.25 * (1.0 - up)), m * 0.88);
  }

  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sunDir = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: this.sunDir },
        uSunColor: { value: new THREE.Color() },
        uCloudTint: { value: new THREE.Color() },
        uCloudCover: { value: 0.5 },
        uTime: { value: 0 },
        uStars: { value: 0 },
        uAurora: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  apply(p: Palette, sunAzimuth: number) {
    const u = this.material.uniforms;
    u.uTop.value.copy(p.skyTop);
    u.uHorizon.value.copy(p.skyHorizon);
    u.uSunColor.value.copy(p.sun);
    u.uCloudTint.value.copy(p.cloudTint);
    u.uCloudCover.value = p.cloudCover;
    u.uAurora.value = p.aurora;
    u.uStars.value = Math.max(u.uStars.value, p.aurora);
    const el = THREE.MathUtils.degToRad(p.sunElevation);
    this.sunDir.set(Math.cos(el) * Math.cos(sunAzimuth), Math.sin(el), Math.cos(el) * Math.sin(sunAzimuth));
  }

  update(time: number, cameraPosition: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    this.mesh.position.copy(cameraPosition);
  }
}
