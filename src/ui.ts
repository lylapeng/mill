import { ANIMALS, LEVELS_PER_TIER, TEXT, type AnimalId } from './config';
import { ORDINAL, formatJin, type EndingOptions, type GameUi, type Mask, type TitleOptions, type UpgradeInfo } from './ui-api';
import { damp } from './util';

// DOM overlay for the web page. Built once; game code calls these methods and never touches the DOM.

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

const svg = (markup: string, cls = '') => {
  const wrap = h('span', cls);
  wrap.innerHTML = markup;
  return wrap;
};

const HOOF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6c-4.5 0-7.3 3.8-7.3 8.4 0 3.6 1.5 6.7 3.4 8.1.8.6 1.8 0 1.8-.9v-2.9c0-1 .9-1.7 2.1-1.7s2.1.7 2.1 1.7v2.9c0 .9 1 1.5 1.8.9 1.9-1.4 3.4-4.5 3.4-8.1 0-4.6-2.8-8.4-7.3-8.4z"/></svg>`;
const SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor" stroke="none"/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.4 7.4 0 0 1 0 10.4"/></svg>`;
const SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor" stroke="none"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>`;

const CHEVRON = `<svg viewBox="0 0 14 22" aria-hidden="true"><path d="M3 3l8 8-8 8"/></svg>`;

/** A mask as an image URL, for CSS mask-image. */
function maskUrl(m: Mask) {
  const canvas = document.createElement('canvas');
  canvas.width = m.width;
  canvas.height = m.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(m.data), m.width, m.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function stats(s: { power: number; speed: number; will?: number }) {
  const row = h('div', 'animal-stats');
  const rows: [string, number][] = [['力', s.power], ['速', s.speed]];
  if (s.will) rows.push(['倔', s.will]);
  for (const [label, n] of rows) {
    const cell = h('span', 'stat', label);
    const pips = h('span', 'pips');
    for (let i = 0; i < 3; i++) pips.append(h('i', i < n ? 'on' : ''));
    cell.append(pips);
    row.append(cell);
  }
  return row;
}

interface Card {
  el: HTMLButtonElement;
  name: HTMLElement;
  pips: HTMLElement[];
  level: HTMLElement;
  next: HTMLElement;
  cost: HTMLElement;
  bar: HTMLElement;
}

type Notice = { kind: 'line'; text: string; seconds: number } | { kind: 'tier'; label: string; name: string; line: string };

export class Ui implements GameUi {
  private root = h('div', 'ui');
  private title = h('section', 'title');
  private hud = h('section', 'hud hidden');
  private flourEl = h('div', 'flour-value');
  private gainEl = h('div', 'gain');
  private lapsEl = h('div', 'laps');
  private hoofL = h('div', 'hoof');
  private hoofR = h('div', 'hoof');
  private cadenceBar = h('div', 'cadence-fill');
  private cadenceLabel = h('div', 'cadence-label');
  private cards: Record<'mill' | 'scene', Card>;
  private notices = h('div', 'notices');
  private promptEl = h('div', 'prompt');
  private hintL = h('div', 'edge-hint left');
  private hintR = h('div', 'edge-hint right');
  private flashEl = h('div', 'flash');
  private ending = h('section', 'ending hidden');
  private muteBtn = h('button', 'mute');
  private last = { flour: '', laps: -1, up: '' };
  private shownFlour = -1;
  private statsAt = 0;
  private queue: Notice[] = [];
  private busy = false;

  onUpgrade: (kind: 'mill' | 'scene') => void = () => {};
  onMute: () => void = () => {};
  onDash: () => void = () => {};

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);

    // HUD
    const stats = h('div', 'stats');
    const flourUnit = h('span', 'unit', '斤');
    const flourRow = h('div', 'flour-row');
    flourRow.append(this.flourEl, flourUnit, this.gainEl);
    stats.append(h('div', 'flour-label', '面粉'), flourRow, this.lapsEl);

    const make = (kind: 'mill' | 'scene', label: string, key: string): Card => {
      const el = h('button', 'card');
      const head = h('div', 'card-head');
      head.append(h('span', 'card-kind', label), h('span', 'key', key));
      const name = h('div', 'card-name');
      const meta = h('div', 'card-meta');
      const pipRow = h('span', 'card-pips');
      const pips = Array.from({ length: LEVELS_PER_TIER }, () => pipRow.appendChild(h('i')));
      const level = h('span', 'card-level');
      meta.append(pipRow, level);
      const next = h('div', 'card-next');
      const cost = h('div', 'card-cost');
      const track = h('div', 'card-track');
      const bar = h('div', 'card-bar');
      track.append(bar);
      el.append(head, name, meta, next, cost, track);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onUpgrade(kind);
      });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      return { el, name, pips, level, next, cost, bar };
    };
    this.cards = { mill: make('mill', '磨', '1'), scene: make('scene', '景', '2') };
    const upgrades = h('div', 'upgrades');
    upgrades.append(this.cards.mill.el, this.cards.scene.el);

    const foot = (el: HTMLElement, key: string) => {
      el.append(svg(HOOF, 'hoof-icon'));
      const wrap = h('div', 'hoof-wrap');
      wrap.append(el, h('span', 'key', key));
      return wrap;
    };
    const steps = h('div', 'steps');
    const cadence = h('div', 'cadence');
    cadence.append(this.cadenceBar, h('i', 'cadence-mark'));
    const cadenceWrap = h('div', 'cadence-wrap');
    cadenceWrap.append(this.cadenceLabel, cadence);
    steps.append(foot(this.hoofL, 'A'), cadenceWrap, foot(this.hoofR, 'D'));
    this.cadence(0);

    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onMute();
    });
    this.muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.muteBtn.title = '静音 (M)';
    this.setMuted(false);

    for (const el of [this.hintL, this.hintR]) {
      const mark = svg(CHEVRON, 'edge-mark');
      mark.prepend(h('span', '', '草原'));
      el.append(mark);
    }

    this.promptEl.append(h('div', 'prompt-q', TEXT.miragePrompt), h('div', 'prompt-a', TEXT.mirageAction));
    // without a keyboard, the prompt itself is the way to run
    this.promptEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onDash();
    });
    this.promptEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.hud.append(h('div', 'scrim'), this.hintL, this.hintR, stats, upgrades, steps, this.muteBtn);
    this.root.append(this.hud, this.notices, this.promptEl, this.title, this.ending, this.flashEl);
  }

  // ── title ────────────────────────────────────────────────────────────

  showTitle(opts: TitleOptions) {
    this.title.replaceChildren();
    this.title.classList.remove('hidden', 'leaving');

    const top = h('header', 'title-top');
    top.append(h('h1', '', TEXT.title), h('p', 'subtitle', TEXT.subtitle));

    const bottom = h('div', 'title-bottom');
    if (opts.current) {
      const cont = h('button', 'pill continue', `继续拉磨 · ${ANIMALS[opts.current].name}`);
      cont.addEventListener('click', opts.onContinue);
      bottom.append(cont, h('p', 'or', '或者，换一头重新开始'));
    }

    // three silhouettes; picking one reveals what it's like and a button to begin
    const herd = h('div', 'herd');
    const detail = h('div', 'detail');
    const portraits: HTMLButtonElement[] = [];
    const pick = (id: AnimalId, el: HTMLButtonElement) => {
      for (const p of portraits) p.classList.toggle('picked', p === el);
      herd.classList.add('choosing');
      const a = ANIMALS[id];
      const start = h('button', 'pill start', '开始拉磨');
      start.addEventListener('click', () => opts.onPick(id));
      detail.replaceChildren(h('p', 'detail-blurb', a.blurb), stats(a.stats), start);
      detail.classList.remove('in');
      void detail.offsetWidth;
      detail.classList.add('in');
    };
    for (const a of Object.values(ANIMALS)) {
      const el = h('button', 'portrait');
      const sil = h('span', 'sil');
      sil.style.setProperty('--img', `url(${maskUrl(opts.portraits[a.id])})`);
      const shade = h('span', 'sil-shade');
      shade.append(sil);
      el.append(shade, h('span', 'portrait-name', a.name));
      if (opts.freed.includes(a.id)) el.append(h('span', 'portrait-free', '曾走进草原'));
      el.addEventListener('click', () => pick(a.id, el));
      portraits.push(el);
      herd.append(el);
    }
    bottom.append(herd, detail, h('p', 'controls', TEXT.controls));

    this.title.append(top, bottom);
  }

  hideTitle() {
    this.title.classList.add('leaving');
    setTimeout(() => this.title.classList.add('hidden'), 900);
  }

  showHud(v: boolean) {
    this.hud.classList.toggle('hidden', !v);
    if (v) this.shownFlour = -1;
  }

  // ── HUD ──────────────────────────────────────────────────────────────

  setStats(flour: number, laps: number) {
    // earning is already smooth; spending counts down instead of jumping
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.statsAt) / 1000);
    this.statsAt = now;
    if (this.shownFlour < 0 || flour >= this.shownFlour) this.shownFlour = flour;
    else {
      this.shownFlour = damp(this.shownFlour, flour, 6, dt);
      if (this.shownFlour - flour < Math.max(0.05, flour * 0.002)) this.shownFlour = flour;
    }
    const f = formatJin(this.shownFlour);
    if (f !== this.last.flour) {
      this.last.flour = f;
      this.flourEl.textContent = f;
    }
    if (laps !== this.last.laps) {
      this.last.laps = laps;
      this.lapsEl.textContent = `第 ${laps + 1} 圈`;
    }
  }

  /** A faint "+n" beside the flour count when a lap closes. */
  lapGain(amount: number) {
    if (amount <= 0) return;
    this.gainEl.textContent = `+${formatJin(amount)}`;
    this.gainEl.classList.remove('in');
    void this.gainEl.offsetWidth;
    this.gainEl.classList.add('in');
  }

  setUpgrades(u: { mill: UpgradeInfo; scene: UpgradeInfo }) {
    for (const kind of ['mill', 'scene'] as const) {
      const info = u[kind];
      const c = this.cards[kind];
      const ready = info.progress >= 1;
      c.bar.style.transform = `scaleX(${info.cost === null ? 1 : info.progress.toFixed(3)})`;
      c.el.classList.toggle('ready', ready);
    }
    const key = JSON.stringify([u.mill.level, u.scene.level]);
    if (key === this.last.up) return;
    this.last.up = key;
    for (const kind of ['mill', 'scene'] as const) {
      const info = u[kind];
      const c = this.cards[kind];
      const maxed = info.cost === null;
      c.name.textContent = info.name;
      c.level.textContent = `Lv ${info.level}`;
      c.pips.forEach((p, i) => p.classList.toggle('on', maxed || i <= info.step));
      c.next.textContent = info.nextTier ? `下一级　${info.nextTier}` : '';
      c.next.classList.toggle('hidden', !info.nextTier);
      c.cost.textContent = maxed ? '已至极致' : `${formatJin(info.cost!)} 斤`;
      c.el.classList.toggle('maxed', maxed);
    }
  }

  step(side: 'L' | 'R', cadence: number) {
    const el = side === 'L' ? this.hoofL : this.hoofR;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    this.cadence(cadence);
  }

  cadence(v: number) {
    const steady = v > 0.75;
    this.cadenceBar.style.transform = `scaleX(${v.toFixed(3)})`;
    this.cadenceLabel.textContent = steady ? '步调　稳' : '步调';
    this.cadenceLabel.classList.toggle('steady', steady);
    this.cadenceBar.classList.toggle('steady', steady);
  }

  stumble() {
    this.cadence(0);
    this.hud.classList.remove('shake');
    void this.hud.offsetWidth;
    this.hud.classList.add('shake');
    this.toast(TEXT.stumble, 1.2);
  }

  denied(kind: 'mill' | 'scene') {
    const el = this.cards[kind].el;
    el.classList.remove('denied');
    void el.offsetWidth;
    el.classList.add('denied');
  }

  setMuted(m: boolean) {
    this.muteBtn.classList.toggle('off', m);
    this.muteBtn.innerHTML = m ? SOUND_OFF : SOUND_ON;
  }

  /** Lines appear one at a time, centred, then fade. */
  toast(text: string, seconds = 4) {
    if (!text) return;
    this.enqueue({ kind: 'line', text, seconds });
  }

  /** A new tier gets its own moment: its name, large, and one line beneath. */
  tier(kind: 'mill' | 'scene', tier: number, name: string, line: string) {
    this.enqueue({ kind: 'tier', label: `${kind === 'mill' ? '磨' : '景'}　第${ORDINAL[tier]}档`, name, line });
  }

  private enqueue(n: Notice) {
    this.queue.push(n);
    if (!this.busy) this.nextNotice();
  }

  private nextNotice() {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;
    let el: HTMLElement;
    let seconds: number;
    if (item.kind === 'line') {
      el = h('div', 'notice toast', item.text);
      seconds = item.seconds;
    } else {
      el = h('div', 'notice tier-card');
      el.append(h('div', 'tier-label', item.label), h('div', 'tier-name', item.name));
      if (item.line) el.append(h('div', 'tier-line', item.line));
      seconds = 5.5;
    }
    this.notices.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 1400);
      setTimeout(() => this.nextNotice(), 500);
    }, seconds * 1000);
  }

  prompt(v: boolean) {
    this.promptEl.classList.toggle('in', v);
  }

  /** A soft glow at the screen edge on the side the mirage is (side 0 hides it). */
  mirageHint(side: -1 | 0 | 1, strength: number) {
    this.hintL.style.opacity = side < 0 ? strength.toFixed(3) : '0';
    this.hintR.style.opacity = side > 0 ? strength.toFixed(3) : '0';
  }

  /** Fade to (or from) white over `seconds`. */
  flash(toWhite: boolean, seconds: number) {
    this.flashEl.style.transitionDuration = `${seconds}s`;
    this.flashEl.classList.toggle('in', toWhite);
  }

  // ── ending ───────────────────────────────────────────────────────────

  showEnding(opts: EndingOptions) {
    this.ending.replaceChildren();
    this.ending.classList.remove('hidden');
    const at = (el: HTMLElement, s: number) => {
      el.style.animationDelay = `${s}s`;
      return el;
    };
    const lines = h('div', 'ending-lines');
    TEXT.freeLines.forEach((t, i) => lines.append(at(h('p', i === 0 ? 'ending-main' : 'ending-sub', t), 2.5 + i * 3.5)));

    const keepsake = at(h('div', 'keepsake'), 10);
    const grid = h('div', 'keepsake-grid');
    for (const s of opts.stats) {
      const cell = h('div', 'keepsake-cell');
      cell.append(h('div', 'keepsake-value', s.value), h('div', 'keepsake-label', s.label));
      grid.append(cell);
    }
    const d = new Date();
    keepsake.append(
      h('div', 'keepsake-name', ANIMALS[opts.animal].name),
      grid,
      h('div', 'keepsake-date', `${d.getFullYear()} · ${d.getMonth() + 1} · ${d.getDate()}`),
    );

    const again = at(h('button', 'pill again', '再活一次'), 13);
    again.addEventListener('click', opts.onAgain);
    const hint = at(h('p', 'ending-hint', 'A / D 或移动鼠标，随便跑'), 13);
    this.ending.append(lines, keepsake, again, hint);
  }

  hideEnding() {
    this.ending.classList.add('hidden');
  }
}
