// Picks the background music for what is on screen and keeps it going, for all three entries
// (web, WeChat, Xiaohongshu): the App calls update() every frame.
//   - while pulling: the piece for the current scene tier, crossfading on a tier change,
//     and following the player's stride (Sound.onCadence)
//   - the grassland: its own piece, in its own time
//   - the title screen: the piece for the saved run's scene, or a recorded track if the entry
//     gives one (WeChat: the user's Suno track, 2026-11-12); pulling and the grassland stay synthesised
// Music plays under the master volume, so the mute button and the phone's silent switch apply.
// Any error switches the music off for the session and leaves the game alone.
import type { App } from '../app';
import { tierOf } from '../config';
import { platform } from '../platform';
import { loadRun } from '../save';
import { Music, type Preset } from './engine';
import { PRESETS, SUMMER, caoyuan } from './presets';

const CROSSFADE = 6;

/**
 * A recorded loop for the title screen. The file holds a second of lead-in and a second of
 * run-out around the loop, so the loop points survive a decoder that pads the start.
 */
export type TitleTrack = { file: string; loopStart: number; loopEnd: number; gain: number };

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
  /** set by the entry that has one */
  title: TitleTrack | null = null;
  private titleBuffer: AudioBuffer | null = null;
  private titleLoading = false;
  private titlePlaying: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

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
      if (this.title && !this.fixed && this.app.screen === 'title') {
        this.loadTitle(out.ctx);
        // nothing while it decodes (a moment); then the recording instead of a synthesised piece
        this.switchTo(null, out);
        if (this.titleBuffer) this.startTitle(out);
        return;
      }
      this.stopTitle();
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

  /** the callback form of decodeAudioData: the mini game's has no promise. A failure just means no recording. */
  private loadTitle(ctx: AudioContext) {
    if (this.titleLoading || !this.title) return;
    this.titleLoading = true;
    const giveUp = (e: unknown) => {
      this.title = null;
      this.app.sound.onFail(`封面音乐没读到：${e instanceof Error ? e.message : String(e)}`);
    };
    platform
      .readFile(this.title.file)
      .then((data) => new Promise<AudioBuffer>((done, fail) => void ctx.decodeAudioData(data, done, fail)))
      .then((b) => (this.titleBuffer = b), giveUp);
  }

  private startTitle(out: { ctx: AudioContext; out: AudioNode }) {
    if (this.titlePlaying || !this.title || !this.titleBuffer) return;
    const ctx = out.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.titleBuffer;
    src.loop = true;
    src.loopStart = this.title.loopStart;
    src.loopEnd = Math.min(this.title.loopEnd, this.titleBuffer.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.volume * this.title.gain, now + 2.5);
    src.connect(gain);
    gain.connect(out.out);
    src.start(now);
    this.titlePlaying = { src, gain };
  }

  /** out under the music that takes over */
  private stopTitle() {
    const t = this.titlePlaying;
    if (!t) return;
    this.titlePlaying = null;
    const ctx = t.gain.context;
    const now = ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(t.gain.gain.value, now);
    t.gain.gain.linearRampToValueAtTime(0, now + 4);
    t.src.stop(now + 4.2);
  }

  private fail(e: unknown) {
    this.stopTitle();
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
