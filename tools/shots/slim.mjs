// keep only the clips the game uses, then prune and resample
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
const keep = new Set(['Walk', 'Gallop', 'Idle', 'Eating']);
const io = new NodeIO();
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) a.dispose();
await doc.transform(resample(), prune(), dedup());
await io.write(out, doc);
console.log(out, doc.getRoot().listAnimations().map((a) => a.getName()).join(','));
