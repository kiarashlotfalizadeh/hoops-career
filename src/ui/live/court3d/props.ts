// The building's props as Blender made them (models/arena.glb, from scripts/blender/arena.py): the basket
// unit with its rim and net, a bench chair, the scorer's table, the ball, the scoreboard, the spectators
// the crowd is made of and a seat in the stands. Here each becomes three.js objects with the app's own materials (a
// part is told apart by the name Blender gave its material); the scene places them. Every part carries
// a baked shade (its `color`): the lit materials multiply it in. The faces that show a picture (the
// clocks over the boards, the scoreboard's screens and ring) are given their map here, from where their
// points are: the build keeps a uv only for the parts painted in Blender's own files.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { blob, leather, lights, pane, pebbles } from './ballskin';
import { placed, type Thing } from './glb';
import { cordIndex, cords as cordPoints, CORD_SIDES, NET, NetSim } from './net';

type Keep = <T extends { dispose(): void }>(o: T) => T;

export interface Props {
  /**
   * One basket unit built for the low end (rim over the origin, facing +x); the caller places and turns it. rim and net are
   * children placed at y = 10 that the caller animates. `swish` is how the net's cords are pulled this frame: x down its
   * length (1: stretched by a ball going through, under 0: flicked back up), y wider at its foot, z swung toward the floor.
   * `live` is the same net as cord that moves (net.ts): its knots are in the unit's frame less the rim's height, `draw` puts
   * its cords where the knots are; the caller shows it or `net`, never both.
   */
  basket(): { group: Group; rim: Object3D; net: Object3D; swish: Vector3; live: { sim: NetSim; mesh: Object3D; draw(): void } };
  /** Chairs at these places (y is the floor there), each turned `turn` radians about y; one InstancedMesh per material. `seat` is the padding's material (the caller owns and recolours it; with `vertexColors` on, it takes the baked shade). */
  chairs(at: { x: number; y: number; z: number; turn: number }[], seat: Material): Object3D;
  /** The scorer's table (34 ft along x, on the floor, its front toward +z); `board` is the caller's material for its LED front, whose uv runs 0..1 left to right and bottom to top. */
  table(board: Material): Object3D;
  /** The ball (a Group whose origin is its centre), in these colours. */
  ball(fill: string, seam: string): Object3D;
  /** The dark under the ball where it meets the floor (a flat round, a foot across, on y = 0): the caller places, sizes and fades it. */
  ballShadow(): Mesh;
  /**
   * A scoreboard of a `kind` (its origin is its centre; its cables go 12 ft up from there); `ribbon` is the caller's
   * material for its ring (u twice round it, v up its outside and its inside), `screens` for its screens (u across each as
   * you face it, v up it, the same picture on each; the screen underneath and the edges of the screens show the
   * picture's bottom row).
   */
  scoreboard(ribbon: Material, screens: Material, kind?: BoardKind): Object3D;
  /**
   * The spectators (each sat on y = 0 facing +z, his feet on his own step, 1.3 under him): the shapes the crowd is drawn
   * from. `near` are the people of the rows by the floor (under a thousand triangles each) and `kid` a child among them, `mid` those of the rows behind, `low` one of some 140 triangles (a slow device's),
   * `far` anyone as a trunk and a head, for where he is only a blur. His arms hang; `aPart` says which of a shape's points are trunk (0),
   * head (1), arms (2, 3) and legs (4); a quarter more is skin or an end with its own colour (a neck, hair, a bare arm, a shoe), a
   * half more a cap. `color` is the baked shade. `stall` is the seat (on its step at y = 0).
   */
  crowd(): { near: BufferGeometry[]; kid: BufferGeometry; mid: BufferGeometry[]; low: BufferGeometry; far: BufferGeometry; stall: BufferGeometry };
  /** The hoop's pads that take the home colour: the caller sets this material's colour. */
  readonly team: MeshStandardMaterial;
  /** The faces of the clocks over each board (u across as you face it, from the floor or from behind; v up): the caller lights them. */
  readonly clock: MeshBasicMaterial;
  /** The strip of lights round each board (ballskin.ts `lit` turns them on). */
  readonly led: MeshBasicMaterial;
  /** The stanchions' badge, on each side of the base and its front (BADGE wide by BADGE_H, transparent): the caller paints its canvas and flags it. */
  readonly badge: CanvasTexture;
}

/** The badge's canvas (dots), and its size on the base's sides and front (ft, wide by high). */
export const BADGE = 512;
export const BADGE_H = 168;
const BADGE_SIDE: [number, number] = [4.5, 1.48];
const BADGE_FRONT: [number, number] = [2.9, 0.95];
/** A knot in the live net (ft, from its middle to its points: arena.py KNOT). */
const KNOT_R = 0.026;
/**
 * A cord's braid: its strands cross it every this many ft, a little darker between (seen only near: it is
 * gone before it could shimmer).
 */
const BRAID = 0.032;
const BRAID_VERT = /* glsl */ `
  vBraid = position.y + 0.4 * (position.x + position.z);
  #include <project_vertex>`;
const BRAID_FRAG = /* glsl */ `
  #include <color_fragment>
  {
    float strand = 0.5 + 0.5 * sin(vBraid * ${((2 * Math.PI) / BRAID).toFixed(3)});
    diffuseColor.rgb *= mix(1.0, 0.8 + 0.2 * strand, 1.0 - smoothstep(0.3, 0.6, fwidth(vBraid) / ${BRAID}));
  }`;
/** The net's cords braided (and `more`, the vertex shader's other changes). */
function braided(mat: MeshStandardMaterial, key: string, more: (vs: string) => string = (vs) => vs, uniforms: Record<string, { value: unknown }> = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = more(sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vBraid;').replace('#include <project_vertex>', BRAID_VERT));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBraid;').replace('#include <color_fragment>', BRAID_FRAG);
  };
  mat.customProgramCacheKey = () => key;
}

/** What a game ball's leather and its seams are taken toward (see ball). */
const TAN = new Color(0xa4491b);
const PITCH = new Color(0x0b0a09);
/** How high the rim is over the floor. */
const RIM_H = 10;
/** How long the net hangs below the ring (ft): how far down it a cord's point is says how much of a pull it takes. */
const NET_LEN = 1.36;
/** The net's cords, pulled: all of it at the foot, none at the loops on the ring. */
const NET_PULL = /* glsl */ `
  #include <begin_vertex>
  {
    float down = clamp(-position.y / ${NET_LEN}, 0.0, 1.0);
    float foot = down * down;
    transformed.y -= uSwish.x * foot * 0.62;
    transformed.xz *= 1.0 + down * uSwish.y - foot * 0.16 * max(uSwish.x, 0.0);
    transformed.x += uSwish.z * foot;
  }`;
/**
 * A uv for each point of a shape from where it is: `at` gives it (u, v), or null for one on a face that shows
 * nothing (it gets the picture's bottom left corner, which a picture here leaves dark).
 */
function mapped(geo: BufferGeometry, at: (p: Vector3, n: Vector3) => [number, number] | null) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const got = at(p, n) ?? [0.001, 0.001];
    uv[i * 2] = got[0];
    uv[i * 2 + 1] = got[1];
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** The clocks' faces (in the hoop's frame: the floor is toward +x), read the right way round from in front and from behind. */
function clockMap(geo: BufferGeometry) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  mapped(geo, (p, n) => {
    if (Math.abs(n.x) < 0.7) return null;
    const across = (p.z - b.min.z) / (b.max.z - b.min.z);
    return [n.x > 0 ? 1 - across : across, (p.y - b.min.y) / (b.max.y - b.min.y)];
  });
}

/**
 * The scoreboard's screens: each of the four leaning faces gets the whole picture, u across it as you face it (by
 * its widest, the top: the narrower foot shows a little less of the sides), v from its foot to its top; the
 * screen underneath, and the thin edges, the picture's bottom row (its foot).
 */
function screenMap(geo: BufferGeometry, under: number) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const p = new Vector3();
  const n = new Vector3();
  // first how wide and tall each face is: its way out, quartered
  const span = new Map<number, { half: number; lo: number; hi: number }>();
  const which = (q: Vector3, m: Vector3) => (q.y < under || Math.abs(m.y) > 0.8 ? null : ((Math.round(Math.atan2(m.z, m.x) / (Math.PI / 2)) % 4) + 4) % 4);
  const across = (q: Vector3, m: Vector3) => {
    const l = Math.hypot(m.x, m.z) || 1;
    // (to your right as you face it: out of it, turned a quarter)
    return (q.x * m.z - q.z * m.x) / l;
  };
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const k = which(p, n);
    if (k === null) continue;
    const s = span.get(k) ?? { half: 0, lo: Infinity, hi: -Infinity };
    s.half = Math.max(s.half, Math.abs(across(p, n)));
    s.lo = Math.min(s.lo, p.y);
    s.hi = Math.max(s.hi, p.y);
    span.set(k, s);
  }
  mapped(geo, (q, m) => {
    const k = which(q, m);
    const s = k === null ? undefined : span.get(k);
    if (!s) return [0.5, 0.004];
    return [0.5 + across(q, m) / (2 * s.half), 0.014 + (0.986 * (q.y - s.lo)) / (s.hi - s.lo)];
  });
}

/**
 * The ring under the scoreboard, as a run of ribbon: u twice round it (its points split where it comes back round,
 * or the last strip would squeeze the whole picture in), v up its outside and its inside (the picture turned round
 * there); its top and underside show the picture's bottom row.
 */
function ringMap(geo: BufferGeometry): BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  flat.computeBoundingBox();
  const b = flat.boundingBox!;
  const pos = flat.getAttribute('position');
  const nor = flat.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const p = new Vector3();
  const n = new Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    const us: number[] = [];
    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, t + k);
      // (clockwise seen from above: left to right as you look at it from outside)
      us.push(((2 - Math.atan2(p.z, p.x) / Math.PI) % 2) * RING_TURNS * 0.5);
    }
    // (a strip across the seam: its points on the far side of it are carried on round)
    if (Math.max(...us) - Math.min(...us) > RING_TURNS / 2) for (let k = 0; k < 3; k++) if (us[k] < RING_TURNS / 2) us[k] += RING_TURNS;
    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, t + k);
      n.fromBufferAttribute(nor, t + k);
      const facing = (n.x * p.x + n.z * p.z) / Math.hypot(p.x, p.z);
      const side = Math.abs(n.y) < 0.5 && Math.abs(facing) > 0.5;
      // (its inside is seen from across it: the picture turned round, to read left to right from there too)
      uv[(t + k) * 2] = facing < 0 ? RING_TURNS - us[k] : us[k];
      uv[(t + k) * 2 + 1] = side ? (p.y - b.min.y) / (b.max.y - b.min.y) : 0.004;
    }
  }
  flat.setAttribute('uv', new BufferAttribute(uv, 2));
  return flat;
}

/** The scoreboards' kinds (teamColors.ts Roofing.board), and each one's model in arena.glb (arena.py BOARDS). */
export const BOARD_KINDS = ['four', 'halo', 'slim', 'long'] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
const BOARD_MODELS: Record<BoardKind, string> = { four: 'scoreboard', halo: 'scoreboardHalo', slim: 'scoreboardSlim', long: 'scoreboardLong' };
/** The screens' points under this height (ft from the scoreboard's middle) are the screen underneath it (a long one's side screens come down further). */
const UNDER_Y: Record<BoardKind, number> = { four: -4, halo: -4, slim: -4, long: -7 };
/** How many times the ribbon's picture goes round the ring. */
const RING_TURNS = 2;

/** The parts of the basket unit that throw no shadow: the glass lets the light through, the clock's face lies on its box. */
const NO_SHADOW = new Set(['glass', 'clock', 'led', 'glassEdge']);
// (What else throws one: the rim and the ball. Not the net, whose cords are thinner than a point of the
// shadow's map and would only shimmer. Not the table or the chairs: the light comes from the near side,
// so theirs would fall behind them, off the floor, on ground that takes no shadow. Not the scoreboard: a
// building has a roof of lights, and the one light here would lay it across half the floor.)

export function buildProps(things: Map<string, Thing>, keep: Keep): Props {
  /** A thing's shapes where Blender put them, by the name of each one's material. */
  const shapes = (name: string): Map<string, BufferGeometry> => {
    const thing = things.get(name);
    if (!thing) throw new Error(`arena.glb has no ${name}`);
    return new Map(placed(thing).map((p) => [p.material, keep(p.geo)]));
  };
  /** A thing's shapes as meshes, each named for its part and in that part's material. */
  const dress = (name: string, parts: Map<string, BufferGeometry>, skin: Record<string, Material | undefined>): Mesh[] =>
    [...parts].map(([part, geo]) => {
      const mat = skin[part];
      if (!mat) throw new Error(`arena.glb: ${name} has a part (${part}) the app has no material for`);
      const mesh = new Mesh(geo, mat);
      mesh.name = part;
      return mesh;
    });

  const hoop = shapes('hoop');
  const rim = shapes('rim');
  const net = shapes('net');
  const chair = shapes('chair');
  const table = shapes('table');
  const ball = shapes('ball');
  const boards = new Map(BOARD_KINDS.map((kind) => [kind, shapes(BOARD_MODELS[kind])]));
  const fans = (names: string[]) =>
    names.map((name) => {
      const geo = shapes(name).get('fan');
      if (!geo) throw new Error(`arena.glb: ${name} has no shape`);
      return geo;
    });
  const near = fans(['fanA', 'fanB', 'fanC', 'fanD', 'fanE', 'fanF', 'fanG', 'fanH']);
  const [kid] = fans(['fanKid']);
  const mid = fans(['fanMidA', 'fanMidB', 'fanMidC']);
  const [fanLow] = fans(['fanLow']);
  const [fanFar] = fans(['fanFar']);
  const stall = shapes('stall').get('seat');
  clockMap(hoop.get('clock')!);
  for (const [kind, board] of boards) {
    const boardScreens = board.get('screen');
    if (boardScreens) screenMap(boardScreens, UNDER_Y[kind]);
    const band = board.get('ribbon');
    if (band) board.set('ribbon', keep(ringMap(band)));
  }

  // what things are made of: padding, steel, the white on the glass, a screen that is off
  const team = keep(new MeshStandardMaterial({ color: 0x222222, roughness: 0.6, vertexColors: true }));
  const pad = keep(new MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.6, vertexColors: true }));
  const steel = keep(new MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.45, vertexColors: true }));
  const edge = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, vertexColors: true }));
  // (glass: what is behind it, and the lamps on its face; its edge, green end on)
  const glass = keep(pane());
  // (the edge holds the light that comes in through the pane: a faint glow of its own, so it reads from a replay's camera)
  const glassEdge = keep(new MeshStandardMaterial({ color: '#6c9d8c', emissive: '#132c25', roughness: 0.15 }));
  // (the stanchions' badge: the caller paints it; a decal a hair off the pad, drawn over it)
  const badgeCv = document.createElement('canvas');
  badgeCv.width = BADGE;
  badgeCv.height = BADGE_H;
  const badge = keep(new CanvasTexture(badgeCv));
  badge.colorSpace = SRGBColorSpace;
  badge.anisotropy = 4;
  const badgeMat = keep(
    new MeshStandardMaterial({ map: badge, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  const badgeSide = keep(new PlaneGeometry(...BADGE_SIDE));
  const badgeFront = keep(new PlaneGeometry(...BADGE_FRONT));
  const led = keep(lights());
  const screen = keep(new MeshBasicMaterial({ color: 0x2b3038 }));
  // (the clocks' faces: the caller puts the clocks on them)
  const clock = keep(new MeshBasicMaterial({ color: 0x2b3038 }));
  // (the rim's orange enamel: it takes the lamps)
  const iron = keep(new MeshStandardMaterial({ color: '#e4501a', roughness: 0.36, vertexColors: true }));
  const cord = keep(new MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9, vertexColors: true }));
  braided(cord, 'cord');
  // (the live net's knots: a small round of cord where two cross, in its shade)
  const knot = keep(new IcosahedronGeometry(KNOT_R, 0));
  knot.setAttribute('color', new BufferAttribute(new Float32Array(knot.getAttribute('position').count * 3).fill(0.86), 3));
  // (black furniture, but not so black that a monitor on the table or the scoreboard's corners are lost in the dark behind them)
  const dark = keep(new MeshLambertMaterial({ color: 0x26272c, vertexColors: true }));

  // the live net's cords: which corners make its triangles, and each point's shade (darker toward the mouth, as Blender's net is)
  const links = NET.n * NET.k * 2;
  const cordTris = new BufferAttribute(cordIndex(links), 1);
  const cordShade = new Float32Array(links * CORD_SIDES * 2 * 3);
  for (let l = 0; l < links; l++) {
    const k = Math.floor(l / (NET.n * 2));
    for (let e = 0; e < 2; e++) cordShade.fill(1 - 0.2 * ((k + e) / NET.k) ** 1.5, (l * 2 + e) * CORD_SIDES * 3, (l * 2 + e + 1) * CORD_SIDES * 3);
  }
  const skin = keep(pebbles());
  const under = keep(blob());

  return {
    team,
    clock,
    led,
    badge,

    basket() {
      const group = new Group();
      for (const m of dress('hoop', hoop, { pad, steel, team, edge, glass, clock, led, glassEdge })) {
        m.castShadow = !NO_SHADOW.has(m.name);
        // (the pane is drawn after what is seen through it)
        if (m.name === 'glass') m.renderOrder = 2;
        group.add(m);
      }
      // the badge on each side of the base (read from outside it) and on its front, toward the floor
      for (const [geo, x, y, z, turn] of [
        [badgeSide, -11.4, 1.72, 1.712, 0],
        [badgeSide, -11.4, 1.72, -1.712, Math.PI],
        [badgeFront, -8.268, 1.16, 0, Math.PI / 2],
      ] as const) {
        const m = new Mesh(geo, badgeMat);
        m.position.set(x, y, z);
        m.rotation.y = turn;
        m.renderOrder = 1;
        group.add(m);
      }
      // (the rim tips and the net swings about the rim's centre: each is its own thing, there)
      const [ring] = dress('rim', rim, { iron });
      // (each net has its own cords' material: the two are not pulled together)
      const swish = new Vector3();
      const cords = keep(cord.clone());
      braided(cords, 'net', (vs) => vs.replace('#include <common>', '#include <common>\nuniform vec3 uSwish;').replace('#include <begin_vertex>', NET_PULL), {
        uSwish: { value: swish },
      });
      const [mesh] = dress('net', net, { cord: cords });
      ring.position.y = mesh.position.y = RIM_H;
      ring.castShadow = true;
      group.add(ring, mesh);
      // the net as cord (net.ts): its points are written each frame it moves
      const sim = new NetSim();
      const shape = keep(new BufferGeometry());
      const at = new BufferAttribute(new Float32Array(links * CORD_SIDES * 2 * 3), 3).setUsage(DynamicDrawUsage);
      const facing = new BufferAttribute(new Float32Array(links * CORD_SIDES * 2 * 3), 3).setUsage(DynamicDrawUsage);
      shape.setAttribute('position', at);
      shape.setAttribute('normal', facing);
      shape.setAttribute('color', new BufferAttribute(cordShade, 3));
      shape.setIndex(cordTris);
      const live = new Mesh(shape, cord);
      live.name = 'cord';
      live.position.y = RIM_H;
      // (it is always by the rim, wherever its cords fly: no need to find its bounds each frame)
      live.frustumCulled = false;
      live.visible = false;
      // (its knots, every row but the loops on the hooks: shown with it)
      const knots = new InstancedMesh(knot, cord, NET.n * NET.k);
      knots.frustumCulled = false;
      live.add(knots);
      const spot = new Matrix4();
      const draw = () => {
        cordPoints(sim, at.array as Float32Array, facing.array as Float32Array);
        at.needsUpdate = facing.needsUpdate = true;
        for (let i = 0; i < knots.count; i++) {
          const o = (NET.n + i) * 3;
          knots.setMatrixAt(i, spot.makeTranslation(sim.at[o], sim.at[o + 1], sim.at[o + 2]));
        }
        knots.instanceMatrix.needsUpdate = true;
      };
      draw();
      group.add(live);
      return { group, rim: ring, net: mesh, swish, live: { sim, mesh: live, draw } };
    },

    chairs(at, seat) {
      const group = new Group();
      const rows = dress('chair', chair, { seat, steel }).map((m) => keep(new InstancedMesh(m.geometry, m.material, at.length)));
      const m = new Matrix4();
      const q = new Quaternion();
      const up = new Vector3(0, 1, 0);
      const where = new Vector3();
      const size = new Vector3(1, 1, 1);
      at.forEach((c, i) => {
        m.compose(where.set(c.x, c.y, c.z), q.setFromAxisAngle(up, c.turn), size);
        for (const row of rows) row.setMatrixAt(i, m);
      });
      for (const row of rows) {
        row.instanceMatrix.needsUpdate = true;
        group.add(row);
      }
      return group;
    },

    table(board) {
      return new Group().add(...dress('table', table, { board, dark, screen, steel }));
    },

    ball(fill, seam) {
      // (the court's own colours, taken toward a game ball's under these lamps: tanned leather, seams all but black)
      const hide = keep(leather(`#${new Color(fill).lerp(TAN, 0.55).getHexString()}`, skin));
      const cut = keep(new MeshStandardMaterial({ color: new Color(seam).lerp(PITCH, 0.8), roughness: 0.85, vertexColors: true }));
      const group = new Group();
      for (const m of dress('ball', ball, { leather: hide, seam: cut })) {
        m.castShadow = true;
        group.add(m);
      }
      return group;
    },

    ballShadow() {
      const round = keep(new PlaneGeometry(1, 1));
      round.rotateX(-Math.PI / 2);
      const mesh = new Mesh(round, keep(new MeshBasicMaterial({ color: 0x000000, map: under, transparent: true, opacity: 0.3, depthWrite: false })));
      mesh.renderOrder = 3;
      return mesh;
    },

    scoreboard(ribbon, screens, kind = 'four') {
      return new Group().add(...dress(BOARD_MODELS[kind], boards.get(kind)!, { ribbon, dark, screen: screens }));
    },

    crowd() {
      if (!stall) throw new Error('arena.glb: the stall has no shape');
      return { near, kid, mid, low: fanLow, far: fanFar, stall };
    },
  };
}
