import * as THREE from 'three';
import type { AnimalId } from './config';
import type { Input } from './input';
import { Animal, Rider, type Breed } from './world/models';
import { makePalette, samplePalette } from './world/palette';
import { Sky } from './world/sky';
import { damp, meadowHeight, meadowHeightGLSL, mulberry32 } from './util';

// The grassland: endless, wind over the grass, a low sun ahead.
// Grass and ground wrap around the camera, so you can run forever.

const TILE = 64;

const grassVert = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
attribute vec3 aOffset; // x, z in [0, TILE), w = random
varying float vH;
varying float vRand;
${meadowHeightGLSL}
void main() {
  vec2 local = mod(aOffset.xy - uCenter.xz, ${TILE.toFixed(1)}) - ${(TILE / 2).toFixed(1)};
  vec2 wp = uCenter.xz + local;
  float r = aOffset.z;
  float h = position.y;
  vH = h;
  vRand = r;
  float height = 0.55 + r * 0.6;
  float ang = r * 40.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec3 p = vec3(position.x * dir.x, h * height, position.x * dir.y);
  // wind: big slow gusts rolling across the field
  float gust = sin(wp.x * 0.08 + uTime * 1.3) * 0.5 + sin(wp.y * 0.06 + wp.x * 0.03 + uTime * 0.9) * 0.5;
  float bend = h * h * (0.25 + 0.35 * (gust * 0.5 + 0.5));
  p.x += bend * 0.9;
  p.z += bend * 0.3 * sin(uTime * 2.0 + r * 6.0);
  vec3 world = vec3(wp.x, meadowHeight(wp), wp.y) + p;
  // fade out at the edge of the tile so the wrap is invisible
  float edge = smoothstep(${(TILE / 2).toFixed(1)}, ${(TILE / 2 - 8).toFixed(1)}, length(local));
  world.y -= (1.0 - edge) * 1.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const grassFrag = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uTip;
uniform vec3 uSun;
varying float vH;
varying float vRand;
void main() {
  vec3 c = mix(uBase, uTip, vH);
  c = mix(c, uSun, vH * vH * 0.35);
  c *= 0.85 + vRand * 0.3;
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

const groundVert = /* glsl */ `
uniform vec3 uCenter;
varying vec2 vWp;
#include <fog_pars_vertex>
${meadowHeightGLSL}
void main() {
  vec3 p = position + vec3(uCenter.x, 0.0, uCenter.z);
  p.y = meadowHeight(p.xz) - 0.02;
  vWp = p.xz;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const groundFrag = /* glsl */ `
uniform vec3 uBase;
varying vec2 vWp;
#include <fog_pars_fragment>
void main() {
  float n = sin(vWp.x * 0.3) * cos(vWp.y * 0.27) * 0.5 + 0.5;
  gl_FragColor = vec4(uBase * (0.75 + n * 0.2), 1.0);
  #include <fog_fragment>
}`;

export class Freedom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 1200);
  private sky = new Sky();
  private uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBase: { value: new THREE.Color('#4f7a36') },
    uTip: { value: new THREE.Color('#c9d77a') },
    uSun: { value: new THREE.Color('#ffd08a') },
  };
  private ground: THREE.Mesh;
  private rider: Rider | null = null;
  private heading = 0;
  private speed = 0;
  private phase = 0;
  private herd: { animal: Animal; grazing: boolean }[] = [];
  private flowers: THREE.InstancedMesh;
  private t = 0;
  readonly bloom = 0.45;
  readonly exposure = 1.05;

  constructor(private input: Input) {
    const p = samplePalette(3.35, makePalette());
    p.sunElevation = 6;
    this.sky.apply(p, Math.PI / 2); // sun straight ahead
    this.scene.add(this.sky.mesh, this.camera);
    this.scene.fog = new THREE.Fog(p.skyHorizon, 40, 260);

    const sun = new THREE.DirectionalLight(p.sun, 2.6);
    sun.position.copy(this.sky.sunDir).multiplyScalar(100);
    this.scene.add(sun, new THREE.HemisphereLight(p.hemiSky, '#5a6a3a', 0.9));

    const fogUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    const groundMat = new THREE.ShaderMaterial({
      vertexShader: groundVert,
      fragmentShader: groundFrag,
      fog: true,
      uniforms: { ...fogUniforms, uCenter: this.uniforms.uCenter, uBase: this.uniforms.uBase },
    });
    const groundGeo = new THREE.PlaneGeometry(700, 700, 140, 140);
    groundGeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);

    // grass blades, one instanced draw
    const blade = new THREE.BufferGeometry();
    const seg = 4;
    const verts: number[] = [];
    for (let i = 0; i < seg; i++) {
      const y0 = i / seg, y1 = (i + 1) / seg;
      const w0 = 0.035 * (1 - y0), w1 = 0.035 * (1 - y1);
      verts.push(-w0, y0, 0, w0, y0, 0, -w1, y1, 0, w0, y0, 0, w1, y1, 0, -w1, y1, 0);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const count = 90000;
    const offsets = new Float32Array(count * 3);
    const rand = mulberry32(5);
    for (let i = 0; i < count; i++) offsets.set([rand() * TILE, rand() * TILE, rand()], i * 3);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.setAttribute('position', blade.getAttribute('position'));
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.instanceCount = count;
    const grassMat = new THREE.ShaderMaterial({
      vertexShader: grassVert,
      fragmentShader: grassFrag,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: { ...fogUniforms, ...this.uniforms },
    });
    // fog_fragment needs the depth varying; feed it from the grass vertex shader too
    grassMat.vertexShader = grassMat.vertexShader
      .replace('varying float vH;', '#include <fog_pars_vertex>\nvarying float vH;')
      .replace(
        'gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);',
        'vec4 mvPosition = viewMatrix * vec4(world, 1.0);\n  gl_Position = projectionMatrix * mvPosition;\n  #include <fog_vertex>',
      );
    grassMat.fragmentShader = '#include <fog_pars_fragment>\n' + grassMat.fragmentShader;
    const grass = new THREE.Mesh(geo, grassMat);
    grass.frustumCulled = false;
    this.scene.add(grass);

    // scattered wildflowers at fixed spots on the way
    const fgeo = new THREE.IcosahedronGeometry(0.07, 0);
    this.flowers = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 3000);
    const m = new THREE.Matrix4();
    const colors = ['#fff6e8', '#ffe07a', '#f7a9c4', '#c8b6ff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < 3000; i++) {
      const x = (rand() - 0.5) * 300, z = (rand() - 0.2) * 400;
      m.makeTranslation(x, meadowHeight(x, z) + 0.45 + rand() * 0.3, z);
      this.flowers.setMatrixAt(i, m);
      this.flowers.setColorAt(i, colors[Math.floor(rand() * colors.length)]);
    }
    this.scene.add(this.flowers);
  }

  /** Begin the ending as `animal`; previously freed animals graze nearby. */
  start(animal: AnimalId, freed: AnimalId[]) {
    this.rider?.dispose();
    this.rider = new Rider(animal);
    this.scene.add(this.rider.group);
    for (const h of this.herd) this.scene.remove(h.animal.root);
    this.herd = [];
    const rand = mulberry32(freed.length + 1);
    const company: Breed[] = [...freed.slice(-12), 'horse', 'whiteHorse', 'donkey', 'ox'];
    company.forEach((kind) => {
      const a = new Animal(kind);
      const x = (rand() - 0.5) * 70, z = 25 + rand() * 160;
      a.root.position.set(x, meadowHeight(x, z), z);
      a.root.rotation.y = rand() * Math.PI * 2;
      const grazing = rand() < 0.6;
      a.play(grazing ? 'Eating' : 'Gallop', 0);
      a.update(rand() * 3); // out of step with each other
      this.scene.add(a.root);
      this.herd.push({ animal: a, grazing });
    });
    this.heading = 0;
    this.speed = 7;
    this.t = 0;
    this.camera.position.set(0, meadowHeight(0, 0) + 1.6, 0);
  }

  update(dt: number, time: number) {
    this.t += dt;
    this.uniforms.uTime.value = time;
    // free running: steer with A/D or the mouse; the pace settles into a canter
    this.heading -= this.input.steer * dt * 0.9;
    this.speed = damp(this.speed, this.t < 6 ? 7 : 4.5, 0.5, dt);
    this.phase += dt * this.speed * 1.4;
    const cam = this.camera;
    const dir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    cam.position.addScaledVector(dir, this.speed * dt);
    cam.position.y = meadowHeight(cam.position.x, cam.position.z) + (this.rider?.eyeHeight ?? 2) + Math.abs(Math.sin(this.phase)) * 0.09;
    const look = cam.position.clone().add(dir).add(new THREE.Vector3(0, 0.02, 0));
    cam.up.set(Math.sin(this.phase * 0.5) * 0.015 - this.input.steer * 0.04, 1, 0);
    cam.lookAt(look);

    this.uniforms.uCenter.value.set(cam.position.x, 0, cam.position.z);
    this.sky.update(time, cam.position);

    if (this.rider) {
      this.rider.place(cam.position, Math.atan2(-dir.x, -dir.z));
      this.rider.update(dt, 1, true, this.phase);
    }
    for (const h of this.herd) {
      const a = h.animal;
      if (!h.grazing) {
        // the clip gallops in place; the model faces +z
        a.root.translateZ(dt * 4.2);
        a.root.rotation.y += dt * 0.05;
      }
      a.root.position.y = meadowHeight(a.root.position.x, a.root.position.z);
      a.update(dt);
    }
  }
}
