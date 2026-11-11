// The building's props as Blender made them (models/arena.glb, from scripts/blender/arena.py): the basket
// unit with its rim and net, a bench chair, the scorer's table, the ball, the scoreboard and the one
// spectator the crowd is made of (and the few triangles he is in the floor's mirror). Here each becomes three.js objects with the app's own materials (a
// part is told apart by the name Blender gave its material); the scene places them. Every part carries
// a baked shade (its `color`): the lit materials multiply it in.
import {
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { placed, type Thing } from './glb';

type Keep = <T extends { dispose(): void }>(o: T) => T;

export interface Props {
  /**
   * One basket unit built for the low end (rim over the origin, facing +x); the caller places and turns it. rim and net are
   * children placed at y = 10 that the caller animates. `swish` is how the net's cords are pulled this frame: x down its
   * length (1: stretched by a ball going through, under 0: flicked back up), y wider at its foot, z swung toward the floor.
   */
  basket(): { group: Group; rim: Object3D; net: Object3D; swish: Vector3 };
  /** Chairs at these places (y is the floor there), each turned `turn` radians about y; one InstancedMesh per material. `seat` is the padding's material (the caller owns and recolours it; with `vertexColors` on, it takes the baked shade). */
  chairs(at: { x: number; y: number; z: number; turn: number }[], seat: Material): Object3D;
  /** The scorer's table (34 ft along x, on the floor, its front toward +z); `board` is the caller's material for its LED front, whose uv runs 0..1 left to right and bottom to top. */
  table(board: Material): Object3D;
  /** The ball (a Group whose origin is its centre), in these colours. */
  ball(fill: string, seam: string): Object3D;
  /** The scoreboard (its origin is its centre; its cables go 12 ft up from there); `ribbon` is the caller's material for its ring. */
  scoreboard(ribbon: Material): Object3D;
  /** One spectator, a couple of hundred triangles (sat on y = 0 facing +z, his feet on the row below): the shape the crowd is drawn from. `aPart` says which of his points are trunk (0), head (1), arms (2, 3) and legs (4); a quarter more is an end with its own colour (hair, a hand, a shoe). `color` is his baked shade. `far` is the same man as a trunk and a head, for where he is only a blur. */
  crowd(): { fan: BufferGeometry; far: BufferGeometry };
  /** The hoop's pads that take the home colour: the caller sets this material's colour. */
  readonly team: MeshStandardMaterial;
}

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
/** The parts of the basket unit that throw no shadow: the glass lets the light through, the clock's face lies on its box. */
const NO_SHADOW = new Set(['glass', 'clock']);
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
  const scoreboard = shapes('scoreboard');
  const fan = shapes('fan');
  const fanFar = shapes('fanFar');

  // what things are made of: padding, steel, the white on the glass, a screen that is off
  const team = keep(new MeshStandardMaterial({ color: 0x222222, roughness: 0.6, vertexColors: true }));
  const pad = keep(new MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.6, vertexColors: true }));
  const steel = keep(new MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.45, vertexColors: true }));
  const edge = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, vertexColors: true }));
  // (glass: mostly what is behind it, and the lights' glint on its face)
  const glass = keep(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false }));
  const screen = keep(new MeshBasicMaterial({ color: 0x2b3038 }));
  const iron = keep(new MeshStandardMaterial({ color: '#e8551c', roughness: 0.5, vertexColors: true }));
  const cord = keep(new MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9, vertexColors: true }));
  // (black furniture, but not so black that a monitor on the table or the scoreboard's corners are lost in the dark behind them)
  const dark = keep(new MeshLambertMaterial({ color: 0x26272c, vertexColors: true }));

  return {
    team,

    basket() {
      const group = new Group();
      for (const m of dress('hoop', hoop, { pad, steel, team, edge, glass, clock: screen })) {
        m.castShadow = !NO_SHADOW.has(m.name);
        group.add(m);
      }
      // (the rim tips and the net swings about the rim's centre: each is its own thing, there)
      const [ring] = dress('rim', rim, { iron });
      // (each net has its own cords' material: the two are not pulled together)
      const swish = new Vector3();
      const cords = keep(cord.clone());
      cords.onBeforeCompile = (sh) => {
        sh.uniforms.uSwish = { value: swish };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uSwish;').replace('#include <begin_vertex>', NET_PULL);
      };
      cords.customProgramCacheKey = () => 'net';
      const [mesh] = dress('net', net, { cord: cords });
      ring.position.y = mesh.position.y = RIM_H;
      ring.castShadow = true;
      group.add(ring, mesh);
      return { group, rim: ring, net: mesh, swish };
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
      return new Group().add(...dress('table', table, { board, dark, screen }));
    },

    ball(fill, seam) {
      const leather = keep(new MeshStandardMaterial({ color: fill, roughness: 0.62, vertexColors: true }));
      const cut = keep(new MeshStandardMaterial({ color: seam, roughness: 0.8, vertexColors: true }));
      const group = new Group();
      for (const m of dress('ball', ball, { leather, seam: cut })) {
        m.castShadow = true;
        group.add(m);
      }
      return group;
    },

    scoreboard(ribbon) {
      return new Group().add(...dress('scoreboard', scoreboard, { ribbon, dark, screen }));
    },

    crowd() {
      const [near, far] = [fan.get('fan'), fanFar.get('fan')];
      if (!near || !far) throw new Error('arena.glb: the fan has no shape');
      return { fan: near, far };
    },
  };
}
