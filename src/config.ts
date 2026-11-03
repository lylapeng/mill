// All tunable numbers and player-facing text live here.
// Pacing was tuned with a simple simulation (see AGENTS.md → 数值).

export type AnimalId = 'ox' | 'horse' | 'donkey' | 'stag';

export interface AnimalDef {
  id: AnimalId;
  name: string;
  blurb: string;
  /** speed gained per step (m/s) */
  stepPower: number;
  /** exponential drag per second */
  drag: number;
  maxSpeed: number;
  /** flour multiplier */
  strength: number;
  /** extra freedom chance per attempt */
  freedomBonus: number;
  /** shown as pips; `will` (倔) only for animals with a freedom bonus */
  stats: { power: number; speed: number; will?: number };
}

export const ANIMALS: Record<AnimalId, AnimalDef> = {
  ox: {
    id: 'ox',
    name: '牛',
    blurb: '力气大，步子慢。每一圈都很实在。',
    stepPower: 0.26,
    drag: 0.62,
    maxSpeed: 1.4,
    strength: 1.25,
    freedomBonus: 0,
    stats: { power: 3, speed: 1 },
  },
  horse: {
    id: 'horse',
    name: '马',
    blurb: '跑得快，也停得快。要一直催着自己。',
    stepPower: 0.9,
    drag: 1.6,
    maxSpeed: 2.2,
    strength: 0.9,
    freedomBonus: 0,
    stats: { power: 1, speed: 3 },
  },
  donkey: {
    id: 'donkey',
    name: '驴',
    blurb: '最倔的一个。据说，也最想走。',
    stepPower: 0.5,
    drag: 1.0,
    maxSpeed: 1.7,
    strength: 1.0,
    freedomBonus: 0.004,
    stats: { power: 2, speed: 2, will: 3 },
  },
  // Xiaohongshu only, unlocked by following the author; paced like the horse so the
  // economy needs no new simulation
  stag: {
    id: 'stag',
    name: '鹿',
    blurb: '从林子里走出来的。步子轻，角很沉。',
    stepPower: 0.9,
    drag: 1.6,
    maxSpeed: 2.2,
    strength: 0.9,
    freedomBonus: 0,
    stats: { power: 1, speed: 3 },
  },
};

/** the animals every version offers */
export const BASE_ANIMALS: AnimalId[] = ['ox', 'horse', 'donkey'];

export const WALK_RADIUS = 3.1;
export const MAX_LEVEL = 20;
export const LEVELS_PER_TIER = 4;

export const tierOf = (level: number) => Math.min(4, Math.floor((level - 1) / LEVELS_PER_TIER));

export const ECONOMY = {
  yieldBase: 1,
  yieldGrowth: 1.34,
  millCostBase: 5,
  millCostGrowth: 1.4,
  sceneCostBase: 8,
  sceneCostGrowth: 1.33,
  /** each mill level makes the stone a little lighter */
  speedPerMillLevel: 0.02,
  /** from the steam tier on, the mill keeps you walking at this share of max speed per tier */
  autoAssistPerTier: 0.12,
};

export const yieldPerLap = (millLevel: number) =>
  ECONOMY.yieldBase * Math.pow(ECONOMY.yieldGrowth, millLevel - 1);
export const millCost = (level: number) =>
  Math.round(ECONOMY.millCostBase * Math.pow(ECONOMY.millCostGrowth, level - 1));
export const sceneCost = (level: number) =>
  Math.round(ECONOMY.sceneCostBase * Math.pow(ECONOMY.sceneCostGrowth, level - 1));

export const RHYTHM = {
  /** intervals within this relative tolerance of the previous one keep the cadence */
  tolerance: 0.3,
  maxInterval: 0.9,
  maxCombo: 24,
  bonusPerCombo: 0.02,
  stumbleKeep: 0.7,
};

export const MIRAGE = {
  unlockSceneLevel: 5,
  firstDelay: 25,
  baseInterval: 110,
  intervalPerSceneLevel: 3,
  minInterval: 45,
  /** seconds: fade in, hold, fade out */
  fadeIn: 4,
  hold: 22,
  fadeOut: 5,
  distance: 105,
  /** how wide (radians) the view cone is in which you can run toward it */
  promptCone: 0.9,
  chanceBase: 0.008,
  chancePerSceneLevel: 0.005,
  /** soft pity: each failed run makes the next one likelier */
  chancePerFail: 0.0035,
  /** hard pity: the run after this many failures always succeeds */
  guaranteeAfterFails: 29,
};

export const freedomChance = (sceneLevel: number, fails: number, animal: AnimalDef) => {
  if (fails >= MIRAGE.guaranteeAfterFails) return 1;
  return (
    MIRAGE.chanceBase +
    MIRAGE.chancePerSceneLevel * Math.max(0, sceneLevel - MIRAGE.unlockSceneLevel) +
    MIRAGE.chancePerFail * fails +
    animal.freedomBonus
  );
};

export const MILL_TIERS = ['石磨', '木亭磨', '铜轮磨', '蒸汽磨', '星辉磨'];
export const SCENE_TIERS = ['黄土', '初晴', '青野', '金暮', '流霞'];

export const TEXT = {
  title: '拉磨',
  subtitle: '一圈，又一圈。地平线上，偶尔有草原。',
  controls: 'A / D 交替迈步　·　空格 奔向草原　·　1 / 2 升级　·　M 静音',
  /** the same, for a phone */
  touchControls: '左右两边交替点屏幕，迈步',
  touchMirageAction: '奔向它',
  touchEndingHint: '按住屏幕左边或右边，随便跑',
  /** one-handed: a single hoof under the thumb */
  oneHandControls: '拇指一下一下点蹄子，迈步',
  oneHandEndingHint: '按住蹄子往左往右拖，随便跑',
  hands: { both: '双手', left: '单手 · 左', right: '单手 · 右' },
  /** the stag, before following */
  lockedNote: '关注后解锁',
  followAction: '关注作者 · 解锁',
  followLater: '算了',
  followSoon: '再待一会儿，就可以解锁',
  followLimit: '今天先到这里，明天再来',
  followFailed: '没连上，稍后再试',
  millTierLines: [
    '',
    '磨上搭了个亭子。下雨也能拉了。',
    '铜齿轮咬合，磨盘转得更快。',
    '锅炉呼着白气，帮你推了一把。',
    '磨盘里亮起了星光。它好像不需要你了——但你还在拉。',
  ],
  sceneTierLines: [
    '',
    '云散了些。院子里冒出第一丛青草。',
    '风里有了草的味道。',
    '太阳低下来，什么都镀了一层金。',
    '天边的云烧成了粉色。你几乎忘了自己在转圈。',
  ],
  mirageUnlock: '地平线上，好像有什么在晃动。',
  miragePrompt: '远处……是草原吗？',
  mirageAction: '空格　奔向它',
  failLines: [
    '绳子绷紧了。草原像水汽一样散开。',
    '它退远了，又好像近了一点。',
    '风一吹，就没了。下一圈吧。',
    '磨还在身后转着。',
    '你看见了。这次，看得更清楚了。',
  ],
  pityHint: '草原比上次清楚了一些。',
  stumble: '乱了步子',
  snap: '绳子断了。',
  freeLines: ['你自由了。', '这片草原，是真的。'],
};
