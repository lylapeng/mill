import type { AnimalId } from './config';

// What the game asks of a UI. The web page draws it with DOM (ui.ts); the mini game,
// which has no DOM, paints it on a canvas (canvas-ui/).

export interface UpgradeInfo {
  name: string;
  level: number;
  /** 0..LEVELS_PER_TIER-1: how far into the current tier */
  step: number;
  cost: number | null;
  /** flour / cost, clamped to 0..1 */
  progress: number;
  /** the tier the next level opens, if it opens one */
  nextTier: string | null;
}

export interface EndingStat {
  value: string;
  label: string;
}

/** A white-on-transparent RGBA image, top row first. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** where the hooves sit on a touch screen: one under each thumb, or both under one */
export type Hand = 'both' | 'left' | 'right';

/** what pressing the unlock button came to */
export type UnlockResult = 'ok' | 'closed' | 'limit' | 'error';

/** An animal shown on the title but not yet playable (the stag, until you follow). */
export interface LockedAnimal {
  id: AnimalId;
  /** 'soon' in the first seconds of play (asking isn't allowed yet), 'limit' once today's asks are used */
  canAsk: () => 'yes' | 'soon' | 'limit';
  unlock: () => Promise<UnlockResult>;
}

export interface TitleOptions {
  /** side-on silhouettes */
  portraits: Partial<Record<AnimalId, Mask>>;
  /** the ones to offer, in order */
  animals: AnimalId[];
  locked?: LockedAnimal;
  current: AnimalId | null;
  freed: AnimalId[];
  onPick: (a: AnimalId) => void;
  onContinue: () => void;
}

export interface EndingOptions {
  animal: AnimalId;
  stats: EndingStat[];
  onAgain: () => void;
}

export interface GameUi {
  onUpgrade: (kind: 'mill' | 'scene') => void;
  onMute: () => void;
  /** the mirage prompt was tapped */
  onDash: () => void;

  showTitle(opts: TitleOptions): void;
  hideTitle(): void;
  showHud(v: boolean): void;
  setStats(flour: number, laps: number): void;
  /** A faint "+n" beside the flour count when a lap closes. */
  lapGain(amount: number): void;
  setUpgrades(u: { mill: UpgradeInfo; scene: UpgradeInfo }): void;
  step(side: 'L' | 'R', cadence: number): void;
  cadence(v: number): void;
  stumble(): void;
  denied(kind: 'mill' | 'scene'): void;
  setMuted(m: boolean): void;
  /** Lines appear one at a time, centred, then fade. */
  toast(text: string, seconds?: number): void;
  /** A new tier gets its own moment: its name, large, and one line beneath. */
  tier(kind: 'mill' | 'scene', tier: number, name: string, line: string): void;
  prompt(v: boolean): void;
  /** A soft glow at the screen edge on the side the mirage is (side 0 hides it). */
  mirageHint(side: -1 | 0 | 1, strength: number): void;
  /** Fade to (or from) white over `seconds`. */
  flash(toWhite: boolean, seconds: number): void;
  showEnding(opts: EndingOptions): void;
  hideEnding(): void;
}

export const ORDINAL = ['一', '二', '三', '四', '五'];

export function formatJin(n: number) {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 1 : 2) + ' 万';
  return n < 100 ? n.toFixed(1) : Math.floor(n).toString();
}
