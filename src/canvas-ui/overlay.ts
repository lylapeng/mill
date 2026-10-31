import * as THREE from 'three';

// Puts the UI canvas on screen over the 3D frame. The mini game has a single on-screen
// canvas, so the UI is a texture drawn last on a full-screen quad.

export class Overlay {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private texture: THREE.CanvasTexture | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      // the canvas is already in display colours: no tone mapping, no colour-space conversion
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(map, vUv); }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** After the canvas changes size: textures are allocated once at a fixed size. */
  resize() {
    this.texture?.dispose();
    this.texture = null;
  }

  /** Draw on top of whatever is on screen; `changed` re-uploads the canvas. */
  render(renderer: THREE.WebGLRenderer, changed: boolean) {
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.material.uniforms.map.value = this.texture;
    } else if (changed) this.texture.needsUpdate = true;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }
}
