// Puts a pose onto the bones: wing fold/flap, tail fan, two-bone leg IK.
import * as THREE from 'three';
import { type Songbird, SEAT, SHOULDER, WRIST, THIGH, SHANK } from './songbird';

export interface Pose {
  lift: number; pitch: number; roll: number;
  neckX: number; headX: number; headY: number; headZ: number; jaw: number;
  tailX: number; tailY: number; fan: number;
  open: number; flap: number; bend: number; sweep: number;
  feet: { x: number; y: number; z: number }[]; // in the bird's own frame; y=0 is the perch
  tuck: number;
}
export const perch = (): Pose => ({
  // upright, as the standing sprite is: the chest carries the curve and the belly tucks away under it.
  // The head turns back to level, mostly at the neck
  lift: 0.525, pitch: -1.012, roll: 0,
  neckX: SEAT.neckX, headX: SEAT.headX, headY: 0, headZ: 0, jaw: 0,
  tailX: 0.55, tailY: 0, fan: 0.06,
  open: 0, flap: 0, bend: 0, sweep: 0,
  feet: [{ x: 0.115, y: 0, z: 0.053 }, { x: -0.115, y: 0, z: -0.053 }],
  tuck: 0,
});

const Q = () => new THREE.Quaternion();
const qa = Q(), qb = Q(), q1 = Q(), tmpQ = Q();
const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), wrist = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), DOWN = new THREE.Vector3(0, -1, 0);
const hipV = new THREE.Vector3(), target = new THREE.Vector3(), joint = new THREE.Vector3(), axis = new THREE.Vector3();
const bodyM = new THREE.Matrix4(), bodyInv = new THREE.Matrix4(), toMesh = new THREE.Matrix4();

export function apply(b: Songbird, p: Pose) {
  b.body.position.set(0, p.lift, 0);
  b.body.rotation.set(p.pitch, 0, p.roll);
  b.neck.rotation.set(p.neckX, 0, 0);
  b.head.position.set(0, SEAT.headY, SEAT.headZ); // sunk into the shoulders, closer than the bones were bound: no neck
  b.head.rotation.set(p.headX, 0, p.headZ, 'YXZ');
  // the turn itself happens in the shader, about the head's own upright, in the mesh's space
  b.head.updateWorldMatrix(true, false);
  toMesh.copy(b.group.matrixWorld).invert();
  b.twist.angle.value = p.headY;
  b.twist.pivot.value.setFromMatrixPosition(b.head.matrixWorld).applyMatrix4(toMesh);
  b.twist.axis.value.setFromMatrixColumn(b.neck.matrixWorld, 1).transformDirection(toMesh);
  b.jaw.rotation.x = p.jaw;
  b.rump.rotation.set(p.tailX, p.tailY, 0);
  for (const t of b.tail) {
    t.bone.rotation.set(0, -t.side * (0.02 + t.order * p.fan), t.side * (0.3 - p.fan * 1.2), 'YXZ');
  }
  for (const s of b.scap) { s.bone.position.copy(s.pos); s.bone.quaternion.copy(s.q); }

  const show = Math.max(0.001, 1 - Math.min(1, p.open / 0.1));
  for (const h of b.shields) { h.bone.position.copy(h.pos); h.bone.quaternion.copy(h.q); h.bone.scale.setScalar(show); }

  // wings; computed for the left, mirrored for the right
  const o = p.open;
  qa.setFromAxisAngle(Y, p.sweep).multiply(q1.setFromAxisAngle(Z, p.flap));
  qb.copy(qa).multiply(q1.setFromAxisAngle(Z, p.bend));
  wrist.copy(WRIST).applyQuaternion(qa).add(SHOULDER);
  for (const h of b.hosts) {
    if (h.hand) { v0.copy(h.ext).applyQuaternion(qb).add(wrist); tmpQ.copy(qb).multiply(h.extQ); }
    else { v0.copy(h.ext).applyQuaternion(qa).add(SHOULDER); tmpQ.copy(qa).multiply(h.extQ); }
    v1.copy(h.fold).lerp(v0, o);
    q1.copy(h.foldQ).slerp(tmpQ, o);
    if (h.mirror) { v1.x = -v1.x; q1.set(q1.x, -q1.y, -q1.z, q1.w); }
    h.bone.position.copy(v1);
    h.bone.quaternion.copy(q1);
  }

  // legs: feet in the bird frame -> body frame -> 2-bone IK, knee bends backward
  b.body.updateMatrix();
  bodyM.copy(b.body.matrix);
  bodyInv.copy(bodyM).invert();
  b.legs.forEach((l, i) => {
    const f = p.feet[i];
    target.set(f.x, f.y, f.z).applyMatrix4(bodyInv);
    hipV.copy(l.hip);
    const d = v0.subVectors(target, hipV);
    const max = (THIGH + SHANK) * 0.995;
    const len = Math.min(d.length(), max);
    d.setLength(Math.max(len, 0.06));
    const a = (THIGH * THIGH - SHANK * SHANK + d.lengthSq()) / (2 * d.length());
    const h = Math.sqrt(Math.max(0, THIGH * THIGH - a * a));
    // bend axis: the joint sits behind the line from hip to foot
    axis.set(0, 0, -1).addScaledVector(d, -d.z / d.lengthSq() * -1).normalize();
    joint.copy(d).setLength(a).addScaledVector(axis, h);
    tmpQ.setFromUnitVectors(DOWN, v1.copy(joint).normalize());
    l.thigh.quaternion.copy(tmpQ);
    qa.setFromUnitVectors(DOWN, v1.copy(d).sub(joint).normalize());
    l.shank.quaternion.copy(tmpQ).invert().multiply(qa);
    // the foot stays flat on the perch whatever the body does
    qb.setFromRotationMatrix(bodyM).invert();
    q1.copy(qa).invert().multiply(qb);
    l.foot.quaternion.copy(q1);
  });
}
