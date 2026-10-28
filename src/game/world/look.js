// The light of each area: the hub keeps the cave's painted look (src/cave/look.js); a trip is open
// air under the candy sky, its sun, ambient and haze tinted per biome so a meadow reads warm and
// green-gold, a grotto rosy, a lake cool and bright. Every textile and fur material reads these
// shared uniforms, so switching areas re-lights the whole world at once.
import { sharedFurUniforms } from '../../fur.js';

export const TRIP_LOOKS = {
  meadow: {
    sunDir: [0.45, 0.75, 0.35], sun: '#fff1dc', sunPower: 1.3, sky: '#eef0dc', ground: '#cdb89a', fog: '#f4ead8', fogDensity: 0.012,
    zenith: '#97c3ea', horizon: '#fbe9d2', horizonSun: '#fff2d6', exposure: 1.2,
  },
  grotto: {
    sunDir: [-0.35, 0.8, 0.4], sun: '#ffeef0', sunPower: 1.2, sky: '#f4e0e4', ground: '#d8afa8', fog: '#f3dcdc', fogDensity: 0.016,
    zenith: '#b7b4e6', horizon: '#f9dfe2', horizonSun: '#ffeede', exposure: 1.2,
  },
  lake: {
    sunDir: [0.3, 0.7, -0.55], sun: '#f6f8ff', sunPower: 1.3, sky: '#e2eef4', ground: '#bcc6c0', fog: '#e4eef2', fogDensity: 0.011,
    zenith: '#8fbfe8', horizon: '#e8f2f4', horizonSun: '#fff6e4', exposure: 1.18,
  },
};

/** Lights a trip of `biome`; returns the post options (the cave's grade, a touch more colour). */
export function applyTripLook(renderer, biome, sky = null) {
  const L = TRIP_LOOKS[biome] ?? TRIP_LOOKS.meadow;
  const u = sharedFurUniforms;
  u.uSunDir.value.set(...L.sunDir).normalize();
  u.uSunColor.value.set(L.sun).multiplyScalar(L.sunPower);
  u.uSkyColor.value.set(L.sky);
  u.uGroundColor.value.set(L.ground);
  u.uFogColor.value.set(L.fog);
  u.uFogDensity.value = L.fogDensity;
  u.uCel.value = 1;
  renderer.toneMappingExposure = L.exposure;
  if (sky) {
    const s = sky.material.uniforms;
    s.uZenith.value.set(L.zenith);
    s.uHorizon.value.set(L.horizon);
    s.uHorizonSun.value.set(L.horizonSun);
  }
  return { godRays: false, tiltShift: false, saturation: 0.92, contrast: 0.78, shadowTint: '#b98f7c', outline: true };
}
