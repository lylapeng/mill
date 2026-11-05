import * as THREE from 'three';
import { WALK_RADIUS, type BirdStage } from '../../config';
import type { Mill } from '../mill';
import { Behave, type Act } from './behave';
import { COATS, SPECIES, type Species } from './coats';
import { Flock, type Pass } from './flock';
import { apply } from './rig';
import { buildSongbird, type Songbird } from './songbird';

// The birds come closer as the place improves (BIRD in config.ts). First a small flock far
// off, later the same flock over the yard, and in the end one bird comes down onto the beam,
// stays a moment, hops twice and leaves. That one arrives from ahead and leaves the same way,
// so it crosses the view on both legs.

const FAR: Pass = { distance: 36, height: 12, time: 12, scale: 2.5 };
const NEAR: Pass = { distance: 10, height: 4.2, time: 5, scale: 1.2 };
const LAND_AT = 1.5; // along the beam, out from the axle
const HOP = 1.5; // the model's hop is short at this size
const FACE = 0.7; // turned off the beam, so you see it from the side and not head on
const FLY_IN = 3.4;
const FLY_OUT = 3;
const STAY: [Act, number][] = [['idle', 2.6], ['hop', 0.34], ['idle', 1.8], ['hop', 0.34], ['idle', 2.4]];
/** after an upgrade brings them closer, so the player connects the two */
const SOON: [number, number] = [8, 18];
const NEXT_WAIT: [number, number] = [70, 150];
const PAINT_GAP = 1.5;

const rnd = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

type State = 'away' | 'in' | 'perched' | 'out';

const RANK: Record<BirdStage, number> = { none: 0, far: 1, near: 2, perch: 3 };

// built once, the first time any run needs it, and reused
let model: Songbird | null = null;

export class BirdVisit {
  readonly group = new THREE.Group();
  private flock = new Flock();
  private bird: Songbird | null = null;
  private stage: BirdStage = 'none';
  private species: Species = 'bluetit';
  private size = COATS.bluetit.size;
  private forced: Species | null = null;
  private brain = new Behave();
  private state: State = 'away';
  private wait = 0;
  private clock = 0;
  private step = 0;
  private yaw = 0;
  private from = new THREE.Vector3();
  private ahead = new THREE.Vector3();
  private beam = new THREE.Vector3();
  private last = new THREE.Vector3();
  /** the first frame draws it under the ground, so the shader isn't compiled mid-visit */
  private warm = false;
  /** painting a coat takes a phone a few frames, so they're spread out */
  private toPaint: Species[] = [];
  private paintWait = PAINT_GAP;

  constructor() {
    this.group.add(this.flock.group);
    this.brain.auto = false;
  }

  /** one has come down to the mill, and it's worth turning the head for */
  get here() {
    return this.state !== 'away';
  }

  /** where the visitor is */
  get at() {
    return this.bird!.group.position;
  }

  /** send them now, whatever the timer says */
  come(species?: Species) {
    this.wait = 0;
    this.forced = species ?? null;
  }

  /** happens on the upgrade, not as a bird is arriving; the other coats follow, one at a time */
  private prepare() {
    const b = (this.bird = model ??= buildSongbird());
    this.toPaint = [...SPECIES];
    b.mesh.frustumCulled = false; // the bounds are the rest pose, not the open wings
    b.group.position.set(0, -5, 0);
    b.group.visible = true;
    this.group.add(b.group);
    this.warm = true;
    apply(b, this.brain.pose);
  }

  private dress() {
    const others = SPECIES.filter((s) => s !== this.species);
    this.species = this.forced ?? others[Math.floor(Math.random() * others.length)];
    this.forced = null;
    this.size = COATS[this.species].size;
    this.bird!.wear(this.species);
    this.bird!.group.scale.setScalar(this.size); // the model is about a unit long
  }

  /** `yaw`: how far the head is turned. `busy`: something else needs the player's eyes, so don't come and don't linger */
  update(dt: number, mill: Mill, stage: BirdStage, angle: number, yaw: number, busy: boolean) {
    if (RANK[stage] > RANK[this.stage]) {
      this.wait = Math.min(this.wait || Infinity, rnd(SOON));
      if (stage === 'perch' && !this.bird) this.prepare();
    }
    this.stage = stage;
    if (this.toPaint.length && (this.paintWait -= dt) <= 0) {
      this.bird!.skin(this.toPaint.pop()!);
      this.paintWait = PAINT_GAP;
    }
    this.flock.update(dt, Math.cos(angle) * WALK_RADIUS, Math.sin(angle) * WALK_RADIUS, angle + yaw);

    if (this.state === 'away') {
      if (this.bird) {
        if (this.warm) this.warm = false;
        else this.bird.group.visible = false;
      }
      if (stage === 'none' || this.flock.flying) return;
      this.wait -= dt;
      if (this.wait > 0 || busy) return;
      if (stage !== 'perch') {
        this.flock.start(stage === 'far' ? FAR : NEAR);
        this.wait = rnd(NEXT_WAIT);
        return;
      }
      this.state = 'in';
      this.clock = 0;
      this.dress();
      this.brain.start('fly');
      this.brain.dur = FLY_IN * 2; // the second half of the take-off-to-landing arc
      this.brain.t = FLY_IN;
      this.bird!.group.visible = true;
      this.pointAhead(angle);
      this.last.copy(this.ahead);
      this.yaw = Math.atan2(-this.ahead.x, -this.ahead.z);
    }
    const bird = this.bird!;
    this.clock += dt;
    mill.beamTop(LAND_AT, this.beam);
    const perchYaw = mill.beamYaw + Math.PI / 2 + FACE;
    const pos = bird.group.position;

    if (this.state === 'in') {
      const u = Math.min(1, this.clock / FLY_IN);
      this.pointAhead(angle);
      pos.lerpVectors(this.ahead, this.beam, 1 - (1 - u) ** 2.2);
      pos.y += Math.sin(u * Math.PI * 3) * 0.2 * (1 - u);
      this.steer(dt, u > 0.75 ? perchYaw : null);
      if (u >= 1) this.settle(perchYaw);
    } else if (this.state === 'perched') {
      if (this.clock >= STAY[this.step][1] || (busy && this.brain.act === 'idle')) {
        this.step = busy ? STAY.length : this.step + 1;
        this.clock = 0;
        if (this.step >= STAY.length) this.takeOff();
        else {
          this.brain.start(STAY[this.step][0]);
          this.brain.dur = STAY[this.step][1];
        }
      }
      if (this.state === 'perched') {
        mill.beamTop(LAND_AT + this.brain.x * this.size * HOP, pos);
        pos.y += this.brain.y * this.size;
        this.yaw = perchYaw;
      }
    }
    if (this.state === 'out') {
      const u = Math.min(1, this.clock / FLY_OUT);
      this.pointAhead(angle);
      pos.lerpVectors(this.from, this.ahead, u ** 2.2);
      pos.y += Math.sin(u * Math.PI * 3) * 0.2 * u;
      this.steer(dt, null);
      if (u >= 1) {
        this.state = 'away';
        this.wait = rnd(NEXT_WAIT);
        bird.group.visible = false;
        return;
      }
    }
    this.last.copy(pos);
    bird.group.rotation.y = this.yaw;
    this.brain.update(dt);
    apply(bird, this.brain.pose);
  }

  /** far ahead and up, just inside where the player is looking */
  private pointAhead(angle: number) {
    const a = angle + 0.3; // the resting head turn
    const r = WALK_RADIUS;
    this.ahead.set(Math.cos(angle) * r - Math.sin(a) * 16, 5, Math.sin(angle) * r + Math.cos(a) * 16);
  }

  /** face the way it's going, or `want` when it's flaring to land */
  private steer(dt: number, want: number | null) {
    const pos = this.bird!.group.position;
    const dx = pos.x - this.last.x, dz = pos.z - this.last.z;
    const to = want ?? (Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : this.yaw);
    this.yaw += turn(this.yaw, to) * Math.min(1, dt * 10);
  }

  private settle(yaw: number) {
    this.state = 'perched';
    this.clock = 0;
    this.step = 0;
    this.yaw = yaw;
    const b = this.brain;
    b.x = b.y = b.z = 0;
    b.home = { x: 0, y: 0, z: 0 };
    b.start('idle');
    b.dur = STAY[0][1];
  }

  private takeOff() {
    this.state = 'out';
    this.clock = 0;
    this.from.copy(this.group.position);
    this.brain.start('fly');
    this.brain.dur = FLY_OUT * 2;
  }
}
