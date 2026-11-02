// The cave's look, shared by the game (src/main.js) and the asset studio (src/asset-studio.js), so an
// asset is judged in exactly the light it will stand in: the sun and ambient colours, cel shading,
// tone-mapping exposure and the post grade fitted to the painting's Lab statistics.
import { sharedFurUniforms } from '../fur.js';

/**
 * Sets the shared light uniforms and the renderer's exposure; returns the post options (grade, ink
 * outlines). URL flags: ?cel= ?exposure= ?sat= ?contrast= ?stint= ?outline=0.
 */
export function applyCaveLook(renderer, params, sky = null) {
  // Warm light from above-left, behind the player, so the great door is lit.
  sharedFurUniforms.uSunDir.value.set(-0.4, 0.8, 0.45).normalize();
  sharedFurUniforms.uSunColor.value.set('#fff8f3').multiplyScalar(1.2);
  sharedFurUniforms.uSkyColor.value.set('#f3e4e2');
  sharedFurUniforms.uGroundColor.value.set('#dcb4a4');
  sharedFurUniforms.uFogColor.value.set('#f2dfd2');
  sharedFurUniforms.uFogDensity.value = 0.004;
  // The target shot (docs/target-shot.md) is softly shaded clay and felt, not cel-flat
  // (?cel=1 for the old flat tones).
  sharedFurUniforms.uCel.value = params.has('cel') ? Number(params.get('cel')) : 0.35;
  // Grade fitted to the target shot's Lab statistics (lightness mean 51, 5th/95th percentiles
  // 21/80, chroma 11, warmth 6): muted, near-neutral shadows, a touch darker.
  renderer.toneMappingExposure = params.has('exposure') ? Number(params.get('exposure')) : 1.15;
  if (sky) {
    const u = sky.material.uniforms;
    u.uZenith.value.set('#9cc2ec');
    u.uHorizon.value.set('#fbe8d6');
    u.uHorizonSun.value.set('#fff3dc');
  }
  return {
    godRays: false, tiltShift: false,
    saturation: params.has('sat') ? Number(params.get('sat')) : 0.55,
    contrast: params.has('contrast') ? Number(params.get('contrast')) : 0.7,
    shadowTint: params.has('stint') ? `#${params.get('stint')}` : '#9d8f88',
    // The target shot draws no ink lines: shapes read by shading (?outline=1 for the old ink).
    outline: params.get('outline') === '1' ? true : null,
  };
}
