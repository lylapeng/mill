import * as THREE from 'three';
import './style.css';
import { App } from './app';
import { Input, attachDom } from './input';
import { loadRun, newRun, saveRun, type RunState } from './save';
import { Ui } from './ui';
import { platform } from './platform';
import { Animal, loadModels } from './world/models';

// The web page: DOM UI, keyboard and mouse.

// the animals are the only files to fetch; wait for them before building the world
const loading = document.createElement('div');
loading.className = 'loading';
loading.textContent = '一圈，又一圈';
document.body.append(loading);
await loadModels();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
document.body.prepend(renderer.domElement);

const input = new Input();
attachDom(input, renderer.domElement);
const ui = new Ui(document.body);
const app = new App(renderer, ui, input);

function resize() {
  app.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio, platform.quality.maxPixelRatio));
}
window.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) app.suspend();
});

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((now) => {
  timer.update(now);
  app.frame(Math.min(0.05, timer.getDelta()));
});

app.showTitle();
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
    if (q.has('play')) app.startRun(run);
    else app.showTitle();
  }
  // THREE and Animal are here for staging shots (icons, share images) from the console
  (window as unknown as { __mill: unknown }).__mill = {
    yard: app.yard, get game() { return app.game; }, get freedom() { return app.freedom; },
    startRun: (run: RunState) => app.startRun(run), loadRun, THREE, Animal,
    toFreedom: () => app.game && app.reachFreedom(app.game.run),
  };
}
