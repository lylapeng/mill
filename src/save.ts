import type { AnimalId } from './config';
import { platform } from './platform';

export interface RunState {
  animal: AnimalId;
  flour: number;
  millLevel: number;
  sceneLevel: number;
  laps: number;
  /** current angle on the circle, radians */
  angle: number;
  playTime: number;
  mirageSeen: number;
  mirageFails: number;
}

export interface MetaState {
  /** animals that reached the grassland, in order */
  freed: AnimalId[];
}

const RUN_KEY = 'mill.run.v1';
const META_KEY = 'mill.meta.v1';

export const newRun = (animal: AnimalId): RunState => ({
  animal,
  flour: 0,
  millLevel: 1,
  sceneLevel: 1,
  laps: 0,
  angle: 0,
  playTime: 0,
  mirageSeen: 0,
  mirageFails: 0,
});

function read<T>(key: string): T | null {
  try {
    const raw = platform.load(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    platform.store(key, value === null ? null : JSON.stringify(value));
  } catch {
    // storage unavailable (private mode etc.) — the game still runs, it just won't remember
  }
}

export const loadRun = () => read<RunState>(RUN_KEY);
export const saveRun = (run: RunState | null) => write(RUN_KEY, run);
export const loadMeta = (): MetaState => read<MetaState>(META_KEY) ?? { freed: [] };
export const saveMeta = (meta: MetaState) => write(META_KEY, meta);
