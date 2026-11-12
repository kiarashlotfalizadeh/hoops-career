// What goes off in the building at a big moment: cameras and phones flashing in the stands (a late free
// throw, a dunk, the buzzer), and confetti from the roof when the home side wins. Each is one draw, made
// up in its shader from a time and a few numbers a piece: nothing is moved from here frame by frame.
// Under reduced motion neither happens (a flash is a flash).
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Color,
  Vector2,
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

  /** How many go off this frame (a share of the cameras, each in its own moment), and how much light the stands keep. */
  update(real: number, rate: number, dim: number, calm: boolean) {
    this.time.value += real / 1000;
    this.rate.value = calm ? 0 : rate;
    this.dim.value = 0.5 + 0.5 * dim;
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

  /** The home side's colours, its second colour and white, a piece each in turn. */
  colours(fill: string, trim: string) {
    const c = new Color();
    const set = [fill, trim, '#f4f2ec', fill, '#d8d4c8'];
    for (let i = 0; i < PIECES; i++) this.mesh.setColorAt(i, c.set(set[i % set.length]));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** The home side has won (ms since the buzzer; under 0: no win, nothing in the air). */
  update(won: number, dim: number, calm: boolean) {
    const on = !calm && won >= CONFETTI_AFTER;
    this.mesh.visible = on;
    if (!on) return;
    this.t.value = (won - CONFETTI_AFTER) / 1000;
    this.mat.color.setScalar(0.55 + 0.45 * dim);
  }

  /** A device that can't keep up: a third of the pieces. */
  lite(on: boolean) {
    this.mesh.count = on ? Math.floor(PIECES / 3) : PIECES;
  }
}
