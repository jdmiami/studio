// Creature bodies: a painted asset (models.js) moved by a brain (src/game/ai/) and animated
// procedurally from the brain's pose, so the soft felt figures need no skeleton: walking is a
// springy hop and waddle, sitting a squash, sleeping a slow breathing slump, wagging a whole-body
// wiggle. The body object is the brain's interface ({ position, yaw, velocity, setPose, lookAt });
// the root's height follows the ground under it, smoothed so steps read as hops.
import * as THREE from 'three';
import { placeModel } from './models.js';

const POSE_EASE = 8;

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

  function update(time, dt) {
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
    const land = 1 - Math.max(0, Math.cos(phase)) * 0.05 * (moving + w.hop);
    inner.scale.set(1 / Math.sqrt(squash * land), squash * breathe * land, 1 / Math.sqrt(squash * land));
    inner.rotation.z = Math.sin(phase) * 0.06 * moving + 0.25 * w.sleep;
    inner.rotation.x = -0.12 * w.run * moving + 0.08 * w.look;
  }

  return {
    root, body, model,
    update,
    /** Where a carried thing sits (the dog's mouth). */
    mouth(out = new THREE.Vector3()) {
      return out.set(Math.sin(shownYaw) * height * 0.45, height * 0.42, Math.cos(shownYaw) * height * 0.45).add(root.position);
    },
    get y() { return y; },
  };
}
