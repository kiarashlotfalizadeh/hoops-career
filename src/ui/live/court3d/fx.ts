// What goes off in the building at a big moment: cameras and phones flashing in the stands (a late free
// throw, a dunk, the buzzer), confetti and streamers from the roof for a title (in the champions' colours)
// and a little of it when the home side wins a series, and the
// light show while the house lights are down (the open, a timeout, a home win): the roof's spots
// sweeping the floor, each a beam through the air, a pool of light where it lands and the lamp's own
// glare. Each is one draw, made up in its shader from a time and a few numbers a piece: nothing is moved
// from here frame by frame. Under reduced motion none of it happens (a flash is a flash).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Color,
  Vector2,
  Vector3,
} from 'three';
import { shotAt, type Shot } from './ballistics';

type Keep = <T extends { dispose(): void }>(o: T) => T;

/**
 * A shot's way through the air and what the rim does with it, drawn (the scene's own choice whether: a setting, never
 * under reduced motion, never on a device that can't keep up). The arc: a streak of light behind the ball over the
 * last of its flight (TRAIL_SPAN of it), bright down its middle and soft at its edges, thin at its tail and fullest
 * just behind the ball, turned to face the camera; it says where the ball came from, which a small ball against a
 * dark stand does not. Gold for a three and in the clutch (both known as it leaves his hand), else the lamps' white.
 * The swish: on a shot that touches nothing but the cords, two rings of light at the rim that drop through the net
 * and open as they fade (SWISH_MS). The slam: on a dunk that goes down, a ring of light off the rim that opens out
 * level with it, and a few sparks thrown off it that fall (SLAM_MS): the iron's own answer, under the building's
 * flashes. The block: the same, smaller and cold, at the hand that got to it. Four draws, a few dozen triangles.
 */
const TRAIL_N = 28;
const TRAIL_SPAN = 0.46;
const TRAIL_WIDE = 0.24;
const SWISH_MS = 460;
const SLAM_MS = 300;
const SPARK_N = 28;
/** How much light the slam's ring has at its middle as it starts (of the ring's own): a glint, not a flash over the rim. */
const SLAM_CORE = 0.3;

const TRAIL_SHADER = {
  vertexShader: /* glsl */ `
    attribute vec2 aTrail;
    varying vec2 vTrail;
    void main() {
      vTrail = aTrail;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uCore;
    uniform vec3 uEdge;
    varying vec2 vTrail;
    void main() {
      float across = abs(vTrail.y);
      float along = vTrail.x;
      float core = exp(-across * across * 9.0);
      float halo = exp(-across * across * 2.1) * 0.48;
      float fade = pow(along, 1.65) * smoothstep(1.0, 0.86, along) * smoothstep(0.0, 0.14, along);
      vec3 col = (uCore * core + uEdge * halo) * fade;
      if (max(col.r, max(col.g, col.b)) < 0.004) discard;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const RIPPLE_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vAt;
    void main() {
      vAt = uv * 2.0 - 1.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uK;
    uniform vec3 uTint;
    uniform float uStyle;
    varying vec2 vAt;
    void main() {
      float r = length(vAt);
      if (r > 1.0) discard;
      float e = 1.0 - (1.0 - uK) * (1.0 - uK);
      // (style 0: the swish's two rings, dropping; style 1: the slam's, opening fast, with a glint at its middle)
      float r1 = mix(0.28 + 0.56 * e, 0.18 + 0.78 * e, uStyle);
      float w1 = mix(0.09, 0.13, uStyle);
      float ring1 = exp(-pow((r - r1) / w1, 2.0));
      float r2 = max(0.05, r1 - 0.2);
      float ring2 = exp(-pow((r - r2) / (w1 * 0.75), 2.0)) * 0.48;
      float flash = uStyle * exp(-r * r * 7.5) * (1.0 - smoothstep(0.0, 0.42, uK)) * ${SLAM_CORE.toFixed(2)};
      float fade = (1.0 - uK) * (1.0 - uK);
      vec3 col = uTint * (ring1 + ring2 + flash) * fade * (1.0 - smoothstep(0.84, 1.0, r));
      if (max(col.r, max(col.g, col.b)) < 0.004) discard;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const SPARK_SHADER = {
  vertexShader: /* glsl */ `
    attribute vec3 aVel;
    attribute float aSeed;
    uniform float uT;
    uniform float uScale;
    varying float vFade;
    void main() {
      float life = 0.24 + 0.18 * aSeed;
      float k = clamp(uT / life, 0.0, 1.0);
      vFade = (1.0 - k) * (1.0 - k) * step(uT, life);
      vec3 p = position + aVel * uT + vec3(0.0, -7.5 * uT * uT, 0.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = vFade * clamp((0.36 + 0.34 * aSeed) * projectionMatrix[1][1] * uScale / max(-mv.z, 1.0), 2.0, 20.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uTint;
    varying float vFade;
    void main() {
      if (vFade < 0.01) discard;
      float r = length(gl_PointCoord * 2.0 - 1.0);
      float a = (smoothstep(0.55, 0.0, r) * 1.5 + exp(-r * r * 5.0) * 0.5) * vFade;
      if (a < 0.004) discard;
      gl_FragColor = vec4(mix(uTint, vec3(1.4, 1.35, 1.25), smoothstep(0.45, 0.0, r)) * a, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class ShotFx {
  readonly group = new Group();
  private readonly trail: Mesh;
  private readonly trailMat: ShaderMaterial;
  private readonly at: BufferAttribute;
  private readonly ring: Mesh;
  private readonly ringMat: ShaderMaterial;
  private ringMs = SWISH_MS;
  private readonly burst: Mesh;
  private readonly burstMat: ShaderMaterial;
  private readonly sparks: Points;
  private readonly sparkMat: ShaderMaterial;
  private readonly sparkSize = new Vector2();
  private burstMs = SLAM_MS;

  constructor(keep: Keep) {
    const geo = keep(new BufferGeometry());
    this.at = new BufferAttribute(new Float32Array((TRAIL_N + 1) * 6), 3);
    const uv = new Float32Array((TRAIL_N + 1) * 4);
    for (let i = 0; i <= TRAIL_N; i++) {
      const k = i / TRAIL_N;
      uv[i * 4] = k;
      uv[i * 4 + 1] = 1;
      uv[i * 4 + 2] = k;
      uv[i * 4 + 3] = -1;
    }
    geo.setAttribute('position', this.at);
    geo.setAttribute('aTrail', new BufferAttribute(uv, 2));
    const index: number[] = [];
    for (let i = 0; i < TRAIL_N; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(index);
    this.trailMat = keep(
      new ShaderMaterial({
        ...TRAIL_SHADER,
        uniforms: {
          uCore: { value: new Color(1.25, 1.15, 0.96) },
          uEdge: { value: new Color(0.75, 0.65, 0.5) },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.trail = new Mesh(geo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.trail.renderOrder = 4;

    const swishGeo = keep(new PlaneGeometry(2.8, 2.8).rotateX(-Math.PI / 2));
    this.ringMat = keep(
      new ShaderMaterial({
        ...RIPPLE_SHADER,
        uniforms: { uK: { value: 1 }, uTint: { value: new Color(1.15, 1.12, 1.02) }, uStyle: { value: 0 } },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.ring = new Mesh(swishGeo, this.ringMat);
    this.ring.visible = false;
    this.ring.renderOrder = 4;

    const burstGeo = keep(new PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2));
    this.burstMat = keep(
      new ShaderMaterial({
        ...RIPPLE_SHADER,
        uniforms: { uK: { value: 1 }, uTint: { value: new Color(0.32, 0.22, 0.1) }, uStyle: { value: 1 } },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.burst = new Mesh(burstGeo, this.burstMat);
    this.burst.visible = false;
    this.burst.renderOrder = 4;

    // (the sparks: thrown out round the ring and up, each its own speed and life, falling as they go)
    const sGeo = keep(new BufferGeometry());
    const pos = new Float32Array(SPARK_N * 3);
    const vel = new Float32Array(SPARK_N * 3);
    const seed = new Float32Array(SPARK_N);
    let n = 19;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    for (let i = 0; i < SPARK_N; i++) {
      const a = (i / SPARK_N) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
      const spd = 3.2 + rnd() * 6.5;
      const up = 0.8 + rnd() * 4.2;
      pos.set([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], i * 3);
      vel.set([Math.cos(a) * spd, up, Math.sin(a) * spd], i * 3);
      seed[i] = rnd();
    }
    sGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    sGeo.setAttribute('aVel', new Float32BufferAttribute(vel, 3));
    sGeo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    this.sparkMat = keep(
      new ShaderMaterial({
        ...SPARK_SHADER,
        uniforms: { uT: { value: 1 }, uScale: { value: 400 }, uTint: { value: new Color(1.2, 0.78, 0.3) } },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sparks = new Points(sGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    this.sparks.renderOrder = 5;
    this.sparks.onBeforeRender = (renderer) => void (this.sparkMat.uniforms.uScale.value = renderer.getDrawingBufferSize(this.sparkSize).y / 2);

    this.group.add(this.trail, this.ring, this.burst, this.sparks);
  }

  /** The shot in the air (null: none, and no streak), how far along its flight the ball is (0..1), where the camera stands, and its colour (gold: a three, the clutch). */
  arc(shot: Shot | null, u: number, eye: Vector3, accent: 'plain' | 'gold' = 'plain') {
    this.trail.visible = !!shot && u > 0.02;
    if (!shot || !this.trail.visible) return;
    if (accent === 'gold') {
      (this.trailMat.uniforms.uCore.value as Color).setRGB(1.85, 1.38, 0.62);
      (this.trailMat.uniforms.uEdge.value as Color).setRGB(1.2, 0.64, 0.16);
    } else {
      (this.trailMat.uniforms.uCore.value as Color).setRGB(1.22, 1.16, 1.02);
      (this.trailMat.uniforms.uEdge.value as Color).setRGB(0.68, 0.64, 0.56);
    }
    const [P, Q, T, S] = [A, B, C, D];
    const from = Math.max(0, u - TRAIL_SPAN);
    for (let i = 0; i <= TRAIL_N; i++) {
      const k = i / TRAIL_N;
      const ui = from + (u - from) * k;
      shotAt(shot, ui, P);
      shotAt(shot, Math.min(1, ui + 0.01), Q);
      // (across it: square to its way and to the line from the camera)
      T.subVectors(Q, P);
      S.subVectors(eye, P).cross(T);
      const len = S.length();
      // (thin at its tail, fullest just short of the ball, and a little fuller in gold)
      const wide = TRAIL_WIDE * (accent === 'gold' ? 1.2 : 1) * (0.2 + 0.8 * k) * (1 - 0.55 * k * k * k);
      S.multiplyScalar(len > 1e-6 ? wide / len : 0);
      this.at.setXYZ(i * 2, P.x + S.x, P.y + S.y, P.z + S.z);
      this.at.setXYZ(i * 2 + 1, P.x - S.x, P.y - S.y, P.z - S.z);
    }
    this.at.needsUpdate = true;
  }

  /** A shot has gone through with nothing but the cords: the rings, at that rim (its middle); gold as the arc is, or for a big moment. */
  swish(x: number, y: number, z: number, gold = false) {
    this.ring.position.set(x, y, z);
    (this.ringMat.uniforms.uTint.value as Color).setRGB(gold ? 1.55 : 1.15, gold ? 1.25 : 1.12, gold ? 0.58 : 1.0);
    this.ringMs = 0;
  }

  /** A dunk has gone down: the ring off the rim and its sparks, at that rim (its middle), warm: the iron's colour in it. */
  slam(x: number, y: number, z: number) {
    this.burst.position.set(x, y, z);
    this.sparks.position.set(x, y, z);
    (this.burstMat.uniforms.uTint.value as Color).setRGB(0.32, 0.22, 0.1);
    (this.sparkMat.uniforms.uTint.value as Color).setRGB(1.2, 0.78, 0.3);
    this.burst.scale.setScalar(1);
    this.burstMs = 0;
  }

  /** A shot has been got to: the same ring and sparks at the hand that got it, smaller and cold. */
  block(x: number, y: number, z: number) {
    this.burst.position.set(x, y, z);
    this.sparks.position.set(x, y, z);
    (this.burstMat.uniforms.uTint.value as Color).setRGB(0.26, 0.32, 0.4);
    (this.sparkMat.uniforms.uTint.value as Color).setRGB(1.0, 1.2, 1.45);
    this.burst.scale.setScalar(0.72);
    this.burstMs = 0;
  }

  /** The rings' and the sparks' own time (ms of the picture's clock). */
  tick(ms: number) {
    if (this.burstMs < SLAM_MS) {
      this.burstMs += ms;
      const k = Math.min(1, this.burstMs / SLAM_MS);
      this.burst.visible = k < 1;
      this.sparks.visible = k < 1;
      this.burstMat.uniforms.uK.value = k;
      this.sparkMat.uniforms.uT.value = this.burstMs / 1000;
    } else {
      this.burst.visible = false;
      this.sparks.visible = false;
    }
    if (this.ringMs >= SWISH_MS) {
      this.ring.visible = false;
      return;
    }
    this.ringMs += ms;
    const k = Math.min(1, this.ringMs / SWISH_MS);
    this.ring.visible = k < 1;
    this.ringMat.uniforms.uK.value = k;
    this.ring.position.y -= (ms / 1000) * 3.1;
  }

  /** None of it (the setting off, a replay's cut, a possession over). */
  clear() {
    this.trail.visible = false;
    this.ring.visible = false;
    this.ringMs = SWISH_MS;
    this.burst.visible = false;
    this.sparks.visible = false;
    this.burstMs = SLAM_MS;
  }
}
const [A, B, C, D] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

/**
 * The flashes: each camera in the stands has its own few moments a second to go off in, and at `uRate`
 * that share of them do, for about a twentieth of a second each, a white star a foot or so across that is
 * never smaller than a couple of pixels.
 */
const FLASH = {
  vertexShader: /* glsl */ `
    attribute float aSeed;
    uniform float uTime;
    uniform float uRate;
    uniform float uScale;
    varying float vOn;
    void main() {
      float slot = 0.45 + aSeed * 0.9;
      float k = uTime / slot + aSeed * 37.0;
      float fires = step(fract(sin(floor(k) * 12.9898 + aSeed * 78.233) * 43758.5453), uRate);
      vOn = fires * step(fract(k) * slot, 0.055);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = vOn * clamp(2.0 * projectionMatrix[1][1] * uScale / -mv.z, 3.0, 34.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uDim;
    varying float vOn;
    void main() {
      vec2 c = gl_PointCoord * 2.0 - 1.0;
      float r = length(c);
      float star = (smoothstep(0.12, 0.0, abs(c.x)) + smoothstep(0.12, 0.0, abs(c.y))) * smoothstep(1.0, 0.1, r) * 0.4;
      float a = (smoothstep(0.34, 0.0, r) * 1.4 + exp(-r * r * 7.0) * 0.5 + star) * vOn;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vec3(1.0, 0.97, 0.93) * a * uDim, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class Flashes {
  readonly points: Points;
  private readonly time = { value: 0 };
  private readonly rate = { value: 0 };
  private readonly scale = { value: 400 };
  private readonly dim = { value: 1 };
  private readonly size = new Vector2();
  private readonly count: number;

  /** Cameras at these points in the stands (a face's height over a seat). */
  constructor(keep: Keep, at: number[]) {
    const geo = keep(new BufferGeometry());
    geo.setAttribute('position', new Float32BufferAttribute(at, 3));
    this.count = at.length / 3;
    let n = 5;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    geo.setAttribute('aSeed', new Float32BufferAttribute(Array.from({ length: this.count }, rnd), 1));
    const mat = keep(
      new ShaderMaterial({
        ...FLASH,
        uniforms: { uTime: this.time, uRate: this.rate, uScale: this.scale, uDim: this.dim },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    // (a point's size is in pixels: how many the picture is tall, asked for as it is drawn)
    this.points.onBeforeRender = (renderer) => void (this.scale.value = renderer.getDrawingBufferSize(this.size).y / 2);
  }

  /** How many go off this frame (a share of the cameras, each in its own moment), how much light the stands keep, and how much brighter a flash is drawn (the house lights down: the picture's exposure is down with them). */
  update(real: number, rate: number, dim: number, calm: boolean, boost = 1) {
    this.time.value += real / 1000;
    this.rate.value = calm ? 0 : rate;
    this.dim.value = (0.5 + 0.5 * dim) * boost;
    this.points.visible = !calm && rate > 0.001;
  }

  /** A device that can't keep up: half the cameras. */
  lite(on: boolean) {
    this.points.geometry.setDrawRange(0, on ? Math.floor(this.count / 2) : this.count);
  }
}

/**
 * Confetti: each piece let go at its own height over the floor and the benches, falling at its own speed,
 * drifting and turning over as it goes, and lying flat where it lands. `aDrop` is where it starts (x, z),
 * how high, and its own number.
 */
const CONFETTI_MOVE = /* glsl */ `
  float own = aDrop.w;
  float fall = 3.4 + fract(own * 7.31) * 3.2;
  float t = max(0.0, uT - fract(own * 3.7) * 0.7);
  float land = aDrop.z / fall;
  float tt = min(t, land);
  float ph = own * 40.0;
  vec3 at = vec3(aDrop.x + sin(tt * 1.3 + ph) * 1.5 + tt * 0.2, max(0.03, aDrop.z - tt * fall), aDrop.y + cos(tt * 1.1 + ph * 1.3) * 1.5);
  float spin = tt * (2.5 + fract(own * 5.1) * 4.5) + ph;
  float roll = tt * 1.7 + ph * 0.7;
  vec3 p = position;
  p = vec3(p.x, p.y * cos(spin), p.y * sin(spin));
  p = vec3(p.x * cos(roll) + p.z * sin(roll), p.y, p.z * cos(roll) - p.x * sin(roll));
  vec3 lying = vec3(position.x * cos(ph) - position.y * sin(ph), 0.0, position.x * sin(ph) + position.y * cos(ph));
  vec3 transformed = at + mix(p, lying, step(land, t));
  vSheen = mix(0.45 + 0.55 * abs(cos(spin)), 0.8, step(land, t));`;

/** How many pieces, and how long after the buzzer (ms) they are let go. */
const PIECES = 2600;
const CONFETTI_AFTER = 700;

export class Confetti {
  readonly mesh: InstancedMesh;
  private readonly t = { value: 0 };
  private readonly mat: MeshBasicMaterial;
  /** How much of it comes down (a series' share of a title's), and a slow device's third of that. */
  private much = 1;
  private few = false;

  constructor(keep: Keep) {
    const geo = keep(new PlaneGeometry(0.36, 0.24));
    let n = 3;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    const drop = new Float32Array(PIECES * 4);
    for (let i = 0; i < PIECES; i++) {
      // over the floor, its apron and the benches; some already low when the buzzer goes, the rest from the roof
      drop.set([(rnd() - 0.5) * 118, (rnd() - 0.55) * 70, 16 + rnd() * rnd() * 80, rnd()], i * 4);
    }
    geo.setAttribute('aDrop', new InstancedBufferAttribute(drop, 4));
    this.mat = keep(new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }));
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.t;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aDrop;\nuniform float uT;\nvarying float vSheen;')
        .replace('#include <begin_vertex>', CONFETTI_MOVE);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSheen;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vSheen;');
    };
    this.mat.customProgramCacheKey = () => 'confetti';
    this.mesh = new InstancedMesh(geo, this.mat, PIECES);
    // (each piece is placed by its shader: the instances' own places stay where they are, at the middle)
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    keep(this.mesh);
  }

  /** The winners' colours, their second colour and white, a piece each in turn. */
  colours(fill: string, trim: string) {
    const c = new Color();
    const set = [fill, trim, '#f4f2ec', fill, '#d8d4c8'];
    for (let i = 0; i < PIECES; i++) this.mesh.setColorAt(i, c.set(set[i % set.length]));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** How much of it comes down this time (1: all of it). */
  share(much: number) {
    if (much === this.much) return;
    this.much = much;
    this.count();
  }

  /** It has been let go (ms since the buzzer; under 0: nothing in the air). */
  update(won: number, dim: number, calm: boolean) {
    const on = !calm && won >= CONFETTI_AFTER;
    this.mesh.visible = on;
    if (!on) return;
    this.t.value = (won - CONFETTI_AFTER) / 1000;
    this.mat.color.setScalar(0.55 + 0.45 * dim);
  }

  /** A device that can't keep up: a third of the pieces. */
  lite(on: boolean) {
    this.few = on;
    this.count();
  }

  private count() {
    this.mesh.count = Math.floor((PIECES * this.much) / (this.few ? 3 : 1));
  }
}

/**
 * Streamers: long strips of paper let go from the roof with the confetti, each uncurling as it falls,
 * swinging, and lying where it lands. A strip is a run of points down its length (position y: 0 its
 * head to 1 its tail, x across it); `aDrop` is where it starts (x, z), how high, and its own number.
 */
const STREAMER_MOVE = /* glsl */ `
  float own = aDrop.w;
  float fall = 5.5 + fract(own * 7.31) * 4.0;
  float len = 9.0 + fract(own * 3.3) * 9.0;
  float t = max(0.0, uT - 0.4 - fract(own * 5.7) * 2.6);
  float ph = own * 50.0;
  // (its head leads; the rest of it follows the same way down, a moment behind for every foot of it)
  float tt = max(0.0, t - position.y * len / fall);
  float y = max(0.05 + fract(own * 9.1) * 0.05, aDrop.z - tt * fall);
  float air = step(0.2, y);
  float curl = sin(tt * 3.1 + ph + position.y * 5.0) * 1.3 * air;
  vec3 at = vec3(aDrop.x + sin(tt * 0.9 + ph) * 2.2 + curl, y, aDrop.y + cos(tt * 0.8 + ph * 1.7) * 2.2 + cos(tt * 2.7 + ph + position.y * 4.0) * 1.1 * air);
  // (on the floor it lies along its own line, a little bent)
  vec2 lie = vec2(cos(ph), sin(ph));
  at.xz += (1.0 - air) * (lie * position.y * len * 0.6 + vec2(-lie.y, lie.x) * sin(position.y * 6.0 + ph) * 0.7);
  float turn = tt * 4.0 + ph + position.y * 7.0;
  vec3 transformed = at + vec3(cos(turn) * air + (1.0 - air) * -lie.y, 0.0, sin(turn) * air + (1.0 - air) * lie.x) * position.x * 0.22;
  vSheen = (0.5 + 0.5 * abs(cos(turn * 0.7))) * step(0.0001, t);`;

const STREAMERS = 150;

export class Streamers {
  readonly mesh: InstancedMesh;
  private readonly t = { value: 0 };
  private readonly mat: MeshBasicMaterial;
  private off = false;

  constructor(keep: Keep) {
    const geo = keep(new PlaneGeometry(1, 1, 1, 14));
    geo.translate(0, 0.5, 0);
    let n = 13;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    const drop = new Float32Array(STREAMERS * 4);
    for (let i = 0; i < STREAMERS; i++) drop.set([(rnd() - 0.5) * 110, (rnd() - 0.5) * 62, 55 + rnd() * 35, rnd()], i * 4);
    geo.setAttribute('aDrop', new InstancedBufferAttribute(drop, 4));
    this.mat = keep(new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }));
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = this.t;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aDrop;\nuniform float uT;\nvarying float vSheen;')
        .replace('#include <begin_vertex>', STREAMER_MOVE);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSheen;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vSheen <= 0.0) discard;\ndiffuseColor.rgb *= vSheen;');
    };
    this.mat.customProgramCacheKey = () => 'streamer';
    this.mesh = new InstancedMesh(geo, this.mat, STREAMERS);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    keep(this.mesh);
  }

  /** The winners' colours and white, a strip each in turn. */
  colours(fill: string, trim: string) {
    const c = new Color();
    const set = [fill, '#f4f2ec', trim, fill];
    for (let i = 0; i < STREAMERS; i++) this.mesh.setColorAt(i, c.set(set[i % set.length]));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** They have been let go (ms since the buzzer; under 0: nothing in the air). */
  update(won: number, dim: number, calm: boolean) {
    const on = !calm && !this.off && won >= CONFETTI_AFTER;
    this.mesh.visible = on;
    if (!on) return;
    this.t.value = (won - CONFETTI_AFTER) / 1000;
    this.mat.color.setScalar(0.55 + 0.45 * dim);
  }

  /** A device that can't keep up: none. */
  lite(on: boolean) {
    this.off = on;
  }
}

/**
 * Where a spot's beam lands on the floor at a time: each sweeps its own slow figure over the court, now
 * and then all of them coming in to the middle of it together.
 */
const SPOT_AT = /* glsl */ `
  uniform float uTime;
  attribute vec3 aFrom;
  attribute float aSeed;
  vec3 spotAt() {
    float t = uTime * (0.5 + 0.25 * aSeed);
    float ph = aSeed * 31.0;
    vec2 own = vec2(sin(t * 0.83 + ph) * 44.0 + sin(t * 0.37 + ph * 2.0) * 10.0, cos(t * 0.61 + ph * 1.3) * 22.0);
    float gather = smoothstep(0.7, 0.98, sin(uTime * 0.31));
    vec2 ring = vec2(cos(ph + uTime * 0.6), sin(ph + uTime * 0.6)) * (9.0 + 9.0 * fract(aSeed * 7.0));
    vec2 at = mix(own, ring, gather);
    return vec3(at.x, 0.06, at.y);
  }`;
/** The beam: a strip from the lamp to where it lands, turned to face the camera, narrow at the lamp and wide at the floor; bright down its middle and near the lamp, fading out. */
const BEAM = {
  vertexShader: /* glsl */ `
    ${SPOT_AT}
    attribute vec3 aTint;
    varying vec2 vAt;
    varying vec3 vTint;
    void main() {
      vec3 to = spotAt();
      vec3 along = to - aFrom;
      vec3 p = aFrom + along * position.y;
      vec3 side = normalize(cross(along, cameraPosition - p));
      p += side * position.x * mix(0.5, 5.0, position.y);
      vAt = vec2(position.x * 2.0, position.y);
      vTint = aTint;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uOn;
    uniform float uBoost;
    varying vec2 vAt;
    varying vec3 vTint;
    void main() {
      float across = 1.0 - abs(vAt.x);
      float a = across * across * (0.26 * exp(-vAt.y * 2.3) + 0.048) * smoothstep(1.0, 0.86, vAt.y) * uOn;
      gl_FragColor = vec4(vTint * a * uBoost, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
/** The pool of light where a beam lands: soft-edged, brightest in the middle. */
const SPOT_POOL = {
  vertexShader: /* glsl */ `
    ${SPOT_AT}
    attribute vec3 aTint;
    varying vec2 vAt;
    varying vec3 vTint;
    void main() {
      vec3 to = spotAt();
      // (drawn out a little along the way the light comes: it falls at a slant)
      vec2 lean = normalize(to.xz - aFrom.xz + 0.001);
      vec2 at = to.xz + lean * position.x * 8.5 + vec2(-lean.y, lean.x) * position.z * 6.5;
      vAt = vec2(position.x, position.z) * 2.0;
      vTint = aTint;
      gl_Position = projectionMatrix * viewMatrix * vec4(at.x, to.y, at.y, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uOn;
    uniform float uBoost;
    varying vec2 vAt;
    varying vec3 vTint;
    void main() {
      float t = 1.0 - min(1.0, length(vAt));
      gl_FragColor = vec4(vTint * t * t * (3.0 - 2.0 * t) * 0.22 * uOn * uBoost, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
/** A lamp's own glare, seen from wherever: a point that is never smaller than a few pixels. */
const GLARE = {
  vertexShader: /* glsl */ `
    uniform float uScale;
    uniform float uOn;
    attribute vec3 aTint;
    varying vec3 vTint;
    void main() {
      vTint = aTint;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uOn * clamp(3.0 * projectionMatrix[1][1] * uScale / -mv.z, 4.0, 30.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uOn;
    uniform float uBoost;
    varying vec3 vTint;
    void main() {
      float r = length(gl_PointCoord * 2.0 - 1.0);
      float a = smoothstep(0.3, 0.0, r) * 1.6 + exp(-r * r * 6.0) * 0.5;
      if (a < 0.004) discard;
      gl_FragColor = vec4(mix(vTint, vec3(1.0), 0.5) * a * uOn * uBoost, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export class Show {
  readonly group = new Group();
  private readonly u = { uTime: { value: 0 }, uOn: { value: 0 }, uBoost: { value: 1 }, uScale: { value: 400 } };
  private readonly size = new Vector2();
  private readonly tints: Float32Array;
  private off = false;

  /** A spot at each of these places in the roof. */
  constructor(keep: Keep, at: Vector3[]) {
    const n = at.length;
    let k = 17;
    const rnd = () => ((k = (k * 16807) % 2147483647) & 0xffff) / 0xffff;
    const from = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    this.tints = new Float32Array(n * 3);
    at.forEach((p, i) => {
      from.set([p.x, p.y, p.z], i * 3);
      seed[i] = rnd();
      this.tints.set([1, 0.96, 0.9], i * 3);
    });
    const each = (geo: BufferGeometry, per: boolean) => {
      const A = per ? InstancedBufferAttribute : Float32BufferAttribute;
      geo.setAttribute('aFrom', new A(from, 3));
      geo.setAttribute('aSeed', new A(seed, 1));
      geo.setAttribute('aTint', new A(this.tints, 3));
      return geo;
    };
    const look = (shader: { vertexShader: string; fragmentShader: string }) =>
      keep(new ShaderMaterial({ ...shader, uniforms: this.u, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    const strip = keep(new PlaneGeometry(1, 1, 1, 1));
    strip.translate(0, 0.5, 0);
    const beams = keep(new InstancedMesh(each(strip, true), look(BEAM), n));
    const disc = keep(new PlaneGeometry(1, 1));
    disc.rotateX(-Math.PI / 2);
    const pools = keep(new InstancedMesh(each(disc, true), look(SPOT_POOL), n));
    const lamps = keep(new BufferGeometry());
    lamps.setAttribute('position', new Float32BufferAttribute(from, 3));
    const glare = new Points(each(lamps, false), look(GLARE));
    glare.onBeforeRender = (renderer) => void (this.u.uScale.value = renderer.getDrawingBufferSize(this.size).y / 2);
    for (const o of [pools, beams, glare]) {
      o.frustumCulled = false;
      o.renderOrder = 5;
      this.group.add(o);
    }
    this.group.visible = false;
  }

  /** The spots' colours: white, and every third the home side's. */
  colours(fill: string) {
    const c = new Color(fill).lerp(new Color('#ffffff'), 0.25);
    for (let i = 1; i < this.tints.length / 3; i += 3) this.tints.set([c.r * 1.3, c.g * 1.3, c.b * 1.3], i * 3);
    for (const o of this.group.children) (o as InstancedMesh).geometry.getAttribute('aTint').needsUpdate = true;
  }

  /** How far the show is on (0 to 1), and how much of the picture's exposure the house lights have left (the spots are drawn that much brighter, to stay as bright). */
  update(real: number, on: number, house: number) {
    this.u.uTime.value += real / 1000;
    this.u.uOn.value = on;
    this.u.uBoost.value = 1 / house;
    this.group.visible = !this.off && on > 0.01;
  }

  /** A device that can't keep up: no show. */
  lite(on: boolean) {
    this.off = on;
  }
}
