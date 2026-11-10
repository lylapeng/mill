import * as THREE from 'three';
import { clamp } from '../util';
import { winter } from '../season';

// One palette per scene tier. The world blends between neighbours, so each
// scene level shifts the mood a little instead of jumping every fourth level.

interface PaletteDef {
  skyTop: string;
  skyHorizon: string;
  sun: string;
  /** degrees above the horizon */
  sunElevation: number;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  cloudCover: number;
  cloudTint: string;
  soilDry: string;
  soilLush: string;
  /** 0 = all dry soil, 1 = all grass */
  lushness: number;
  path: string;
  foliage: string;
  blossom: string;
  /** 0..1 how much tree crowns turn to blossom */
  blossomMix: number;
  mountain: string;
  mote: string;
  moteSize: number;
  /** 0 = drifting dust, 1 = blinking fireflies */
  moteGlow: number;
  petals: number;
  bloom: number;
  exposure: number;
  /** 0..1 how much snow lies on the ground and on everything facing up */
  snowCover?: number;
  snow?: string;
  /** 0..1 falling snow */
  snowfall?: number;
  /** 0..1 lit windows; follows the fireflies unless given */
  lamp?: number;
  /** 0..1 northern lights (and stars) in the sky */
  aurora?: number;
}

const DEFS: PaletteDef[] = [
  {
    // 黄土 — dusty, flat, a little tired
    skyTop: '#a7adb0', skyHorizon: '#d9cdb6', sun: '#fff2dc', sunElevation: 38, sunIntensity: 1.6,
    hemiSky: '#c8c6bd', hemiGround: '#8a7458', hemiIntensity: 0.9, fogNear: 18, fogFar: 150,
    cloudCover: 0.78, cloudTint: '#cfcac0', soilDry: '#a68d68', soilLush: '#8f8d5c', lushness: 0.05,
    path: '#8b7353', foliage: '#7d8457', blossom: '#e9b7c1', blossomMix: 0, mountain: '#a49f94',
    mote: '#e6d6b8', moteSize: 2.2, moteGlow: 0, petals: 0, bloom: 0.12, exposure: 0.95,
  },
  {
    // 初晴 — the clouds part
    skyTop: '#6f9fcf', skyHorizon: '#e3e9ea', sun: '#fff4e0', sunElevation: 42, sunIntensity: 2.4,
    hemiSky: '#b9d3ea', hemiGround: '#8b7a55', hemiIntensity: 0.8, fogNear: 30, fogFar: 210,
    cloudCover: 0.5, cloudTint: '#ffffff', soilDry: '#a58f63', soilLush: '#8fa65a', lushness: 0.35,
    path: '#8e7a5c', foliage: '#6f9a4c', blossom: '#efbccb', blossomMix: 0, mountain: '#8fa2b0',
    mote: '#f4ecd0', moteSize: 2.0, moteGlow: 0, petals: 0, bloom: 0.15, exposure: 1.0,
  },
  {
    // 青野 — fresh green, high clear sky
    skyTop: '#4c8bd6', skyHorizon: '#e6f0ef', sun: '#fff6e6', sunElevation: 34, sunIntensity: 2.8,
    hemiSky: '#aecdf0', hemiGround: '#6c8a46', hemiIntensity: 0.8, fogNear: 40, fogFar: 240,
    cloudCover: 0.38, cloudTint: '#ffffff', soilDry: '#9c8b5c', soilLush: '#76ab4f', lushness: 0.8,
    path: '#9a8a6a', foliage: '#5a9a45', blossom: '#f2c2d0', blossomMix: 0.08, mountain: '#7b98b4',
    mote: '#fff5b0', moteSize: 2.4, moteGlow: 0.05, petals: 0.15, bloom: 0.2, exposure: 1.02,
  },
  {
    // 金暮 — low golden sun
    skyTop: '#3f68ad', skyHorizon: '#ffd09a', sun: '#ffc27a', sunElevation: 9, sunIntensity: 3.0,
    hemiSky: '#9fb6dc', hemiGround: '#8a6a3c', hemiIntensity: 0.65, fogNear: 40, fogFar: 230,
    cloudCover: 0.42, cloudTint: '#ffd2a8', soilDry: '#b0884e', soilLush: '#8fae4e', lushness: 0.9,
    path: '#a88a62', foliage: '#7ea445', blossom: '#f6c0b8', blossomMix: 0.3, mountain: '#8c7fa0',
    mote: '#ffe2a0', moteSize: 2.6, moteGlow: 0.35, petals: 0.5, bloom: 0.32, exposure: 1.05,
  },
  {
    // 流霞 — rose clouds, first fireflies
    skyTop: '#2c3a7a', skyHorizon: '#ffb3a0', sun: '#ff9f86', sunElevation: 4, sunIntensity: 2.4,
    hemiSky: '#a39ad8', hemiGround: '#8a6a66', hemiIntensity: 0.85, fogNear: 35, fogFar: 220,
    cloudCover: 0.5, cloudTint: '#ff9fb0', soilDry: '#b08a64', soilLush: '#8db866', lushness: 0.95,
    path: '#b89a88', foliage: '#6f9a55', blossom: '#ffb7cf', blossomMix: 0.85, mountain: '#7c6a9a',
    mote: '#ffe7a8', moteSize: 3.2, moteGlow: 1, petals: 1, bloom: 0.36, exposure: 1.08,
  },
];

// Christmas (season.ts): the same five steps of getting better, told in snow. Grey and
// trodden at first, then the snow stops, then a clear blue day, gold on the snow, and at
// the end a clear night under the northern lights, windows lit. soilDry/soilLush colour the straw that pokes
// through; foliage is pine.
const WINTER: PaletteDef[] = [
  {
    // 阴雪 — overcast, wet and trodden, still snowing
    skyTop: '#9aa2a9', skyHorizon: '#cfd1cf', sun: '#f2efe6', sunElevation: 24, sunIntensity: 1.2,
    hemiSky: '#c6cbcf', hemiGround: '#8c877e', hemiIntensity: 1.0, fogNear: 12, fogFar: 120,
    cloudCover: 0.9, cloudTint: '#c4c7c8', soilDry: '#7c7262', soilLush: '#6e6a5c', lushness: 0.05,
    path: '#77685a', foliage: '#41594a', blossom: '#ffffff', blossomMix: 0, mountain: '#a6a9ab',
    mote: '#ffffff', moteSize: 1.4, moteGlow: 0, petals: 0, bloom: 0.1, exposure: 0.95,
    snowCover: 0.7, snow: '#d6d8d6', snowfall: 1, lamp: 0,
  },
  {
    // 雪停 — the snow stops, the clouds part
    skyTop: '#7b9cc2', skyHorizon: '#e2e6e8', sun: '#fff3e2', sunElevation: 26, sunIntensity: 2.0,
    hemiSky: '#c2d2e4', hemiGround: '#9a968f', hemiIntensity: 0.9, fogNear: 24, fogFar: 190,
    cloudCover: 0.55, cloudTint: '#f2f4f6', soilDry: '#8a7c66', soilLush: '#7c7a62', lushness: 0.2,
    path: '#8c7e6c', foliage: '#3c5e48', blossom: '#ffffff', blossomMix: 0, mountain: '#b2becb',
    mote: '#ffffff', moteSize: 1.6, moteGlow: 0, petals: 0, bloom: 0.13, exposure: 0.98,
    snowCover: 0.88, snow: '#eceff1', snowfall: 0.3, lamp: 0,
  },
  {
    // 晴雪 — high blue sky over fresh snow, glints in the air
    skyTop: '#3f7ccc', skyHorizon: '#e6eff5', sun: '#fff8ee', sunElevation: 24, sunIntensity: 2.4,
    hemiSky: '#b4cfee', hemiGround: '#a6adb4', hemiIntensity: 0.8, fogNear: 40, fogFar: 240,
    cloudCover: 0.3, cloudTint: '#ffffff', soilDry: '#8e7e64', soilLush: '#807c62', lushness: 0.25,
    path: '#9c8f80', foliage: '#365f48', blossom: '#ffffff', blossomMix: 0, mountain: '#a6bbd2',
    mote: '#ffffff', moteSize: 1.8, moteGlow: 0.2, petals: 0, bloom: 0.18, exposure: 0.98,
    snowCover: 1, snow: '#f6f8fa', snowfall: 0.06, lamp: 0,
  },
  {
    // 雪暮 — low gold sun across the snow
    skyTop: '#3c5ea4', skyHorizon: '#ffcf9e', sun: '#ffc27e', sunElevation: 8, sunIntensity: 2.8,
    hemiSky: '#9fb2dc', hemiGround: '#9a8a82', hemiIntensity: 0.7, fogNear: 40, fogFar: 230,
    cloudCover: 0.4, cloudTint: '#ffd3b2', soilDry: '#94785a', soilLush: '#847a5c', lushness: 0.25,
    path: '#ad9078', foliage: '#3d6048', blossom: '#ffffff', blossomMix: 0, mountain: '#9a8fb0',
    mote: '#ffe9c4', moteSize: 2.0, moteGlow: 0.3, petals: 0, bloom: 0.3, exposure: 1.02,
    snowCover: 1, snow: '#fdf6ee', snowfall: 0.15, lamp: 0.45,
  },
  {
    // 极光 — a clear night: the northern lights over the snow, the moon low, lit windows
    skyTop: '#060c22', skyHorizon: '#24345a', sun: '#b9c8ff', sunElevation: 14, sunIntensity: 0.9,
    hemiSky: '#5f9aa8', hemiGround: '#3a4058', hemiIntensity: 0.9, fogNear: 40, fogFar: 260,
    cloudCover: 0.12, cloudTint: '#3a4a70', soilDry: '#5e5a5a', soilLush: '#545450', lushness: 0.2,
    path: '#5c5866', foliage: '#2a4640', blossom: '#ffffff', blossomMix: 0, mountain: '#2c3656',
    mote: '#c8ffe4', moteSize: 2.2, moteGlow: 0.5, petals: 0, bloom: 0.42, exposure: 1.1,
    snowCover: 1, snow: '#dfe8f4', snowfall: 0.05, lamp: 1, aurora: 1,
  },
];

const COLOR_KEYS = [
  'skyTop', 'skyHorizon', 'sun', 'hemiSky', 'hemiGround', 'cloudTint', 'soilDry', 'soilLush',
  'path', 'foliage', 'blossom', 'mountain', 'mote', 'snow',
] as const;
const NUMBER_KEYS = [
  'sunElevation', 'sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar', 'cloudCover', 'lushness',
  'blossomMix', 'moteSize', 'moteGlow', 'petals', 'bloom', 'exposure', 'snowCover', 'snowfall', 'lamp', 'aurora',
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];
export type Palette = Record<ColorKey, THREE.Color> & Record<NumberKey, number>;

const parse = (defs: PaletteDef[]) =>
  defs.map((d) => {
    const full = { snowCover: 0, snow: '#ffffff', snowfall: 0, lamp: d.moteGlow, aurora: 0, ...d };
    const p = {} as Palette;
    for (const k of COLOR_KEYS) p[k] = new THREE.Color(full[k]);
    for (const k of NUMBER_KEYS) p[k] = full[k];
    return p;
  });
const SUMMER = parse(DEFS);
const SNOWY = parse(WINTER);

export function makePalette(): Palette {
  return samplePalette(0, {} as Palette);
}

/** t in [0, 4]: continuous position along the scene tiers. */
export function samplePalette(t: number, out: Palette): Palette {
  const tc = clamp(t, 0, DEFS.length - 1);
  const i = Math.min(DEFS.length - 2, Math.floor(tc));
  const f = tc - i;
  const parsed = winter() ? SNOWY : SUMMER;
  const a = parsed[i];
  const b = parsed[i + 1];
  for (const k of COLOR_KEYS) {
    out[k] = (out[k] ?? new THREE.Color()).copy(a[k]).lerp(b[k], f);
  }
  for (const k of NUMBER_KEYS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

export const sceneLevelToT = (level: number) => Math.min(4, (level - 1) / 4);

export const FLOWER_COLORS = ['#fff8ee', '#ffe27a', '#f6a8c0', '#c9b6ff', '#ffb38a', '#9fd3ff'].map(
  (c) => new THREE.Color(c),
);
