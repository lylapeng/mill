import { BASE_ANIMALS, TEXT, type AnimalId } from '../config';
import { loadMeta, read, write } from '../save';
import type { LockedAnimal } from '../ui-api';

// The WeChat stag: no following here (WeChat forbids rewarding a follow), it joins the herd
// once any animal has reached the grassland, and stays. Older saves that already have a
// freedom get it straight away. The cover greets it the first time it shows it.

const KEY = 'mill.stag.v1';

export function roster(): { animals: AnimalId[]; locked?: LockedAnimal; fresh?: AnimalId } {
  if (loadMeta().freed.length === 0)
    return { animals: BASE_ANIMALS, locked: { id: 'stag', note: TEXT.freedLockedNote, hint: TEXT.freedLockedHint } };
  const animals: AnimalId[] = [...BASE_ANIMALS, 'stag'];
  if (read<{ greeted: boolean }>(KEY)?.greeted) return { animals };
  write(KEY, { greeted: true });
  return { animals, fresh: 'stag' };
}
