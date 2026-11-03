import type { Platform } from '../platform';

// The Xiaohongshu mini tool: an offline web page in a locked-down WebView. No fetch, so the
// models come in as base64 scripts (models/*.js, made at build time); saves go to the
// container's Storage API where the client has it (9.46+), else to localStorage.

interface MiniTool {
  getLaunchOptions?(): Promise<{ miniToolEnv?: { buildVersion?: number | string } }>;
  getStorageInfo?(): Promise<{ keys: string[] }>;
  getStorage?(o: { key: string }): Promise<{ data: string | null }>;
  setStorage?(o: { key: string; data: string }): Promise<unknown>;
  removeStorage?(o: { key: string }): Promise<unknown>;
  getWindowInfo?(): Promise<WindowInfo>;
  /** client 9.51+ */
  getFollowStatus?(): Promise<{ follow_status: FollowStatus }>;
  followAuthor?(): Promise<{ follow_status: FollowStatus }>;
}

/** -1 failed, 0 not following (or logged out), 1 following, 2 you are the author */
export type FollowStatus = -1 | 0 | 1 | 2;

interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface WindowInfo {
  pixelRatio?: number;
  windowWidth: number;
  windowHeight: number;
  safeArea?: Rect;
  menuButtons?: { back: Rect | null; me: Rect | null; share: Rect | null };
}

declare global {
  interface Window {
    xhs?: { miniTool?: MiniTool; launchOptions?: { miniToolEnv?: { buildVersion?: number | string } } };
    /** filled by the models/*.js scripts that index.html loads before the game */
    __millFiles?: Record<string, string>;
  }
}

export const miniTool = (): MiniTool | undefined => window.xhs?.miniTool;

/** client version as 9462 for 9.46.2; 0 when unknown (a plain browser) */
export async function clientVersion() {
  const read = (o?: { miniToolEnv?: { buildVersion?: number | string } }) => Math.floor((Number(o?.miniToolEnv?.buildVersion) || 0) / 1000);
  const sync = read(window.xhs?.launchOptions);
  if (sync) return sync;
  try {
    return read(await miniTool()?.getLaunchOptions?.());
  } catch {
    return 0;
  }
}

function base64ToBuffer(s: string) {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** The game reads saves synchronously, so everything saved is read into memory up front. */
export async function createPlatform(): Promise<Platform> {
  const mt = miniTool();
  const native = mt?.getStorage && mt.setStorage && mt.removeStorage && mt.getStorageInfo && (await clientVersion()) >= 9460 ? mt : null;
  const saved = new Map<string, string>();
  if (native) {
    try {
      const { keys } = await native.getStorageInfo!();
      for (const key of keys) {
        const { data } = await native.getStorage!({ key });
        if (typeof data === 'string' && data !== '') saved.set(key, data);
      }
    } catch {
      // a save we can't read is a fresh start, not a broken game
    }
  }

  // one write in flight per key, the latest value wins
  const pending = new Map<string, string | null>();
  const busy = new Set<string>();
  const flush = async (key: string) => {
    if (busy.has(key)) return;
    busy.add(key);
    while (pending.has(key)) {
      const value = pending.get(key)!;
      pending.delete(key);
      try {
        await (value === null ? native!.removeStorage!({ key }) : native!.setStorage!({ key, data: value }));
      } catch {
        // the game still runs, it just won't remember
      }
    }
    busy.delete(key);
  };

  return {
    load: (key) => {
      if (native) return saved.get(key) ?? null;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    store: (key, value) => {
      if (native) {
        if (value === null) saved.delete(key);
        else saved.set(key, value);
        pending.set(key, value);
        void flush(key);
        return;
      }
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // as above
      }
    },
    now: () => performance.now() / 1000,
    audioContext: () => (typeof AudioContext !== 'undefined' ? new AudioContext() : null),
    readFile: async (path) => {
      const data = window.__millFiles?.[path];
      if (!data) throw new Error(`${path}: not in the package`);
      return base64ToBuffer(data);
    },
    // phones: the 3D at up to 2× (within the pixel budget in main.ts) and a thinner meadow. The
    // shadow map stays full size and soft: at 1024 the low evening sun stretched each texel to
    // half a metre on the ground, and the beam's shadow crawled in jagged steps as it swept round
    quality: { maxPixelRatio: 2, shadowMapSize: 2048, shadowRadius: 3, meadowGrass: 40000 },
  };
}
