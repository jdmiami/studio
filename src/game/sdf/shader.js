// The SDF world shader: one full-screen pass that raymarches the whole static world from signed
// distance fields, and writes real depth, so the meshes drawn after it (creatures, finds, Mira,
// particles) sit inside it, and the ink-outline post pass outlines both.
//
// The world:
// - terrain: every column a stack of rounded felt cubes from y = -2 to its top (a texel per column,
//   scene-data.js), a ceiling slab where the cave has one, the great door's gap; grass blankets
//   with scalloped edges on earth tops, marbled water, grey stone round the door
// - props: trees, willows, domes, mushrooms, fences, poms, stones as smooth-blended felt shapes
//   (4 texels each). Per pixel, only the props whose bounding spheres the ray meets are marched.
// - the door: a slab in the doorway textured with the painting's own door, lifted when open
//
// Lighting is the felt shader's (src/textile.js): wrapped sun stepped by the shared cel ramp, sky /
// ground ambient with a painterly shadow tint, fiber grain, a soft silhouette sheen, the same fog;
// plus what distance fields give for free: soft shadows and ambient occlusion.
import { CEL_GLSL } from '../../fur.js';

export const MAX_CANDIDATES = 10;

export const vertexShader = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;
  varying vec2 vNdc;

  uniform mat4 uInvProj;
  uniform mat4 uCamWorld;
  uniform mat4 uViewProj;
  uniform float uTime;
  uniform sampler2D uTerrain;
  uniform vec4 uTerrainBox; // x0, z0, width, depth
  uniform float uMaxTop;
  uniform sampler2D uProps;
  uniform int uPropCount;
  uniform vec4 uDoor; // z, xMin, xMax, height
  uniform float uHasDoor;
  uniform float uDoorLift;
  uniform sampler2D uDoorTex;
  uniform vec3 uTintWall;
  uniform vec3 uTintFloor;
  uniform vec3 uTintWater;
  uniform vec3 uGrass;
  uniform int uSteps;
  uniform int uShadowSteps;
  uniform int uAo;
  uniform float uFar;

  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uCel;

  ${CEL_GLSL}

  #define CEILING_TOP 10.0
  #define BLOCK_R 0.09
  #define NO_HIT 1e5

  // ---- noise ------------------------------------------------------------------------------
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13) + 0.15 * vnoise(p * 4.37); }

  // ---- primitives (Inigo Quilez's) ---------------------------------------------------------
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
  float sdCappedCyl(vec3 p, float h, float r) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
  float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
  vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
  // Angular repetition: folds p round y into one of n sectors.
  vec3 sector(vec3 p, float n, out float id) {
    float a = atan(p.z, p.x); float w = 6.2831853 / n;
    id = floor(a / w + 0.5); float b = id * w;
    vec2 q = rot(p.xz, -b); return vec3(q.x, p.y, q.y);
  }

  // ---- terrain --------------------------------------------------------------------------------
  vec4 cellInfo(vec2 c) {
    vec2 t = c - uTerrainBox.xy;
    if (t.x < 0.0 || t.y < 0.0 || t.x >= uTerrainBox.z || t.y >= uTerrainBox.w) return vec4(-100.0, 0.0, 1e4, 0.0);
    return texelFetch(uTerrain, ivec2(t), 0);
  }
  bool doorCell(vec2 c) { return uHasDoor > 0.5 && c.y == uDoor.x && c.x >= uDoor.y && c.x <= uDoor.z; }

  // The rounded cube of a stack [lo, hi) holding height y (and its neighbour above or below, for
  // clean seams). The last cube of a half-step top is a half cube.
  float stack(vec3 q, float lo, float hi) {
    if (hi <= lo) return NO_HIT;
    float top = ceil(hi) - 1.0;
    float k = clamp(floor(q.y), lo, top);
    float b1 = min(k + 1.0, hi);
    float d = sdRoundBox(q - vec3(0.0, (k + b1) * 0.5, 0.0), vec3(0.5, (b1 - k) * 0.5, 0.5), BLOCK_R);
    float k2 = clamp(k + (fract(q.y) > 0.5 ? 1.0 : -1.0), lo, top);
    if (k2 != k) {
      float c1 = min(k2 + 1.0, hi);
      d = min(d, sdRoundBox(q - vec3(0.0, (k2 + c1) * 0.5, 0.0), vec3(0.5, (c1 - k2) * 0.5, 0.5), BLOCK_R));
    }
    return d;
  }
  float column(vec3 p, vec2 c) {
    vec4 info = cellInfo(c);
    if (info.x < -50.0) return NO_HIT;
    vec3 q = vec3(p.x - c.x, p.y, p.z - c.y);
    float top = info.x;
    // Water sits a quarter below its column top, flat (it is drawn as a soft slab).
    if (info.y > 2.5) top -= 0.25;
    float d;
    if (doorCell(c)) d = min(stack(q, -2.0, 0.0), stack(q, uDoor.w, max(top, uDoor.w)));
    else d = stack(q, -2.0, top);
    if (info.z < 1e3) d = min(d, stack(q, info.z, CEILING_TOP));
    return d;
  }
  float terrain(vec3 p) {
    if (p.y > uMaxTop + 0.2) return p.y - uMaxTop - 0.1;
    vec2 cf = floor(p.xz + 0.5);
    vec2 f = p.xz - cf;
    vec2 o = vec2(f.x > 0.0 ? 1.0 : -1.0, f.y > 0.0 ? 1.0 : -1.0);
    float d = column(p, cf);
    d = min(d, column(p, cf + vec2(o.x, 0.0)));
    d = min(d, column(p, cf + vec2(0.0, o.y)));
    d = min(d, column(p, cf + o));
    // Cells beyond these four are at least half a cell away.
    return min(d, 0.5);
  }

  // ---- the door ------------------------------------------------------------------------------
  float door(vec3 p) {
    if (uHasDoor < 0.5) return NO_HIT;
    float w = (uDoor.z - uDoor.y + 1.0) * 0.5;
    vec3 c = vec3((uDoor.y + uDoor.z) * 0.5, uDoor.w * 0.5 + uDoorLift, uDoor.x + 0.4);
    return sdRoundBox(p - c, vec3(w, uDoor.w * 0.5, 0.12), 0.05);
  }

  // ---- props ---------------------------------------------------------------------------------
  vec4 propTexel(int i, int k) { return texelFetch(uProps, ivec2(i * 4 + k, 0), 0); }

  // A prop in its own unit frame (base at the origin, about 1 tall); part: 0 main colour, 1 second.
  float propShape(int type, vec3 q, float seed, float len, out float part) {
    part = 0.0;
    if (type == 1) { // cube tree: a cluster of felt cubes on a trunk
      float trunk = sdCappedCyl(q - vec3(0.0, 0.25, 0.0), 0.25, 0.055);
      vec3 cq = q - vec3(0.0, 0.66, 0.0);
      vec3 cell = clamp(floor(cq / 0.19 + 0.5), vec3(-1.0, -1.0, -1.0), vec3(1.0, 1.0, 1.0));
      float cube = sdRoundBox(cq - cell * 0.19, vec3(0.105), 0.035);
      float crown = max(cube, length(cq * vec3(1.0, 1.25, 1.0)) - 0.31);
      part = trunk < crown ? 1.0 : 0.0;
      return smin(crown, trunk, 0.04);
    }
    if (type == 2) { // willow: a top dome, caps round it, felt drips hanging from the rims
      float top = sdEllipsoid(q - vec3(0.0, 0.84, 0.0), vec3(0.17, 0.12, 0.17));
      float id;
      vec3 s = sector(q, 4.0, id);
      float cap = sdEllipsoid(s - vec3(0.17, 0.72, 0.0), vec3(0.17, 0.09, 0.17));
      vec3 dq = sector(q, 14.0, id);
      float len2 = 0.22 + 0.16 * hash12(vec2(id, seed * 17.0));
      float drip = sdCapsule(dq, vec3(0.27, 0.70, 0.0), vec3(0.29, 0.70 - len2, 0.0), 0.04);
      float trunk = sdCappedCyl(q - vec3(0.0, 0.3, 0.0), 0.3, 0.05);
      float crown = smin(smin(top, cap, 0.06), drip, 0.05);
      part = trunk < crown ? 1.0 : 0.0;
      return min(crown, trunk);
    }
    if (type == 3) { // broom tree: a fluffy head on a trunk
      float head = sdEllipsoid(q - vec3(0.0, 0.66, 0.0), vec3(0.3, 0.3, 0.3)) - 0.02 * vnoise(q * 18.0);
      float trunk = sdCappedCyl(q - vec3(0.0, 0.22, 0.0), 0.22, 0.05);
      part = trunk < head ? 1.0 : 0.0;
      return smin(head, trunk, 0.05);
    }
    if (type == 4) { // dome: stacked felt cushions
      float d = sdEllipsoid(q - vec3(0.0, 0.2, 0.0), vec3(0.62, 0.22, 0.62));
      d = smin(d, sdEllipsoid(q - vec3(0.0, 0.48, 0.0), vec3(0.46, 0.19, 0.46)), 0.05);
      d = smin(d, sdEllipsoid(q - vec3(0.0, 0.72, 0.0), vec3(0.28, 0.15, 0.28)), 0.05);
      return d;
    }
    if (type == 5) { // mushroom: a stem and a domed cap
      float stem = sdCappedCyl(q - vec3(0.0, 0.25, 0.0), 0.25, 0.13);
      float cap = max(sdEllipsoid(q - vec3(0.0, 0.48, 0.0), vec3(0.52, 0.42, 0.52)), 0.46 - q.y);
      part = stem < cap ? 1.0 : 0.0;
      return smin(cap, stem, 0.03);
    }
    if (type == 6) { // fence: posts and two rails along x, len long (in heights)
      float hl = len * 0.5;
      float px = clamp(floor(q.x / 0.45 + 0.5), -floor(hl / 0.45), floor(hl / 0.45)) * 0.45;
      float post = sdRoundBox(q - vec3(px, 0.5, 0.0), vec3(0.05, 0.5, 0.05), 0.02);
      float rails = min(sdRoundBox(q - vec3(0.0, 0.72, 0.0), vec3(hl, 0.045, 0.03), 0.02), sdRoundBox(q - vec3(0.0, 0.38, 0.0), vec3(hl, 0.045, 0.03), 0.02));
      part = rails < post ? 1.0 : 0.0;
      return min(post, rails);
    }
    if (type == 7) { // pom: a fuzzy ball
      return length(q - vec3(0.0, 0.5, 0.0)) - 0.48 - 0.025 * vnoise(q * 22.0);
    }
    if (type == 8) { // stone: a felted pebble
      return sdEllipsoid(q - vec3(0.0, 0.32, 0.0), vec3(0.6, 0.34, 0.48));
    }
    // 9 knit dome: a ribbed dome
    float d = sdEllipsoid(q - vec3(0.0, 0.3, 0.0), vec3(0.55, 0.62, 0.55));
    return d + 0.012 * sin(atan(q.z, q.x) * 18.0);
  }

  // The props the ray meets (by bounding sphere), chosen once per pixel.
  int cand[${MAX_CANDIDATES}];
  int candCount;
  void gatherProps(vec3 ro, vec3 rd, float far) {
    candCount = 0;
    for (int i = 0; i < 64; i++) {
      if (i >= uPropCount || candCount >= ${MAX_CANDIDATES}) break;
      vec4 a = propTexel(i, 0); vec4 b = propTexel(i, 1); vec4 c = propTexel(i, 2);
      vec3 ctr = a.yzw + vec3(0.0, b.x * 0.5, 0.0);
      float r = c.w;
      vec3 oc = ro - ctr;
      float bb = dot(oc, rd);
      float cc = dot(oc, oc) - r * r;
      float disc = bb * bb - cc;
      if (disc < 0.0) continue;
      float t1 = -bb + sqrt(disc);
      if (t1 < 0.0 || -bb - sqrt(disc) > far) continue;
      cand[candCount++] = i;
    }
  }
  float propDist(int i, vec3 p, out float part) {
    vec4 a = propTexel(i, 0); vec4 b = propTexel(i, 1);
    vec3 q = p - a.yzw;
    q.xz = rot(q.xz, b.y);
    float h = b.x;
    if (int(a.x + 0.5) == 6) { // fences scale only in height; their length is in world units
      float part0;
      vec3 fq = vec3(q.x / h, q.y / h, q.z / h);
      float d = propShape(6, fq, b.z, b.w / h, part0);
      part = part0;
      return d * h;
    }
    return propShape(int(a.x + 0.5), q / h, b.z, b.w, part) * h;
  }
  float props(vec3 p, out int which, out float part) {
    float d = NO_HIT; which = -1; part = 0.0;
    for (int k = 0; k < ${MAX_CANDIDATES}; k++) {
      if (k >= candCount) break;
      int i = cand[k];
      vec4 a = propTexel(i, 0); vec4 b = propTexel(i, 1); vec4 c = propTexel(i, 2);
      float bound = length(p - a.yzw - vec3(0.0, b.x * 0.5, 0.0)) - c.w;
      if (bound > d) continue;
      float pt;
      float di = propDist(i, p, pt);
      if (di < d) { d = di; which = i; part = pt; }
    }
    return d;
  }

  // ---- the scene -----------------------------------------------------------------------------
  float map(vec3 p) {
    int w; float pt;
    float t = terrain(p);
    float pr = props(p, w, pt);
    return min(smin(t, pr, 0.06), door(p));
  }

  // Material at a hit: albedo, felt fuzz amount.
  vec3 material(vec3 p, vec3 n, out float fuzz) {
    fuzz = 0.35;
    int w; float part;
    float t = terrain(p);
    float pr = props(p, w, part);
    float dr = door(p);
    if (dr < t && dr < pr) {
      float wdt = uDoor.z - uDoor.y + 1.0;
      vec2 uv = vec2((p.x - (uDoor.y - 0.5)) / wdt, (p.y - uDoorLift) / uDoor.w);
      fuzz = 0.15;
      return pow(texture2D(uDoorTex, clamp(uv, 0.0, 1.0)).rgb, vec3(2.2)) * 1.05;
    }
    if (pr < t) {
      vec4 c1 = propTexel(w, 2); vec4 c2 = propTexel(w, 3);
      vec3 base = part > 0.5 ? c2.rgb : c1.rgb;
      return base * (0.93 + 0.14 * propTexel(w, 1).z);
    }
    // The cell and block the surface belongs to: a hit sits on a cell boundary, so look a little
    // inside the surface (against the normal), or a side face would read its lower neighbour.
    vec3 inside = p - n * 0.06;
    vec2 c = floor(inside.xz + 0.5);
    vec4 info = cellInfo(c);
    float k = floor(inside.y);
    float jitter = hash12(c * 1.37 + k * 7.1) - 0.5;
    int kind = int(info.y + 0.5);
    bool topBlock = inside.y > info.x - 1.0 && inside.y < info.x + 0.2;
    bool ceiling = info.z < 1e3 && inside.y > info.z - 0.2;
    vec3 base;
    if (ceiling) base = vec3(0.75, 0.55, 0.45);
    else if (kind >= 3 && topBlock) base = uTintWater;
    else if ((kind == 1 || kind == 2) && topBlock) base = uTintFloor;
    else base = uTintWall;
    // The door frame: grey stone posts, lintel and the pillar on the right.
    if (uHasDoor > 0.5 && c.y == uDoor.x && c.x >= uDoor.y - 1.0 && c.x <= uDoor.z + 2.0 && p.y < uDoor.w + 3.0 && !ceiling) base = vec3(0.52, 0.5, 0.48);
    base *= 1.0 + jitter * 0.16 - clamp(info.x - 1.0 - p.y, 0.0, 4.0) * 0.035;
    // Grass blankets on earth tops: a scalloped felt hem a little down the sides.
    if (kind == 0 && !ceiling) {
      float hem = 0.12 + 0.05 * sin(atan(p.z - c.y, p.x - c.x) * 6.0 + info.w * 20.0) + 0.04 * vnoise(p * 6.0);
      if (p.y > info.x - hem) { base = uGrass * (0.95 + 0.1 * info.w); fuzz = 0.5; }
    }
    // Water: a soft moving marble.
    if (kind >= 3 && topBlock && n.y > 0.5) base *= 0.9 + 0.2 * vnoise(vec3(p.xz * 2.0, uTime * 0.4));
    return base;
  }

  vec3 calcNormal(vec3 p) {
    const vec2 e = vec2(1.0, -1.0) * 0.0015;
    return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
  }

  float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0;
    float t = 0.04;
    for (int i = 0; i < 48; i++) {
      if (i >= uShadowSteps) break;
      float h = map(ro + rd * t);
      res = min(res, 10.0 * h / t);
      t += clamp(h, 0.03, 0.5);
      if (res < 0.01 || t > 14.0) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  float calcAO(vec3 p, vec3 n) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 6; i++) {
      if (i >= uAo) break;
      float h = 0.03 + 0.12 * float(i);
      occ += (h - map(p + n * h)) * sca;
      sca *= 0.7;
    }
    return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
  }

  void main() {
    vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
    vec3 dirView = normalize(v.xyz / v.w);
    vec3 rd = normalize((uCamWorld * vec4(dirView, 0.0)).xyz);
    vec3 ro = uCamWorld[3].xyz;

    gatherProps(ro, rd, uFar);
    float t = 0.04;
    bool hit = false;
    for (int i = 0; i < 256; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * t;
      if (p.y > uMaxTop + 3.0 && rd.y > 0.0) break;
      float d = map(p);
      if (d < 0.0012 * t + 0.0005) { hit = true; break; }
      t += d * 0.92;
      if (t > uFar) break;
    }
    if (!hit) discard;

    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    // Felt fibre: a fine bump on the normal.
    n = normalize(n + 0.06 * (vec3(vnoise(p * 55.0), vnoise(p * 55.0 + 7.1), vnoise(p * 55.0 + 3.7)) - 0.5));
    float fuzz;
    vec3 base = material(p, n, fuzz);
    base *= 0.93 + 0.1 * fbm(p * 9.0) + 0.04 * fbm(p * 40.0);

    vec3 l = normalize(uSunDir);
    vec3 view = -rd;
    float ndv = clamp(dot(n, view), 0.0, 1.0);
    float sh = uShadowSteps > 0 ? softShadow(p + n * 0.02, l) : 1.0;
    float ao = uAo > 0 ? calcAO(p, n) : 1.0;
    float wrap = celRamp(clamp((dot(n, l) + 0.4) / 1.4, 0.0, 1.0) * mix(1.0, sh, 0.85), uCel);
    vec3 ambient = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    float baseLuma = max(dot(base, vec3(0.2126, 0.7152, 0.0722)), 0.02);
    vec3 shadeTint = mix(vec3(1.0), base / baseLuma, 0.45 * uCel * (1.0 - wrap));
    vec3 col = base * (ambient * 0.7 * shadeTint * mix(0.55, 1.0, ao) + uSunColor * wrap * 0.8);
    col += base * 1.15 * pow(1.0 - ndv, 2.5) * fuzz * (0.4 + 0.6 * wrap) * (1.0 - 0.6 * uCel);

    float dist = t;
    float fog = 1.0 - exp(-max(dist - 18.0, 0.0) * uFogDensity);
    vec3 haze = mix(uFogColor, uSunColor * 0.8, pow(clamp(dot(rd, l), 0.0, 1.0), 4.0) * 0.5);
    col = mix(col, haze, fog);

    vec4 clip = uViewProj * vec4(p, 1.0);
    gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
