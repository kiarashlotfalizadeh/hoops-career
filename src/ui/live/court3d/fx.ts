// What goes off in the building at a big moment: cameras and phones flashing in the stands (a late free
// throw, a dunk, the buzzer), confetti and streamers from the roof for a title (in the champions' colours)
// and a little of it when the home side wins a series, and the
// light show while the house lights are down (the open, a timeout, a home win): the roof's spots
// sweeping the floor, each a beam through the air, a pool of light where it lands and the lamp's own
// glare. Each is one draw, made up in its shader from a time and a few numbers a piece: nothing is moved
// from here frame by frame. Under reduced motion none of it happens (a flash is a flash).
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Color,
  Vector2,
  type Vector3,
} from 'three';

type Keep = <T extends { dispose(): void }>(o: T) => T;

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
      float a = across * across * (0.2 * exp(-vAt.y * 2.6) + 0.035) * smoothstep(1.0, 0.86, vAt.y) * uOn;
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
      gl_FragColor = vec4(vTint * t * t * (3.0 - 2.0 * t) * 0.16 * uOn * uBoost, 1.0);
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
