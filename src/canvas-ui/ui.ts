import { ANIMALS, LEVELS_PER_TIER, TEXT, type AnimalId } from '../config';
import { ORDINAL, formatJin, type EndingOptions, type GameUi, type Mask, type TitleOptions, type UpgradeInfo } from '../ui-api';
import { damp } from '../util';
import {
  GOLD, GOLD_SOFT, HOOF, INK, INK_2, INK_3, LINE, Painter, SPEAKER, TRACK_L, TRACK_S,
  ease, easeInOut, progress, type TextStyle,
} from './paint';

// The UI painted on a 2D canvas, for the mini game (no DOM there). Same look and
// timing as ui.ts + style.css, laid out for a phone held either way, touch only.
// Immediate mode: every redraw paints everything from state and records tap targets.

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

type Kind = 'mill' | 'scene';
type Notice = { kind: 'line'; text: string; seconds: number } | { kind: 'tier'; label: string; name: string; line: string };
interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  fn: () => void;
}

/** A value that moves linearly toward its target over `seconds`. */
class Fade {
  value = 0;
  target = 0;
  constructor(public seconds: number) {}
  set(target: number, seconds = this.seconds) {
    this.target = target;
    this.seconds = seconds;
  }
  /** Returns true while moving. */
  step(dt: number) {
    if (this.value === this.target) return false;
    const d = dt / Math.max(0.001, this.seconds);
    this.value = this.value < this.target ? Math.min(this.target, this.value + d) : Math.max(this.target, this.value - d);
    return true;
  }
}

const NEVER = -1e9;
/** at most this many redraws a second; each one is a full-screen texture upload */
const MAX_FPS = 30;

export class CanvasUi implements GameUi {
  onUpgrade: (kind: Kind) => void = () => {};
  onMute: () => void = () => {};
  onDash: () => void = () => {};

  private ctx: CanvasRenderingContext2D;
  private p: Painter;
  private w = 1;
  private h = 1;
  private pr = 1;
  private safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** space taken at the top right by the WeChat menu button */
  private reserved = 0;
  private t = 0;
  private drawnAt = NEVER;
  private dirty = true;
  private hits: Hit[] = [];

  private loading = new Fade(1.1);

  private titleOpts: TitleOptions | null = null;
  private title = new Fade(0.9);
  private picked: AnimalId | null = null;
  private pickedAt = NEVER;
  private tints = new Map<string, HTMLCanvasElement>();
  private masks = new Map<AnimalId, HTMLCanvasElement>();

  private hud = new Fade(1.4);
  private flour = 0;
  private shownFlour = -1;
  private laps = 0;
  private gain = '';
  private gainAt = NEVER;
  private upgrades: { mill: UpgradeInfo; scene: UpgradeInfo } | null = null;
  private deniedAt: Record<Kind, number> = { mill: NEVER, scene: NEVER };
  private hitAt = { L: NEVER, R: NEVER };
  private cadenceTarget = 0;
  private cadenceShown = 0;
  private shakeAt = NEVER;
  private muted = false;

  private queue: Notice[] = [];
  private notices: { item: Notice; at: number; hideAt: number }[] = [];
  private nextNoticeAt = NEVER;

  private promptFade = new Fade(0.8);
  private hintL = new Fade(1.2);
  private hintR = new Fade(1.2);
  private flashFade = new Fade(1);

  private ending: EndingOptions | null = null;
  private endingAt = NEVER;
  private endingDate = '';

  constructor(
    private canvas: HTMLCanvasElement,
    /** scratch canvases for the tinted silhouettes */
    private createCanvas: () => HTMLCanvasElement,
    fonts: { serif: string; title: string },
    /** the cover's name; the WeChat build is 拉磨的日子 (拉磨 was taken there) */
    private name = TEXT.title,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.p = new Painter(this.ctx, fonts.serif, fonts.title);
    this.loading.value = this.loading.target = 1;
  }

  /** CSS pixels, pixel ratio, safe-area insets and the height kept clear at the top right. */
  resize(w: number, h: number, pr: number, safe: Insets, reservedTopRight = 0) {
    this.w = w;
    this.h = h;
    this.pr = pr;
    this.safe = safe;
    this.reserved = reservedTopRight;
    this.canvas.width = Math.round(w * pr);
    this.canvas.height = Math.round(h * pr);
    this.dirty = true;
  }

  /** The world is ready: lift the loading screen. */
  loaded() {
    this.loading.set(0);
  }

  /** A tap at CSS pixel (x, y). Returns true if the UI took it. */
  tap(x: number, y: number) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        r.fn();
        this.dirty = true;
        return true;
      }
    }
    return false;
  }

  private get compact() {
    return Math.min(this.w, this.h) < 500;
  }
  private get portrait() {
    return this.h > this.w;
  }
  private get fsL() {
    return this.compact ? 18 : 21;
  }

  // ── GameUi ───────────────────────────────────────────────────────────

  showTitle(opts: TitleOptions) {
    this.titleOpts = opts;
    this.picked = null;
    this.title.value = this.title.target = 1;
    for (const id of Object.keys(opts.portraits) as AnimalId[]) {
      if (!this.masks.has(id)) this.masks.set(id, this.maskCanvas(opts.portraits[id]));
    }
    this.dirty = true;
  }

  hideTitle() {
    this.title.set(0);
  }

  showHud(v: boolean) {
    if (v) {
      this.hud.value = 0;
      this.shownFlour = -1;
    }
    this.hud.set(v ? 1 : 0, v ? 1.4 : 0);
    if (!v) this.hud.value = 0;
    this.dirty = true;
  }

  setStats(flour: number, laps: number) {
    this.flour = flour;
    this.laps = laps;
  }

  lapGain(amount: number) {
    if (amount <= 0) return;
    this.gain = `+${formatJin(amount)}`;
    this.gainAt = this.t;
  }

  setUpgrades(u: { mill: UpgradeInfo; scene: UpgradeInfo }) {
    const before = this.upgrades;
    this.upgrades = u;
    if (!before || before.mill.progress !== u.mill.progress || before.scene.progress !== u.scene.progress || before.mill.level !== u.mill.level || before.scene.level !== u.scene.level)
      this.dirty = true;
  }

  step(side: 'L' | 'R', cadence: number) {
    this.hitAt[side] = this.t;
    this.cadence(cadence);
  }

  cadence(v: number) {
    this.cadenceTarget = v;
    this.dirty = true;
  }

  stumble() {
    this.cadence(0);
    this.shakeAt = this.t;
    this.toast(TEXT.stumble, 1.2);
  }

  denied(kind: Kind) {
    this.deniedAt[kind] = this.t;
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.dirty = true;
  }

  toast(text: string, seconds = 4) {
    if (text) this.queue.push({ kind: 'line', text, seconds });
  }

  tier(kind: Kind, tier: number, name: string, line: string) {
    this.queue.push({ kind: 'tier', label: `${kind === 'mill' ? '磨' : '景'}　第${ORDINAL[tier]}档`, name, line });
  }

  prompt(v: boolean) {
    this.promptFade.set(v ? 1 : 0);
  }

  mirageHint(side: -1 | 0 | 1, strength: number) {
    this.hintL.set(side < 0 ? strength : 0);
    this.hintR.set(side > 0 ? strength : 0);
  }

  flash(toWhite: boolean, seconds: number) {
    this.flashFade.set(toWhite ? 1 : 0, seconds);
  }

  showEnding(opts: EndingOptions) {
    this.ending = opts;
    this.endingAt = this.t;
    const d = new Date();
    this.endingDate = `${d.getFullYear()} · ${d.getMonth() + 1} · ${d.getDate()}`;
  }

  hideEnding() {
    this.ending = null;
    this.dirty = true;
  }

  // ── frame ────────────────────────────────────────────────────────────

  /** Advance by `dt` and repaint if anything changed. Returns true if the canvas changed. */
  draw(dt: number) {
    this.t += dt;
    const t = this.t;
    let moving = false;
    for (const f of [this.loading, this.title, this.hud, this.promptFade, this.hintL, this.hintR, this.flashFade]) moving = f.step(dt) || moving;

    // flour: earning is already smooth; spending counts down instead of jumping
    if (this.shownFlour < 0 || this.flour >= this.shownFlour) this.shownFlour = this.flour;
    else {
      this.shownFlour = damp(this.shownFlour, this.flour, 6, dt);
      if (this.shownFlour - this.flour < Math.max(0.05, this.flour * 0.002)) this.shownFlour = this.flour;
    }
    if (this.cadenceShown !== this.cadenceTarget) {
      this.cadenceShown = damp(this.cadenceShown, this.cadenceTarget, 12, dt);
      if (Math.abs(this.cadenceShown - this.cadenceTarget) < 0.002) this.cadenceShown = this.cadenceTarget;
      moving = true;
    }
    this.advanceNotices();

    const recent = (at: number, dur: number) => t - at < dur;
    const animating =
      moving ||
      this.notices.length > 0 ||
      recent(this.gainAt, 1.8) ||
      recent(this.hitAt.L, 0.3) ||
      recent(this.hitAt.R, 0.3) ||
      recent(this.shakeAt, 0.35) ||
      recent(this.deniedAt.mill, 0.3) ||
      recent(this.deniedAt.scene, 0.3) ||
      recent(this.pickedAt, 0.8) ||
      // breathing and drifting things
      this.promptFade.value > 0 ||
      this.hintL.value > 0 ||
      this.hintR.value > 0 ||
      (this.ending !== null && recent(this.endingAt, 17)) ||
      (this.hud.value > 0 && this.hudText() !== this.lastHudText);
    if (!this.dirty && !animating) return false;
    if (t - this.drawnAt < 1 / MAX_FPS) return false;
    this.drawnAt = t;
    this.dirty = false;
    this.paint();
    return true;
  }

  private lastHudText = '';
  private hudText() {
    return formatJin(this.shownFlour) + '|' + this.laps;
  }

  private paint() {
    const ctx = this.ctx;
    ctx.setTransform(this.pr, 0, 0, this.pr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.hits = [];
    ctx.globalAlpha = 1;

    if (this.hud.value > 0) this.paintHud();
    if (this.notices.length) this.paintNotices();
    if (this.promptFade.value > 0) this.paintPrompt();
    if (this.titleOpts && this.title.value > 0) this.paintTitle();
    if (this.ending) this.paintEnding();
    if (this.flashFade.value > 0) {
      const v = this.flashFade.value;
      ctx.globalAlpha = this.flashFade.target > 0 ? v * v : v; // ease-in
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (this.loading.value > 0) this.paintLoading();
  }

  private hit(x: number, y: number, w: number, h: number, fn: () => void) {
    this.hits.push({ x, y, w, h, fn });
  }

  private text(s: string, x: number, y: number, style: TextStyle) {
    return this.p.text(s, x, y, { lift: true, ...style });
  }

  /** A rounded pill button centred at (cx, cy). Returns its height. */
  private pill(label: string, cx: number, cy: number, fn: (() => void) | null, color = INK, border = LINE) {
    const style = { size: 15, track: TRACK_L, color, align: 'center' as const };
    const tw = this.p.measure(label, style);
    const pw = tw + 64, ph = 42;
    this.p.panel(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2, border);
    this.text(label, cx, cy, style);
    if (fn) this.hit(cx - pw / 2 - 8, cy - ph / 2 - 8, pw + 16, ph + 16, fn);
    return ph;
  }

  // ── loading ──────────────────────────────────────────────────────────

  private paintLoading() {
    const ctx = this.ctx;
    ctx.globalAlpha = easeInOut(this.loading.value);
    ctx.fillStyle = '#1c1814';
    ctx.fillRect(0, 0, this.w, this.h);
    this.p.text('一圈，又一圈', this.w / 2, this.h / 2, { size: 15, track: TRACK_L, color: INK_3, align: 'center' });
    ctx.globalAlpha = 1;
  }

  // ── title ────────────────────────────────────────────────────────────

  private maskCanvas(m: Mask) {
    const c = this.createCanvas();
    c.width = m.width;
    c.height = m.height;
    const cx = c.getContext('2d')!;
    const img = cx.createImageData(m.width, m.height);
    img.data.set(m.data);
    cx.putImageData(img, 0, 0);
    return c;
  }

  /** The silhouette in one colour, at half the mask's size (still twice what is shown). */
  private tinted(id: AnimalId, color: string) {
    const key = id + color;
    let c = this.tints.get(key);
    if (c) return c;
    const mask = this.masks.get(id)!;
    c = this.createCanvas();
    c.width = mask.width / 2;
    c.height = mask.height / 2;
    const cx = c.getContext('2d')!;
    cx.drawImage(mask, 0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, c.width, c.height);
    this.tints.set(key, c);
    return c;
  }

  private paintTitle() {
    const { ctx, w, h, safe } = this;
    const opts = this.titleOpts!;
    const leaving = this.title.target === 0;
    ctx.globalAlpha = easeInOut(this.title.value);

    // darken top and bottom, leave the mill in the clear middle band
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(20, 16, 12, 0.42)');
    g.addColorStop(0.34, 'rgba(20, 16, 12, 0)');
    g.addColorStop(0.52, 'rgba(20, 16, 12, 0)');
    g.addColorStop(1, 'rgba(20, 16, 12, 0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // the whole title screen swallows taps, so nothing steps behind it
    if (!leaving) this.hit(0, 0, w, h, () => {});

    // top: the name and one line
    // a longer name tracks tighter and shrinks to fit the width
    const n = [...this.name].length;
    const track = n > 2 ? TRACK_S : TRACK_L;
    const fit = (w - 48 - safe.left - safe.right) / (n * (1 + track));
    const hero = Math.round(Math.min(112, fit, Math.max(n > 2 ? 0 : 56, (this.portrait ? 0.19 : 0.09) * w)));
    const top = safe.top + h * (this.portrait ? 0.1 : 0.07);
    this.text(this.name, w / 2, top + hero * 0.5, { size: hero, family: this.p.title, track, align: 'center' });
    const sub = { size: 15, track: TRACK_S, color: INK_2, align: 'center' as const };
    this.p.wrap(TEXT.subtitle, w - 40, sub).forEach((line, i) => this.text(line, w / 2, top + hero * 1.05 + 20 + i * 24, sub));

    // bottom, stacked upward: controls, detail, herd, continue
    let y = h - safe.bottom - Math.max(16, h * 0.04);
    const controls = { size: 12, track: 0.12, color: INK_3, align: 'center' as const };
    this.text(TEXT.touchControls, w / 2, y - 6, controls);
    y -= 18;

    const detailH = this.compact ? 116 : 132;
    if (this.picked) this.paintDetail(this.picked, y - detailH, opts);
    y -= detailH + 10;

    const gap = this.compact ? 6 : 22;
    const pw = Math.min(210, (w - 32 - safe.left - safe.right - gap * 2) / 3);
    const ph = pw * 0.625;
    const nameSize = this.fsL;
    const freedAny = opts.freed.length > 0;
    const herdH = ph + 8 + nameSize + (freedAny ? 18 : 0);
    const herdTop = y - herdH;
    const ids: AnimalId[] = ['ox', 'horse', 'donkey'];
    ids.forEach((id, i) => {
      const x = w / 2 + (i - 1) * (pw + gap) - pw / 2;
      const isPicked = this.picked === id;
      const dim = this.picked && !isPicked;
      ctx.save();
      ctx.globalAlpha *= dim ? 0.5 : 1;
      if (isPicked) {
        ctx.shadowColor = 'rgba(243, 215, 154, 0.45)';
        ctx.shadowBlur = 16;
      } else {
        ctx.shadowColor = 'rgba(20, 14, 8, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 1;
      }
      ctx.drawImage(this.tinted(id, isPicked ? GOLD : INK_2), x, herdTop, pw, ph);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= dim ? 0.5 : 1;
      this.text(ANIMALS[id].name, x + pw / 2, herdTop + ph + 8 + nameSize / 2, {
        size: nameSize, track: TRACK_L, color: isPicked ? GOLD : INK_2, align: 'center',
      });
      if (opts.freed.includes(id))
        this.text('曾走进草原', x + pw / 2, herdTop + ph + 8 + nameSize + 12, { size: 12, track: TRACK_S, color: GOLD, align: 'center' });
      ctx.restore();
      if (!leaving)
        this.hit(x, herdTop - 6, pw, herdH + 6, () => {
          this.picked = id;
          this.pickedAt = this.t;
        });
    });
    y = herdTop - 8;

    if (opts.current) {
      this.text('或者，换一头重新开始', w / 2, y - 10, { size: 13, track: TRACK_S, color: INK_3, align: 'center' });
      y -= 26 + 21;
      const current = opts.current;
      this.pill(`继续拉磨 · ${ANIMALS[current].name}`, w / 2, y, leaving ? null : opts.onContinue);
    }
    ctx.globalAlpha = 1;
  }

  private paintDetail(id: AnimalId, top: number, opts: TitleOptions) {
    const { ctx, w } = this;
    const a = ANIMALS[id];
    const k = ease(progress(this.t, this.pickedAt, 0.8));
    const base = ctx.globalAlpha;
    ctx.globalAlpha = base * k;
    const y0 = top + (1 - k) * 6;
    const blurb = { size: 15, track: TRACK_S, color: INK_2, align: 'center' as const };
    const lines = this.p.wrap(a.blurb, w - 40, blurb);
    lines.forEach((line, i) => this.text(line, w / 2, y0 + 10 + i * 22, blurb));
    let y = y0 + 10 + (lines.length - 1) * 22 + 28;

    // 力 ●●○  速 ●○○  (倔 ●●●)
    const rows: [string, number][] = [['力', a.stats.power], ['速', a.stats.speed]];
    if (a.stats.will) rows.push(['倔', a.stats.will]);
    const cellW = 13 + 6 + 3 * 7 - 2;
    const total = rows.length * cellW + (rows.length - 1) * 18;
    let x = w / 2 - total / 2;
    for (const [label, n] of rows) {
      this.text(label, x, y, { size: 13, color: INK_3 });
      for (let i = 0; i < 3; i++) {
        const px = x + 13 + 6 + i * 8 + 2.5;
        this.p.circle(px, y, 2.5);
        if (i < n) {
          ctx.fillStyle = GOLD;
          ctx.fill();
        } else {
          ctx.strokeStyle = INK_3;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      x += cellW + 18;
    }
    y += 22 + 21;
    this.pill('开始拉磨', w / 2, y, k > 0.3 && this.title.target > 0 ? () => opts.onPick(id) : null);
    ctx.globalAlpha = base;
  }

  // ── HUD ──────────────────────────────────────────────────────────────

  private get pad() {
    return this.compact ? 16 : 30;
  }

  private paintHud() {
    const { ctx, w, h } = this;
    ctx.globalAlpha = easeInOut(this.hud.value);
    // soft shade behind the corners that carry text, so bright skies don't wash it out
    this.p.glow(0, 0, 380, 230, '24, 18, 12', 0.42);
    this.p.glow(w, 0, 320, 360, '24, 18, 12', 0.32);
    this.p.glow(0, h, 420, 150, '24, 18, 12', 0.3);
    this.p.glow(w, h, 300, 150, '24, 18, 12', 0.22);

    this.paintEdgeHints();
    this.paintStats();
    const cardsBottom = this.paintCards();
    this.noticeY = this.portrait && this.compact ? Math.max(h * 0.3, cardsBottom + 40) : h * 0.28;
    this.paintSteps();
    ctx.globalAlpha = 1;
  }

  private paintStats() {
    const { ctx } = this;
    const x = this.safe.left + this.pad;
    const top = this.safe.top + (this.compact ? 14 : 26);
    this.lastHudText = this.hudText();
    this.text('面粉', x, top + 7, { size: 13, track: TRACK_L, color: INK_2 });
    const vs = this.compact ? 32 : 44;
    const vy = top + 18 + vs * 0.6;
    const vw = this.text(formatJin(this.shownFlour), x, vy, { size: vs, track: 0.02 });
    const uw = this.text('斤', x + vw + 8, vy + vs * 0.2, { size: 15, color: INK_2 });

    // "+n" when a lap closes: rise in, hold, drift up and away
    const g = progress(this.t, this.gainAt, 1.8);
    if (g < 1) {
      const a = g < 0.2 ? g / 0.2 : g < 0.7 ? 1 : 1 - (g - 0.7) / 0.3;
      const dy = g < 0.2 ? 4 * (1 - g / 0.2) : g < 0.7 ? 0 : -10 * ((g - 0.7) / 0.3);
      const base = ctx.globalAlpha;
      ctx.globalAlpha = base * a;
      this.text(this.gain, x + vw + 8 + uw + 10, vy + vs * 0.2 + dy, { size: 15, color: GOLD });
      ctx.globalAlpha = base;
    }
    const ly = vy + vs * 0.5 + 12;
    this.text(`第 ${this.laps + 1} 圈`, x, ly, { size: 13, track: TRACK_S, color: INK_2 });

    // sound on/off, small, under the counts (the bottom corners belong to the hooves)
    const r = 16, cx = x + r, cy = ly + 18 + r;
    this.p.circle(cx, cy, r);
    this.ctx.fillStyle = 'rgba(30, 25, 20, 0.42)';
    this.ctx.fill();
    this.ctx.strokeStyle = LINE;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.paintSpeaker(cx - 9, cy - 9, 18, this.muted ? INK_3 : INK_2);
    this.hit(cx - r - 8, cy - r - 8, r * 2 + 16, r * 2 + 16, () => this.onMute());
  }

  private paintSpeaker(x: number, y: number, size: number, color: string) {
    const ctx = this.ctx;
    this.p.svg(SPEAKER, x, y, size);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (this.muted) {
      ctx.moveTo(15.5, 9.5);
      ctx.lineTo(20.5, 14.5);
      ctx.moveTo(20.5, 9.5);
      ctx.lineTo(15.5, 14.5);
    } else {
      ctx.arc(12.54, 12, 4, -0.775, 0.775);
      ctx.moveTo(17.8, 6.8);
      ctx.arc(12.53, 12, 7.4, -0.778, 0.778);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The two upgrade cards, top right. Returns the bottom edge. */
  private paintCards() {
    const u = this.upgrades;
    const top = Math.max(this.safe.top + (this.compact ? 14 : 26), this.reserved + 10);
    if (!u) return top;
    const { ctx, compact } = this;
    const cw = compact ? 128 : 164;
    const padX = compact ? 12 : 14;
    const x0 = this.w - this.safe.right - this.pad - cw;
    let y = top;
    for (const kind of ['mill', 'scene'] as const) {
      const info = u[kind];
      const maxed = info.cost === null;
      const ready = info.progress >= 1;
      const nameSize = compact ? 17 : 21;
      const ch = (compact ? 10 : 12) + 16 + 4 + nameSize + 4 + 14 + (info.nextTier ? 18 : 0) + 6 + 16 + (compact ? 12 : 14);
      // denied: a quick shake
      const d = progress(this.t, this.deniedAt[kind], 0.3);
      const x = x0 + (d < 1 ? Math.sin(d * Math.PI * 2) * -4 : 0);

      if (ready) {
        ctx.save();
        ctx.shadowColor = 'rgba(243, 215, 154, 0.12)';
        ctx.shadowBlur = 22;
        this.p.panel(x, y, cw, ch, 14, GOLD_SOFT);
        ctx.restore();
      } else this.p.panel(x, y, cw, ch, 14);

      let ty = y + (compact ? 10 : 12) + 8;
      this.text(kind === 'mill' ? '磨' : '景', x + padX, ty, { size: 13, track: TRACK_S, color: INK_2 });
      ty += 8 + 4 + nameSize / 2 + 2;
      this.text(info.name, x + padX, ty, { size: nameSize });
      ty += nameSize / 2 + 4 + 7;
      for (let i = 0; i < LEVELS_PER_TIER; i++) {
        this.p.circle(x + padX + 2.5 + i * 9, ty, 2.5);
        if (maxed || i <= info.step) {
          ctx.fillStyle = INK_2;
          ctx.fill();
        } else {
          ctx.strokeStyle = INK_3;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      this.text(`Lv ${info.level}`, x + padX + LEVELS_PER_TIER * 9 + 6, ty, { size: 12, color: INK_3 });
      ty += 7;
      if (info.nextTier) {
        ty += 6 + 6;
        this.text(`下一级　${info.nextTier}`, x + padX, ty, { size: 12, track: 0.1, color: GOLD });
        ty += 6;
      }
      ty += 6 + 8;
      this.text(maxed ? '已至极致' : `${formatJin(info.cost!)} 斤`, x + padX, ty, { size: 13, color: ready || maxed ? GOLD : INK_3 });

      // progress along the bottom edge, clipped to the card's rounded corners
      ctx.save();
      this.p.roundRect(x, y, cw, ch, 14);
      ctx.clip();
      ctx.fillStyle = 'rgba(251, 246, 236, 0.1)';
      ctx.fillRect(x, y + ch - 2, cw, 2);
      ctx.fillStyle = ready && !maxed ? GOLD : GOLD_SOFT;
      ctx.fillRect(x, y + ch - 2, cw * (maxed ? 1 : info.progress), 2);
      ctx.restore();

      this.hit(x - 4, y - 4, cw + 8, ch + 8, () => this.onUpgrade(kind));
      y += ch + 10;
    }
    return y - 10;
  }

  /** A hoof under each thumb, the cadence between them. */
  private paintSteps() {
    const { ctx, w, h, safe } = this;
    const r = 22;
    const cy = h - safe.bottom - (this.compact ? 20 : 28) - r;
    const s = progress(this.t, this.shakeAt, 0.35);
    const shake = s < 1 ? Math.sin(s * Math.PI * 2) * -4 : 0;
    const left = safe.left + this.pad + r + shake;
    const right = w - safe.right - this.pad - r + shake;

    for (const side of ['L', 'R'] as const) {
      const cx = side === 'L' ? left : right;
      const k = progress(this.t, this.hitAt[side], 0.3);
      // squeeze to 0.88 at 40%, back by the end; gold at the deepest point
      const deep = k < 1 ? (k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6) : 0;
      const scale = 1 - 0.12 * deep;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      this.p.circle(0, 0, r);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.42)';
      ctx.fill();
      ctx.strokeStyle = deep > 0.5 ? GOLD : LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (side === 'R') ctx.scale(-1, 1);
      this.p.svg(HOOF, -10, -10, 20);
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = deep > 0.5 ? GOLD : INK_2;
      ctx.fill();
      ctx.restore();
    }

    // cadence: a thin bar that turns gold once the rhythm is steady
    const bw = Math.min(150, right - left - 2 * r - 40);
    const bx = w / 2 - bw / 2 + shake;
    const by = cy + 6;
    const steady = this.cadenceTarget > 0.75;
    this.text(steady ? '步调　稳' : '步调', w / 2 + shake, by - 16, { size: 12, track: TRACK_L, color: steady ? GOLD : INK_3, align: 'center' });
    this.p.roundRect(bx, by - 1.5, bw, 3, 1.5);
    ctx.fillStyle = 'rgba(251, 246, 236, 0.16)';
    ctx.fill();
    if (this.cadenceShown > 0.005) {
      ctx.save();
      if (steady) {
        ctx.shadowColor = 'rgba(243, 215, 154, 0.6)';
        ctx.shadowBlur = 8;
      }
      this.p.roundRect(bx, by - 1.5, bw * this.cadenceShown, 3, 1.5);
      ctx.fillStyle = steady ? GOLD : INK_2;
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = INK_3;
    ctx.fillRect(bx + bw * 0.75, by - 4.5, 1, 9);
  }

  /** The mirage is off to one side: a breathing shade at that edge and a drifting "草原 ›". */
  private paintEdgeHints() {
    const { ctx, w, h } = this;
    const breathe = 1 - 0.45 * (0.5 - 0.5 * Math.cos((this.t / 3.2) * Math.PI * 2));
    const drift = 0.5 - 0.5 * Math.cos((this.t / 2.4) * Math.PI * 2);
    const base = ctx.globalAlpha;
    for (const [fade, dir] of [[this.hintL, -1], [this.hintR, 1]] as const) {
      if (fade.value <= 0) continue;
      const a = base * easeInOut(fade.value);
      const ex = dir < 0 ? 0 : w;
      ctx.globalAlpha = a * breathe;
      this.p.glow(ex, h * 0.56, 140, h * 0.4, '24, 18, 12', 0.3, 1);
      ctx.globalAlpha = a * (1 - 0.3 * drift);
      const cx = ex - dir * (22 + 7) + dir * 4 * drift;
      // chevron at the outer side, the word inside it
      ctx.save();
      ctx.translate(cx, h * 0.56);
      ctx.scale(dir, 1);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.p.lift(3);
      ctx.beginPath();
      ctx.moveTo(-4, -8);
      ctx.lineTo(4, 0);
      ctx.lineTo(-4, 8);
      ctx.stroke();
      this.p.noShadow();
      ctx.restore();
      this.text('草原', cx - dir * 15, h * 0.56, { size: 13, track: TRACK_S, color: GOLD, align: dir < 0 ? 'left' : 'right' });
    }
    ctx.globalAlpha = base;
  }

  // ── notices and prompt ───────────────────────────────────────────────

  private noticeY = 0;

  private advanceNotices() {
    const t = this.t;
    this.notices = this.notices.filter((n) => t < n.hideAt + 1.4);
    const busy = this.notices.some((n) => t < n.hideAt);
    if (!busy && this.queue.length && t >= this.nextNoticeAt) {
      const item = this.queue.shift()!;
      const seconds = item.kind === 'line' ? item.seconds : 5.5;
      this.notices.push({ item, at: t, hideAt: t + seconds });
      // the next one may start while this one is still fading out
      this.nextNoticeAt = t + seconds + 0.5;
    }
  }

  private paintNotices() {
    const { ctx, w } = this;
    const y0 = this.noticeY || this.h * 0.28;
    for (const n of this.notices) {
      const k = ease(progress(this.t, n.at, 1.2)) * (1 - easeInOut(progress(this.t, n.hideAt, 1.2)));
      if (k <= 0) continue;
      ctx.globalAlpha = k;
      const dy = (1 - ease(progress(this.t, n.at, 1.2))) * 8;
      if (n.item.kind === 'line') {
        const style = { size: this.fsL, track: TRACK_S, align: 'center' as const };
        this.p.wrap(n.item.text, w - 48, style).forEach((line, i) => this.text(line, w / 2, y0 + dy + i * (this.fsL + 10), style));
      } else {
        const xl = Math.round(Math.min(64, Math.max(36, w * 0.06)));
        this.text(n.item.label, w / 2, y0 + dy, { size: 13, track: TRACK_L, color: INK_2, align: 'center' });
        // the name settles from wide spacing to normal
        const track = 0.6 - (0.6 - TRACK_L) * ease(progress(this.t, n.at, 2.4));
        this.text(n.item.name, w / 2, y0 + dy + 18 + xl * 0.6, { size: xl, track, align: 'center' });
        if (n.item.line) {
          const style = { size: 15, track: TRACK_S, color: INK_2, align: 'center' as const };
          this.p.wrap(n.item.line, w - 48, style).forEach((line, i) => this.text(line, w / 2, y0 + dy + 18 + xl * 1.2 + 22 + i * 22, style));
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private paintPrompt() {
    const { ctx, w, h } = this;
    const k = easeInOut(this.promptFade.value);
    ctx.globalAlpha = k;
    // portrait: above the horizon, clear of the cards (the neck fills the middle below it)
    const y = (this.portrait ? this.noticeY || h * 0.4 : h * 0.22) + (1 - k) * 10;
    this.text(TEXT.miragePrompt, w / 2, y, { size: this.fsL, track: TRACK_L, color: INK_2, align: 'center' });
    const breathe = 1 - 0.45 * (0.5 - 0.5 * Math.cos((this.t / 2.4) * Math.PI * 2));
    ctx.globalAlpha = k * breathe;
    this.pill(TEXT.touchMirageAction, w / 2, y + 48, this.promptFade.target > 0 ? () => this.onDash() : null, GOLD, GOLD_SOFT);
    ctx.globalAlpha = 1;
  }

  // ── ending ───────────────────────────────────────────────────────────

  private paintEnding() {
    const { ctx, w, h } = this;
    const opts = this.ending!;
    const since = this.t - this.endingAt;
    /** each part rises in after its delay */
    const rise = (delay: number) => {
      const k = ease(progress(since, delay, 3));
      ctx.globalAlpha = k;
      return (1 - k) * 10;
    };
    const xl = Math.round(Math.min(64, Math.max(36, w * 0.06)));
    const cols = this.compact ? 2 : 4;
    const rows = Math.ceil(opts.stats.length / cols);
    const gridH = rows * 46 + (rows - 1) * 6;
    const keepH = 24 + 16 + gridH + 16 + 12;
    const total = xl + 22 + this.fsL + 48 + keepH + 30 + 42 + 16 + 12;
    // portrait: words and keepsake up in the sky, the button down by the thumbs on a
    // shade (the grass below the horizon is bright and the neck fills the middle)
    const split = this.portrait;
    let y = split ? this.safe.top + h * 0.1 : Math.max(this.safe.top + 20, (h - total) / 2);
    if (split) {
      ctx.globalAlpha = ease(progress(since, 12, 3));
      const g = ctx.createLinearGradient(0, h * 0.62, 0, h);
      g.addColorStop(0, 'rgba(20, 14, 8, 0)');
      g.addColorStop(1, 'rgba(20, 14, 8, 0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
    }

    TEXT.freeLines.forEach((line, i) => {
      const dy = rise(2.5 + i * 3.5);
      if (i === 0) {
        this.text(line, w / 2, y + xl / 2 + dy, { size: xl, track: 0.4, align: 'center' });
        y += xl + 22;
      } else {
        this.text(line, w / 2, y + this.fsL / 2 + dy, { size: this.fsL, track: TRACK_L, color: INK_2, align: 'center' });
        y += this.fsL;
      }
    });
    y += 48;

    // the keepsake: name between hairlines, the run in numbers, the date
    let dy = rise(10);
    const base = ctx.globalAlpha;
    if (base > 0) {
      ctx.globalAlpha = base;
      this.p.glow(w / 2, y + keepH / 2, Math.min(w / 2, 260), keepH / 2 + 50, '40, 24, 20', 0.34, 1);
      const name = ANIMALS[opts.animal].name;
      const ny = y + 12 + dy;
      this.text(name, w / 2, ny, { size: this.fsL, color: GOLD, align: 'center' });
      ctx.fillStyle = GOLD_SOFT;
      ctx.fillRect(w / 2 - this.fsL / 2 - 18 - 64, ny, 64, 1);
      ctx.fillRect(w / 2 + this.fsL / 2 + 18, ny, 64, 1);
      const colW = this.compact ? 110 : 96;
      opts.stats.forEach((s, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const cx = w / 2 + (c - (cols - 1) / 2) * colW;
        const cy = y + 24 + 16 + r * 52 + dy;
        this.text(s.value, cx, cy + 12, { size: 24, align: 'center' });
        this.text(s.label, cx, cy + 34, { size: 12, track: 0.15, color: INK_3, align: 'center' });
      });
      this.text(this.endingDate, w / 2, y + 24 + 16 + gridH + 16 + 6 + dy, { size: 12, track: 0.2, color: INK_3, align: 'center' });
    }
    y = split ? h - this.safe.bottom - 40 - 16 - 42 - 12 : y + keepH + 30;

    dy = rise(13);
    this.pill('再活一次', w / 2, y + 21 + dy, since > 13 ? opts.onAgain : null);
    y += 42 + 16;
    this.text(TEXT.touchEndingHint, w / 2, y + 6 + dy, { size: 12, track: TRACK_S, color: INK_3, align: 'center' });
    ctx.globalAlpha = 1;
  }
}
