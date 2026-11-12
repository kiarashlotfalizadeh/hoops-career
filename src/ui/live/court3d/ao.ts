// The dark where things meet: under a shoe on the floor, between an arm and a trunk, under a chin, where
// a chair's legs stand, between two men shoulder to shoulder. The lamps' thrown shadows don't make it (it is
// the soft light from all round that doesn't get in there), so it is found from the finished picture's
// depth: for each dot, how much of what is round it within a couple of feet stands in front of its own
// surface. Worked at half the picture's size (or a third: `coarse`), smoothed along what is at one depth,
// and laid over the picture by the lens's finish.
import {
  BufferGeometry,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';

/** How far round a dot is looked at (ft), and never more of the picture's height than this. */
const REACH = 1.3;
const REACH_MOST = 0.09;
/** How dark it gets, and what is not counted: nearer its own surface than this (ft, and more with distance: the depth is coarser there). */
const DARK = 1.6;
const SKIN = 0.035;
const SKIN_FAR = 0.0012;
/** Past this far from the camera (ft) there is none: the far stands are a few dots a head. */
const FAR_FROM = 190;
const FAR_TO = 260;

const FULL = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const HEAD = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform vec2 uNearFar;
  uniform vec4 uProj;
  varying vec2 vUv;
  uniform vec2 uTexel;
  // (a dot of the depth, its own middle: a place between two dots is neither's, and the floor looked along is steep)
  vec2 dot_(vec2 uv) { return (floor(uv / uTexel) + 0.5) * uTexel; }
  float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, uNearFar.x, uNearFar.y); }
  // where a dot of the picture is, from the camera (x right, y up, z away)
  vec3 at(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0 + uProj.zw) * uProj.xy * z, z); }`;

const FIND = /* glsl */ `
  ${HEAD}
  uniform float uReach;
  void main() {
    vec2 here = dot_(vUv);
    float z = viewZ(here);
    if (z > ${FAR_TO.toFixed(1)}) { gl_FragColor = vec4(1.0); return; }
    vec3 p = at(here, z);
    // its surface's facing, from the nearer of its neighbours each way (the farther may be another thing)
    vec2 dx = vec2(uTexel.x, 0.0);
    vec2 dy = vec2(0.0, uTexel.y);
    float zl = viewZ(here - dx), zr = viewZ(here + dx), zd = viewZ(here - dy), zu = viewZ(here + dy);
    vec3 ax = abs(zr - z) < abs(z - zl) ? at(here + dx, zr) - p : p - at(here - dx, zl);
    vec3 ay = abs(zu - z) < abs(z - zd) ? at(here + dy, zu) - p : p - at(here - dy, zd);
    vec3 n = normalize(cross(ay, ax));
    // (how big the reach is in the picture: nothing under a couple of dots)
    vec2 r = min(uReach / (z * uProj.xy * 2.0), vec2(${REACH_MOST.toFixed(3)}));
    float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    float skin = ${SKIN.toFixed(3)} + z * ${SKIN_FAR.toFixed(4)};
    float sum = 0.0;
    for (int i = 0; i < TAPS; i++) {
      float k = (float(i) + 0.5) / float(TAPS);
      float a = turn + float(i) * 2.399963;
      vec2 uv = dot_(here + vec2(cos(a), sin(a)) * r * sqrt(k));
      vec3 v = at(uv, viewZ(uv)) - p;
      float d2 = dot(v, v);
      // (what is in front of its surface, the nearer the more; nothing from farther off than the reach)
      sum += max(dot(v, n) - skin, 0.0) / (d2 + 0.02) * (1.0 - smoothstep(uReach * uReach * 0.6, uReach * uReach * 1.6, d2));
    }
    float ao = clamp(1.0 - ${DARK.toFixed(2)} * sum * uReach / float(TAPS), 0.0, 1.0);
    ao = mix(ao, 1.0, smoothstep(${FAR_FROM.toFixed(1)}, ${FAR_TO.toFixed(1)}, z));
    gl_FragColor = vec4(ao, 0.0, 0.0, 1.0);
  }`;

/** Smoothed one way, by what is at about its own depth (not over an edge). */
const SMOOTH = /* glsl */ `
  ${HEAD}
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  void main() {
    float z = viewZ(vUv);
    float sum = texture2D(tSrc, vUv).r * 0.25;
    float w = 0.25;
    for (int i = -3; i <= 3; i++) {
      if (i == 0) continue;
      vec2 uv = vUv + uStep * float(i);
      float k = (1.0 - abs(float(i)) * 0.22) * max(0.0, 1.0 - abs(viewZ(uv) - z) / (0.25 + z * 0.006));
      sum += texture2D(tSrc, uv).r * k;
      w += k;
    }
    gl_FragColor = vec4(sum / w, 0.0, 0.0, 1.0);
  }`;

export class Occlusion {
  /** Worked at a third of the picture's size, not a half (a device a step down). */
  coarse = false;
  private readonly found = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly pass = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly tri: Mesh;
  private readonly find: ShaderMaterial;
  private readonly smooth: ShaderMaterial;
  private w = 1;
  private h = 1;

  constructor(private readonly renderer: WebGLRenderer) {
    for (const t of [this.found, this.pass]) {
      t.texture.generateMipmaps = false;
      t.texture.minFilter = t.texture.magFilter = LinearFilter;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const shared = { tDepth: { value: null as Texture | null }, uNearFar: { value: new Vector2() }, uProj: { value: new Vector4() }, uTexel: { value: new Vector2() } };
    const mat = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({ vertexShader: FULL, fragmentShader, uniforms: { ...shared, ...uniforms }, depthTest: false, depthWrite: false, blending: NoBlending });
    this.find = mat(FIND, { uReach: { value: REACH } });
    this.find.defines = { TAPS: 10 };
    this.smooth = mat(SMOOTH, { tSrc: { value: null }, uStep: { value: new Vector2() } });
    this.tri = new Mesh(geo, this.find);
    this.tri.frustumCulled = false;
  }

  /** The picture's size in the screen's own dots. */
  size(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  /** The dark for this picture, from its depth as `camera` drew it: a texture the size of a part of the picture, white where there is none. */
  render(depth: Texture, camera: PerspectiveCamera): Texture {
    const r = this.renderer;
    const by = this.coarse ? 3 : 2;
    const w = Math.max(1, Math.round(this.w / by));
    const h = Math.max(1, Math.round(this.h / by));
    if (this.found.width !== w || this.found.height !== h) {
      this.found.setSize(w, h);
      this.pass.setSize(w, h);
    }
    const u = this.find.uniforms;
    u.tDepth.value = depth;
    (u.uNearFar.value as Vector2).set(camera.near, camera.far);
    // (a dot's place from its depth: the lens's reach each way, and where its middle is when it is off the picture's)
    const m = camera.projectionMatrix.elements;
    (u.uProj.value as Vector4).set(1 / m[0], 1 / m[5], m[8], m[9]);
    (u.uTexel.value as Vector2).set(1 / this.w, 1 / this.h);
    this.tri.material = this.find;
    r.setRenderTarget(this.found);
    r.render(this.tri, this.cam);
    const s = this.smooth.uniforms;
    this.tri.material = this.smooth;
    s.tSrc.value = this.found.texture;
    (s.uStep.value as Vector2).set(1 / w, 0);
    r.setRenderTarget(this.pass);
    r.render(this.tri, this.cam);
    s.tSrc.value = this.pass.texture;
    (s.uStep.value as Vector2).set(0, 1 / h);
    r.setRenderTarget(this.found);
    r.render(this.tri, this.cam);
    return this.found.texture;
  }

  dispose() {
    this.found.dispose();
    this.pass.dispose();
    this.tri.geometry.dispose();
    this.find.dispose();
    this.smooth.dispose();
  }
}
