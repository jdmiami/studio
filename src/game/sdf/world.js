// The SDF renderer: a full-screen quad, drawn first, that raymarches the static world (shader.js)
// from the area's data (scene-data.js) and writes depth, so the game's meshes and post passes work
// on top of it unchanged. setArea() swaps the world (the Nest, a trip); update() follows the
// camera each frame and refreshes the nearby props when the viewer has moved.
import * as THREE from 'three';
import { sharedFurUniforms } from '../../fur.js';
import { vertexShader, fragmentShader } from './shader.js';
import { packTerrain, packProps, PROP_TEXELS } from './scene-data.js';

const MAX_PROPS = 48;

/** Steps, shadow steps and AO samples per quality preset (shadows and AO are the expensive part). */
export const SDF_QUALITY = {
  low: { steps: 72, shadow: 0, ao: 0, far: 60 },
  medium: { steps: 110, shadow: 20, ao: 3, far: 80 },
  high: { steps: 150, shadow: 36, ao: 5, far: 110 },
};

const linear = (hex) => new THREE.Color(hex);

/** Per-area felt tints for the terrain kinds. */
const TINTS = {
  hub: { wall: '#d6b4a8', floor: '#d8c3bb', water: '#7f9fd4', grass: '#94ad80' },
  meadow: { wall: '#dcb3a2', floor: '#e0cbbf', water: '#86a8d8', grass: '#9fbf86' },
  grotto: { wall: '#e3aeb0', floor: '#e2c6cc', water: '#9aa6dc', grass: '#a3b98c' },
  lake: { wall: '#d8b9ac', floor: '#dccbc4', water: '#78a6d8', grass: '#98c08f' },
};

export function createSdfWorld({ quality = 'medium' } = {}) {
  let terrainTex = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  const propData = new Float32Array(MAX_PROPS * PROP_TEXELS * 4);
  const propTex = new THREE.DataTexture(propData, MAX_PROPS * PROP_TEXELS, 1, THREE.RGBAFormat, THREE.FloatType);
  propTex.needsUpdate = true;
  const doorTex = new THREE.TextureLoader().load('/cave/door-albedo.png');
  doorTex.colorSpace = THREE.NoColorSpace; // the shader linearises it
  doorTex.flipY = true;

  const u = sharedFurUniforms;
  const uniforms = {
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uViewProj: { value: new THREE.Matrix4() },
    uTime: u.uTime,
    uTerrain: { value: terrainTex },
    uTerrainBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uMaxTop: { value: 0 },
    uProps: { value: propTex },
    uPropCount: { value: 0 },
    uDoor: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHasDoor: { value: 0 },
    uDoorLift: { value: 0 },
    uDoorTex: { value: doorTex },
    uTintWall: { value: linear(TINTS.hub.wall) },
    uTintFloor: { value: linear(TINTS.hub.floor) },
    uTintWater: { value: linear(TINTS.hub.water) },
    uGrass: { value: linear(TINTS.hub.grass) },
    uSteps: { value: 110 },
    uShadowSteps: { value: 20 },
    uAo: { value: 3 },
    uFar: { value: 80 },
    uSunDir: u.uSunDir,
    uSunColor: u.uSunColor,
    uSkyColor: u.uSkyColor,
    uGroundColor: u.uGroundColor,
    uFogColor: u.uFogColor,
    uFogDensity: u.uFogDensity,
    uCel: u.uCel,
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthWrite: true, depthTest: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = 'sdf-world';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000; // first: everything else depth-tests against the raymarched world

  let props = [];
  let lastPack = null;

  function setQuality(q) {
    const s = SDF_QUALITY[q] ?? SDF_QUALITY.medium;
    uniforms.uSteps.value = s.steps;
    uniforms.uShadowSteps.value = s.shadow;
    uniforms.uAo.value = s.ao;
    uniforms.uFar.value = s.far;
  }
  setQuality(quality);

  return {
    mesh,
    setQuality,
    /**
     * A new world: columns (Map or record), ceilingAt?, door? ({ z, xMin, xMax, height }), props
     * (scene-data.js normalised props), tint key ('hub' | biome).
     */
    setArea({ columns, ceilingAt = null, door = null, props: list = [], tint = 'hub' }) {
      const t = packTerrain(columns, { ceilingAt });
      // A new texture per area: texture storage is allocated once at its first size.
      terrainTex.dispose();
      terrainTex = new THREE.DataTexture(t.data, t.width, t.depth, THREE.RGBAFormat, THREE.FloatType);
      terrainTex.needsUpdate = true;
      uniforms.uTerrain.value = terrainTex;
      uniforms.uTerrainBox.value.set(t.x0, t.z0, t.width, t.depth);
      uniforms.uMaxTop.value = t.maxTop;
      uniforms.uHasDoor.value = door ? 1 : 0;
      if (door) uniforms.uDoor.value.set(door.z, door.xMin, door.xMax, door.height);
      const tints = TINTS[tint] ?? TINTS.hub;
      uniforms.uTintWall.value.set(tints.wall);
      uniforms.uTintFloor.value.set(tints.floor);
      uniforms.uTintWater.value.set(tints.water);
      uniforms.uGrass.value.set(tints.grass);
      props = list;
      lastPack = null;
    },
    setDoorLift(lift) { uniforms.uDoorLift.value = lift; },
    /** Follows the camera; repacks the nearest props when the viewer moved more than 2 units. */
    update(camera) {
      camera.updateMatrixWorld();
      uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      uniforms.uCamWorld.value.copy(camera.matrixWorld);
      uniforms.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const at = camera.position;
      if (!lastPack || Math.hypot(at.x - lastPack.x, at.z - lastPack.z) > 2) {
        const { count } = packProps(props, at, MAX_PROPS, propData);
        uniforms.uPropCount.value = count;
        propTex.needsUpdate = true;
        lastPack = { x: at.x, z: at.z };
      }
    },
    get propCount() { return props.length; },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      terrainTex.dispose();
      propTex.dispose();
      doorTex.dispose();
    },
  };
}
