import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sound } from './audio';
import { Freedom } from './freedom';
import { MillGame } from './game';
import type { Input } from './input';
import { loadMeta, loadRun, newRun, saveMeta, saveRun, type RunState } from './save';
import { formatJin, type GameUi } from './ui-api';
import { tierOf } from './config';
import './world/flat-normals';
import { Yard } from './world/yard';
import { silhouettes } from './world/models';
import { fitFov } from './util';

// The game as a whole: title → mill → grassland, shared by the web page and the mini game.
// The entry points own the canvas, the UI and the frame loop; models must be loaded first.

export class App {
  readonly yard: Yard;
  readonly sound = new Sound();
  game: MillGame | null = null;
  freedom: Freedom | null = null;
  private mode: 'title' | 'mill' | 'freedom' = 'title';
  private meta = loadMeta();
  private portraits;
  /** null where float render targets are missing (some phones): no bloom, plain render */
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private time = 0;
  private titleAngle = 0;
  private titleRadius = 8;
  private size = { w: 1, h: 1, pr: 1 };

  constructor(
    private renderer: THREE.WebGLRenderer,
    private ui: GameUi,
    private input: Input,
  ) {
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.portraits = silhouettes(renderer);
    const floatTargets = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.yard = new Yard(renderer, floatTargets);

    this.renderPass = new RenderPass(this.yard.scene, this.yard.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.7, 0.82);
    // ease into the threshold instead of switching on at it: a hard threshold traces the
    // sky's brightness contour, which around a low sun drew a bell-shaped halo
    (this.bloom.highPassUniforms as Record<string, THREE.IUniform<number>>).smoothWidth.value = 0.35;
    if (floatTargets) {
      this.composer = new EffectComposer(renderer);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    input.on((intent) => {
      if (intent === 'mute') return this.toggleMute();
      const game = this.game;
      if (this.mode !== 'mill' || !game) return;
      if (intent === 'stepLeft') game.step('L');
      else if (intent === 'stepRight') game.step('R');
      else if (intent === 'dash') game.dashIntent();
      else if (intent === 'upgradeMill') game.upgrade('mill');
      else if (intent === 'upgradeScene') game.upgrade('scene');
    });
    ui.onUpgrade = (kind) => this.game?.upgrade(kind);
    ui.onMute = () => this.toggleMute();
    ui.onDash = () => this.game?.dashIntent();
  }

  /** CSS pixels and device pixel ratio. */
  resize(w: number, h: number, pr: number) {
    this.size = { w, h, pr };
    this.renderer.setPixelRatio(pr);
    // the mini game's canvas has no CSS style to size
    this.renderer.setSize(w, h, 'style' in this.renderer.domElement);
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
    for (const cam of [this.yard.camera, this.freedom?.camera]) {
      if (!cam) continue;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    this.yard.setPixelRatio(pr);
  }

  /** Save now, e.g. because the page is being hidden. */
  suspend() {
    if (this.game) saveRun(this.game.run);
  }

  private toggleMute() {
    this.sound.start();
    this.ui.setMuted(this.sound.toggleMute());
  }

  showTitle() {
    this.mode = 'title';
    this.renderPass.scene = this.yard.scene;
    this.renderPass.camera = this.yard.camera;
    const run = loadRun();
    this.yard.setSceneLevel(run?.sceneLevel ?? 1, true);
    this.yard.setMillLevel(run?.millLevel ?? 1, true);
    // bigger mills need a wider shot to stay clear of the title
    this.titleRadius = 8 + tierOf(run?.millLevel ?? 1) * 1.1;
    this.ui.showHud(false);
    this.ui.showTitle({
      portraits: this.portraits,
      current: run?.animal ?? null,
      freed: this.meta.freed,
      onPick: (a) => this.startRun(newRun(a)),
      onContinue: () => run && this.startRun(run),
    });
  }

  startRun(run: RunState) {
    this.sound.start();
    this.ui.hideTitle();
    this.ui.showHud(true);
    this.game?.dispose();
    this.game = new MillGame(this.yard, this.ui, this.sound, this.input, run, (r) => this.reachFreedom(r));
    this.mode = 'mill';
    saveRun(run);
  }

  reachFreedom(run: RunState) {
    this.meta = { freed: [...this.meta.freed, run.animal] };
    saveMeta(this.meta);
    saveRun(null);
    // the screen is white now; swap worlds underneath
    this.freedom ??= new Freedom(this.input);
    this.freedom.start(run.animal, this.meta.freed.slice(0, -1));
    this.resize(this.size.w, this.size.h, this.size.pr);
    this.game?.dispose();
    this.game = null;
    this.mode = 'freedom';
    this.renderPass.scene = this.freedom.scene;
    this.renderPass.camera = this.freedom.camera;
    this.ui.showHud(false);
    this.ui.flash(false, 3);
    this.sound.freedomTheme();
    this.ui.showEnding({
      animal: run.animal,
      stats: [
        { value: String(run.laps), label: '圈' },
        { value: formatJin(run.flour), label: '斤面粉' },
        { value: String(run.mirageSeen), label: '次望见草原' },
        { value: String(Math.max(1, Math.round(run.playTime / 60))), label: '分钟' },
      ],
      onAgain: () => {
        this.ui.flash(true, 1.2);
        setTimeout(() => {
          this.ui.hideEnding();
          this.showTitle();
          this.ui.flash(false, 1.6);
        }, 1300);
      },
    });
  }

  /** Advance by `dt` seconds and draw. */
  frame(dt: number) {
    this.time += dt;
    const time = this.time;
    if (this.mode === 'freedom' && this.freedom) {
      this.freedom.update(dt, time);
      this.bloom.strength = this.freedom.bloom;
      this.renderer.toneMappingExposure = this.freedom.exposure;
    } else {
      const yard = this.yard;
      if (this.mode === 'title') {
        // slow orbit around the empty mill, framed in the clear band between title and cards
        const cam = yard.camera;
        this.titleAngle += dt * 0.04;
        const r = this.titleRadius * (cam.aspect < 1 ? 1.25 : 1);
        cam.position.set(Math.cos(this.titleAngle) * r, 2.9, Math.sin(this.titleAngle) * r);
        cam.up.set(0, 1, 0);
        cam.lookAt(0, 0.45 + (this.titleRadius - 8) * 0.12, 0);
        const fov = fitFov(70, cam.aspect);
        if (cam.fov !== fov) {
          cam.fov = fov;
          cam.updateProjectionMatrix();
        }
        yard.mill.update(dt, time, time * 0.15);
      } else {
        this.game?.update(dt, time);
      }
      yard.update(dt, time);
      this.bloom.strength = yard.bloom;
      this.renderer.toneMappingExposure = yard.exposure;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.renderPass.scene, this.renderPass.camera);
  }
}
