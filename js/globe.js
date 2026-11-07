// Stickerwild — the globe projection.
// The flat world buffer is wrapped onto a small planet by a fragment shader.
// For every screen pixel it works out which point of the flat world lands
// there: rows above the hero roll away over a curved horizon, rows below
// swell toward the camera, and columns curve away to the sides, so the
// horizon is an arc. The same mapping lives in game.js (screenToFlat /
// flatToScreen) so clicks land on what's under the cursor.
// Without WebGL the game falls back to drawing horizontal strips.
'use strict';
(function () {
  const VS = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform vec3 uScreen;   // W, H (css px), screen pixel ratio
uniform vec4 uCurve;    // yA, yTop, R, K
uniform vec4 uCurve2;   // a, Rs, Dk, haze height
uniform vec4 uBuf;      // VCX, VCY, buffer width, buffer height (css px)
uniform vec3 uSky;      // horizon haze colour
void main() {
  float x = gl_FragCoord.x / uScreen.z;
  float y = uScreen.y - gl_FragCoord.y / uScreen.z;
  float Rs = uCurve2.y;
  float q = (x - uScreen.x * 0.5) / Rs;
  if (abs(q) >= 1.0) { gl_FragColor = vec4(0.0); return; }
  float ang = asin(q);
  float v = y - uCurve2.z * Rs * (1.0 - cos(ang));
  float hz = v - uCurve.y;
  if (hz < 0.0) { gl_FragColor = vec4(0.0); return; }
  float dv = v - uCurve.x, d, s;
  if (dv < 0.0) {
    d = uCurve.z * asin(max(-1.0, dv / uCurve.z));
    s = 1.0 / (1.0 + uCurve.w * (1.0 - cos(d / uCurve.z)));
  } else {
    d = (-1.0 + sqrt(1.0 + 4.0 * uCurve2.x * dv)) / (2.0 * uCurve2.x);
    s = 1.0 + 2.0 * uCurve2.x * d;
  }
  vec2 uv = vec2(uBuf.x + Rs * ang / s, uBuf.y + d) / uBuf.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  vec4 c = texture2D(uTex, uv);
  // haze that thickens toward the horizon, and a thin bright rim on it
  float k = hz / uCurve2.w;
  float haze = k < 0.2 ? mix(1.0, 0.55, k / 0.2) : mix(0.55, 0.0, clamp((k - 0.2) / 0.8, 0.0, 1.0));
  c.rgb = mix(c.rgb, uSky * c.a, haze);
  if (hz < 2.0) c.rgb = mix(c.rgb, vec3(c.a), 0.35);
  // soft edges where the planet meets the sky
  float edge = min(clamp((1.0 - abs(q)) * Rs, 0.0, 1.0), clamp(hz, 0.0, 1.0));
  gl_FragColor = c * edge;
}`;

  SW.makeGlobe = function () {
    const cv = document.createElement('canvas');
    let gl = null;
    try { gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    function shader(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    }
    const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    // one triangle that covers the screen
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const U = {};
    for (const n of ['uTex', 'uScreen', 'uCurve', 'uCurve2', 'uBuf', 'uSky']) U[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(U.uTex, 0);

    const globe = {
      canvas: cv, lost: false,
      // src: the flat world canvas. P: projection parameters (see game.js buildCurve).
      draw(src, P) {
        if (globe.lost || gl.isContextLost()) { globe.lost = true; return null; }
        const w = Math.round(P.w * P.sdpr), h = Math.round(P.h * P.sdpr);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        gl.viewport(0, 0, w, h);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.uniform3f(U.uScreen, P.w, P.h, P.sdpr);
        gl.uniform4f(U.uCurve, P.yA, P.yTop, P.R, P.K);
        gl.uniform4f(U.uCurve2, P.a, P.Rs, P.Dk, P.hazeH);
        gl.uniform4f(U.uBuf, P.vcx, P.vcy, src.width / P.dpr, src.height / P.dpr);
        gl.uniform3f(U.uSky, P.sky[0] / 255, P.sky[1] / 255, P.sky[2] / 255);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return cv;
      },
    };
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); globe.lost = true; });
    return globe;
  };
})();
