// The target shot's camera (docs/target-shot.md): a third-person view over the explorer's shoulder,
// solved from the reference's vanishing points. ?frame=target puts the game camera here every frame
// and stands a placeholder explorer at the player's feet, so the game can be framed and scored
// against docs/reference/target-shot.jpg (scripts/shot/capture.mjs, scripts/shot/score.py).
import * as THREE from 'three';

/**
 * Lengths are in explorer heights; angles in degrees.
 * - vfov: vertical field of view (focal length ~950 px on the 1979 px tall frame)
 * - pitch: camera tilt below the horizon
 * - height / back: camera above the feet, and behind them along the view direction
 * - side: shift to the camera's right (the explorer stands left of centre)
 */
export const SHOT_TARGET = { width: 1125, height: 1979, vfov: 92, pitch: 11, eye: 1.09, back: 1.0, side: 0.12 };

/** The explorer's height in world units (the first-person eye height is 1.775). */
export const EXPLORER_HEIGHT = 1.9;

/**
 * Where the shot camera sits for feet at `feet` facing `yaw` (yaw 0 looks down -z).
 * Returns { position, pitch, yaw, fov } (pitch in radians, negative looks down).
 */
export function shotCamera(feet, yaw, s = SHOT_TARGET, h = EXPLORER_HEIGHT) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // forward
  const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right
  const position = new THREE.Vector3(
    feet.x - fx * s.back * h + rx * s.side * h,
    feet.y + s.eye * h,
    feet.z - fz * s.back * h + rz * s.side * h,
  );
  return { position, pitch: -THREE.MathUtils.degToRad(s.pitch), yaw, fov: s.vfov };
}

/** A stand-in explorer (dark sweater, green beanie, brown pack and boots) until the real one exists. */
export function createPlaceholderExplorer(h = EXPLORER_HEIGHT) {
  const g = new THREE.Group();
  g.name = 'explorer-placeholder';
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const part = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x * h, y * h, z * h); g.add(m); return m; };
  part(new THREE.CapsuleGeometry(0.16 * h, 0.22 * h, 6, 12), '#3e4a3c', 0, 0.5, 0); // sweater
  part(new THREE.SphereGeometry(0.19 * h, 16, 12), '#3b2c26', 0, 0.8, 0); // hair
  part(new THREE.SphereGeometry(0.17 * h, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), '#3e5440', 0, 0.86, 0); // beanie
  part(new THREE.BoxGeometry(0.26 * h, 0.26 * h, 0.12 * h), '#6b4a34', 0, 0.52, 0.15); // backpack (behind)
  part(new THREE.CylinderGeometry(0.07 * h, 0.08 * h, 0.22 * h), '#2b2829', -0.07, 0.17, 0); // legs
  part(new THREE.CylinderGeometry(0.07 * h, 0.08 * h, 0.22 * h), '#2b2829', 0.07, 0.17, 0);
  part(new THREE.BoxGeometry(0.11 * h, 0.08 * h, 0.16 * h), '#6b4a34', -0.07, 0.04, -0.02); // boots
  part(new THREE.BoxGeometry(0.11 * h, 0.08 * h, 0.16 * h), '#6b4a34', 0.07, 0.04, -0.02);
  return g;
}
