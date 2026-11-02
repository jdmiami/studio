// Pickup pop: a find, once collected, hops up out of the ground and flies into the pocket (the
// left glove at the bottom-left of the view), shrinking, with a short trail of soft dots behind
// it; when it lands, onArrive fires (the glove's catch and the counter's bounce).
import * as THREE from 'three';

const FLIGHT = 0.55; // seconds
const TRAIL = 4;

const ballGeo = new THREE.SphereGeometry(0.11, 16, 12);

export function createPickupPops(scene, camera) {
  const live = [];
  const pocket = new THREE.Vector3();

  return {
    /** A pop from `from` (world) in a rarity colour; onArrive() when it reaches the pocket. */
    pop(from, color = '#fff6ea', onArrive = null) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false });
      const ball = new THREE.Mesh(ballGeo, mat);
      ball.renderOrder = 20;
      const trail = Array.from({ length: TRAIL }, (_, i) => {
        const m = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 * (1 - i / TRAIL), depthTest: false }));
        m.renderOrder = 19;
        scene.add(m);
        return m;
      });
      scene.add(ball);
      live.push({ ball, trail, start: from.clone(), t: 0, onArrive, path: [] });
    },
    update(dt) {
      // The pocket: low on the left of the view, a little in front of the eye.
      pocket.set(-0.32, -0.3, -0.6).applyMatrix4(camera.matrixWorld);
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.t += dt;
        const k = Math.min(1, p.t / FLIGHT);
        // Up and out first (a hop), then an eased swoop to the pocket.
        const e = k * k * (3 - 2 * k);
        const hop = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.6;
        p.ball.position.lerpVectors(p.start, pocket, e).y += hop * (1 - e);
        const pulse = 1 + 0.35 * Math.sin(Math.min(1, k * 3) * Math.PI);
        p.ball.scale.setScalar(pulse * THREE.MathUtils.lerp(1, 0.25, e));
        p.path.unshift(p.ball.position.clone());
        p.path.length = Math.min(p.path.length, TRAIL * 2 + 1);
        p.trail.forEach((m, j) => {
          const at = p.path[Math.min(p.path.length - 1, (j + 1) * 2)];
          m.position.copy(at);
          m.scale.setScalar(p.ball.scale.x * (0.7 - j * 0.12));
        });
        if (k >= 1) {
          p.onArrive?.();
          for (const m of [p.ball, ...p.trail]) { m.removeFromParent(); m.material.dispose(); }
          live.splice(i, 1);
        }
      }
    },
    get active() { return live.length; },
  };
}
