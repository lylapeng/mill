import * as THREE from 'three';

// Snow settles on whatever faces up: roofs, rails, the tops of pine tiers, the mountains.
// A material patch, only applied in winter, so the usual yard compiles exactly as before.
// The cover is one shared uniform that follows the palette; patches come from a little
// world-space noise so the snow lies in drifts instead of a painted coat.

export const snowUniforms = {
  uSnow: { value: 0 },
  uSnowColor: { value: new THREE.Color('#f4f6fa') },
};

const pars = /* glsl */ `
uniform float uSnow;
uniform vec3 uSnowColor;
varying vec3 vSnowWorld;
float snowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), u.x), mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

/**
 * `slope` is how far from straight up a face may lean and still hold snow (0 = only flat
 * tops, 1 = steep sides too); pine tiers need more than roofs.
 */
export function addSnow(material: THREE.Material, slope = 0.35) {
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  const lo = (0.75 - slope * 0.6).toFixed(3);
  const hi = (0.95 - slope * 0.5).toFixed(3);
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, snowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowWorld;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 sp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            sp = instanceMatrix * sp;
          #endif
          vSnowWorld = (modelMatrix * sp).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + pars)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // view-space normal back to world space (viewMatrix is a rotation + translation)
          float up = (vec4(normal, 0.0) * viewMatrix).y;
          float drift = snowNoise(vSnowWorld.xz * 1.7) * 0.6 + snowNoise(vSnowWorld.xz * 6.0) * 0.4;
          float lo = ${lo} + (drift - 0.5) * 0.35;
          float cover = smoothstep(lo, lo + ${hi} - ${lo}, up) * smoothstep(0.0, 0.35, uSnow - (1.0 - drift) * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, clamp(cover, 0.0, 1.0));
        }`,
      );
  };
  material.customProgramCacheKey = () => prevKey() + `|snow${slope}`;
  material.needsUpdate = true;
}
