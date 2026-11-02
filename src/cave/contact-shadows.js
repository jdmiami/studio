// Soft contact shadows, as the cave painting draws them: a darker, warm blob on the ground under
// each small prop and creature, strongest at the centre and fading out past its footprint. The
// textile and fur shaders light themselves and cast no shadow maps, so without these the props
// float on the felt.
import * as THREE from 'three';

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  uniforms: {
    uColor: { value: new THREE.Color('#6e4a46') },
    uStrength: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      float a = uStrength * pow(1.0 - smoothstep(0.0, 1.0, r), 1.6);
      gl_FragColor = vec4(uColor, a);
      #include <colorspace_fragment>
    }
  `,
});
const disc = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * A contact shadow under `object` (already placed in the world): an ellipse a little wider than its
 * footprint, lying on the ground at the bottom of its bounds.
 */
export function contactShadow(object, { spread = 1.35 } = {}) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const shadow = new THREE.Mesh(disc, material);
  shadow.position.set(centre.x, box.min.y + 0.012, centre.z);
  shadow.scale.set(size.x * spread, 1, size.z * spread);
  shadow.renderOrder = 1;
  return shadow;
}
