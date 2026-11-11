// Picks the background music for what is on screen and keeps it going, for all three entries
// (web, WeChat, Xiaohongshu): the App calls update() every frame.
//   - while pulling: the piece for the current scene tier, crossfading on a tier change,
//     and following the player's stride (Sound.onCadence)
//   - the grassland: its own piece, in its own time
//   - the title screen: the piece for the saved run's scene
// Music plays under the master volume, so the mute button and the phone's silent switch apply.
// Any error switches the music off for the session and leaves the game alone.
import type { App } from '../app';
import { tierOf } from '../config';
import { loadRun } from '../save';
import { Music, type Preset } from './engine';
import { PRESETS, SUMMER, caoyuan } from './presets';

const CROSSFADE = 6;

export class Director {
  enabled = true;
  volume = 0.5;
  /** one piece whatever the scene (web ?music=<id>, for listening) */
  fixed: Preset | null = null;
  private current: Music | null = null;
  private playing: Preset | null = null;
  private started = false;
  private broken = false;
  private wait = 0;
  private titleLevel: number | null = null;

  constructor(private app: App) {}

  /** the music playing now, for the console */
  get music() {
    return this.current;
  }

  get piece() {
    return this.playing?.id ?? null;
  }

  pick(id: string) {
    this.fixed = PRESETS.find((p) => p.id === id) ?? null;
  }

  update(dt: number) {
    if (!this.enabled || this.broken) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 0.5;
    try {
      // the sound starts on the player's first tap; until then there is nowhere to play
      const out = this.app.sound.musicOut();
      if (!out) return;
      if (!this.started) {
        this.started = true;
        this.app.sound.onCadence = (interval, steady) => this.current?.follow(interval, steady);
      }
      this.switchTo(this.fixed ?? this.pieceFor(), out);
      if (this.current && this.app.screen === 'freedom') this.current.free();
    } catch (e) {
      this.fail(e);
    }
  }

  private pieceFor(): Preset | null {
    const app = this.app;
    if (app.screen === 'freedom') return caoyuan;
    let level = app.game?.run.sceneLevel;
    if (level === undefined) level = this.titleLevel ??= loadRun()?.sceneLevel ?? 1;
    else this.titleLevel = null;
    return SUMMER[tierOf(level)];
  }

  private switchTo(p: Preset | null, out: { ctx: AudioContext; out: AudioNode }) {
    if (p === this.playing) return;
    const old = this.current;
    old?.stop(CROSSFADE);
    this.playing = p;
    this.current = null;
    if (!p) return;
    const m = new Music(out.ctx, out.out);
    if (old) m.inherit(old);
    m.play(p, this.volume, old ? CROSSFADE : 3);
    m.live((e) => this.fail(e));
    this.current = m;
  }

  private fail(e: unknown) {
    if (this.broken) return;
    this.broken = true;
    try {
      this.current?.stop(0.5);
    } catch {
      // nothing more to do
    }
    this.current = null;
    this.app.sound.onCadence = null;
    this.app.sound.onFail(`音乐关了：${e instanceof Error ? e.message : String(e)}`);
  }
}
