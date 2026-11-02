// The player: a body on the block grid, moved from the input layer's actions, seen in third person
// over the shoulder (the target shot's camera, src/game/shot.js) or, by setting, in first person.
//
// Scale: the explorer stands about 4 blocks tall (BODY = 2 against the original 2-block body), so
// 1-block steps are walked up and a jump clears 2 blocks.
// Third person: the camera orbits a shoulder pivot (look turns and tilts it); it pulls in when
// a wall or ceiling is between it and the pivot, and eases back out. The body turns to face its
// movement, not the camera.
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

export const BODY = 2;
export const EXPLORER_HEIGHT = 1.9 * BODY;
export const EYE_HEIGHT = 1.775 * BODY;
export const STEP_HEIGHT = 1.1;
export const RADIUS = 0.5;
const WALK = 5.8;
const RUN = 9.6;
const ACCEL_GROUND = 38;
const ACCEL_AIR = 9;
const FRICTION = 14;
const GRAVITY = 30;
const JUMP = 11.7; // about 2.3 blocks
const JUMP_CUT = 0.55; // vertical speed kept when jump is released while rising
const COYOTE = 0.11;
const BUFFER = 0.14;
const STEP_DIST = 1.15 * BODY; // metres per footstep (walking; running stretches it)

// Third-person rig (the target shot's camera: 1.09 explorer heights up, 1.0 behind, 11 degrees
// down, a little to the right), as an orbit round a shoulder pivot.
const PIVOT = 0.75; // explorer heights
const ORBIT_DIST = 1.056; // explorer heights
const ORBIT_RISE = Math.atan2(1.09 - PIVOT, 1.0); // camera elevation over the pivot at rest
const VIEW_PITCH = -11 * Math.PI / 180; // view tilt at rest
const SIDE = 0.22; // explorer heights to the right (the explorer stands on the left third)

/** Third-person vertical field of view: the shot's 61 degrees across, held between 50 and 92 tall. */
export function thirdPersonFov(aspect) {
  const v = (2 * Math.atan(Math.tan((61 * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(92, Math.max(50, v));
}
const DT = 1 / 120;

/**
 * The vertical field of view to use for a setting (a landscape vertical FOV) on a screen of this
 * aspect: unchanged in landscape; widened in portrait so a phone held upright still sees enough to
 * the sides (half way to keeping the horizontal view), capped at 100 degrees.
 */
export function fovFor(fov, aspect) {
  if (!(aspect < 1)) return fov;
  const t = Math.tan((fov * Math.PI) / 360) / Math.sqrt(aspect);
  return Math.min(100, (Math.atan(t) * 360) / Math.PI);
}

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
  let facing = 0; // the body's heading (third person)
  let camDist = ORBIT_DIST * EXPLORER_HEIGHT;

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
    // The body turns toward where it is going (third person).
    if (speed > 0.6) {
      const want = Math.atan2(-vel.x, -vel.z);
      let d = want - facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      facing += d * (1 - Math.exp(-frameDt * 12));
    }
    const third = s.camera !== 'first';
    if (third) {
      const h = EXPLORER_HEIGHT;
      const px = x, py = y + PIVOT * h + eyeOffset * 0.5 + dip * 0.5, pz = z;
      const rise = THREE.MathUtils.clamp(ORBIT_RISE - pitch, -0.35, 1.25);
      const want = ORBIT_DIST * h * (camera.aspect > 1 ? 1.5 : 1); // wider screens pull back
      // Pull in when the way to the camera is blocked; ease back out.
      const bx = Math.sin(yaw) * Math.cos(rise), by = Math.sin(rise), bz = Math.cos(yaw) * Math.cos(rise);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let free = want;
      for (let t = 0.3; t <= want; t += 0.1) {
        const cx = px + bx * t + rx * SIDE * h * (t / want), cy = py + by * t, cz = pz + bz * t + rz * SIDE * h * (t / want);
        const g = world.heightAt(cx, cz);
        const c = world.ceilingAt?.(cx, cz);
        if (g > cy - 0.25 || (c != null && c < cy + 0.25)) { free = Math.max(0.3, t - 0.15); break; }
      }
      camDist = free < camDist ? free : THREE.MathUtils.lerp(camDist, free, 1 - Math.exp(-frameDt * 3));
      const k = camDist / want;
      camera.position.set(px + bx * camDist + rx * SIDE * h * k, py + by * camDist, pz + bz * camDist + rz * SIDE * h * k);
      const viewPitch = VIEW_PITCH - (rise - ORBIT_RISE);
      camera.rotation.set(viewPitch + n1 * shake * 0.035, yaw + n2 * shake * 0.035, n1 * shake * 0.02, 'YXZ');
    } else {
      camera.position.set(x, y + EYE_HEIGHT + bob + eyeOffset + dip, z);
      camera.rotation.set(pitch + n1 * shake * 0.035, yaw + n2 * shake * 0.035, sway + n1 * shake * 0.02, 'YXZ');
    }
    // FOV from settings (first person) or the shot's (third), widening a touch when running.
    const targetFov = (third ? thirdPersonFov(camera.aspect) : fovFor(s.fov, camera.aspect)) + (speed > WALK + 0.5 ? 4 : 0);
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
      facing = faceYaw;
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
    /** The body's heading (it turns to face its movement). */
    get facing() { return facing; },
    /** Where the eyes are: the head in third person, the camera in first. */
    eye(out = new THREE.Vector3()) { return out.set(feet.x, feet.y + EYE_HEIGHT, feet.z); },
    get pitch() { return pitch; },
    get grounded() { return grounded; },
    get speed() { return speed; },
    get running() { return speed > WALK + 0.3; },
    get walkPhase() { return bobPhase * 2; },
  };
}
