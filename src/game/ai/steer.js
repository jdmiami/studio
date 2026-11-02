// Steering on the ground plane with plain {x, z} vectors (no three.js). Steering functions return
// a desired acceleration (m/s^2); integrate() applies it to a body with max speed / accel and a turn
// rate, refuses steps onto unwalkable ground (sliding along the blocked axis when it can) and turns
// yaw toward the velocity.
//
// Yaw convention (matches three.js rotation.y for a model facing +Z): yaw = atan2(dx, dz), so
// yaw 0 faces +Z and yaw PI/2 faces +X.

export const vec = (x = 0, z = 0) => ({ x, z });
export const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, z: a.z * s });
export const len = (a) => Math.hypot(a.x, a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const normalize = (a) => { const l = len(a); return l > 1e-9 ? { x: a.x / l, z: a.z / l } : { x: 0, z: 0 }; };
export const limit = (a, max) => { const l = len(a); return l > max && l > 0 ? scale(a, max / l) : { x: a.x, z: a.z }; };
export const fromYaw = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
export const yawOf = (a) => Math.atan2(a.x, a.z);
/** Wraps an angle to (-PI, PI]. */
export const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
/** Turns `from` toward `to` by at most maxStep radians. */
export const turnToward = (from, to, maxStep) => {
  const d = wrapAngle(to - from);
  return Math.abs(d) <= maxStep ? wrapAngle(to) : wrapAngle(from + Math.sign(d) * maxStep);
};

/** Steering gain: how quickly velocity tracks the desired velocity (1 / response time). */
const GAIN = 4;

/** Full speed toward the target. */
export function seek(pos, vel, target, maxSpeed, gain = GAIN) {
  const desired = scale(normalize(sub(target, pos)), maxSpeed);
  return scale(sub(desired, vel), gain);
}

/** Seek that ramps speed down inside slowRadius and stops (desired 0) inside stopRadius. */
export function arrive(pos, vel, target, maxSpeed, slowRadius = 2, stopRadius = 0.05, gain = GAIN) {
  const offset = sub(target, pos);
  const d = len(offset);
  if (d <= stopRadius) return scale(vel, -gain); // brake
  const speed = maxSpeed * Math.min(1, (d - stopRadius) / Math.max(1e-6, slowRadius));
  const desired = scale(offset, speed / d);
  return scale(sub(desired, vel), gain);
}

/** Full speed away from the threat while within panicRadius (else zero). */
export function flee(pos, vel, threat, maxSpeed, panicRadius = Infinity, gain = GAIN) {
  const away = sub(pos, threat);
  if (len(away) > panicRadius) return vec();
  const dir = len(away) > 1e-6 ? normalize(away) : { x: 1, z: 0 }; // deterministic: no Math.random
  return scale(sub(scale(dir, maxSpeed), vel), gain);
}

/** Brake toward zero velocity. */
export const brake = (vel, gain = GAIN) => scale(vel, -gain);

/** State for wander(): a point on a circle ahead of the body that jitters each tick. */
export function createWander(rng, { radius = 1.2, distance = 2, jitter = 2.5 } = {}) {
  return { angle: rng.range(-Math.PI, Math.PI), radius, distance, jitter, rng };
}

/** Jittered-circle wander: seeks a point on a circle `distance` ahead with a drifting angle. */
export function wander(state, pos, vel, yaw, maxSpeed, dt) {
  state.angle += state.rng.range(-1, 1) * state.jitter * dt;
  const heading = len(vel) > 0.1 ? normalize(vel) : fromYaw(yaw);
  const center = add(pos, scale(heading, state.distance));
  const target = add(center, scale(fromYaw(yawOf(heading) + state.angle), state.radius));
  return seek(pos, vel, target, maxSpeed);
}

/** Push away from neighbours closer than radius (stronger the closer). neighbours: [{x,z}]. */
export function separation(pos, neighbours, radius = 1, strength = 6) {
  let f = vec();
  for (const n of neighbours) {
    const away = sub(pos, n);
    const d = len(away);
    if (d >= radius) continue;
    const dir = d > 1e-6 ? scale(away, 1 / d) : { x: 1, z: 0 };
    f = add(f, scale(dir, ((radius - d) / radius) * strength));
  }
  return f;
}

/**
 * Feelers ahead of the body: when the step `lookAhead` metres along the velocity is unwalkable,
 * returns a force toward the nearest walkable feeler direction (or back the way it came).
 */
export function containment(pos, vel, walkable, maxSpeed, lookAhead = 1, gain = GAIN) {
  if (!walkable) return vec();
  const speed = len(vel);
  if (speed < 0.05) return vec();
  const heading = yawOf(vel);
  const probe = (yaw) => { const p = add(pos, scale(fromYaw(yaw), lookAhead)); return walkable(p.x, p.z); };
  if (probe(heading)) return vec();
  for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    if (probe(heading + off)) return scale(sub(scale(fromYaw(heading + off), maxSpeed), vel), gain);
  }
  return scale(sub(scale(fromYaw(heading + Math.PI), maxSpeed), vel), gain);
}

/** A walkable point within [minR, maxR] of center (tries `tries` times; falls back to center). */
export function pickWalkablePoint(rng, center, maxR, walkable, { minR = 0, tries = 16 } = {}) {
  for (let i = 0; i < tries; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.range((minR / maxR) ** 2, 1)) * maxR; // uniform over the annulus
    const p = { x: center.x + Math.sin(a) * r, z: center.z + Math.cos(a) * r };
    if (!walkable || walkable(p.x, p.z)) return p;
  }
  return { x: center.x, z: center.z };
}

/**
 * Applies `force` to body = { position:{x,z}, velocity:{x,z}, yaw } for dt (mutates in place, so a
 * THREE.Vector3 position works too; y is never touched). Options: maxSpeed, maxAccel, turnRate
 * (rad/s), walkable(x,z), face (a point to turn toward when nearly still).
 * Returns { speed, blocked }.
 */
export function integrate(body, force, dt, { maxSpeed = 3, maxAccel = 10, turnRate = 6, walkable = null, face = null, minTurnSpeed = 0.2 } = {}) {
  const v = body.velocity;
  const f = limit(force, maxAccel);
  let vx = v.x + f.x * dt, vz = v.z + f.z * dt;
  const sp = Math.hypot(vx, vz);
  const cap = Math.max(maxSpeed, Math.hypot(v.x, v.z) - maxAccel * dt); // decelerate, don't snap, after a speed drop
  if (sp > cap && sp > 0) { vx *= cap / sp; vz *= cap / sp; }

  const p = body.position;
  let nx = p.x + vx * dt, nz = p.z + vz * dt;
  let blocked = false;
  if (walkable && (vx !== 0 || vz !== 0) && !walkable(nx, nz)) {
    blocked = true;
    if (walkable(nx, p.z)) { nz = p.z; vz = 0; }
    else if (walkable(p.x, nz)) { nx = p.x; vx = 0; }
    else { nx = p.x; nz = p.z; vx = 0; vz = 0; }
  }
  p.x = nx; p.z = nz;
  v.x = vx; v.z = vz;

  const speed = Math.hypot(vx, vz);
  let targetYaw = null;
  if (speed > minTurnSpeed) targetYaw = Math.atan2(vx, vz);
  else if (face) {
    const dx = face.x - p.x, dz = face.z - p.z;
    if (dx * dx + dz * dz > 1e-4) targetYaw = Math.atan2(dx, dz);
  }
  if (targetYaw !== null) body.yaw = turnToward(body.yaw ?? 0, targetYaw, turnRate * dt);
  return { speed, blocked };
}

/**
 * A per-tick motor for a brain: actions add steering forces and request a pose / facing; finish(dt)
 * integrates once (braking when nothing steered), derives a locomotion pose when none was set and
 * calls body.setPose / body.lookAt only on changes.
 *
 * params: { walkSpeed, runSpeed, maxAccel, turnRate, lookAhead, movePose, runPose, idlePose,
 *           neighbours?(): [{x,z}], separationRadius }
 */
export function createMotor(body, world, params) {
  body.velocity ??= { x: 0, z: 0 };
  body.yaw ??= 0;
  const walkable = world.walkable ? (x, z) => world.walkable(x, z) : null;
  const m = {
    body, params,
    force: vec(), steered: false, maxSpeed: params.walkSpeed, pose: null, face: null, look: undefined,
    currentPose: null, currentLook: null, blocked: false, speed: 0,
    reset() { m.force = vec(); m.steered = false; m.maxSpeed = params.walkSpeed; m.pose = null; m.face = null; m.look = undefined; },
    addForce(f) { m.force = add(m.force, f); m.steered = true; },
    /** Arrive at target at `speed`; returns the remaining distance. */
    moveTo(target, { speed = params.walkSpeed, slowRadius = 1.5, stopRadius = 0.1 } = {}) {
      m.maxSpeed = Math.max(m.maxSpeed, speed);
      m.addForce(arrive(body.position, body.velocity, target, speed, slowRadius, stopRadius));
      return dist(body.position, target);
    },
    seek(target, speed = params.walkSpeed) { m.maxSpeed = Math.max(m.maxSpeed, speed); m.addForce(seek(body.position, body.velocity, target, speed)); },
    flee(threat, speed = params.runSpeed) { m.maxSpeed = Math.max(m.maxSpeed, speed); m.addForce(flee(body.position, body.velocity, threat, speed)); },
    stop() { m.addForce(brake(body.velocity)); },
    setPose(name) { m.pose = name; },
    faceToward(point) { m.face = point ? { x: point.x, z: point.z } : null; },
    /** Head/eye target (passed to body.lookAt); null clears it. */
    lookAt(point) { m.look = point ? { x: point.x, z: point.z } : null; },
    finish(dt) {
      if (!m.steered) m.addForce(brake(body.velocity));
      if (m.steered && len(body.velocity) > 0.05) {
        m.addForce(containment(body.position, body.velocity, walkable, m.maxSpeed, params.lookAhead ?? 0.8));
      }
      if (params.neighbours) {
        const others = params.neighbours().map((n) => n.position ?? n);
        m.force = add(m.force, separation(body.position, others, params.separationRadius ?? 0.9));
      }
      const r = integrate(body, m.force, dt, {
        maxSpeed: m.maxSpeed, maxAccel: params.maxAccel ?? 10, turnRate: params.turnRate ?? 6, walkable, face: m.face,
      });
      m.speed = r.speed;
      m.blocked = r.blocked;
      let pose = m.pose;
      if (!pose) {
        if (r.speed > (params.walkSpeed + params.runSpeed) / 2) pose = params.runPose ?? 'run';
        else if (r.speed > 0.3) pose = params.movePose ?? 'walk';
        else pose = params.idlePose ?? 'idle';
      }
      if (pose !== m.currentPose) { m.currentPose = pose; body.setPose?.(pose); }
      if (m.look !== undefined) {
        const changed = !m.look !== !m.currentLook || (m.look && (m.look.x !== m.currentLook.x || m.look.z !== m.currentLook.z));
        if (changed) { m.currentLook = m.look; body.lookAt?.(m.look); }
      }
      return r;
    },
  };
  return m;
}
