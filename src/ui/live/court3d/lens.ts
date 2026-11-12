// The lens: the light the things on the floor reflect, the floor's own wood and varnish up close, and the
// picture as a broadcast camera makes it.
//
// - The building's light (`arenaLight`): what a body, a shoe, the ball, the rim and the glass see round
//   them, drawn once for each floor into an environment map: the lit floor below, the dark bowl of the
//   stands, the roof black but for the banks of lamps in it. It gives them their soft light from every
//   side (their form) and the glints of the lamps on them (their highlights).
// - The varnished floor (`varnish`): the 2D court's painted canvas, and over it in the floor's own
//   shader, where the camera is near enough to see them, the maple strips of a real floor (2¼ in wide,
//   each a shade of its own, their seams and their joints, the grain), and the lamps in the varnish: each
//   bank a row of lamps, drawn out toward the camera as a glossy floor draws a light, over the soft glow
//   of the whole bank. Its shadows are sharp at a foot and soft by a head.
// - The air (`air`): the dark over the stands lit faintly round the lamps' height, their beams down
//   through it, a glow round each bank; and (scene.ts) a little haze, so the far stands sit back.
// - The picture (`Lens`): on the top step the scene is drawn into a target of its own, as it would be to
//   the screen; the brightest of it (the lamps in the varnish, the glints, a lit board) glows a little, the
//   corners are a shade darker, and it is graded as a broadcast is (a hair warm, the blacks deep, the
//   colours as painted). A device that can't keep up draws straight to the screen (see Court3D's STEPS).
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  DepthTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  ShaderChunk,
  SphereGeometry,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HALF_W, SIDE } from '../Court';
import { LAMPS } from './arena';

// ---------------------------------------------------------------------------------------------------
// The banks of lamps in the roof

/** A bank of lamps: its middle, the way along it and the way up it (unit), the way it faces, half its length and height (ft). */
export interface Bank {
  at: Vector3;
  u: Vector3;
  v: Vector3;
  n: Vector3;
  hu: number;
  hv: number;
}

/** How the banks hang (arena.ts, the roof over each side): tipped this far toward the floor (radians), this tall (ft). */
const BANK_TIP = 0.5;
const BANK_H = 3.2;
/** Five banks to a side, a bank 0.11 of the side's run and 5.4 gaps to the run: a bank is this much of the gap between two. */
const BANK_SHARE = 0.11 * 5.4;

/**
 * Every bank in the roof, worked out from LAMPS (the far side's five, and the middle one over each end):
 * the far side's five as they are, and each end's five, spaced along it as the far side's are along it.
 * `near`: and five over the camera's side too, where the building has no roof of its own drawn (only the
 * light, for the things on the floor, sees them).
 */
export function banks(near = false): Bank[] {
  const far = LAMPS.slice(0, 5);
  const gap = far[1][0] - far[0][0];
  const [ex, ey] = LAMPS[5];
  // (the roof is set back the same way at the ends as along the far side: from it, how deep the bowl is across)
  const back = Math.abs(ex) - gap * 2.7;
  const endGap = (2 * (-far[0][2] - back)) / 5.4;
  const c = Math.cos(BANK_TIP);
  const s = Math.sin(BANK_TIP);
  const out: Bank[] = [];
  for (const [x, y, z] of far) {
    out.push({ at: new Vector3(x, y, z), u: new Vector3(1, 0, 0), v: new Vector3(0, c, s), n: new Vector3(0, -s, c), hu: (gap * BANK_SHARE) / 2, hv: BANK_H / 2 });
    if (near) out.push({ at: new Vector3(x, y, -z), u: new Vector3(1, 0, 0), v: new Vector3(0, c, -s), n: new Vector3(0, -s, -c), hu: (gap * BANK_SHARE) / 2, hv: BANK_H / 2 });
  }
  for (const e of [-1, 1]) {
    for (let j = -2; j <= 2; j++) {
      out.push({
        at: new Vector3(e * Math.abs(ex), ey, j * endGap),
        u: new Vector3(0, 0, 1),
        v: new Vector3(-e * s, c, 0),
        n: new Vector3(-e * c, -s, 0),
        hu: (endGap * BANK_SHARE) / 2,
        hv: BANK_H / 2,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The building's light

/** Where the building is seen from for its light: the middle of the floor, at a player's chest (ft). */
const PROBE_Y = 5;
/** The building is drawn this much smaller round that point (the same in every direction, and inside the cube camera's reach). */
const ENV_SCALE = 0.4;
/** How bright a lamp is (the floor's radiance is about 0.5): what lights the bodies from above, and glints on the ball and the glass. */
const ENV_LAMP = 56;
/** What the lamps' light is: a daylight white (a broadcast is balanced for it: the warmth is the wood's). */
const LAMP_TINT = new Color(1, 0.98, 0.95);
/** The floor as the things on it see it: its own colour, about as bright as it is lit. */
const ENV_FLOOR = 1.05;
/** The stands round the floor (the crowd in the lamps' spill), the roof over them, and the LED ribbon along the top of the bowl. */
const ENV_STANDS = new Color(0.05, 0.043, 0.036);
const ENV_ROOF = new Color(0.008, 0.008, 0.01);
const ENV_RIBBON = 0.22;
/** The scoreboard over the middle: its screens' glow on the tops of heads. */
const ENV_BOARD = 0.35;

const BOWL = {
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uFloor;
    uniform vec3 uStands;
    uniform vec3 uRoof;
    uniform float uRibbon;
    varying vec3 vDir;
    void main() {
      float e = normalize(vDir).y;
      // (the floor below, to the dark at its edge; the stands up to the ribbon; the roof)
      vec3 c = mix(uStands, uRoof, smoothstep(0.27, 0.36, e));
      c += vec3(1.0, 0.96, 0.9) * uRibbon * (1.0 - smoothstep(0.0, 0.012, abs(e - 0.3)));
      c = mix(c, uStands * 0.6, 1.0 - smoothstep(-0.12, -0.05, e));
      c = mix(c, uFloor, 1.0 - smoothstep(-0.24, -0.12, e));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * The building as the things on the floor see it (see the top of this file), for `scene.environment`:
 * `floor` is the floor's own colour (linear). Its owner disposes of what comes back.
 */
export function arenaLight(renderer: WebGLRenderer, floor: Color): WebGLRenderTarget {
  const scene = new Scene();
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(o: T): T => (trash.push(o), o);
  const k = ENV_SCALE;
  const bowl = new Mesh(
    keep(new SphereGeometry(150 * k, 48, 32)),
    keep(
      new ShaderMaterial({
        ...BOWL,
        side: BackSide,
        uniforms: { uFloor: { value: floor.clone().multiplyScalar(ENV_FLOOR) }, uStands: { value: ENV_STANDS }, uRoof: { value: ENV_ROOF }, uRibbon: { value: ENV_RIBBON } },
      }),
    ),
  );
  scene.add(bowl);
  // the banks, every one round the roof (and over the camera's side): one shape of quads
  const pts: number[] = [];
  const P = new Vector3();
  const corner = (b: Bank, su: number, sv: number) => {
    P.copy(b.at)
      .addScaledVector(b.u, su * b.hu)
      .addScaledVector(b.v, sv * b.hv);
    P.y -= PROBE_Y;
    P.multiplyScalar(k);
    pts.push(P.x, P.y, P.z);
  };
  for (const b of banks(true)) {
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ])
      corner(b, su, sv);
  }
  const lampGeo = keep(new BufferGeometry());
  lampGeo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  scene.add(new Mesh(lampGeo, keep(new MeshBasicMaterial({ color: LAMP_TINT.clone().multiplyScalar(ENV_LAMP), side: DoubleSide }))));
  // the scoreboard: a lit box over the middle
  const board = new Mesh(keep(new SphereGeometry(9 * k, 12, 8)), keep(new MeshBasicMaterial({ color: new Color(0.9, 0.95, 1).multiplyScalar(ENV_BOARD) })));
  board.position.set(0, (60 - PROBE_Y) * k, 0);
  scene.add(board);

  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 200 * k);
  pmrem.dispose();
  for (const o of trash) o.dispose();
  return rt;
}

// ---------------------------------------------------------------------------------------------------
// The varnished floor

/** The boards as the 2D court paints them (Court.tsx paintFloor): each is this wide (ft), and is six of a real floor's strips. */
const PAINTED_BOARD = 1.15;
const STRIPS = 6;
/** A seam between two strips, or a joint at a strip's end: this wide (ft), and this much darker. */
const SEAM_W = 0.0055;
const SEAM_DARK = 0.42;
/** How far a strip's face is off flat at most (radians): the lamps in the varnish break up along them. */
const TILT = 0.0025;
/** A bank is a row of this many lamps, each this much of its share of the row: the varnish's clear coat shows each one. */
const HEADS = 6;
const HEAD_FILL = 0.32;
/** A lamp, as bright as it is (the floor shows a twentieth or so of it, more the flatter it is looked across). */
const BANK_GLOW = new Color(1, 0.96, 0.9).multiplyScalar(54);
/**
 * How far a reflection spreads up and down, for each ft it goes from the floor to the lamp: the clear
 * coat's (sharp), the wood's under it (soft) and the varnish's haze. Across, it spreads less the flatter
 * the floor is looked across (a rough floor draws a light out toward the camera).
 */
const SPREAD_SHARP = 0.04;
const SPREAD_SOFT = 0.16;
const SPREAD_HAZE = 0.32;
/** How much of the lamps the haze is; and how much brighter the clear coat's lamps are than the wood's blur of them (they are the lamps themselves, nearly: they glow). */
const HAZE = 0.35;
const CLEAR = 1.5;
/** The floor takes this much of the light (it is set for the figures): its paint stays the colour it was painted. */
const PAINT_LIGHT = 0.8;
/**
 * The shadows on the floor: sharp where a foot meets it, softer the higher what throws them is (a lamp
 * ring is a broad light). How far round a point the map is looked at for what is over it (texels); how
 * soft for each ft that is over the floor, at least and at most (texels).
 */
const SHADOW_SEARCH = 7;
const SHADOW_SOFT = 0.9;
const SHADOW_SHARP = 0.6;
const SHADOW_MOST = 6;
/** The depth of the shadow map along the light, ft (scene.ts SHADOW_DEPTH). */
const SHADOW_FT = 120;

/** The shadow's filter, its width found first from how far over the floor what throws it is. */
const CONTACT = /* glsl */ `
      {
        vec2 ts = vec2(1.0) / shadowMapSize;
        float over = 0.0;
        float found = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785 + 0.4;
          vec2 o = vec2(cos(a), sin(a)) * ts * SHADOW_SEARCH_ * (0.45 + 0.55 * float(i & 1));
          float d = unpackRGBAToDepth(texture2D(shadowMap, shadowCoord.xy + o));
          if (d < shadowCoord.z) {
            over += shadowCoord.z - d;
            found += 1.0;
          }
        }
        shadowRadius = found > 0.0 ? clamp(over / found * SHADOW_FT_ * SHADOW_SOFT_, SHADOW_SHARP_, SHADOW_MOST_) : SHADOW_SHARP_;
      }
      float dx0 = - texelSize.x * shadowRadius;`;

const FLOOR_HEAD = /* glsl */ `
  varying vec3 vFloor;
  uniform float uDetail;
  uniform vec3 uBankAt[BANKS];
  uniform vec4 uBankU[BANKS];
  uniform vec4 uBankV[BANKS];
  uniform vec3 uBankN[BANKS];
  uniform vec3 uBankGlow;
  float fHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float fNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // how much of a pixel fw wide at x is covered by lines w wide every p (the lines' exact share: no shimmer)
  float fLines(float x, float p, float w, float fw) {
    fw = max(fw, 1e-5);
    vec2 t = (vec2(x - 0.5 * fw, x + 0.5 * fw) + 0.5 * w) / p;
    vec2 i = floor(t) * w + min(fract(t) * p, w);
    return (i.y - i.x) / fw;
  }
  // a lamp h either side of its middle, seen through a varnish that spreads it s more: flat over it, falling
  // away past its edge as a glossy reflection does, and dimmer the more it is spread (the same light in all)
  float fSpread(float x, float h, float s) {
    float o = max(abs(x) - h, 0.0) / s;
    return exp(-o * o) * h / (h + 0.886 * s);
  }`;

const FLOOR_WOOD = /* glsl */ `
  #include <map_fragment>
  // the strips: across the floor from its far edge, each painted board six strips; along it, each strip
  // in lengths of its own with its joints staggered
  float wAcross = HALF_EDGE - vFloor.z;
  float wAlong = vFloor.x;
  float wSw = BOARD / STRIPS_N;
  float wStripF = wAcross / wSw;
  float wStrip = floor(wStripF);
  float wLen = 2.6 + 5.4 * fHash(vec2(wStrip, 3.1));
  float wRun = wAlong + wLen * fHash(vec2(wStrip, 7.7));
  float wPiece = floor(wRun / wLen);
  float wFwA = fwidth(wAcross);
  float wFwL = fwidth(wRun);
  // (what is too fine to see from here is its average: a strip under a few dots wide is the board's tone)
  float wNear = (1.0 - smoothstep(wSw * 0.1, wSw * 0.3, wFwA)) * uDetail;
  float wPick = fHash(vec2(wStrip * 1.37 + 0.5, wPiece * 2.11 + 1.3));
  vec3 wTone = mix(vec3(1.03, 1.025, 1.02), vec3(0.92, 0.895, 0.86), wPick * wPick);
  // the grain: fine lines along the strip, wavering, finer still where they are near
  float wWav = fNoise(vec2(wRun * 0.35, wStrip * 5.0)) * 3.0;
  float wG1 = fNoise(vec2(wRun * 0.9 + wPiece * 13.0, (wAcross + wWav * wSw) * 70.0));
  float wG2 = fNoise(vec2(wRun * 2.3, wAcross * 190.0 + wStrip));
  float wGrainNear = 1.0 - smoothstep(0.002, 0.005, wFwA);
  float wGrain = 1.0 + 0.09 * (wG1 - 0.5) * wGrainNear + 0.05 * (wG2 - 0.5) * (1.0 - smoothstep(0.0008, 0.002, wFwA));
  float wSeams = fLines(wAcross, wSw, SEAM_W_, wFwA) + fLines(wRun, wLen, SEAM_W_, wFwL) * step(0.05, fract(wStripF)) * step(fract(wStripF), 0.95);
  vec3 wWood = mix(vec3(1.0), wTone * wGrain, wNear) * (1.0 - SEAM_DARK_ * min(wSeams, 1.0) * uDetail);
  // (paint and lines take the grain and the seams less than bare wood: they lie over it)
  float wBare = smoothstep(0.08, 0.2, diffuseColor.r - diffuseColor.b);
  diffuseColor.rgb *= mix(vec3(1.0) - (vec3(1.0) - wWood) * 0.6, wWood, wBare);
  // each strip's face a little off flat, and its varnish a little more or less clear
  vec2 fTilt = (vec2(fHash(vec2(wStrip, 11.0)), fHash(vec2(wStrip, wPiece + 5.0))) - 0.5) * vec2(0.6, 2.0) * TILT_ * wNear;
  float fGloss = 0.6 + 0.25 * (fHash(vec2(wPiece, wStrip * 0.73)) - 0.5) * wNear;`;

const FLOOR_VARNISH = /* glsl */ `
  #include <lights_fragment_end>
  {
    reflectedLight.directDiffuse *= PAINT_;
    reflectedLight.indirectDiffuse *= PAINT_;
    // (the varnish's reflections are its lamps, below, and the mirror over it: not the environment's blur)
    reflectedLight.indirectSpecular *= 0.0;
    vec3 eyeW = normalize(vFloor - cameraPosition);
    vec3 r = reflect(eyeW, normalize(vec3(fTilt.x, 1.0, fTilt.y)));
    float cosI = clamp(-eyeW.y, 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
    float across = max(cosI, 0.2);
    float glint = 0.0;
    for (int i = 0; i < BANKS; i++) {
      float dn = dot(r, uBankN[i]);
      if (dn > -0.001) continue;
      float t = dot(uBankAt[i] - vFloor, uBankN[i]) / dn;
      if (t <= 0.0) continue;
      vec3 d = vFloor + r * t - uBankAt[i];
      float u = dot(d, uBankU[i].xyz);
      float v = dot(d, uBankV[i].xyz);
      float hu = uBankU[i].w;
      float hv = uBankV[i].w;
      // (the clear coat: each lamp of the row, drawn out toward the camera)
      float cell = 2.0 * hu / HEADS_N;
      float s = t * SHARP_;
      float lamp = 0.5 * cell * HEAD_FILL_;
      float head = fSpread((fract(u / cell + 0.5 * HEADS_N) - 0.5) * cell, 0.3 * lamp, 0.7 * lamp + min(s * across, 0.3 * cell)) * (1.0 + 0.886 * 0.7 / 0.3);
      float sharp = head * fSpread(u, hu, 0.5 * cell) * fSpread(v, 0.3 * hv, 0.7 * hv + s) * (1.0 + 0.886 * 0.5 * cell / hu) * (1.0 + 0.886 * (0.7 * hv + s) / (0.3 * hv)) * hv / (hv + 0.886 * s);
      float soft = HEAD_FILL_ * fSpread(u, hu, t * SOFT_ * across) * fSpread(v, hv, t * SOFT_);
      float haze = HEAD_FILL_ * fSpread(u, hu, t * HAZE_S * across) * fSpread(v, hv, t * HAZE_S);
      glint += mix(soft, sharp * CLEAR_, fGloss) + HAZE_ * haze;
    }
    reflectedLight.directSpecular += uBankGlow * glint * fres;
  }`;

/** What the floor's shader is told each frame (only the wood's detail is changed: shed on a slow device). */
export interface FloorKnobs {
  uDetail: { value: number };
}

const glsl = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

/**
 * The floor's material becomes the varnished floor (see the top of this file): the canvas it is given
 * is its paint. Returns its knobs.
 */
export function varnish(mat: MeshStandardMaterial): FloorKnobs {
  const list = banks();
  const knobs: FloorKnobs = { uDetail: { value: 1 } };
  const uniforms = {
    ...knobs,
    uBankAt: { value: list.map((b) => b.at) },
    uBankU: { value: list.map((b) => [b.u.x, b.u.y, b.u.z, b.hu]).flat() },
    uBankV: { value: list.map((b) => [b.v.x, b.v.y, b.v.z, b.hv]).flat() },
    uBankN: { value: list.map((b) => b.n) },
    uBankGlow: { value: BANK_GLOW },
  };
  const defs = {
    BANKS: String(list.length),
    HALF_EDGE: glsl(HALF_W + SIDE),
    BOARD: glsl(PAINTED_BOARD),
    STRIPS_N: glsl(STRIPS),
    SEAM_W_: glsl(SEAM_W),
    SEAM_DARK_: glsl(SEAM_DARK),
    TILT_: glsl(TILT),
    SHARP_: glsl(SPREAD_SHARP),
    SOFT_: glsl(SPREAD_SOFT),
    HAZE_S: glsl(SPREAD_HAZE),
    HAZE_: glsl(HAZE),
    CLEAR_: glsl(CLEAR),
    HEADS_N: glsl(HEADS),
    HEAD_FILL_: glsl(HEAD_FILL),
    PAINT_: glsl(PAINT_LIGHT),
    SHADOW_SEARCH_: glsl(SHADOW_SEARCH),
    SHADOW_SOFT_: glsl(SHADOW_SOFT),
    SHADOW_SHARP_: glsl(SHADOW_SHARP),
    SHADOW_MOST_: glsl(SHADOW_MOST),
    SHADOW_FT_: glsl(SHADOW_FT),
  };
  const define = Object.entries(defs)
    .map(([k, v]) => `#define ${k} ${v}`)
    .join('\n');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <shadowmap_pars_fragment>', ShaderChunk.shadowmap_pars_fragment.replace('float dx0 = - texelSize.x * shadowRadius;', CONTACT))
      .replace('#include <common>', `#include <common>\n${define}\n${FLOOR_HEAD}`)
      .replace('#include <map_fragment>', FLOOR_WOOD)
      .replace('#include <lights_fragment_end>', FLOOR_VARNISH);
  };
  mat.customProgramCacheKey = () => 'floor';
  return knobs;
}

// ---------------------------------------------------------------------------------------------------
// The air in the building

/** The air over the stands, lit by the lamps (linear): at the lamps' height, and up in the roof. */
const AIR_LOW = new Color(0.018, 0.016, 0.014);
const AIR_HIGH = new Color(0.002, 0.002, 0.0025);
/** The haze between the camera and the far stands: how thick (the far side is a few percent into it, the roof more). */
export const HAZE_COLOR = new Color(0.02, 0.018, 0.016);
export const HAZE_DENSITY = 0.0009;
/** The lamps' beams down through the haze to the floor: how much of the lamp they show where they leave it, and how wide they get by the floor (ft). */
const BEAM = 0.05;
const BEAM_FLOOR = 26;
/** The glow round a lamp bank, at its middle (over the glow's threshold: it blooms). */
const LAMP_GLOW = 2.2;

const DOME = {
  vertexShader: /* glsl */ `
    varying vec3 vAt;
    void main() {
      vAt = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vAt, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uLow;
    uniform vec3 uHigh;
    uniform float uLampY;
    varying vec3 vAt;
    void main() {
      // (the air is lit most at the lamps' height, and darkens up into the roof and down behind the stands)
      float up = (vAt.y - uLampY) / 140.0;
      vec3 c = mix(uLow, uHigh, smoothstep(0.0, 1.0, up)) * smoothstep(-0.6, 0.0, up);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
};

const BEAMS = {
  vertexShader: /* glsl */ `
    attribute float aAlong;
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vAlong = aAlong;
      vec4 at = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = -at.xyz;
      gl_Position = projectionMatrix * at;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uLamp;
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      // (a cone of lit air: brightest down its middle as the camera sees it, gone at its edges; fading as
      // it spreads toward the floor, and where the camera is in it)
      float d = max(length(vView), 0.01);
      float mid = abs(dot(normalize(vNormal), vView / d));
      // (seen against the dark of the roof, gone by the time it is over the stands and the floor)
      float a = mid * mid * pow(clamp(1.0 - vAlong, 0.0, 1.0), 3.5) * smoothstep(0.0, 0.06, vAlong) * smoothstep(20.0, 60.0, d);
      gl_FragColor = vec4(uLamp * a, 1.0);
      #include <colorspace_fragment>
    }`,
};

const GLOWS = {
  vertexShader: /* glsl */ `
    attribute vec2 aCorner;
    attribute vec3 aAlongBank;
    attribute vec2 aSize;
    varying vec2 vCorner;
    void main() {
      vCorner = aCorner;
      vec4 at = modelViewMatrix * vec4(position, 1.0);
      // (facing the camera, drawn out along the bank as the camera sees it)
      vec2 u = (modelViewMatrix * vec4(aAlongBank, 0.0)).xy;
      u = length(u) > 1e-4 ? normalize(u) : vec2(1.0, 0.0);
      vec2 v = vec2(-u.y, u.x);
      at.xy += u * aCorner.x * aSize.x + v * aCorner.y * aSize.y;
      gl_Position = projectionMatrix * at;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uLamp;
    varying vec2 vCorner;
    void main() {
      float r = length(vCorner);
      float a = exp(-r * r * 7.0) * (1.0 - smoothstep(0.7, 1.0, r)) + 0.06 * exp(-r * r * 3.0) * (1.0 - smoothstep(0.6, 1.0, r));
      gl_FragColor = vec4(uLamp * a, 1.0);
      #include <colorspace_fragment>
    }`,
};

/**
 * The air in the building (its own group, for the scene): the dark over the stands lit faintly round the
 * lamps' height (not a black void: `dome`), the lamps' beams down through it, and a glow round each bank.
 * `beams` (the beams and the glows) is what a slow device gives up with the picture's finish, and the
 * dome with the floor's mirror.
 */
export function air(keep: <T extends { dispose(): void }>(o: T) => T): { group: Group; beams: Group; dome: Mesh } {
  const group = new Group();
  const beams = new Group();
  const list = banks();
  const lampY = list[0].at.y;
  const dome = new Mesh(
    keep(new SphereGeometry(520, 32, 16)),
    keep(new ShaderMaterial({ ...DOME, side: BackSide, depthWrite: false, uniforms: { uLow: { value: AIR_LOW }, uHigh: { value: AIR_HIGH }, uLampY: { value: lampY } } })),
  );
  // (drawn after the rest of what is solid, behind it: only where nothing else is is it drawn at all)
  dome.renderOrder = 1;
  group.add(dome);

  // the beams: a cone from each bank to where it points on the floor, all in one shape
  const pos: number[] = [];
  const nrm: number[] = [];
  const along: number[] = [];
  const idx: number[] = [];
  const SEGS = 14;
  const axis = new Vector3();
  const side = new Vector3();
  const up = new Vector3();
  const p = new Vector3();
  const nv = new Vector3();
  for (const b of list) {
    const reach = b.at.y / -b.n.y;
    axis.copy(b.n);
    side.copy(b.u);
    up.crossVectors(axis, side).normalize();
    const r0 = b.hu * 0.7;
    const base = pos.length / 3;
    for (let k = 0; k <= 1; k++) {
      const r = k ? BEAM_FLOOR : r0;
      for (let i = 0; i <= SEGS; i++) {
        const a = (i / SEGS) * Math.PI * 2;
        nv.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
        p.copy(b.at)
          .addScaledVector(axis, k * reach)
          .addScaledVector(nv, r);
        pos.push(p.x, p.y, p.z);
        nrm.push(nv.x, nv.y, nv.z);
        along.push(k);
      }
    }
    for (let i = 0; i < SEGS; i++) {
      const a0 = base + i;
      const b0 = base + SEGS + 1 + i;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  const cones = keep(new BufferGeometry());
  cones.setAttribute('position', new Float32BufferAttribute(pos, 3));
  cones.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  cones.setAttribute('aAlong', new Float32BufferAttribute(along, 1));
  cones.setIndex(idx);
  const lamp = LAMP_TINT.clone();
  const shafts = new Mesh(
    cones,
    keep(
      new ShaderMaterial({
        ...BEAMS,
        uniforms: { uLamp: { value: lamp.clone().multiplyScalar(BEAM) } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    ),
  );
  shafts.frustumCulled = false;
  beams.add(shafts);

  // the glows: a quad at each bank, turned to the camera
  const gp: number[] = [];
  const gc: number[] = [];
  const gu: number[] = [];
  const gs: number[] = [];
  const gi: number[] = [];
  list.forEach((b, n) => {
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      gp.push(b.at.x, b.at.y, b.at.z);
      gc.push(x, y);
      gu.push(b.u.x, b.u.y, b.u.z);
      gs.push(b.hu * 1.25, b.hv * 3);
    }
    gi.push(n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
  });
  const quads = keep(new BufferGeometry());
  quads.setAttribute('position', new Float32BufferAttribute(gp, 3));
  quads.setAttribute('aCorner', new Float32BufferAttribute(gc, 2));
  quads.setAttribute('aAlongBank', new Float32BufferAttribute(gu, 3));
  quads.setAttribute('aSize', new Float32BufferAttribute(gs, 2));
  quads.setIndex(gi);
  const glows = new Mesh(
    quads,
    keep(
      new ShaderMaterial({ ...GLOWS, uniforms: { uLamp: { value: lamp.clone().multiplyScalar(LAMP_GLOW) } }, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    ),
  );
  glows.frustumCulled = false;
  beams.add(glows);
  group.add(beams);
  return { group, beams, dome };
}

// ---------------------------------------------------------------------------------------------------
// The picture

/**
 * Brighter than this (linear, before the tone curve) glows, coming in over this much either side: the
 * lamps in the varnish, a glint on the rim, a lit board whose colour is set over it (a white kit in the
 * lamps is about 1 to 1.4, and doesn't).
 */
const GLOW_FROM = 1.8;
const GLOW_KNEE = 0.6;
/** How much the glow adds (of the brightness it is made of). */
const GLOW = 0.32;
/** How many times the glow is halved in size: the widest is the picture's height over 2 to this. */
const GLOW_STEPS = 4;
/** How much darker the corners are. */
const VIGNETTE = 0.2;
/** The grade: a little more colour, a soft S in the contrast, the blacks held down a touch. */
const SATURATION = 1.06;
const CONTRAST = 0.1;
const BLACKS = 0.008;
/** A broadcast camera's balance: a hair warm (in the screen's terms). */
const BALANCE = new Vector3(1.007, 1.0, 0.993);
/** The camera's exposure: a little over the building's light (a broadcast keeps the floor bright). */
const EXPOSURE = 1.06;
/** An exposure bump dies away over this long (ms). */
const BUMP_MS = 260;

/**
 * The picture as drawn is kept in the screen's own terms, its tone curve on (see Lens): back to light,
 * and (for the glow) back off the curve's shoulder, to about as bright as it was lit.
 */
const FROM_SCREEN = /* glsl */ `
  vec3 fromScreen(vec3 c) {
    // (a dot that is not a number, or is endless, would spread through the glow as a black block: it is nothing)
    if (any(isnan(c)) || any(isinf(c))) return vec3(0.0);
    c = clamp(c, 0.0, 1.0);
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  // the Khronos neutral curve's shoulder (three's NeutralToneMapping) undone: what was rolled off to white is bright again
  vec3 unTone(vec3 c) {
    const float start = 0.76;
    const float d = 0.24;
    float top = min(max(c.r, max(c.g, c.b)), 0.992);
    if (top <= start) return c;
    return c * (d * d / (1.0 - top) - d + start) / top;
  }`;

const FULL = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

/**
 * Down a size: thirteen samples, weighted. The first, from the whole picture, is four (each the filtered
 * average of four dots: the picture is big, and it is only the brightest that is kept), each weighted by
 * its brightness, so one hot dot doesn't flicker.
 */
const DOWN = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uFirst;
  uniform float uDecode;
  uniform float uFrom;
  uniform float uKnee;
  varying vec2 vUv;
  ${FROM_SCREEN}
  vec3 s(float x, float y) {
    vec3 c = texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb;
    return uDecode > 0.5 ? (uFirst > 0.5 ? unTone(fromScreen(c)) : fromScreen(c)) : c;
  }
  float w(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
  void main() {
    vec3 o;
    if (uFirst > 0.5) {
      vec3 j = s(-1.0, 1.0), k = s(1.0, 1.0), l = s(-1.0, -1.0), m = s(1.0, -1.0);
      float wj = w(j), wk = w(k), wl = w(l), wm = w(m);
      o = (j * wj + k * wk + l * wl + m * wm) / (wj + wk + wl + wm);
      float br = max(o.r, max(o.g, o.b));
      float soft = clamp(br - uFrom + uKnee, 0.0, 2.0 * uKnee);
      soft = soft * soft / (4.0 * uKnee + 1e-4);
      o *= max(soft, br - uFrom) / max(br, 1e-4);
    } else {
      vec3 a = s(-2.0, 2.0), b = s(0.0, 2.0), c = s(2.0, 2.0);
      vec3 d = s(-2.0, 0.0), e = s(0.0, 0.0), f = s(2.0, 0.0);
      vec3 g = s(-2.0, -2.0), h = s(0.0, -2.0), i = s(2.0, -2.0);
      vec3 j = s(-1.0, 1.0), k = s(1.0, 1.0), l = s(-1.0, -1.0), m = s(1.0, -1.0);
      o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    }
    gl_FragColor = vec4(o, 1.0);
  }`;

/** Up a size, added to what is there: a tent of nine samples. */
const UP = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
  void main() {
    vec3 c = s(0.0, 0.0) * 4.0 + (s(-1.0, 0.0) + s(1.0, 0.0) + s(0.0, -1.0) + s(0.0, 1.0)) * 2.0 + s(-1.0, -1.0) + s(1.0, -1.0) + s(-1.0, 1.0) + s(1.0, 1.0);
    gl_FragColor = vec4(c / 16.0, 1.0);
  }`;

/**
 * The finished picture: the glow, the grade, the corners, to the screen. It is all done in the screen's
 * terms (the exposure and the tone curve are the materials', and the picture is kept as drawn): the glow
 * lies over it as light does over a screen, white at most, and nothing is taken to light and back.
 */
const FINISH = /* glsl */ `
  #include <packing>
  uniform sampler2D tScene;
  uniform sampler2D tGlow;
  uniform sampler2D tDepth;
  uniform sampler2D tSoft;
  uniform float uGlow;
  uniform vec3 uBalance;
  uniform float uSat;
  uniform float uContrast;
  uniform float uBlacks;
  uniform float uVignette;
  uniform float uAspect;
  uniform float uFocus;
  uniform float uFocusAmt;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tScene, vUv).rgb;
    if (uFocusAmt > 0.0) {
      float z = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).r, uNear, uFar);
      float off = clamp(abs(z - uFocus) / max(uFocus, 1.0) * 2.0, 0.0, 1.0) * uFocusAmt;
      s = mix(s, texture2D(tSoft, vUv).rgb, smoothstep(0.0, 1.0, off));
    }
    vec3 glow = texture2D(tGlow, vUv).rgb * uGlow;
    // (a dot that is not a number would spread: it is nothing)
    if (any(isnan(glow)) || any(isinf(glow))) glow = vec3(0.0);
    s = clamp(s * uBalance, 0.0, 1.0);
    s = s + sqrt(glow / (1.0 + glow)) * (1.0 - s);
    float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
    s = clamp(mix(vec3(l), s, uSat), 0.0, 1.0);
    s = mix(s, s * s * (3.0 - 2.0 * s), uContrast);
    s = max(s - uBlacks, 0.0) / (1.0 - uBlacks);
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(q) / length(vec2(uAspect, 1.0) * 0.5);
    s *= 1.0 - uVignette * smoothstep(0.42, 1.05, r);
    // (a hair of noise: no bands in the dark's gradients)
    vec3 q3 = fract(vec3(gl_FragCoord.xyx) * 0.1031);
    q3 += dot(q3, q3.yzx + 33.33);
    s += (fract((q3.x + q3.y) * q3.z) - 0.5) / 255.0;
    gl_FragColor = vec4(s, 1.0);
  }`;

const target = (w: number, h: number, samples = 0, type: typeof HalfFloatType | typeof UnsignedByteType = HalfFloatType) => {
  const rt = new WebGLRenderTarget(w, h, { type, samples, depthBuffer: samples > 0 });
  rt.texture.generateMipmaps = false;
  return rt;
};

/**
 * The target the scene is drawn into: three draws into it just as into the screen (the same materials,
 * its tone curve on, in the screen's terms and its 8 bits, so the glass, the pools of dark and the floor's
 * sheen lie over what is behind them as they do on the screen, where they were made, and a step down
 * to the screen changes no material). Floats would keep the light over white for the glow, but every dot
 * drawn costs twice: the glow takes the curve's shoulder off again instead (see unTone). (three's own way
 * of drawing as to the screen into a target is the one it uses for a headset's: the flag says so.)
 */
const screenTarget = (samples: number) => {
  const rt = target(1, 1, samples, UnsignedByteType);
  rt.texture.colorSpace = SRGBColorSpace;
  // (stored as drawn, not decoded by the hardware when it is read: the finish does that; and the same as the drawing buffer it is resolved from)
  rt.texture.internalFormat = 'RGBA8';
  (rt as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  return rt;
};

/**
 * The broadcast camera's picture (see the top of this file). `post` off (a step down on a slow device, or
 * a device that can't draw into float targets): the scene goes straight to the screen, its tone curve in
 * its materials, as before. Knobs for whoever directs the picture: `exposure`, `bump` (a flash of
 * brightness that dies away: never with reduced motion), `focus` (a close-up's depth of field).
 */
export class Lens {
  private finished = true;
  /** Brighter or darker than the building's own light (1: as lit; see EXPOSURE). */
  exposure = EXPOSURE;
  private bumped = 0;
  private focusAt = 0;
  private focusAmt = 0;
  private readonly can: boolean;
  private readonly scene: WebGLRenderTarget;
  private readonly glow: WebGLRenderTarget[] = [];
  private soft: WebGLRenderTarget[] = [];
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly tri: Mesh;
  private readonly down: ShaderMaterial;
  private readonly up: ShaderMaterial;
  private readonly finish: ShaderMaterial;
  private w = 1;
  private h = 1;

  constructor(private readonly renderer: WebGLRenderer) {
    this.can = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
    this.scene = screenTarget(samples);
    for (let i = 0; i < GLOW_STEPS; i++) this.glow.push(target(1, 1));
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const pass = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({ vertexShader: FULL, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: NoBlending });
    this.down = pass(DOWN, {
      tSrc: { value: null },
      uTexel: { value: new Vector2() },
      uFirst: { value: 0 },
      uDecode: { value: 0 },
      uFrom: { value: GLOW_FROM },
      uKnee: { value: GLOW_KNEE },
    });
    this.up = pass(UP, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
    this.up.blending = AdditiveBlending;
    this.finish = pass(FINISH, {
      tScene: { value: null },
      tGlow: { value: null },
      tDepth: { value: null },
      tSoft: { value: null },
      uGlow: { value: GLOW / GLOW_STEPS },
      uBalance: { value: BALANCE },
      uSat: { value: SATURATION },
      uContrast: { value: CONTRAST },
      uBlacks: { value: BLACKS },
      uVignette: { value: VIGNETTE },
      uAspect: { value: 1 },
      uFocus: { value: 0 },
      uFocusAmt: { value: 0 },
      uNear: { value: 1 },
      uFar: { value: 100 },
    });
    this.tri = new Mesh(geo, this.finish);
    this.tri.frustumCulled = false;
  }

  /** Finished here (the top step), or straight to the screen (the tone curve is the materials' either way). */
  get post() {
    return this.finished && this.can;
  }
  set post(on: boolean) {
    this.finished = on;
  }

  /** The picture's size in the screen's own dots. */
  size(w: number, h: number) {
    this.w = Math.max(1, Math.round(w));
    this.h = Math.max(1, Math.round(h));
    this.scene.setSize(this.w, this.h);
    this.glow.forEach((t, i) => t.setSize(Math.max(1, this.w >> (i + 1)), Math.max(1, this.h >> (i + 1))));
    this.soft.forEach((t, i) => t.setSize(Math.max(1, this.w >> (i + 1)), Math.max(1, this.h >> (i + 1))));
  }

  /** A flash of brightness (0..1 more), gone in a quarter of a second. */
  bump(much: number) {
    this.bumped = Math.max(this.bumped, much);
  }

  /** A close-up's depth of field: sharp `at` ft from the camera, softer away from it, by `much` (0: all sharp, as is usual). */
  focus(at: number, much: number) {
    this.focusAt = at;
    this.focusAmt = Math.max(0, Math.min(1, much));
  }

  /** One picture of `scene` from `camera`; `ms` since the last (a bump dies away on it). */
  render(scene: Object3D, camera: Camera, ms = 16) {
    const r = this.renderer;
    const exposure = this.exposure * (1 + this.bumped);
    this.bumped = Math.max(0, this.bumped - (ms / BUMP_MS) * Math.max(this.bumped, 0.2));
    r.toneMappingExposure = exposure;
    if (!this.post) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    const dof = this.focusAmt > 0 && (camera as PerspectiveCamera).isPerspectiveCamera;
    if (dof && !this.scene.depthTexture) {
      // (asked for the first time: the picture's depth is kept from now on)
      this.scene.depthTexture = new DepthTexture(this.w, this.h);
      this.scene.dispose();
    }
    r.setRenderTarget(this.scene);
    r.render(scene, camera);

    // the glow: down in halves from the brightest of it, then back up, each size adding the one under it
    const auto = r.autoClear;
    const d = this.down.uniforms;
    let src: Texture = this.scene.texture;
    let sw = this.w;
    let sh = this.h;
    this.tri.material = this.down;
    this.glow.forEach((t, i) => {
      d.tSrc.value = src;
      (d.uTexel.value as Vector2).set(1 / sw, 1 / sh);
      d.uFirst.value = d.uDecode.value = i === 0 ? 1 : 0;
      r.setRenderTarget(t);
      r.render(this.tri, this.cam);
      src = t.texture;
      sw = t.width;
      sh = t.height;
    });
    this.tri.material = this.up;
    r.autoClear = false;
    for (let i = this.glow.length - 2; i >= 0; i--) {
      const from = this.glow[i + 1];
      this.up.uniforms.tSrc.value = from.texture;
      (this.up.uniforms.uTexel.value as Vector2).set(1 / from.width, 1 / from.height);
      r.setRenderTarget(this.glow[i]);
      r.render(this.tri, this.cam);
    }
    r.autoClear = auto;

    // a close-up's soft background: the picture at a quarter of its size
    const f = this.finish.uniforms;
    if (dof) {
      if (!this.soft.length) {
        this.soft = [target(1, 1), target(1, 1)];
        this.size(this.w, this.h);
      }
      this.tri.material = this.down;
      d.uFirst.value = 0;
      let from: Texture = this.scene.texture;
      let first = true;
      let fw = this.w;
      let fh = this.h;
      for (const t of this.soft) {
        d.uDecode.value = first ? 1 : 0;
        first = false;
        d.tSrc.value = from;
        (d.uTexel.value as Vector2).set(1 / fw, 1 / fh);
        r.setRenderTarget(t);
        r.render(this.tri, this.cam);
        from = t.texture;
        fw = t.width;
        fh = t.height;
      }
      const pc = camera as PerspectiveCamera;
      f.tDepth.value = this.scene.depthTexture;
      f.tSoft.value = this.soft[1].texture;
      f.uNear.value = pc.near;
      f.uFar.value = pc.far;
    }
    f.uFocus.value = this.focusAt;
    f.uFocusAmt.value = dof ? this.focusAmt : 0;
    f.tScene.value = this.scene.texture;
    f.tGlow.value = this.glow[0].texture;
    f.uAspect.value = this.w / this.h;
    this.tri.material = this.finish;
    r.setRenderTarget(null);
    r.render(this.tri, this.cam);
  }

  dispose() {
    this.scene.depthTexture?.dispose();
    this.scene.dispose();
    for (const t of [...this.glow, ...this.soft]) t.dispose();
    this.tri.geometry.dispose();
    this.down.dispose();
    this.up.dispose();
    this.finish.dispose();
  }
}
