import * as THREE from 'three';

// flatShading takes each face's normal from screen-space derivatives of the view position.
// On iPhone (WeChat's WebGL over Metal) those come back zero or wrong on pixels along
// triangle edges, the normal turns NaN or points away, and the edges draw as short black
// lines. So flat-shaded materials also carry the vertex normal, and a pixel whose
// derivative normal is unusable falls back to it. Elsewhere nothing changes.
// Imported for its side effect, before any material compiles.

const chunks = THREE.ShaderChunk as Record<string, string>;
const passNormal = (chunk: string) =>
  chunk.replace('#ifndef FLAT_SHADED', '#if 1 // vNormal is kept for flat shading too (flat-normals.ts)');

chunks.normal_pars_vertex = passNormal(chunks.normal_pars_vertex);
chunks.normal_pars_fragment = passNormal(chunks.normal_pars_fragment);
chunks.normal_vertex = passNormal(chunks.normal_vertex);
chunks.normal_fragment_begin = chunks.normal_fragment_begin.replace(
  'vec3 normal = normalize( cross( fdx, fdy ) );',
  `vec3 flatN = cross( fdx, fdy );
	float flatLen = dot( flatN, flatN );
	// usable: finite, not degenerate, facing the camera (NaN fails every comparison)
	bool flatOk = flatLen > 1e-24 && flatLen < 1e24 && dot( flatN, vViewPosition ) < 0.0;
	vec3 normal = flatOk ? flatN * inversesqrt( flatLen ) : normalize( vNormal ) * faceDirection;`,
);
