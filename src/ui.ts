import { ANIMALS, TEXT, type AnimalId } from './config';

// DOM overlay. Built once; game code calls these methods and never touches the DOM.

export interface UpgradeInfo {
  name: string;
  level: number;
  cost: number | null;
  affordable: boolean;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

export function formatJin(n: number) {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 1 : 2) + ' 万';
  return n < 100 ? n.toFixed(1) : Math.floor(n).toString();
}

function stats(s: { power: number; speed: number; will: number }) {
  const row = h('div', 'animal-stats');
  for (const [label, n] of [['力', s.power], ['速', s.speed], ['倔', s.will]] as const) {
    const cell = h('span', 'stat', label);
    const pips = h('span', 'pips');
    for (let i = 0; i < 3; i++) pips.append(h('i', i < n ? 'on' : ''));
    cell.append(pips);
    row.append(cell);
  }
  return row;
}

export class Ui {
  private root = h('div', 'ui');
  private title = h('section', 'title');
  private hud = h('section', 'hud hidden');
  private flourEl = h('div', 'flour-value');
  private lapsEl = h('div', 'laps');
  private hoofL = h('div', 'hoof', 'A');
  private hoofR = h('div', 'hoof', 'D');
  private cadenceBar = h('div', 'cadence-fill');
  private cadenceLabel = h('div', 'cadence-label', '步调');
  private cards: Record<'mill' | 'scene', { el: HTMLButtonElement; name: HTMLElement; level: HTMLElement; cost: HTMLElement }>;
  private toasts = h('div', 'toasts');
  private promptEl = h('div', 'prompt');
  private flashEl = h('div', 'flash');
  private ending = h('section', 'ending hidden');
  private muteBtn = h('button', 'mute', '♪');
  private last = { flour: '', laps: -1, up: '' };
  private toastQueue: { text: string; seconds: number }[] = [];
  private toastBusy = false;

  onUpgrade: (kind: 'mill' | 'scene') => void = () => {};
  onMute: () => void = () => {};

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);

    // HUD
    const stats = h('div', 'stats');
    const flourLabel = h('div', 'flour-label', '面粉');
    const flourUnit = h('span', 'unit', '斤');
    const flourRow = h('div', 'flour-row');
    flourRow.append(this.flourEl, flourUnit);
    stats.append(flourLabel, flourRow, this.lapsEl);

    const make = (kind: 'mill' | 'scene', label: string, key: string) => {
      const el = h('button', 'card');
      const head = h('div', 'card-head');
      head.append(h('span', 'card-kind', label), h('span', 'card-key', key));
      const name = h('div', 'card-name');
      const level = h('div', 'card-level');
      const cost = h('div', 'card-cost');
      el.append(head, name, level, cost);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onUpgrade(kind);
      });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      return { el, name, level, cost };
    };
    this.cards = { mill: make('mill', '磨', '1'), scene: make('scene', '景', '2') };
    const upgrades = h('div', 'upgrades');
    upgrades.append(this.cards.mill.el, this.cards.scene.el);

    const steps = h('div', 'steps');
    const cadence = h('div', 'cadence');
    cadence.append(this.cadenceBar);
    const cadenceWrap = h('div', 'cadence-wrap');
    cadenceWrap.append(this.cadenceLabel, cadence);
    steps.append(this.hoofL, cadenceWrap, this.hoofR);

    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onMute();
    });
    this.muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.muteBtn.title = '静音 (M)';

    this.promptEl.append(h('div', 'prompt-q', TEXT.miragePrompt), h('div', 'prompt-a', TEXT.mirageAction));
    this.hud.append(stats, upgrades, steps, this.muteBtn);
    this.root.append(this.hud, this.toasts, this.promptEl, this.title, this.ending, this.flashEl);
  }

  // ── title ────────────────────────────────────────────────────────────

  showTitle(opts: {
    current: AnimalId | null;
    freed: AnimalId[];
    onPick: (a: AnimalId) => void;
    onContinue: () => void;
  }) {
    this.title.replaceChildren();
    this.title.classList.remove('hidden', 'leaving');
    const inner = h('div', 'title-inner');
    inner.append(h('h1', '', TEXT.title), h('p', 'subtitle', TEXT.subtitle));

    if (opts.current) {
      const cont = h('button', 'continue', `继续拉磨 · ${ANIMALS[opts.current].name}`);
      cont.addEventListener('click', opts.onContinue);
      inner.append(cont, h('p', 'or', '或者，换一头重新开始'));
    }

    const row = h('div', 'animals');
    for (const a of Object.values(ANIMALS)) {
      const card = h('button', 'animal');
      card.append(
        h('div', 'animal-name', a.name),
        h('div', 'animal-blurb', a.blurb),
        stats(a.stats),
      );
      card.addEventListener('click', () => opts.onPick(a.id));
      row.append(card);
    }
    inner.append(row);

    if (opts.freed.length) {
      const names = opts.freed.map((id) => ANIMALS[id].name).join(' ');
      inner.append(h('p', 'freed', `已经走进草原的：${names}`));
    }
    inner.append(h('p', 'controls', TEXT.controls));
    this.title.append(inner);
  }

  hideTitle() {
    this.title.classList.add('leaving');
    setTimeout(() => this.title.classList.add('hidden'), 900);
  }

  showHud(v: boolean) {
    this.hud.classList.toggle('hidden', !v);
  }

  // ── HUD ──────────────────────────────────────────────────────────────

  setStats(flour: number, laps: number) {
    const f = formatJin(flour);
    if (f !== this.last.flour) {
      this.last.flour = f;
      this.flourEl.textContent = f;
    }
    if (laps !== this.last.laps) {
      this.last.laps = laps;
      this.lapsEl.textContent = `第 ${laps + 1} 圈`;
    }
  }

  setUpgrades(u: { mill: UpgradeInfo; scene: UpgradeInfo }) {
    const key = JSON.stringify(u);
    if (key === this.last.up) return;
    this.last.up = key;
    for (const kind of ['mill', 'scene'] as const) {
      const info = u[kind];
      const c = this.cards[kind];
      c.name.textContent = info.name;
      c.level.textContent = `Lv ${info.level}`;
      c.cost.textContent = info.cost === null ? '已至极致' : `${formatJin(info.cost)} 斤`;
      c.el.classList.toggle('ready', info.affordable);
      c.el.classList.toggle('maxed', info.cost === null);
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
    this.cadenceBar.style.transform = `scaleX(${v.toFixed(3)})`;
    this.cadenceLabel.textContent = v > 0.75 ? '步调 · 稳' : '步调';
    this.cadenceLabel.classList.toggle('steady', v > 0.75);
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
  }

  /** Lines appear one at a time, centred, then fade. */
  toast(text: string, seconds = 4) {
    if (!text) return;
    this.toastQueue.push({ text, seconds });
    if (!this.toastBusy) this.nextToast();
  }

  private nextToast() {
    const item = this.toastQueue.shift();
    if (!item) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    const el = h('div', 'toast', item.text);
    this.toasts.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 1200);
      this.nextToast();
    }, item.seconds * 1000);
  }

  prompt(v: boolean) {
    this.promptEl.classList.toggle('in', v);
  }

  /** Fade to (or from) white over `seconds`. */
  flash(toWhite: boolean, seconds: number) {
    this.flashEl.style.transitionDuration = `${seconds}s`;
    this.flashEl.classList.toggle('in', toWhite);
  }

  // ── ending ───────────────────────────────────────────────────────────

  showEnding(opts: { stats: string[]; onAgain: () => void }) {
    this.ending.replaceChildren();
    this.ending.classList.remove('hidden');
    const lines = h('div', 'ending-lines');
    TEXT.freeLines.forEach((t, i) => {
      const p = h('p', i === 0 ? 'ending-main' : 'ending-sub', t);
      p.style.animationDelay = `${2 + i * 3}s`;
      lines.append(p);
    });
    const stats = h('p', 'ending-stats', opts.stats.join('　·　'));
    stats.style.animationDelay = '8s';
    const again = h('button', 'again', '再活一次');
    again.style.animationDelay = '10s';
    again.addEventListener('click', opts.onAgain);
    const hint = h('p', 'ending-hint', 'A / D 或移动鼠标，随便跑');
    hint.style.animationDelay = '10s';
    this.ending.append(lines, stats, again, hint);
  }

  hideEnding() {
    this.ending.classList.add('hidden');
  }
}
