// First-person controls: pointer-lock mouse look, WASD, Shift to run, Space to jump, gravity,
// and collision against the block grid (step up ledges up to STEP_HEIGHT).
import * as THREE from 'three';

const EYE_HEIGHT = 1.775; // the reference frame's solved eye above its terrace (docs/reference/cave-door-camera.json)
const STEP_HEIGHT = 0.55;
const RADIUS = 0.28;
const WALK = 3.6;
const RUN = 6.5;
const GRAVITY = 20;
const JUMP = 6.8;

export function createFirstPersonControls(camera, dom, { heightAt, spawn }) {
  const feet = spawn.position.clone();
  feet.y = heightAt(feet.x, feet.z);
  let yaw = spawn.yaw;
  let pitch = spawn.pitch;
  let vy = 0;
  let grounded = true;
  let walkPhase = 0;
  let speedNow = 0;
  const keys = new Set();

  const onMouseMove = (e) => {
    if (document.pointerLockElement !== dom) return;
    yaw -= e.movementX * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.45, 1.45);
  };
  const onKeyDown = (e) => {
    keys.add(e.code);
    if (e.code === 'Space' && grounded) {
      vy = JUMP;
      grounded = false;
    }
  };
  const onKeyUp = (e) => keys.delete(e.code);
  dom.addEventListener('click', () => dom.requestPointerLock?.());
  addEventListener('mousemove', onMouseMove);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  // Highest ground under the player's footprint.
  const groundUnder = (x, z) => Math.max(
    heightAt(x - RADIUS, z - RADIUS), heightAt(x + RADIUS, z - RADIUS),
    heightAt(x - RADIUS, z + RADIUS), heightAt(x + RADIUS, z + RADIUS),
  );
  const canStand = (x, z) => groundUnder(x, z) <= feet.y + STEP_HEIGHT;

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();

  function update(dt) {
    dt = Math.min(dt, 0.05);
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    move.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar((running ? RUN : WALK) * dt);

    // Resolve each axis separately so the player slides along walls.
    if (canStand(feet.x + move.x, feet.z)) feet.x += move.x;
    if (canStand(feet.x, feet.z + move.z)) feet.z += move.z;

    vy -= GRAVITY * dt;
    feet.y += vy * dt;
    const ground = groundUnder(feet.x, feet.z);
    if (feet.y <= ground) {
      feet.y = ground; // also climbs small steps
      vy = 0;
      grounded = true;
    }

    speedNow = THREE.MathUtils.lerp(speedNow, moving && grounded ? (running ? 1.6 : 1) : 0, 0.15);
    walkPhase += dt * speedNow * 9;
    const bob = Math.sin(walkPhase) * 0.04 * speedNow;
    camera.position.set(feet.x, feet.y + EYE_HEIGHT + bob, feet.z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  // Apply the spawn pose immediately (used for still screenshots).
  update(0);

  return {
    update,
    get position() { return feet; },
    get yaw() { return yaw; },
    get walkPhase() { return walkPhase; },
    get speed() { return speedNow; },
    get running() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    isDown: (code) => keys.has(code),
  };
}
