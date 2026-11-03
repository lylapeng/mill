import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AnimalId } from '../config';
import { platform } from '../platform';
import type { Mask } from '../ui-api';

// The animals are Quaternius models (CC0, see AGENTS.md), trimmed to four clips:
// Idle, Walk, Gallop, Eating. Each instance gets its own skeleton and mixer.
// Models face +z; they are scaled so the top of the ears sits at HEIGHT metres.

export type Breed = AnimalId | 'whiteHorse';
export type Clip = 'Idle' | 'Walk' | 'Gallop' | 'Eating';

const FILES: Record<Breed, string> = {
  ox: 'models/ox.glb',
  horse: 'models/horse.glb',
  whiteHorse: 'models/horse-white.glb',
  donkey: 'models/donkey.glb',
  // ships in the Xiaohongshu and WeChat packages, not the web one
  stag: 'models/stag.glb',
};
/** what every version loads; an entry point asks for more */
const BASE_BREEDS: Breed[] = ['ox', 'horse', 'whiteHorse', 'donkey'];
// a real gap between them, so the yard looks different from each back: the donkey is
// a head shorter than the ox, the horse a head taller. The stag's is to its antler tips.
const HEIGHT: Record<Breed, number> = { ox: 1.65, horse: 2.05, whiteHorse: 2.05, donkey: 1.2, stag: 2.1 };
/** the ox model is a black bull; ours is a yellow-brown working ox */
const RECOLOUR: Partial<Record<Breed, Record<string, string>>> = {
  ox: { Main: '#7a4a2a', Main_Light: '#b58a5e', Muzzle: '#c9ab8a' },
};

interface Template {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  scale: number;
}
const templates = new Map<Breed, Template>();

export async function loadModels(extra: Breed[] = []) {
  const loader = new GLTFLoader();
  await Promise.all(
    [...BASE_BREEDS, ...extra].map(async (breed) => {
      const gltf = await loader.parseAsync(await platform.readFile(FILES[breed]), '');
      const recolour = RECOLOUR[breed];
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (recolour?.[m.name]) m.color.set(recolour[m.name]);
          // the models are flat-coloured; keep them matte like the rest of the yard
          if ('roughness' in m) m.roughness = 0.85;
          if ('metalness' in m) m.metalness = 0;
        }
      });
      const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      templates.set(breed, { scene: gltf.scene, clips: gltf.animations, scale: HEIGHT[breed] / size.y });
    }),
  );
}

export const hasModel = (breed: Breed) => templates.has(breed);

/** One animal: its own skeleton, its own animation mixer. */
export class Animal {
  /** position and turn this; the model inside is scaled and faces +z */
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;

  constructor(readonly breed: Breed) {
    const t = templates.get(breed);
    if (!t) throw new Error(`model not loaded: ${breed}`);
    this.model = cloneSkinned(t.scene);
    this.model.scale.setScalar(t.scale);
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of t.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  play(name: Clip, fade = 0.35) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
  }

  /** Playback speed of the current clip. */
  set pace(v: number) {
    if (this.current) this.current.timeScale = v;
  }

  /** Jump to `time` seconds into the current clip (for still poses). */
  seek(time: number) {
    this.mixer.setTime(time);
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  bone(name: string) {
    return this.model.getObjectByName(name) ?? null;
  }

  /** Replace every material, e.g. for silhouettes or the mirage. */
  setMaterial(mat: THREE.Material) {
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = mat;
    });
  }

  set castShadow(v: boolean) {
    this.model.traverse((o) => (o.castShadow = v));
  }
}

/**
 * Where the poll (the Head bone) sits relative to the camera, per animal. The models
 * keep their true sizes, so at similar offsets the horse's head and neck fill much more
 * of the view than the donkey's; the horse also sits a little closer to its head.
 */
const RIDE: Record<AnimalId, THREE.Vector3> = {
  horse: new THREE.Vector3(0, -0.44, -0.82),
  donkey: new THREE.Vector3(0, -0.4, -1.15),
  ox: new THREE.Vector3(0, -0.72, -1.25),
  stag: new THREE.Vector3(0, -0.7, -1.3),
};

/**
 * Your own body in first person. It follows the camera's position but keeps its
 * own heading, so turning to look at the mill turns your eyes, not your whole body.
 */
export class Rider {
  readonly group = new THREE.Group();
  readonly animal: Animal;
  /** camera height above the ground that puts the hooves on it */
  readonly eyeHeight: number;
  /** pivots the body around the poll, so a step sways the back and shoulders but not the view */
  private sway = new THREE.Group();
  private swayAmount = 0;
  /** `applied` is the offset added last frame, undone before the mixer runs (clips may not touch the ears) */
  private ears: { bone: THREE.Object3D; twitch: number; applied: number }[] = [];
  private earTimer = 2;

  constructor(kind: AnimalId) {
    this.animal = new Animal(kind);
    this.animal.play('Idle');
    this.animal.update(0);
    // put the Head bone at RIDE[kind] in the group's space (group faces -z, like the camera)
    this.animal.root.rotation.y = Math.PI;
    this.sway.add(this.animal.root);
    this.group.add(this.sway);
    this.group.updateMatrixWorld(true);
    const head = this.animal.bone('Head');
    const at = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.5, -1);
    const ride = RIDE[kind];
    const feet = new THREE.Box3().setFromObject(this.animal.model).min.y;
    this.eyeHeight = at.y - feet - ride.y;
    this.sway.position.copy(ride);
    this.animal.root.position.copy(at).negate();
    // GLTFLoader strips the dots from node names: Ear1.L → Ear1L (the ox has no ear bones)
    for (const side of ['L', 'R']) {
      const bone = this.animal.bone(`Ear1${side}`);
      if (bone) this.ears.push({ bone, twitch: 0, applied: 0 });
    }
  }

  /** Follow the camera; `heading` is the body's yaw (radians, same convention as Object3D.rotation.y). */
  place(cameraPosition: THREE.Vector3, heading: number) {
    this.group.position.copy(cameraPosition);
    this.group.rotation.y = heading;
  }

  /** `speed01` 0 stands, 1 walks briskly; `gallop` for running; `phase` is the gait (one step per π). */
  update(dt: number, speed01: number, gallop = false, phase = 0) {
    const a = this.animal;
    if (gallop) {
      a.play('Gallop', 0.25);
      a.pace = 1.1;
    } else if (speed01 > 0.08) {
      a.play('Walk');
      a.pace = 0.6 + speed01 * 0.9;
    } else {
      a.play('Idle', 0.6);
      a.pace = 1;
    }
    for (const e of this.ears) e.bone.rotateX(-e.applied);
    a.update(dt);

    // the back rolls from side to side with each step and the head dips a little
    this.swayAmount = THREE.MathUtils.damp(this.swayAmount, gallop ? 1.6 : speed01, 4, dt);
    const k = this.swayAmount;
    this.sway.rotation.z = Math.sin(phase) * 0.045 * k;
    this.sway.rotation.x = (Math.sin(phase * 2) * 0.03 - 0.01) * k;
    this.sway.rotation.y = Math.sin(phase) * 0.025 * k;

    // now and then an ear flicks back, on top of whatever the clip is doing
    this.earTimer -= dt;
    if (this.earTimer <= 0 && this.ears.length) {
      this.earTimer = 1.5 + Math.random() * 4;
      this.ears[Math.floor(Math.random() * this.ears.length)].twitch = 1;
    }
    for (const e of this.ears) {
      e.twitch = Math.max(0, e.twitch - dt * 3);
      e.applied = Math.sin(e.twitch * Math.PI) * 0.6;
      e.bone.rotateX(e.applied);
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

/**
 * Side-on silhouettes of the animals, mid-stride, as white masks.
 * All share one scale, so the donkey stands smaller than the horse. Drawn with the
 * game's own renderer into a render target (the mini game can't open a second context).
 */
export function silhouettes(renderer: THREE.WebGLRenderer, kinds: AnimalId[]): Partial<Record<AnimalId, Mask>> {
  // twice the size it is shown at, so scaling down smooths the edges
  const w = 960, h = 600;
  const target = new THREE.WebGLRenderTarget(w, h);
  const scene = new THREE.Scene();
  const ink = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  // 3.5 m across, feet on the bottom edge; tall enough for the horse's ears (HEIGHT.horse)
  const span = 3.5, tall = (span * h) / w;
  const camera = new THREE.OrthographicCamera(-span / 2, span / 2, tall - 0.06, -0.06, 0.1, 20);
  camera.position.set(0, 0, 10);
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  const pixels = new Uint8Array(w * h * 4);
  const out: Partial<Record<AnimalId, Mask>> = {};
  for (const kind of kinds) {
    const a = new Animal(kind);
    a.setMaterial(ink);
    a.play('Walk');
    // the donkey turns a little toward us, or its two long ears line up into one and it reads
    // as a goat; a later frame of its walk keeps the head level
    const pose = kind === 'donkey' ? { t: 0.6, turn: 0.35 } : { t: 0.35, turn: 0 };
    a.seek(pose.t);
    a.root.rotation.y = Math.PI / 2 - pose.turn; // face right
    scene.add(a.root);
    a.root.updateMatrixWorld(true);
    a.model.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
    });
    const box = new THREE.Box3().setFromObject(a.root, true);
    a.root.position.x = -(box.min.x + box.max.x) / 2;
    a.root.position.y = -box.min.y;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    // GL rows run bottom-up
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    out[kind] = { width: w, height: h, data };
    scene.remove(a.root);
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, clearAlpha);
  ink.dispose();
  target.dispose();
  return out;
}
