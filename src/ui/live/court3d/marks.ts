// What the broadcast paints on the floor to say who is who: a ring under the man with the ball (a wash
// of his team's colour inside a fine white line), which turns to the warning colour and beats once a
// second when the shot clock is running out; and a plain fine ring under a man the user tapped. Two
// small flat meshes each, drawn over the floor and under the bodies.
import { CircleGeometry, Color, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';

type Keep = <T extends { dispose(): void }>(o: T) => T;

/** The ring's line (ft from his middle), and the wash inside it. */
const IN = 1.62;
const OUT = 1.78;
/** The shot clock under this (s) is late: the ring says so. */
export const SHOT_LATE = 5;

interface Mark {
  line: Mesh;
  wash: Mesh;
  beat: Mesh;
  lineMat: MeshBasicMaterial;
  washMat: MeshBasicMaterial;
  beatMat: MeshBasicMaterial;
  /** How much of it shows (eased: it comes up under a man, it doesn't pop). */
  a: number;
}

const WHITE = new Color('#ffffff');
const C = new Color();

export class Marks {
  readonly group = new Group();
  private readonly marks: Mark[] = [];
  private t = 0;

  constructor(keep: Keep) {
    const line = keep(new RingGeometry(IN, OUT, 48));
    line.rotateX(-Math.PI / 2);
    const wash = keep(new CircleGeometry(IN, 40));
    wash.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const mat = () => keep(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      const m: Mark = { lineMat: mat(), washMat: mat(), beatMat: mat(), line: null!, wash: null!, beat: null!, a: 0 };
      m.line = new Mesh(line, m.lineMat);
      m.wash = new Mesh(wash, m.washMat);
      m.beat = new Mesh(line, m.beatMat);
      for (const o of [m.wash, m.line, m.beat]) {
        o.renderOrder = 4;
        o.visible = false;
        this.group.add(o);
      }
      this.marks.push(m);
    }
  }

  /** The clock the late ring beats on (ms on). */
  tick(real: number) {
    this.t += real;
  }

  /**
   * Mark `i` (0: the man with the ball, 1: the man tapped) under (x, z), or nowhere (`on` false). `color`:
   * his team's (the wash; none for a tapped man); `late`: 0..1 as the shot clock runs out; `warn`: its colour.
   */
  put(i: 0 | 1, on: boolean, x: number, z: number, real: number, color: string | null = null, late = 0, warn = '#ffc65c', calm = false) {
    const m = this.marks[i];
    m.a = calm ? (on ? 1 : 0) : m.a + ((on ? 1 : 0) - m.a) * (1 - Math.exp(-real / (on ? 110 : 70)));
    const show = m.a > 0.02;
    m.line.visible = show;
    m.wash.visible = show && !!color;
    m.beat.visible = show && late > 0 && !calm;
    if (!show) return;
    if (on) {
      for (const o of [m.line, m.wash, m.beat]) o.position.set(x, 0.05, z);
      m.line.position.y = 0.055;
    }
    m.lineMat.color.copy(WHITE).lerp(C.set(warn), late);
    m.lineMat.opacity = (i ? 0.7 : 0.92) * m.a;
    if (color) {
      m.washMat.color.set(color).lerp(C.set(warn), late * 0.8);
      m.washMat.opacity = (0.3 + 0.12 * late) * m.a;
    }
    if (m.beat.visible) {
      // (once a second, a ring goes out from his own and fades)
      const u = (this.t % 1000) / 1000;
      m.beat.scale.setScalar(1 + 0.55 * u);
      m.beatMat.color.set(warn);
      m.beatMat.opacity = 0.8 * (1 - u) * (1 - u) * late * m.a;
    }
  }
}
