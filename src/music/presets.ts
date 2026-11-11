import type { Motif, Preset } from './engine';

// Notes are MIDI numbers: 50 = D3, 62 = D4, 74 = D5, 86 = D6.

/**
 * 极光 · A：written straight from the prompt (kantele harmonics, isolated high celesta,
 * breathy drones, barely-there wind, a fine shimmer; notes like falling snow, long silences,
 * no melody, no pulse, no swells), plus the screen: still pulling the mill, the dreamiest step.
 * A five-string kantele is tuned D E F♯ G A; its harmonics sound an octave and a twelfth above
 * those strings, which gives the note pool. The drones hold suspended chords in D.
 */
export const auroraA: Preset = {
  id: 'aurora-a',
  title: '极光 · A（直接按提示词）',
  gain: 1,
  reverb: { seconds: 6, wet: 0.9 },
  bed: { level: 0.18, cutoff: 1500, hold: [16, 26], fade: 7, breath: 0.55, shimmer: 8 },
  chords: [
    { notes: [50, 57, 64, 69] }, // Dsus2
    { notes: [55, 62, 69, 73] }, // G(add9, maj7), no third
    { notes: [57, 62, 64, 69] }, // Asus4
    { notes: [52, 59, 66, 69] }, // E(add9)sus
    { notes: [54, 59, 64, 66] }, // Bm11 without its root
  ],
  notes: {
    level: 0.9,
    voices: [
      {
        voice: 'kantele',
        pool: [74, 76, 78, 79, 81, 83, 85, 86, 88],
        gap: [3.5, 8],
        hush: 0.2,
        vel: 0.5,
        chordBias: 0.5,
        fall: 0.75,
        answer: { voice: 'celesta', pool: [86, 88, 90, 91, 93, 95, 97, 98], prob: 0.35, delay: [1.2, 3.5], vel: 0.25 },
      },
    ],
  },
  air: { level: 1, wind: 0.035, grains: 0.8, grainPool: [98, 100, 102, 105, 107, 110] },
};

/**
 * 极光 · B：the same prompt, written after taking the Suno track (Jään hiljaisuus) apart with Demucs.
 * What the track actually does: no drums or voice; a quarter of its energy is a low drone on
 * E2 / F2 / G2 that comes in only in two flowing passages (about 1.8 notes a second, notes
 * repeating), with sparse single notes and 3–8 s silences around them. Notes sit mostly between
 * G4 and E5, nothing above 2 kHz (dark and warm). G with F natural, a minor colour early on,
 * and a stretch leaning to A (C♯) in the middle.
 */
export const auroraB: Preset = {
  id: 'aurora-b',
  title: '极光 · B（Suno 拆解后）',
  gain: 1,
  reverb: { seconds: 5, wet: 0.8 },
  bed: { level: 0.18, cutoff: 1100, hold: [8, 13], fade: 4, breath: 0.35, shimmer: 6 },
  chords: [
    { notes: [55, 62, 67, 69], low: 43 }, // G(add9) over G2
    { notes: [55, 62, 67, 71], low: 43 }, // Gmaj7 over G2: G comes up most
    { notes: [55, 58, 62, 69], low: 43 }, // Gm(add9)
    { notes: [53, 57, 60, 67], low: 41 }, // F(add9) over F2
    { notes: [52, 59, 62, 67], low: 40 }, // Em7 over E2
    { notes: [48, 55, 62, 64], low: 43 }, // Cadd9 over G2
    { notes: [57, 61, 64, 71], low: 45 }, // A(add9): the stretch with C♯
  ],
  phases: [
    { seconds: [30, 40], density: 1, low: 0 },
    { seconds: [45, 65], density: 5, low: 3 },
    { seconds: [30, 45], density: 1, low: 0 },
    { seconds: [30, 40], density: 5, low: 3 },
  ],
  notes: {
    level: 0.9,
    cutoff: 2200,
    voices: [
      {
        voice: 'kantele',
        pool: [67, 69, 71, 72, 74, 76, 77, 79, 81, 84, 86],
        gap: [3, 8],
        hush: 0.15,
        vel: 0.5,
        chordBias: 0.6,
        fall: 0.55,
        repeat: 0.2,
        answer: { voice: 'celesta', pool: [81, 84, 86, 88], prob: 0.2, delay: [1, 3], vel: 0.2 },
      },
    ],
  },
  air: { level: 1, wind: 0.02, grains: 0, grainPool: [] },
};

// ── summer: one per scene tier, from the prompts in 提示词.md ─────────────
// The music comes in slowly: 黄土 is a few phrases under the hooves and the stone, 流霞 is full.
// All in D or G so a tier change crossfades without a jolt; each step a little brighter:
// D dorian → D mixolydian → G major → D major → D lydian, and G pentatonic for the grassland.
// Second version: the first was too empty and had no tune (user, 2026-11-11). Now the lead plays
// question-and-answer phrases that come back, and a soft broken chord keeps the music moving,
// one note per stride while the player walks steadily.

// pairs: the question rises and stays open, the answer comes home (steps are places in the pool)
const homeward: Motif = {
  steps: [0, 1, 2, 3, 2, 1], beats: [1, 1, 1, 2, 1, 3],
  then: { steps: [0, 1, 2, 1, 0, -1, 0], beats: [1, 1, 1, 1, 1, 1, 4] },
};
const highFirst: Motif = {
  steps: [2, 3, 4, 3, 2], beats: [1, 1, 2, 1, 3],
  then: { steps: [1, 0, -1, -2, -1], beats: [1, 1, 1, 1, 4] },
};
const opening: Motif = {
  steps: [0, 2, 3, 4, 5, 4], beats: [1, 1, 1, 1, 2, 3],
  then: { steps: [3, 2, 1, 0], beats: [1, 1, 2, 4] },
};
const swaying: Motif = { steps: [0, -1, 0, 1, 2, 1, 0], beats: [2, 1, 1, 1, 1, 1, 4] };
const sighing: Motif = {
  steps: [0, -1], beats: [2, 3],
  then: { steps: [1, 0, -1, -2], beats: [1, 1, 1, 4] },
};
const longing: Motif = {
  steps: [0, 1, 2, 4, 3], beats: [1, 1, 1, 2, 3],
  then: { steps: [2, 3, 2, 1, 0], beats: [1, 1, 1, 1, 4] },
};

/** 黄土: dusty plain under a heavy sky. Breathy wooden flute, distant low cello, hollow wood. Still the sparest. */
export const huangtu: Preset = {
  id: 'huangtu',
  title: '黄土',
  gain: 0.45,
  reverb: { seconds: 4, wet: 0.6 },
  beat: 1.2,
  bed: { level: 0.14, cutoff: 900, hold: [14, 20], fade: 7, breath: 0.4, shimmer: 5, tone: 'bow' },
  // open fifths, no thirds: modal and weathered
  chords: [{ notes: [50, 57, 62] }, { notes: [48, 55, 60] }, { notes: [50, 57, 64] }, { notes: [45, 52, 57] }],
  order: 'cycle',
  phases: [
    { seconds: [30, 45], density: 1, low: 0, arp: false },
    { seconds: [40, 60], density: 1.2, low: 0 },
  ],
  // a slow wooden knock, every other stride: patient, like the work itself
  arp: { voice: 'wood', pattern: [0, -1, 2, -1, 1, -1, -1, -1], vel: 0.035, octave: 0, beats: 1 },
  notes: {
    level: 0.9,
    cutoff: 3000,
    voices: [
      {
        voice: 'flute',
        pool: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77], // D dorian
        gap: [3, 6],
        hush: 0.1,
        vel: 0.24,
        chordBias: 0.5,
        fall: 0.6,
        hold: [1.5, 3],
        phrase: { prob: 0.65, motifs: [swaying, sighing, homeward], vary: 0.35 },
        answer: { voice: 'cello', pool: [50, 52, 53, 55, 57, 60, 62], prob: 0.3, delay: [0.5, 1.5], vel: 0.07, echo: true },
      },
    ],
  },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 初晴: clouds part, the first green. Flute phrases with cello replies; plucked strings begin to move. Major thirds appear. */
export const chuqing: Preset = {
  id: 'chuqing',
  title: '初晴',
  gain: 0.52,
  reverb: { seconds: 4.5, wet: 0.7 },
  beat: 1.1,
  bed: { level: 0.1, cutoff: 1100, hold: [10, 16], fade: 6, breath: 0.35, shimmer: 6, tone: 'bow' },
  chords: [
    { notes: [50, 57, 64] }, // D sus2: still open
    { notes: [48, 55, 62, 64] }, // C add9
    { notes: [50, 57, 62, 66] }, // D with its major third: the light comes through
    { notes: [55, 62, 66, 71] }, // G maj7
  ],
  order: 'cycle',
  phases: [
    { seconds: [30, 40], density: 1, low: 0, arp: false },
    { seconds: [45, 60], density: 1.2, low: 0 },
  ],
  arp: { voice: 'pluck', pattern: [0, -1, 2, -1, 1, -1, 2, -1], vel: 0.14, octave: 0, beats: 1 },
  notes: {
    level: 0.9,
    cutoff: 3500,
    voices: [
      {
        voice: 'flute',
        pool: [62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79], // D mixolydian
        gap: [2, 4],
        hush: 0.06,
        vel: 0.3,
        chordBias: 0.55,
        fall: 0.55,
        hold: [1.5, 3],
        phrase: { prob: 0.7, motifs: [homeward, highFirst, swaying], vary: 0.35 },
        answer: { voice: 'cello', pool: [55, 57, 59, 62, 64, 66, 69], prob: 0.45, delay: [0.5, 1.5], vel: 0.13, echo: true },
      },
    ],
  },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 青野: green meadow in summer sun. Rising flute phrases, the strings echo them; the plucks sway like grass. */
export const qingye: Preset = {
  id: 'qingye',
  title: '青野',
  gain: 0.75,
  reverb: { seconds: 4.5, wet: 0.65 },
  beat: 1,
  bed: { level: 0.13, cutoff: 1300, hold: [8, 12], fade: 4, breath: 0.3, shimmer: 6, tone: 'bow' },
  chords: [
    { notes: [55, 59, 62, 69] }, // G add9
    { notes: [52, 59, 62, 67] }, // Em7
    { notes: [48, 55, 59, 64] }, // C maj7
    { notes: [50, 57, 62, 67] }, // D sus4
  ],
  order: 'cycle',
  phases: [
    { seconds: [25, 35], density: 1, low: 0 },
    { seconds: [45, 60], density: 1.3, low: 0 },
  ],
  arp: { voice: 'pluck', pattern: [0, 2, 1, 2, 3, 2, 1, 2], vel: 0.14, octave: 0, beats: 1 },
  notes: {
    level: 0.9,
    cutoff: 4000,
    voices: [
      {
        voice: 'flute',
        pool: [67, 69, 71, 72, 74, 76, 79, 81, 83, 84], // G major
        gap: [1.5, 3.5],
        hush: 0.05,
        vel: 0.27,
        chordBias: 0.5,
        fall: 0.45,
        hold: [1.2, 2.5],
        phrase: { prob: 0.8, motifs: [opening, homeward, longing], vary: 0.35 },
        answer: { voice: 'cello', pool: [55, 57, 59, 62, 64, 67, 69], prob: 0.55, delay: [0.3, 1], vel: 0.13, echo: true },
      },
    ],
  },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 金暮: golden evening. Two tunes that keep coming back, the cello answering the flute over a warm broken chord. */
export const jinmu: Preset = {
  id: 'jinmu',
  title: '金暮',
  gain: 0.8,
  reverb: { seconds: 5, wet: 0.7 },
  beat: 1.1,
  bed: { level: 0.14, cutoff: 1300, hold: [8, 12], fade: 5, breath: 0.3, shimmer: 7, tone: 'bow' },
  chords: [
    { notes: [50, 57, 64, 66] }, // D add9
    { notes: [54, 59, 62, 69] }, // Bm7
    { notes: [55, 59, 62, 66] }, // G maj7
    { notes: [57, 62, 64, 69] }, // A sus4
  ],
  order: 'cycle',
  phases: [
    { seconds: [30, 40], density: 1, low: 0 },
    { seconds: [45, 60], density: 1.25, low: 0 },
  ],
  arp: { voice: 'pluck', pattern: [0, 1, 2, 3, 2, 1], vel: 0.14, octave: 0, beats: 1 },
  notes: {
    level: 0.9,
    cutoff: 4000,
    voices: [
      {
        voice: 'flute',
        pool: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83], // D major pentatonic
        gap: [1.5, 3.5],
        hush: 0.05,
        vel: 0.27,
        chordBias: 0.5,
        fall: 0.5,
        hold: [1.5, 3],
        // the two meant to be remembered; they come back often and only a little changed
        phrase: { prob: 0.85, motifs: [homeward, highFirst, homeward, highFirst, swaying], vary: 0.25 },
        answer: { voice: 'cello', pool: [57, 59, 61, 62, 64, 66, 69], prob: 0.6, delay: [0.5, 1.2], vel: 0.14, echo: true },
      },
    ],
  },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 流霞: the sky opening. Sustained string harmonics, low flute phrases overlapping them, lydian and suspended; a faint shimmer of plucks. */
export const liuxia: Preset = {
  id: 'liuxia',
  title: '流霞',
  gain: 0.7,
  reverb: { seconds: 6, wet: 0.9 },
  beat: 1.2,
  bed: { level: 0.1, cutoff: 1400, hold: [10, 14], fade: 6, breath: 0.45, shimmer: 10 },
  chords: [
    { notes: [50, 57, 61, 68] }, // D maj7♯11 without the third
    { notes: [50, 56, 59, 64] }, // E over D: the lydian lift
    { notes: [54, 59, 61, 62] }, // Bm add9
    { notes: [57, 59, 64, 69] }, // A sus2
  ],
  order: 'cycle',
  phases: [
    { seconds: [30, 45], density: 1, low: 0 },
    { seconds: [45, 60], density: 1.25, low: 0 },
  ],
  arp: { voice: 'pluck', pattern: [0, 2, 3, 2, 1, 2], vel: 0.12, octave: 0, beats: 1 },
  notes: {
    level: 0.9,
    cutoff: 2400,
    voices: [
      {
        voice: 'flute',
        pool: [64, 66, 68, 69, 71, 73, 74, 76, 78, 80], // D lydian, low-ish
        gap: [2, 4],
        hush: 0.06,
        vel: 0.3,
        chordBias: 0.5,
        fall: 0.5,
        hold: [1.5, 3.5],
        phrase: { prob: 0.75, motifs: [longing, opening, swaying], vary: 0.4 },
        answer: { voice: 'cello', pool: [57, 59, 61, 62, 64, 66, 68, 69], prob: 0.5, delay: [0.5, 1.5], vel: 0.08, echo: true },
      },
      {
        voice: 'cello',
        pool: [57, 59, 61, 62, 64, 66, 68, 69, 71],
        gap: [5, 9],
        hush: 0.2,
        vel: 0.06,
        chordBias: 0.8,
        fall: 0.5,
        hold: [3, 6],
      },
    ],
  },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 草原 (the ending): the first free breath. Long pentatonic phrases that rise and open; the strings echo from far off. */
export const caoyuan: Preset = {
  id: 'caoyuan',
  title: '草原',
  gain: 0.85,
  reverb: { seconds: 5.5, wet: 0.8 },
  beat: 0.9,
  bed: { level: 0.14, cutoff: 1400, hold: [8, 12], fade: 5, breath: 0.3, shimmer: 7, tone: 'bow' },
  chords: [
    { notes: [55, 62, 69, 71] }, // G add9
    { notes: [52, 59, 62, 69] }, // Em add11
    { notes: [48, 55, 62, 64] }, // C add9
    { notes: [50, 57, 64, 69] }, // D sus2
  ],
  order: 'cycle',
  phases: [
    { seconds: [20, 30], density: 1, low: 0, arp: false },
    { seconds: [50, 70], density: 1.3, low: 0 },
  ],
  arp: { voice: 'pluck', pattern: [0, 1, 2, 3, 4, 3, 2, 1], vel: 0.14, octave: 0, beats: 1 },
  notes: {
    level: 0.9,
    cutoff: 4500,
    voices: [
      {
        voice: 'flute',
        pool: [67, 69, 71, 74, 76, 79, 81, 83, 86, 88], // G pentatonic
        gap: [1.5, 3],
        hush: 0.05,
        vel: 0.27,
        chordBias: 0.4,
        fall: 0.4,
        hold: [1.5, 3],
        phrase: { prob: 0.85, motifs: [opening, longing, homeward], vary: 0.35 },
        answer: { voice: 'cello', pool: [55, 57, 59, 62, 64, 67, 69], prob: 0.5, delay: [0.8, 2], vel: 0.13, echo: true },
      },
    ],
  },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** the summer music for each scene tier (0 = 黄土 … 4 = 流霞) */
export const SUMMER = [huangtu, chuqing, qingye, jinmu, liuxia];

export const PRESETS: Preset[] = [...SUMMER, caoyuan, auroraA, auroraB];
