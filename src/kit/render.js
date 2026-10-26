// Kit renderer: draws the scene into a linear HDR target with a depth texture, then a final pass
// adds the pastel-cubism outline (a thin dark line just inside each silhouette, a faint light
// halo just outside it, softer lines where one element overlaps another) and encodes sRGB.
import * as THREE from 'three';

const finalShader = {
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uScale: { value: 1 }, // output pixels per reference pixel
    uExposure: { value: 1 },
    uLine: { value: new THREE.Vector2(0.88, 0.85) }, // silhouette-line darkening: side-facing, up-facing edges
    uLineWidth: { value: 1.25 }, // silhouette-line width, in reference pixels (swept)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uScale;
    uniform float uExposure;
    uniform vec2 uLine;
    uniform float uLineWidth;
    varying vec2 vUv;

    float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
    vec3 toSRGB(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    void main() {
      vec3 col = texture2D(tColor, vUv).rgb * uExposure;
      float d = depthAt(vUv);
      bool inside = d < 0.9999;
      // Scan a small disc: nearest background (for the silhouette line) and nearest object
      // (for the halo), plus the largest depth step to a nearer neighbor (overlap lines).
      float lineR = uLineWidth * uScale;   // line width, in reference pixels times the output scale
      float haloR = 1.2 * uScale;
      float nearestBg = 99.0;
      vec2 bgDir = vec2(0.0); // direction to the nearest background pixel
      float nearestObj = 99.0;
      float step = 0.0;
      for (int y = -5; y <= 5; y++) {
        for (int x = -5; x <= 5; x++) {
          vec2 o = vec2(float(x), float(y));
          float r = length(o);
          if (r > max(haloR, lineR) + 0.5) continue;
          float nd = depthAt(vUv + o * uTexel);
          bool nInside = nd < 0.9999;
          if (inside && !nInside && r < nearestBg) { nearestBg = r; bgDir = o / max(r, 1e-3); }
          if (!inside && nInside) nearestObj = min(nearestObj, r);
          if (inside && nInside && r <= lineR + 0.5) step = max(step, d - nd);
        }
      }
      vec3 srgb = toSRGB(col);
      if (inside && nearestBg <= lineR + 0.5) {
        // The dark silhouette line takes the element's own hue. uLine sets its strength on side- and
        // up-facing edges separately (scripts/kit/edgeprofile.py measures both on the reference).
        float up = smoothstep(0.35, 0.85, bgDir.y);
        srgb *= mix(uLine.x, uLine.y, up);
      } else if (inside && step > 0.004) {
        srgb *= mix(1.0, 0.8, smoothstep(0.004, 0.02, step)); // softer crease where parts overlap
      } else if (!inside && nearestObj <= haloR + 0.5) {
        // The halo only lifts lit background: where the ground is in an element's shadow the
        // reference shows a dark contact edge instead.
        float lit = smoothstep(0.5, 0.68, dot(col, vec3(0.2126, 0.7152, 0.0722)));
        srgb = mix(srgb, vec3(1.0), 0.16 * lit * (1.0 - nearestObj / (haloR + 1.0)));
      }
      gl_FragColor = vec4(srgb, 1.0);
    }
  `,
};

export function createKitRenderer(renderer, scene, camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  target.depthTexture = new THREE.DepthTexture(1, 1);
  target.depthTexture.type = THREE.UnsignedIntType;

  const material = new THREE.ShaderMaterial({ ...finalShader, uniforms: THREE.UniformsUtils.clone(finalShader.uniforms) });
  material.uniforms.tColor.value = target.texture;
  material.uniforms.tDepth.value = target.depthTexture;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function setSize(width, height, refScale) {
    const ratio = renderer.getPixelRatio();
    target.setSize(width * ratio, height * ratio);
    material.uniforms.uTexel.value.set(1 / (width * ratio), 1 / (height * ratio));
    material.uniforms.uScale.value = Math.max(1, refScale * ratio);
  }

  function render() {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }

  return { render, setSize, uniforms: material.uniforms };
}
