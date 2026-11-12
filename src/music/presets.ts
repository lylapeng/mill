import type { NoteVoice, Preset } from './engine';

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
// The music comes in slowly: 黄土 is a dark hum under the hooves and the stone, 流霞 is open and wide.
// All in D or G so a tier change crossfades without a jolt; each step a little brighter:
// D dorian → D mixolydian → G major → D major → D lydian, and G pentatonic for the grassland.
//
// Third version (2026-11-12): the bed is the music. A warm analogue pad, like the Blade Runner
// score, holds each chord for ten seconds or more; above it only a lone note now and then, or a
// soft pluck on each step. The written tunes of the second version were dropped: the user found
// them mediocre and liked the bed far better ("黄土还行因为比较简单").
//
// How it goes with the player: the bed has no beat to keep, so it answers the stride instead. Walk
// evenly and it opens, brighter and a little louder (`bed.bloom`); stop or stumble and it closes
// again. A new chord waits for the next step, and the lone notes and the plucks land on steps.
// Tiers differ by the colour of the chords, how bright the pad gets, the reverb and the loudness.

/** a lone note every five to ten seconds, on a chord tone, landing on the player's next step */
const lone = (voice: NoteVoice['voice'], pool: number[], vel: number): NoteVoice => ({
  voice,
  pool,
  gap: [5, 10],
  hush: 0.2,
  vel,
  chordBias: 0.9,
  fall: 0.5,
  hold: [2, 4],
});

/** 黄土: dusty plain under a heavy sky. The darkest pad, open fifths, a hollow wooden note now and then. */
export const huangtu: Preset = {
  id: 'huangtu',
  title: '黄土',
  gain: 1.21,
  reverb: { seconds: 6, wet: 0.8 },
  bed: { level: 0.3, cutoff: 1200, hold: [14, 20], fade: 7, breath: 0, shimmer: 6, tone: 'pad', bloom: 0.3 },
  // open fifths, no thirds: modal and weathered
  chords: [{ notes: [50, 57, 62] }, { notes: [48, 55, 60] }, { notes: [50, 57, 64] }, { notes: [45, 52, 57] }],
  order: 'cycle',
  notes: { level: 0.9, cutoff: 3000, voices: [lone('marimba', [62, 64, 65, 67, 69, 71, 72, 74], 0.3)] }, // D dorian
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 初晴: clouds part, the first green. The pad warms, major thirds appear, a kalimba note catches the light. */
export const chuqing: Preset = {
  id: 'chuqing',
  title: '初晴',
  gain: 1.05,
  reverb: { seconds: 6, wet: 0.85 },
  bed: { level: 0.3, cutoff: 1500, hold: [12, 16], fade: 6, breath: 0, shimmer: 7, tone: 'pad', bloom: 0.3 },
  chords: [
    { notes: [50, 57, 64] }, // D sus2: still open
    { notes: [48, 55, 62, 64] }, // C add9
    { notes: [50, 57, 62, 66] }, // D with its major third: the light comes through
    { notes: [55, 62, 66, 71] }, // G maj7
  ],
  order: 'cycle',
  notes: { level: 0.9, cutoff: 3500, voices: [lone('kalimba', [62, 64, 66, 67, 69, 71, 72, 74, 76], 0.3)] }, // D mixolydian
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 青野: green meadow in summer sun. A brighter pad, and a soft pluck on each step that sways like grass. */
export const qingye: Preset = {
  id: 'qingye',
  title: '青野',
  gain: 1.25,
  reverb: { seconds: 6.5, wet: 0.9 },
  beat: 1,
  bed: { level: 0.3, cutoff: 1650, hold: [10, 14], fade: 6, breath: 0, shimmer: 8, tone: 'pad', bloom: 0.3 },
  chords: [
    { notes: [55, 59, 62, 69] }, // G add9
    { notes: [52, 59, 62, 67] }, // Em7
    { notes: [48, 55, 59, 64] }, // C maj7
    { notes: [50, 57, 62, 67] }, // D sus4
  ],
  order: 'cycle',
  arp: { voice: 'pluck', pattern: [0, 2, 1, 2, 3, 2, 1, 2], vel: 0.1, octave: 0, beats: 1 },
  notes: { level: 0.9, cutoff: 4000, voices: [] },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 金暮: golden evening, the fullest: the warm pad, a pluck on each step and a kalimba note now and then. */
export const jinmu: Preset = {
  id: 'jinmu',
  title: '金暮',
  gain: 1.2,
  reverb: { seconds: 7, wet: 1 },
  beat: 1,
  bed: { level: 0.3, cutoff: 1800, hold: [10, 14], fade: 6, breath: 0, shimmer: 9, tone: 'pad', bloom: 0.3 },
  chords: [
    { notes: [50, 57, 64, 66] }, // D add9
    { notes: [54, 59, 62, 69] }, // Bm7
    { notes: [55, 59, 62, 66] }, // G maj7
    { notes: [57, 62, 64, 69] }, // A sus4
  ],
  order: 'cycle',
  arp: { voice: 'pluck', pattern: [0, 1, 2, 3, 2, 1], vel: 0.1, octave: 0, beats: 1 },
  notes: { level: 0.9, cutoff: 4000, voices: [lone('kalimba', [62, 64, 66, 69, 71, 74, 76, 78, 81], 0.3)] }, // D major pentatonic
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/**
 * 流霞: the sky opening. The brightest, widest pad in the longest reverb, lydian and suspended, a
 * kantele note ringing on now and then. Kept below the bright register, which is left to the birds.
 */
export const liuxia: Preset = {
  id: 'liuxia',
  title: '流霞',
  gain: 1.05,
  reverb: { seconds: 8, wet: 1 },
  bed: { level: 0.3, cutoff: 2400, hold: [12, 16], fade: 7, breath: 0, shimmer: 11, tone: 'pad', bloom: 0.3 },
  chords: [
    { notes: [50, 57, 61, 68] }, // D maj7♯11 without the third
    { notes: [50, 56, 59, 64] }, // E over D: the lydian lift
    { notes: [54, 59, 61, 62] }, // Bm add9
    { notes: [57, 59, 64, 69] }, // A sus2
  ],
  order: 'cycle',
  // D major without G♯: it clashed with A and Bm while it rang on
  notes: { level: 0.9, cutoff: 2600, voices: [lone('kantele', [69, 71, 73, 74, 76, 78, 81, 83], 0.32)] },
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** 草原 (the ending): the first free breath. An open pentatonic pad that no longer follows the steps. */
export const caoyuan: Preset = {
  id: 'caoyuan',
  title: '草原',
  gain: 1.46,
  reverb: { seconds: 7, wet: 0.9 },
  bed: { level: 0.3, cutoff: 2000, hold: [10, 14], fade: 6, breath: 0, shimmer: 9, tone: 'pad', bloom: 0.3 },
  chords: [
    { notes: [55, 62, 69, 71] }, // G add9
    { notes: [52, 59, 62, 69] }, // Em add11
    { notes: [48, 55, 62, 64] }, // C add9
    { notes: [50, 57, 64, 69] }, // D sus2
  ],
  order: 'cycle',
  notes: { level: 0.9, cutoff: 4500, voices: [lone('kalimba', [67, 69, 71, 74, 76, 79, 81, 83, 86], 0.3)] }, // G pentatonic
  air: { level: 1, wind: 0, grains: 0, grainPool: [] },
};

/** the summer music for each scene tier (0 = 黄土 … 4 = 流霞) */
export const SUMMER = [huangtu, chuqing, qingye, jinmu, liuxia];

export const PRESETS: Preset[] = [...SUMMER, caoyuan, auroraA, auroraB];
