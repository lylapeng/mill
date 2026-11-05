import * as THREE from 'three';
import {
  ANIMALS, ECONOMY, LEVELS_PER_TIER, MAX_LEVEL, MILL_TIERS, MIRAGE, RHYTHM, SCENE_TIERS, TEXT, WALK_RADIUS,
  BIRD, birdStage, freedomChance, millCost, sceneCost, tierOf, yieldPerLap, type AnimalDef,
} from './config';
import type { Sound } from './audio';
import type { Input } from './input';
import { platform } from './platform';
import { saveRun, type RunState } from './save';
import type { GameUi, UpgradeInfo } from './ui-api';
import { BirdVisit } from './world/bird/visit';
import { Rider } from './world/models';
import type { Yard } from './world/yard';
import { clamp, damp, fitFov, smoothstep } from './util';

// The mill loop: step in rhythm, walk the circle, grind flour, upgrade,
// and every so often run toward the grassland on the horizon.

type MirageState = 'locked' | 'waiting' | 'showing';

interface Dash {
  t: number;
  success: boolean;
  dir: THREE.Vector3;
  from: THREE.Vector3;
  tightened: boolean;
}

const DASH_OUT = 1.25;
const DASH_BACK = 3.3;
const DASH_FREE = 2.8;
const ROPE = 2.6;
/** resting head turn: the edge of the mill is just in view */
const HEAD_YAW = 0.3;
/** looking straight at the mill */
const MILL_YAW = 1.3;
/** as far round as the head goes to watch a bird on the beam */
const BIRD_YAW = 1.9;

export class MillGame {
  readonly animal: AnimalDef;
  private rider: Rider;
  readonly bird: BirdVisit;
  private speed = 0;
  private combo = 0;
  private lastSide: 'L' | 'R' | null = null;
  private lastStepAt = 0;
  private lastInterval = 0;
  private walkPhase = 0;
  private bob = 0;
  private shake = 0;
  /** head turn toward the mill (radians, positive = inward) */
  private yaw = HEAD_YAW;
  private glance = 0;
  /** flour ground since the last lap closed */
  private lapFlour = 0;

  private mirageState: MirageState = 'locked';
  private mirageTimer = 0;
  private mirageT = 0;
  private promptShown = false;
  private dash: Dash | null = null;
  private saveTimer = 5;
  private done = false;

  private tmpLook = new THREE.Vector3();
  private tmpPos = new THREE.Vector3();

  constructor(
    private yard: Yard,
    private ui: GameUi,
    private sound: Sound,
    private input: Input,
    readonly run: RunState,
    private onFreedom: (run: RunState) => void,
  ) {
    this.animal = ANIMALS[run.animal];
    this.rider = new Rider(run.animal);
    yard.scene.add(this.rider.group);
    this.bird = new BirdVisit(this.sound);
    yard.scene.add(this.bird.group);
    yard.setMillLevel(run.millLevel, true);
    yard.setSceneLevel(run.sceneLevel, true);
    if (run.sceneLevel >= MIRAGE.unlockSceneLevel) this.unlockMirage();
    yard.mirage.opacity = 0;
    this.refreshHud();
    this.placeCamera(0);
  }

  dispose() {
    this.rider.dispose();
    this.yard.scene.remove(this.bird.group);
    this.yard.mirage.opacity = 0;
    this.ui.prompt(false);
    this.ui.mirageHint(0, 0);
  }

  // ── input ────────────────────────────────────────────────────────────

  step(side: 'L' | 'R') {
    if (this.dash || this.done) return;
    const now = platform.now();
    const interval = now - this.lastStepAt;
    if (side === this.lastSide && interval < 0.6) {
      this.speed *= RHYTHM.stumbleKeep;
      this.combo = 0;
      this.lastInterval = 0;
      this.lastStepAt = now;
      this.shake = 0.5;
      this.sound.stumble();
      this.ui.stumble();
      return;
    }
    if (interval > RHYTHM.maxInterval) this.combo = 0;
    else if (this.lastInterval > 0 && Math.abs(interval - this.lastInterval) / this.lastInterval < RHYTHM.tolerance)
      this.combo = Math.min(RHYTHM.maxCombo, this.combo + 1);
    else this.combo = Math.max(0, this.combo - 2);
    this.lastInterval = interval < RHYTHM.maxInterval ? interval : 0;
    this.lastStepAt = now;
    this.lastSide = side;

    const power = this.animal.stepPower * (1 + this.combo * RHYTHM.bonusPerCombo);
    this.speed = Math.min(this.maxSpeed(), this.speed + power);
    this.bob = 1;
    this.sound.step(this.animal.id === 'ox' ? 1 : this.animal.id === 'horse' ? 0.75 : 0.6);
    this.ui.step(side, this.combo / RHYTHM.maxCombo);
  }

  dashIntent() {
    if (this.dash || this.done || !this.promptShown) return;
    const success = Math.random() < freedomChance(this.run.sceneLevel, this.run.mirageFails, this.animal);
    const cam = this.yard.camera;
    const dir = this.yard.mirage.group.position.clone().sub(cam.position).setY(0).normalize();
    this.dash = { t: 0, success, dir, from: cam.position.clone(), tightened: false };
    this.ui.prompt(false);
    this.ui.mirageHint(0, 0);
    this.promptShown = false;
    this.sound.step(1.2);
  }

  upgrade(kind: 'mill' | 'scene') {
    if (this.done) return;
    const level = kind === 'mill' ? this.run.millLevel : this.run.sceneLevel;
    if (level >= MAX_LEVEL) return;
    const cost = kind === 'mill' ? millCost(level) : sceneCost(level);
    if (this.run.flour < cost) {
      this.ui.denied(kind);
      return;
    }
    this.run.flour -= cost;
    const next = level + 1;
    const tierUp = tierOf(next) !== tierOf(level);
    if (kind === 'mill') {
      this.run.millLevel = next;
      this.yard.setMillLevel(next);
      this.glance = tierUp ? 3.2 : 1.6;
      if (tierUp) this.ui.tier('mill', tierOf(next), MILL_TIERS[tierOf(next)], TEXT.millTierLines[tierOf(next)]);
    } else {
      this.run.sceneLevel = next;
      this.yard.setSceneLevel(next);
      if (tierUp) this.ui.tier('scene', tierOf(next), SCENE_TIERS[tierOf(next)], TEXT.sceneTierLines[tierOf(next)]);
      if (next === MIRAGE.unlockSceneLevel) {
        this.unlockMirage();
        this.ui.toast(TEXT.mirageUnlock);
      }
    }
    this.sound.upgrade(tierUp);
    this.refreshHud();
    saveRun(this.run);
  }

  // ── simulation ───────────────────────────────────────────────────────

  private maxSpeed() {
    return (
      this.animal.maxSpeed *
      (1 + ECONOMY.speedPerMillLevel * (this.run.millLevel - 1)) *
      (1 + this.combo * 0.01)
    );
  }

  private unlockMirage() {
    if (this.mirageState !== 'locked') return;
    this.mirageState = 'waiting';
    this.mirageTimer = MIRAGE.firstDelay;
  }

  private mirageInterval() {
    const base = MIRAGE.baseInterval - MIRAGE.intervalPerSceneLevel * (this.run.sceneLevel - MIRAGE.unlockSceneLevel);
    return Math.max(MIRAGE.minInterval, base) * (0.8 + Math.random() * 0.4);
  }

  private clarity() {
    return 0.12 + 0.88 * clamp(this.run.mirageFails / MIRAGE.guaranteeAfterFails);
  }

  update(dt: number, time: number) {
    if (this.done) return;
    this.run.playTime += dt;

    if (this.dash) this.updateDash(dt);
    else this.walk(dt);
    if (this.done) return;

    this.updateMirage(dt);
    this.rider.update(dt, clamp(this.speed / this.animal.maxSpeed), this.dash !== null, this.walkPhase);
    this.yard.mill.update(dt, time, this.run.angle);
    this.bird.update(
      dt, this.yard.mill, birdStage(this.run.sceneLevel, this.run.millLevel), this.run.angle, this.yaw,
      this.dash !== null || this.mirageState === 'showing',
    );
    this.sound.ambience(
      clamp(this.speed / this.animal.maxSpeed), Math.min(4, (this.run.sceneLevel - 1) / 4),
      this.run.sceneLevel >= BIRD.nearSceneLevel, dt,
    );

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 5;
      saveRun(this.run);
    }
  }

  private walk(dt: number) {
    const tier = tierOf(this.run.millLevel);
    const assistTier = Math.max(0, tier - 2); // steam and star tiers help push
    const floor = this.maxSpeed() * ECONOMY.autoAssistPerTier * assistTier * 2;
    this.speed *= Math.exp(-this.animal.drag * dt);
    if (this.speed < floor) this.speed = damp(this.speed, floor, 1.5, dt);

    const dTheta = (this.speed * dt) / WALK_RADIUS;
    const before = Math.floor(this.run.angle / (Math.PI * 2));
    this.run.angle += dTheta;
    const after = Math.floor(this.run.angle / (Math.PI * 2));
    const gained = (yieldPerLap(this.run.millLevel) * this.animal.strength * dTheta) / (Math.PI * 2);
    this.run.flour += gained;
    this.lapFlour += gained;
    if (after > before) {
      this.run.laps += after - before;
      this.ui.lapGain(this.lapFlour);
      this.lapFlour = 0;
    }

    // the cadence fades if you stop
    if (platform.now() - this.lastStepAt > RHYTHM.maxInterval * 1.5 && this.combo > 0) {
      this.combo = 0;
      this.ui.cadence(0);
    }

    this.walkPhase += this.speed * dt * 3.4;
    this.bob = damp(this.bob, 0, 6, dt);
    this.placeCamera(dt);
    this.refreshHud();
  }

  private placeCamera(dt: number) {
    const cam = this.yard.camera;
    const a = this.run.angle;
    const moving = clamp(this.speed / 0.6);
    const bobY = Math.sin(this.walkPhase * 2) * 0.03 * moving - this.bob * 0.025;
    this.shake = damp(this.shake, 0, 5, dt);
    cam.position.set(
      Math.cos(a) * WALK_RADIUS,
      this.rider.eyeHeight + bobY,
      Math.sin(a) * WALK_RADIUS,
    );
    // forward along the circle; the mouse (or a fresh upgrade) turns the head toward the mill
    this.glance = Math.max(0, this.glance - dt);
    const lx = this.input.lookX;
    const mouseYaw = Math.abs(lx) < 0.3 ? 0 : (lx - Math.sign(lx) * 0.3) / 0.7;
    let target = this.glance > 0 ? MILL_YAW : HEAD_YAW + mouseYaw * (mouseYaw > 0 ? MILL_YAW - HEAD_YAW : 0.8);
    // a visiting bird draws the eye, unless the player is already looking somewhere
    const watching = this.glance <= 0 && mouseYaw === 0 && this.bird.here;
    if (watching) {
      const dx = this.bird.at.x - cam.position.x, dz = this.bird.at.z - cam.position.z;
      const ahead = -Math.sin(a) * dx + Math.cos(a) * dz, inward = -Math.cos(a) * dx - Math.sin(a) * dz;
      target = clamp(Math.atan2(inward, ahead), HEAD_YAW, BIRD_YAW);
    }
    this.yaw = damp(this.yaw, target, this.glance > 0 || watching ? 2.5 : 4, dt);
    this.tmpLook
      .set(-Math.sin(a), 0, Math.cos(a))
      .multiplyScalar(Math.cos(this.yaw))
      .addScaledVector(this.tmpPos.set(-Math.cos(a), 0, -Math.sin(a)), Math.sin(this.yaw));
    this.tmpLook.y = -0.06;
    this.tmpLook.add(cam.position);
    cam.up.set(Math.sin(this.walkPhase) * 0.012 * moving + (Math.random() - 0.5) * this.shake * 0.02, 1, 0);
    cam.lookAt(this.tmpLook);
    // the body follows the head only part of the way; beyond that it's just the eyes turning
    const body = clamp(this.yaw, -0.5, 0.45);
    this.rider.place(cam.position, Math.atan2(Math.sin(a) * Math.cos(body) + Math.cos(a) * Math.sin(body), -Math.cos(a) * Math.cos(body) + Math.sin(a) * Math.sin(body)));
    const fov = fitFov(70, cam.aspect);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 3, dt);
      cam.updateProjectionMatrix();
    }
  }

  private updateMirage(dt: number) {
    const m = this.yard.mirage;
    if (this.mirageState === 'waiting') {
      this.mirageTimer -= dt;
      if (this.mirageTimer <= 0 && !this.dash) {
        this.mirageState = 'showing';
        this.mirageT = 0;
        // appear somewhere in the half of the circle you're about to face
        const ahead = this.run.angle + Math.PI / 2 + (0.3 + Math.random() * 2.2);
        m.place(ahead, MIRAGE.distance);
        m.clarity = this.clarity();
        this.run.mirageSeen++;
        this.sound.mirageAppear();
      }
      return;
    }
    if (this.mirageState !== 'showing' || this.dash) return;

    this.mirageT += dt;
    const { fadeIn, hold, fadeOut } = MIRAGE;
    const t = this.mirageT;
    const env = smoothstep(0, fadeIn, t) * (1 - smoothstep(fadeIn + hold, fadeIn + hold + fadeOut, t));
    m.opacity = env;

    const cam = this.yard.camera;
    cam.getWorldDirection(this.tmpLook).setY(0).normalize();
    this.tmpPos.copy(m.group.position).sub(cam.position).setY(0).normalize();
    const facing = this.tmpLook.dot(this.tmpPos) > Math.cos(MIRAGE.promptCone);
    const show = facing && env > 0.45;
    // off to one side: which side is the sign of (toMirage · camera right)
    const side = -this.tmpLook.z * this.tmpPos.x + this.tmpLook.x * this.tmpPos.z > 0 ? 1 : -1;
    this.ui.mirageHint(facing ? 0 : side, env);
    if (show !== this.promptShown) {
      this.promptShown = show;
      this.ui.prompt(show);
    }

    if (t > fadeIn + hold + fadeOut) {
      this.ui.mirageHint(0, 0);
      this.mirageState = 'waiting';
      this.mirageTimer = this.mirageInterval();
      m.opacity = 0;
    }
  }

  private updateDash(dt: number) {
    const d = this.dash!;
    d.t += dt;
    const cam = this.yard.camera;
    const m = this.yard.mirage;
    const a = this.run.angle;
    const pathPos = this.tmpPos.set(Math.cos(a) * WALK_RADIUS, this.rider.eyeHeight, Math.sin(a) * WALK_RADIUS);
    let out: number;
    let lookMirage: number;
    let fov: number;

    if (d.t < DASH_OUT) {
      const k = d.t / DASH_OUT;
      out = ROPE * (1 - Math.pow(1 - k, 2));
      lookMirage = smoothstep(0, 0.35, d.t);
      fov = 70 + 10 * k;
      this.walkPhase += dt * 9;
    } else if (!d.success) {
      if (!d.tightened) {
        d.tightened = true;
        this.shake = 1;
        this.sound.ropeTight();
      }
      const k = clamp((d.t - DASH_OUT) / (DASH_BACK - DASH_OUT));
      out = ROPE * (1 - smoothstep(0.15, 1, k)) + Math.sin(k * 30) * 0.06 * (1 - k);
      lookMirage = 1 - smoothstep(0.3, 1, k);
      fov = 80 - 10 * smoothstep(0, 0.6, k);
      m.opacity = Math.max(0, m.opacity - dt * 1.1);
      m.clarity = Math.max(0, this.clarity() - k);
      if (d.t >= DASH_BACK) return this.endFailedDash();
    } else {
      if (!d.tightened) {
        d.tightened = true;
        this.sound.snap();
        this.ui.toast(TEXT.snap, 2.2);
        this.ui.flash(true, DASH_FREE - DASH_OUT);
      }
      const k = (d.t - DASH_OUT) / (DASH_FREE - DASH_OUT);
      out = ROPE + k * k * 14;
      lookMirage = 1;
      fov = 80 + 18 * k * k;
      m.opacity = Math.min(1, m.opacity + dt);
      m.clarity = Math.min(1, this.clarity() + k);
      this.walkPhase += dt * 12;
      if (d.t >= DASH_FREE) return this.free();
    }

    const tangent = new THREE.Vector3(-Math.sin(a), -0.06, Math.cos(a));
    const look = tangent.lerp(new THREE.Vector3(d.dir.x, 0.02, d.dir.z), lookMirage);
    cam.position.copy(pathPos).addScaledVector(d.dir, out);
    cam.position.y += Math.sin(this.walkPhase * 2) * 0.05;
    cam.up.set((Math.random() - 0.5) * this.shake * 0.04, 1, 0);
    this.shake = damp(this.shake, 0, 4, dt);
    this.rider.place(cam.position, Math.atan2(-look.x, -look.z));
    cam.lookAt(look.add(cam.position));
    // the dash zooms out relative to the resting view, whatever the screen shape
    cam.fov = Math.min(120, (fov * fitFov(70, cam.aspect)) / 70);
    cam.updateProjectionMatrix();
  }

  private endFailedDash() {
    this.dash = null;
    this.speed = 0;
    this.combo = 0;
    this.run.mirageFails++;
    this.mirageState = 'waiting';
    this.mirageTimer = this.mirageInterval();
    this.yard.mirage.opacity = 0;
    const lines = TEXT.failLines;
    this.ui.toast(lines[(this.run.mirageFails - 1) % lines.length], 3.5);
    if (this.run.mirageFails % 5 === 0) this.ui.toast(TEXT.pityHint, 3);
    saveRun(this.run);
  }

  private free() {
    this.done = true;
    this.dash = null;
    this.onFreedom(this.run);
  }

  private refreshHud() {
    const r = this.run;
    const info = (level: number, cost: (l: number) => number, tiers: string[]): UpgradeInfo => {
      const maxed = level >= MAX_LEVEL;
      const c = maxed ? null : cost(level);
      const opens = !maxed && tierOf(level + 1) !== tierOf(level);
      return {
        name: tiers[tierOf(level)],
        level,
        step: (level - 1) % LEVELS_PER_TIER,
        cost: c,
        progress: c === null ? 1 : clamp(r.flour / c),
        nextTier: opens ? tiers[tierOf(level + 1)] : null,
      };
    };
    this.ui.setStats(r.flour, r.laps);
    this.ui.setUpgrades({
      mill: info(r.millLevel, millCost, MILL_TIERS),
      scene: info(r.sceneLevel, sceneCost, SCENE_TIERS),
    });
  }
}
