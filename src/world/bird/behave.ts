// What the bird is doing. Timing follows how tits actually move: the body holds still
// while the head snaps between looks; hops are quick with a beat of stillness between;
// flight is bursts of very fast wingbeats with short closed-wing dips.
import { Pose, perch } from './rig';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type Act = 'idle' | 'hop' | 'peck' | 'fly';

export class Behave {
  pose = perch();
  x = 0; y = 0; z = 0; yaw = Math.PI / 2; dir = 1;
  act: Act = 'idle';
  t = 0; dur = 3;
  nextLook = 0; look = { y: 0, x: 0, z: 0 }; head = { y: 0, x: 0, z: 0 };
  flick = 0; wingPhase = 0;
  auto = true;
  queue: Act[] = [];
  home = { x: 0, y: 0, z: 0 };
  hopFrom = 0; hops = 0;
  range = 1;

  start(a: Act) {
    this.act = a; this.t = 0;
    if (a === 'idle') this.dur = rnd(1.8, 3.4);
    if (a === 'hop') { this.dur = 0.34; this.hopFrom = this.x; }
    if (a === 'peck') this.dur = 1.3;
    if (a === 'fly') { this.dur = 5.6; this.home.x = this.x; this.home.z = this.z; }
  }

  update(dt: number) {
    this.t += dt;
    const p = this.pose, base = perch();
    Object.assign(p, base);
    const u = this.t / this.dur;

    // head saccades, only while not flying
    this.nextLook -= dt;
    if (this.nextLook <= 0) {
      this.nextLook = rnd(0.22, 0.95);
      this.look = { y: rnd(-1.15, 1.15), x: rnd(-0.28, 0.22), z: rnd(-0.32, 0.32) };
    }
    const k = 1 - Math.exp(-dt * 38); // nearly instant, as a bird's head is
    this.head.y += (this.look.y - this.head.y) * k;
    this.head.x += (this.look.x - this.head.x) * k;
    this.head.z += (this.look.z - this.head.z) * k;
    p.headY = this.head.y; p.headX += this.head.x; p.headZ = this.head.z;

    // breathing is fast on a bird this small
    p.lift += Math.sin(this.t * 13) * 0.003;

    // tail flicks
    this.flick = Math.max(0, this.flick - dt * 7);
    if (Math.random() < dt * 0.55) this.flick = 1;
    p.tailX -= Math.sin(this.flick * Math.PI) * 0.34;

    if (this.act === 'hop') this.hop(p, u);
    if (this.act === 'peck') this.peck(p, u);
    if (this.act === 'fly') this.fly(p, u, dt);

    if (u >= 1) this.next();
  }

  hop(p: Pose, u: number) {
    // crouch, spring, land
    const air = ease((u - 0.2) / 0.62);
    const crouch = Math.sin(Math.min(1, u / 0.2) * Math.PI) * 0.06 + Math.sin(Math.max(0, (u - 0.8) / 0.2) * Math.PI) * 0.07;
    const arc = u > 0.2 && u < 0.82 ? Math.sin(((u - 0.2) / 0.62) * Math.PI) : 0;
    this.x = this.hopFrom + air * 0.62 * this.dir;
    this.y = this.home.y + arc * 0.3;
    p.lift -= crouch;
    p.pitch += 0.28 * arc;
    p.neckX -= 0.12 * arc;
    p.headY *= 0.25;
    p.open = 0.06 * arc;
    p.tailX += 0.2 * arc;
    for (const f of p.feet) { f.y += arc * 0.16; f.z -= arc * 0.09; }
  }

  peck(p: Pose, u: number) {
    const dip = Math.sin(Math.min(1, u * 1.15) * Math.PI);
    p.pitch += 0.72 * dip;
    p.lift -= 0.04 * dip;
    p.neckX += 0.3 * dip;
    p.headX += 0.5 * dip + Math.max(0, Math.sin(this.t * 34)) * 0.28 * dip;
    p.headY *= 1 - dip;
    p.headZ *= 1 - dip;
    p.tailX -= 0.34 * dip;
  }

  fly(p: Pose, u: number, dt: number) {
    // take off, loop around the camera side, flare and land back on the perch
    const leave = ease(u / 0.1), land = ease((u - 0.86) / 0.14);
    const a = u * Math.PI * 2;
    const r = 2.9 * this.range * Math.sin(u * Math.PI);
    const dipBob = Math.sin(u * Math.PI * 9) * 0.22 * Math.sin(u * Math.PI);
    const px = this.home.x + Math.sin(a) * r * 1.35;
    const pz = this.home.z + (1 - Math.cos(a)) * 0.5 * r * 0.75;
    const py = this.home.y + Math.sin(u * Math.PI) * 1.3 * Math.min(1, this.range * 1.3) + dipBob * this.range;
    const dx = px - this.x, dz = pz - this.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      const want = Math.atan2(dx, dz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    if (land > 0) {
      const want = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += d * land * Math.min(1, dt * 14);
    }
    this.x = px; this.y = py; this.z = pz;

    const air = leave * (1 - land);
    const burst = Math.sin(u * Math.PI * 9) > -0.62; // short closed-wing dips between bursts
    this.wingPhase += dt * 2 * Math.PI * (burst || land > 0 ? 15 : 0);
    const s = Math.sin(this.wingPhase), c = Math.cos(this.wingPhase);
    const flapOn = burst || land > 0 || leave < 1;

    p.lift = lerp(p.lift, 0.4, air);
    p.pitch = lerp(p.pitch, -0.55, air) - land * 0.2; // the body is built upright: flat out it looks like a box
    p.neckX = lerp(p.neckX, 0.42, air);
    p.headX = lerp(p.headX, 0.13, air);
    p.headY *= 1 - air; p.headZ *= 1 - air;
    p.tailX = lerp(p.tailX, 0.3, air) + land * 0.25;
    p.fan = lerp(p.fan, 0.1, air) + land * 0.16;
    p.tuck = air;
    p.open = flapOn ? lerp(0.62, 1, 0.5 - 0.5 * c) * Math.max(leave, land) : 0.08;
    p.flap = flapOn ? 0.2 + 0.92 * s : 0;
    p.bend = flapOn ? -0.5 * Math.max(0, c) - 0.1 : 0;
    p.sweep = flapOn ? 0.18 * c : 0;
    p.feet.forEach((f, i) => {
      const legsDown = land;
      f.y = lerp(0.2, f.y, Math.max(1 - air, legsDown));
      f.z = lerp(-0.16, f.z, Math.max(1 - air, legsDown));
      f.x = lerp(f.x * 0.75, f.x, Math.max(1 - air, legsDown));
      void i;
    });
  }

  next() {
    if (!this.auto) { this.t = 0; return; }
    if (this.act === 'fly') { this.x = this.home.x; this.y = this.home.y; this.z = this.home.z; this.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    const q = this.queue.shift();
    if (q) return this.start(q);
    const nearEnd = Math.abs(this.x - this.home.x) > 1.4;
    if (nearEnd) { this.dir = -this.dir; this.yaw = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    const r = Math.random();
    if (this.act === 'hop') this.start(Math.random() < 0.5 ? 'hop' : 'idle');
    else if (r < 0.4) this.start('hop');
    else if (r < 0.7) this.start('peck');
    else if (r < 0.85) this.start('fly');
    else this.start('idle');
  }
}
