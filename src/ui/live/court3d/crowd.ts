// The people in the stands. Each is one of a few spectators Blender made (scripts/blender/arena.py: five
// for the rows by the floor, two plainer ones for the rows behind, one of some 140 triangles and a trunk
// and a head for a slow device and the floor's mirror), his own size, build, skin, hair and clothes,
// drawn in a handful of instanced draws a side (a side nobody is looking at is not drawn at all). What
// he wears is more than a colour where the camera is near enough to tell: the fragment shader draws a
// face on him and, by his own number, a jacket open over a shirt, a replica top, hoops, a check. Nothing is moved from here frame by frame: the
// shader sits each one in his seat, shifts him about, turns his head to the ball's end, leans a few on
// their knees, holds a phone up in a few hands, stands them up (a cheer goes out from the play across
// the building; a nervous end has them up with their hands at their faces), waves the towels, and
// empties the seats of those who have seen enough of a blowout. The seats themselves are here too,
// in the building's colour where nobody is in one.
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import type { Seat } from './bowl';
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

/** Which of the rows by the floor's models is the child (after the grown-ups). */
const KID = 6;
/** The rows by the floor whose people are the detailed ones (a low camera by the boards sees these close). */
const NEAR_ROWS = 5;
/** On the near side, the rows the broadcast's cameras look over: as many again, since they are as close to those. */
const CAMERA_ROWS = 8;
/** How far a spectator's hips are over his step (FAN_FOOT in arena.py). */
export const SEAT_UP = 1.3;
/** What the crowd wears when it isn't a team's colours: darks, denim, greys, a few colours, a few light. */
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
];
/** How many of the seats' people wear the home colour, and of those how many its white. */
const HOME_SHARE = 0.3;
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

/**
 * What the crowd's shader adds to a plain lit one. `aWho` is a fan's own numbers: his beat (0 to 1), who
 * he is for (0 the home side, 1 the same with a towel, 2 the visitors, 3 someone standing at the rail
 * behind the top row), his skin, and how much of the bowl's light reaches his seat. He sways and shifts
 * in his seat and his head follows the ball (uBall: its x and z, and in y how closely); as the cheer
 * comes up he stands (the keen ones first, those nearest the play first: uFrom is where it was, uLag the
 * cheer as it was a moment ago), most with their arms in the air, the rest clapping. A nervous end
 * (uStand) has the home crowd on its feet, hands down or up at their faces. A towel goes round over a
 * head (uWave); in the end behind the basket a visitor shoots free throws at, the home crowd gets up
 * and waves both arms (uRally, uEnd: that end's side of x); the visitors' fans get up for their own
 * (uAway), and the rest hold still while they do (uHush). A few hold a phone up when there is something
 * to film (uPhone). The rows by the floor take the boards' light (uLed). Those who have left (uLeave, uLeaveAway) are not there. The models
 * (scripts/blender/arena.py) say which of their points are what by `aPart`, and their joints are the
 * numbers here: change both. `fanAt` is where one of a fan's points is (the towels in their hands use it too).
 */
const FAN_MOVE = /* glsl */ `
  uniform float uTime;
  uniform float uCheer;
  uniform float uLag;
  uniform float uAway;
  uniform float uWave;
  uniform float uHush;
  uniform float uRally;
  uniform float uEnd;
  uniform float uStand;
  uniform float uPhone;
  uniform float uLeave;
  uniform float uLeaveAway;
  uniform vec3 uBall;
  uniform vec2 uFrom;
  float fanRally(float kind, mat4 seat) {
    // (a seat in the end stands faces along x; which end, its side of the floor)
    vec3 facing = seat[2].xyz;
    return kind > 1.5 ? 0.0 : uRally * step(0.7 * length(facing), abs(facing.x)) * step(0.0, seat[3].x * uEnd);
  }
  /** How far he is on his feet, and how far his arms are up with it. */
  vec2 fanUp(float seed, float kind, mat4 seat) {
    bool away = kind > 1.5 && kind < 2.5;
    float rally = fanRally(kind, seat);
    float towel = kind > 0.5 && kind < 1.5 ? max(uWave, rally) : 0.0;
    float lag = clamp(distance(seat[3].xz, uFrom) / 190.0, 0.0, 1.0);
    float cheer = away ? uAway : mix(uCheer, uLag, lag);
    float arms = max(smoothstep(0.0, 0.35, cheer * 1.5 - seed), max(towel, rally));
    float tense = away ? 0.0 : smoothstep(0.0, 0.3, uStand * 1.3 - fract(seed * 3.7));
    return vec2(max(arms, max(tense, step(2.5, kind))), arms);
  }
  /** How far gone he is (0 in his seat, 1 left): as the leaving reaches his number he gets up, and is away a moment after. */
  float fanGone(vec4 who) {
    return smoothstep(0.0, 0.03, (who.y > 1.5 && who.y < 2.5 ? uLeaveAway : uLeave) - 0.03 - fract(who.x * 5.71) * 0.97);
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
    float hop = arms * 0.22 * abs(sin(uTime * 7.0 + beat * 9.0));
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
    // (a few sit forward, elbows toward their knees; the rest sit back, each at his own angle)
    float bend = (habit < 0.2 ? 0.34 : 0.05 * sin(beat * 3.0)) * (1.0 - up);
    if (part > 1.5) {
      // an arm: it swings from the shoulder, and its forearm (the points under the elbow as it hangs) about
      // the elbow. A pose is how far forward the upper arm is, how far the elbow is bent, and how far his
      // hand comes in across him (under 0: out from him)
      float side = part < 2.5 ? 1.0 : -1.0;
      vec3 piv = vec3(side * 0.69, 1.55, 0.0);
      float keen = step(0.3, fract(seed * 7.3));
      float clap = sin(uTime * 15.0 + beat);
      float fist = step(fract(seed * 11.3), 0.3) * step(2.5, part);
      bool cloth = part < 2.5 && towel > 0.0;
      float wave = max(part < 2.5 ? towel : 0.0, rally);
      // sat: hands on his knees, elbows on them with his hands together (those sat forward), hands together in
      // his lap, or (a few) one hand up with a phone
      float folded = step(0.45, habit) * step(habit, 0.7);
      float phone = habit > 0.84 && part < 2.5 ? uPhone : 0.0;
      vec3 lap = habit < 0.2 ? vec3(0.7, 1.55, 0.72) : vec3(0.3, 1.15, 0.0);
      vec3 sat = mix(mix(lap, vec3(0.22, 1.42, 0.8), folded), vec3(1.0, 1.35, 0.25), phone);
      // on his feet with nothing to cheer: arms down, or both hands up at his face
      vec3 stood = habit < (kind > 2.5 ? 0.1 : 0.35) ? vec3(0.95, 2.25, 0.5) : vec3(0.06, 0.2, 0.0);
      // cheering: both arms up, each as high and as bent as he likes, or one fist and the other hand at his
      // chest; the rest clap in front of their chests
      float pump = sin(uTime * 9.0 + beat * 3.0);
      vec3 both = vec3(2.2 + 0.6 * fract(seed * 29.0) + 0.2 * pump, 0.35 + 0.6 * fract(seed * 13.0) - 0.25 * pump, -0.5);
      vec3 high = keen > 0.5 ? mix(both, vec3(0.5, 1.9, 0.5), fist) : vec3(0.78, 1.5 + 0.14 * clap, 0.92 + 0.1 * clap);
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
      // his head, about his neck: toward the ball, loosely, and off round the building now and then
      vec2 to = uBall.xz - seat[3].xz;
      float yaw = clamp(atan(dot(to, seat[0].xz), dot(to, seat[2].xz)), -0.8, 0.8) * uBall.y;
      yaw += 0.22 * sin(uTime * 0.23 + beat * 7.0) + 0.5 * smoothstep(0.9, 1.0, sin(uTime * 0.11 + beat * 23.0));
      vec2 h = p.xz - vec2(0.0, -0.03);
      p.xz = vec2(0.0, -0.03) + vec2(h.x * cos(yaw) + h.y * sin(yaw), h.y * cos(yaw) - h.x * sin(yaw));
    }
    p.yz = vec2(p.y * cos(bend) - p.z * sin(bend), p.y * sin(bend) + p.z * cos(bend));
    // the rest of him goes where the top of his thighs goes: up, and forward over his feet
    p.y += 1.2 * sin(swing) + hop;
    p.z += 1.2 * (1.0 - cos(swing));
    // (he leans from the hips, a little, on his own beat, and now and then shifts in his seat; the home
    // crowd holds still while the visitors celebrate)
    float still = away ? 1.0 : 1.0 - 0.85 * uHush;
    float lean = p.y * 0.5;
    float shift = smoothstep(0.86, 1.0, sin(uTime * 0.19 + beat * 13.0)) * sign(habit - 0.5);
    p.x += lean * (0.07 * sin(uTime * 0.8 + beat * 5.0) + 0.16 * shift) * still;
    p.z += lean * (0.05 * sin(uTime * 0.37 + beat * 11.0) * still + 0.12 * arms);
    return p;
  }`;
const CROWD_HEAD = /* glsl */ `
  attribute vec4 aWho;
  attribute float aPart;
  uniform float uDim;
  varying vec2 vBounce;
  varying vec4 vFace;
  varying vec2 vOwn;
  ${FAN_MOVE}`;
const CROWD_COLOR = /* glsl */ `
  float tone = aWho.z;
  vec3 skin = tone < 0.5 ? mix(vec3(0.045, 0.026, 0.018), vec3(0.19, 0.11, 0.07), tone * 2.0) : mix(vec3(0.19, 0.11, 0.07), vec3(0.5, 0.35, 0.26), tone * 2.0 - 1.0);
  // (what else he has on comes from his own number)
  float own = fract(aWho.x * 91.7);
  // (a quarter over a part's number is skin or an end: his neck, hair on a head, a bare arm or a hand, a shoe; a half is a cap)
  float over = fract(aPart);
  bool tip = over > 0.1 && over < 0.4;
  vec3 wear = vColor;
  if (aPart > 3.5) {
    // his legs: trousers darker than his top (black, denim, khaki), shoes dark, on a few pale
    vec3 legs = own < 0.3 ? vec3(0.016) : mix(vec3(0.02, 0.028, 0.055), vec3(0.11, 0.095, 0.07), fract(own * 3.0));
    wear = color * (tip ? mix(vec3(0.014), vec3(0.3), step(0.74, fract(own * 11.0))) : legs);
  } else if (aPart > 1.5) {
    if (tip) wear = color * skin;
  } else if (aPart > 0.5) {
    // a head: a face, and hair (dark, brown, on the fair a few light, a few grey)
    float dye = fract(own * 13.0);
    vec3 hair = dye < 0.5 ? vec3(0.012) : dye < 0.8 || tone < 0.5 ? vec3(0.06, 0.035, 0.02) : dye < 0.93 ? vec3(0.28, 0.21, 0.11) : vec3(0.3, 0.3, 0.31);
    wear = over > 0.4 ? vColor * 0.85 : color * (tip ? hair : skin);
  } else if (tip) {
    // (his neck, above his collar)
    wear = color * skin;
  }
  // (how much of the bowl's light reaches his seat: bowl.ts lit, the same number his seat and his step take; and
  // the less of it, the less colour his clothes show)
  // (where on his face a point of it is, as the model has it: the fragment draws his eyes and his mouth there)
  // (and where on his trunk a point of his top is: 2)
  vFace = aPart > 0.5 && aPart < 1.5 && over < 0.1 ? vec4(position, 1.0) : aPart < 0.5 && over < 0.1 ? vec4(position, 2.0) : vec4(0.0);
  float reach = aWho.w;
  // (which top he has on, from his own number; and how lit he is, for what shows under it)
  vOwn = vec2(fract(own * 7.31), uDim * reach * color.r);
  wear = mix(vec3(dot(wear, vec3(0.2126, 0.7152, 0.0722))), wear, mix(${DIM_COLOUR}, 1.0, smoothstep(0.25, 0.7, reach)));
  vColor = wear * (uDim * reach);`;
/** Where he is; and how square on to the floor this point of him is (the floor is the brightest thing in the building: it lights the faces and the fronts of those looking at it). */
const CROWD_MOVE = /* glsl */ `
  float gone = smoothstep(0.45, 1.0, fanGone(aWho));
  transformed = fanAt(transformed, aPart, aWho, instanceMatrix) * (1.0 - gone);
  // (going: he turns for the aisle and is lost among those still sat)
  transformed.z -= gone * 1.2;
  // (a floor is a broad light: it comes round a cheek and a shoulder, not off at their edge)
  vBounce.x = max(0.0, (dot(normalize(mat3(instanceMatrix) * objectNormal), normalize(vec3(0.0, 3.0, 0.0) - instanceMatrix[3].xyz)) + 0.4) / 1.4);
  // (and the boards': on those sat by them, the first rows, on the side of them that faces the floor)
  vBounce.y = smoothstep(9.0, 2.2, instanceMatrix[3].y) * (0.3 + 0.7 * vBounce.x);`;
/**
 * A face: the dark of his eyes under a brow and the line of his mouth, drawn where the model's head has
 * them (arena.py fan: eyes at 2.3 ft over his hips, mouth at 2.03), and gone before they are too small to
 * hold: then the shade of his eye sockets is what is left, and a far row's faces are a tone, as they are
 * from across a building. And his top (a point of his trunk: vFace.w 2), by his own number: a jacket or a
 * hood open in a V over a shirt with a zip under it, a replica top (dark panels down its sides, a band
 * across the chest), hoops, a check; everyone's has a band at the neck. Gone, as the face is, where a
 * stripe would be finer than a dot.
 */
const CROWD_FACE = /* glsl */ `
  if (vFace.w > 0.95 && vFace.w < 1.05 && vFace.z > 0.15) {
    vec2 f = vec2(abs(vFace.x), vFace.y);
    float fine = fwidth(vFace.y);
    float seen = 1.0 - smoothstep(0.012, 0.035, fine);
    float eye = 1.0 - smoothstep(0.65, 1.15, length((f - vec2(0.115, 2.315)) / vec2(0.058, 0.026)));
    float brow = 1.0 - smoothstep(0.6, 1.2, length((f - vec2(0.12, 2.385)) / vec2(0.085, 0.013)));
    float mouth = 1.0 - smoothstep(0.6, 1.2, length((vFace.xy - vec2(0.0, 2.035)) / vec2(0.09, 0.015)));
    float socket = 1.0 - smoothstep(0.4, 1.3, length((f - vec2(0.115, 2.33)) / vec2(0.11, 0.07)));
    float far = (1.0 - seen) * (1.0 - smoothstep(0.03, 0.1, fine));
    diffuseColor.rgb *= 1.0 - max(eye * 0.82, max(brow * 0.5, mouth * 0.5)) * seen - 0.3 * socket * far;
  } else if (vFace.w > 1.9) {
    vec3 q = vFace.xyz;
    float seen = 1.0 - smoothstep(0.02, 0.07, fwidth(q.y));
    float front = smoothstep(0.02, 0.1, q.z);
    float k = vOwn.x;
    float dark = 0.16 * smoothstep(1.6, 1.66, q.y);
    float under = 0.0;
    if (k < 0.24) {
      under = 0.8 * front * smoothstep(0.0, 0.025, (q.y - 1.3) * 0.3 - abs(q.x));
      dark = max(dark, 0.5 * front * (1.0 - smoothstep(0.01, 0.028, abs(q.x))) * step(q.y, 1.32));
    } else if (k < 0.42) {
      dark = max(dark, 0.34 * smoothstep(0.34, 0.39, abs(q.x)));
      under = 0.3 * front * (1.0 - smoothstep(0.04, 0.055, abs(q.y - 1.2))) * (1.0 - smoothstep(0.3, 0.34, abs(q.x)));
    } else if (k < 0.54) {
      dark = max(dark, 0.3 * smoothstep(-0.3, 0.3, sin(q.y * 23.0)));
    } else if (k < 0.64) {
      dark = max(dark, 0.26 * step(0.0, sin(q.x * 27.0) * sin(q.y * 27.0)));
      dark = max(dark, 0.4 * front * (1.0 - smoothstep(0.008, 0.022, abs(q.x))));
    }
    // (what shows in the V, or the band's colour: a white shirt, a grey one, a black one)
    float tee = fract(k * 37.0);
    vec3 shirt = (tee < 0.5 ? vec3(0.4, 0.39, 0.37) : tee < 0.8 ? vec3(0.2, 0.2, 0.21) : vec3(0.03)) * vOwn.y;
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - dark * seen), shirt, under * seen);
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
    uCheer: { value: 0 },
    uLag: { value: 0 },
    uAway: { value: 0 },
    uWave: { value: 0 },
    uHush: { value: 0 },
    uRally: { value: 0 },
    uEnd: { value: -1 },
    uStand: { value: 0 },
    uPhone: { value: 0 },
    uLeave: { value: 0 },
    uLeaveAway: { value: 0 },
    uBall: { value: new Vector3(0, 0, 0) },
    uFrom: { value: new Vector2() },
    uDim: { value: 1 },
    /** The LED boards' light on the rows by them (a colour, as bright as they are). */
    uLed: { value: new Color(0, 0, 0) },
  };
  /** The crowd as it is drawn, and as the floor's mirror draws it (a trunk and a head each). */
  private readonly main = new Group();
  private readonly blur: InstancedMesh;
  private readonly people: Person[] = [];
  /** Who wears the home colour (and how deep a shade of it, or its white), and who the visitors'. */
  private readonly fans: { who: number; shade: number }[] = [];
  private readonly visitors: { who: number; shade: number }[] = [];
  private readonly towels: InstancedMesh;
  private readonly towelMat: MeshBasicMaterial;
  private readonly seatMat: MeshLambertMaterial;
  /** The seats, a draw a side for the rows by the floor and one for the rest; how lit each seat is. */
  private readonly stalls: { mesh: InstancedMesh; lit: number[] }[] = [];
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
  private level = 0;

  constructor(keep: Keep, models: Fans, seats: Seat[]) {
    let n = 11;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    const mat = keep(new MeshLambertMaterial({ color: 0xffffff, vertexColors: true }));
    mat.onBeforeCompile = (sh) => {
      unshadowed(sh);
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>${CROWD_HEAD}`)
        .replace('#include <color_vertex>', `#include <color_vertex>${CROWD_COLOR}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>${CROWD_MOVE}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vBounce;\nvarying vec4 vFace;\nvarying vec2 vOwn;\nuniform vec3 uLed;')
        .replace('#include <color_fragment>', `#include <color_fragment>${CROWD_FACE}`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * (${FILL} + ${BOUNCE} * vBounce.x + uLed * vBounce.y);`,
        );
    };
    mat.customProgramCacheKey = () => 'crowd';

    // who sits where: the seat's person (a few seats empty, more of them higher up), his model, size and build
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const at = new Vector3();
    const size = new Vector3();
    const c = new Color();
    const who: { seat: Seat; model: number; fine: boolean; at: Matrix4; seed: number; kind: number; tone: number; wear: string }[] = [];
    for (const s of seats) {
      const full = s.kind === 'seat' ? 0.975 - 0.07 * (s.row / 17) : s.kind === 'court' ? 0.9 : 1;
      const r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
      if (r[0] > full) continue;
      const fine = s.kind === 'court' || (s.kind === 'seat' && s.row < (s.side === 3 ? CAMERA_ROWS : NEAR_ROWS));
      const child = r[2] < 0.05;
      const model = fine ? (child ? KID : r[1] < 0.22 ? 0 : r[1] < 0.38 ? 1 : r[1] < 0.58 ? 2 : r[1] < 0.72 ? 3 : r[1] < 0.87 ? 4 : 5) : r[1] < 0.58 ? 0 : 1;
      // (a child here and there; the women's models a little narrower)
      const tall = child ? 0.7 + r[3] * 0.1 : 0.95 + r[3] * 0.16;
      const slim = fine ? model === 2 || model === 3 : model === 1;
      const wide = tall * (slim ? 0.9 + r[4] * 0.12 : 0.94 + r[4] * 0.2);
      q.setFromAxisAngle(up, s.turn + (r[5] - 0.5) * 0.3);
      who.push({
        seat: s,
        model,
        fine,
        at: new Matrix4().compose(at.set(s.x, s.y + SEAT_UP * (s.kind === 'seat' ? 1 : tall), s.z), q, size.set(wide, tall, (wide + tall) / 2)),
        seed: r[6],
        kind: s.kind === 'stand' ? 3 : 0,
        tone: 0.2 + 0.8 * rnd() ** 0.75,
        wear: WEAR[Math.floor(rnd() * WEAR.length)],
      });
    }
    // who is for whom (from its own numbers: the crowd's sizes and colours stay as they are whoever plays)
    let k = 29;
    const pick = () => ((k = (k * 16807) % 2147483647) & 0xffff) / 0xffff;
    who.forEach((w, i) => {
      const s = w.seat;
      const p = [pick(), pick(), pick(), pick()];
      // the visitors' fans: a block of them on the far side, and a few here and there
      const block = s.kind === 'seat' && s.side === 0 && s.x > VISITORS[0] && s.x < VISITORS[1] && s.row >= VISITORS[2] && s.row <= VISITORS[3];
      if ((block && p[0] < 0.85) || p[0] < 0.015) {
        if (w.kind === 0) w.kind = 2;
        this.visitors.push({ who: i, shade: p[1] < 0.2 ? -1 : 0.6 + 0.4 * p[2] });
      } else if (p[1] < HOME_SHARE) {
        this.fans.push({ who: i, shade: p[2] < HOME_WHITE ? -1 : (p[2] < HOME_WHITE + HOME_TRIM ? 1 : 0) + 0.6 + 0.4 * p[3] });
        if (w.kind === 0 && p[3] < 0.45) w.kind = 1;
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
    const everyone = who.map((_, i) => i);
    this.blur = new InstancedMesh(share(models.far, { aWho: numbers(everyone) }), mat, who.length);
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
          const mesh = keep(new InstancedMesh(share(geo, { aWho }), mat, list.length));
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
            const m = keep(new InstancedMesh(share(geo, { aWho }), mat, list.length));
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
          lighter(models.mid[model === 2 || model === 3 ? 1 : 0], this.plain);
          lighter(models.low, this.least);
        });

    // the towels in the hands of those who brought one (see TOWEL_MOVE), each in his seat and on his beat
    const waving = everyone.filter((i) => who[i].kind === 1);
    const cloth = keep(new PlaneGeometry(1, 1, 1, 3));
    cloth.translate(0, 0.5, 0);
    cloth.setAttribute('aWho', numbers(waving));
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
    this.towels = new InstancedMesh(cloth, this.towelMat, waving.length);
    waving.forEach((i, slot) => {
      this.towels.setMatrixAt(slot, who[i].at);
      this.towels.setColorAt(slot, c.set(slot % 2 ? '#888' : '#f2f0ea'));
    });
    this.towels.frustumCulled = false;
    this.towels.visible = false;
    keep(this.towels);
    this.main.add(this.towels);

    // the seats: the model in the rows by the floor, a back and a pan behind (two faces: nobody is near enough for more)
    const seatMat = (this.seatMat = keep(new MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: DoubleSide })));
    const far = keep(new BufferGeometry());
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
    seatMat.onBeforeCompile = unshadowed;
    for (let side = 0; side < 4; side++)
      for (const fine of [true, false]) {
        const list = seats.filter((s) => s.stall && s.side === side && s.row < NEAR_ROWS === fine);
        if (!list.length) continue;
        const mesh = keep(new InstancedMesh(fine ? models.stall : far, seatMat, list.length));
        list.forEach((s, i) => mesh.setMatrixAt(i, m.compose(at.set(s.x, s.y, s.z), q.setFromAxisAngle(up, s.turn), size.set(1, 1, 1))));
        this.bound(mesh);
        mesh.renderOrder = -1;
        this.stalls.push({ mesh, lit: list.map((s) => s.lit) });
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

  private wear(i: number, c: Color) {
    const p = this.people[i];
    p.mesh.setColorAt(p.slot, c);
    this.blur.setColorAt(p.all, c);
  }

  private flush() {
    for (const o of [...this.fine, ...this.rest, this.blur]) if (o.instanceColor) o.instanceColor.needsUpdate = true;
  }

  /** The building's colour and the home side's second: the home fans' tops (most in the first, some in the second, some in white), half the towels, the seats. */
  paint(board: string, trim: string) {
    if (board + trim === this.board) return;
    this.board = board + trim;
    const c = new Color();
    // (a dark colour is worn a little lighter than it is painted: a navy shirt under the lamps is not black)
    const lift = (hex: string, shade: number) => {
      c.set(hex);
      const light = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      return c
        .multiplyScalar(light < 0.06 ? (0.06 / Math.max(light, 0.008)) ** 0.6 : 1)
        .lerp(WHITE, light < 0.06 ? 0.05 : 0)
        .lerp(GREY.setScalar(Math.max(light, 0.03)), WORN * (light > 0.12 ? 1.5 : 1))
        .multiplyScalar(shade * (light > 0.12 ? 0.74 : 1));
    };
    for (const f of this.fans) this.wear(f.who, f.shade < 0 ? c.set(HOME_WHITE_WEAR) : f.shade > 1 ? lift(trim, f.shade - 1) : lift(board, f.shade));
    this.flush();
    const seat = new Color(board);
    const grey = Math.max(0.2126 * seat.r + 0.7152 * seat.g + 0.0722 * seat.b, 0.03);
    // (a pale colour's seats would be the brightest thing in the stands: no seat is lighter than this)
    seat.lerp(GREY.setScalar(grey), STALL_GREY).multiplyScalar(Math.min(1, STALL_MOST / grey));
    c.set(board);
    for (let i = 1; i < this.towels.count; i += 2) this.towels.setColorAt(i, c);
    if (this.towels.instanceColor) this.towels.instanceColor.needsUpdate = true;
    for (const { mesh, lit } of this.stalls) {
      lit.forEach((l, i) => mesh.setColorAt(i, c.copy(seat).multiplyScalar(STALL_TONE * l)));
      mesh.instanceColor!.needsUpdate = true;
    }
    for (const s of this.seats) s.flat.instanceColor = s.fine.instanceColor;
  }

  /** The visitors' fans in the visitors' colour (a few in its second). */
  dress(fill: string, trim: string) {
    const c = new Color();
    // (cloth, as the home side's: a shade toward grey)
    const cloth = (hex: string, k: number) => {
      c.set(hex);
      return c.lerp(GREY.setScalar(Math.max(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 0.03)), WORN * 0.7).multiplyScalar(k);
    };
    for (const f of this.visitors) this.wear(f.who, f.shade < 0 ? cloth(trim, 0.8) : cloth(fill, f.shade));
    this.flush();
  }

  /** How much of their light the people keep (1: all of it; on their feet for a basket they are in more of it: `people`), and the seats under them. */
  dim(people: number, seats: number) {
    this.u.uDim.value = people;
    this.seatMat.color.setScalar(Math.min(1, seats));
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
   */
  shed(level: 0 | 1 | 2 | 3) {
    this.level = level;
    for (const o of this.fine) o.visible = level < 1;
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
