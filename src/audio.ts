// Everything but the birds is synthesised with Web Audio. The birds are short real recordings
// (public/sounds, CC0), and fall back to a synthesised chirp if those don't load.
// Kept quiet and soft on purpose: hooves, stone, wind, a few bells.
// The mini game's Web Audio is its own implementation: connect() may not return the
// node it connected to, and some node types are missing. So connections go through
// link(), and anything that throws switches the sound off instead of stopping the game.

import { platform } from './platform';
import { species, type Species } from './world/bird/coats';

export type BirdCall = 'song' | 'call';

/** a → b → c, without relying on connect() returning its destination */
function link(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

/** Write samples into a buffer; copyToChannel where it exists (a native engine may hand out a copy from getChannelData). */
function fill(buffer: AudioBuffer, channel: number, data: Float32Array<ArrayBuffer>) {
  if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(data, channel);
  else buffer.getChannelData(channel).set(data);
}

const AMBIENT_CALL = 0.06;

export class Sound {
  /** told when the sound gives up or doesn't start (the mini game shows it on screen while testing) */
  onFail: (reason: string) => void = (reason) => console.warn(reason);

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private grindGain!: GainNode;
  private windGain!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;
  private broken = false;
  private birdTimer = 4;
  private calls = new Map<string, AudioBuffer>();
  /** off once the engine rejects a pan: the mini game's own AudioParam has thrown on negative values */
  private canPan = true;

  /** Run `fn`; if the audio engine throws, go silent for good rather than break the game. */
  private safely(fn: () => void) {
    if (this.broken) return;
    try {
      fn();
    } catch (e) {
      this.broken = true;
      this.ctx = null;
      this.onFail(`声音关了：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Must be called from a user gesture. */
  start() {
    this.safely(() => this.open());
  }

  private open() {
    if (this.ctx) {
      void this.ctx.resume?.();
      return;
    }
    const ctx = platform.audioContext();
    if (!ctx) return;
    this.ctx = ctx;
    // a context made outside a gesture, or by a native engine, may start suspended
    if (ctx.state !== 'running') void ctx.resume?.();
    this.loadCalls(ctx);
    setTimeout(() => {
      if (this.ctx && this.ctx.state !== 'running') this.onFail(`声音没启动（${this.ctx.state}）`);
    }, 1500);
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = new Float32Array(this.noise.length);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // brown-ish noise: softer than white
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    fill(this.noise, 0, d);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.makeReverb(this.master));

    // stone grinding: filtered noise whose level follows walking speed
    this.grindGain = this.loopNoise(160, 1.2, 0);
    // wind: always there, quietly
    this.windGain = this.loopNoise(500, 0.4, 0.05);
  }

  /** A convolution tail; the mini game's Web Audio may lack convolvers, so fall back to echoes. */
  private makeReverb(out: AudioNode): AudioNode {
    const ctx = this.ctx!;
    if (typeof ctx.createConvolver === 'function') {
      const reverb = ctx.createConvolver();
      reverb.buffer = this.impulse(2.8);
      reverb.connect(out);
      return reverb;
    }
    // two damped feedback delays at unrelated lengths, enough to soften a bell
    const input = ctx.createGain();
    const wet = ctx.createGain();
    for (const [time, feedback] of [[0.13, 0.55], [0.21, 0.5]]) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = time;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2200;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      link(input, delay, tone, fb, delay);
      tone.connect(wet);
    }
    wet.gain.value = 0.6;
    wet.connect(out);
    return input;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = new Float32Array(len);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      fill(buf, c, ch);
    }
    return buf;
  }

  private loopNoise(freq: number, q: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level;
    link(src, f, g, this.master);
    src.start();
    return g;
  }

  toggleMute() {
    this.muted = !this.muted;
    this.safely(() => this.ctx && this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.1));
    return this.muted;
  }

  get isMuted() {
    return this.muted;
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, wet = 0.5) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      link(g, s, this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, dur: number, gain: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    link(src, f, g, this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  step(heavy: number) {
    this.safely(() => {
      this.burst(320 + Math.random() * 120, 0.12, 0.5 * heavy);
      this.tone(70 + Math.random() * 15, 0.14, 0.18 * heavy, 'sine', 0, 0);
    });
  }

  stumble() {
    this.safely(() => {
      this.burst(260, 0.25, 0.5);
      this.tone(55, 0.3, 0.2, 'sine', 0.05, 0);
    });
  }

  /** the callback form of decodeAudioData: the mini game's has no promise */
  private loadCalls(ctx: AudioContext) {
    // only this season's birds, so the background calls are theirs too
    for (const bird of species()) {
      for (const kind of ['song', 'call']) {
        const name = `${bird}-${kind}`;
        platform.readFile(`sounds/${name}.mp3`)
          .then((data) => new Promise<AudioBuffer>((done, fail) => void ctx.decodeAudioData(data, done, fail)))
          .then((buffer) => this.calls.set(name, buffer))
          .catch(() => this.onFail(`鸟叫没读到：${name}`));
      }
    }
  }

  /** a real bird. `from`, `to`: where it is, left -1 to right 1, over the length of the call */
  birdCall(species: Species, kind: BirdCall, level: number, from = 0, to = from) {
    this.play(this.calls.get(`${species}-${kind}`), level, from, to);
  }

  private play(buffer: AudioBuffer | undefined, level: number, from: number, to: number) {
    this.safely(() => {
      const ctx = this.ctx;
      if (!ctx || !buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // no two calls quite alike, from only a few recordings
      if (src.playbackRate) src.playbackRate.value = 0.96 + Math.random() * 0.08;
      const g = ctx.createGain();
      g.gain.value = level;
      const pan = this.panner(from, to, buffer.duration);
      if (pan) link(src, g, pan, this.master);
      else link(src, g, this.master);
      g.connect(this.reverbSend);
      src.start();
    });
  }

  /**
   * A panner moving from `from` to `to` over `seconds`, or null where panning isn't there or
   * isn't accepted. A rejected pan only turns panning off; the sound still plays, centred.
   */
  private panner(from: number, to: number, seconds: number): StereoPannerNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.canPan || typeof ctx.createStereoPanner !== 'function') return null;
    try {
      const now = ctx.currentTime;
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(from, now);
      if (to !== from && Number.isFinite(seconds) && seconds > 0) pan.pan.linearRampToValueAtTime(to, now + seconds);
      return pan;
    } catch {
      this.canPan = false;
      return null;
    }
  }

  /** Called each frame with the walking speed in [0, 1] and scene beauty in [0, 4]. */
  ambience(speed01: number, beauty: number, birdsong: boolean, dt: number) {
    this.safely(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.grindGain.gain.setTargetAtTime(speed01 * 0.22, now, 0.2);
      this.windGain.gain.setTargetAtTime(0.04 + beauty * 0.01, now, 1);
      if (birdsong) {
        this.birdTimer -= dt;
        if (this.birdTimer <= 0) {
          const all = [...this.calls.values()];
          if (all.length) {
            // somewhere off in the trees
            this.birdTimer = 9 + Math.random() * 11;
            const side = Math.random() * 1.6 - 0.8;
            this.play(all[Math.floor(Math.random() * all.length)], AMBIENT_CALL, side, side);
          } else {
            this.birdTimer = 5 + Math.random() * 9;
            this.bird();
          }
        }
      }
    });
  }

  private bird() {
    const ctx = this.ctx!;
    const base = 2400 + Math.random() * 1400;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = ctx.currentTime + i * 0.13;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      const side = Math.random() * 1.6 - 0.8;
      const pan = this.panner(side, side, 0);
      if (pan) link(o, g, pan, this.master);
      else link(o, g, this.master);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  upgrade(tierUp: boolean) {
    this.safely(() => {
      const notes = tierUp ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
      notes.forEach((f, i) => this.tone(f, 1.6, 0.07, 'sine', i * 0.09, 0.8));
    });
  }

  mirageAppear() {
    this.safely(() => {
      // a slow open chord, like heat over a field
      [293.66, 369.99, 440, 554.37].forEach((f, i) => {
        const ctx = this.ctx;
        if (!ctx) return;
        const t = ctx.currentTime + i * 0.25;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.03, t + 2.5);
        g.gain.linearRampToValueAtTime(0, t + 7);
        link(o, g, this.reverbSend);
        g.connect(this.master);
        o.start(t);
        o.stop(t + 7.2);
      });
    });
  }

  ropeTight() {
    this.safely(() => {
      this.tone(98, 0.6, 0.12, 'triangle', 0, 0.3);
      this.burst(900, 0.18, 0.25);
    });
  }

  snap() {
    this.safely(() => {
      this.burst(4000, 0.25, 0.6);
      this.tone(196, 2.5, 0.08, 'sine', 0.1, 1);
    });
  }

  /** A gentle pentatonic phrase for the grassland, looping until stopped. */
  freedomTheme() {
    this.safely(() => {
      const scale = [392, 440, 523.25, 587.33, 659.25, 783.99, 880];
      let t = 0.4;
      for (let bar = 0; bar < 16; bar++) {
        for (let n = 0; n < 4; n++) {
          const f = scale[Math.floor(Math.random() * scale.length)];
          this.tone(f, 2.4, 0.045, 'sine', t, 1);
          t += 0.6 + Math.random() * 0.3;
        }
        this.tone(196 * (bar % 2 ? 1.5 : 1), 4, 0.04, 'triangle', t - 2.4, 1);
      }
    });
  }
}
