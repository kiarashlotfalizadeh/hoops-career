// What the broadcast paints on the floor to say who is who: a ring under the man with the ball (a wash of his
// team's colour coming up toward a fine white line, and a mark just outside it the way he faces), which turns to
// the warning colour as the shot clock runs out, with an arc round it for what is left and a ring going out from
// it once a second; a gold shine going round it when he is hot. And a plain fine ring under a man the user tapped.
// One flat square each, its shader drawing all of it, over the floor and under the bodies.
import { Color, Group, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

type Keep = <T extends { dispose(): void }>(o: T) => T;

/** The shot clock under this (s) is late: the ring says so. */
export const SHOT_LATE = 5;

const MARK_SIZE = 5.6;

const MARK_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uWarn;
    uniform float uAlpha;
    uniform float uLate;
    uniform float uClockFrac;
    uniform float uHot;
    uniform float uYaw;
    uniform float uTime;
    uniform float uKind;
    uniform float uCalm;
    varying vec2 vUv;

    void main() {
      // (where on the floor this is from his middle, ft: the square is laid flat, its v running against the floor's z)
      vec2 p = vec2(vUv.x - 0.5, -(vUv.y - 0.5)) * ${MARK_SIZE.toFixed(1)};
      float r = length(p);
      float aa = max(fwidth(r) * 1.15, 0.025);

      if (uKind > 0.5) {
        // (a man tapped: a fine ring, and four short ticks out from it on the diagonals)
        float ring = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, abs(r - 1.7));
        float ang = atan(p.y, p.x);
        float diag = abs(sin(ang * 2.0));
        float ticks = smoothstep(0.94, 0.99, diag) * smoothstep(1.72, 1.76, r) * (1.0 - smoothstep(2.0, 2.06, r));
        float a = (ring * 0.78 + ticks * 0.65) * uAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(1.0), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        return;
      }

      // (the man with the ball: the way he faces, and square to it)
      vec2 fwd = vec2(sin(uYaw), cos(uYaw));
      vec2 right = vec2(fwd.y, -fwd.x);
      float pf = dot(p, fwd);
      float pr = abs(dot(p, right));

      vec3 hotGold = vec3(1.0, 0.78, 0.3);
      vec3 baseTone = mix(uColor, uWarn, uLate * 0.72);
      vec3 ringTone = mix(mix(vec3(1.0), hotGold, uHot * 0.65), uWarn, uLate);

      // (his team's colour, coming up toward the ring: none at his feet, where his shadow is)
      float innerFade = smoothstep(0.75, 1.56, r);
      float outerCut = 1.0 - smoothstep(1.66, 1.74, r);
      float aura = innerFade * innerFade * outerCut * (0.34 + 0.1 * uLate + 0.1 * uHot);
      // (and a little of it just outside the ring)
      float skirt = exp(-pow(max(0.0, r - 1.72) / 0.34, 2.0)) * step(1.64, r) * (0.14 + 0.12 * uHot + 0.14 * uLate);

      // (the ring)
      float ringW = 0.068 + 0.014 * uLate;
      float ring = 1.0 - smoothstep(ringW - aa, ringW + aa, abs(r - 1.72));
      // (hot: a shine going round it; none under reduced motion)
      float ang = atan(dot(p, right), pf);
      float gleam = uHot * (1.0 - uCalm) * (0.5 + 0.5 * cos(ang * 2.0 - uTime * 3.4));
      ringTone += vec3(0.35, 0.25, 0.08) * gleam * 0.65;

      // (a mark just outside it, the way he faces)
      float tip = 2.26;
      float chevEdge = (tip - pf) * 0.64 - pr;
      float chevIn = (tip - 0.19 - pf) * 0.64 - pr;
      float chev = smoothstep(-aa, aa, chevEdge) * (1.0 - smoothstep(-aa, aa, chevIn)) * smoothstep(1.86, 1.94, pf);

      // (the shot clock late: an arc round it for what is left, and a ring going out from his own once a second)
      float clockArc = 0.0;
      float beat = 0.0;
      if (uLate > 0.01) {
        float frac = clamp(uClockFrac, 0.0, 1.0);
        // (round from the way he faces)
        float sweep = fract(ang / 6.2831853 + 1.0);
        float inArc = step(sweep, frac);
        float arcBand = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, abs(r - 2.02));
        clockArc = arcBand * inArc * uLate * 0.92;
        if (uCalm < 0.5) {
          float pulseU = fract(uTime);
          float pulseR = 1.72 + 0.92 * pulseU;
          float pulseRing = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, abs(r - pulseR));
          beat = pulseRing * (1.0 - pulseU) * (1.0 - pulseU) * uLate * 0.78;
        }
      }

      // (all of it at once: its colour as bright as its parts, however little of it shows)
      vec3 col = baseTone * (aura + skirt) + ringTone * (ring * 0.94 + chev * 0.92) + uWarn * (clockArc + beat);
      float a = clamp(aura + skirt + ring * 0.94 + chev * 0.9 + clockArc + beat, 0.0, 0.96) * uAlpha;
      if (a < 0.004) discard;
      gl_FragColor = vec4(col / max(a / max(uAlpha, 1e-3), 0.25), a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

interface Mark {
  mesh: Mesh;
  mat: ShaderMaterial;
  /** How much of it shows (eased: it comes up under a man, it doesn't pop). */
  a: number;
  /** The way he faces, eased: the mark outside the ring turns, it doesn't jump. */
  yaw: number;
  hasYaw: boolean;
}

const WHITE = new Color('#ffffff');

export class Marks {
  readonly group = new Group();
  private readonly marks: Mark[] = [];
  private t = 0;

  constructor(keep: Keep) {
    const geo = keep(new PlaneGeometry(MARK_SIZE, MARK_SIZE));
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const mat = keep(
        new ShaderMaterial({
          ...MARK_SHADER,
          uniforms: {
            uColor: { value: WHITE.clone() },
            uWarn: { value: new Color('#ffc65c') },
            uAlpha: { value: 0 },
            uLate: { value: 0 },
            uClockFrac: { value: 1 },
            uHot: { value: 0 },
            uYaw: { value: 0 },
            uTime: { value: 0 },
            uKind: { value: i },
            uCalm: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      );
      const mesh = new Mesh(geo, mat);
      mesh.renderOrder = 4;
      mesh.visible = false;
      this.group.add(mesh);
      this.marks.push({ mesh, mat, a: 0, yaw: 0, hasYaw: false });
    }
  }

  /** The clock the late ring beats on (ms on). */
  tick(real: number) {
    this.t += real;
  }

  /**
   * Mark `i` (0: the man with the ball, 1: the man tapped) under (x, z), or nowhere (`on` false). `color`:
   * his team's (the wash; none for a tapped man); `late`: 0..1 as the shot clock runs out; `warn`: its colour; `yaw`: the
   * way he faces (as the figures turn); `clockFrac`: what is left of the late clock, 1 to 0; `hot`: a hot hand.
   */
  put(i: 0 | 1, on: boolean, x: number, z: number, real: number, color: string | null = null, late = 0, warn = '#ffc65c', calm = false, yaw = 0, clockFrac = 1, hot = false) {
    const m = this.marks[i];
    m.a = calm ? (on ? 1 : 0) : m.a + ((on ? 1 : 0) - m.a) * (1 - Math.exp(-real / (on ? 110 : 70)));
    const show = m.a > 0.02;
    m.mesh.visible = show;
    if (!show) {
      m.hasYaw = false;
      return;
    }
    if (on) {
      m.mesh.position.set(x, 0.048, z);
      if (!m.hasYaw || calm) {
        m.yaw = yaw;
        m.hasYaw = true;
      } else {
        const diff = Math.atan2(Math.sin(yaw - m.yaw), Math.cos(yaw - m.yaw));
        m.yaw += diff * (1 - Math.exp(-real / 85));
      }
    }
    const u = m.mat.uniforms;
    (u.uColor.value as Color).set(color ?? '#ffffff');
    (u.uWarn.value as Color).set(warn);
    u.uAlpha.value = m.a;
    u.uLate.value = late;
    u.uClockFrac.value = clockFrac;
    u.uHot.value = hot ? 1 : 0;
    u.uYaw.value = m.yaw;
    u.uTime.value = this.t / 1000;
    u.uCalm.value = calm ? 1 : 0;
  }
}
