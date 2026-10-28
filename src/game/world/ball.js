// The felt ball the player throws for the dog: a small knitted ball with simple, stable projectile
// physics over the block grid (fixed substeps, bounces with damping off ground and walls, rolls to a
// stop). State: 'held' (in the player's hand, hidden), 'flying', 'landed' (on the ground, the dog may
// take it), 'carried' (in the dog's mouth: positioned by the game each frame).
import * as THREE from 'three';
import { createTextile, prepareTextileGeometry } from '../../textile.js';

const R = 0.16;
const G = 14;

export function createBall() {
  const geo = new THREE.SphereGeometry(R, 18, 12).toNonIndexed();
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const a = new THREE.Color('#f29aa8');
  const b = new THREE.Color('#fbe6c8');
  for (let i = 0; i < n; i++) {
    const y = geo.getAttribute('position').getY(i);
    const c = Math.abs(y) < R * 0.25 ? b : a;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aLocal', geo.getAttribute('position').clone());
  const mesh = new THREE.Mesh(prepareTextileGeometry(geo), createTextile('yarn', { wraps: 14, fuzz: 0.35 }));
  mesh.name = 'ball';
  mesh.visible = false;
  const vel = new THREE.Vector3();
  let state = 'held';
  let heightAt = () => 0;
  let rest = 0;

  function substep(dt) {
    vel.y -= G * dt;
    const p = mesh.position;
    const nx = p.x + vel.x * dt;
    const nz = p.z + vel.z * dt;
    // Walls: a column taller than the ball's bottom bounces it back.
    if (heightAt(nx, p.z) > p.y - R + 0.05) vel.x *= -0.45; else p.x = nx;
    if (heightAt(p.x, nz) > p.y - R + 0.05) vel.z *= -0.45; else p.z = nz;
    p.y += vel.y * dt;
    const g = heightAt(p.x, p.z) + R;
    if (p.y < g) {
      p.y = g;
      if (vel.y < -1.2) vel.y *= -0.38; else vel.y = 0;
      vel.x *= 0.82;
      vel.z *= 0.82;
    }
    mesh.rotation.x += vel.z * dt / R;
    mesh.rotation.z -= vel.x * dt / R;
  }

  return {
    mesh,
    get state() { return state; },
    setWorld(h) { heightAt = h; },
    /** Throws from `from` along `dir` (unit vector) with `power` m/s. */
    throw(from, dir, power = 9) {
      mesh.position.copy(from);
      vel.copy(dir).multiplyScalar(power);
      vel.y += 2.5;
      state = 'flying';
      mesh.visible = true;
      rest = 0;
    },
    update(dt) {
      if (state !== 'flying') return;
      const steps = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < steps; i++) substep(dt / steps);
      const still = Math.hypot(vel.x, vel.z) < 0.25 && Math.abs(vel.y) < 0.1;
      rest = still ? rest + dt : 0;
      if (rest > 0.15) { state = 'landed'; vel.set(0, 0, 0); }
    },
    take() { state = 'carried'; },
    /** The dog drops it at a point (it lands there). */
    drop(at) { mesh.position.copy(at); mesh.position.y = heightAt(at.x, at.z) + R; state = 'landed'; vel.set(0, 0, 0); mesh.visible = true; },
    pickUp() { state = 'held'; mesh.visible = false; },
    get position() { return mesh.position; },
  };
}
