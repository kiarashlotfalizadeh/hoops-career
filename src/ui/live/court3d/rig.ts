// The lights: an arena's rig over the floor, as a broadcast is lit.
//
// A real building lights its floor from banks all round the roof, so a man on it throws not one shadow but
// several faint ones fanning out from his feet, dark only where they lie over each other. Here that is four
// lamps, one over each quarter of the roof, each with a shadow map of its own that holds the whole floor
// (it never moves with the camera: nothing swims as the broadcast pans). The two on the camera's side are
// the brighter and a hair warm (the faces the camera sees); the two over the far side are cooler and catch
// a shoulder and the top of a head from behind. With them: a cool light low from behind the far stands (the
// edge that pulls a man off the crowd), a soft one from the camera's side at the height of the lower bowl
// (it fills a face, and is the spill the far stands sit in), the sky (cool above, the wood's colour below)
// and what comes back up off the floor. The building's own light (lens.ts, the environment) is the rest.
//
// `mood`: the house lights for the open, a timeout and the clutch: the stands and the soft light come
// down and the lamps stay, so the floor is a lit stage in a darker room.
import { AmbientLight, DirectionalLight, HemisphereLight, Vector3, type Scene } from 'three';
import { FLOOR_L, FLOOR_W } from '../Court';

/** The key's shadow map holds the floor and this much round it (ft), and is this deep along the light (ft: lens.ts SHADOW_FT is the same). */
const SHADOW_MARGIN = 2;
export const SHADOW_DEPTH = 120;
/** How far off the floor's middle a lamp of the rig stands (ft): its map's near edge is NEAR from it. */
const LAMP_FAR = 110;
const NEAR = 20;

/** The four lamps: where from (x along the floor, y up, z toward the camera), colour, how bright, how many dots its shadow map is across. */
const LAMPS: readonly (readonly [number, number, number, number, number, number])[] = [
  [34, 78, 40, 0xfff6ea, 1.25, 2048],
  [-34, 78, 40, 0xfff6ea, 0.8, 2048],
  [-40, 72, -44, 0xf3f6ff, 0.8, 1024],
  [40, 72, -44, 0xf3f6ff, 0.8, 1024],
];
/**
 * The lamps before this one have their shadows drawn afresh every frame (the camera's side: the key's is
 * the dark one). The far side's two are the faint soft ones of the fan: their maps are half the size, and
 * are drawn in turn, one a frame, so a frame draws three of the four (every body in the building is drawn
 * again for each).
 */
const EVERY_FRAME = 2;
/** The edge light from behind the far stands, and the soft one from the camera's side. */
const RIM = 1.3;
const FRONT = 0.45;
/** The sky (cool, from above), the flat light all round, what comes back up off the wood. */
const SKY = 0.85;
const FILL = 0.1;
const BOUNCE = 0.22;
/** The darker house: how much of each is left when the mood is all the way down. */
const MOOD_SKY = 0.45;
const MOOD_FRONT = 0.35;
const MOOD_ENV = 0.6;
/** How much of the building's own light (lens.ts arenaLight) the scene takes: the lamps are in the rig too. */
const ENV = 0.65;
/** The mood gets where it is going in about this long (ms). */
const MOOD_MS = 900;

/** How many of the lamps throw shadows at each step down (Court3D's STEPS, scene.lite). */
const CASTERS = [4, 2, 0, 0];

/**
 * A material nothing's shadow falls on (the people in the stands, their seats, the steps): its shader goes
 * without the lamps' shadows altogether. three gives every lit material a place in each lamp's shadow map
 * for every point of it, used or not, and the stands are most of the building's triangles: a third of a
 * frame went on carrying them. For a material's `onBeforeCompile`.
 */
export function unshadowed(sh: { vertexShader: string; fragmentShader: string }) {
  sh.vertexShader = `#undef USE_SHADOWMAP\n${sh.vertexShader}`;
  sh.fragmentShader = `#undef USE_SHADOWMAP\n${sh.fragmentShader}`;
}

export class Rig {
  readonly sky: HemisphereLight;
  readonly bounce: DirectionalLight;
  readonly lamps: DirectionalLight[] = [];
  private readonly front: DirectionalLight;
  private readonly fill: AmbientLight;
  /** How far down the house lights are (0: a game's; 1: the open, a timeout, the clutch). */
  drama = 0;
  private frames = 0;

  constructor(private readonly scene: Scene) {
    this.sky = new HemisphereLight(0xe6eeff, 0x9a7d5e, SKY);
    this.fill = new AmbientLight(0xffffff, FILL);
    this.bounce = new DirectionalLight(0xc89a66, BOUNCE);
    this.bounce.position.set(0, -40, 14);
    scene.add(this.sky, this.fill, this.bounce);

    const up0 = new Vector3(0, 0, -1);
    const to = new Vector3();
    const across = new Vector3();
    const up = new Vector3();
    for (const [x, y, z, colour, much, dots] of LAMPS) {
      const lamp = new DirectionalLight(colour, much);
      lamp.position.set(x, y, z).setLength(LAMP_FAR);
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(dots, dots);
      // (its map is the floor as the lamp sees it, turned square on to it and no bigger: a body over the
      // floor throws its shadow where it is in the map, so the floor is all the map need hold)
      const sc = lamp.shadow.camera;
      sc.up.copy(up0);
      to.copy(lamp.position).normalize();
      across.crossVectors(sc.up, to).normalize();
      up.crossVectors(to, across);
      let [wide, high] = [0, 0];
      for (const [cx, cz] of [
        [FLOOR_L / 2, FLOOR_W / 2],
        [FLOOR_L / 2, -FLOOR_W / 2],
      ]) {
        wide = Math.max(wide, Math.abs(across.x * cx + across.z * cz));
        high = Math.max(high, Math.abs(up.x * cx + up.z * cz));
      }
      sc.left = -wide - SHADOW_MARGIN;
      sc.right = wide + SHADOW_MARGIN;
      sc.top = high + SHADOW_MARGIN;
      sc.bottom = -high - SHADOW_MARGIN;
      sc.near = NEAR;
      sc.far = NEAR + SHADOW_DEPTH;
      // (a dot of the smaller maps is a tenth of a foot: a body is kept off its own shadow by that much)
      lamp.shadow.bias = -0.0005;
      lamp.shadow.normalBias = dots < 2048 ? 0.07 : 0.04;
      // (soft on a body; the floor's own is sharp at a foot and soft by a head: see lens.ts varnish)
      lamp.shadow.radius = dots < 2048 ? 2.5 : 4;
      this.lamps.push(lamp);
      scene.add(lamp);
    }
    // (an edge, not an outline: cool, from low behind the far side)
    const rim = new DirectionalLight(0xdfe6ff, RIM);
    rim.position.set(-10, 56, -74);
    scene.add(rim);
    this.front = new DirectionalLight(0xfff4e8, FRONT);
    this.front.position.set(6, 22, 80);
    scene.add(this.front);
    scene.environmentIntensity = ENV;
  }

  /** The first of the lamps (the camera's side): what the scene's own code knows as the key. */
  get key() {
    return this.lamps[0];
  }

  /** A device that can't keep up: two of the lamps' shadows at step 1 (the camera's side), none from 2. */
  lite(level: 0 | 1 | 2 | 3) {
    this.lamps.forEach((l, i) => (l.castShadow = i < CASTERS[level]));
  }

  /**
   * A frame is about to be drawn (the scene says so once for each): whose turn it is among the far lamps'
   * maps (see EVERY_FRAME; the first frames draw them all, so none is ever read before it is made).
   */
  turn() {
    const n = this.frames++;
    this.lamps.forEach((l, i) => {
      if (i < EVERY_FRAME) return;
      l.shadow.autoUpdate = false;
      l.shadow.needsUpdate = n < 2 || (i - EVERY_FRAME) % 2 === n % 2;
    });
  }

  /** The house lights go toward `to` (0: a game's, 1: down) over `ms`. */
  mood(to: number, ms: number) {
    this.drama += (to - this.drama) * (1 - Math.exp(-ms / MOOD_MS));
    const d = this.drama;
    this.sky.intensity = SKY * (1 - d * (1 - MOOD_SKY));
    this.front.intensity = FRONT * (1 - d * (1 - MOOD_FRONT));
    this.fill.intensity = FILL * (1 - d * 0.5);
    this.scene.environmentIntensity = ENV * (1 - d * (1 - MOOD_ENV));
  }
}
