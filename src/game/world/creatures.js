// Creature bodies: a painted asset (models.js) moved by a brain (src/game/ai/) and animated
// procedurally from the brain's pose, so the soft felt figures need no skeleton: walking is a
// springy hop and waddle, sitting a squash, sleeping a slow breathing slump, wagging a whole-body
// wiggle. The body object is the brain's interface ({ position, yaw, velocity, setPose, lookAt });
// the root's height follows the ground under it, smoothed so steps read as hops.
import * as THREE from 'three';
import { placeModel } from './models.js';
import { createFace } from './faces.js';

const POSE_EASE = 8;
const SQUISH_K = 220; // the squish spring: stiff and underdamped, so a boop wobbles twice
const SQUISH_DAMP = 11;
const VIEW_RANGE = 6; // eyes follow the player inside this distance

/**
 * @param {{ modelId: string, height: number, position: THREE.Vector3, heightAt: (x, z) => number, yawOffset?: number, hopScale?: number }} o
 */
export function createCreature({ modelId, height, position, heightAt, yawOffset = 0, hopScale = 1, name = modelId }) {
  const root = new THREE.Group();
  root.name = name;
  const model = placeModel(modelId, { height });
  const inner = new THREE.Group(); // pose transforms (squash, tilt) about the base
  inner.add(model);
  root.add(inner);
  model.rotation.y = yawOffset;
  const faceRig = createFace(model, modelId);

  const body = {
    position: new THREE.Vector3(position.x, 0, position.z),
    yaw: 0,
    velocity: { x: 0, z: 0 },
    pose: 'idle',
    look: null,
    setPose(p) { body.pose = p; },
    lookAt(point) { body.look = point ? { x: point.x, z: point.z } : null; },
  };
  let y = heightAt(position.x, position.z);
  let phase = Math.random() * 10;
  let shownYaw = 0;
  const w = { walk: 0, run: 0, sit: 0, sleep: 0, wag: 0, hop: 0, look: 0 };
  let squish = 0; // + squashed, - stretched
  let squishV = 0;
  let wasDown = true;
  const eyeAt = new THREE.Vector3();

  /** A springy boop: squash by `amount` (negative stretches) and wobble back. */
  function squishBy(amount) { squishV += amount * 26; }

  function update(time, dt, viewer = null) {
    const k = 1 - Math.exp(-dt * POSE_EASE);
    for (const key of Object.keys(w)) w[key] += ((body.pose === key ? 1 : 0) - w[key]) * k;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    phase += dt * (4 + speed * 3.2);
    // Ground, eased (steps up are hopped, down are dropped quickly).
    const g = heightAt(body.position.x, body.position.z);
    y += (g - y) * (1 - Math.exp(-dt * (g > y ? 14 : 20)));
    const moving = Math.min(1, speed / 1.5);
    const bounce = Math.abs(Math.sin(phase)) * height * (0.05 * moving + 0.16 * w.hop) * hopScale;
    root.position.set(body.position.x, y + bounce, body.position.z);
    // Facing: the body's yaw, or toward the look target when idle.
    let face = body.yaw;
    if (body.look && speed < 0.3) face = Math.atan2(body.look.x - body.position.x, body.look.z - body.position.z);
    let d = face - shownYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    shownYaw += d * (1 - Math.exp(-dt * 7));
    root.rotation.y = shownYaw + Math.sin(time * 14) * 0.18 * w.wag;
    // Squash and tilt.
    const breathe = 1 + Math.sin(time * (w.sleep > 0.5 ? 1.4 : 2.6)) * (0.015 + 0.02 * w.sleep);
    const squash = 1 - 0.13 * w.sit - 0.22 * w.sleep;
    // Hops: stretch on the way up, a squash kick on each landing that the spring wobbles out.
    const hopping = moving + w.hop;
    const air = Math.abs(Math.sin(phase));
    const down = air < 0.2;
    if (down && !wasDown && hopping > 0.3) squishBy(0.06 * Math.min(1.5, hopping) * hopScale);
    wasDown = down;
    squishV += (-SQUISH_K * squish - SQUISH_DAMP * squishV) * dt;
    squish = THREE.MathUtils.clamp(squish + squishV * dt, -0.3, 0.35);
    const stretch = 1 + 0.07 * air * Math.min(1, hopping) * hopScale;
    const land = (1 - squish) * stretch;
    inner.scale.set(1 / Math.sqrt(squash * land), squash * breathe * land, 1 / Math.sqrt(squash * land));
    inner.rotation.z = Math.sin(phase) * 0.06 * moving + 0.25 * w.sleep;
    inner.rotation.x = -0.12 * w.run * moving + 0.08 * w.look;
    // The face: eyes on the player when close, else on whatever the brain looks at.
    let look = null;
    if (viewer && Math.hypot(viewer.x - body.position.x, viewer.z - body.position.z) < VIEW_RANGE) look = viewer;
    else if (body.look) look = eyeAt.set(body.look.x, y + height * 0.6, body.look.z);
    faceRig.update(dt, { pose: body.pose, look });
  }

  return {
    root, body, model, face: faceRig,
    update,
    squish: squishBy,
    /** Where a carried thing sits (the dog's mouth). */
    mouth(out = new THREE.Vector3()) {
      return out.set(Math.sin(shownYaw) * height * 0.45, height * 0.42, Math.cos(shownYaw) * height * 0.45).add(root.position);
    },
    get y() { return y; },
  };
}
