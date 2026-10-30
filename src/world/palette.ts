import * as THREE from 'three';
import { clamp } from '../util';

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

const COLOR_KEYS = [
  'skyTop', 'skyHorizon', 'sun', 'hemiSky', 'hemiGround', 'cloudTint', 'soilDry', 'soilLush',
  'path', 'foliage', 'blossom', 'mountain', 'mote',
] as const;
const NUMBER_KEYS = [
  'sunElevation', 'sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar', 'cloudCover', 'lushness',
  'blossomMix', 'moteSize', 'moteGlow', 'petals', 'bloom', 'exposure',
] as const;

type ColorKey = (typeof COLOR_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];
export type Palette = Record<ColorKey, THREE.Color> & Record<NumberKey, number>;

const parsed = DEFS.map((d) => {
  const p = {} as Palette;
  for (const k of COLOR_KEYS) p[k] = new THREE.Color(d[k]);
  for (const k of NUMBER_KEYS) p[k] = d[k];
  return p;
});

export function makePalette(): Palette {
  return samplePalette(0, {} as Palette);
}

/** t in [0, 4]: continuous position along the scene tiers. */
export function samplePalette(t: number, out: Palette): Palette {
  const tc = clamp(t, 0, DEFS.length - 1);
  const i = Math.min(DEFS.length - 2, Math.floor(tc));
  const f = tc - i;
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
