import { patchCanvas } from './polyfill';
import * as THREE from 'three';
import { App } from '../app';
import { CanvasUi } from '../canvas-ui/ui';
import { Overlay } from '../canvas-ui/overlay';
import { Input } from '../input';
import { setPlatform, type Platform } from '../platform';
import { loadModels } from '../world/models';

// The WeChat mini game: one on-screen canvas (WebGL2), the UI painted on a second one,
// touch input, wx storage and files. Everything ships in the package; nothing is fetched.

const platform: Platform = {
  load: (key) => {
    const v = wx.getStorageSync(key);
    return typeof v === 'string' && v !== '' ? v : null;
  },
  store: (key, value) => (value === null ? wx.removeStorageSync(key) : wx.setStorageSync(key, value)),
  now: () => Date.now() / 1000,
  audioContext: () => wx.createWebAudioContext?.() ?? null,
  readFile: (path) =>
    new Promise((resolve, reject) =>
      wx.getFileSystemManager().readFile({
        filePath: path,
        success: (res) => resolve(res.data),
        fail: (err) => reject(new Error(`${path}: ${err.errMsg}`)),
      }),
    ),
  // phones: render the 3D at most 1.5×, a smaller shadow map, a thinner meadow
  quality: { maxPixelRatio: 1.5, shadowMapSize: 1024, meadowGrass: 40000 },
};
setPlatform(platform);

const info = wx.getWindowInfo?.() ?? wx.getSystemInfoSync();
const w = info.windowWidth, h = info.windowHeight;
const safe = info.safeArea
  ? { top: info.safeArea.top, left: info.safeArea.left, right: w - info.safeArea.right, bottom: h - info.safeArea.bottom }
  : { top: 0, left: 0, right: 0, bottom: 0 };
// the menu button (··· ◎) floats at the top right; keep the cards below it
const menu = wx.getMenuButtonBoundingClientRect?.();

// the first canvas created is the screen
const screen = wx.createCanvas();
patchCanvas(screen);
const gl = screen.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });

if (!gl) {
  // three.js needs WebGL2; on iOS that takes the high-performance mode (see game.json)
  const ctx = screen.getContext('2d')!;
  screen.width = w * info.pixelRatio;
  screen.height = h * info.pixelRatio;
  ctx.scale(info.pixelRatio, info.pixelRatio);
  ctx.fillStyle = '#1c1814';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(251, 246, 236, 0.7)';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('这台手机暂时跑不动这片院子', w / 2, h / 2 - 12);
  ctx.fillText('请更新微信后再试', w / 2, h / 2 + 14);
} else start(gl);

function start(gl: WebGL2RenderingContext) {
  const renderer = new THREE.WebGLRenderer({ canvas: screen, context: gl, antialias: true });
  // loadFont returns the family name ("Noto Serif SC"); quoted, or names with spaces
  // may not take in a canvas font string
  const loaded = {
    serif: wx.loadFont('fonts/noto-serif-sc.ttf'),
    title: wx.loadFont('fonts/mashanzheng-lamo.ttf'),
  };
  const fonts = {
    serif: loaded.serif ? `"${loaded.serif}"` : 'serif',
    title: loaded.title ? `"${loaded.title}"` : 'serif',
  };
  const uiCanvas = wx.createCanvas();
  const ui = new CanvasUi(uiCanvas, () => wx.createCanvas(), fonts);
  const uiPr = Math.min(info.pixelRatio, 2);
  ui.resize(w, h, uiPr, safe, menu ? menu.bottom : 0);
  const overlay = new Overlay(uiCanvas);
  const input = new Input();
  let app: App | null = null;

  renderer.setPixelRatio(Math.min(info.pixelRatio, platform.quality.maxPixelRatio));
  renderer.setSize(w, h, false);

  const touches = new Set<number>();
  wx.onTouchStart((e) => {
    for (const t of e.changedTouches) {
      try {
        if (ui.tap(t.clientX, t.clientY)) continue;
        touches.add(t.identifier);
        input.pointerDown(t.identifier, t.clientX / w);
      } catch (err) {
        report(err);
      }
    }
  });
  wx.onTouchMove((e) => {
    for (const t of e.changedTouches) if (touches.has(t.identifier)) input.pointerMove(t.identifier, t.clientX / w);
  });
  const end = (e: WechatMinigame.TouchEvent) => {
    for (const t of e.changedTouches) {
      touches.delete(t.identifier);
      input.pointerUp(t.identifier);
    }
  };
  wx.onTouchEnd(end);
  wx.onTouchCancel(end);
  wx.onHide(() => {
    input.releaseAll();
    app?.suspend();
  });
  // the audio context is suspended while the game is in the background
  wx.onShow(() => app?.sound.start());
  wx.setKeepScreenOn?.({ keepScreenOn: true });

  // Until the game has been on real phones for a while, errors are shown on screen
  // (once each) so they can be read off the phone; the frame loop carries on regardless.
  const reported = new Set<string>();
  const report = (e: unknown) => {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(e);
    if (reported.has(msg)) return;
    reported.add(msg);
    ui.toast(`出错了：${msg.slice(0, 120)}`, 12);
  };
  wx.onError?.((res) => report(res.message));

  // a font that didn't take falls back silently; say so while we're still testing on phones
  // (Latin letters differ in width between the serif and the system font, CJK doesn't)
  const probe = uiCanvas.getContext('2d')!;
  const width = (family: string) => {
    probe.font = `20px ${family}`;
    return probe.measureText('Lv 1234 abcdefg').width;
  };
  if (!loaded.serif || Math.abs(width(fonts.serif) - width('sans-serif')) < 0.5)
    report(`正文字体没生效（loadFont 返回 ${loaded.serif}）`);
  if (!loaded.title) report('标题字体没加载');

  let last = Date.now();
  const loop = () => {
    requestAnimationFrame(loop);
    const now = Date.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      if (app) app.frame(dt);
      else renderer.clear();
    } catch (e) {
      report(e);
    }
    overlay.render(renderer, ui.draw(dt));
  };
  requestAnimationFrame(loop);

  loadModels().then(
    () => {
      app = new App(renderer, ui, input);
      app.sound.onFail = report;
      app.resize(w, h, Math.min(info.pixelRatio, platform.quality.maxPixelRatio));
      app.showTitle();
      ui.loaded();
      // the browser simulator (tools/minigame/sim.html?debug) pokes at the game through this
      if (GameGlobal.__millDebug) GameGlobal.__mill = app;
    },
    (err) => {
      ui.loaded();
      report(err);
    },
  );
}
