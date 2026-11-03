import './compat';
import * as THREE from 'three';
import { App } from '../app';
import { CanvasUi } from '../canvas-ui/ui';
import { Input } from '../input';
import { setPlatform } from '../platform';
import { loadPrefs, savePrefs } from '../save';
import { loadModels } from '../world/models';
import { Follow } from './follow';
import { createPlatform, miniTool, type WindowInfo } from './platform';

// The Xiaohongshu mini tool: the WeChat version's portrait canvas UI drawn over the 3D
// on one page canvas, pointer input, container storage. Classic script, no module.

// WebGL drawing buffer budget for phone WebViews: about 2 million pixels, 1 million when slow
const PIXEL_BUDGET = 2e6;
const SLOW_PIXEL_BUDGET = 1e6;

function message(lines: string[]) {
  const el = document.createElement('div');
  el.className = 'message';
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    el.append(p);
  }
  document.body.append(el);
}

/** safe-area insets: the container's numbers where it has them, else CSS env() */
function cssInsets() {
  const probe = document.createElement('div');
  probe.className = 'safe-probe';
  document.body.append(probe);
  const s = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const insets = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return insets;
}

async function windowInfo(): Promise<WindowInfo | null> {
  try {
    return (await miniTool()?.getWindowInfo?.()) ?? null;
  } catch {
    return null;
  }
}

/** wait for the bundled fonts so the first canvas frame isn't in the fallback face */
function fontsReady() {
  const fonts = document.fonts;
  if (!fonts) return Promise.resolve();
  const load = Promise.all([fonts.load('20px "Mill Serif"', '拉磨'), fonts.load('20px "Mill Title"', '拉磨')]);
  return Promise.race([load, new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
}

async function boot() {
  const canvas = document.createElement('canvas');
  document.body.prepend(canvas);
  // three.js r163+ needs WebGL2
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) {
    canvas.remove();
    message(['这台手机暂时跑不动这片院子', '请更新小红书后再试']);
    return;
  }

  const [platform, info] = await Promise.all([createPlatform(), windowInfo(), fontsReady()]);
  setPlatform(platform);

  const w = window.innerWidth, h = window.innerHeight;
  const css = cssInsets();
  const safe = info?.safeArea
    ? { top: info.safeArea.top, left: info.safeArea.left, right: info.windowWidth - info.safeArea.right, bottom: info.windowHeight - info.safeArea.bottom }
    : css;
  // the container's buttons float at the top right; keep the cards below them
  const buttons = info?.menuButtons ? [info.menuButtons.me, info.menuButtons.share].filter((b): b is NonNullable<typeof b> => !!b) : null;
  const reserved = buttons ? Math.max(0, ...buttons.map((b) => b.bottom)) : safe.top + 48;

  // some WebViews under-report devicePixelRatio; the container knows the real one
  const dpr = Math.max(window.devicePixelRatio || 1, info?.pixelRatio || 0);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
  const pixelRatio = (budget: number) => Math.min(dpr, platform.quality.maxPixelRatio, Math.sqrt(budget / (w * h)));
  let pr = pixelRatio(PIXEL_BUDGET);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);

  const fonts = { serif: '"Mill Serif", serif', title: '"Mill Title", "Mill Serif", serif' };
  // unlike the mini game, a page can stack canvases: the UI sits on top at the screen's full
  // resolution (sharp text) instead of being drawn into the 3D frame; taps fall through to it
  const uiCanvas = document.createElement('canvas');
  uiCanvas.className = 'ui-layer';
  uiCanvas.style.width = `${w}px`;
  uiCanvas.style.height = `${h}px`;
  document.body.append(uiCanvas);
  const ui = new CanvasUi(uiCanvas, () => document.createElement('canvas'), fonts, true);
  ui.resize(w, h, Math.min(dpr, 3), safe, reserved);
  ui.hand = loadPrefs().hand;
  ui.onHand = (hand) => savePrefs({ ...loadPrefs(), hand });
  const follow = new Follow();
  const input = new Input();
  let app: App | null = null;

  // a pointer that lands on a button belongs to the UI; the rest walk, look and steer
  const walking = new Set<number>();
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (ui.tap(e.clientX, e.clientY)) return;
    walking.add(e.pointerId);
    // one-handed, the hoof buttons decide which foot; elsewhere a finger only looks
    input.pointerDown(e.pointerId, e.clientX / w, ui.hand === 'both' ? undefined : ui.stepSide(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (walking.has(e.pointerId)) input.pointerMove(e.pointerId, e.clientX / w);
  });
  const up = (e: PointerEvent) => {
    walking.delete(e.pointerId);
    input.pointerUp(e.pointerId);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  let paused = false;
  let last = performance.now();
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) {
      walking.clear();
      input.releaseAll();
      app?.suspend();
    } else {
      last = performance.now();
      app?.sound.start();
    }
  });

  // if the GPU is lost, say so and stop; no endless rebuilding
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    message(['画面中断了', '请关掉后重新打开']);
  });

  // slow phone: after a few seconds of frames over ~45 ms, drop to the low pixel budget, once.
  // The first seconds don't count: shaders compile and the environment map renders then.
  let slowTime = 0, sampleTime = 0, warmup = 6, degraded = false;
  const watch = (dt: number) => {
    if (degraded || !app) return;
    if (warmup > 0) {
      warmup -= dt;
      return;
    }
    sampleTime += dt;
    if (dt > 0.045) slowTime += dt;
    if (sampleTime < 4) return;
    if (slowTime / sampleTime > 0.5) {
      degraded = true;
      pr = Math.min(1, pixelRatio(SLOW_PIXEL_BUDGET));
      app.resize(w, h, pr);
    }
    slowTime = sampleTime = 0;
  };

  const loop = (now: number) => {
    if (lost) return;
    requestAnimationFrame(loop);
    if (paused) return;
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.05, elapsed);
    last = now;
    watch(elapsed);
    follow.tick(dt);
    if (app) app.frame(dt);
    else renderer.clear();
    ui.draw(dt);
  };
  requestAnimationFrame(loop);

  try {
    // the follow check gets a moment, not a say: the game starts without it
    const quietly = Promise.race([follow.init(), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
    await Promise.all([loadModels(['stag']), quietly]);
  } catch (err) {
    console.error(err);
    ui.loaded();
    ui.toast('院子没能搭起来，请重新打开', 12);
    return;
  }
  app = new App(renderer, ui, input);
  app.roster = () => follow.roster();
  // twenty seconds in, on the title: the stag steps in without waiting for the next visit
  follow.onOffer = () => app?.refreshTitle();
  app.resize(w, h, pr);
  app.showTitle();
  ui.loaded();
  // screenshots and checks in a desktop browser drive the game through this (?debug)
  if (location.search.indexOf('debug') >= 0) (window as unknown as { __mill: App }).__mill = app;
}

void boot();
