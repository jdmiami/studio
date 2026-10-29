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
  low: { steps: 72, shadow: 0, ao: 0, far: 60, shafts: 0 },
  medium: { steps: 110, shadow: 20, ao: 4, far: 80, shafts: 0.16 },
  high: { steps: 150, shadow: 36, ao: 5, far: 110, shafts: 0.18 },
};

const linear = (hex) => new THREE.Color(hex);

/**
 * Per-area felt tints for the terrain kinds, and the light round the sun: a cool fill from the
 * sky opposite and a warm bounce off the earth (fitted to the painting with sdf-compare: its water
 * is a pale powder blue, its grass a light mint, its shadows pink).
 */
const TINTS = {
  hub: { wall: '#e2bba9', floor: '#e4d0ca', water: '#b2cdf2', grass: '#aecb8f', fill: '#c9d2f4', bounce: '#e7bcaa' },
  meadow: { wall: '#e2b5a3', floor: '#e6d0c4', water: '#9fc0ea', grass: '#a6c98b', fill: '#cbd9f6', bounce: '#d8c9a8' },
  grotto: { wall: '#e8b0b2', floor: '#e6cad0', water: '#aab4ea', grass: '#a9c093', fill: '#d6cdf6', bounce: '#e9b8bd' },
  lake: { wall: '#dfbcaf', floor: '#e2d0c9', water: '#93bdea', grass: '#a0c795', fill: '#c3dcf4', bounce: '#cfd2c6' },
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
    uFillDir: { value: new THREE.Vector3(0.5, 0.35, -0.6) },
    uFillColor: { value: linear(TINTS.hub.fill) },
    uBounce: { value: linear(TINTS.hub.bounce) },
    uShaftFrom: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    uShaftTo: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    uShaftWidth: { value: [0, 0, 0, 0] },
    uShaftCount: { value: 0 },
    uShaftStrength: { value: 0 },
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
    uniforms.uShaftStrength.value = s.shafts;
  }
  setQuality(quality);

  return {
    mesh,
    setQuality,
    /**
     * A new world: columns (Map or record), ceilingAt?, door? ({ z, xMin, xMax, height }), props
     * (scene-data.js normalised props), tint key ('hub' | biome).
     */
    setArea({ columns, ceilingAt = null, door = null, props: list = [], tint = 'hub', shafts = [] }) {
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
      uniforms.uFillColor.value.set(tints.fill);
      uniforms.uBounce.value.set(tints.bounce);
      uniforms.uShaftCount.value = Math.min(4, shafts.length);
      shafts.slice(0, 4).forEach((sh, i) => {
        uniforms.uShaftFrom.value[i].set(...sh.from);
        uniforms.uShaftTo.value[i].copy(sh.target);
        uniforms.uShaftWidth.value[i] = sh.width;
      });
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
