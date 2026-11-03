import { BASE_ANIMALS, type AnimalId } from '../config';
import { read, write } from '../save';
import type { LockedAnimal, UnlockResult } from '../ui-api';
import { clientVersion, miniTool } from './platform';

// Following the author unlocks the stag (client 9.51+). The platform's rules (2026-11): no
// asking in the first 20 seconds of use, at most 3 asks a day per player, never hold the game
// hostage, never ask again straight after a "no". So the stag stands on the title from the
// start, but its follow button only appears once the player has spent 20 s in the game; the
// platform's dialog opens only when they press it, and a closed dialog is left alone. Unlocked stays unlocked, even after unfollowing.

const KEY = 'mill.follow.v1';
const MIN_USE = 20;
const ASKS_PER_DAY = 3;

interface State {
  unlocked: boolean;
  /** seconds in the game, counted up to MIN_USE */
  used: number;
  /** the local date of the asks below */
  day: string;
  asks: number;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export class Follow {
  private state: State = { unlocked: false, used: 0, day: '', asks: 0, ...read<Partial<State>>(KEY) };
  private supported = false;
  private unsaved = 0;
  /** called once, when the player has been here long enough to be asked */
  onOffer: () => void = () => {};

  /** Can this client follow, and does the player follow already? Never shows anything. */
  async init() {
    const mt = miniTool();
    const version = await clientVersion();
    // the methods decide; a version we can't read (0) doesn't veto them, a known old one does
    this.supported = typeof mt?.followAuthor === 'function' && typeof mt.getFollowStatus === 'function' && (version === 0 || version >= 9510);
    if (!this.supported) return;
    try {
      const { follow_status } = await mt!.getFollowStatus!();
      if (follow_status === 1 || follow_status === 2) this.unlock();
    } catch {
      // unknown: ask later, if they want to
    }
  }

  /** Count time in the game until there's enough of it. */
  tick(dt: number) {
    if (this.state.used >= MIN_USE) return;
    this.state.used += dt;
    this.unsaved += dt;
    if (this.unsaved >= 5 || this.state.used >= MIN_USE) {
      this.unsaved = 0;
      this.save();
    }
    if (this.state.used >= MIN_USE && this.supported && !this.state.unlocked) this.onOffer();
  }

  roster(): { animals: AnimalId[]; locked?: LockedAnimal } {
    if (this.state.unlocked) return { animals: [...BASE_ANIMALS, 'stag'] };
    if (!this.supported) return { animals: BASE_ANIMALS };
    const canAsk = () => (this.state.used < MIN_USE ? 'soon' : this.asksLeft() > 0 ? 'yes' : 'limit');
    return { animals: BASE_ANIMALS, locked: { id: 'stag', canAsk, unlock: () => this.ask() } };
  }

  private asksLeft() {
    return this.state.day === today() ? ASKS_PER_DAY - this.state.asks : ASKS_PER_DAY;
  }

  private async ask(): Promise<UnlockResult> {
    if (this.state.used < MIN_USE) return 'closed';
    if (this.asksLeft() <= 0) return 'limit';
    const day = today();
    if (this.state.day !== day) this.state = { ...this.state, day, asks: 0 };
    this.state.asks++;
    this.save();
    try {
      const { follow_status } = await miniTool()!.followAuthor!();
      if (follow_status === 1 || follow_status === 2) {
        this.unlock();
        return 'ok';
      }
      return follow_status === 0 ? 'closed' : 'error';
    } catch (err) {
      const code = (err as { errCode?: number } | null)?.errCode;
      // 20002 closed the dialog or declined to log in; 10003 one is already open
      if (code === 20002 || code === 10003) return 'closed';
      // 15404 the platform's own daily cap
      if (code === 15404) {
        this.state.asks = ASKS_PER_DAY;
        this.save();
        return 'limit';
      }
      return 'error';
    }
  }

  private unlock() {
    this.state.unlocked = true;
    this.save();
  }

  private save() {
    write(KEY, this.state);
  }
}
