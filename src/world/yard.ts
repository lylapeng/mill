import * as THREE from 'three';
import { Land } from './land';
import { Mill } from './mill';
import { Mirage } from './mirage';
import { Particles } from './particles';
import { makePalette, samplePalette, sceneLevelToT, type Palette } from './palette';
import { Sky } from './sky';
import { platform } from '../platform';
import { damp } from '../util';
import { winter } from '../season';
import { addSnow, snowUniforms } from './snow';

// The mill yard: sky, light, land, mill, particles and the mirage, kept in one scene.

const SUN_AZIMUTH = 2.4;

export class Yard {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
  readonly sky = new Sky();
  readonly land = new Land();
  readonly mill = new Mill();
  readonly mirage = new Mirage();
  readonly particles = new Particles();
  readonly palette: Palette = makePalette();
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  private fog = new THREE.Fog('#ffffff', 30, 200);
  private t = 0;
  private targetT = 0;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envDirty = true;
  private envCooldown = 0;

  /** `environment` false skips the sky-lit environment map (it needs float render targets) */
  constructor(
    renderer: THREE.WebGLRenderer,
    private environment = true,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.fog = this.fog;
    this.scene.add(this.sky.mesh, this.land.group, this.mill.group, this.mirage.group, this.particles.group);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.camera);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(platform.quality.shadowMapSize);
    const s = this.sun.shadow.camera;
    s.left = -22;
    s.right = 22;
    s.top = 22;
    s.bottom = -22;
    s.near = 1;
    s.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = platform.quality.shadowRadius ?? 1;

    // the environment map is rendered from a copy of the sky only
    const envSky = new THREE.Mesh(this.sky.mesh.geometry, this.sky.material);
    this.envScene.add(envSky);

    // Christmas: snow on the mill's stones, beams and roofs, not on the trodden flagstones,
    // the flour or anything that glows
    if (winter()) {
      const seen = new Set<THREE.Material>();
      this.mill.group.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!(m instanceof THREE.MeshStandardMaterial) || seen.has(m)) return;
        seen.add(m);
        if (m.metalness > 0.5 || m.emissive.getHex() !== 0 || m.color.getHexString() === 'f6f1e6' || o instanceof THREE.InstancedMesh) return;
        addSnow(m);
      });
    }
  }

  /** Bloom strength and exposure follow the palette; main.ts reads them. */
  get bloom() {
    return this.palette.bloom;
  }
  get exposure() {
    return this.palette.exposure;
  }

  setSceneLevel(level: number, instant = false) {
    this.targetT = sceneLevelToT(level);
    this.land.setLevel(level, instant);
    if (instant) {
      this.t = this.targetT;
      this.applyPalette();
    }
  }

  setMillLevel(level: number, instant = false) {
    this.mill.setLevel(level, instant);
  }

  private applyPalette() {
    const p = samplePalette(this.t, this.palette);
    this.sky.apply(p, SUN_AZIMUTH);
    this.fog.color.copy(p.skyHorizon);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.land.applyPalette(p);
    this.particles.applyPalette(p);
    snowUniforms.uSnow.value = p.snowCover;
    snowUniforms.uSnowColor.value.copy(p.snow);
    this.mirage.setHaze(p.skyHorizon);
    this.envDirty = true;
  }

  private refreshEnvironment() {
    const prev = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 1000);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.35;
    prev?.dispose();
    this.envDirty = false;
  }

  update(dt: number, time: number) {
    if (Math.abs(this.t - this.targetT) > 0.0005) {
      this.t = damp(this.t, this.targetT, 1.2, dt);
      this.applyPalette();
    }
    this.envCooldown -= dt;
    if (this.environment && this.envDirty && this.envCooldown <= 0) {
      this.refreshEnvironment();
      this.envCooldown = 0.6;
    }
    // keep the shadow frustum centred on the yard, light coming from the sun
    this.sun.position.copy(this.sky.sunDir).multiplyScalar(70);
    this.sun.target.position.set(0, 0, 0);

    this.sky.update(time, this.camera.position);
    this.land.update(dt, time);
    this.particles.update(time);
    this.mirage.update(dt, time);
  }

  setPixelRatio(r: number) {
    this.particles.setPixelRatio(r);
  }
}
