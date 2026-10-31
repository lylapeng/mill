import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';
import { Sound } from './audio';
import { Freedom } from './freedom';
import { MillGame } from './game';
import { Input } from './input';
import { loadMeta, loadRun, newRun, saveMeta, saveRun, type RunState } from './save';
import { Ui, formatJin } from './ui';
import { tierOf } from './config';
import { Yard } from './world/yard';
import { loadModels, silhouettes } from './world/models';

// the animals are the only files to fetch; wait for them before building the world
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = '一圈，又一圈';
document.body.append(loading);
await loadModels();
const portraits = silhouettes();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const input = new Input(renderer.domElement);
const sound = new Sound();
const ui = new Ui(document.body);
const yard = new Yard(renderer);
let freedom: Freedom | null = null;
let game: MillGame | null = null;
let mode: 'title' | 'mill' | 'freedom' = 'title';
let meta = loadMeta();

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(yard.scene, yard.camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.7, 0.82);
// ease into the threshold instead of switching on at it: a hard threshold traces the
// sky's brightness contour, which around a low sun drew a bell-shaped halo
(bloom.highPassUniforms as Record<string, THREE.IUniform<number>>).smoothWidth.value = 0.35;
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  for (const cam of [yard.camera, freedom?.camera]) {
    if (!cam) continue;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  yard.setPixelRatio(pr);
}
window.addEventListener('resize', resize);
resize();

function showTitle() {
  mode = 'title';
  renderPass.scene = yard.scene;
  renderPass.camera = yard.camera;
  const run = loadRun();
  yard.setSceneLevel(run?.sceneLevel ?? 1, true);
  yard.setMillLevel(run?.millLevel ?? 1, true);
  // bigger mills need a wider shot to stay clear of the title
  titleRadius = 8 + tierOf(run?.millLevel ?? 1) * 1.1;
  ui.showHud(false);
  ui.showTitle({
    portraits,
    current: run?.animal ?? null,
    freed: meta.freed,
    onPick: (a) => startRun(newRun(a)),
    onContinue: () => run && startRun(run),
  });
}

function startRun(run: RunState) {
  sound.start();
  ui.hideTitle();
  ui.showHud(true);
  game?.dispose();
  game = new MillGame(yard, ui, sound, input, run, reachFreedom);
  mode = 'mill';
  saveRun(run);
}

function reachFreedom(run: RunState) {
  meta = { freed: [...meta.freed, run.animal] };
  saveMeta(meta);
  saveRun(null);
  // the screen is white now; swap worlds underneath
  freedom ??= new Freedom(input);
  freedom.start(run.animal, meta.freed.slice(0, -1));
  resize();
  game?.dispose();
  game = null;
  mode = 'freedom';
  renderPass.scene = freedom.scene;
  renderPass.camera = freedom.camera;
  ui.showHud(false);
  ui.flash(false, 3);
  sound.freedomTheme();
  ui.showEnding({
    animal: run.animal,
    stats: [
      { value: String(run.laps), label: '圈' },
      { value: formatJin(run.flour), label: '斤面粉' },
      { value: String(run.mirageSeen), label: '次望见草原' },
      { value: String(Math.max(1, Math.round(run.playTime / 60))), label: '分钟' },
    ],
    onAgain: () => {
      ui.flash(true, 1.2);
      setTimeout(() => {
        ui.hideEnding();
        showTitle();
        ui.flash(false, 1.6);
      }, 1300);
    },
  });
}

input.on((intent) => {
  if (intent === 'mute') {
    sound.start();
    ui.setMuted(sound.toggleMute());
    return;
  }
  if (mode !== 'mill' || !game) return;
  if (intent === 'stepLeft') game.step('L');
  else if (intent === 'stepRight') game.step('R');
  else if (intent === 'dash') game.dashIntent();
  else if (intent === 'upgradeMill') game.upgrade('mill');
  else if (intent === 'upgradeScene') game.upgrade('scene');
});
ui.onUpgrade = (kind) => game?.upgrade(kind);
ui.onMute = () => {
  sound.start();
  ui.setMuted(sound.toggleMute());
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game) saveRun(game.run);
});

const timer = new THREE.Timer();
timer.connect(document);
let time = 0;
let titleAngle = 0;
let titleRadius = 8;

renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(0.05, timer.getDelta());
  time += dt;

  if (mode === 'freedom' && freedom) {
    freedom.update(dt, time);
    bloom.strength = freedom.bloom;
    renderer.toneMappingExposure = freedom.exposure;
  } else {
    if (mode === 'title') {
      // slow orbit around the empty mill, framed in the clear band between title and cards
      titleAngle += dt * 0.04;
      yard.camera.position.set(Math.cos(titleAngle) * titleRadius, 2.9, Math.sin(titleAngle) * titleRadius);
      yard.camera.up.set(0, 1, 0);
      yard.camera.lookAt(0, 0.45 + (titleRadius - 8) * 0.12, 0);
      yard.mill.update(dt, time, time * 0.15);
    } else {
      game?.update(dt, time);
    }
    yard.update(dt, time);
    bloom.strength = yard.bloom;
    renderer.toneMappingExposure = yard.exposure;
  }
  composer.render();
});

showTitle();
loading.classList.add('done');
setTimeout(() => loading.remove(), 1200);

// Dev-only shortcuts for checking visuals: ?scene=13&mill=17&flour=1e4&fails=10
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const num = (k: string) => (q.has(k) ? Number(q.get(k)) : null);
  if (q.has('scene') || q.has('mill') || q.has('flour') || q.has('fails')) {
    const run = loadRun() ?? newRun((q.get('animal') as RunState['animal']) ?? 'donkey');
    if (q.has('animal')) run.animal = q.get('animal') as RunState['animal'];
    run.sceneLevel = num('scene') ?? run.sceneLevel;
    run.millLevel = num('mill') ?? run.millLevel;
    run.flour = num('flour') ?? run.flour;
    run.mirageFails = num('fails') ?? run.mirageFails;
    saveRun(run);
    if (q.has('play')) startRun(run);
    else showTitle();
  }
  (window as unknown as { __mill: unknown }).__mill = { yard, get game() { return game; }, startRun, loadRun };
}
