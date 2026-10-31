// Staged icon shots inside the running game (dev server). Call await stage(name).
// name = <shot>-<animal>[-<variant>]
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// same as meadowHeight in util.ts
const meadow = (x, z) => Math.sin(x * 0.05) * Math.cos(z * 0.04) * 1.6 + Math.sin(x * 0.11 + z * 0.07) * 0.6;

window.stage = async (name) => {
  const M = window.__mill;
  const { THREE, Animal } = M;
  const [shot, kind, variant, palette] = name.split('-');
  document.querySelector('.ui').style.display = 'none';

  if (shot === 'top') {
    // straight down on the ring: the stone, the worn flagstone path, the animal on it
    const { yard, game } = M;
    game.done = true;
    game.rider.group.visible = false;
    // keep the flagstones from the wooden tier, drop its posts and roof
    yard.mill.tierGroups[1].children.forEach((c) => (c.visible = !!c.isInstancedMesh));
    // the animal walks the ring with its body along it (tangent), the beam running out from the
    // centre to its shoulder. Seen from the front, the clock position (6 = nearest the camera,
    // 9 = left) decides the angle of its body: around 7-8 o'clock it is nearly side-on, facing left.
    const clock = { '7': 7, '730': 7.5, '8': 8 }[variant] ?? 7.5;
    const th = ((clock - 6) / 12) * Math.PI * 2; // 0 at 6 o'clock, growing toward 9
    const R = 3.1;
    const ax = -R * Math.sin(th), az = R * Math.cos(th);
    const a = Math.atan2(az, ax); // the game's ring angle; walking makes it grow
    const an = new Animal(kind);
    an.play('Walk', 0);
    an.update(0.4);
    an.root.position.set(ax, 0, az);
    an.root.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); // facing along the ring
    yard.scene.add(an.root);
    yard.mill.update(0, 0, a); // beam out to the animal, as in the game
    yard.land.trunks.visible = false;
    yard.land.crowns.visible = false;
    // only the mill and the animal cast shadows: nothing else falls across the ring
    yard.scene.traverse((o) => (o.castShadow = false));
    yard.mill.group.traverse((o) => (o.castShadow = !!o.isMesh));
    an.root.scale.setScalar(2.0);
    // lift it off the grey stones a little
    an.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.material = o.material.clone();
      o.material.emissive.copy(o.material.color).multiplyScalar(0.28);
    });
    if (palette === 'pop' || palette === 'popdusk') {
      // for a small icon: the donkey and the mill must not share a colour. A pale cream stone,
      // a deep cool-grey donkey with a light belly, no flagstones, plain daylight (or dusk).
      const paint = (root, map) => root.traverse((o) => {
        if (!o.isMesh) return;
        const mats = [].concat(o.material).map((m) => {
          const hex = map[m.color.getHexString()];
          if (!hex) return m;
          const c = m.clone();
          c.color.set(hex);
          if (c.emissive) c.emissive.copy(c.color).multiplyScalar(0.22);
          return c;
        });
        o.material = Array.isArray(o.material) ? mats : mats[0];
      });
      paint(yard.mill.group, { '9b978e': '#e2d2ae', '7d7a73': '#bfa983', '7b5a3e': '#6e2a1a' });
      paint(an.model, { '6c6e6d': '#4c5058', 'a8a8a8': '#eeeeea', '323232': '#1d1c1f' });
      yard.mill.tierGroups[1].visible = false;
      // bloom would blur the pale stone into the grass
      Object.defineProperty(yard, 'bloom', { get: () => 0.04 });
      if (palette === 'pop') {
        yard.scene.traverse((o) => {
          if (o.isDirectionalLight) { o.color.set('#fff4e2'); o.intensity = 2.7; }
          if (o.isHemisphereLight) { o.color.set('#d9ecff'); o.groundColor?.set('#6d8a3c'); o.intensity = 1.1; }
        });
      }
    }
    const cam = yard.camera;
    // high and a little in front: the ring stays round-ish, the animal shows its side and ears
    cam.up.set(0, 1, 0);
    const tilt = THREE.MathUtils.degToRad(17);
    const look = new THREE.Vector3(ax * 0.5, 1.3, az * 0.3);
    // the recoloured icon shots frame tighter, so the two shapes fill a small icon
    cam.fov = palette ? 25 : 31;
    cam.position.set(look.x, 13 * Math.sin(tilt) + look.y, look.z + 13 * Math.cos(tilt));
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    return;
  }

  // the other shots happen on the grassland at the end, sun low and straight ahead (+z)
  M.toFreedom();
  await wait(3800); // let the white flash clear
  const F = M.freedom;
  F.update = () => {}; // freeze the run; we place everything
  F.rider?.dispose();
  const cam = F.camera;
  cam.up.set(0, 1, 0);
  const an = new Animal(kind);
  F.scene.add(an.root);
  F.flowers.visible = false;

  // find a crest: camera C in a dip, animal P on a rise `dist` metres away, falling off behind it
  const dist = shot === 'sun' ? 30 : 6;
  let best = null;
  for (let x = -40; x <= 40; x += 2) for (let z = -40; z <= 40; z += 2) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    const px = x + dx * dist, pz = z + dz * dist;
    const score = meadow(px, pz) - meadow(x, z) - Math.max(0, meadow(px + dx * 6, pz + dz * 6) - meadow(px, pz)) * 2;
    if (!best || score > best.score) best = { score, x, z, dx, dz };
  }
  const dir = new THREE.Vector3(best.dx, 0, best.dz);
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  const P = new THREE.Vector3(best.x + best.dx * dist, 0, best.z + best.dz * dist);
  P.y = meadow(P.x, P.z);
  // grass only beyond the animal: nothing between it and the lens
  F.uniforms.uCenter.value.set(P.x + dir.x * 31, 0, P.z + dir.z * 31);
  an.root.position.copy(P);
  const sunBehind = (from, to, lift) => {
    const v = to.clone().sub(from);
    const el = Math.atan2(v.y, Math.hypot(v.x, v.z)) + THREE.MathUtils.degToRad(lift);
    const h = new THREE.Vector3(v.x, 0, v.z).normalize();
    F.sky.sunDir.set(h.x * Math.cos(el), Math.sin(el), h.z * Math.cos(el));
  };

  if (shot === 'sun') {
    // long lens: the animal side-on, standing on the rise in front of the sun
    an.play(variant === 'walk' ? 'Walk' : 'Idle', 0);
    an.update(variant === 'walk' ? 0.62 : 0.45);
    const face = variant === 'left' ? side.clone().negate() : side;
    an.root.rotation.y = Math.atan2(face.x, face.z);
    an.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(an.root);
    const mid = box.getCenter(new THREE.Vector3());
    cam.fov = 3.7 * (box.max.y - box.min.y); // same framing for every animal
    // the sun disk takes the same share of the frame for every animal
    const r = THREE.MathUtils.degToRad(cam.fov * 0.27);
    const c0 = Math.cos(r * 1.03), c1 = Math.cos(r);
    // bloom would wash the silhouette out, so draw a big bright sun in the sky itself instead
    F.bloom = 0;
    const m = F.sky.material;
    m.fragmentShader = m.fragmentShader.replace(
      'col += uSunColor * smoothstep(0.99935, 0.9997, sd) * 5.0;',
      `col += uSunColor * pow(sd, 900.0) * 0.6; col = mix(col, vec3(1.0, 0.95, 0.82), smoothstep(${(c0).toFixed(6)}, ${(c1).toFixed(6)}, sd));`,
    );
    m.needsUpdate = true;
    cam.position.set(best.x, meadow(best.x, best.z) + 1.7, best.z);
    sunBehind(cam.position, mid, 0.06 * (box.max.y - box.min.y) * 3.7);
    cam.lookAt(mid.x, mid.y + (box.max.y - box.min.y) * 0.08, mid.z);
    // backlit: only a little light reaches the side facing us
    F.scene.traverse((o) => { if (o.isLight) o.intensity *= 0.28; });
  } else if (shot === 'head') {
    // three-quarter close-up of head and ears, the sun just off its shoulder
    an.play('Idle', 0);
    an.update(1.2);
    const turn = variant === 'left' ? -0.75 : 0.75;
    const face = dir.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    an.root.rotation.y = Math.atan2(face.x, face.z);
    an.root.updateMatrixWorld(true);
    const head = an.bone('Head').getWorldPosition(new THREE.Vector3());
    const tall = new THREE.Box3().setFromObject(an.root).max.y - P.y;
    cam.fov = 26;
    // a little below the head, so it stands against the sky rather than the field
    cam.position.copy(head).addScaledVector(dir, -tall * 1.25).add(new THREE.Vector3(0, -tall * 0.3, 0));
    if (variant === 'front') {
      // the low sun over the camera's shoulder lights the face; the sky behind keeps its colour
      const back = cam.position.clone().sub(head).setY(0).normalize().addScaledVector(side, 0.9).normalize();
      const el = THREE.MathUtils.degToRad(8);
      F.sky.sunDir.set(back.x * Math.cos(el), Math.sin(el), back.z * Math.cos(el));
    } else sunBehind(cam.position, head, 1.6);
    // aim between the ears and the muzzle so both stay in frame
    const look = head.clone().addScaledVector(face, tall * 0.1).add(new THREE.Vector3(0, -tall * 0.12, 0));
    F.bloom = 0.25;
    const fill = new THREE.DirectionalLight('#ffd8b8', variant === 'front' ? 0.6 : variant === 'bright' ? 4 : 1.7);
    fill.position.copy(cam.position).addScaledVector(side, variant === 'left' ? 2 : -2).add(new THREE.Vector3(0, 1.5, 0));
    fill.target = an.root;
    F.scene.add(fill);
    // a cool rim from the sky side keeps the outline against the sky
    const rim = new THREE.DirectionalLight('#ffe6c8', 1.2);
    rim.position.copy(head).addScaledVector(dir, 6).add(new THREE.Vector3(0, 3, 0));
    rim.target = an.root;
    F.scene.add(rim);
    cam.lookAt(look);
  }
  // the sunlight follows the sun we placed in the sky
  if (shot === 'head' && variant === 'front') {
    const sunLight = F.scene.children.find((o) => o.isDirectionalLight);
    sunLight.position.copy(F.sky.sunDir).multiplyScalar(100).add(an.root.position);
    sunLight.target = an.root;
  }
  // the sky is drawn around its own centre: keep it on the camera so the sun is where we put it
  F.sky.mesh.position.copy(cam.position);
  cam.updateProjectionMatrix();
};
