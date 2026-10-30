// Keyboard and pointer input reduced to a handful of intents.
// Desktop first; touching the left/right half of the screen also steps.

export type Intent = 'stepLeft' | 'stepRight' | 'dash' | 'upgradeMill' | 'upgradeScene' | 'mute';

const KEYS: Record<string, Intent> = {
  KeyA: 'stepLeft',
  ArrowLeft: 'stepLeft',
  KeyD: 'stepRight',
  ArrowRight: 'stepRight',
  Space: 'dash',
  Digit1: 'upgradeMill',
  Digit2: 'upgradeScene',
  KeyM: 'mute',
};

export class Input {
  private handlers = new Set<(i: Intent) => void>();
  /** horizontal steering in [-1, 1], used on the grassland */
  steer = 0;
  /** mouse x in [-1, 1]; turns your head at the mill */
  lookX = 0;
  private held = new Set<string>();

  constructor(canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const intent = KEYS[e.code];
      if (!intent) return;
      e.preventDefault();
      this.held.add(e.code);
      this.updateSteer();
      if (!e.repeat) this.emit(intent);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.updateSteer();
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.updateSteer();
    });
    canvas.addEventListener('pointerdown', (e) => {
      const left = e.clientX < window.innerWidth / 2;
      this.emit(left ? 'stepLeft' : 'stepRight');
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.lookX = (e.clientX / window.innerWidth) * 2 - 1;
      if (this.held.size === 0) this.steer = this.lookX;
    });
    document.addEventListener('mouseleave', () => (this.lookX = 0));
  }

  private updateSteer() {
    const l = this.held.has('KeyA') || this.held.has('ArrowLeft');
    const r = this.held.has('KeyD') || this.held.has('ArrowRight');
    if (l || r) this.steer = (r ? 1 : 0) - (l ? 1 : 0);
  }

  on(fn: (i: Intent) => void) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  private emit(i: Intent) {
    for (const h of this.handlers) h(i);
  }
}
