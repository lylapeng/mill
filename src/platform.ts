// Everything that differs between the web page and the WeChat mini game, behind one
// object. The web version is the default; the mini game swaps in its own at boot.

export interface Quality {
  maxPixelRatio: number;
  shadowMapSize: number;
  /** grass blades on the grassland at the end */
  meadowGrass: number;
}

export interface Platform {
  /** saved strings; null when missing or storage is unavailable */
  load(key: string): string | null;
  /** null removes the key */
  store(key: string, value: string | null): void;
  /** monotonic seconds */
  now(): number;
  /** a Web Audio context, or null if there is none */
  audioContext(): AudioContext | null;
  /** a file shipped with the game, by path relative to the game root */
  readFile(path: string): Promise<ArrayBuffer>;
  quality: Quality;
}

const web: Platform = {
  load: (key) => localStorage.getItem(key),
  store: (key, value) => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)),
  now: () => performance.now() / 1000,
  audioContext: () => new AudioContext(),
  readFile: async (path) => {
    const res = await fetch(import.meta.env.BASE_URL + path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.arrayBuffer();
  },
  quality: { maxPixelRatio: 2, shadowMapSize: 2048, meadowGrass: 90000 },
};

export let platform = web;

export function setPlatform(p: Platform) {
  platform = p;
}
