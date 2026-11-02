// Felt butterflies: little two-winged flutterers that wander over meadows and lakes (and a few
// round the Nest's shafts), each on its own lazy loop, flapping, banking into turns, and veering
// off when the player comes too close. Two instanced meshes (left and right wings) share one
// felt wing texture; each butterfly's colour is an instance colour.
import * as THREE from 'three';

/** How many butterflies an area has, and their felt colours. */
export const BUTTERFLY_PRESETS = {
  hub: { count: 3, colors: ['#f6c9cf', '#fff1c9', '#cfe3f6'], radius: 3.5, low: 1.2, high: 3.2 },
  meadow: { count: 12, colors: ['#f6c9cf', '#ffe39a', '#cfe3f6', '#e0cdf6', '#ffffff'], radius: 11, low: 0.4, high: 2.2 },
  lake: { count: 6, colors: ['#cfe3f6', '#ffffff', '#d7f0e2'], radius: 10, low: 0.5, high: 2.4 },
  grotto: { count: 0, colors: [], radius: 0, low: 0, high: 0 }, // fireflies' place (ambient.js)
};

const MAX = 16;

function wingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  // Two felt lobes from the hinge (left edge): a big fore wing and a small hind wing.
  x.fillStyle = '#ffffff';
  x.beginPath(); x.ellipse(30, 22, 28, 20, -0.35, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(22, 46, 18, 14, 0.4, 0, Math.PI * 2); x.fill();
  // A darker dot and a running stitch round the fore wing.
  x.fillStyle = 'rgba(120, 80, 70, 0.35)';
  x.beginPath(); x.arc(38, 20, 6, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  x.setLineDash([4, 4]); x.lineWidth = 2;
  x.beginPath(); x.ellipse(30, 22, 21, 14, -0.35, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createButterflies() {
  const geo = new THREE.PlaneGeometry(0.22, 0.22);
  geo.translate(0.11, 0, 0); // the hinge on the body axis
  geo.rotateX(-Math.PI / 2); // lying flat, wing out along +x, forward along -z
  const mat = new THREE.MeshBasicMaterial({ map: wingTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const wings = [new THREE.InstancedMesh(geo, mat, MAX), new THREE.InstancedMesh(geo, mat, MAX)];
  const group = new THREE.Group();
  group.name = 'butterflies';
  for (const w of wings) {
    w.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    w.frustumCulled = false;
    w.count = 0;
    group.add(w);
  }

  let preset = BUTTERFLY_PRESETS.hub;
  let heightAt = () => 0;
  const flock = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const one = new THREE.Vector3(1, 1, 1);
  const mirror = new THREE.Vector3(-1, 1, 1);
  const flapM = new THREE.Matrix4();
  const tmp = new THREE.Color();

  return {
    group,
    /** A new area: kind ('hub' | a biome), around anchor, over the ground heightAt(x, z). */
    setArea(kind, anchor, groundAt) {
      preset = BUTTERFLY_PRESETS[kind] ?? BUTTERFLY_PRESETS.meadow;
      heightAt = groundAt ?? (() => anchor.y);
      flock.length = 0;
      const n = Math.min(MAX, preset.count);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * preset.radius;
        const home = new THREE.Vector3(anchor.x + Math.cos(a) * r, 0, anchor.z + Math.sin(a) * r);
        flock.push({ home, pos: home.clone().setY(heightAt(home.x, home.z) + preset.low + 0.5), vel: new THREE.Vector3(), ph: Math.random() * 50, yaw: 0, bank: 0, flee: 0 });
        tmp.set(preset.colors[i % preset.colors.length]);
        for (const w of wings) w.setColorAt(i, tmp);
      }
      for (const w of wings) {
        w.count = n;
        if (w.instanceColor) w.instanceColor.needsUpdate = true;
      }
    },
    update(dt, time, viewer) {
      const d = Math.min(dt, 0.05);
      for (let i = 0; i < flock.length; i++) {
        const b = flock[i];
        // A lazy figure-of-eight round home, bobbing between low and high over the ground.
        const t = time * 0.35 + b.ph;
        const goal = new THREE.Vector3(
          b.home.x + Math.sin(t) * 1.8 + Math.sin(t * 2.3) * 0.6,
          0,
          b.home.z + Math.sin(t * 2) * 1.2 + Math.cos(t * 1.7) * 0.5,
        );
        goal.y = heightAt(goal.x, goal.z) + preset.low + (preset.high - preset.low) * (0.5 + 0.5 * Math.sin(t * 1.3));
        const steer = goal.sub(b.pos).multiplyScalar(1.6);
        // The player too close: flutter up and away for a moment.
        if (viewer) {
          const away = b.pos.clone().sub(viewer).setY(0);
          const dist = away.length();
          if (dist < 1.6) b.flee = 1.2;
          if (b.flee > 0) steer.add(away.normalize().multiplyScalar(5)).add(new THREE.Vector3(0, 3, 0));
        }
        b.flee = Math.max(0, b.flee - d);
        b.vel.addScaledVector(steer.sub(b.vel), Math.min(1, d * 2.5));
        b.pos.addScaledVector(b.vel, d);
        // Follow the player outdoors: far-off butterflies find a new home ahead.
        if (viewer && preset !== BUTTERFLY_PRESETS.hub && b.home.distanceTo(new THREE.Vector3(viewer.x, 0, viewer.z)) > preset.radius * 1.4) {
          b.home.set(viewer.x + (viewer.x - b.home.x) * 0.6, 0, viewer.z + (viewer.z - b.home.z) * 0.6);
        }
        // Face the way it flies; bank into turns; flap fast with the odd glide.
        const yaw = Math.atan2(-b.vel.x, -b.vel.z);
        let dy = yaw - b.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.yaw += dy * Math.min(1, d * 6);
        b.bank += (THREE.MathUtils.clamp(-dy * 2, -0.6, 0.6) - b.bank) * Math.min(1, d * 4);
        const glide = Math.sin(time * 0.7 + b.ph) > 0.75 ? 0.25 : 1;
        const flap = 0.25 + Math.sin(time * 22 + b.ph * 7) * 0.85 * glide + (b.flee > 0 ? 0.2 : 0);
        e.set(Math.sin(time * 3 + b.ph) * 0.1, b.yaw, b.bank);
        q.setFromEuler(e);
        const bob = Math.sin(time * 11 + b.ph) * 0.02;
        m.compose(b.pos.clone().setY(b.pos.y + bob), q, one);
        wings[0].setMatrixAt(i, flapM.makeRotationZ(flap).premultiply(m));
        wings[1].setMatrixAt(i, flapM.makeRotationZ(-flap).premultiply(m).scale(mirror));
      }
      for (const w of wings) w.instanceMatrix.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.map.dispose(); mat.dispose(); },
  };
}
