// The player: a first-person body on the block grid, moved from the input layer's actions.
//
// Feel (skills: game-feel, camera-systems, physics-tuning, fps-shooter controller section):
// - Fixed 120 Hz simulation with render interpolation, so movement is identical at any frame rate
//   and never tunnels; frame time is clamped (a tab coming back does not fling the player).
// - Acceleration and friction instead of instant velocity (snappy on the ground, softer in air).
// - Coyote time (a jump just after walking off a ledge still works) and jump buffering (a jump
//   pressed just before landing fires on landing); a jump released early is cut short.
// - Step-up of ledges up to STEP_HEIGHT with a smoothed camera, so steps glide instead of snapping.
// - Head bob and footstep cadence from distance walked; footsteps report the surface underfoot.
// - Landing: a camera dip and a trauma-based shake scaled by the fall speed (both settings).
import * as THREE from 'three';
import { ACTIONS, EVENTS } from '../core/contracts.js';

export const EYE_HEIGHT = 1.775;
export const STEP_HEIGHT = 0.55;
export const RADIUS = 0.28;
const WALK = 3.6;
const RUN = 6.2;
const ACCEL_GROUND = 38;
const ACCEL_AIR = 9;
const FRICTION = 14;
const GRAVITY = 20;
const JUMP = 6.8;
const JUMP_CUT = 0.55; // vertical speed kept when jump is released while rising
const COYOTE = 0.11;
const BUFFER = 0.14;
const STEP_DIST = 1.15; // metres per footstep (walking; running stretches it)
const DT = 1 / 120;

/** Surface names for footsteps from the column kind underfoot. */
export function surfaceOf(kind) {
  if (kind === 'water' || kind === 'stream') return 'water';
  if (kind === 'floor' || kind === 'step') return 'stone';
  if (kind === 'wall') return 'grass';
  return 'felt';
}

/**
 * @param {{ camera, input, events, settings: () => object }} opts
 * World is set with setWorld({ heightAt, kindAt?, ceilingAt? }) and placed with teleport().
 */
export function createPlayerController({ camera, input, events, settings }) {
  let world = { heightAt: () => 0, kindAt: () => null };
  const feet = new THREE.Vector3();
  const prevFeet = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let grounded = true;
  let coyote = 0;
  let jumping = false;
  let acc = 0;
  let stepAcc = 0;
  let bobPhase = 0;
  let bobAmt = 0;
  let eyeOffset = 0; // smoothed step-up offset
  let dip = 0; // landing dip (metres, springs back)
  let dipVel = 0;
  let trauma = 0;
  let fallSpeed = 0;
  let frozen = false;
  let time = 0;
  let speed = 0;

  const groundUnder = (x, z) => Math.max(
    world.heightAt(x - RADIUS, z - RADIUS), world.heightAt(x + RADIUS, z - RADIUS),
    world.heightAt(x - RADIUS, z + RADIUS), world.heightAt(x + RADIUS, z + RADIUS),
  );
  const canStand = (x, z, y) => groundUnder(x, z) <= y + (grounded ? STEP_HEIGHT : 0.18);

  function step(dt) {
    prevFeet.copy(feet);
    const s = settings();
    const move = frozen ? { x: 0, y: 0 } : input.axis2('move');
    const running = !frozen && input.held(ACTIONS.RUN);
    const max = running ? RUN : WALK;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = fx * move.y + rx * move.x;
    let wz = fz * move.y + rz * move.x;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    // Accelerate toward the wish velocity; friction when there is no input on the ground.
    const accel = grounded ? ACCEL_GROUND : ACCEL_AIR;
    const tx = wx * max, tz = wz * max;
    const dvx = tx - vel.x, dvz = tz - vel.z;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = (len > 0.01 ? accel : (grounded ? FRICTION : ACCEL_AIR * 0.3)) * dt * max;
    if (dv > 0) {
      const k = Math.min(1, maxDv / dv);
      vel.x += dvx * k;
      vel.z += dvz * k;
    }

    // Horizontal move per axis (slides along walls).
    const nx = feet.x + vel.x * dt;
    if (canStand(nx, feet.z, feet.y)) feet.x = nx; else vel.x = 0;
    const nz = feet.z + vel.z * dt;
    if (canStand(feet.x, nz, feet.y)) feet.z = nz; else vel.z = 0;

    // Jump: buffered press + coyote window; release cuts the rise.
    coyote = grounded ? COYOTE : Math.max(0, coyote - dt);
    if (!frozen && coyote > 0 && input.consumeBuffered(ACTIONS.JUMP, BUFFER)) {
      vel.y = JUMP;
      grounded = false;
      coyote = 0;
      jumping = input.held(ACTIONS.JUMP); // a buffered tap already released jumps full height
      events.emit(EVENTS.JUMPED, { surface: surfaceOf(world.kindAt?.(feet.x, feet.z)) });
    }
    if (jumping && vel.y > 0 && !input.held(ACTIONS.JUMP)) {
      vel.y *= JUMP_CUT;
      jumping = false;
    }

    // Gravity and ground.
    vel.y -= GRAVITY * dt;
    feet.y += vel.y * dt;
    const g = groundUnder(feet.x, feet.z);
    const ceiling = world.ceilingAt?.(feet.x, feet.z);
    if (ceiling != null && feet.y + EYE_HEIGHT + 0.1 > ceiling && vel.y > 0) vel.y = 0;
    if (feet.y <= g) {
      const rise = g - feet.y;
      if (!grounded) {
        // Landed: dip and shake by fall speed.
        const impact = THREE.MathUtils.clamp((fallSpeed - 3) / 11, 0, 1);
        if (fallSpeed > 2.5) {
          dipVel -= 0.6 + impact * 2.4;
          if (s.cameraShake) trauma = Math.min(1, trauma + impact * 0.55);
          events.emit(EVENTS.LANDED, { impact, surface: surfaceOf(world.kindAt?.(feet.x, feet.z)) });
        }
      } else if (rise > 0.05 && rise <= STEP_HEIGHT + 0.01) {
        eyeOffset -= rise; // glide up the step
      }
      feet.y = g;
      vel.y = 0;
      grounded = true;
      jumping = false;
    } else if (feet.y > g + 0.02) {
      grounded = false;
    }
    if (!grounded) fallSpeed = Math.max(0, -vel.y); else fallSpeed = 0;

    // Footsteps and bob from distance walked on the ground.
    speed = Math.hypot(vel.x, vel.z);
    if (grounded && speed > 0.4) {
      const d = speed * dt;
      stepAcc += d;
      bobPhase += (d / STEP_DIST) * Math.PI;
      const stride = running ? STEP_DIST * 1.35 : STEP_DIST;
      if (stepAcc >= stride) {
        stepAcc -= stride;
        events.emit(EVENTS.STEP, { surface: surfaceOf(world.kindAt?.(feet.x, feet.z)), running });
      }
    }
    bobAmt = THREE.MathUtils.lerp(bobAmt, grounded ? Math.min(1, speed / WALK) : 0, 1 - Math.exp(-dt * 10));

    // Springs: step glide, landing dip, trauma decay.
    eyeOffset *= Math.exp(-dt * 14);
    dipVel += (-dip * 160 - dipVel * 16) * dt;
    dip += dipVel * dt;
    trauma = Math.max(0, trauma - dt * 1.6);
  }

  const look = { x: 0, y: 0 };
  function update(frameDt) {
    frameDt = Math.min(frameDt, 0.1);
    time += frameDt;
    const s = settings();
    if (!frozen) {
      const l = input.axis2('look');
      look.x = l.x; look.y = l.y;
      yaw -= look.x;
      pitch = THREE.MathUtils.clamp(pitch + look.y, -1.45, 1.45);
    }
    acc += frameDt;
    let n = 0;
    while (acc >= DT && n++ < 24) { step(DT); acc -= DT; }
    const alpha = acc / DT;
    const x = THREE.MathUtils.lerp(prevFeet.x, feet.x, alpha);
    const y = THREE.MathUtils.lerp(prevFeet.y, feet.y, alpha);
    const z = THREE.MathUtils.lerp(prevFeet.z, feet.z, alpha);
    const bob = s.headBob ? Math.abs(Math.sin(bobPhase)) * 0.045 * bobAmt : 0;
    const sway = s.headBob ? Math.sin(bobPhase) * 0.012 * bobAmt : 0;
    const shake = trauma * trauma;
    const n1 = Math.sin(time * 41.3) * Math.sin(time * 17.1 + 1.3);
    const n2 = Math.sin(time * 37.7 + 2.1) * Math.sin(time * 23.9);
    camera.position.set(x, y + EYE_HEIGHT + bob + eyeOffset + dip, z);
    camera.rotation.set(pitch + n1 * shake * 0.035, yaw + n2 * shake * 0.035, sway + n1 * shake * 0.02, 'YXZ');
    // FOV from settings, widening a touch when running.
    const targetFov = s.fov + (speed > WALK + 0.5 ? 4 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-frameDt * 6));
      camera.updateProjectionMatrix();
    }
  }

  return {
    update,
    setWorld(w) { world = w; },
    /** Places the feet at (x, ground, z) facing yaw. */
    teleport(position, faceYaw = yaw, facePitch = 0) {
      feet.set(position.x, 0, position.z);
      feet.y = groundUnder(feet.x, feet.z);
      prevFeet.copy(feet);
      vel.set(0, 0, 0);
      yaw = faceYaw;
      pitch = facePitch;
      grounded = true;
      acc = 0;
      eyeOffset = 0;
      dip = 0; dipVel = 0; trauma = 0;
      update(0);
    },
    /** Freezes movement and look (dialogue, menus, puzzles); the camera still settles. */
    setFrozen(f) { frozen = f; if (f) vel.set(0, vel.y, 0); },
    addTrauma(t) { if (settings().cameraShake) trauma = Math.min(1, trauma + t); },
    /** Turns the view smoothly toward a point (dialogue framing). */
    faceToward(point, k = 0.15) {
      const dx = point.x - feet.x, dz = point.z - feet.z;
      const target = Math.atan2(-dx, -dz);
      let d = target - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * k;
      const dy = point.y - (feet.y + EYE_HEIGHT);
      pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - pitch) * k;
    },
    get position() { return feet; },
    get velocity() { return vel; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get grounded() { return grounded; },
    get speed() { return speed; },
    get running() { return speed > WALK + 0.3; },
    get walkPhase() { return bobPhase * 2; },
  };
}
