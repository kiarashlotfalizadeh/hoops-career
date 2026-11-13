// The people in the stands. Each is one of a few spectators Blender made (scripts/blender/arena.py: five
// for the rows by the floor, two plainer ones for the rows behind, one of some 140 triangles and a trunk
// and a head for a slow device and the floor's mirror), his own size, build, skin, hair and clothes,
// drawn in a handful of instanced draws a side (a side nobody is looking at is not drawn at all). People
// come in parties (side by side, often dressed alike, a child with them now and then) and empty seats in
// runs; each sits a little off the middle of his seat, back or forward in it, leant his own way. What
// he wears is more than a colour where the camera is near enough to tell: the fragment shader draws a
// face on him (a beard on some, glasses on some) and what he has on (TOP: a jacket open over a shirt, a
// replica jersey with its number, hoops, a check, a hoodie, sleeves of another colour, a cap), in its
// second colour; no two side by side in the same colour or the same model. How many wear the home side's
// colours is the building's own (Venue.crowd). A few hold something: a phone in the lap, a phone up when
// there is something to film, a sign or a foam finger. Nothing is moved from here frame by frame: the shader sits
// each one in his seat his own way (forward on his knees, sat back, arms folded, chin on a fist, head down
// over a phone), shifts him about (less while a play is on, and greyer and a shade darker: the floor is the
// brightest thing in the building), turns his head to the ball's end, holds a phone up in a few hands, stands
// them up (a cheer goes out from the play across the building, each up in his own moment and down after his
// own while, not everyone for a small one; a nervous end has them up with their hands at their faces; the
// end of a game as many on their feet as the kind of win calls for), waves the towels, and empties the seats
// of those who have seen enough of a blowout. The seats themselves are here too, in the building's colour
// where nobody is in one.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from 'three';
import { ROWS, section, type Seat } from './bowl';
import { unshadowed } from './rig';

type Keep = <T extends { dispose(): void }>(o: T) => T;

/** The spectators' shapes (see Props.crowd). */
export interface Fans {
  near: BufferGeometry[];
  kid: BufferGeometry;
  mid: BufferGeometry[];
  low: BufferGeometry;
  far: BufferGeometry;
  stall: BufferGeometry;
}

/** The rows by the floor whose people are the detailed ones (a low camera by the boards sees these close). */
const NEAR_ROWS = 5;
/** On the near side, the rows the broadcast's cameras look over: as many again, since they are as close to those. */
const CAMERA_ROWS = 8;
/** How far a spectator's hips are over his step (FAN_FOOT in arena.py). */
export const SEAT_UP = 1.3;
/** What the crowd wears when it isn't a team's colours: darks, denim, greys, heather, cream, some colours, a few bright. */
const WEAR = [
  '#1c1d21',
  '#24262b',
  '#2b2d34',
  '#33363d',
  '#3d4048',
  '#4b4e55',
  '#62656b',
  '#85878a',
  '#9c9b96',
  '#b4b1aa',
  '#27364d',
  '#31476a',
  '#3f5878',
  '#4a463f',
  '#5f584c',
  '#7a6f58',
  '#4a3033',
  '#633a3a',
  '#39503f',
  '#8a5a3c',
  '#6f7277',
  '#857f72',
  '#56739a',
  '#875a64',
  '#7e6a2c',
  '#2f5c5e',
  '#7a2c2a',
  '#2a4380',
  '#4f5334',
];
/** A second colour on what someone wears (a stripe, a sleeve, a cap, a jersey's trim): mostly white, black or grey. */
const SECOND = ['#a29e96', '#18191c', '#18191c', '#2a2c31', '#5c5f66', '#45484f'];
/**
 * What someone has on, by number (the crowd's shader draws each: CROWD_COLOR, CROWD_FACE): a plain top, a
 * jacket or a hood open over a shirt, a replica jersey over a tee (trim and a number in its second colour),
 * hoops, a check, a top with panels down its sides, a hoodie, a jacket with sleeves of another colour. A cap
 * on top is CAP more, a beard BEARD more, glasses GLASSES more, and a woman (for her face) WOMAN more.
 */
const TOP = { plain: 0, open: 1, jersey: 2, hoops: 3, check: 4, panels: 5, hoodie: 6, sleeves: 7 } as const;
const CAP = 8;
const BEARD = 16;
const GLASSES = 32;
const WOMAN = 64;
/**
 * The spectators' models (scripts/blender/arena.py FANS, in props.ts's order: Fans.near, then Fans.mid) and
 * who each is: how often he sits in his rows (the rows by the floor's eight grown-ups, the rows behind's
 * three), whether she is a woman (a narrower build, no beard, lipstick on some), what most in it have on (its
 * own clothes: a jacket's or a coat's open front, a hood's hoodie; -1 anything), and which of the rows
 * behind's a slow device draws in its place.
 */
const NEAR_MODELS: { share: number; woman: boolean; top: number; plain: number }[] = [
  // a man in a collared top, a big man in a cap, two women (one in bare arms); each with hair as the shader gives it (HAIR)
  { share: 0.16, woman: false, top: -1, plain: 0 },
  { share: 0.11, woman: false, top: -1, plain: 2 },
  { share: 0.15, woman: true, top: -1, plain: 1 },
  { share: 0.11, woman: true, top: -1, plain: 1 },
  // a man with a lot of hair in a hood, a bald man in a jacket, a woman in a coat, a heavy man in a beanie
  { share: 0.12, woman: false, top: TOP.hoodie, plain: 0 },
  { share: 0.12, woman: false, top: TOP.open, plain: 2 },
  { share: 0.12, woman: true, top: TOP.open, plain: 1 },
  { share: 0.11, woman: false, top: TOP.hoodie, plain: 2 },
];
const MID_MODELS: { share: number; woman: boolean; top: number }[] = [
  { share: 0.44, woman: false, top: -1 },
  { share: 0.38, woman: true, top: -1 },
  { share: 0.18, woman: false, top: TOP.open },
];
/**
 * The styles of hair the rows by the floor's models carry, each a fiftieth more than his hair on `aPart` in this
 * order (arena.py HAIR_STYLES: change both): an afro, a bun, a ponytail, hair down to the shoulders, curls. The
 * shader shows the one he has (none of them: his model's own crop).
 */
const HAIR = { afro: 1, bun: 2, tail: 3, long: 4, curls: 5 } as const;
/** Which of the rows by the floor's models is the child (after the grown-ups). */
const KID = NEAR_MODELS.length;
/** Which of `models` a number (0 to 1) picks: each as often as its share says. */
function chosen(models: readonly { share: number }[], r: number): number {
  let at = 0;
  for (let k = 0; k < models.length; k++) if (r < (at += models[k].share)) return k;
  return models.length - 1;
}
/** Which way someone turns to the one beside him to celebrate (FAN_MOVE fanTurn, as the shader works it out from his number in 32 bits). */
function turnOf(seed: number): number {
  const t = Math.fround(Math.fround(seed) * Math.fround(TURN_SEED)) % 1;
  return t < TURN_SHARE ? 1 : t > 1 - TURN_SHARE ? -1 : 0;
}
/** People come in parties, seats side by side (a few alone), and empty seats in runs (a party that didn't come): how many in one. */
const PARTY = [1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
const GAP = [1, 1, 2, 2, 3, 4];
/** How many of a party are a side's fans when it is one; how many of the parties that are wear its jersey, all of them. */
const PARTY_FANS = 0.8;
const PARTY_KIT = 0.2;
/** How far someone sits off the middle of his seat (ft along the row, and back or forward), and how far he leans to one side (radians). */
const OFF_SEAT = 0.3;
const OFF_BACK = 0.22;
const OFF_LEAN = 0.09;
/**
 * How many of the parties in the seats are the home side's (PARTY_FANS of each in its colours) in a building
 * that doesn't say (Venue.crowd), the most any does, and those who bring a towel in all of them; and of those
 * in its colours how many in its white.
 */
const HOME_SHARE = 0.38;
const HOME_MOST = 0.6;
const HOME_LEAST = 0.26;
const HOME_TOWELS = 0.3;
const HOME_WHITE = 0.16;
const HOME_TRIM = 0.16;
/** The white a fan wears: off-white, well under a kit's on the floor (a stand full of pure white dots pulls the eye off the play). */
const HOME_WHITE_WEAR = '#aeaba4';
/** A team's colour as cloth: this far toward grey (a shirt is never a paint chip), more so its second colour. */
const WORN = 0.42;
/** The visitors' block: from x to x on the far side, rows this to that (most of its seats theirs). */
const VISITORS = [24, 46, 3, 11];
const WHITE = new Color('#ffffff');
const GREY = new Color();
/**
 * The seats' colour is the building's, this far toward grey and this much of it (moulded plastic under a
 * dimmed house, not a lit sign; and less the higher up, by the seat's own `lit`: the lamps are on the floor),
 * and no lighter than this (as light: a silver or a yellow building's seats are a dull one).
 */
const STALL_GREY = 0.38;
const STALL_TONE = 0.5;
const STALL_MOST = 0.22;
/** A colour the lamps hardly reach has little colour left: how much of a cloth's is kept in the darkest rows (all of it by the floor). */
const DIM_COLOUR = 0.55;
/** And how much of it goes while a play is on (the stands sit back behind the floor). */
const LIVE_GREY = 0.3;
/** A section of the stands for a cheer (ft across: see fanBlock): each is up a little before or after the next, and for its own while. */
const BLOCK_FT = 22;
/**
 * How much each spectator's own build is off his model's (FAN_MOVE fanBuild): a belly as far out as this
 * (ft, the most), shoulders this share broader or narrower all told, a head this much bigger or smaller,
 * arms this much thicker or thinner.
 */
const BELLY = 0.17;
const BROAD = 0.16;
const NOGGIN = 0.1;
const BULK = 0.3;
/**
 * Who turns to the one beside him to celebrate (FAN_MOVE fanTurn: a number of his own, his seed this many
 * times over): this share to his left, as many to his right. The constructor pairs them, the one on the
 * right of two turning left and the other right.
 */
const TURN_SEED = 83.1;
const TURN_SHARE = 0.16;
/** The visitors' baskets in a row (none of the home side's between) that have the home crowd sit back, and how long a slump takes to lift (s). */
const RUN = 2;
const SLUMP_S = 14;

/**
 * What the crowd's shader adds to a plain lit one. `aWho` is a fan's own numbers: his beat (0 to 1), who
 * he is for (0 the home side, 1 the same with a towel, 2 the visitors, 3 someone on his feet at the rail
 * or in an aisle), his skin, and how much of the bowl's light reaches his seat. He sits his own way (forward
 * with his elbows on his knees, sat back, upright with his hands on his knees, hands together in his lap,
 * arms folded, chin on a fist, his head down over a phone), sways and shifts in it (less while a play is on,
 * uLive: the floor is what is watched) and his head follows the ball (uBall: its x and z, and in y how
 * closely). A cheer goes out across the building from the play (uRipA, uRipB: the last two, each when it
 * started, how big, and where): he gets up as it reaches him, in his own moment and for his own while, and
 * not everyone for a small one; a few clap where they sit. Up, most of the keen have their arms in the air and
 * jump (the more so the louder the building is, uLoud), the rest clap. A nervous end (uStand) has the home
 * crowd on its feet, hands down or up at their faces; the end of a game (uOvation) as many of the winners'
 * crowd on their feet as it says. A towel goes round over a head (uWave); in the end behind the basket a
 * visitor shoots free throws at, the home crowd gets up and waves both arms (uRally, uEnd: that end's side of
 * x); the visitors' fans get up for their own (uAway), and the rest hold still while they do (uHush). A few
 * hold a phone up when there is something to film (uPhone). The rows by the floor take the boards' light
 * (uLed). Those who have left (uLeave, uLeaveAway) are not there. The models (scripts/blender/arena.py) say
 * which of their points are what by `aPart`, and their joints are the numbers here: change both. `fanAt` is
 * where one of a fan's points is (the towels in their hands use it too).
 */
const FAN_MOVE = /* glsl */ `
  uniform float uTime;
  uniform float uAway;
  uniform float uWave;
  uniform float uHush;
  uniform float uRally;
  uniform float uEnd;
  uniform float uStand;
  uniform float uPhone;
  uniform float uLeave;
  uniform float uLeaveAway;
  uniform float uOvation;
  uniform float uLoud;
  uniform float uLive;
  uniform float uSlump;
  uniform vec4 uRipA;
  uniform vec4 uRipB;
  uniform vec3 uBall;
  float fanRally(float kind, mat4 seat) {
    // (a seat in the end stands faces along x; which end, its side of the floor)
    vec3 facing = seat[2].xyz;
    return kind > 1.5 ? 0.0 : uRally * step(0.7 * length(facing), abs(facing.x)) * step(0.0, seat[3].x * uEnd);
  }
  /** A section of the stands (a block of seats some ${BLOCK_FT} ft across) as a number of its own: it is up a moment before or after the next one, and stays up its own while. */
  float fanBlock(mat4 seat) {
    return fract(sin(dot(floor(seat[3].xz / ${BLOCK_FT}.0), vec2(12.9898, 78.233))) * 43758.5453);
  }
  /** A cheer as it gets to him (r: when it started, how big, where): up in his own moment and at his own speed, his section's a moment before or after the next, the far end a moment later, and down after his own while. */
  float fanCheer(vec4 r, float seed, mat4 seat) {
    float t = uTime - r.x;
    float block = fanBlock(seat);
    float on = distance(seat[3].xz, r.zw) / 110.0 + 0.55 * fract(seed * 5.13) + 0.4 * block;
    float hold = (0.6 + 2.8 * fract(seed * 8.71)) * (0.4 + r.y) * (0.7 + 0.6 * fract(block * 7.7));
    // (a small one gets the keen up; a big one nearly everyone)
    float goes = step(fract(seed * 3.71) * 0.85, r.y);
    return goes * smoothstep(on, on + 0.22 + 0.45 * fract(seed * 37.3), t) * (1.0 - smoothstep(on + hold, on + hold + 0.8, t));
  }
  /** How far he is on his feet, and how far his arms are up with it. */
  vec2 fanUp(float seed, float kind, mat4 seat) {
    bool away = kind > 1.5 && kind < 2.5;
    float rally = fanRally(kind, seat);
    float towel = kind > 0.5 && kind < 1.5 ? max(uWave, rally) : 0.0;
    float cheer = away ? smoothstep(0.0, 0.35, uAway * 1.5 - seed) : max(fanCheer(uRipA, seed, seat), fanCheer(uRipB, seed, seat));
    // (the end of a game: his side's crowd on its feet, as many as it says)
    float ovation = away ? 0.0 : step(fract(seed * 2.93), uOvation);
    float arms = max(max(cheer, ovation), max(towel, rally));
    float tense = away ? 0.0 : smoothstep(0.0, 0.3, uStand * 1.3 - fract(seed * 3.7));
    // (a few clap where they sit; a few in the top rows are on their feet all night)
    float sits = step(0.82, fract(seed * 6.13)) * (1.0 - ovation);
    float always = step(fract(seed * 41.3), 0.08 * smoothstep(17.0, 26.0, seat[3].y));
    return vec2(max(max(cheer * (1.0 - sits), ovation), max(max(tense, always), max(step(2.5, kind), max(towel, rally) * (1.0 - sits)))), arms);
  }
  /** How far gone he is (0 in his seat, 1 left): as the leaving reaches his number he gets up, and is away a moment after. */
  float fanGone(vec4 who) {
    return smoothstep(0.0, 0.03, (who.y > 1.5 && who.y < 2.5 ? uLeaveAway : uLeave) - 0.03 - fract(who.x * 5.71) * 0.97);
  }
  /**
   * His own build, from his number, on the model he is: how far his belly comes out (ft), how much broader or
   * narrower his shoulders are (a share), how much bigger or smaller his head, how much thicker or thinner
   * his arms (or what is on them). No belly on a child: he is the one drawn small.
   */
  vec4 fanBuild(float seed, mat4 seat) {
    float b = fract(seed * 47.9);
    return vec4(b * b * ${BELLY} * step(0.85, length(seat[1].xyz)), (fract(seed * 53.3) - 0.5) * ${BROAD}, (fract(seed * 61.7) - 0.5) * ${NOGGIN}, (fract(seed * 71.9) - 0.5) * ${BULK});
  }
  /** Which way he turns to whoever is beside him when he celebrates: 1 to his left, -1 to his right, 0 not at all (Crowd pairs them: see TURN_SEED). */
  float fanTurn(float seed) {
    float t = fract(seed * ${TURN_SEED});
    return t < ${TURN_SHARE} ? 1.0 : t > ${1 - TURN_SHARE} ? -1.0 : 0.0;
  }
  vec3 fanAt(vec3 p, float part, vec4 who, mat4 seat) {
    float seed = who.x;
    float kind = who.y;
    float beat = seed * 6.2831;
    bool away = kind > 1.5 && kind < 2.5;
    float rally = fanRally(kind, seat);
    float towel = kind > 0.5 && kind < 1.5 ? max(uWave, rally) : 0.0;
    vec2 ups = fanUp(seed, kind, seat);
    float gone = fanGone(who);
    float up = max(ups.x, smoothstep(0.0, 0.45, gone));
    float arms = ups.y;
    float habit = fract(seed * 17.31);
    vec4 build = fanBuild(seed, seat);
    // (the home crowd sat through the visitors' run: most sit back, arms folded or a hand at the head; and in a
    // nervous end those still sat hold still, a few with their hands together at their mouths)
    float slump = away ? 0.0 : uSlump * (1.0 - up) * step(fract(seed * 43.7), 0.75);
    float nerves = away ? 0.0 : uStand * (1.0 - up);
    float clasp = nerves * step(fract(seed * 73.1), 0.4);
    // (the keen: arms in the air when he is up, the more of them the louder it is, each jumping as high and as
    // fast as he likes; the rest clap, each at his own pace)
    float keen = step(1.0 - mix(0.25, 0.8, uLoud), fract(seed * 7.3));
    float hop = arms * keen * (0.06 + 0.2 * uLoud) * (0.5 + fract(seed * 19.1)) * abs(sin(uTime * (6.0 + 2.5 * fract(seed * 23.9)) + beat * 9.0));
    // getting up: a thigh (1.2 long) swings up about the knee, which stays over his feet
    float swing = up * 1.5708;
    if (part > 3.5) {
      // a leg: the shin and the foot stay where they are; the thigh goes up with him
      if (p.z < 1.0) {
        vec2 knee = vec2(0.2, 1.2);
        vec2 r = p.yz - knee;
        p.yz = knee + vec2(r.x * cos(swing) - r.y * sin(swing), r.x * sin(swing) + r.y * cos(swing));
        p.y += hop * clamp((p.y - 0.2) / 1.2, 0.0, 1.0);
      }
      return p;
    }
    // his own build: a belly out in front of him, shoulders broader or narrower (his arms out or in with them),
    // a bigger or smaller head (about his neck), arms thicker or thinner about their own middle
    float side = part < 2.5 ? 1.0 : -1.0;
    if (part < 0.5) {
      p.z += build.x * smoothstep(0.0, 0.18, p.z) * smoothstep(-0.1, 0.45, p.y) * (1.0 - smoothstep(0.75, 1.35, p.y));
      p.x *= 1.0 + build.y * smoothstep(0.9, 1.45, p.y) * (1.0 - smoothstep(1.62, 1.78, p.y));
    } else if (part < 1.5) {
      p = vec3(0.0, 1.8, -0.04) + (p - vec3(0.0, 1.8, -0.04)) * (1.0 + build.z);
    } else {
      float thick = 1.0 + build.w * step(p.y, 1.62);
      p.x = side * (0.67 + 0.6 * build.y) + (p.x - side * 0.67) * thick;
      p.z *= thick;
    }
    // (how he sits: forward toward his knees, sat back, a little forward with his chin on a fist, or upright at
    // his own angle; back in his seat through the visitors' run, forward onto his hands in a nervous end)
    float bend = (habit < 0.16 ? 0.34 : habit < 0.28 ? -0.14 : habit > 0.74 && habit < 0.84 ? 0.2 : 0.05 * sin(beat * 3.0)) * (1.0 - up);
    bend = mix(mix(bend, -0.17, slump * step(fract(seed * 43.7), 0.45)), 0.3, clasp);
    // (turned to whoever is beside him while he celebrates)
    float turn = fanTurn(seed);
    if (part > 1.5) {
      // an arm: it swings from the shoulder, and its forearm (the points under the elbow as it hangs) about
      // the elbow. A pose is how far forward the upper arm is, how far the elbow is bent, and how far his
      // hand comes in across him (under 0: out from him)
      vec3 piv = vec3(side * (0.69 + 0.6 * build.y), 1.55, 0.0);
      float clap = sin(uTime * (13.0 + 4.0 * fract(seed * 27.1)) + beat);
      bool cloth = part < 2.5 && towel > 0.0;
      float wave = max(part < 2.5 ? towel : 0.0, rally);
      // sat: elbows on his knees with his hands together (those forward), hands on his knees (those sat back
      // and upright), hands together in his lap, arms folded, chin on a fist, a phone in both hands at his lap,
      // or (a few) one hand up with a phone when there is something to film
      vec3 sat = habit < 0.16 ? vec3(0.7, 1.55, 0.72)
        : habit < 0.45 ? vec3(0.26, 1.02, 0.32)
        : habit < 0.6 ? vec3(0.22, 1.42, 0.8)
        : habit < 0.74 ? (part < 2.5 ? vec3(0.24, 1.78, 2.0) : vec3(0.18, 1.62, 1.8))
        : habit < 0.84 ? (part < 2.5 ? vec3(0.26, 1.02, 0.32) : vec3(0.95, 2.55, 0.42))
        : habit < 0.92 ? vec3(0.55, 1.95, 0.72)
        : vec3(0.26, 1.02, 0.32);
      sat = mix(sat, vec3(1.0, 1.35, 0.25), habit > 0.92 && part < 2.5 ? uPhone : 0.0);
      // (through the visitors' run: arms folded, or a hand up on his head and the other in his lap; in a
      // nervous end, hands together at his mouth)
      float sulk = fract(seed * 67.3);
      vec3 sulked = sulk < 0.45 ? (part < 2.5 ? vec3(0.24, 1.78, 2.0) : vec3(0.18, 1.62, 1.8)) : sulk < 0.75 ? (part < 2.5 ? vec3(2.3, 2.5, 0.75) : vec3(0.22, 1.42, 0.8)) : sat;
      sat = mix(mix(sat, sulked, slump), vec3(0.9, 2.45, 0.62), clasp);
      // on his feet with nothing to cheer: arms down, or both hands up at his face (not on his way out)
      vec3 stood = habit < (kind > 2.5 ? 0.1 : 0.35) && gone < 0.01 ? vec3(0.95, 2.25, 0.5) : vec3(0.06, 0.2, 0.0);
      // cheering, each his own way: both arms up (each as high and as bent as he likes), one up, a fist pumped
      // and the other hand at his chest, pointing out at the floor, clapping over his head, both hands on his
      // head; turned to whoever is beside him, the arm on that side up to meet his. The rest clap in front of
      // their chests
      float pump = sin(uTime * (7.0 + 3.0 * fract(seed * 31.7)) + beat * 3.0);
      float style = fract(seed * 59.3);
      vec3 both = vec3(2.2 + 0.6 * fract(seed * 29.0) + 0.2 * pump, 0.35 + 0.6 * fract(seed * 13.0) - 0.25 * pump, -0.5);
      vec3 chest = vec3(0.5, 1.9, 0.5);
      vec3 high = both;
      if (keen < 0.5) high = vec3(0.78, 1.5 + 0.14 * clap, 0.92 + 0.1 * clap);
      else if (style < 0.2) high = part < 2.5 ? chest : vec3(2.15 + 0.55 * pump, 1.3 - 0.9 * max(pump, 0.0), 0.25);
      else if (style < 0.32) high = part < 2.5 ? vec3(0.35, 0.9, 0.3) : vec3(1.7, 0.12, 0.3);
      else if (style < 0.44) high = vec3(2.75, 0.55 + 0.25 * clap, 0.75 + 0.2 * clap);
      else if (style < 0.52) high = vec3(2.45, 2.4, 0.75);
      else if (style < 0.64) high = part < 2.5 ? both : chest;
      if (turn * side > 0.5) high = vec3(2.3, 0.45, -0.15);
      vec3 pose = mix(mix(mix(sat, stood, up), high, arms), vec3(2.75, 0.3, -0.3), wave);
      // (how far down the forearm: a hand comes in the most)
      float reach = clamp((0.6 - p.y) / 1.1, 0.0, 1.0);
      vec3 r = p - vec3(piv.x, 0.6, 0.0);
      if (p.y < 0.6) r = vec3(r.x, r.y * cos(pose.y) + r.z * sin(pose.y), r.z * cos(pose.y) - r.y * sin(pose.y));
      r.y -= 0.95;
      r = vec3(r.x, r.y * cos(pose.x) + r.z * sin(pose.x), r.z * cos(pose.x) - r.y * sin(pose.x));
      // (side to side about the shoulder: a towel fast and wide, empty hands slower)
      float sw = wave * (cloth ? 0.6 * sin(uTime * 8.0 + beat * 4.0) : 0.38 * sin(uTime * 4.6 + beat));
      r.xy = vec2(r.x * cos(sw) - r.y * sin(sw), r.x * sin(sw) + r.y * cos(sw));
      p = piv + r;
      p.x -= side * 0.6 * (max(pose.z, 0.0) * reach - max(-pose.z, 0.0) * smoothstep(1.2, 2.8, p.y));
    } else if (part > 0.5) {
      // his head, about his neck: toward the ball, loosely, and off round the building now and then (hardly at all
      // while a play is on, nor in a nervous end); down over his phone, if that is where he is, and down a little
      // through the visitors' run
      vec2 to = uBall.xz - seat[3].xz;
      float yaw = clamp(atan(dot(to, seat[0].xz), dot(to, seat[2].xz)), -0.8, 0.8) * uBall.y;
      yaw += (0.22 * sin(uTime * 0.23 + beat * 7.0) + 0.5 * smoothstep(0.9, 1.0, sin(uTime * 0.11 + beat * 23.0))) * (1.0 - 0.75 * uLive) * (1.0 - 0.7 * nerves);
      vec2 h = p.xz - vec2(0.0, -0.03);
      p.xz = vec2(0.0, -0.03) + vec2(h.x * cos(yaw) + h.y * sin(yaw), h.y * cos(yaw) - h.x * sin(yaw));
      float nod = (habit > 0.84 && habit < 0.92 ? 0.42 * (1.0 - up) : 0.0) + 0.22 * slump * step(fract(seed * 67.3), 0.6);
      vec2 n = p.yz - vec2(1.95, 0.0);
      p.yz = vec2(1.95, 0.0) + vec2(n.x * cos(nod) - n.y * sin(nod), n.x * sin(nod) + n.y * cos(nod));
    }
    // (turned to the one beside him, from the hips)
    float twist = turn * 0.6 * arms;
    p.xz = vec2(p.x * cos(twist) + p.z * sin(twist), p.z * cos(twist) - p.x * sin(twist));
    p.yz = vec2(p.y * cos(bend) - p.z * sin(bend), p.y * sin(bend) + p.z * cos(bend));
    // the rest of him goes where the top of his thighs goes: up, and forward over his feet
    p.y += 1.2 * sin(swing) + hop;
    p.z += 1.2 * (1.0 - cos(swing));
    // (he leans from the hips, a little, on his own beat, and now and then shifts in his seat; the home crowd
    // holds still while the visitors celebrate and in a nervous end, and everyone keeps stiller while a play is on)
    float still = (away ? 1.0 : (1.0 - 0.85 * uHush) * (1.0 - 0.8 * uStand)) * (1.0 - 0.65 * uLive);
    float lean = p.y * 0.5;
    float shift = smoothstep(0.86, 1.0, sin(uTime * 0.19 + beat * 13.0)) * sign(habit - 0.5);
    p.x += lean * (0.07 * sin(uTime * 0.8 + beat * 5.0) + 0.16 * shift) * still;
    p.z += lean * (0.05 * sin(uTime * 0.37 + beat * 11.0) * still + 0.12 * arms);
    return p;
  }`;
const CROWD_HEAD = /* glsl */ `
  attribute vec4 aWho;
  attribute vec4 aLook;
  attribute float aPart;
  uniform float uDim;
  varying vec2 vBounce;
  varying vec4 vFace;
  varying vec4 vOwn;
  varying vec4 vLook;
  varying vec3 vHair;
  ${FAN_MOVE}`;
const CROWD_COLOR = /* glsl */ `
  float tone = aWho.z;
  vec3 skin = tone < 0.5 ? mix(vec3(0.045, 0.026, 0.018), vec3(0.19, 0.11, 0.07), tone * 2.0) : mix(vec3(0.19, 0.11, 0.07), vec3(0.5, 0.35, 0.26), tone * 2.0 - 1.0);
  // (what else he has on comes from his own number)
  float own = fract(aWho.x * 91.7);
  // (and his skin's own cast: golden, ruddy, olive, or as it is)
  float under = fract(own * 23.0);
  skin *= under < 0.3 ? vec3(1.05, 0.98, 0.88) : under < 0.5 ? vec3(1.07, 0.95, 0.94) : under < 0.68 ? vec3(0.97, 1.0, 0.9) : vec3(1.0);
  // (a quarter over a part's number is skin or an end: his neck, hair on a head, a bare arm or a hand, a shoe; a half is a cap)
  float over = fract(aPart);
  bool tip = over > 0.1 && over < 0.4;
  // (what he has on: TOP, a cap on it CAP more, a beard BEARD more, glasses GLASSES more, a woman WOMAN more; and its second colour, aLook.rgb)
  float code = aLook.w;
  float woman = step(${WOMAN - 0.5}, code);
  code -= ${WOMAN}.0 * woman;
  float glasses = step(${GLASSES - 0.5}, code);
  code -= ${GLASSES}.0 * glasses;
  float beard = step(${BEARD - 0.5}, code);
  code -= ${BEARD}.0 * beard;
  float capped = step(${CAP - 0.5}, code);
  float top = code - ${CAP}.0 * capped;
  // (the tee under a jersey: white, grey or black, the one CROWD_FACE draws past its armholes)
  float teeK = fract(fract(own * 7.31) * 37.0);
  vec3 tee = teeK < 0.4 ? vec3(0.36, 0.35, 0.33) : teeK < 0.75 ? vec3(0.2, 0.2, 0.21) : vec3(0.03);
  // (his hair: black, dark brown, on the fair a few brown, red or fair; grey on some of everyone; a few of the men bald on top)
  float dye = fract(own * 13.0);
  vec3 hair = dye < 0.45 ? vec3(0.012) : dye < 0.75 || tone < 0.5 ? vec3(0.05, 0.03, 0.018) : dye < 0.84 ? vec3(0.13, 0.075, 0.035) : dye < 0.9 ? vec3(0.2, 0.075, 0.03) : vec3(0.3, 0.22, 0.11);
  hair = mix(hair, vec3(0.3, 0.3, 0.31), step(0.88, fract(own * 5.7)));
  bool bald = woman < 0.5 && fract(own * 31.0) < 0.14;
  // (in the rows by the floor, the style of his hair, of every one his model carries (HAIR; 0 his model's own crop):
  // hers mostly down, tied back or up; his mostly the crop, some curls; an afro on darker skin; under a cap only a tail
  // or hair down)
  float hk = fract(own * 41.3);
  float hairStyle = woman > 0.5
    ? (hk < 0.3 ? ${HAIR.long}.0 : hk < 0.52 ? ${HAIR.tail}.0 : hk < 0.7 ? ${HAIR.bun}.0 : hk < 0.85 ? ${HAIR.afro}.0 : ${HAIR.curls}.0)
    : bald ? 0.0 : hk < 0.4 ? 0.0 : hk < 0.65 ? ${HAIR.curls}.0 : hk < 0.8 ? ${HAIR.afro}.0 : hk < 0.88 ? ${HAIR.bun}.0 : ${HAIR.long}.0;
  if (hairStyle == ${HAIR.afro}.0 && tone > 0.55) hairStyle = woman > 0.5 ? ${HAIR.long}.0 : ${HAIR.curls}.0;
  if (capped > 0.5 && hairStyle != ${HAIR.tail}.0 && hairStyle != ${HAIR.long}.0) hairStyle = 0.0;
  float hairPiece = aPart > 1.26 && aPart < 1.4 ? floor((aPart - 1.25) * 50.0 + 0.5) : 0.0;
  vec3 wear = vColor;
  bool strands = false;
  if (aPart > 3.5) {
    // his legs: trousers darker than his top (black, denim, khaki), shoes dark, on a few pale
    vec3 legs = own < 0.3 ? vec3(0.016) : mix(vec3(0.02, 0.028, 0.055), vec3(0.11, 0.095, 0.07), fract(own * 3.0));
    wear = color * (tip ? mix(vec3(0.014), vec3(0.3), step(0.74, fract(own * 11.0))) : legs);
  } else if (aPart > 1.5) {
    // an arm: a sleeve of his top, or of the tee under a jersey (bare from mid upper arm), or of the other colour
    if (tip) wear = color * skin;
    else if (abs(top - ${TOP.jersey}.0) < 0.5) wear = color * (position.y > 0.95 ? tee : skin);
    else if (abs(top - ${TOP.sleeves}.0) < 0.5) wear = color * aLook.rgb;
  } else if (aPart > 0.5) {
    // a head: a face, and hair (bald on top, if he is); under a cap, its colour
    bool bare = bald && position.y > 2.4;
    strands = tip && !bare && over < 0.4;
    wear = over > 0.4 ? (capped > 0.5 ? color * aLook.rgb : vColor * 0.85) : color * (tip && !bare ? hair : skin);
    if (capped > 0.5 && position.y > 2.44 && over < 0.4) {
      wear = color * aLook.rgb;
      strands = false;
    }
  } else if (tip) {
    // (his neck, above his collar)
    wear = color * skin;
  }
  // (how much of the bowl's light reaches his seat: bowl.ts lit, the same number his seat and his step take; and
  // the less of it, the less colour his clothes show)
  // (where on his face a point of it is, as the model has it: the fragment draws his eyes and his mouth there)
  // (and where on his trunk a point of his top is: 2; and on his hair: 3)
  vFace = aPart > 0.5 && aPart < 1.5 && over < 0.1 ? vec4(position, 1.0) : aPart < 0.5 && over < 0.1 ? vec4(position, 2.0) : strands ? vec4(position, hairPiece == ${HAIR.afro}.0 || hairPiece == ${HAIR.curls}.0 ? 3.5 : 3.0) : vec4(0.0);
  float reach = aWho.w;
  // (his own number, for the shirt under his top, his jersey's number and his face; how lit he is, for what
  // shows on it; a beard (1) or a woman (-1); glasses)
  vOwn = vec4(fract(own * 7.31), uDim * reach * color.r, beard - woman, glasses);
  vHair = hair * vOwn.y;
  float hue = mix(${DIM_COLOUR}, 1.0, smoothstep(0.25, 0.7, reach)) * (1.0 - ${LIVE_GREY} * uLive);
  wear = mix(vec3(dot(wear, vec3(0.2126, 0.7152, 0.0722))), wear, hue);
  vColor = wear * (uDim * reach);
  vLook = vec4(mix(vec3(dot(aLook.rgb, vec3(0.2126, 0.7152, 0.0722))), aLook.rgb, hue) * vOwn.y, top);`;
/** Where he is; and how square on to the floor this point of him is (the floor is the brightest thing in the building: it lights the faces and the fronts of those looking at it). */
const CROWD_MOVE = /* glsl */ `
  float gone = smoothstep(0.45, 1.0, fanGone(aWho));
  transformed = fanAt(transformed, aPart, aWho, instanceMatrix) * (1.0 - gone);
  // (a style of hair he hasn't got: folded away to nothing)
  if (hairPiece > 0.5 && abs(hairPiece - hairStyle) > 0.5) transformed = vec3(0.0);
  // (going: he turns for the aisle and is lost among those still sat)
  transformed.z -= gone * 1.2;
  // (a floor is a broad light: it comes round a cheek and a shoulder, not off at their edge)
  vBounce.x = max(0.0, (dot(normalize(mat3(instanceMatrix) * objectNormal), normalize(vec3(0.0, 3.0, 0.0) - instanceMatrix[3].xyz)) + 0.4) / 1.4);
  // (and the boards': on those sat by them, the first rows, on the side of them that faces the floor)
  vBounce.y = smoothstep(9.0, 2.2, instanceMatrix[3].y) * (0.3 + 0.7 * vBounce.x);`;
/**
 * A face, drawn where the model's head has it (arena.py fan: eyes at 2.3 ft over his hips, mouth at 2.03),
 * from his own numbers (vOwn.x): close to, the white of each eye and its iris and pupil under the line of
 * the upper lid (which comes down over it now and then: a blink), brows of his hair's colour (vHair), each
 * his own weight and arch, the dark of his nostrils and the shadow under his nose, lips a shade redder than
 * his skin (on some of the women a lipstick), a little colour in some cheeks, a beard (stubble, short, full
 * up his cheeks, or a goatee: its edge broken, not ruled) and glasses (vOwn.zw). Further off the eyes are
 * dark under a brow, and gone before they are too small to hold: then the shade of his eye sockets is what
 * is left, and a far row's faces are a tone, as they are from across a building. His hair (vFace.w 3) has
 * its strands close to. And his top (a point of his trunk: vFace.w 2), as TOP says (vLook.w; its second
 * colour vLook.rgb): a jacket or a hood open in a V over a shirt with a zip under it, a replica jersey (trim
 * round its neck and its armholes, the tee under it past them, a number on its front and a bigger one on
 * its back), hoops, a check, panels down its sides, a hoodie's pocket and strings, a jacket's collar and hem
 * in the colour of its sleeves; everyone's has a band at the neck. Gone, as the face is, where a stripe would
 * be finer than a dot.
 */
const CROWD_FACE = /* glsl */ `
  if (vFace.w > 0.95 && vFace.w < 1.05 && vFace.z > 0.15) {
    vec2 f = vec2(abs(vFace.x), vFace.y);
    float fine = fwidth(vFace.y);
    float seen = 1.0 - smoothstep(0.012, 0.035, fine);
    // (near enough to tell the white of an eye from its iris)
    float close = 1.0 - smoothstep(0.003, 0.009, fine);
    float n1 = fract(vOwn.x * 53.0);
    float n2 = fract(vOwn.x * 71.0);
    float n3 = fract(vOwn.x * 29.0);
    bool woman = vOwn.z < -0.5;
    vec2 e = (f - vec2(0.115, 2.315)) / vec2(0.058, 0.026);
    float eye = 1.0 - smoothstep(0.65, 1.15, length(e));
    float brow = 1.0 - smoothstep(0.6, 1.2, length((f - vec2(0.12, 2.385 + 0.012 * (n2 - 0.3) - 0.9 * (f.x - 0.12) * (f.x - 0.12))) / vec2(0.085, 0.009 + 0.01 * n1)));
    float mouth = 1.0 - smoothstep(0.6, 1.2, length((vFace.xy - vec2(0.0, 2.035)) / vec2(0.08, 0.008)));
    float lips = 1.0 - smoothstep(0.7, 1.1, length((vFace.xy - vec2(0.0, 2.035)) / vec2(0.088, 0.034)));
    float socket = 1.0 - smoothstep(0.4, 1.3, length((f - vec2(0.115, 2.33)) / vec2(0.11, 0.07)));
    float far = (1.0 - seen) * (1.0 - smoothstep(0.03, 0.1, fine));
    float grain = fract(sin(dot(floor(vFace.xy * 260.0), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 c = diffuseColor.rgb;
    // (lips a shade redder and darker, the lower one catching a little more light; on some of the women a lipstick)
    c *= mix(vec3(1.0), vec3(0.84, 0.64, 0.62) * (vFace.y < 2.035 ? 1.08 : 1.0), lips * seen);
    if (woman && n3 < 0.4) c = mix(c, vec3(0.33, 0.05, 0.08) * vOwn.y, lips * seen * 0.7);
    // (colour in the cheeks, more on the women; the shadow under his nose; his nostrils)
    float cheek = 1.0 - smoothstep(0.3, 1.0, length((f - vec2(0.17, 2.16)) / vec2(0.075, 0.06)));
    c *= mix(vec3(1.0), vec3(1.08, 0.93, 0.92), cheek * seen * (woman ? 0.8 : 0.35 * n2));
    float nostril = (1.0 - smoothstep(0.5, 1.1, length((f - vec2(0.03, 2.128)) / vec2(0.017, 0.009)))) * step(0.29, vFace.z);
    float under = 1.0 - smoothstep(0.4, 1.2, length((vFace.xy - vec2(0.0, 2.095)) / vec2(0.06, 0.018)));
    // (a beard: stubble, a short one, a full one up his cheeks, or a goatee and moustache; its edge broken, his
    // hair's colour over the skin)
    float jaw = 0.0;
    if (vOwn.z > 0.5) {
      float edge = (grain - 0.5) * 0.035;
      float chin = smoothstep(1.86, 1.92, vFace.y);
      float cheeks = n3 < 0.7 ? smoothstep(2.13, 2.08, vFace.y + edge) : smoothstep(2.22, 2.16, vFace.y + edge - 0.05 * smoothstep(0.17, 0.08, f.x));
      float stache = smoothstep(2.11, 2.095, vFace.y + edge * 0.5) * smoothstep(2.05, 2.06, vFace.y) * smoothstep(0.11, 0.08, f.x);
      float goatee = smoothstep(2.0, 1.98, vFace.y + edge) * smoothstep(0.1, 0.07, f.x + edge);
      jaw = chin * (n3 < 0.88 ? max(cheeks, stache) : max(goatee, stache)) * (1.0 - lips);
      jaw *= (n3 < 0.35 ? 0.3 : n3 < 0.7 ? 0.62 : 0.78) * (0.75 + 0.25 * grain);
      c = mix(c, vHair, jaw * seen);
    }
    // close to, his eyes: the white, the iris (dark brown, on some lighter) and its pupil, looking his own way a
    // little, under the line of the upper lid, which shuts now and then; further off, the dark of them
    float shut = step(0.982, fract(uTime * (0.23 + 0.12 * n1) + n2));
    vec2 look = vec2(0.012 * (n1 - 0.5) * sign(vFace.x + 0.0001) - 0.002, -0.003);
    float iris = 1.0 - smoothstep(0.016, 0.02, length(f - vec2(0.115, 2.315) - look));
    float pupil = 1.0 - smoothstep(0.006, 0.009, length(f - vec2(0.115, 2.315) - look));
    float lid = (1.0 - smoothstep(0.08, 0.3, abs(length(e) - 0.92))) * step(-0.15, e.y) + (1.0 - smoothstep(0.0, 0.18, abs(e.y - 0.55))) * eye * 0.6;
    vec3 white = vec3(0.52, 0.49, 0.46) * vOwn.y;
    vec3 ring = (n2 < 0.8 ? vec3(0.07, 0.04, 0.022) : vec3(0.13, 0.11, 0.06)) * vOwn.y;
    vec3 looks = mix(mix(white, ring, iris), vec3(0.008), pupil);
    looks = mix(looks, c * 0.55, shut);
    looks = mix(looks, vec3(0.01), lid * (woman ? 0.95 : 0.8));
    c = mix(c, looks, eye * close);
    c = mix(c, vHair, brow * seen * 0.85);
    // (glasses: a rim round each eye and a bridge between)
    float rim = 0.0;
    if (vOwn.w > 0.5) {
      float ring2 = abs(length((f - vec2(0.115, 2.315)) / vec2(0.082, 0.052)) - 1.0);
      rim = max(1.0 - smoothstep(0.05, 0.15, ring2), (1.0 - smoothstep(0.03, 0.04, f.x)) * (1.0 - smoothstep(0.005, 0.012, abs(f.y - 2.325))));
    }
    diffuseColor.rgb = c * (1.0 - max(max(eye * 0.82 * (1.0 - close), rim * 0.6), max(mouth * 0.55, max(nostril * 0.6, under * 0.12))) * seen - 0.3 * socket * far);
  } else if (vFace.w > 2.9) {
    // hair: its strands, close to, streaked along the way it is combed (back from his face and down); or curls
    // (an afro, a head of them: vFace.w 3.5), a speckle of tight coils with the hollows between them darker
    vec3 q = vFace.xyz;
    float seen = 1.0 - smoothstep(0.004, 0.02, fwidth(q.y));
    if (vFace.w > 3.4) {
      float coil = fract(sin(dot(floor(q * 26.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      diffuseColor.rgb *= 1.0 + ((coil - 0.5) * 0.7 - 0.12) * seen;
    } else {
      float streak = fract(sin(floor(atan(q.x, q.z + 0.1) * 46.0 + q.y * 5.0) * 12.9898) * 43758.5453);
      diffuseColor.rgb *= 1.0 + ((streak - 0.5) * 0.55 + 0.15 * smoothstep(2.5, 2.68, q.y)) * seen;
    }
  } else if (vFace.w > 1.9) {
    vec3 q = vFace.xyz;
    float fine = fwidth(q.y);
    float seen = 1.0 - smoothstep(0.02, 0.07, fine);
    float front = smoothstep(0.02, 0.1, q.z);
    float back = smoothstep(-0.06, -0.14, q.z);
    float top = vLook.w;
    float ax = abs(q.x);
    float dark = 0.16 * smoothstep(1.6, 1.66, q.y);
    // (how much of the tee under it shows, and how much is in its second colour)
    float under = 0.0;
    float trim = 0.0;
    if (top < 1.5) {
      // plain, the band at its neck; or a jacket or a hood open in a V over a shirt, a zip down the middle
      if (top > 0.5) {
        under = 0.8 * front * smoothstep(0.0, 0.025, (q.y - 1.3) * 0.3 - ax);
        dark = max(dark, 0.5 * front * (1.0 - smoothstep(0.01, 0.028, ax)) * step(q.y, 1.32));
      }
    } else if (top < 2.5) {
      // a replica jersey: a deep V and armholes edged in its second colour, the tee past them, a number front and back
      float v = (q.y - 1.47) * 0.85;
      under = front * smoothstep(0.0, 0.015, v - ax - 0.03);
      trim = front * (1.0 - smoothstep(0.012, 0.03, abs(v - ax))) * step(1.47, q.y);
      float hole = 0.5 - 0.09 * smoothstep(1.2, 1.62, q.y);
      under = max(under, smoothstep(hole, hole + 0.02, ax) * step(1.02, q.y));
      trim = max(trim, (1.0 - smoothstep(0.012, 0.03, abs(ax - hole))) * step(1.02, q.y));
      // (two figures from his own number: a little one on his chest, a big one on his back)
      float tall = mix(0.26, 0.42, back);
      vec2 n = vec2(q.x, q.y - mix(1.04, 0.92, back)) / tall;
      int num = int(vOwn.x * 99.0) % 50;
      int tens = num / 10;
      float cell = 0.58;
      vec2 at = tens > 0 ? vec2((abs(n.x) - 0.04) / cell, n.y) : vec2(n.x / cell + 0.5, n.y);
      int fig = tens > 0 ? (n.x < 0.0 ? tens : num - tens * 10) : num;
      if (tens > 0 && n.x < 0.0) at.x = 1.0 - at.x;
      trim = max(trim, (front + back) * crowdFigure(at, fig) * (1.0 - smoothstep(0.012, 0.03, fine)));
    } else if (top < 3.5) {
      // hoops
      trim = 0.55 * smoothstep(-0.3, 0.3, sin(q.y * 23.0));
    } else if (top < 4.5) {
      // a check
      dark = max(dark, 0.26 * step(0.0, sin(q.x * 27.0) * sin(q.y * 27.0)));
      dark = max(dark, 0.4 * front * (1.0 - smoothstep(0.008, 0.022, ax)));
    } else if (top < 5.5) {
      // panels down its sides, a band across the chest
      trim = 0.8 * smoothstep(0.34, 0.39, ax);
      under = 0.3 * front * (1.0 - smoothstep(0.04, 0.055, abs(q.y - 1.2))) * (1.0 - smoothstep(0.3, 0.34, ax));
    } else if (top < 6.5) {
      // a hoodie: its pocket across the front, the strings at its neck, the hood bunched behind
      float side = 0.3 - (q.y - 0.42) * 0.22;
      float pocket = front * step(0.42, q.y) * step(q.y, 0.84) * step(ax, side);
      dark = max(dark, 0.3 * pocket * (1.0 - smoothstep(0.0, 0.03, min(0.84 - q.y, side - ax))));
      under = 0.35 * front * (1.0 - smoothstep(0.006, 0.014, abs(ax - 0.07))) * step(1.46, q.y) * step(q.y, 1.66);
      dark = max(dark, 0.3 * smoothstep(1.56, 1.66, q.y) * (1.0 - front));
    } else {
      // a jacket with sleeves of another colour: its collar and its hem that colour too, a zip down the middle
      trim = max(smoothstep(1.6, 1.64, q.y), 1.0 - smoothstep(0.1, 0.14, q.y));
      dark = max(dark, 0.4 * front * (1.0 - smoothstep(0.008, 0.022, ax)) * step(0.14, q.y));
    }
    // (what shows past it: a white tee, a grey one, a black one)
    float tee = fract(vOwn.x * 37.0);
    vec3 shirt = (tee < 0.4 ? vec3(0.36, 0.35, 0.33) : tee < 0.75 ? vec3(0.2, 0.2, 0.21) : vec3(0.03)) * vOwn.y;
    diffuseColor.rgb = mix(mix(diffuseColor.rgb * (1.0 - dark * seen), shirt, under * seen), vLook.rgb, trim * seen);
  }`;
/** One figure of a jersey's number (0 to 9) as seven bars, at `p` in a box a unit tall and wide (0 to 1 each way): whether a bar is there. */
const CROWD_FIGURE = /* glsl */ `
  float crowdFigure(vec2 p, int fig) {
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
    int bars = fig == 0 ? 63 : fig == 1 ? 6 : fig == 2 ? 91 : fig == 3 ? 79 : fig == 4 ? 102 : fig == 5 ? 109 : fig == 6 ? 125 : fig == 7 ? 7 : fig == 8 ? 127 : 111;
    float t = 0.2;
    float across = step(t * 0.4, p.x) * step(p.x, 1.0 - t * 0.4);
    float right = step(1.0 - t, p.x);
    float left = step(p.x, t);
    float high = step(0.5, p.y);
    float on = 0.0;
    if ((bars & 1) != 0) on = max(on, across * step(1.0 - t, p.y));
    if ((bars & 64) != 0) on = max(on, across * step(abs(p.y - 0.5), t * 0.5));
    if ((bars & 8) != 0) on = max(on, across * step(p.y, t));
    if ((bars & 2) != 0) on = max(on, right * high);
    if ((bars & 4) != 0) on = max(on, right * (1.0 - high));
    if ((bars & 16) != 0) on = max(on, left * (1.0 - high));
    if ((bars & 32) != 0) on = max(on, left * high);
    return on;
  }`;
/** How much of his own colour he shows whatever the lamps do (a crowd is never the black a lamp's falloff alone would leave it), and how much more the floor's light adds. */
const FILL = '0.12';
const BOUNCE = 'vec3(0.62, 0.52, 0.42)';

/**
 * A towel in a fan's hand (the hand of his arm `aPart` 2: in the model, hanging, at TOWEL_HAND): held by a
 * corner and streaming out past it, trailing the way his arm goes, flapping; folded away in his lap
 * while he isn't waving it. The towel is a strip of cloth: position x across it (-0.5 to 0.5), y along it.
 */
const TOWEL_HAND = [0.67, -0.45, 0];
const TOWEL_MOVE = /* glsl */ `
  float beat = aWho.x * 6.2831;
  float on = max(uWave, fanRally(1.0, instanceMatrix)) * (1.0 - step(0.01, fanGone(aWho)));
  vec3 hand = fanAt(vec3(${TOWEL_HAND.join(', ')}), 2.25, aWho, instanceMatrix);
  vec3 elbow = fanAt(vec3(0.67, 0.5, 0.0), 2.0, aWho, instanceMatrix);
  vec3 along = normalize(hand - elbow);
  vec3 across = normalize(cross(along, vec3(0.0, 0.0, 1.0)));
  float ph = uTime * 8.0 + beat * 4.0;
  float t = position.y;
  vec3 cloth = hand + along * (0.05 + t * 1.05) + across * position.x * 0.46 * (1.0 - 0.35 * t) - across * cos(ph) * t * t * 0.6;
  // (it curls across, and ripples down its length)
  cloth.z += (position.x * position.x * 0.5 + sin(ph * 1.7 + t * 4.5) * 0.16) * t;
  vec3 transformed = mix(hand, cloth, smoothstep(0.05, 0.4, on));`;

/** What someone has in his hands (see PROP_MOVE), and how many of the home fans by the floor bring a sign, and a foam finger. */
const PROP = { phone: 0, sign: 1, finger: 2, phoneUp: 3 } as const;
const SIGN_SHARE = 0.2;
const FINGER_SHARE = 0.045;
/** The pictures of what they hold, on one canvas (px): four signs along the top, the finger and the phone under them. */
const ATLAS = [1024, 512];
const CELLS: [number, number, number, number][] = [
  [0, 0, 256, 147],
  [256, 0, 256, 147],
  [512, 0, 256, 147],
  [768, 0, 256, 147],
  [0, 200, 128, 298],
  [160, 200, 64, 118],
];
/** A cell of the atlas as uv: its bottom left corner, its width and height (the canvas's top is v 1). */
const cell = (i: number) => {
  const [x, y, w, h] = CELLS[i];
  return [x / ATLAS[0], 1 - (y + h) / ATLAS[1], w / ATLAS[0], h / ATLAS[1]];
};
/**
 * Where what he holds is, as his hands go (the fan's frame, FAN_MOVE `fanAt`): a phone in both hands in his lap,
 * its screen up at his face; a sign between his hands while he is on his feet, over his head when his arms go up; a foam finger on his hand, pointing on along his forearm; a phone held up in one hand, its screen
 * toward him, while there is something to film (uPhone). Nothing once he has left. A card a unit square about
 * its middle: position x across it, y up it.
 */
const PROP_MOVE = /* glsl */ `
  float kind = aProp;
  vKind = kind;
  vec3 hr = fanAt(vec3(${TOWEL_HAND.join(', ')}), 2.25, aWho, instanceMatrix);
  vec3 hl = fanAt(vec3(${-TOWEL_HAND[0]}, ${TOWEL_HAND[1]}, 0.0), 3.25, aWho, instanceMatrix);
  float here = 1.0 - step(0.01, fanGone(aWho));
  vec3 mid = (hr + hl) * 0.5;
  vec3 across = vec3(-1.0, 0.0, 0.0);
  vec3 rise = vec3(0.0, 1.0, 0.0);
  vec2 size = vec2(0.24, 0.44);
  if (kind < 0.5) {
    mid += vec3(0.0, 0.08, 0.05);
    rise = normalize(vec3(0.0, 0.6, 0.8));
  } else if (kind < 1.5) {
    mid += vec3(0.0, 0.34, 0.12);
    across = normalize(hr - hl + vec3(0.8, 0.0, 0.0));
    rise = normalize(vec3(0.0, 1.0, 0.12));
    size = vec2(2.0, 1.15);
    // (out only while he is on his feet: down by his seat the rest of the time)
    here *= smoothstep(0.25, 0.7, fanUp(aWho.x, aWho.y, instanceMatrix).x);
  } else if (kind < 2.5) {
    vec3 elbow = fanAt(vec3(${TOWEL_HAND[0]}, 0.5, 0.0), 2.0, aWho, instanceMatrix);
    rise = normalize(hr - elbow);
    across = normalize(cross(rise, vec3(0.0, 0.0, 1.0)));
    size = vec2(0.62, 1.45);
    mid = hr + rise * 0.5;
  } else {
    mid = hr + vec3(0.0, 0.3, 0.05);
    size = vec2(0.26, 0.48);
    here *= smoothstep(0.2, 0.7, uPhone);
  }
  vec3 transformed = mid + (across * position.x * size.x + rise * position.y * size.y) * here;`;
/** Its back: a phone's is black, a sign's plain card; a foam finger is the same both sides. */
const PROP_BACK = /* glsl */ `if (!gl_FrontFacing) diffuseColor.rgb = vKind < 0.5 || vKind > 2.5 ? vec3(0.025) : vKind < 1.5 ? vec3(0.5, 0.49, 0.46) : diffuseColor.rgb;`;

/** The signs (the building's colour and its letters on them), the foam finger and the phone, painted onto the atlas. */
function paintHeld(cv: HTMLCanvasElement, board: string, letters: string) {
  cv.width = ATLAS[0];
  cv.height = ATLAS[1];
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  const ink = `#${new Color(board).getHexString()}`;
  const say = (text: string, x: number, y: number, px: number, most: number, color: string, tilt = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.font = `900 ${px}px "Archivo Variable", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    if (w > most) ctx.scale(most / w, 1);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  // the signs: card, a marker's words on it (DEFENSE; the letters on the building's colour; LET'S GO over them; #1 FAN on yellow)
  const signs: [string, string, (x: number, y: number, w: number, h: number) => void][] = [
    ['#efece4', ink, (x, y, w, h) => say('DEFENSE', x + w / 2, y + h / 2, h * 0.5, w * 0.86, ink, -0.04)],
    [ink, '#ffffff', (x, y, w, h) => say(letters || "LET'S GO", x + w / 2, y + h / 2 + 4, h * 0.72, w * 0.84, '#f4f1ea', 0.03)],
    [
      '#efece4',
      ink,
      (x, y, w, h) => {
        say("LET'S GO", x + w / 2, y + h * 0.3, h * 0.3, w * 0.8, '#1a1a1a', -0.02);
        say(letters || 'WOOO!', x + w / 2, y + h * 0.68, h * 0.46, w * 0.84, ink, -0.02);
      },
    ],
    ['#f0cf48', '#1a1a1a', (x, y, w, h) => say('#1 FAN', x + w / 2, y + h / 2, h * 0.52, w * 0.84, '#1a1a1a', 0.05)],
  ];
  signs.forEach(([fill, edge, words], i) => {
    const [x, y, w, h] = CELLS[i];
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, w - 8, h - 8, 6);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3;
    ctx.stroke();
    words(x, y, w, h);
  });
  // the foam finger: a mitt with its first finger up, #1 on it, in the building's colour
  {
    const [x, y, w, h] = CELLS[4];
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.roundRect(x + w * 0.34, y + 4, w * 0.36, h * 0.6, w * 0.18);
    ctx.roundRect(x + 6, y + h * 0.42, w - 12, h * 0.56, w * 0.24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    say('#1', x + w / 2, y + h * 0.7, h * 0.2, w * 0.8, '#ffffff');
  }
  // the phone: a black body round a lit screen
  {
    const [x, y, w, h] = CELLS[5];
    ctx.fillStyle = '#0c0d10';
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 8);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#d6e6ff');
    g.addColorStop(0.6, '#8fb4e8');
    g.addColorStop(1, '#5a7cb8');
    ctx.fillStyle = g;
    ctx.fillRect(x + 6, y + 8, w - 12, h - 16);
  }
}

/** Someone in the stands as the crowd is made (see the constructor): his seat, model, place, numbers, colour, party, what he has on and its second colour. */
interface Fan {
  seat: Seat;
  model: number;
  fine: boolean;
  at: Matrix4;
  seed: number;
  kind: number;
  tone: number;
  wear: string;
  party: number;
  look: number;
  second: string;
}

/** One of the crowd: which draw he is in and where in it, and where he is in the mirror's. */
interface Person {
  mesh: InstancedMesh;
  slot: number;
  all: number;
}

export class Crowd {
  readonly group = new Group();
  /** What the shader is told each frame (the building sets them: see Arena.update). */
  readonly u = {
    uTime: { value: 0 },
    /** How loud the cheer is (the boards hear it; the upper deck's people stand with it a moment behind, uLag): the building's, not each fan's (see cheer). */
    uCheer: { value: 0 },
    uLag: { value: 0 },
    /** The last two cheers: when each started (uTime), how big, and where (x, z). */
    uRipA: { value: new Vector4(-99, 0, 0, 0) },
    uRipB: { value: new Vector4(-99, 0, 0, 0) },
    /** At the end of a game, how much of the winners' crowd is on its feet; how wild the crowd is when it is up; a play is on. */
    uOvation: { value: 0 },
    uLoud: { value: 0.8 },
    uLive: { value: 0 },
    uAway: { value: 0 },
    uWave: { value: 0 },
    uHush: { value: 0 },
    uRally: { value: 0 },
    uEnd: { value: -1 },
    uStand: { value: 0 },
    uPhone: { value: 0 },
    uLeave: { value: 0 },
    uLeaveAway: { value: 0 },
    /** How far the home crowd has sat back through a run of the visitors' (see dim: the crowd keeps it itself). */
    uSlump: { value: 0 },
    uBall: { value: new Vector3(0, 0, 0) },
    uDim: { value: 1 },
    /** The LED boards' light on the rows by them (a colour, as bright as they are). */
    uLed: { value: new Color(0, 0, 0) },
  };
  /** The crowd as it is drawn, and as the floor's mirror draws it (a trunk and a head each). */
  private readonly main = new Group();
  private blur!: InstancedMesh;
  private readonly people: Person[] = [];
  /** What everyone in the stands is made of, and the seats behind the rows by the floor (a back and a pan: see the constructor). */
  private readonly mat: MeshLambertMaterial;
  private readonly flatSeat: BufferGeometry;
  /** The seats the crowd was last made for (see paint): how many, and the first of them. */
  private count = 0;
  private first: Seat | undefined;
  /** Tonight's visitors' colours, for a crowd made again (see dress). */
  private away: [string, string] | null = null;
  /** Who wears the home colour (and how deep a shade of it, or its white), and who the visitors'. */
  private readonly fans: { who: number; shade: number; rank: number; home: number; own: number; wear: string; second: string }[] = [];
  private readonly visitors: { who: number; shade: number }[] = [];
  private towels!: InstancedMesh;
  private readonly towelMat: MeshBasicMaterial;
  /** What a few hold (phones, signs, foam fingers: see PROP_MOVE), and the picture of it all (see paintHeld). */
  private held!: InstancedMesh;
  private readonly propMat: MeshBasicMaterial;
  private readonly atlas: CanvasTexture;
  private readonly seatMat: MeshLambertMaterial;
  /** The seats, a draw a side for the rows by the floor and one for the rest; how lit each seat is, its section, its row, a number of its own. */
  private readonly stalls: { mesh: InstancedMesh; lit: number[]; sec: number[]; row: number[]; own: number[] }[] = [];
  /**
   * The rows by the floor's draws (the detailed people), and the rows behind's; and the same people in the
   * lighter models a slow device draws them in (see shed): the rows by the floor in the plain one and in
   * the lightest, the rows behind in the lightest and as a trunk and a head.
   */
  private readonly fine: InstancedMesh[] = [];
  private readonly plain: InstancedMesh[] = [];
  private readonly least: InstancedMesh[] = [];
  private readonly rest: InstancedMesh[] = [];
  private readonly restLow: InstancedMesh[] = [];
  private readonly restFar: InstancedMesh[] = [];
  /** The rows by the floor's seats, and the same seats as two faces each (a slow device's). */
  private readonly seats: { fine: InstancedMesh; flat: InstancedMesh }[] = [];
  private board = '';
  private level: 0 | 1 | 2 | 3 = 0;
  /** The visitors' run (see dim): their baskets since the home side's last, the hush as it was last frame, the crowd's clock then, and when the slump lifts. */
  private run = 0;
  private hushed = 0;
  private clock = 0;
  private slumpUntil = 0;

  constructor(
    private readonly keep: Keep,
    private readonly models: Fans,
    /** The bowl's seats (bowl.ts Bowl.seats): built again in place for a building with other stands, and the crowd with them (see paint). */
    private readonly source: Seat[],
  ) {
    const mat = (this.mat = keep(new MeshLambertMaterial({ color: 0xffffff, vertexColors: true })));
    mat.onBeforeCompile = (sh) => {
      unshadowed(sh);
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>${CROWD_HEAD}`)
        .replace('#include <color_vertex>', `#include <color_vertex>${CROWD_COLOR}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${CROWD_MOVE}`);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec2 vBounce;\nvarying vec4 vFace;\nvarying vec4 vOwn;\nvarying vec4 vLook;\nvarying vec3 vHair;\nuniform vec3 uLed;\nuniform float uTime;${CROWD_FIGURE}`,
        )
        .replace('#include <color_fragment>', `#include <color_fragment>${CROWD_FACE}`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * (${FILL} + ${BOUNCE} * vBounce.x + uLed * vBounce.y);`,
        );
    };
    mat.customProgramCacheKey = () => 'crowd';

    // the towels' cloth (see TOWEL_MOVE)
    this.towelMat = keep(new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }));
    this.towelMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec4 aWho;${FAN_MOVE}`)
        .replace('#include <begin_vertex>', TOWEL_MOVE)
        // (it catches the light as it turns over)
        .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vColor *= 0.62 + 0.38 * abs(cos(ph + t * 2.0));');
    };
    this.towelMat.customProgramCacheKey = () => 'towel';

    // what a few hold, and its picture (see PROP_MOVE, paintHeld)
    this.atlas = keep(new CanvasTexture(document.createElement('canvas')));
    this.atlas.colorSpace = SRGBColorSpace;
    this.atlas.anisotropy = 4;
    this.propMat = keep(new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, map: this.atlas, alphaTest: 0.5 }));
    this.propMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec4 aWho;\nattribute float aProp;\nattribute vec4 aCell;\nvarying float vKind;${FAN_MOVE}`)
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = aCell.xy + uv * aCell.zw;')
        .replace('#include <begin_vertex>', PROP_MOVE);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKind;')
        .replace('#include <map_fragment>', `#include <map_fragment>\n  ${PROP_BACK}`);
    };
    this.propMat.customProgramCacheKey = () => 'held';

    // the seats: the model in the rows by the floor, a back and a pan behind (two faces: nobody is near enough for more)
    this.seatMat = keep(new MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide }));
    const far = (this.flatSeat = keep(new BufferGeometry()));
    const quad = (a: number[], b: number[], d: number[], e: number[]) => [...a, ...b, ...d, ...a, ...d, ...e];
    const top = SEAT_UP - 0.1;
    const pts = [
      ...quad([-0.8, top - 0.1, -0.52], [0.8, top - 0.1, -0.52], [0.8, top + 1.6, -0.76], [-0.8, top + 1.6, -0.76]),
      ...quad([-0.78, top, 0.72], [0.78, top, 0.72], [0.78, top, -0.45], [-0.78, top, -0.45]),
    ];
    far.setAttribute('position', new Float32BufferAttribute(pts, 3));
    far.setAttribute(
      'color',
      new Float32BufferAttribute(
        pts.map((_, i) => (i < 18 ? 1 : 0.7)),
        3,
      ),
    );
    far.computeVertexNormals();
    this.seatMat.onBeforeCompile = unshadowed;
    this.build();
  }

  /**
   * Everyone in the seats (`source`) and the seats themselves: made when the crowd is, and again when the bowl
   * is built again for a building with other stands (what was made before let go).
   */
  private build() {
    const { keep, models } = this;
    const seats = this.source;
    const mat = this.mat;
    const seatMat = this.seatMat;
    const far = this.flatSeat;
    for (const o of [...this.main.children, ...(this.blur ? [this.blur] : [])]) {
      if (o instanceof InstancedMesh) {
        o.geometry.dispose();
        o.dispose();
      }
    }
    this.main.clear();
    if (this.blur) this.group.remove(this.blur);
    for (const list of [this.people, this.fans, this.visitors, this.stalls, this.fine, this.plain, this.least, this.rest, this.restLow, this.restFar, this.seats]) list.length = 0;
    this.count = seats.length;
    this.first = seats[0];
    let n = 11;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;

    // who sits where: the seat's person (seats empty in runs, more of them higher up), the party he came with,
    // his model, size and build, and how he sits in his seat
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const turn = new Euler(0, 0, 0, 'YXZ');
    const at = new Vector3();
    const size = new Vector3();
    const c = new Color();
    const who: Fan[] = [];
    // (the one before in the same row: the person beside him)
    let by: { side: number; row: number; model: number; wear: number } = { side: -1, row: -1, model: -1, wear: -1 };
    let row = '';
    let gap = 0;
    let party = { id: -1, left: 0 };
    for (const s of seats) {
      const full = s.kind === 'seat' ? 0.975 - 0.07 * (s.row / 17) : s.kind === 'court' ? 0.9 : 1;
      const r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
      const here = `${s.side}|${s.row}|${s.kind}`;
      if (here !== row) {
        row = here;
        gap = 0;
        party.left = 0;
      }
      if (s.kind === 'seat') {
        // (a run of empty seats: begun this much less often than a seat is empty, a run being as long as that on average)
        if (gap > 0) {
          gap--;
          continue;
        }
        if (r[0] < (1 - full) / 2.2) {
          gap = GAP[Math.floor(rnd() * GAP.length)] - 1;
          continue;
        }
      } else if (r[0] > full) continue;
      const lead = party.left <= 0;
      if (lead) party = { id: party.id + 1, left: PARTY[Math.floor(rnd() * PARTY.length)] };
      party.left--;
      const fine = s.kind === 'court' || (s.kind === 'seat' && s.row < (s.side === 3 ? CAMERA_ROWS : NEAR_ROWS));
      // (a child with the grown-ups of his party now and then)
      const child = !lead && r[2] < 0.13;
      const next = by.side === s.side && by.row === s.row;
      const models = fine ? NEAR_MODELS : MID_MODELS;
      let model = child && fine ? KID : chosen(models, r[1]);
      if (next && model === by.model && !child) model = (model + 1 + Math.floor(r[4] * (models.length - 2))) % models.length;
      // (the women's models a little narrower; a few big men, a few broad ones)
      const big = rnd();
      const tall = child ? 0.68 + r[3] * 0.12 : 0.92 + r[3] * 0.2 + (big > 0.94 ? 0.07 : 0);
      const slim = !child && models[model].woman;
      const wide = tall * (slim ? 0.86 + r[4] * 0.14 : 0.92 + r[4] * 0.22) * (big < 0.1 && !slim ? 1.12 : 1);
      // (off the middle of his seat, back or forward in it, leant a little to one side; turned his own way, a few well round)
      const along = (rnd() - 0.5) * OFF_SEAT * (s.kind === 'seat' ? 1 : 2);
      const deep = (rnd() - 0.5) * OFF_BACK;
      const yaw = s.turn + (r[5] - 0.5) * (rnd() < 0.12 ? 0.8 : 0.3);
      q.setFromEuler(turn.set(0, yaw, (rnd() - 0.5) * OFF_LEAN));
      const tone = 0.2 + 0.8 * rnd() ** 0.75;
      let wear = Math.floor(rnd() * WEAR.length);
      if (next && wear === by.wear) wear = (wear + 1 + Math.floor(r[5] * (WEAR.length - 2))) % WEAR.length;
      by = { side: s.side, row: s.row, model, wear };
      // (a beard on some of the men, glasses on some of everyone)
      const man = !child && !slim;
      const face = (man && rnd() < 0.3 ? BEARD : 0) + (!child && rnd() < 0.12 ? GLASSES : 0) + (slim ? WOMAN : 0);
      at.set(s.x + Math.cos(yaw) * along + Math.sin(yaw) * deep, s.y + SEAT_UP * (s.kind === 'seat' ? 1 : tall), s.z - Math.sin(yaw) * along + Math.cos(yaw) * deep);
      who.push({
        seat: s,
        model,
        fine,
        at: new Matrix4().compose(at, q, size.set(wide, tall, (wide + tall) / 2)),
        seed: r[6],
        kind: s.kind === 'stand' ? 3 : 0,
        tone,
        wear: WEAR[wear],
        party: party.id,
        look: face,
        second: SECOND[Math.floor(rnd() * SECOND.length)],
      });
    }
    // (two of a party side by side: if the one on the right turns to his left to celebrate, the other turns to
    // him; nobody turns to a stranger or an empty seat. A number of his own is drawn again until it says so)
    who.forEach((w, i) => {
      const left = who[i + 1];
      const right = who[i - 1];
      const mate = (o: Fan | undefined) =>
        !!o && o.party === w.party && o.seat.side === w.seat.side && o.seat.row === w.seat.row && o.seat.kind === 'seat' && w.seat.kind === 'seat';
      const want = mate(right) && turnOf(right!.seed) === 1 ? -1 : turnOf(w.seed) === 1 && mate(left) ? 1 : 0;
      while (turnOf(w.seed) !== want) w.seed = rnd();
    });
    // who is for whom, and what he has on (from its own numbers: the crowd's sizes and colours stay as they are whoever plays)
    let k = 29;
    const pick = () => ((k = (k * 16807) % 2147483647) & 0xffff) / 0xffff;
    const parties = new Map<number, { rank: number; kit: boolean }>();
    who.forEach((w, i) => {
      const s = w.seat;
      const p = [pick(), pick(), pick(), pick(), pick(), pick(), pick()];
      // (a party's number: under the building's share it is the home side's (see paint); and some that are wear its jersey, all of them)
      let pt = parties.get(w.party);
      if (!pt) parties.set(w.party, (pt = { rank: p[4], kit: p[5] < PARTY_KIT }));
      const style = p[6];
      const cap = pick();
      // everyone else: a jacket over a shirt (most in the jacket's and the coat's models), a hoodie (most in the hood's), panels, hoops, a check, other sleeves, someone's jersey, plain
      const dressed = (w.fine ? NEAR_MODELS : MID_MODELS)[w.model]?.top;
      const own =
        ((dressed === TOP.open && style < 0.7) || style < 0.2
          ? TOP.open
          : (dressed === TOP.hoodie && style < 0.8) || style < 0.32
            ? TOP.hoodie
            : style < 0.38
              ? TOP.panels
              : style < 0.48
                ? TOP.hoops
                : style < 0.55
                  ? TOP.check
                  : style < 0.62
                    ? TOP.sleeves
                    : style < 0.68
                      ? TOP.jersey
                      : TOP.plain) + (cap < 0.09 ? CAP : 0);
      // the visitors' fans: a block of them on the far side, and a few here and there
      const block = s.kind === 'seat' && s.side === 0 && s.x > VISITORS[0] && s.x < VISITORS[1] && s.row >= VISITORS[2] && s.row <= VISITORS[3];
      if ((block && p[0] < 0.85) || p[0] < 0.015) {
        if (w.kind === 0) w.kind = 2;
        this.visitors.push({ who: i, shade: p[1] < 0.2 ? -1 : 0.6 + 0.4 * p[2] });
        w.look += (style < 0.42 ? TOP.jersey : style < 0.56 ? TOP.hoodie : style < 0.66 ? TOP.sleeves : TOP.plain) + (cap < 0.12 ? CAP : 0);
      } else if (pt.rank < HOME_MOST && p[1] < PARTY_FANS) {
        const shade = p[2] < HOME_WHITE ? -1 : (p[2] < HOME_WHITE + HOME_TRIM ? 1 : 0) + 0.6 + 0.4 * p[3];
        // (the towels: with those of the home side's in every building)
        if (w.kind === 0 && pt.rank < HOME_TOWELS && p[3] < 0.55) w.kind = 1;
        const top = pt.kit
          ? TOP.jersey
          : shade < 0
            ? style < 0.4
              ? TOP.jersey
              : style < 0.55
                ? TOP.sleeves
                : TOP.plain
            : style < 0.3
              ? TOP.jersey
              : style < 0.47
                ? TOP.hoodie
                : style < 0.59
                  ? TOP.sleeves
                  : style < 0.7
                    ? TOP.open
                    : TOP.plain;
        this.fans.push({ who: i, shade, rank: pt.rank, home: w.look + top + (cap < 0.16 ? CAP : 0), own: w.look + own, wear: w.wear, second: w.second });
        w.look += own;
      } else {
        w.look += own;
      }
    });

    // the draws: each side's people of each model (the rows by the floor's, then the rest's)
    const share = (geo: BufferGeometry, attrs: Record<string, InstancedBufferAttribute>) => {
      const g = keep(new BufferGeometry());
      g.setIndex(geo.index);
      for (const [name, a] of Object.entries(geo.attributes)) g.setAttribute(name, a);
      for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
      return g;
    };
    const numbers = (list: number[]) => new InstancedBufferAttribute(Float32Array.from(list.flatMap((i) => [who[i].seed, who[i].kind, who[i].tone, who[i].seat.lit])), 4);
    // (what he has on and its second colour: a side's fans' are painted in theirs, see paint and dress)
    const looks = (list: number[]) => new InstancedBufferAttribute(Float32Array.from(list.flatMap((i) => [...c.set(who[i].second).toArray(), who[i].look])), 4);
    const everyone = who.map((_, i) => i);
    this.blur = new InstancedMesh(share(models.far, { aWho: numbers(everyone), aLook: looks(everyone) }), mat, who.length);
    who.forEach((w, i) => {
      this.blur.setMatrixAt(i, w.at);
      this.blur.setColorAt(i, c.set(w.wear));
      this.people.push({ mesh: this.blur, slot: 0, all: i });
    });
    this.blur.frustumCulled = false;
    this.blur.visible = false;
    keep(this.blur);
    for (let side = 0; side < 4; side++)
      for (const fine of [true, false])
        (fine ? [...models.near, models.kid] : models.mid).forEach((geo, model) => {
          // (in his own number's order: a slow device leaves the last of the plain ones out, from all over the stands)
          const list = everyone.filter((i) => who[i].seat.side === side && who[i].fine === fine && who[i].model === model).sort((a, b) => who[a].seed - who[b].seed);
          if (!list.length) return;
          const aWho = numbers(list);
          const aLook = looks(list);
          const mesh = keep(new InstancedMesh(share(geo, { aWho, aLook }), mat, list.length));
          list.forEach((i, slot) => {
            mesh.setMatrixAt(slot, who[i].at);
            mesh.setColorAt(slot, c.set(who[i].wear));
            this.people[i].mesh = mesh;
            this.people[i].slot = slot;
          });
          this.bound(mesh);
          // (drawn before the seats and the steps they hide, the rows by the floor first: less is drawn twice)
          mesh.renderOrder = fine ? -3 : -2;
          this.main.add(mesh);
          // (the same people in a lighter model, for a device that can't keep up: see shed)
          const lighter = (geo: BufferGeometry, into: InstancedMesh[]) => {
            const m = keep(new InstancedMesh(share(geo, { aWho, aLook }), mat, list.length));
            m.instanceMatrix = mesh.instanceMatrix;
            m.instanceColor = mesh.instanceColor;
            m.boundingSphere = mesh.boundingSphere;
            m.visible = false;
            m.renderOrder = mesh.renderOrder;
            into.push(m);
            this.main.add(m);
          };
          if (!fine) {
            this.rest.push(mesh);
            lighter(models.low, this.restLow);
            lighter(models.far, this.restFar);
            return;
          }
          this.fine.push(mesh);
          lighter(models.mid[NEAR_MODELS[model]?.plain ?? 0] ?? models.mid[0], this.plain);
          lighter(models.low, this.least);
        });

    // the towels in the hands of those who brought one (see TOWEL_MOVE), each in his seat and on his beat
    const waving = everyone.filter((i) => who[i].kind === 1);
    const cloth = keep(new PlaneGeometry(1, 1, 1, 3));
    cloth.translate(0, 0.5, 0);
    cloth.setAttribute('aWho', numbers(waving));
    this.towels = new InstancedMesh(cloth, this.towelMat, waving.length);
    waving.forEach((i, slot) => {
      this.towels.setMatrixAt(slot, who[i].at);
      this.towels.setColorAt(slot, c.set(slot % 2 ? '#888' : '#f2f0ea'));
    });
    this.towels.frustumCulled = false;
    this.towels.visible = false;
    keep(this.towels);
    this.main.add(this.towels);

    // what a few in the seats have in their hands (see PROP_MOVE): a phone in the lap of those looking down at
    // one, a phone for those who hold one up, a sign or a foam finger with a few of the home fans (of those in
    // its colours in every building)
    const held: { i: number; kind: number }[] = [];
    let h = 53;
    const hand = () => ((h = (h * 16807) % 2147483647) & 0xffff) / 0xffff;
    const home = new Set(this.fans.filter((f) => f.rank < HOME_LEAST).map((f) => f.who));
    who.forEach((w, i) => {
      const r = hand();
      if (w.kind === 3) return;
      // (how he sits: the shader's own number, FAN_MOVE `habit`)
      const habit = Math.fround(Math.fround(w.seed) * Math.fround(17.31)) % 1;
      if (habit > 0.84) held.push({ i, kind: habit > 0.92 ? PROP.phoneUp : PROP.phone });
      else if (home.has(i) && w.kind === 0 && habit < 0.6 && r < SIGN_SHARE) held.push({ i, kind: PROP.sign });
      else if (home.has(i) && w.kind === 0 && r > 1 - FINGER_SHARE) held.push({ i, kind: PROP.finger });
    });
    const card = keep(new PlaneGeometry(1, 1));
    card.setAttribute('aWho', numbers(held.map((p) => p.i)));
    card.setAttribute('aProp', new InstancedBufferAttribute(Float32Array.from(held.map((p) => p.kind)), 1));
    // (where on the atlas its picture is: one of the four signs, the finger, the phone)
    card.setAttribute('aCell', new InstancedBufferAttribute(Float32Array.from(held.flatMap((p, k) => cell(p.kind === PROP.sign ? k % 4 : p.kind === PROP.finger ? 4 : 5))), 4));
    this.held = new InstancedMesh(card, this.propMat, Math.max(1, held.length));
    this.held.count = held.length;
    held.forEach((p, slot) => {
      this.held.setMatrixAt(slot, who[p.i].at);
      this.held.setColorAt(slot, c.setScalar(p.kind === PROP.phone || p.kind === PROP.phoneUp ? 1.25 : 1));
    });
    this.held.frustumCulled = false;
    keep(this.held);
    this.main.add(this.held);

    // the seats: the model in the rows by the floor, a back and a pan behind (two faces: nobody is near enough for more)
    for (let side = 0; side < 4; side++)
      for (const fine of [true, false]) {
        const list = seats.filter((s) => s.stall && s.side === side && s.row < NEAR_ROWS === fine);
        if (!list.length) continue;
        const mesh = keep(new InstancedMesh(fine ? models.stall : far, seatMat, list.length));
        list.forEach((s, i) => mesh.setMatrixAt(i, m.compose(at.set(s.x, s.y, s.z), q.setFromAxisAngle(up, s.turn), size.set(1, 1, 1))));
        this.bound(mesh);
        mesh.renderOrder = -1;
        this.stalls.push({ mesh, lit: list.map((s) => s.lit), sec: list.map(section), row: list.map((s) => s.row), own: list.map(() => rnd()) });
        this.main.add(mesh);
        if (!fine) continue;
        // (the same seats as the rows behind have them)
        const flat = keep(new InstancedMesh(far, seatMat, list.length));
        flat.instanceMatrix = mesh.instanceMatrix;
        flat.boundingSphere = mesh.boundingSphere;
        flat.renderOrder = -1;
        flat.visible = false;
        this.seats.push({ fine: mesh, flat });
        this.main.add(flat);
      }
    this.group.add(this.main, this.blur);
  }

  /** A draw's reach, for leaving it out when the camera looks elsewhere (his arms go up and he stands: a little more than he sits in). */
  private bound(mesh: InstancedMesh) {
    mesh.computeBoundingSphere();
    mesh.boundingSphere!.radius += 5;
  }

  /** Someone's top in colour `c`, and (`second`) the second colour on it: a jersey's trim and number, a sleeve, a cap; `look` what he has on (TOP and the rest), if it changes. */
  private wear(i: number, c: Color, second?: Color, look?: number) {
    const p = this.people[i];
    p.mesh.setColorAt(p.slot, c);
    this.blur.setColorAt(p.all, c);
    if (!second) return;
    for (const [mesh, slot] of [
      [p.mesh, p.slot],
      [this.blur, p.all],
    ] as const) {
      const a = mesh.geometry.getAttribute('aLook') as InstancedBufferAttribute;
      a.setXYZ(slot, second.r, second.g, second.b);
      if (look !== undefined) a.setW(slot, look);
    }
  }

  private flush() {
    for (const o of [...this.fine, ...this.rest, this.blur]) {
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
      o.geometry.getAttribute('aLook').needsUpdate = true;
    }
  }

  /**
   * The building's colour and the home side's second: the home fans' tops (most in the first, some in the
   * second, some in white) with the other on them, half the towels, the signs and foam fingers (with its
   * `letters`); the seats in `seats`, by section (bowl.ts section; the building's colour all round when not
   * said), or (`mix`, Venue.seatMix) mixed seat by seat, or shading from the first to the last up the rows.
   * `share` is how many of the parties are the home side's (Venue.crowd): the rest of those who might have
   * been wear their own. If the bowl has been built again since (a building with other stands: bowl.ts
   * Bowl.paint, which the building calls first), everyone sits again first, the visitors' fans in their colours.
   */
  paint(board: string, trim: string, seats: readonly string[] = [board], mix: 'sections' | 'confetti' | 'fade' = 'sections', letters = '', share = HOME_SHARE) {
    if (this.source.length !== this.count || this.source[0] !== this.first) {
      this.build();
      this.board = '';
      this.shed(this.level);
      if (this.away) this.dress(...this.away);
    }
    const key = `${board}|${trim}|${seats.join()}|${mix}|${letters}|${share}`;
    if (key === this.board) return;
    this.board = key;
    const c = new Color();
    const d = new Color();
    // (a dark colour is worn a little lighter than it is painted: a navy shirt under the lamps is not black)
    const lift = (to: Color, hex: string, shade: number) => {
      to.set(hex);
      const light = 0.2126 * to.r + 0.7152 * to.g + 0.0722 * to.b;
      return to
        .multiplyScalar(light < 0.06 ? (0.06 / Math.max(light, 0.008)) ** 0.6 : 1)
        .lerp(WHITE, light < 0.06 ? 0.05 : 0)
        .lerp(GREY.setScalar(Math.max(light, 0.03)), WORN * (light > 0.12 ? 1.5 : 1))
        .multiplyScalar(shade * (light > 0.12 ? 0.74 : 1));
    };
    // (the other colour on a fan's top: the second on the first, the first on the second or on the white; white on the first where the two are too alike)
    const alike =
      d
        .set(board)
        .sub(c.set(trim))
        .toArray()
        .reduce((n, v) => n + v * v, 0) < 0.02;
    for (const f of this.fans) {
      if (f.rank >= share) {
        this.wear(f.who, c.set(f.wear), d.set(f.second), f.own);
        continue;
      }
      const first = f.shade >= 0 && f.shade <= 1;
      const other = first ? (alike ? d.set(HOME_WHITE_WEAR) : lift(d, trim, 1)) : lift(d, board, 1);
      this.wear(f.who, f.shade < 0 ? c.set(HOME_WHITE_WEAR) : f.shade > 1 ? lift(c, trim, f.shade - 1) : lift(c, board, f.shade), other, f.home);
    }
    this.flush();
    const tones = seats.map((hex) => {
      const seat = new Color(hex);
      const grey = Math.max(0.2126 * seat.r + 0.7152 * seat.g + 0.0722 * seat.b, 0.03);
      // (a pale colour's seats would be the brightest thing in the stands: no seat is lighter than this)
      return seat.lerp(GREY.setScalar(grey), STALL_GREY).multiplyScalar(Math.min(1, STALL_MOST / grey));
    });
    c.set(board);
    for (let i = 1; i < this.towels.count; i += 2) this.towels.setColorAt(i, c);
    if (this.towels.instanceColor) this.towels.instanceColor.needsUpdate = true;
    // (a seat's colour: its section's; or, mixed, one of the three by its own number; or, shading, the last more often the higher its row)
    const tone = (sec: number, row: number, own: number) =>
      mix === 'confetti' ? (own < 0.5 ? 0 : own < 0.8 ? 1 : 2) : mix === 'fade' ? (own < (row / (ROWS - 1)) ** 1.3 ? 2 : row > 2 && own > 0.9 ? 1 : 0) : sec;
    for (const { mesh, lit, sec, row, own } of this.stalls) {
      lit.forEach((l, i) => mesh.setColorAt(i, c.copy(tones[tone(sec[i], row[i], own[i])] ?? tones[0]).multiplyScalar(STALL_TONE * l)));
      mesh.instanceColor!.needsUpdate = true;
    }
    for (const s of this.seats) s.flat.instanceColor = s.fine.instanceColor;
    paintHeld(this.atlas.image as HTMLCanvasElement, board, letters);
    this.atlas.needsUpdate = true;
  }

  /** The visitors' fans in the visitors' colour (a few in its second), the other on each. */
  dress(fill: string, trim: string) {
    this.away = [fill, trim];
    const c = new Color();
    const d = new Color();
    // (cloth, as the home side's: a shade toward grey)
    const cloth = (to: Color, hex: string, k: number) => {
      to.set(hex);
      return to.lerp(GREY.setScalar(Math.max(0.2126 * to.r + 0.7152 * to.g + 0.0722 * to.b, 0.03)), WORN * 0.7).multiplyScalar(k);
    };
    const alike =
      d
        .set(fill)
        .sub(c.set(trim))
        .toArray()
        .reduce((n, v) => n + v * v, 0) < 0.02;
    for (const f of this.visitors)
      this.wear(f.who, f.shade < 0 ? cloth(c, trim, 0.8) : cloth(c, fill, f.shade), f.shade < 0 ? cloth(d, fill, 0.9) : alike ? d.set(HOME_WHITE_WEAR) : cloth(d, trim, 0.9));
    this.flush();
  }

  /**
   * How much of their light the people keep (1: all of it; on their feet for a basket they are in more of it:
   * `people`), and the seats under them. The building tells it every frame, so the crowd keeps its own count
   * here too: each of the visitors' baskets has the home crowd hush (uHush goes up), and RUN of them with none
   * of the home side's between (see cheer) have it sit back in its seats, for SLUMP_S or until the home side scores.
   */
  dim(people: number, seats: number) {
    const { uHush, uTime, uSlump } = this.u;
    if (uHush.value > 0.5 && this.hushed <= 0.5 && ++this.run >= RUN) this.slumpUntil = uTime.value + SLUMP_S;
    this.hushed = uHush.value;
    const dt = Math.max(0, Math.min(0.25, uTime.value - this.clock));
    this.clock = uTime.value;
    const to = uTime.value < this.slumpUntil ? Math.min(1, 0.6 + 0.2 * (this.run - RUN)) : 0;
    uSlump.value += (to - uSlump.value) * (1 - Math.exp(-dt / (to > uSlump.value ? 1.5 : 2.5)));
    this.u.uDim.value = people;
    this.seatMat.color.setScalar(Math.min(1, seats));
    this.propMat.color.setScalar(people);
  }

  /**
   * A cheer goes up from (x, z), `big` (0 to 1) as it is: it takes the place of the older of the last two
   * (a cheer still going is kept, so nobody already up sits down for the next). A bigger one coming while one
   * is still young only makes that one bigger.
   */
  cheer(big: number, x: number, z: number) {
    const { uRipA: a, uRipB: b, uTime: t } = this.u;
    // (the home side has scored: the visitors' run is over)
    this.run = 0;
    this.slumpUntil = 0;
    const [young, old] = a.value.x >= b.value.x ? [a.value, b.value] : [b.value, a.value];
    if (t.value - young.x < 0.6) {
      young.y = Math.max(young.y, big);
      return;
    }
    old.set(t.value, big, x, z);
  }

  /** The towels are out (and how lit they are). */
  wave(on: boolean, dim: number) {
    this.towels.visible = on;
    this.towelMat.color.setScalar(dim);
  }

  /** The floor's mirror is being drawn: for it everyone is his trunk and his head, and there are no seats (on a device two steps down, nobody: the varnish shows the floor's own people and the boards). */
  mirror(on: boolean) {
    this.main.visible = !on;
    this.blur.visible = on && this.level < 2;
  }

  /**
   * A device that can't keep up, by the scene's steps: the rows by the floor in the plain model (1); the
   * rows behind in the lightest one and every seat two faces (2); the rows by the floor in the lightest
   * and the rows behind a trunk and a head each (3: a quarter of a million triangles for the whole house).
   * What the fans hold goes from the first.
   */
  shed(level: 0 | 1 | 2 | 3) {
    this.level = level;
    for (const o of this.fine) o.visible = level < 1;
    this.held.visible = level < 1;
    for (const o of this.plain) o.visible = level === 1 || level === 2;
    for (const o of this.least) o.visible = level > 2;
    for (const o of this.rest) o.visible = level < 2;
    for (const o of this.restLow) o.visible = level === 2;
    for (const o of this.restFar) o.visible = level > 2;
    for (const s of this.seats) {
      s.fine.visible = level < 2;
      s.flat.visible = level > 1;
    }
  }
}
