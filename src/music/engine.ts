// Background music, synthesised as it plays: no audio files.
// Three buses the game can mix separately:
//   bed   — held harmony: breathing or bowed tones on a slowly changing chord
//   notes — the instruments: single notes and short phrases, a second voice answering
//   air   — wind and a fine high shimmer of grains
// Events are scheduled ahead by schedule(until): a timer calls it while playing live,
// and an offline render calls it once for the whole length.
// The music follows the player's stride: its beat glides toward their steps, and the steadier
// they walk the more notes (and whole phrases) land on them. Nothing is triggered by a step.
// Same rules as audio.ts: link() instead of chained connect(), no panner where the
// engine has none, and the caller wraps everything so an error only silences the music.
// The mini game's Web Audio is its own: no AudioParam is ever set to a negative value (pitch
// offsets go into frequency), and modulating a parameter with an oscillator (vibrato, breath,
// gusts) goes through mod(), which gives up on that nicety if the engine refuses it.

import { fill, link, makeReverb } from '../audio';

export type Voice = 'kantele' | 'celesta' | 'glass' | 'flute' | 'cello' | 'pluck' | 'wood' | 'harp' | 'kalimba' | 'marimba';
export type Bus = 'bed' | 'notes' | 'air';

/** `low`: a low drone note under the chord, heard only in phases that ask for it */
export type Chord = { notes: number[]; low?: number };

/** Sections that take turns. `mute`: voices (by index) that rest in this section. */
export type Phase = { seconds: [number, number]; density: number; low: number; mute?: number[]; arp?: boolean };

/**
 * A short phrase, written by hand so it can come back and be recognised.
 * `steps`: positions in the voice's pool, relative to where the phrase starts;
 * `beats`: how long each note lasts before the next, in beats (the last one is how long it rings).
 */
export type Motif = { steps: number[]; beats: number[]; then?: Motif };

/**
 * A soft broken chord that keeps the music moving: chord tones in a pattern, one per beat
 * (so while the player walks steadily, one per stride). It rests when they stand still.
 * `pattern`: which chord tone (0 = lowest; past the top goes up an octave), -1 a rest.
 */
export type Arp = { voice: Voice; pattern: number[]; vel: number; octave: number; beats: number };

export type NoteVoice = {
  voice: Voice;
  /** MIDI notes it may play, low to high */
  pool: number[];
  /** seconds between turns */
  gap: [number, number];
  /** chance that a gap is a long silence instead (×3) */
  hush: number;
  vel: number;
  /** chance a note is pulled onto the current chord */
  chordBias: number;
  /** chance the next single note steps down rather than jumping back up */
  fall: number;
  /** chance of playing the same note again */
  repeat?: number;
  /** seconds a held instrument (flute, cello) sounds for a single note */
  hold?: [number, number];
  /** chance a turn is one of the motifs instead of a single note; `vary`: chance it comes back changed */
  phrase?: { prob: number; motifs: Motif[]; vary: number };
  /** another voice answering: a single note above, or (echo) the phrase it just heard, in its own register */
  answer?: { voice: Voice; pool: number[]; prob: number; delay: [number, number]; vel: number; echo?: boolean };
};

export type Preset = {
  id: string;
  title: string;
  gain: number;
  reverb: { seconds: number; wet: number };
  /** seconds per beat when nobody is walking; while walking it snaps to whole steps */
  beat?: number;
  bed: {
    level: number;
    cutoff: number;
    /** how long each chord holds, and its crossfade */
    hold: [number, number];
    fade: number;
    /** breath noise against tone, 0..1 */
    breath: number;
    /** detune in cents between the two oscillators of a tone: the shimmer */
    shimmer: number;
    /** 'bow': a soft bowed string instead of a breathing tone; 'pad': a warm analogue-synth pad (Blade Runner-like) */
    tone?: 'breath' | 'bow' | 'pad';
    root?: { note: number; level: number };
  };
  chords: Chord[];
  /** 'cycle' walks the chords in the written order (a direction); otherwise they are drawn at random */
  order?: 'cycle' | 'random';
  /** taken in order and repeated; without them the notes keep one pace */
  phases?: Phase[];
  arp?: Arp;
  notes: { level: number; cutoff?: number; voices: NoteVoice[] };
  air: { level: number; wind: number; grains: number; grainPool: number[] };
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const cents = (c: number) => Math.pow(2, c / 1200);
const nearest = (pool: number[], n: number) => pool.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

type Line = { gain: GainNode; lp: BiquadFilterNode };

export class Music {
  readonly ctx: BaseAudioContext;
  private out: GainNode;
  private send: GainNode;
  private reverbIn: AudioNode | null = null;
  private buses: Record<Bus, Line>;
  private white: AudioBuffer;
  private brown: AudioBuffer;
  private preset: Preset | null = null;
  private nextChord = 0;
  private chord: Chord = { notes: [] };
  private chordIdx = -1;
  private nextNote: number[] = [];
  private lastNote: number[] = [];
  private lastMotif: (Motif | null)[] = [];
  private nextGrain = 0;
  private nextArp = 0;
  private lastArp = -1;
  private arpStep = 0;
  private timeline: { end: number; phase: Phase }[] = [];
  private phaseIdx = -1;
  private loops: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private canPan: boolean;
  private canMod = true;
  /** how busy the notes are, 1 = as the preset says */
  density = 1;
  private period = 0.7;
  private anchor = 0;
  private lock = 0;
  private lastStep = -1;
  /** false in the grassland: nobody is pulling, so the music keeps its own time at full pace */
  private following = true;
  /** recent note times, for checking the lock from the console */
  readonly log: number[] = [];
  /** notes played so far, by instrument (for measuring) */
  readonly played: Partial<Record<Voice, number>> = {};

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    const line = (): Line => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 20000;
      const gain = ctx.createGain();
      link(lp, gain, this.out);
      gain.connect(this.send);
      return { gain, lp };
    };
    this.buses = { bed: line(), notes: line(), air: line() };
    this.canPan = typeof ctx.createStereoPanner === 'function';
    this.white = this.noise(() => Math.random() * 2 - 1);
    this.brown = this.noise((last) => ((last + 0.02 * (Math.random() * 2 - 1)) / 1.02) * 3.5);
  }

  private noise(next: (last: number) => number) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = new Float32Array(buf.length);
    let last = 0;
    for (let i = 0; i < d.length; i++) d[i] = last = next(last / 3.5);
    fill(buf, 0, d);
    return buf;
  }

  play(p: Preset, volume = 1, fadeIn = 3) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.preset = p;
    if (!this.reverbIn) {
      this.reverbIn = makeReverb(ctx, this.out, p.reverb.seconds);
      this.send.connect(this.reverbIn);
    }
    this.send.gain.value = p.reverb.wet;
    this.buses.bed.gain.gain.value = p.bed.level;
    this.buses.bed.lp.frequency.value = p.bed.cutoff;
    this.buses.notes.gain.gain.value = p.notes.level;
    this.buses.notes.lp.frequency.value = p.notes.cutoff ?? 20000;
    this.buses.air.gain.gain.value = p.air.level;
    this.timeline = [];
    this.phaseIdx = -1;
    this.chordIdx = -1;
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(p.gain * volume, now + fadeIn);
    this.nextChord = now + 0.1;
    this.nextNote = p.notes.voices.map((_, i) => now + 1.5 + i * rand(2, 5));
    this.lastNote = p.notes.voices.map((v) => v.pool[Math.floor(v.pool.length * 0.7)]);
    this.nextGrain = now + 2;
    this.nextArp = now + 4;
    this.arpStep = 0;
    this.startWind(p.air.wind);
    if (p.bed.root) this.startRoot(p.bed.root.note, p.bed.root.level);
  }

  /** Keep scheduling a little ahead while playing live. `onFail`: the music has stopped itself after an error. */
  live(onFail?: (e: unknown) => void, lookahead = 2.5) {
    if (this.timer) return;
    const tick = () => {
      try {
        this.schedule(this.ctx.currentTime + lookahead);
      } catch (e) {
        try {
          this.stop(0.5);
        } catch {
          // already broken: nothing more to do
        }
        onFail?.(e);
      }
    };
    tick();
    this.timer = setInterval(tick, 400);
  }

  /** an oscillator (through its depth) moving a parameter; skipped where the engine won't have it */
  private mod(node: AudioNode, param: AudioParam | undefined) {
    if (!this.canMod || !param) return;
    try {
      node.connect(param);
    } catch {
      this.canMod = false;
    }
  }

  stop(fade = 1.5) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fade);
    for (const l of this.loops) l.stop(now + fade + 0.5);
    this.loops = [];
    this.preset = null;
    // notes already scheduled ring out under the fade; then let go of the graph
    setTimeout(() => this.out.disconnect(), (fade + 8) * 1000);
  }

  setLevel(bus: Bus, v: number, seconds = 2) {
    this.buses[bus].gain.gain.setTargetAtTime(v, this.ctx.currentTime, seconds / 3);
  }

  setCutoff(bus: Bus, hz: number, seconds = 2) {
    this.buses[bus].lp.frequency.setTargetAtTime(hz, this.ctx.currentTime, seconds / 3);
  }

  // ── following the stride ────────────────────────────────────────────

  /** A step landed now. `interval`: seconds since the last one; `steady`: 0..1, how even the stride is. */
  follow(interval: number, steady: number) {
    this.following = true;
    const now = this.ctx.currentTime;
    if (interval > 0.25 && interval < 1.5) {
      // The grid is counted from the latest step, half way between where it predicted this step and
      // where it actually landed. (It used to be counted from the first step of the run, so a tiny
      // change of tempo, multiplied over a hundred beats, threw the next predicted step off by 100 ms+.)
      if (this.lastStep < 0 || now - this.lastStep > 1.5) this.anchor = now;
      else {
        const grid = this.anchor + Math.round((now - this.anchor) / this.period) * this.period;
        this.anchor = grid + (now - grid) * 0.5;
      }
      // a quarter of the way per step, so the tempo eases over rather than jumps
      this.period += (interval - this.period) * 0.25;
    }
    this.lock += (steady - this.lock) * 0.2;
    this.lastStep = now;
  }

  /** Take over another piece's grip on the stride, so a crossfade doesn't drop the beat. */
  inherit(from: Music) {
    this.period = from.period;
    this.anchor = from.anchor;
    this.lock = from.lock;
    this.lastStep = from.lastStep;
    this.following = from.following;
  }

  /** Stop following (the grassland): full pace, own time. */
  free() {
    this.following = false;
    this.lock = 0;
  }

  /** how walking the player is right now: 1 while stepping, fading out a few seconds after they stop */
  private walking() {
    if (!this.following) return 1;
    if (this.lastStep < 0) return 0.6;
    const idle = this.ctx.currentTime - this.lastStep;
    return idle < 1.5 ? 1 : Math.exp(-(idle - 1.5) / 4);
  }

  private locked() {
    return this.lock * this.walking();
  }

  /** move t onto the next predicted step, as often as the player is locked in */
  private onBeat(t: number) {
    const lock = this.locked();
    if (lock < 0.05 || Math.random() > lock) return t;
    return this.anchor + Math.ceil((t - this.anchor) / this.period) * this.period;
  }

  /** while locked, the step nearest t; otherwise t */
  private grid(t: number) {
    if (this.locked() < 0.5) return t;
    return this.anchor + Math.round((t - this.anchor) / this.period) * this.period;
  }

  /** seconds per beat for a phrase: the preset's own, or the nearest whole number of steps */
  private beatSeconds(p: Preset) {
    const free = p.beat ?? 0.9;
    if (this.locked() < 0.5) return free;
    return Math.max(1, Math.round(free / this.period)) * this.period;
  }

  // ── scheduling ──────────────────────────────────────────────────────

  /** Schedule everything that starts before `until` (seconds on the context clock). */
  schedule(until: number) {
    const p = this.preset;
    if (!p) return;
    const walking = this.walking();
    // standing still thins the notes out; a steady stride fills them in a little
    const pace = (0.35 + 0.65 * walking) * (1 + 0.6 * this.locked());
    while (this.nextChord < until) {
      const hold = rand(p.bed.hold[0], p.bed.hold[1]);
      let i: number;
      if (p.order === 'cycle') i = (this.chordIdx + 1) % p.chords.length;
      else {
        i = Math.floor(Math.random() * p.chords.length);
        if (p.chords.length > 1 && i === this.chordIdx) i = (i + 1) % p.chords.length;
      }
      this.chordIdx = i;
      this.chord = p.chords[i];
      for (const n of this.chord.notes) this.bedTone(this.nextChord, n, hold + p.bed.fade, p);
      const low = this.phaseAt(this.nextChord)?.low ?? 0;
      if (this.chord.low !== undefined && low > 0) this.bedTone(this.nextChord, this.chord.low, hold + p.bed.fade, p, low);
      this.nextChord += hold;
    }
    p.notes.voices.forEach((v, i) => {
      while (this.nextNote[i] < until) {
        const t = this.nextNote[i];
        const phase = this.phaseAt(t);
        let end = t;
        if (!phase?.mute || phase.mute.indexOf(i) < 0) end = this.turn(p, v, i, t);
        let gap = rand(v.gap[0], v.gap[1]);
        if (Math.random() < v.hush) gap *= 3;
        this.nextNote[i] = end + gap / Math.max(0.05, this.density * pace * (phase?.density ?? 1));
      }
    });
    const arp = p.arp;
    if (arp) {
      // While the player walks, the broken chord goes with their actual steps: one note per step (every
      // other one if they hurry), on the next predicted step, and only half a second ahead, so a change
      // of stride is heard straight away. It used to keep the piece's own beat unless the stride was
      // steady, and was laid out 2.5 s ahead, so changing pace changed nothing you could hear.
      const now = this.ctx.currentTime;
      const stepping = this.following && this.lastStep >= 0 && walking > 0.5;
      const horizon = stepping ? Math.min(until, now + 0.5) : until;
      while (this.nextArp < horizon) {
        let t = this.nextArp;
        let step: number;
        if (stepping) {
          step = (this.period < 0.45 ? 2 : 1) * this.period * arp.beats;
          // the nearest predicted step, but never the one the last note already took
          t = this.anchor + Math.round((Math.max(t, now + 0.02) - this.anchor) / this.period) * this.period;
          while (t < now + 0.02 || t < this.lastArp + step * 0.6) t += this.period;
        } else step = this.beatSeconds(p) * arp.beats;
        const k = arp.pattern[this.arpStep % arp.pattern.length];
        const downbeat = this.arpStep % arp.pattern.length === 0;
        this.arpStep++;
        if ((this.phaseAt(t)?.arp ?? true) && walking > 0.5 && k >= 0 && this.chord.notes.length) {
          const tones = this.chord.notes.slice().sort((a, b) => a - b);
          const note = tones[k % tones.length] + arp.octave + 12 * Math.floor(k / tones.length);
          this.strike(arp.voice, stepping ? t : this.grid(t), note, arp.vel * rand(0.8, 1) * (downbeat ? 1.2 : 1), step * 0.9);
        }
        this.lastArp = t;
        this.nextArp = t + step;
      }
    }
    if (p.air.grains > 0) {
      while (this.nextGrain < until) {
        this.grain(this.nextGrain, pick(p.air.grainPool));
        this.nextGrain += -Math.log(1 - Math.random()) / p.air.grains;
      }
    }
  }

  /** One turn of a voice: a single note or a phrase, and maybe an answer. Returns when it ends. */
  private turn(p: Preset, v: NoteVoice, i: number, t: number) {
    const start = this.onBeat(t);
    let notes: number[];
    let times: number[];
    let lens: number[];
    // notes after which a wind player takes a breath (the long ones inside a phrase)
    let breathAfter: number[] = [];
    if (v.phrase && Math.random() < v.phrase.prob) {
      // never the same motif twice running
      const fresh = v.phrase.motifs.filter((x) => x !== this.lastMotif[i]);
      const chosen = pick(fresh.length ? fresh : v.phrase.motifs);
      this.lastMotif[i] = chosen;
      // a question and its answer are one long phrase, the question's last note a breath between them
      const whole: Motif = chosen.then
        ? { steps: chosen.steps.concat(chosen.then.steps), beats: chosen.beats.concat(chosen.then.beats) }
        : chosen;
      const m = this.vary(whole, v.phrase.vary);
      const beat = this.beatSeconds(p);
      // start on a chord tone in the upper-middle of the pool, so the phrase has room to move
      const lowest = Math.min(...m.steps), highest = Math.max(...m.steps);
      const room = v.pool.slice(Math.max(0, -lowest), Math.max(1, v.pool.length - Math.max(0, highest)));
      const pcs = this.chord.notes.map((n) => n % 12);
      const onChord = room.filter((n) => pcs.indexOf(n % 12) >= 0);
      const first = nearest(onChord.length ? onChord : room, this.lastNote[i]);
      const at = v.pool.indexOf(first);
      notes = m.steps.map((s) => v.pool[Math.max(0, Math.min(v.pool.length - 1, at + s))]);
      times = [];
      lens = [];
      let clock = start;
      // each note let go a little before the next (a player breathes between notes), and a long
      // one is not held at full length: the first summer flute held its last note 3–5 s, flat
      m.beats.forEach((b, k) => {
        if (b >= 3 && k < m.beats.length - 1) breathAfter.push(k);
        times.push(clock);
        lens.push(Math.max(0.35, Math.min(b * beat * 0.85, k === m.beats.length - 1 ? 2.2 : 1.6)));
        clock += b * beat;
      });
    } else {
      notes = [this.choose(v, i)];
      times = [start];
      const h = v.hold ?? [1.5, 3];
      lens = [rand(h[0], h[1])];
    }
    // shape: louder toward the high notes, the last one let go softly
    const hi = Math.max(...notes), lo = Math.min(...notes);
    const vels = notes.map((n, k) => {
      const shape = notes.length < 2 ? 1 : (0.8 + (0.3 * (n - lo)) / Math.max(1, hi - lo)) * (k === notes.length - 1 ? 0.85 : 1);
      return v.vel * rand(0.85, 1) * shape;
    });
    if (v.voice === 'flute') {
      // one breath per stretch of the phrase, a new breath after each long note
      let s = 0;
      for (let k = 0; k < notes.length; k++) {
        if (k < notes.length - 1 && breathAfter.indexOf(k) < 0) continue;
        this.played.flute = (this.played.flute ?? 0) + k - s + 1;
        this.flute(times.slice(s, k + 1), notes.slice(s, k + 1).map(mtof), vels.slice(s, k + 1), lens[k]);
        s = k + 1;
      }
    } else {
      const graces = v.voice === 'kalimba' || v.voice === 'marimba' || v.voice === 'kantele';
      notes.forEach((n, k) => {
        // now and then a quick note from just above, as a player's ornament (not on the first or a quick note)
        if (graces && k > 0 && lens[k] > 0.6 && Math.random() < 0.15) {
          const above = v.pool.filter((x) => x > n);
          if (above.length) this.strike(v.voice, times[k] - 0.08, above[0], vels[k] * 0.45, 0.2);
        }
        this.strike(v.voice, times[k], n, vels[k], lens[k]);
      });
    }
    for (const t of times) this.log.push(t);
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    this.lastNote[i] = notes[notes.length - 1];
    // the next turn is counted from soon after the last note starts, not from when it has died away
    const end = times[times.length - 1] + Math.min(lens[lens.length - 1], 1.5);
    const a = v.answer;
    if (a && Math.random() < a.prob) {
      const when = this.onBeat(end + rand(a.delay[0], a.delay[1]));
      if (a.echo && notes.length > 1) {
        // the tail of the phrase (up to four notes), moved into the answering voice's register
        const from = Math.max(0, notes.length - 4);
        const tail = notes.slice(from);
        const mean = tail.reduce((x, y) => x + y, 0) / tail.length;
        const mid = (a.pool[0] + a.pool[a.pool.length - 1]) / 2;
        const shift = Math.round((mid - mean) / 12) * 12;
        const offset = when - times[from];
        tail.forEach((n, k) =>
          this.strike(a.voice, times[from + k] + offset, nearest(a.pool, n + shift), a.vel * rand(0.7, 1), lens[from + k]),
        );
        return times[times.length - 1] + offset + Math.min(lens[lens.length - 1], 1.5);
      }
      const above = a.pool.filter((n) => n > notes[notes.length - 1]);
      this.strike(a.voice, when, pick(above.length ? above : a.pool), a.vel * rand(0.6, 1), rand(1.5, 3));
    }
    return end;
  }

  /** A motif coming back a little changed, so it is recognised without being a loop. */
  private vary(m: Motif, chance: number): Motif {
    if (Math.random() >= chance || m.steps.length < 2) return m;
    let steps = m.steps.slice();
    let beats = m.beats.slice();
    switch (Math.floor(Math.random() * 7)) {
      case 0: // leave off the last note, the one before it rings instead
        steps.pop();
        beats.pop();
        beats[beats.length - 1] = Math.max(beats[beats.length - 1], 2);
        break;
      case 1: // one inner note a step higher or lower
        steps[1 + Math.floor(Math.random() * (steps.length - 1))] += Math.random() < 0.5 ? 1 : -1;
        break;
      case 2: // slower
        for (let k = 0; k < beats.length; k++) beats[k] *= 1.5;
        break;
      case 3: // the end turns the other way
        steps[steps.length - 1] = steps[steps.length - 2] - (steps[steps.length - 1] - steps[steps.length - 2]);
        break;
      case 4: // the same shape, a step or two higher or lower (a sequence)
        {
          const by = pick([-2, -1, 1, 2]);
          steps = steps.map((x) => x + by);
        }
        break;
      case 5: {
        // a long inner note split in two, the second a neighbour (a passing note)
        const long = beats.slice(0, -1).map((b, k) => (b >= 2 ? k : -1)).filter((k) => k >= 0);
        if (!long.length) break;
        const k = pick(long);
        const half = beats[k] / 2;
        steps.splice(k + 1, 0, steps[k] + (steps[k + 1] >= steps[k] ? 1 : -1));
        beats.splice(k, 1, half, half);
        break;
      }
      default: {
        // two quick notes where one was: dotted, a little lift in the rhythm
        const k = Math.floor(Math.random() * (beats.length - 1));
        if (beats[k] < 1) break;
        steps.splice(k + 1, 0, steps[k] + 1);
        beats.splice(k, 1, beats[k] * 0.75, beats[k] * 0.25);
      }
    }
    return { steps, beats };
  }

  /** the phase playing at time t (phases are laid out ahead as needed) */
  private phaseAt(t: number): Phase | null {
    const phases = this.preset?.phases;
    if (!phases || !phases.length) return null;
    let last = this.timeline.length ? this.timeline[this.timeline.length - 1].end : this.ctx.currentTime;
    while (last <= t) {
      this.phaseIdx = (this.phaseIdx + 1) % phases.length;
      const ph = phases[this.phaseIdx];
      last += rand(ph.seconds[0], ph.seconds[1]);
      this.timeline.push({ end: last, phase: ph });
    }
    while (this.timeline.length > 1 && this.timeline[0].end < t - 60) this.timeline.shift();
    for (const seg of this.timeline) if (t < seg.end) return seg.phase;
    return this.timeline[this.timeline.length - 1].phase;
  }

  /** A single note: mostly drifting down the pool, now and then lifted back up. */
  private choose(v: NoteVoice, i: number) {
    const pool = v.pool;
    if (v.repeat && Math.random() < v.repeat) return this.lastNote[i];
    let at = pool.indexOf(this.lastNote[i]);
    if (at < 0) at = pool.length - 1;
    if (Math.random() < v.fall && at > 0) at -= Math.random() < 0.7 ? 1 : Math.min(at, 2);
    else at = Math.floor(rand(pool.length * 0.5, pool.length));
    let note = pool[at];
    if (Math.random() < v.chordBias && this.chord.notes.length) {
      const pcs = this.chord.notes.map((n) => n % 12);
      const on = pool.filter((n) => pcs.indexOf(n % 12) >= 0);
      if (on.length) note = nearest(on, note);
    }
    this.lastNote[i] = note;
    return note;
  }

  // ── instruments ─────────────────────────────────────────────────────

  private panned(node: AudioNode, bus: Bus, pan: number) {
    const dest = this.buses[bus].lp;
    if (this.canPan) {
      try {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan;
        link(node, p, dest);
        return;
      } catch {
        this.canPan = false;
      }
    }
    node.connect(dest);
  }

  private strike(voice: Voice, t: number, note: number, vel: number, dur: number) {
    this.played[voice] = (this.played[voice] ?? 0) + 1;
    const f = mtof(note);
    const pan = rand(-0.6, 0.6);
    switch (voice) {
      case 'kantele':
        // a harmonic on a plucked string: nearly pure, two strings a hair apart, a soft click
        this.partials(t, f, vel, pan, [[1, 1, 5.5], [1.0012, 0.6, 5], [2, 0.12, 1.4], [3, 0.04, 0.5]], 0.004);
        this.click(t, f * 2, vel * 0.12, pan, 3);
        break;
      case 'celesta':
        // a struck bar in a box: round fundamental, a quick metallic edge
        this.partials(t, f, vel, pan, [[1, 1, 2.8], [4, 0.22, 0.3], [10.2, 0.05, 0.07]], 0.002);
        break;
      case 'glass':
        this.partials(t, f, vel, pan, [[1, 1, 4], [2.76, 0.3, 2.2], [5.4, 0.12, 0.9]], 0.003);
        break;
      case 'pluck':
        this.pluck(t, f, vel, pan);
        break;
      case 'wood':
        // a hollow wooden knock: a short round tone, its bar overtone, a little thud
        this.partials(t, f, vel, pan, [[1, 1, 0.7], [3.93, 0.18, 0.12]], 0.003);
        this.click(t, f * 2, vel * 0.25, pan, 8);
        break;
      case 'harp': {
        // a nylon string plucked with a finger: warm, the upper partials dying first, longer low down
        const ring = Math.min(4, 2.2 * Math.sqrt(440 / f));
        this.partials(t, f, vel, pan, [[1, 1, ring], [2, 0.42, ring * 0.6], [3, 0.18, ring * 0.35], [4, 0.08, ring * 0.22], [5, 0.035, ring * 0.15]], 0.005);
        this.click(t, f * 3, vel * 0.06, pan, 3);
        break;
      }
      case 'kalimba':
        // a metal tine in a wooden box: round fundamental, its high overtone gone almost at once
        this.partials(t, f, vel, pan, [[1, 1, 1.8], [2, 0.08, 0.6], [5.9, 0.12, 0.12]], 0.003);
        this.click(t, f * 2, vel * 0.08, pan, 4);
        break;
      case 'marimba':
        // a wooden bar under a soft mallet: the tuned overtones (4 and 10) fade fast
        this.partials(t, f, vel, pan, [[1, 1, Math.min(1.6, 0.9 * Math.sqrt(440 / f))], [4, 0.18, 0.18], [10, 0.03, 0.05]], 0.006);
        break;
      case 'flute':
        this.flute([t], [f], [vel], dur);
        break;
      case 'cello':
        this.bowed(t, f, vel, dur, pan);
        break;
    }
  }

  private partials(t: number, f: number, vel: number, pan: number, list: number[][], attack: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vel;
    this.panned(g, 'notes', pan);
    for (const [ratio, amp, decay] of list) {
      if (f * ratio > 16000) continue;
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(amp, t + attack);
      e.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      link(o, e, g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  private click(t: number, f: number, gain: number, pan: number, q: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(f, 12000);
    bp.Q.value = q;
    const e = ctx.createGain();
    e.gain.setValueAtTime(gain, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    link(src, bp, e);
    this.panned(e, 'notes', pan);
    src.start(t, Math.random() * 2, 0.08);
  }

  /** a muted plucked string: bright for an instant, then dull and short */
  private pluck(t: number, f: number, vel: number, pan: number) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(f * 8, 7000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + 0.25);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(vel, t + 0.003);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    link(lp, e);
    this.panned(e, 'notes', pan);
    for (const [type, ratio, amp] of [['triangle', 1, 1], ['sine', 2, 0.3]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.value = amp;
      link(o, g, lp);
      o.start(t);
      o.stop(t + 1.05);
    }
    this.click(t, f * 3, vel * 0.1, pan, 2);
  }

  /** a soft vibrato that only starts once the note has settled */
  private vibrato(t: number, dur: number, rate: number, cents: number, targets: AudioParam[]) {
    const ctx = this.ctx;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate * rand(0.92, 1.08);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + Math.min(0.4, dur * 0.4));
    depth.gain.linearRampToValueAtTime(cents, t + Math.min(1.1, dur * 0.8));
    link(lfo, depth);
    for (const p of targets) this.mod(depth, p);
    lfo.start(t);
    lfo.stop(t + dur + 1.5);
  }

  /**
   * A wooden flute, played the way a person plays it: a phrase is one breath. The air never stops
   * between its notes; the fingers only change the pitch, which slides across in a few hundredths
   * of a second, and the loudness follows the breath through the whole phrase. Only its first note
   * speaks (with a small chiff); the next breath starts a new line. The first versions started
   * every note afresh, swell and chiff and all, and sounded one note at a time (user, 2026-11-11).
   * Tone: a strong fundamental with a few soft harmonics, no air noise, breath that wavers,
   * a vibrato mostly in the loudness that relaxes as each note changes and grows on long ones.
   * `times`, `fs`, `vels`: the notes of the breath; `last`: how long its last note sounds.
   */
  private flute(times: number[], fs: number[], vels: number[], last: number, pan = rand(-0.6, 0.6)) {
    const ctx = this.ctx;
    const n = times.length;
    const t0 = times[0];
    const off = times[n - 1] + Math.max(0.2, last);
    const end = off + 0.8;
    const next = (k: number) => (k + 1 < n ? times[k + 1] : off);
    // loudness: speaks, fills out, moves smoothly to each note's level (no dip between notes),
    // eases off a little on a long note, and lets go at the end of the breath
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t0);
    e.gain.linearRampToValueAtTime(vels[0] * 0.8, t0 + 0.07);
    e.gain.linearRampToValueAtTime(vels[0], t0 + Math.min(0.3, (next(0) - t0) * 0.8));
    for (let k = 0; k < n; k++) {
      const len = next(k) - times[k];
      if (k > 0) e.gain.setTargetAtTime(vels[k], times[k], 0.06);
      if (len > 0.6) e.gain.setTargetAtTime(vels[k] * (k === n - 1 ? 0.6 : 0.82), times[k] + 0.35, len * 0.6);
    }
    e.gain.setTargetAtTime(0, off, 0.12);
    this.panned(e, 'notes', pan);
    // breath: a slow waver, and the vibrato, both in loudness
    const breath = ctx.createGain();
    breath.gain.value = 1;
    link(breath, e);
    const waver = ctx.createOscillator();
    // from the notes themselves rather than Math.random, so a change of timbre doesn't change the tune
    const jitter = Math.abs(Math.sin(t0 * 12.9898 + fs[0] * 0.0781) * 43758.5453) % 1;
    waver.frequency.value = 0.3 + 0.4 * jitter;
    const waverDepth = ctx.createGain();
    waverDepth.gain.value = 0.06;
    link(waver, waverDepth);
    this.mod(waverDepth, breath.gain);
    const vib = ctx.createOscillator();
    vib.frequency.value = rand(4.6, 5.4);
    const vibDepth = ctx.createGain();
    const vibPitch = ctx.createGain();
    // the vibrato relaxes as a note changes and grows again if the note is held
    for (const [param, full] of [[vibDepth.gain, 0.07], [vibPitch.gain, 3]] as const) {
      param.setValueAtTime(0, t0);
      for (let k = 0; k < n; k++) {
        const len = next(k) - times[k];
        if (k > 0) param.setTargetAtTime(full * 0.2, times[k], 0.03);
        param.setTargetAtTime(len > 0.7 ? full : full * 0.4, times[k] + Math.min(0.35, len * 0.4), 0.2);
      }
    }
    link(vib, vibDepth);
    this.mod(vibDepth, breath.gain);
    vib.connect(vibPitch);
    for (const o of [waver, vib]) {
      o.start(t0);
      o.stop(end);
    }
    // the tone: soft harmonics, a little brighter once the breath has filled out
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.3;
    for (let k = 0; k < n; k++) lp.frequency.setValueAtTime(Math.min(fs[k] * 6, 5000), times[k]);
    lp.connect(breath);
    const bright = ctx.createGain();
    bright.gain.setValueAtTime(0.6, t0);
    bright.gain.linearRampToValueAtTime(1, t0 + 0.3);
    bright.connect(lp);
    const top = Math.max(...fs);
    const detunes: AudioParam[] = [];
    for (const [ratio, amp] of [[1, 1], [2, 0.32], [3, 0.11], [4, 0.04], [5, 0.015]]) {
      if (top * ratio > 12000) continue;
      const o = ctx.createOscillator();
      // speaks a little flat and settles onto the note; then each new note is reached by a quick slide
      o.frequency.setValueAtTime(fs[0] * ratio * cents(-18), t0);
      o.frequency.linearRampToValueAtTime(fs[0] * ratio, t0 + 0.08);
      for (let k = 1; k < n; k++) {
        const slide = Math.min(0.05, (times[k] - times[k - 1]) * 0.25);
        o.frequency.setValueAtTime(fs[k - 1] * ratio, times[k] - slide);
        o.frequency.exponentialRampToValueAtTime(fs[k] * ratio, times[k]);
      }
      const g = ctx.createGain();
      g.gain.value = amp;
      link(o, g);
      g.connect(ratio === 1 ? lp : bright);
      o.start(t0);
      o.stop(end);
      detunes.push(o.detune);
    }
    // a touch of pitch: slow drift and a little of the vibrato
    const drift = ctx.createOscillator();
    drift.frequency.value = 0.15 + 0.15 * (1 - jitter);
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = 3;
    link(drift, driftDepth);
    for (const d of detunes) {
      this.mod(driftDepth, d);
      this.mod(vibPitch, d);
    }
    drift.start(t0);
    drift.stop(end);
    // no breath noise: however it was filtered, the user heard it as a hiss (2026-11-11)
  }

  /** a bowed string played softly: slow bow, filtered so it stays airy, late vibrato */
  private bowed(t: number, f: number, vel: number, dur: number, pan: number) {
    const ctx = this.ctx;
    const attack = Math.min(0.7, dur * 0.4);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(vel, t + attack);
    e.gain.setValueAtTime(vel, t + dur);
    e.gain.setTargetAtTime(0, t + dur, 0.35);
    this.panned(e, 'notes', pan);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(f * 2.5, 2600);
    lp.Q.value = 0.5;
    link(lp, e);
    const detunes: AudioParam[] = [];
    for (const [type, amp, off] of [['sawtooth', 0.5, -4], ['sawtooth', 0.5, 4], ['sine', 0.5, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * cents(off);
      const g = ctx.createGain();
      g.gain.value = amp;
      link(o, g, lp);
      o.start(t);
      o.stop(t + dur + 2.5);
      detunes.push(o.detune);
    }
    this.vibrato(t, dur, 4.5, 7, detunes);
  }

  /** A held bed tone: breathing (two detuned triangles and tuned noise) or softly bowed. */
  private bedTone(t: number, note: number, dur: number, p: Preset, level = 1) {
    const ctx = this.ctx;
    const f = mtof(note);
    const fade = p.bed.fade;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + fade);
    env.gain.setValueAtTime(level, t + dur - fade);
    env.gain.linearRampToValueAtTime(0, t + dur);
    // slow breathing in level
    const swell = ctx.createGain();
    swell.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(0.04, 0.11);
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    link(lfo, depth);
    this.mod(depth, swell.gain);
    link(swell, env);
    this.panned(env, 'bed', rand(-0.4, 0.4));
    if (p.bed.tone === 'pad') {
      // An analogue pad in the manner of the Blade Runner soundtrack: three sawtooths a few cents
      // apart (thick and slowly beating), through a soft low-pass that opens as the chord swells in,
      // breathes slowly while it holds, and closes as it fades. The user liked the bed far more than
      // any tune laid over it (2026-11-11).
      const open = Math.max(f * 1.5, p.bed.cutoff);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.9;
      lp.frequency.setValueAtTime(Math.max(f * 1.05, open * 0.3), t);
      lp.frequency.linearRampToValueAtTime(open, t + Math.min(dur * 0.45, fade * 1.6));
      lp.frequency.linearRampToValueAtTime(open * 0.75, t + dur - fade * 0.5);
      lp.frequency.linearRampToValueAtTime(Math.max(f * 1.05, open * 0.3), t + dur);
      const sweep = ctx.createOscillator();
      sweep.frequency.value = rand(0.03, 0.07);
      const sweepDepth = ctx.createGain();
      sweepDepth.gain.value = open * 0.25;
      link(sweep, sweepDepth);
      this.mod(sweepDepth, lp.frequency);
      lp.connect(swell);
      const spread = Math.max(6, p.bed.shimmer);
      for (const [off, amp] of [[-spread, 0.33], [0, 0.34], [spread, 0.33]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f * cents(off);
        const g = ctx.createGain();
        g.gain.value = amp * 0.32;
        link(o, g, lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
      sweep.start(t);
      sweep.stop(t + dur + 0.1);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
      return;
    }
    const bow = p.bed.tone === 'bow';
    let into: AudioNode = swell;
    if (bow) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(f * 2.2, 1800);
      lp.connect(swell);
      into = lp;
    }
    const tone = (1 - p.bed.breath) * 0.5;
    for (const off of [-p.bed.shimmer / 2, p.bed.shimmer / 2]) {
      const o = ctx.createOscillator();
      o.type = bow ? 'sawtooth' : 'triangle';
      o.frequency.value = f * cents(off);
      const g = ctx.createGain();
      g.gain.value = bow ? tone * 0.6 : tone;
      link(o, g, into);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    if (p.bed.breath > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 30;
      const g = ctx.createGain();
      // a narrow band keeps little of the noise: make it up
      g.gain.value = p.bed.breath * 6;
      link(src, bp, g, swell);
      src.start(t, Math.random() * 2);
      src.stop(t + dur + 0.1);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }

  private startRoot(note: number, level: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = mtof(note);
    const g = ctx.createGain();
    g.gain.value = level;
    link(o, g, this.buses.bed.lp);
    o.start();
    this.loops.push(o);
  }

  private startWind(level: number) {
    if (level <= 0) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.7;
    // gusts: the band drifts up and down
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 250;
    link(lfo, depth);
    this.mod(depth, bp.frequency);
    const g = ctx.createGain();
    g.gain.value = level;
    link(src, bp, g, this.buses.air.lp);
    src.start();
    lfo.start();
    this.loops.push(src, lfo);
  }

  /** a glint of frost: a very short, very quiet high tone */
  private grain(t: number, note: number) {
    const ctx = this.ctx;
    const dur = rand(0.04, 0.14);
    const o = ctx.createOscillator();
    o.frequency.value = mtof(note);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(rand(0.02, 0.06), t + dur * 0.3);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    link(o, e);
    this.panned(e, 'air', rand(-0.9, 0.9));
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
