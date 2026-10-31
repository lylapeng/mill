// usage: node shrink.mjs <in.glb> <out.glb>
// After slim.mjs: drops accessors nothing uses any more (the trimmed clips left ~480 KB
// each behind), dedups, and quantizes the mesh (KHR_mesh_quantization, which GLTFLoader
// reads natively — no decoder to ship). ~870 KB → ~230 KB per animal.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst] = process.argv.slice(2);
const doc = await io.read(src);
for (const a of doc.getRoot().listAccessors()) if (a.listParents().every((p) => p.propertyType === PropertyType.ROOT)) a.dispose();
await doc.transform(dedup(), resample(), prune({ keepAttributes: false }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeWeight: 8 }));
await io.write(dst, doc);
