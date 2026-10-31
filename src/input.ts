// Keyboard, mouse and touch reduced to a handful of intents.
// Touching the left/right half of the screen steps; holding a side steers on the
// grassland; dragging sideways turns your head (touch has no mouse to look with).

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

/** how far (share of screen width) a finger drags to turn the head all the way */
const DRAG_FULL = 0.3;

export class Input {
  private handlers = new Set<(i: Intent) => void>();
  /** horizontal steering in [-1, 1], used on the grassland */
  steer = 0;
  /** in [-1, 1]; turns your head at the mill */
  lookX = 0;
  private held = new Set<string>();
  /** fingers down: where each started and where it is, as shares of screen width */
  private touches = new Map<number, { x0: number; x: number }>();

  /** Returns false for keys that mean nothing here (so the page can keep them). */
  keyDown(code: string, repeat: boolean) {
    const intent = KEYS[code];
    if (!intent) return false;
    this.held.add(code);
    this.updateSteer();
    if (!repeat) this.emit(intent);
    return true;
  }

  keyUp(code: string) {
    this.held.delete(code);
    this.updateSteer();
  }

  /** Window lost focus: nothing is held any more. */
  releaseAll() {
    this.held.clear();
    this.touches.clear();
    this.updateSteer();
  }

  /** A mouse moved to `x` (share of screen width): look and steer toward it. */
  mouseMove(x: number) {
    this.lookX = x * 2 - 1;
    if (this.held.size === 0) this.steer = this.lookX;
  }

  mouseLeave() {
    this.lookX = 0;
  }

  /** A finger or mouse button went down at `x` (share of screen width). */
  pointerDown(id: number, x: number) {
    this.emit(x < 0.5 ? 'stepLeft' : 'stepRight');
    this.touches.set(id, { x0: x, x });
    this.updateTouch();
  }

  pointerMove(id: number, x: number) {
    const t = this.touches.get(id);
    if (!t) return;
    t.x = x;
    this.updateTouch();
  }

  pointerUp(id: number) {
    if (!this.touches.delete(id)) return;
    if (this.touches.size === 0) this.lookX = 0;
    this.updateTouch();
  }

  private updateTouch() {
    if (this.touches.size === 0) {
      if (this.held.size === 0) this.steer = 0;
      return;
    }
    // the newest finger decides
    let t = { x0: 0.5, x: 0.5 };
    for (const v of this.touches.values()) t = v;
    this.steer = t.x < 0.5 ? -1 : 1;
    this.lookX = Math.max(-1, Math.min(1, (t.x - t.x0) / DRAG_FULL));
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

  emit(i: Intent) {
    for (const h of this.handlers) h(i);
  }
}

/** Feed the browser's keyboard, mouse and touch into `input`. */
export function attachDom(input: Input, canvas: HTMLElement) {
  window.addEventListener('keydown', (e) => {
    if (input.keyDown(e.code, e.repeat)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keyUp(e.code));
  window.addEventListener('blur', () => input.releaseAll());
  canvas.addEventListener('pointerdown', (e) => {
    // a mouse looks by hovering; only fingers hold, drag and steer
    if (e.pointerType === 'mouse') input.emit(e.clientX < window.innerWidth / 2 ? 'stepLeft' : 'stepRight');
    else input.pointerDown(e.pointerId, e.clientX / window.innerWidth);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') input.mouseMove(e.clientX / window.innerWidth);
    else input.pointerMove(e.pointerId, e.clientX / window.innerWidth);
  });
  const up = (e: PointerEvent) => input.pointerUp(e.pointerId);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  document.addEventListener('mouseleave', () => input.mouseLeave());
}
