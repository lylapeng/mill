// Every sound is synthesised with Web Audio — no audio files in the repo.
// Kept quiet and soft on purpose: hooves, stone, wind, a few bells.

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private grindGain!: GainNode;
  private windGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;
  private birdTimer = 4;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // brown-ish noise: softer than white
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.master);

    // stone grinding: filtered noise whose level follows walking speed
    this.grindGain = this.loopNoise(160, 1.2, 0);
    // wind: always there, quietly
    this.windGain = this.loopNoise(500, 0.4, 0.05);
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
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
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.1);
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
      g.connect(s).connect(this.reverbSend);
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
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  step(heavy: number) {
    this.burst(320 + Math.random() * 120, 0.12, 0.5 * heavy);
    this.tone(70 + Math.random() * 15, 0.14, 0.18 * heavy, 'sine', 0, 0);
  }

  stumble() {
    this.burst(260, 0.25, 0.5);
    this.tone(55, 0.3, 0.2, 'sine', 0.05, 0);
  }

  /** Called each frame with the walking speed in [0, 1] and scene beauty in [0, 4]. */
  ambience(speed01: number, beauty: number, dt: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.grindGain.gain.setTargetAtTime(speed01 * 0.22, now, 0.2);
    this.windGain.gain.setTargetAtTime(0.04 + beauty * 0.01, now, 1);
    if (beauty >= 1.5) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 5 + Math.random() * 9;
        this.bird();
      }
    }
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
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(g).connect(pan).connect(this.master);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  upgrade(tierUp: boolean) {
    const notes = tierUp ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
    notes.forEach((f, i) => this.tone(f, 1.6, 0.07, 'sine', i * 0.09, 0.8));
  }

  mirageAppear() {
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
      o.connect(g).connect(this.reverbSend);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 7.2);
    });
  }

  ropeTight() {
    this.tone(98, 0.6, 0.12, 'triangle', 0, 0.3);
    this.burst(900, 0.18, 0.25);
  }

  snap() {
    this.burst(4000, 0.25, 0.6);
    this.tone(196, 2.5, 0.08, 'sine', 0.1, 1);
  }

  /** A gentle pentatonic phrase for the grassland, looping until stopped. */
  freedomTheme() {
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
  }
}
