# The player: one athlete's body on the 18 bones the game's puppet drives (figure.ts), dressed.
#
# How it's made: the body's masses (trunk, limbs, palms) are laid out as simple solids and fused
# into one skin (voxel remesh, then smoothed), so a shoulder runs into an arm without a seam. His
# head is a skin of its own, shaped by a formula (skull: a cranium over a face cut in flat faces, the
# jaw's line an edge; head_r: on that a brow's ridge, the eyes' sockets and their balls and lids,
# cheekbones, a nose with a bridge, wings and nostrils, lips, a chin), so a face keeps its form however
# few triangles it gets, and the app can paint eyes and a mouth where the formula put them; it sits
# down over the top of his neck. His lips part along the line of his mouth (the dark of it and his
# teeth are behind them), his ears are shells with a rolled rim, and his neck has its two cords and
# an Adam's apple.
# The clothes are that same skin, pushed out and cut along planes (a V-neck vest tucked into shorts
# with two legs, socks), so they sit on him and move with him; the skin under them is cut away.
# His arms and legs are bone and muscle (a deltoid, biceps and triceps, the forearm's bellies, a kneecap,
# hamstrings, a calf), and a girdle ties each arm to his trunk (trapezius, chest, back, collarbone).
# Fingers, ears and basketball shoes (shoe_fine: sole, upper, collar, tongue, laces; high or low) are built by hand and joined on, and so is hair that stands off a
# head (a bun, a tail, twists, locks, braids: the app draws a man with one of them or none). Each
# point follows the bones near it (weights are a function of where the point is), and the shade of
# every hollow is baked in. Beyond the puppet's bones he has leaves the app turns itself: two
# joints of each finger and of his thumb on each hand, his jaw and nose, whose sizes make one face unlike another (and
# his jaw comes open), and on the floor his brows and his lower lip.
#
# He stands with his arms out from his sides (they can't be fused hanging against the trunk); the
# rig's bones carry that pose, so the game needs to know nothing about it.
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: E402,F403
import mhbody  # noqa: E402

# the 6 ft 6 puppet's measures (src/ui/live/court3d/puppet.ts), feet
HIP, THIGH, SHIN, ANKLE = 3.35, 1.62, 1.55, 0.28
TORSO, SHOULDER, HIP_W, UARM, FARM, HEAD = 1.95, 0.84, 0.4, 1.1, 1.05, 0.8
CHEST_Y = HIP + TORSO
HEAD_Y = CHEST_Y + HEAD
SH_Y = CHEST_Y - 0.14
KN_Y = HIP - THIGH
AN_Y = KN_Y - SHIN
FLOOR = AN_Y - ANKLE
ARM = UARM + FARM
ARM_OUT = math.radians(38)

# the clothes
WAIST = HIP + 0.42
# (a game's shorts today come down to the top of the knee, cut wide: the hem stops short of the kneecap so a bent knee doesn't push through it)
HEM = KN_Y + 0.13
# where the shorts' two legs part (lower than his own fork: they hang)
FORK = HIP - 0.66
TUCK = WAIST - 0.07
SOCK_LO, SOCK_HI = AN_Y + 0.02, AN_Y + 0.78
# the vest's armholes (a plane each side) and its V neck (two planes, lower in front)
# (the armhole leans in toward his neck, as a vest's does: its strap narrow on top of the shoulder, its foot under the armpit)
PIT = 0.72, 4.74
PIT_N = Vector((0.954, 0.3, 0)).normalized()
VK, VM, VC = 1.0, 0.5, 5.27
VLEN = math.sqrt(1 + VK * VK + VM * VM)
TRIM = 0.038
# the head (a tenth bigger than a real one for his height, as a figurine's is: narrower than it is
# long, longer than it is deep), set forward on his neck as a head is
HEAD_W, HEAD_H, HEAD_D = 0.3, 0.42, 0.37
HEAD_C = (0, HEAD_Y + 0.045, 0.05)
#: How far (ft) the rays that find a real face's own hollows go, and how dark a point is that all of them meet.
FACE_REACH, FACE_LOW = 0.25, 0.45
UNDER = 0.17
# how many triangles his head is given (most of them his face's)
HEAD_TRIS = 6040
# his hair, cropped: the scalp over a line that runs from his forehead down past the top of each ear to the nape
HAIR_AT, HAIR_FRONT, HAIR_BACK = 0.3, 0.5, 0.85

BONES = ['pelvis', 'chest', 'head', 'ual', 'fal', 'hal', 'uar', 'far', 'har', 'thl', 'shl', 'ftl', 'thr', 'shr', 'ftr', 'hem', 'hemL', 'hemR']
# (the puppet drives those; these are leaves only figure.ts turns, each with the bone it goes with when nothing
# does: each hand's fingers at the knuckles and at their middle joints, and two that shape a face, his jaw and his nose)
# (and one that hair which hangs swings from)
LEAVES = {'kn1l': 'hal', 'kn2l': 'kn1l', 'kn1r': 'har', 'kn2r': 'kn1r', 'jaw': 'head', 'nose': 'head', 'hair': 'head'}
# (and, on the player only, one his brows hang on, that figure.ts lowers when he strains or shouts; one for his lower lip and
# teeth, which open with his jaw but are never made wider or longer with it, so his lips meet whatever his jaw's shape; one at each shoulder that figure.ts turns half way from his chest to his upper arm: the
# cap of the shoulder goes with it (and his armpit with one of its own: see AXILLA), so an arm raised overhead or hung at his side keeps its shoulder;
# and one down each forearm that takes part of the hand's turn about it, so a wrist turns over the length of the
# forearm, as the two bones in it do, and not in a twist of skin at the wrist.
# The people round the floor, people.py, are seen from far off and keep the bones above.)
GIRDLE = {'cll': 'chest', 'clr': 'chest', 'fwl': 'fal', 'fwr': 'far', 'brow': 'head', 'lip': 'head'}
# (and, under each shoulder's, one his armpit hangs on: figure.ts turns it as the shoulder's, but about the hollow of the
# armpit, not the joint, so an arm raised overhead stretches the skin under it up from his side, not out from it in a shelf)
AXILLA = {'axl': 'chest', 'axr': 'chest'}
# (and one in the small of his back, between his pelvis and his ribs, and one in his neck, between his ribs and his head:
# figure.ts puts the first on the curve of his spine and turns it part of the way from his hips to his chest, and the
# second along his neck, turned half way from his chest to his head. His back bends and turns along its length, and a
# head turned to the side turns his neck along its own, not in a wrung band under his jaw. SPINE_AT: how far up his
# trunk's line the first is; NECK_AT: how far up from his chest's joint the foot of the second (figure.ts's, both))
TRUNK = {'spine': 'pelvis', 'neck': 'chest'}
SPINE_AT, NECK_AT = 0.42, 0.22
# (and each finger a hand of its own: LEAVES' kn1 and kn2 are his middle finger's knuckle and middle joint, and these his
# index, ring and little fingers' and his thumb's (its root, down in the heel of his hand, and its middle knuckle), on
# everyone: a hand closes into a fist, points, spreads over the ball, its thumb round it)
DIGIT_BONES = {'ix': 'index', 'kn': 'middle', 'rg': 'ring', 'pk': 'little', 'th': 'thumb'}
FINGER_LEAVES = {f'{d}{k}{sfx}': (f'{d}1{sfx}' if k == 2 else f'ha{sfx}') for d in DIGIT_BONES if d != 'kn' for k in (1, 2) for sfx in 'lr'}
girdled = False


def leaves():
    return {**LEAVES, **FINGER_LEAVES, **GIRDLE, **AXILLA, **TRUNK} if girdled else {**LEAVES, **FINGER_LEAVES}
SKIN, HAIR, JERSEY, TRIM_M, CLOTH, SHOE, WHITE = 'skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white'
# hair that is a shape of its own (a man wears one of them or none: figure.ts leaves the others out)
BUN, TAIL, TWISTS, LOCS, BRAIDS, AFRO, HIGHTOP, CURLS = 'bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'
# what a hand-built part hangs on (anything else: by where each point is)
BY_PLACE, SHORTS, HAND_L, HAND_R, ON_HEAD, FOOT_L, FOOT_R, FACE, SWINGS, ON_JAW = range(10)
# (and a point of the real man's skin, mhbody.py's: by where it is, as BY_PLACE, but each finger's share of it is the one his own modellers gave it)
REAL = 10
# the man on the floor's head: a real man's for his height (the formula's, HEAD_W and the rest, is wider for its height
# than a head is: the benches and the stands keep that one). figure.ts's HEAD_SIZE.
PLAYER_HEAD = (0.28, 0.465, 0.376)
# the real man while he is being built (mhbody.Player), and his head's skin to find a point of his scalp on (see on_head)
_real = None
_scalp = None
_balls = None
RIGID = {ON_HEAD: 'head', FOOT_L: 'ftl', FOOT_R: 'ftr', ON_JAW: 'lip'}
# what is behind his lips (see mouth): the dark at the back of it, his teeth, his gums, his tongue; and his ears
MOUTH, TEETH, GUM, TONGUE, EAR = 'mouth', 'teeth', 'gum', 'tongue', 'ear'
# where the knuckles are down the arm from the wrist (the middle finger's; the others' a little nearer: see fingers)
KNUCKLE = 0.4
# where his jaw and his nose are scaled about, from the head's middle (in its half sizes: his jaw's from the height
# of the line of his mouth, so a longer chin never parts his lips), and where his brows hang from
JAW_AT, NOSE_AT, BROW_AT = (0, -0.5, 0.25), (0, -0.2, 0.8), (0, 0.24, 0.8)
# where hair that hangs swings from (the same way), and his hairline as figure.ts paints it: how high it is
# (the height of a unit direction from the head's middle) by how far round from the front (radians)
SWING_AT = (0, 0.1, -0.6)
HAIRLINE = [(0, 0.6), (0.55, 0.61), (0.9, 0.64), (1.2, 0.5), (1.36, 0.1), (1.52, 0.25), (1.98, 0.22), (2.3, -0.18), (2.65, -0.4), (3.15, -0.44)]


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def sstep(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def G(v):
    """A Blender point, in the game's frame."""
    return Vector((v.x, v.z, -v.y))


def arm_frame(s):
    """The arm's own frame (x its hinge, y back up it, z forward) at the shoulder, in the game's: side s is 1 for his left."""
    a = s * ARM_OUT
    c, sn = math.cos(a), math.sin(a)
    return Matrix(((c, -sn, 0, s * SHOULDER), (sn, c, 0, SH_Y), (0, 0, 1, 0), (0, 0, 0, 1)))


ARM_INV = {s: arm_frame(s).inverted() for s in (1, -1)}


def ring(c, rx, rz, seg, rzb=None, frame=None, square=2.0):
    """An ellipse of points round c, flat in y: rz in front, rzb behind (a chest is not a barrel). `square` over 2 flattens its sides toward a box's."""
    pts = []
    e = 2.0 / square
    for k in range(seg):
        a = 2 * math.pi * k / seg
        cs, sn = math.cos(a), math.sin(a)
        px, pz = math.copysign(abs(cs) ** e, cs), math.copysign(abs(sn) ** e, sn)
        p = Vector((c[0] + px * rx, c[1], c[2] + pz * (rz if sn >= 0 or rzb is None else rzb)))
        pts.append(tuple(frame @ p) if frame else tuple(p))
    return pts


def solid(rings, name):
    o = loft(rings, name)
    fix_normals(o)
    return o


def tag(obj, value):
    a = obj.data.attributes.get('tag') or obj.data.attributes.new('tag', 'INT', 'POINT')
    a.data.foreach_set('value', [value] * len(obj.data.vertices))
    return obj


def copy(obj, name):
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = name
    return link(o)


# --- the body's masses ---

def trunk():
    # (height, half width, depth in front, depth behind, how far forward its middle sits)
    st = [
        (2.74, 0.05, 0.05, 0.05, 0.0),
        (2.80, 0.2, 0.17, 0.19, 0.0),
        (2.95, 0.43, 0.31, 0.37, 0.0),
        (3.15, 0.56, 0.36, 0.45, -0.02),
        (3.37, 0.545, 0.36, 0.41, -0.02),
        (3.60, 0.51, 0.335, 0.34, -0.01),
        (3.81, 0.5, 0.33, 0.31, 0.0),
        (4.10, 0.53, 0.35, 0.32, 0.0),
        (4.40, 0.59, 0.39, 0.34, 0.005),
        (4.79, 0.685, 0.455, 0.375, 0.01),
        (5.09, 0.74, 0.455, 0.385, 0.0),
        (5.27, 0.72, 0.4, 0.365, -0.01),
        (5.36, 0.7, 0.31, 0.34, -0.02),
        (5.44, 0.6, 0.265, 0.31, -0.02),
        (5.52, 0.47, 0.24, 0.285, -0.02),
        (5.60, 0.335, 0.215, 0.255, -0.01),
        (5.70, 0.24, 0.18, 0.235, -0.012),
        (5.82, 0.218, 0.158, 0.22, -0.018),
        (6.05, 0.208, 0.15, 0.205, -0.012),
        (6.10, 0.05, 0.05, 0.05, -0.012),
    ]
    return solid([ring((0, y, zc), rx, rzf, 32, rzb) for y, rx, rzf, rzb, zc in st], 'trunk')


def ray(n, c, r):
    """How far from the middle of the head (in its half sizes) a ray along n leaves an ellipsoid round c."""
    aa = sum((n[i] / r[i]) ** 2 for i in range(3))
    bb = sum(n[i] * c[i] / r[i] ** 2 for i in range(3))
    cc = sum((c[i] / r[i]) ** 2 for i in range(3)) - 1
    return (bb + math.sqrt(max(0.0, bb * bb - aa * cc))) / aa


def flat(n, normal, at):
    """How far along n a flat face is: the plane through `at` that looks out along `normal` (far off, where n looks away from it)."""
    ln = math.sqrt(sum(v * v for v in normal))
    c = sum(n[i] * normal[i] for i in range(3)) / ln
    return sum(at[i] * normal[i] for i in range(3)) / ln / c if c > 0.02 else 99.0


def smin(a, b, k):
    """The lesser of two, the corner between them rounded over k: two faces of a head meet in an edge, not a crease."""
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def face_at(n):
    """Where on the plane of his face a direction from the head's middle looks (in the head's half sizes: figure.ts paints by the same)."""
    nz = max(n[2], 0.3)
    return n[0] / nz * 0.8, n[1] / nz * 0.8


# his face, on its plane (figure.ts paints by the same numbers, and so does people.py): each eye's middle and
# half width, his mouth's height and half width, the tip of his nose and where it meets his lip
EYE_X, EYE_Y, EYE_W = 0.38, 0.066, 0.152
MOUTH_Y, MOUTH_W = -0.522, 0.3
NOSE_TIP, NOSE_FOOT = -0.262, -0.34
# how far out his lips part (figure.ts's SLIT): nearly to the corners of his mouth, where the two lips meet
SLIT = MOUTH_W - 0.025


def lids(px, py):
    """An eye, from its middle: how far across and up a point is, and where the upper and the lower lid are there (figure.ts's)."""
    ex, ey = abs(px) - EYE_X, py - EYE_Y
    k = max(0.0, 1 - min(1.0, abs(ex) / EYE_W) ** 2)
    tilt = 0.012 * ex / EYE_W
    return ex, ey, tilt + 0.046 * k ** 0.55, tilt - 0.037 * k ** 0.8


def brow_at(apx):
    """How high his eyebrow is, that far out from the middle of his face (figure.ts's): up from beside the nose to its peak, down to a tail."""
    q = (apx - 0.15) / 0.52
    return 0.2 + 0.07 * math.sin(clamp(q * 1.15) * math.pi * 0.62) - 0.035 * sstep(0.7, 1, q)


def skull(n):
    """
    The head's bone, before anything of a face is on it: a cranium (longer than it is wide, widest
    over the ears) and under it the block of a face, cut by flat faces as a face is: its front (a
    little back at the chin), a plane each side from the cheekbone round to the ear, the jaw's sides
    down to the chin, and the jaw's under side, from the chin up to its corner under the ear. The
    faces meet in rounded edges: the line of a jaw, the turn of a cheek.
    """
    cranium = ray(n, (0, 0.2, -0.1), (0.915, 0.75, 0.955))
    x = abs(n[0])
    m = (x, n[1], n[2])
    low = ray(n, (0, -0.32, 0.0), (0.94, 0.95, 0.9))
    # (its front; the cheeks' turn back to the cheekbones; the jaw's side, narrowing from its corner under the ear to
    # the chin; the back edge of the jaw, up from that corner to the ear: behind it, his neck takes over)
    # (each turn rounded over a good width: a cheek and a jaw are round under the light, not cut in planes; and the
    # front is broad, the cheeks carried well out before they turn back, so a face is never pinched to its middle)
    low = smin(low, flat(m, (0, -0.07, 1), (0, -0.45, 0.85)), 0.15)
    low = smin(low, flat(m, (0.62, -0.18, 0.76), (0.56, -0.1, 0.83)), 0.36)
    low = smin(low, flat(m, (1, -0.1, 0.34), (0.83, -0.55, -0.2)), 0.2)
    low = smin(low, flat(m, (0, -0.12, -1), (0, -0.55, -0.4)), 0.26)
    # (under it: the jaw's edge runs back from the chin nearly level, rising a little to its corner, so a jaw has an
    # angle under the ear and a line along its foot; the chin's own under side is level)
    low = smin(low, flat(m, (0.1, -1, -0.3), (0, -0.965, 0.45)), 0.15)
    low = smin(low, flat(m, (0, -1, 0.12), (0, -0.96, 0.7)), 0.13)
    # (the face's block runs into the skull round its sides without a crease where the two meet)
    return smax(cranium, low, 0.26)


def head_r(n):
    """
    How far out the head's skin is along n (a unit direction from its middle, in its half sizes):
    the skull, then what a face has on it. A brow ridge over each eye and the hollow of the socket
    under it, the ball of the eye in that with a lid over and under; cheekbones, and the hollow of
    the cheek under them; a nose with a bridge, a tip, wings and nostrils, cut in under it; lips, each
    with its own fullness, the groove over the upper one and the corners of the mouth; a chin. Everything
    on the face is placed by face_at, as figure.ts paints it.
    """
    t = skull(n)
    x, y, z = n
    ax = abs(x)
    b3 = lambda cx, cy, cz, sx, sy, sz: math.exp(-(((ax - cx) / sx) ** 2 + ((y - cy) / sy) ** 2 + ((z - cz) / sz) ** 2))  # noqa: E731
    # the temples, a little hollow behind the brow's end; the cheekbone's arch back toward the ear; the jaw's
    # muscle over its corner, and the corner itself (a jaw has an angle under the ear, not a curve); the bump
    # behind the ear; the back of the skull over the nape
    t -= 0.012 * b3(0.82, 0.3, 0.42, 0.2, 0.22, 0.24)
    t += 0.045 * b3(0.7, -0.1, 0.55, 0.22, 0.14, 0.28)
    t += 0.018 * b3(0.86, -0.08, 0.2, 0.16, 0.12, 0.3)
    t += 0.03 * b3(0.76, -0.4, 0.1, 0.18, 0.24, 0.26)
    t += 0.03 * b3(0.74, -0.66, -0.1, 0.12, 0.1, 0.16)
    t += 0.02 * b3(0.7, -0.12, -0.5, 0.16, 0.14, 0.16)
    t += 0.02 * b3(0, 0.05, -0.95, 0.5, 0.25, 0.3)
    # (and under the ear, behind the jaw, the muscle that runs down into his neck: no pit between jaw and neck)
    t += 0.05 * b3(0.62, -0.55, -0.5, 0.24, 0.22, 0.26)
    front = sstep(0.1, 0.5, z)
    if front <= 0:
        return t
    px, py = face_at(n)
    apx = abs(px)
    g = lambda cx, cy, sx, sy: math.exp(-(((apx - cx) / sx) ** 2 + ((py - cy) / sy) ** 2))  # noqa: E731
    d = 0.0
    # his forehead: two rises over the brows and a little fullness between; the brow's ridge along the line of
    # the eyebrow, heaviest over the inner half of the eye (a ridge a light catches, no shelf), joined over the
    # nose by a lower one (the glabella)
    d += 0.02 * g(0.34, 0.56, 0.26, 0.2) + 0.016 * g(0, 0.55, 0.4, 0.25)
    yb = brow_at(apx) + 0.012
    d += (0.034 * sstep(1.0, 0.55, apx) * (0.55 + 0.45 * sstep(0.06, 0.24, apx))) * math.exp(-(((py - yb) / (0.06 if py < yb else 0.12)) ** 2))
    d += 0.007 * g(0, 0.24, 0.1, 0.07)
    # the eye's socket: a hollow under the brow, deepest at its top beside the nose; shallow toward the cheekbone
    # and under the eye, where the cheek comes up to the lower lid
    # (and the eye set back in it, most at its inner corner under the brow: the bridge of the nose stands in front of it)
    d -= 0.035 * g(EYE_X - 0.01, EYE_Y + 0.045, 0.2, 0.095)
    d -= 0.014 * g(0.23, 0.13, 0.08, 0.07)
    # (the ball of the eye in it, filling it out to its lids, which stand on it: no pit with a bead at its bottom;
    # each lid's edge has a thickness, the upper one's fold lies over it, the lower one runs into the cheek)
    ex, ey, up, lo = lids(apx, py)
    on_eye = sstep(EYE_W + 0.05, EYE_W - 0.03, abs(ex))
    d += 0.064 * g(EYE_X, EYE_Y + 0.004, 0.165, 0.085)
    d += 0.011 * math.exp(-(((ey - up - 0.006) / 0.012) ** 2)) * on_eye
    d += 0.012 * math.exp(-(((ey - up - 0.036) / 0.02) ** 2)) * sstep(EYE_W + 0.07, EYE_W - 0.02, abs(ex))
    d += 0.008 * math.exp(-(((ey - lo + 0.008) / 0.012) ** 2)) * on_eye
    d -= 0.008 * g(0.3, -0.075, 0.09, 0.035)
    # his cheekbones, out and down from the outer corner of each eye, and their arch back toward the ear; the
    # front of the cheek under the eye, full beside the nose; the hollow under the bone
    d += 0.036 * g(0.53, -0.15, 0.17, 0.11)
    d += 0.034 * g(0.4, -0.28, 0.2, 0.16)
    d -= 0.012 * g(0.66, -0.5, 0.15, 0.16)
    # (the fold from each wing of the nose down past the corner of the mouth, the cheek full beside it)
    fx, fy = apx - 0.225, py + 0.31
    along = clamp((fx * 0.13 - fy * 0.3) / (0.13 ** 2 + 0.3 ** 2))
    fold = math.hypot(fx - 0.13 * along, fy + 0.3 * along)
    d -= 0.01 * math.exp(-((fold / 0.026) ** 2)) * sstep(1.1, 0.7, along)
    d += 0.01 * math.exp(-(((fold - 0.07) / 0.045) ** 2)) * (1 if fx - 0.13 * along > 0 else 0) * sstep(1.2, 0.6, along)
    # the nose: its root between the eyes, under the glabella, narrow; its bridge a ridge rising to the tip,
    # widening as it goes; the tip a ball of its own; cut in under it to the lip; the side walls run out into the cheeks
    # (a bridge with some breadth to it between the eyes: a narrow one pinches the whole face in to it)
    # (it stands well out of his face, from its root between his eyes on: a face whose nose is low reads flat, a mask)
    d -= 0.003 * g(0, 0.13, 0.09, 0.05)
    u = clamp((0.15 - py) / (0.15 - NOSE_TIP))
    high = (0.034 + 0.098 * u ** 1.3) * sstep(NOSE_FOOT, NOSE_TIP - 0.004, py) * sstep(0.3, 0.14, py)
    wide = 0.052 + 0.045 * u ** 2.0
    d += high * math.exp(-((apx / wide) ** 2.4))
    d += 0.16 * high * math.exp(-((apx / (wide * 1.8)) ** 2))
    d += 0.038 * g(0, NOSE_TIP - 0.012, 0.062, 0.05)
    # (its wings, each round its nostril, about as wide as the inner corners of the eyes are apart; the crease
    # behind the wing; the nostrils, under, and the little column between them)
    d += 0.064 * g(0.148, -0.298, 0.05, 0.042)
    d -= 0.026 * g(0.228, -0.288, 0.026, 0.058)
    d -= 0.024 * g(0.075, NOSE_FOOT + 0.01, 0.032, 0.016)
    # the mouth: it stands out on the arch of the teeth behind it, the skin over the upper lip coming down and
    # forward from the nose to the lip's edge, which is a little ridge (the line a lip is drawn by); each lip its
    # own fullness (the upper one's bow, the fuller lower one), the line between them, the groove from the nose
    # down to the bow and its two ridges, the corners tucked in
    t_ = min(1.0, apx / MOUTH_W)
    arch = max(0.0, 1 - t_ * t_)
    across = max(0.0, 1 - (px / (MOUTH_W + 0.01)) ** 2) ** 0.7
    edge = MOUTH_Y + 0.054 * arch ** 0.6 * (1 - 0.24 * math.exp(-((t_ / 0.14) ** 2)))
    d += 0.024 * g(0, -0.53, 0.48, 0.24)
    d += 0.014 * sstep(-0.35, -0.46, py) * sstep(edge - 0.004, edge + 0.01, py) * math.exp(-((px / 0.32) ** 2))
    d += across * 0.041 * math.exp(-(((py - MOUTH_Y - 0.027 * arch ** 0.6) / 0.028) ** 2))
    d += across * 0.009 * math.exp(-(((py - edge) / 0.009) ** 2))
    d += across * 0.057 * math.exp(-(((py - MOUTH_Y + 0.047 * arch ** 0.8) / 0.04) ** 2))
    d -= across * 0.024 * math.exp(-(((py - MOUTH_Y) / 0.012) ** 2))
    d -= 0.016 * g(0, -0.41, 0.03, 0.055)
    d += 0.01 * g(0.058, -0.415, 0.022, 0.05)
    # (the corners tucked in, and the knot of muscle just out from each, where the cheek meets the lips)
    d -= 0.02 * g(MOUTH_W + 0.01, MOUTH_Y - 0.01, 0.04, 0.04)
    d += 0.012 * g(MOUTH_W + 0.08, MOUTH_Y - 0.02, 0.05, 0.09)
    # the groove under the lower lip, and the chin: a ball standing out in front, squarer below
    d -= 0.032 * g(0, -0.685, 0.21, 0.04)
    d += 0.07 * g(0, -0.84, 0.22, 0.12)
    d += 0.02 * g(0.2, -0.9, 0.12, 0.09)
    return t + d * front


def head(q=1.0, slit=False):
    """
    His head: a skin over head_r, finer over his face than over his skull. `slit` parts his lips along
    the line of his mouth (the man on the floor: his jaw can come open, see mouth).
    """
    c = HEAD_C
    size = (HEAD_W, HEAD_H, HEAD_D)
    cols, rows = 176, 128
    verts, faces = [], []

    def at(a, e):
        d = (math.cos(e) * math.sin(a) / size[0], math.sin(e) / size[1], math.cos(e) * math.cos(a) / size[2])
        ln = math.sqrt(sum(v * v for v in d))
        n = tuple(v / ln for v in d)
        r = head_r(n)
        return tuple(c[i] + n[i] * r * size[i] for i in range(3))

    for i in range(1, rows):
        # (more of the rows between his brow and his chin)
        t = -math.pi / 2 + math.pi * i / rows
        e = t - 0.2 * (math.sin(2 * (t + 0.2)) + math.sin(0.4))
        for j in range(cols):
            # (more of the columns over his face)
            a = 2 * math.pi * j / cols
            verts.append(at(a - 0.5 * math.sin(a), e))
    lo, hi = len(verts), len(verts) + 1
    verts += [at(0, -math.pi / 2), at(0, math.pi / 2)]
    for i in range(rows - 2):
        for j in range(cols):
            k = (j + 1) % cols
            faces.append((i * cols + j, i * cols + k, (i + 1) * cols + k, (i + 1) * cols + j))
    for j in range(cols):
        k = (j + 1) % cols
        faces.append((lo, k, j))
        faces.append((hi, (rows - 2) * cols + j, (rows - 2) * cols + k))
    o = mesh_obj('head', verts, faces)
    fix_normals(o)
    # (thinned as the body is: his face keeps more of its triangles than its size gives it)
    face = (0, c[1] - 0.07, c[2] + 0.3)
    swell(o, face, 0.3, 3.0)
    # (the benches, seen from far off, get by with a good deal less)
    o = thin(o, (HEAD_TRIS if q >= 1 else 1400) * q)
    swell(o, face, 0.3, 3.0, back=True)
    # (an edge thinned to a few triangles is a saw's: evened out a little)
    relax(o, 1, 0.35)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    if slit:
        # his lips part along the line of his mouth: an edge cut there, and split from one corner to the other
        co, no = B(*c), B(0, 1 / size[1], -(MOUTH_Y / 0.8) / size[2])
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=co, plane_no=no)

        def on_line(v):
            p = G(v.co)
            d = [(p[i] - c[i]) / size[i] for i in range(3)]
            return d[2] > 0.3 and abs(d[1] / d[2] * 0.8 - MOUTH_Y) < 2e-4 and abs(d[0] / d[2] * 0.8) < SLIT

        def plane_y(p):
            d = [(p[i] - c[i]) / size[i] for i in range(3)]
            return d[1] / max(d[2], 0.3) * 0.8

        line = [e for e in bm.edges if on_line(e.verts[0]) and on_line(e.verts[1])]
        bmesh.ops.split_edges(bm, edges=line)
        # (each lip's edge a hair off the line, its own way: face_weights tells the upper lip's from the lower's by that)
        for v in [v for v in bm.verts if on_line(v)]:
            ways = {plane_y(G(f.calc_center_median())) > MOUTH_Y for f in v.link_faces}
            if len(ways) == 1:
                v.co = v.co + B(0, (0.0007 if ways.pop() else -0.0007), 0)
    # (what is down inside his neck is never seen)
    inside = [f for f in bm.faces if (lambda p: p[1] < c[1] - 0.24 and math.hypot(p[0] / 0.17, (p[2] + 0.04) / 0.13) < 1)(G(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=inside, context='FACES')
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    set_material(o, material(SKIN))
    return tag(o, FACE)


# his teeth: how many feet a millimetre of a real man's tooth is on him (his head is a little over a real one, and so
# are they); how far back from the skin of his lips at the middle of his mouth his upper teeth's front faces are (ft:
# past the most his lips are ever drawn in, pressed and thin, so no tooth shows through a lip), how much further back
# his lower ones' are (they close behind the upper ones), and how far under the line of his mouth the upper ones' edges
# are and the lower ones' (his upper teeth come down over the edges of his lower ones)
TOOTH_MM = 0.0034
TEETH_BACK, LOWER_BACK = 0.021, 0.009
# (the real man's lips are a lip thick, and a ray finds their front: his teeth are that much further back)
REAL_TEETH_BACK = 0.028
UPPER_EDGE, LOWER_EDGE = 0.007, 0.003
# each crown, from the middle of his mouth round to his second premolar above and his first below (the rest are too far
# back, behind his cheeks and his lower lip, to be seen):
# its width along the arch, how tall it stands out of his gum and how thick it is at the gum (mm); how thick its edge
# is (a share of that: an incisor's is a blade, a premolar's a table); how far its corners stand back from a cusp's
# point (mm); how far its edge is from his front teeth's toward his gum (mm); how far it leans back toward his gum (a
# share of its height). His upper row, then his lower: a real man's numbers.
UPPER_TEETH = [(8.6, 10.5, 7.0, 0.2, 0.0, 0.0, 0.26), (6.6, 9.0, 6.0, 0.2, 0.0, 0.7, 0.24), (7.6, 10.0, 8.0, 0.35, 1.6, -0.2, 0.18), (7.0, 8.5, 9.0, 0.7, 1.2, 0.5, 0.08), (6.6, 7.8, 9.0, 0.75, 0.9, 1.0, 0.05)]
LOWER_TEETH = [(5.4, 9.0, 6.0, 0.22, 0.0, 0.0, 0.18), (5.9, 9.5, 6.2, 0.22, 0.0, 0.0, 0.18), (6.9, 11.0, 7.5, 0.35, 1.4, 0.3, 0.12), (7.0, 8.5, 7.6, 0.7, 1.0, 0.6, 0.05)]
# how far down between two teeth his gum comes (mm: the papilla), at his front teeth and at the back
PAPILLA = (3.4, 2.2)


def arch(front, k2, k4):
    """
    A row's arch (ft, as built): the line of its teeth's front faces from the middle of his mouth round toward his
    cheek, a U that goes back the faster the further out it is; as a table of (how far along it, across, forward).
    """
    out, s, was = [], 0.0, None
    for i in range(481):
        x = 0.12 * i / 480
        z = front - k2 * x * x - k4 * x ** 4
        if was:
            s += math.hypot(x - was[0], z - was[1])
        out.append((s, x, z))
        was = (x, z)
    return out


def along(table, s):
    """The point of an arch that far along it from the middle (across, forward), and the way along it there."""
    i = next((k for k in range(1, len(table)) if table[k][0] >= s), len(table) - 1)
    (s0, x0, z0), (s1, x1, z1) = table[i - 1], table[i]
    t = (s - s0) / max(1e-9, s1 - s0)
    ln = math.hypot(x1 - x0, z1 - z0)
    return x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, (x1 - x0) / ln, (z1 - z0) / ln


def mouth():
    """
    What is behind his lips when his jaw comes open: his teeth, each a crown of its own round the arch of his jaw
    (upper and lower, his head's and his jaw's), his gums round their roots, coming down between them; his tongue
    lying in his lower jaw, its tip behind his lower teeth; and the dark at the back of his mouth. Shut, his lips are
    in front of all of it.
    """
    if _scalp is not None:
        # (the real man's: the line of his mouth is where the map has it on him, and his lips are parted along it, so a
        # ray down it finds no skin: one just over it does, and the line is at that depth)
        line = mhbody.face_back(0.0, MOUTH_Y)[1]
        lip = on_head((0, line / 0.8 + 0.012, 1.0))
        mid_y, front = HEAD_C[1] + (line / 0.8) * HEAD_H / HEAD_D * (lip[2] - HEAD_C[2]), lip[2] - TEETH_BACK - REAL_TEETH_BACK
    else:
        lip = on_head((0, MOUTH_Y / 0.8, 1.0))
        mid_y, front = lip[1], lip[2] - TEETH_BACK
    print(f'[models] mouth: the line of it {mid_y:.4f} ft up, his upper teeth\'s fronts {front:.4f} ft forward, their edges {mid_y - UPPER_EDGE:.4f} and {mid_y - LOWER_EDGE:.4f}')
    upper = arch(front, 9.2, 400)
    lower = arch(front - LOWER_BACK, 10.0, 450)

    def row(table, specs, edge_y, way, seg=8):
        """
        A row of crowns along an arch, each side of the middle; `way` 1 is up from their edges to his gum (his upper
        teeth), -1 down. Each crown is rings round it from its edge to its root (a blade's edge thin, its root thick,
        a cusp's point lower than its corners), leaning back toward his gum, its front face on the arch. Says the
        crowns, and where his gum's edge runs over them (see gum).
        """
        verts, faces, line = [], [], []
        s = 0.0
        for n, (w, h, d, edge, cusp, rise, lean) in enumerate(specs):
            w, h, d, cusp, rise = (v * TOOTH_MM for v in (w, h, d, cusp, rise))
            # (two teeth touch a hair apart, so the line between them reads)
            x, z, tx, tz = along(table, s + w / 2)
            for side in (1, -1):
                base = len(verts)
                for v in (0.0, 0.12, 0.55, 1.0):
                    dv = d * (edge + (1 - edge) * v ** 0.6)
                    wv = (w - 0.00035) * (0.95 - 0.18 * v) * (0.86 if v == 0 else 1)
                    for k in range(seg):
                        a = 2 * math.pi * (k + 0.5) / seg
                        u = math.copysign(abs(math.cos(a)) ** 0.8, math.cos(a))
                        q = math.copysign(abs(math.sin(a)) ** 0.8, math.sin(a))
                        across, out = u * wv / 2, q * dv / 2 - dv / 2 - lean * h * v
                        y = edge_y + way * (rise + cusp * abs(u) ** 1.5 * (1 - v) + v * h)
                        # (out from the arch is in front of him: the way along it turned a quarter)
                        verts.append((side * (x + tx * across - tz * out), y, z + tz * across + tx * out))
                # (its biting face: a blade's edge, or a cusp's table with a hollow in its middle)
                out = -d * edge / 2
                verts.append((side * (x - tz * out), edge_y + way * (rise + cusp * (1.4 if edge > 0.5 else 0.3)), z + tx * out))
                for i in range(3):
                    for k in range(seg):
                        a, b = base + i * seg + k, base + i * seg + (k + 1) % seg
                        faces.append((a, b, b + seg, a + seg))
                # (its root is in his gum: left open)
                for k in range(seg):
                    faces.append((base + 4 * seg, base + (k + 1) % seg, base + k))
            # (his gum's edge over this tooth: down between it and the last, up round its root)
            line.append((s, w, edge_y + way * (rise + h), lean, h, PAPILLA[0 if n < 2 else 1] * TOOTH_MM))
            s += w
        return verts, faces, line, s

    def gum(table, line, end, way, name, kind):
        """
        His gum along a row: its edge scalloped round each crown's root and down to a point between two (the papilla),
        standing a little proud of the teeth there, then on up (or down, his lower one) and back under his lip.
        """
        cols = []
        for s, w, root, lean, h, pap in line:
            for f in (0.0, 1 / 3, 2 / 3):
                edge = root - way * ((pap + 0.0003) * math.cos(math.pi * f) ** 2 - 0.0003)
                cols.append((s + f * w, edge, root, lean, h))
        s, w, root, lean, h, pap = line[-1]
        cols.append((end, root - way * pap, root, lean, h))
        cols = [(-c[0], *c[1:]) for c in reversed(cols[1:])] + cols
        # (how far past the root each row of it is, and how far it stands out from the tooth's face there)
        rows = [(0.0, 0.0012), (0.006, 0.0028), (0.022, -0.005)]
        verts, faces = [], []
        for past, proud in rows:
            for s, edge, root, lean, h in cols:
                x, z, tx, tz = along(table, abs(s))
                # (the tooth's face leans back toward the root: the gum's edge is on it where it crosses it)
                y = edge if past == 0 else root + way * past
                out = proud - lean * h * min(1.15, abs(y - root + way * h) / h)
                verts.append((math.copysign(x - tz * out, s), y, z + tx * out))
        n = len(cols)
        for i in range(len(rows) - 1):
            for k in range(n - 1):
                a = i * n + k
                faces.append((a, a + 1, a + n + 1, a + n) if way > 0 else (a, a + n, a + n + 1, a + 1))
        o = mesh_obj(name, verts, faces)
        set_material(o, material(GUM))
        return tag(o, kind)

    out = []
    for table, specs, edge_y, way, kind, name in (
        (upper, UPPER_TEETH, mid_y - UPPER_EDGE, 1, ON_HEAD, 'upper'),
        (lower, LOWER_TEETH, mid_y - LOWER_EDGE, -1, ON_JAW, 'lower'),
    ):
        verts, faces, line, end = row(table, specs, edge_y, way)
        o = mesh_obj(f'{name} teeth', verts, faces)
        fix_normals(o)
        set_material(o, material(TEETH))
        out.append(tag(o, kind))
        out.append(gum(table, line, end, way, f'{name} gum', kind))

    # his tongue: low in his lower jaw, its tip just behind and under the edges of his lower teeth, its back rising a
    # little and then down into his throat; a groove down its middle, its sides falling away to the floor of his mouth
    tip = front - LOWER_BACK - 0.017
    verts, faces = [], []
    zs = [tip - 0.2 * (i / 7) ** 1.15 for i in range(8)]
    for z in zs:
        back = tip - z
        # (its tip round, not a point: broad from its very end)
        half = 0.058 * (0.4 + 0.6 * math.sqrt(clamp(back / 0.05))) * (1 - 0.15 * sstep(0.12, 0.2, back))
        top = mid_y - LOWER_EDGE - 0.01 + 0.005 * sstep(0.0, 0.08, back) - 0.035 * sstep(0.12, 0.2, back)
        for j in range(9):
            u = 2 * j / 8 - 1
            # (its tip rounded off and down at its end, and its groove from a little way back from it to where it goes down)
            groove = 0.0022 * math.exp(-((u * half / 0.012) ** 2)) * sstep(0.0, 0.04, back) * sstep(0.17, 0.1, back)
            end = sstep(0.03, 0.0, back)
            verts.append((u * half, top - groove - 0.022 * abs(u) ** 2.5 - 0.004 * end, z - 0.016 * u * u * end))
    for i in range(len(zs) - 1):
        for j in range(8):
            a = i * 9 + j
            faces.append((a, a + 1, a + 10, a + 9))
    tongue = mesh_obj('tongue', verts, faces)
    set_material(tongue, material(TONGUE))
    out.append(tag(tongue, ON_JAW))

    # and the back of his mouth, behind his tongue: what an open mouth shows past everything else is dark
    verts, faces = [], []
    for y in (mid_y + 0.075, mid_y + 0.02, mid_y - 0.04, mid_y - 0.1):
        for j in range(7):
            x = 0.1 * (2 * j / 6 - 1)
            verts.append((x, y, front - 0.24 + 4.0 * x * x))
    for i in range(3):
        for j in range(6):
            a = i * 7 + j
            faces.append((a, a + 1, a + 8, a + 7))
    back = mesh_obj('gullet', verts, faces)
    set_material(back, material(MOUTH))
    out.append(tag(back, ON_HEAD))
    return out


def ears(mat=SKIN):
    """
    His ears: each a shell with a rolled rim (the helix), a ridge inside that, the bowl by the ear's
    hole and a lobe, lying close to his skull: its front edge on it, its back edge a finger off.
    `mat`: the man on the floor's are a material of their own (figure.ts gives them his skin's plain
    colour: his head's picture, laid round its middle, has his hair and his beard where they are).
    """
    out = []
    seg = 16
    # (how far in from its edge, how far it stands off the ear's own plane: rim, crest of the roll, its inner
    # edge, the ridge inside, the bowl)
    prof = [(1.0, 0.0), (1.0, 0.02), (0.88, 0.03), (0.74, 0.016), (0.56, 0.024), (0.36, 0.006), (0.12, 0.0)]
    for s in (1, -1):
        # where it grows from: on the side of his head behind the jaw's hinge, its middle level with his eyes' under side
        root = on_head((s * 0.95, -0.07, -0.19))
        up = Vector((0, 1, 0.12)).normalized()
        outv = Vector((s, 0, 0))
        back = Vector((0, -0.12, -1)).normalized()
        # (leaning back off the head: turned out about its front edge)
        turn = Matrix.Rotation(-s * 0.17, 3, up)
        rings = []
        for inset, off in prof:
            pts = []
            for k in range(seg):
                a = 2 * math.pi * k / seg
                cs, sn = math.cos(a), math.sin(a)
                # (an ear's outline: wider at the top than at the lobe; the roll only round its top and back)
                w = 0.052 * (0.82 + 0.18 * sn) * (1 - 0.12 * max(0.0, -cs) * max(0.0, sn))
                h = 0.108
                roll = sstep(-0.75, -0.3, sn + 0.5 * cs) if inset > 0.7 else 1.0
                lobe = sstep(-0.5, -0.9, sn)
                u, v = cs * w * (1 - (1 - inset) * 1.0), sn * h * (1 - (1 - inset) * (0.9 - 0.35 * lobe)) - (1 - inset) * 0.012
                o = off * (roll if inset > 0.7 else 1 - 0.6 * lobe) + 0.006 * lobe * (1 - inset)
                p = back * (u + 0.052 * 0.8) + up * v + outv * (o * 0.85 - 0.006)
                pts.append(tuple(root + turn @ p))
            rings.append(pts if s > 0 else pts[::-1])
        e = solid(rings, 'ear')
        set_material(e, material(mat))
        out.append(tag(e, ON_HEAD))
    return out


def neck():
    """What shows in a neck: the two cords from behind each ear down to the notch between his collarbones, and his Adam's apple."""
    out = []
    for s in (1, -1):
        pts = [Vector((s * 0.17, 6.0, -0.09)), Vector((s * 0.172, 5.88, -0.035)), Vector((s * 0.148, 5.74, 0.04)), Vector((s * 0.1, 5.6, 0.12)), Vector((s * 0.05, 5.47, 0.17))]
        rings = []
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            e1 = d.cross(Vector((0, 0, 1))).normalized()
            e2 = d.cross(e1)
            rad = (0.045, 0.05, 0.048, 0.042, 0.032)[i]
            rings.append([tuple(p + (e1 * math.cos(a) * rad * 1.25 + e2 * math.sin(a) * rad)) for a in (2 * math.pi * k / 10 for k in range(10))])
        out.append(solid(rings, 'cord'))
    out.append(ellipsoid((0, 5.79, 0.162), (0.05, 0.06, 0.045), 10, 8, 'apple'))
    return out


def arm(s):
    f = arm_frame(s)
    # the arm's own run, bone and the flesh nearest it (how far down the arm, its radius across, its depth, how far forward its middle sits);
    # an elbow is wider across than it is deep, a wrist flat
    st = [
        (-0.14, 0.05, 0.05, 0.0),
        (-0.07, 0.14, 0.17, 0.0),
        (0.06, 0.185, 0.22, 0.0),
        (0.26, 0.195, 0.222, 0.0),
        (0.5, 0.178, 0.2, 0.0),
        (0.75, 0.168, 0.19, 0.008),
        (0.95, 0.158, 0.168, 0.0),
        (1.1, 0.164, 0.152, 0.0),
        (1.28, 0.165, 0.154, 0.008),
        (1.5, 0.152, 0.144, 0.006),
        (1.75, 0.128, 0.114, 0.004),
        (1.95, 0.114, 0.096, 0.0),
        (2.08, 0.106, 0.084, 0.0),
        (2.19, 0.1, 0.08, 0.0),
        (2.3, 0.05, 0.05, 0.0),
    ]
    parts = [solid([ring((0, -u, zc), rx, rz, 20, frame=f) for u, rx, rz, zc in st], 'arm')]
    # its muscles, each a mass of its own on that run (the fusing runs them together, a shallow groove between two):
    # the deltoid, a cap over the joint that comes to a point half way down the upper arm's outside (long and
    # flat over the arm, no ball: an arm that hangs carries it down its side); the biceps in front and the triceps
    # behind; the point of the elbow; the forearm's two bellies, thickest just under the elbow
    # (where: out from the arm's middle, down it, forward; then its half sizes)
    for (out, u, z), r in (
        ((0.01, 0.25, 0.0), (0.158, 0.39, 0.204)),
        ((0.07, 0.42, -0.01), (0.128, 0.26, 0.158)),
        ((-0.01, 0.63, 0.078), (0.148, 0.31, 0.142)),
        ((0.015, 0.55, -0.085), (0.158, 0.35, 0.142)),
        ((0.0, 1.12, -0.095), (0.07, 0.11, 0.07)),
        ((0.045, 1.36, 0.035), (0.13, 0.31, 0.12)),
        ((-0.045, 1.42, -0.01), (0.12, 0.33, 0.116)),
    ):
        parts.append(transform(ellipsoid((s * out, -u, z), r, 16, 12, 'muscle'), f))
    # the palm (its back to the outside, thumb edge forward), the heel of the thumb
    palm = palm_form(s)
    heel = ellipsoid((-s * 0.03, -(ARM + 0.14), 0.09), (0.06, 0.13, 0.085), 12, 8, 'heel')
    # (the shoulder runs into the chest and the back: no ball on a stick)
    # (over the top of the joint only: under it his armpit is a hollow, or an arm raised overhead would carry a lump up with it)
    bridge = ellipsoid((-s * 0.2, -0.03, 0.0), (0.25, 0.118, 0.225), 16, 10, 'bridge')
    for p in (bridge, palm, heel):
        transform(p, f)
        parts.append(p)
    return parts


def girdle(s):
    """What ties an arm to his trunk: the trapezius from his neck down to the point of the shoulder, the chest's muscle to the front of the armpit, the back's to the back of it, a collarbone."""
    out = [
        ellipsoid((s * 0.42, 5.445, -0.09), (0.41, 0.088, 0.21), 16, 10, 'trap', Matrix.Rotation(-s * 0.4, 3, 'Z')),
        ellipsoid((s * 0.35, 4.94, 0.275), (0.33, 0.24, 0.165), 16, 10, 'pec', Matrix.Rotation(s * 0.25, 3, 'Z')),
        ellipsoid((s * 0.42, 4.7, -0.2), (0.28, 0.42, 0.17), 16, 10, 'lat', Matrix.Rotation(-s * 0.2, 3, 'Z')),
        ellipsoid((s * 0.34, 5.405, 0.17), (0.29, 0.036, 0.042), 12, 8, 'collarbone', Matrix.Rotation(-s * 0.08, 3, 'Z') @ Matrix.Rotation(s * 0.3, 3, 'Y')),
    ]
    return out


# each hand's fingers and thumb as built, in the arm's own frame (see arm_frame), by side: each one's line, its two
# joints (a finger's knuckle and middle joint, the thumb's root and middle knuckle) and how thick it is there. A
# point of a finger goes with the one whose line it is on (see hand_weights); figure.ts turns each at its joints.
DIGITS = {}
# where along the knuckles each finger is (forward, toward the thumb's side), how long, how thick, how much it splays
FINGERS = (('ix', 0.122, 0.3, 0.039, 0.1), ('kn', 0.041, 0.335, 0.04, 0.025), ('rg', -0.04, 0.31, 0.038, -0.05), ('pk', -0.116, 0.25, 0.034, -0.13))
# the thumb, relaxed (how it's built): its root down in the heel of the hand, its middle knuckle, its last joint, its
# tip; each (toward the palm, down the hand from the wrist, forward), ft, and how thick it is there. Its root is a
# joint of its own (the thumb's whole length turns there, across the palm or out from it), deep in the heel of the
# hand, so the heel's ball of muscle goes with it part of the way (see weights)
THUMB = (((0.025, 0.06, 0.09), 0.05), ((0.075, 0.22, 0.175), 0.047), ((0.105, 0.33, 0.2), 0.043), ((0.125, 0.42, 0.205), 0.04))
# how many sides a finger has round, and how deep it is (palm to back) for how wide
DIGIT_SIDES = 8
DIGIT_DEEP = 0.86
# how much of the heel of the hand over the thumb's long bone goes with the thumb, at most
THENAR = 0.6


def palm_form(s, seg=20, rings=14):
    """
    The palm and the back of the hand (the arm's frame, before it is put on him), as an ellipsoid would be laid out but
    squared off: a flat back, a little higher over the knuckles; a palm with fleshy pads at its heel and under the
    fingers and a hollow in its middle; narrow at the wrist and wide across the knuckles; its end at them, the little
    finger's side shorter than the index's (as the knuckles are: see fingers), not a dome over the fingers' roots.
    """
    verts, faces = [], []

    def at(nx, ny, nz):
        # (squared off: each way of the ball's point taken to a power under one)
        bx, by, bz = (math.copysign(abs(v) ** e, v) for v, e in ((nx, 0.8), (ny, 0.5), (nz, 0.55)))
        t = (1 - by) / 2
        z = 0.012 + bz * (0.112 + 0.046 * sstep(0.0, 0.7, t))
        # (where its end is: a little past each finger's knuckle)
        y = -(ARM - 0.03) - t * (0.475 - abs(z - 0.02) * 0.25)
        back = bx * s > 0
        if back:
            # the back: flat, the knuckles' row standing up under the skin
            th = 0.05 - 0.008 * t + 0.011 * math.exp(-(((t - 0.92) / 0.07) ** 2)) * sum(math.exp(-(((z - fz) / 0.03) ** 2)) for _, fz, _, _, _ in FINGERS)
        else:
            # the palm: thick at its heel and under the fingers, hollow in its middle, the edge under the little finger fleshy
            th = 0.062 - 0.016 * math.exp(-(((t - 0.55) / 0.2) ** 2)) * math.exp(-(((z - 0.01) / 0.09) ** 2)) + 0.012 * math.exp(-(((t - 0.4) / 0.25) ** 2)) * sstep(-0.03, -0.12, z)
        return (bx * th, y, z)

    for i in range(1, rings):
        a0 = math.pi * i / rings
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append(at(math.sin(a0) * math.cos(a), math.cos(a0), math.sin(a0) * math.sin(a)))
    top, bot = len(verts), len(verts) + 1
    verts += [at(0, 1, 0), at(0, -1, 0)]
    for i in range(rings - 2):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    for k in range(seg):
        faces.append((top, (k + 1) % seg, k))
        faces.append((bot, (rings - 2) * seg + k, (rings - 2) * seg + (k + 1) % seg))
    return mesh_obj('palm', verts, faces)


def tube(f, pts, s, name, sides=DIGIT_SIDES):
    """A finger (or a thumb) along its line: `pts` are (where, which way, how thick) in the arm's frame, then a rounded tip."""
    last, dl, rl = pts[-1]
    pts = [*pts, (last + dl * rl * 0.75, dl, rl * 0.55)]
    rings = []
    for at, dr, rad in pts:
        e1 = dr.cross(Vector((0, 0, 1))).normalized()
        e2 = dr.cross(e1).normalized()
        rings.append([tuple(f @ (at + (e1 * math.cos(a) * rad * DIGIT_DEEP + e2 * math.sin(a) * rad))) for a in (2 * math.pi * k / sides for k in range(sides))])
    o = solid(rings, name)
    set_material(o, material(SKIN))
    return tag(o, HAND_L if s > 0 else HAND_R)


def digit(f, base, way, lens, curl, r, s, name, sides=DIGIT_SIDES):
    """A finger from `base` (the arm's frame): three bones, each bent a little more toward the palm. Its line and joints go in DIGITS."""
    p = Vector(base)
    d = Vector(way).normalized()
    pts = [(p.copy(), d.copy(), r)]
    for n, (ln, c) in enumerate(zip(lens, curl)):
        d = (Matrix.Rotation(-s * c, 3, 'Z') @ d).normalized()
        p = p + d * ln
        pts.append((p.copy(), d.copy(), r * (1 - 0.1 * (n + 1))))
    # (its knuckle a little way into its first bone, where it comes out of the palm; its middle joint the end of that bone)
    first = pts[1][1]
    DIGITS.setdefault(s, {})[name] = ([q for q, _, _ in pts], (pts[0][0] + first * 0.03, first), (pts[1][0], pts[2][1]))
    return tube(f, pts, s, 'finger', sides)


def thumb(f, s, sides=DIGIT_SIDES):
    """The thumb, relaxed along the side of the hand (THUMB). Its line and joints go in DIGITS."""
    at = [Vector((-s * px, -(ARM + u), z)) for (px, u, z), _ in THUMB]
    pts = []
    for k, (p, (_, r)) in enumerate(zip(at, THUMB)):
        d = (at[min(k + 1, len(at) - 1)] - at[max(0, k - 1) if k == len(at) - 1 else k]).normalized()
        pts.append((p, d, r))
    DIGITS.setdefault(s, {})['th'] = (at, (at[0], pts[0][1]), (at[1], pts[1][1]))
    return tube(f, pts, s, 'thumb', sides)


def fingers(s, sides=DIGIT_SIDES):
    """A hand's fingers and thumb, `sides` round (fewer for a man in a suit, whose hands the cameras come to less)."""
    f = arm_frame(s)
    out = []
    for name, z, ln, r, splay in FINGERS:
        knuckle = -(ARM + KNUCKLE) + abs(z - 0.02) * 0.22
        # (built nearly straight: figure.ts curls them at the knuckles and the middle joints)
        out.append(digit(f, (-s * 0.008, knuckle + 0.03, z), (-s * 0.04, -1, splay), (0.03 + ln * 0.44, ln * 0.31, ln * 0.25), (0.05, 0.08, 0.2), r, s, name, sides))
    out.append(thumb(f, s, sides))
    return out


def leg(s):
    x = s * HIP_W
    st = [
        (HIP + 0.3, 0.05, 0.05, 0.0),
        (HIP + 0.2, 0.26, 0.28, 0.02),
        (HIP, 0.335, 0.36, 0.035),
        (HIP - 0.45, 0.31, 0.335, 0.035),
        (HIP - 0.9, 0.275, 0.29, 0.025),
        (HIP - 1.3, 0.232, 0.24, 0.012),
        (KN_Y + 0.08, 0.2, 0.205, 0.008),
        (KN_Y - 0.1, 0.19, 0.19, 0.0),
        (KN_Y - 0.4, 0.195, 0.2, -0.015),
        (KN_Y - 0.72, 0.18, 0.19, -0.02),
        (KN_Y - 1.05, 0.142, 0.15, -0.012),
        (KN_Y - 1.35, 0.112, 0.122, -0.004),
        (AN_Y + 0.02, 0.108, 0.125, 0.0),
        (AN_Y - 0.1, 0.05, 0.05, 0.0),
    ]
    parts = [solid([ring((x, y, zc), rx, rz, 22) for y, rx, rz, zc in reversed(st)], 'leg')]
    # (where, from the knee: out from the leg's middle, up, forward; then its half sizes)
    for (out, up, z), r in (
        # the kneecap, and the tendon under it down to the shin
        ((0.0, 0.03, 0.15), (0.115, 0.14, 0.085)),
        ((0.0, -0.2, 0.125), (0.07, 0.16, 0.06)),
        # over the knee: the thigh's muscle comes down lower inside than outside
        ((-0.1, 0.3, 0.09), (0.12, 0.22, 0.12)),
        ((0.1, 0.46, 0.06), (0.125, 0.3, 0.125)),
        # behind it: the two cords of the hamstrings, a hollow between them
        ((-0.125, 0.12, -0.13), (0.055, 0.26, 0.07)),
        ((0.125, 0.12, -0.13), (0.055, 0.26, 0.07)),
        # the calf: two heads, the inner one lower and fuller; the shin's own muscle outside its bone
        ((-0.065, -0.52, -0.105), (0.132, 0.34, 0.15)),
        ((0.075, -0.45, -0.1), (0.12, 0.3, 0.135)),
        ((0.075, -0.5, 0.06), (0.1, 0.36, 0.1)),
    ):
        parts.append(ellipsoid((x + s * out, KN_Y + up, z), r, 14, 10, 'muscle'))
    return parts


def lerp_at(table, z):
    """A table of (z, values...) rows read at z, eased between rows."""
    if z <= table[0][0]:
        return table[0][1:]
    for (z0, *v0), (z1, *v1) in zip(table, table[1:]):
        if z <= z1:
            t = sstep(z0, z1, z)
            return tuple(a + (b - a) * t for a, b in zip(v0, v1))
    return table[-1][1:]


# a basketball shoe, from the ankle joint (ft): along the foot, its sole's half width and how far its middle sits toward the foot's outside
SOLE_W = [(-0.345, 0.03, 0.0), (-0.325, 0.095, 0.0), (-0.27, 0.142, 0.0), (-0.15, 0.164, 0.004), (0.0, 0.16, 0.008), (0.14, 0.158, 0.014), (0.3, 0.178, 0.02), (0.43, 0.196, 0.016), (0.54, 0.19, 0.004), (0.63, 0.164, -0.012), (0.69, 0.122, -0.026), (0.725, 0.055, -0.034)]
# (along the foot: how high the foam is there, how far the tread is off the floor: a heel's bevel, the toe's spring)
SOLE_H = [(-0.345, 0.085, 0.03), (-0.3, 0.118, 0.008), (-0.1, 0.112, 0.0), (0.15, 0.094, 0.0), (0.4, 0.078, 0.0), (0.55, 0.072, 0.01), (0.66, 0.07, 0.03), (0.725, 0.07, 0.05)]
# (along the foot: the upper's half width, the top of it from the ankle joint, how square its top is: a toe box is flatter on top than an instep)
UPPER = [
    (-0.33, 0.03, -0.04, 2.0),
    (-0.312, 0.094, 0.03, 2.0),
    (-0.25, 0.138, 0.07, 2.0),
    (-0.12, 0.158, 0.082, 2.0),
    (0.04, 0.16, 0.078, 2.0),
    (0.14, 0.16, 0.058, 2.0),
    (0.24, 0.166, 0.03, 2.2),
    (0.34, 0.176, 0.0, 2.5),
    (0.44, 0.184, -0.03, 2.8),
    (0.53, 0.18, -0.052, 3.0),
    (0.6, 0.166, -0.066, 3.0),
    (0.655, 0.138, -0.082, 2.8),
    (0.695, 0.094, -0.108, 2.4),
    (0.716, 0.04, -0.15, 2.0),
]
LACES = [0.2 + 0.056 * k for k in range(6)]
COLLAR, HIGH = 'collar', 'high'


def shoe_fine(s):
    """
    A basketball shoe round the ankle joint, built to be looked at: a sole in two layers (the tread a
    little wider than the foam over it, the heel bevelled, the toe sprung), an upper with a toe box, a
    padded collar and a tongue, six laces; and, a piece of its own, what makes it a high shoe (the
    collar on up round his ankle, a longer tongue, a loop at the heel).
    """
    ox, oy = s * HIP_W, AN_Y
    floor = -ANKLE
    out = []

    # the sole: each section is the tread's edge, a step in, then the foam up to where the upper sits on it
    rings = []
    for z in [-0.345, -0.335, -0.31, -0.27, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3, 0.38, 0.46, 0.54, 0.6, 0.65, 0.69, 0.715, 0.725]:
        (w, cx), (h, lift) = lerp_at(SOLE_W, z), lerp_at(SOLE_H, z)
        y0 = floor + lift
        wo, wm, wt = w + 0.016, w + 0.006, w - 0.002
        sec = [(-wo, 0.003), (-wo, 0.024), (-wm, 0.03), (-wt, h), (-wt * 0.5, h), (wt * 0.5, h), (wt, h), (wm, 0.03), (wo, 0.024), (wo, 0.003), (wo * 0.55, 0.0), (-wo * 0.55, 0.0)]
        rings.append([(ox + s * cx + x, oy + y0 + y, z) for x, y in sec])
    sole = solid(rings, 'sole')
    set_material(sole, material(WHITE))
    smooth(sole, 40)

    # the upper: over the foot from the heel's counter to the toe box, its sides nearly upright where they leave the sole
    rings = []
    n = 18
    for z, hw, top, sq in UPPER:
        (w, cx), (h, lift) = lerp_at(SOLE_W, z), lerp_at(SOLE_H, z)
        base = floor + lift + h - 0.012
        r = []
        for k in range(n):
            a = 2 * math.pi * k / n
            c, sn = math.cos(a), math.sin(a)
            e = 2.0 / sq
            x = hw * math.copysign(abs(c) ** e, c)
            y = base + (top - base) * abs(sn) ** e if sn > 0 else base + 0.01 * sn
            r.append((ox + s * cx + x, oy + y, z))
        rings.append(r)
    upper = solid(rings, 'shoe')
    smooth(upper, 70)

    # the collar: a padded rim round his ankle, higher behind his heel cord and in front than at the ankle bones; the
    # sock comes up out of a mouth a little wider than it
    def rim(y, rx, rz, zc, tilt=1.0):
        pts = ring((ox, oy + y, zc), rx, rz, 18)
        return [(x, yy + tilt * (0.05 * ((zz - zc) / rz) ** 2 - 0.012), zz) for x, yy, zz in pts]

    collar = solid([rim(-0.1, 0.118, 0.15, -0.04, 0), rim(0.03, 0.156, 0.196, -0.036, 0.3), rim(0.08, 0.16, 0.199, -0.034, 0.5), rim(0.104, 0.153, 0.19, -0.033, 0.5), rim(0.1, 0.138, 0.172, -0.032, 0.5), rim(0.0, 0.132, 0.166, -0.03, 0.2)], 'shoeCollar')
    # (a low shoe's tongue; a high one's goes on up over it)
    tongue = ellipsoid((ox, oy + 0.085, 0.165), (0.084, 0.11, 0.028), 10, 6, 'shoeTongue', Matrix.Rotation(-0.5, 3, 'X'))
    for o in (collar, tongue):
        smooth(o)
        set_material(o, material(COLLAR))
        out.append(tag(o, BY_PLACE))
    # a high shoe (a piece of its own: figure.ts leaves it off a man who wears his low): the collar on up round his
    # ankle, its tongue, a loop at the back to pull it on by
    cuff = solid([rim(0.05, 0.158, 0.197, -0.035, 0.4), rim(0.13, 0.166, 0.203, -0.032, 0.7), rim(0.2, 0.168, 0.204, -0.028), rim(0.232, 0.16, 0.196, -0.028), rim(0.226, 0.142, 0.176, -0.028), rim(0.09, 0.139, 0.173, -0.03, 0.5)], 'shoeCuff')
    flap = ellipsoid((ox, oy + 0.17, 0.15), (0.088, 0.19, 0.03), 10, 6, 'shoeFlap', Matrix.Rotation(-0.4, 3, 'X'))
    loop = box((0, 0, 0), (0.05, 0.11, 0.022), 'shoeLoop')
    transform(loop, Matrix.Translation((ox, oy + 0.2, -0.243)) @ Matrix.Rotation(0.12, 4, 'X'))
    for o in (cuff, flap, loop):
        smooth(o, 80)
        set_material(o, material(HIGH))
        out.append(tag(o, BY_PLACE))
    # the laces: six of them across the throat, each lying on the upper there
    parts = []
    for z in LACES:
        hw, top, sq = lerp_at(UPPER, z)
        _, cx = lerp_at(SOLE_W, z)
        slope = (lerp_at(UPPER, z + 0.03)[1] - lerp_at(UPPER, z - 0.03)[1]) / 0.06
        rings = []
        for t in (-1, -0.5, 0, 0.5, 1):
            x = t * hw * 0.6
            y = top - 0.045 * abs(t) ** 2.2 + 0.004
            rings.append([(ox + s * cx + x, oy + y + dy + dz * slope, z + dz) for dy, dz in ((0.0, -0.013), (0.014, -0.009), (0.014, 0.009), (0.0, 0.013))])
        parts.append(solid(rings, 'lace'))
    laces = join(parts, 'shoeLaces')
    smooth(laces, 40)
    for o in (upper, laces):
        set_material(o, material(SHOE))
    foot = FOOT_L if s > 0 else FOOT_R
    return [tag(upper, foot), tag(laces, foot), tag(sole, foot), *out]


def shoe(s):
    """A sneaker round the ankle joint: a high collar, the toe box, a sole a little wider than the foot."""
    ox, oy = s * HIP_W, AN_Y
    base = -ANKLE + 0.075
    # (along the foot, half its width, the top of the upper there)
    up = [(-0.315, 0.03, -0.1), (-0.29, 0.1, 0.04), (-0.2, 0.15, 0.1), (-0.05, 0.168, 0.12), (0.1, 0.172, 0.12), (0.2, 0.178, 0.075), (0.32, 0.188, 0.0), (0.46, 0.186, -0.055), (0.58, 0.155, -0.095), (0.66, 0.09, -0.13), (0.69, 0.03, -0.17)]
    rings = []
    for z, hw, top in up:
        r = []
        for k in range(14):
            a = 2 * math.pi * k / 14
            cx, sy = math.cos(a), math.sin(a)
            x = hw * math.copysign(abs(cx) ** 0.75, cx)
            y = base + (top - base) * sy ** 0.85 if sy > 0 else base + 0.012 * sy
            r.append((ox + x, oy + y, z))
        rings.append(r)
    upper = solid(rings, 'shoe')
    # (the collar round his ankle: the sock comes up out of its flat top)
    # (a padded rim, and inside it a mouth a little wider than the sock: nothing of the leg cuts through the shoe)
    collar = solid(
        [ring((ox, oy + y, zc), rx, rz, 16) for y, rx, rz, zc in ((-0.12, 0.12, 0.15, -0.03), (0.04, 0.165, 0.2, -0.03), (0.15, 0.176, 0.208, -0.025), (0.2, 0.18, 0.208, -0.02), (0.228, 0.172, 0.2, -0.02), (0.224, 0.156, 0.184, -0.02), (0.1, 0.15, 0.178, -0.02))],
        'shoeCollar',
    )
    # (the tongue, up out of the laces in front of his ankle)
    tongue = ellipsoid((ox, oy + 0.16, 0.135), (0.085, 0.15, 0.032), 8, 5, 'shoeTongue', Matrix.Rotation(-0.42, 3, 'X'))
    smooth(tongue)
    for o in (upper, collar, tongue):
        set_material(o, material(SHOE))
    smooth(upper, 62)
    smooth(collar)
    # the sole: flat on the floor, its toe turned up a little
    rings = []
    for z, hw, _top in [(-0.33, 0.05, 0), (-0.305, 0.12, 0)] + up[2:-2] + [(0.68, 0.11, 0), (0.715, 0.04, 0)]:
        lift = 0.035 * clamp((z - 0.42) / 0.3) ** 2 + 0.012 * clamp((-0.2 - z) / 0.13) ** 2
        r = []
        for k in range(12):
            a = 2 * math.pi * k / 12
            cx, sy = math.cos(a), math.sin(a)
            x = (hw + 0.016) * math.copysign(abs(cx) ** 0.45, cx)
            y = -ANKLE + lift + (0.047 if sy > 0 else 0.0) + 0.045 * math.copysign(abs(sy) ** 0.3, sy) * (0.5 if sy > 0 else 0.0)
            r.append((ox + x, oy + y + (0.045 if sy > 0 else 0), z))
        rings.append(r)
    sole = solid(rings, 'sole')
    set_material(sole, material(WHITE))
    smooth(sole, 50)
    foot = FOOT_L if s > 0 else FOOT_R
    # (the collar is soft: it goes with the shin as the sock inside it does, so an ankle can bend without the leg cutting through the shoe)
    return [tag(upper, foot), tag(collar, BY_PLACE), tag(tongue, BY_PLACE), tag(sole, foot)]


# --- cutting the skin into what shows ---

def pit(p, s):
    """How far past an armhole's plane (toward the arm) a point is."""
    return (s * p[0] - PIT[0]) * PIT_N.x + (p[1] - PIT[1]) * PIT_N.y


def vee(p):
    """How far above the V of the neck a point is (per unit of the planes' slope)."""
    return (p[1] - VK * abs(p[0]) + VM * p[2] - VC) / VLEN


def cut(obj, planes, keep, under=None):
    """
    Splits the mesh along each plane ((point, normal), game frame), then keeps the faces `keep` says yes to (by their
    middle). `under`: only what is below that height is split (a plane through his shoulder goes on up through his face).
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for co, no in planes:
        if under is None:
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        else:
            fs = [f for f in bm.faces if all(G(v.co)[1] < under for v in f.verts)]
            geom = list({v for f in fs for v in f.verts}) + list({e for f in fs for e in f.edges}) + fs
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=B(*co), plane_no=B(*no))
    dead = [f for f in bm.faces if not keep(G(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def plane_pit(s, off=0.0):
    return (s * (PIT[0] + off * PIT_N.x), PIT[1] + off * PIT_N.y, 0), (s * PIT_N.x, PIT_N.y, 0)


def plane_vee(s, off=0.0):
    return (0, VC + off * VLEN, 0), (-s * VK, 1, VM)


def level(y):
    return (0, y, 0), (0, 1, 0)


def push(obj, how):
    """Moves each point along its normal by how(point) feet."""
    for v in obj.data.vertices:
        v.co = v.co + v.normal * how(G(v.co))
    obj.data.update()


def relax(obj, times, factor=0.5):
    return apply_modifier(obj, 'SMOOTH', factor=factor, iterations=times)


def thin(obj, tris):
    return apply_modifier(obj, 'DECIMATE', decimate_type='COLLAPSE', ratio=min(1.0, tris / tri_count(obj)), use_collapse_triangulate=True)


def swell(obj, c, reach, by, back=False):
    """
    Blows the mesh up round c (by `by` within `reach`, pushed out past it), or undoes that. Thinning
    goes by size, so what is swollen while it's thinned keeps more of its triangles: a face needs them.
    """
    c = Vector(c)
    for v in obj.data.vertices:
        d = G(v.co) - c
        r = d.length
        if r < 1e-6:
            continue
        if back:
            to = r / by if r < reach * by else r - reach * (by - 1)
        else:
            to = r * by if r < reach else r + reach * (by - 1)
        v.co = B(*(c + d * (to / r)))
    obj.data.update()


def slots(obj, mats, pick):
    """Gives the mesh these materials; each face takes the one `pick` names (by its middle)."""
    obj.data.materials.clear()
    for m in mats:
        obj.data.materials.append(material(m))
    for f in obj.data.polygons:
        f.material_index = mats.index(pick(G(f.center)))


# --- which bones a point follows ---

def weights(p, kind):
    x, y, z = p
    w = {}
    arms = 0.0
    for s, ua, fa, ha in ((1, 'ual', 'fal', 'hal'), (-1, 'uar', 'far', 'har')):
        loc = ARM_INV[s] @ Vector(p)
        u = -loc.y
        rho = math.hypot(loc.x, loc.z)
        # (the top of his shoulder gives way to the arm slowly, the armpit quickly: an arm that hangs leaves no shelf over it;
        # on the man on the floor the front and back of his armpit give way over a longer run of skin, so an arm let down
        # to his side folds no crease into his chest round the cap of his shoulder)
        out = max(0.0, s * loc.x / rho) if rho > 1e-6 else 0.0
        m = 1.0 if u > 0.8 and rho < 0.6 else (1 - sstep(0.31, 0.5, rho)) * (sstep(-0.3 - 0.04 * out, 0.5 - 0.22 * out, u) if girdled else sstep(-0.24 - 0.14 * out, 0.3 + 0.4 * out, u))
        # (nothing inside the vest's armhole goes with the arm, skin or cloth: the armhole keeps its shape and what
        # comes through it its place in it, whatever the arm does; the arm takes over just outside it)
        m *= sstep(0.0, 0.11, pit(p, s))
        if m <= 0:
            continue
        e = sstep(UARM - 0.24, UARM + 0.24, u)
        h = sstep(ARM - 0.1, ARM + 0.1, u)
        # (the ball of muscle at the heel of his hand, over the thumb's long bone, goes part of the way with the thumb: see THUMB)
        tb = 0.0 if kind == REAL else thenar(loc, s) * h
        if girdled:
            # (his chest gives way to the shoulder's own bone, and that to the arm: two gentle turns, not one sharp one)
            mine = sstep(0.45, 1.0, m)
            both = sstep(0.0, 0.55, m)
            # (but not under the joint: the shoulder's bone turned half way would carry his armpit out to his side, a
            # shelf of skin under an arm raised overhead. The skin under it nearest his chest has a bone of its own,
            # which figure.ts turns about the hollow of his armpit, so it stays on his side and stretches up to the arm)
            under = max(0.0, -s * loc.x / rho) if rho > 1e-6 else 0.0
            pitw = (both - mine) * sstep(0.1, 0.55, under) * (1 - sstep(0.3, 0.7, m))
            w['cll' if s > 0 else 'clr'] = both - mine - pitw
            w['axl' if s > 0 else 'axr'] = pitw
            tw = sstep(UARM + 0.3, ARM - 0.08, u)
            w[ua], w[fa], w[ha] = mine * (1 - e), mine * e * (1 - h) * (1 - tw), mine * e * (h - tb)
            w['fwl' if s > 0 else 'fwr'] = mine * e * (1 - h) * tw
            arms += both
        else:
            mine = m
            w[ua], w[fa], w[ha] = m * (1 - e), m * e * (1 - h), m * e * (h - tb)
            arms += m
        w['th1' + ('l' if s > 0 else 'r')] = mine * e * tb
    rest = max(0.0, 1 - arms)
    legs = sstep(HIP + 0.14, HIP - 0.4, y)
    if legs > 0 and rest > 0:
        left = sstep(-0.07, 0.07, x)
        k = sstep(KN_Y + 0.26, KN_Y - 0.26, y)
        f = sstep(AN_Y + 0.3, AN_Y + 0.02, y)
        for share, th, sh, ft, hem in ((left, 'thl', 'shl', 'ftl', 'hemL'), (1 - left, 'thr', 'shr', 'ftr', 'hemR')):
            lag = sstep(0.42, 1.0, (WAIST - y) / (WAIST - HEM)) * 0.55 if kind == SHORTS else 0.0
            w[th] = rest * legs * share * (1 - k) * (1 - lag)
            w[hem] = rest * legs * share * (1 - k) * lag
            w[sh] = rest * legs * share * k * (1 - f)
            w[ft] = rest * legs * share * k * f
    up = rest * (1 - legs)
    c = sstep(HIP + 0.2, HIP + 1.5, y)
    # (his neck never goes all the way with his head: figure.ts tells his head from his neck by that)
    n = sstep(CHEST_Y + 0.17, CHEST_Y + 0.62, y) * 0.96
    if girdled:
        # (his pelvis gives way to the small of his back, and that to his ribs; his ribs to his neck, and that to his
        # head: each over a span of its own, so a bend or a turn is shared out along him)
        sp = HIP + SPINE_AT * TORSO
        a = sstep(HIP + 0.15, sp + 0.1, y)
        b = sstep(sp - 0.1, HIP + 1.5, y)
        t = sstep(CHEST_Y + 0.17, CHEST_Y + 0.62, y)
        hd = max(0.0, 2 * t - 1)
        w['pelvis'], w['spine'] = up * (1 - a), up * a * (1 - b)
        w['chest'], w['neck'], w['head'] = up * a * b * max(0.0, 1 - 2 * t), up * a * b * (1 - abs(2 * t - 1) + 0.04 * hd), up * a * b * hd * 0.96
    else:
        w['pelvis'], w['chest'], w['head'] = up * (1 - c), up * c * (1 - n), up * c * n
    top = sorted(((v, k) for k, v in w.items() if v > 0.004), reverse=True)[:4]
    tot = sum(v for v, _ in top)
    return {k: v / tot for v, k in top}


def thenar(loc, s):
    """How much of a point of the hand (the arm's frame) is over the thumb's long bone, root to middle knuckle (0..THENAR)."""
    (a, _), (b, _) = THUMB[0], THUMB[1]
    a = Vector((-s * a[0], -(ARM + a[1]), a[2]))
    b = Vector((-s * b[0], -(ARM + b[1]), b[2]))
    ab = b - a
    t = (loc - a).dot(ab) / ab.length_squared
    off = (a + ab * clamp(t) - loc).length
    return THENAR * (1 - sstep(0.07, 0.14, off)) * sstep(0.05, 0.4, t) * sstep(1.15, 0.95, t)


def near_line(q, pts):
    """How far a point is from a line through these points."""
    best = 1e9
    for a, b in zip(pts, pts[1:]):
        ab = b - a
        t = clamp((q - a).dot(ab) / max(1e-9, ab.length_squared))
        best = min(best, (a + ab * t - q).length)
    return best


def hand_weights(p, kind):
    """A finger's or a thumb's points (the one whose line they are nearest): with the hand as far as its first joint, then with each of its two."""
    s, sfx = (1, 'l') if kind == HAND_L else (-1, 'r')
    loc = ARM_INV[s] @ Vector(p)
    name, (_, (j1, d1), (j2, d2)) = min(DIGITS[s].items(), key=lambda kv: near_line(loc, kv[1][0]))
    # (a thumb's root is deep in the heel of the hand: its first share of the way up it stays with the hand, and goes over to its bone softly)
    k1 = sstep(0.0, 0.07, (loc - j1).dot(d1)) if name == 'th' else sstep(-0.035, 0.035, (loc - j1).dot(d1))
    k2 = sstep(-0.03, 0.03, (loc - j2).dot(d2))
    w = {'ha' + sfx: 1 - k1, f'{name}1{sfx}': k1 * (1 - k2), f'{name}2{sfx}': k1 * k2}
    return {k: v for k, v in w.items() if v > 0.004}


def swing_weights(p):
    """Hair that hangs: with his head where it grows, more and more with the bone it swings from the lower it hangs."""
    w = sstep(HEAD_C[1] + 0.05, HEAD_C[1] - 0.4, p[1]) * 0.9
    return {'head': 1 - w, 'hair': w} if w > 0.004 else {'head': 1.0}


def face_weights(p):
    """
    His head's points: all his head's, but for what his jaw, his nose and (on the floor) his brows take with them.
    His jaw and nose shape a face, and his jaw comes open: under the line of his mouth his lip is all his jaw's,
    over it none of it, and out past the corners of his mouth his cheeks go from one to the other over their width.
    """
    size = (HEAD_W, HEAD_H, HEAD_D)
    d = [(p[i] - HEAD_C[i]) / size[i] for i in range(3)]
    ln = math.sqrt(sum(v * v for v in d)) or 1.0
    n = tuple(v / ln for v in d)
    px, py = face_at(n)
    if _real is not None:
        # (the real man's face, read where the formula has it: see mhbody.py's face_t)
        px, py = (float(v) for v in mhbody.face_t(px, py))
    apx = abs(px)
    nose = sstep(0.1, 0.4, n[2]) * math.exp(-((px / 0.2) ** 2 + ((py + 0.25) / 0.17) ** 2)) * 0.9
    # (round the sides, by how far under the line from his ear to the corner of his mouth; in front, by the line of his mouth)
    side = sstep(-0.15, -0.6, n[1] / max(0.35, math.hypot(n[0], n[2]))) * sstep(-0.5, 0.0, n[2])
    # (under the line his lower lip goes with his jaw: all of it in the middle of his mouth, less and less toward its
    # corners, where the two lips meet: an open mouth is an oval, its lower lip a curve, not a box with his lips
    # stretched down its sides; the skin under it more and more of it down to his chin)
    edge = max(0.0, 1 - (apx / (MOUTH_W - 0.01)) ** 2) ** 0.5
    under = edge + (1 - edge) * sstep(0.0, 0.22, MOUTH_Y - py) if py < MOUTH_Y else 0.0
    # (out past the corners his cheeks go from one to the other over their width)
    soft = 0.001 + 0.5 * sstep(MOUTH_W - 0.06, MOUTH_W + 0.4, apx)
    out = sstep(SLIT - 0.02, MOUTH_W + 0.02, apx)
    lip = under * (1 - out) + sstep(MOUTH_Y + soft, MOUTH_Y - soft, py) * out
    k = sstep(0.25, 0.5, n[2]) * sstep(MOUTH_W + 0.55, MOUTH_W + 0.1, apx)
    jaw = (side * (1 - k) + lip * k) * (1 - nose)
    brow = lower = 0.0
    if girdled:
        # (his lower lip, and the skin just under it, is its own bone's: see GIRDLE)
        lower = jaw * sstep(-0.74, -0.62, py) * sstep(MOUTH_W + 0.14, MOUTH_W - 0.02, apx) * sstep(0.3, 0.5, n[2])
        jaw -= lower
    if girdled and n[2] > 0.1:
        brow = 0.85 * sstep(0.1, 0.4, n[2]) * math.exp(-(((py - brow_at(apx) - 0.02) / 0.1) ** 2)) * sstep(1.0, 0.7, apx) * (1 - nose) * (1 - jaw)
    w = {'head': 1 - nose - jaw - brow - lower, 'jaw': jaw, 'nose': nose, 'brow': brow, 'lip': lower}
    return {k: v for k, v in w.items() if v > 0.004}


def face_shade(x, y, z):
    """The face's hollows, darker than light alone leaves them at a distance: the eyes, under the brow, the mouth."""
    w, h, d = HEAD_W, HEAD_H, HEAD_D
    px, py, pz = x / w, (y - HEAD_C[1]) / h, z - HEAD_C[2]
    if pz < 0.1 * d or abs(py) > 1.05:
        return 1.0
    c = 1.0
    for ex in (-0.38, 0.38):
        c -= 0.06 * math.exp(-(((px - ex) / 0.16) ** 2 + ((py - 0.07) / 0.06) ** 2))
    c -= 0.05 * math.exp(-((py + 0.52) ** 2) / 0.0016) * math.exp(-((px / 0.26) ** 2))
    return max(0.7, c)


def rig(mesh):
    """The bones, each where the puppet's joint is and turned the way figure.ts turns it when he stands as built."""
    arm_data = bpy.data.armatures.new('rig')
    ob = link(bpy.data.objects.new('rig', arm_data))
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eye = Matrix.Identity(4)
    rest = {
        'pelvis': Matrix.Translation((0, HIP, 0)),
        'chest': Matrix.Translation((0, CHEST_Y, 0)),
        'head': Matrix.Translation((0, HEAD_Y, 0)),
        'hem': Matrix.Translation((0, HIP - 0.03, 0)),
        'spine': Matrix.Translation((0, HIP + SPINE_AT * TORSO, 0)),
        'neck': Matrix.Translation((0, CHEST_Y + NECK_AT, 0)),
    }
    for s, sfx, ua, fa, ha, th, sh, ft in ((1, 'L', 'ual', 'fal', 'hal', 'thl', 'shl', 'ftl'), (-1, 'R', 'uar', 'far', 'har', 'thr', 'shr', 'ftr')):
        f = arm_frame(s)
        for name, u in ((ua, 0), (fa, UARM), (ha, ARM)):
            rest[name] = f @ Matrix.Translation((0, -u, 0))
        rest[th] = Matrix.Translation((s * HIP_W, HIP, 0))
        rest[sh] = Matrix.Translation((s * HIP_W, KN_Y, 0))
        rest[ft] = Matrix.Translation((s * HIP_W, AN_Y, 0))
        rest['hem' + sfx] = Matrix.Translation((s * HIP_W, KN_Y + 0.7, 0))
        # (each finger's and the thumb's two bones at its joints, turned as the hand is)
        for d, (_, (j1, _), (j2, _)) in DIGITS[s].items():
            rest[d + '1' + sfx.lower()] = f @ Matrix.Translation(j1)
            rest[d + '2' + sfx.lower()] = f @ Matrix.Translation(j2)
        rest['cl' + sfx.lower()] = f
        rest['ax' + sfx.lower()] = f
        rest['fw' + sfx.lower()] = rest[fa]
    for name, at in (('jaw', JAW_AT), ('nose', NOSE_AT), ('hair', SWING_AT), ('brow', BROW_AT), ('lip', JAW_AT)):
        rest[name] = Matrix.Translation((HEAD_C[0] + at[0] * HEAD_W, HEAD_C[1] + at[1] * HEAD_H, HEAD_C[2] + at[2] * HEAD_D))
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    for name in [*BONES, *leaves()]:
        eb = arm_data.edit_bones.new(name)
        eb.head = (0, 0, 0)
        eb.tail = (0, 0.3, 0)
        eb.matrix = conv @ rest[name]
    for name, parent in leaves().items():
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = ob
    mod = mesh.modifiers.new('rig', 'ARMATURE')
    mod.object = ob
    return ob


def fused():
    """One skin over all his masses."""
    masses = [trunk(), *neck()]
    for s in (1, -1):
        masses += arm(s) + girdle(s) + leg(s)
    hi = join(masses, 'hi')
    hi = apply_modifier(hi, 'REMESH', mode='VOXEL', voxel_size=0.019, adaptivity=0.0, use_smooth_shade=True)
    relax(hi, 5)
    return hi


# a hand is swollen this much (within this far of its middle, ft) while the skin is thinned: thinning goes by size, so
# it keeps more of the triangles than its size would give it (the knuckles' row, the hollow of the palm, the heel of
# the thumb are a few hundredths of a foot; at the body's own share a palm is a smooth pad)
HAND_SWELL = 1.7
HAND_REACH = 0.32


def thin_body(hi, tris):
    """The skin, thinned (his head is a skin of its own: see head), his hands at more than their share (HAND_SWELL)."""
    at = []
    for s in (1, -1):
        c = arm_frame(s) @ Vector((0.0, -(ARM + 0.2), 0.01))
        # (where this hand's middle is once the other is swollen: pushed off it as everything past its reach is)
        for o in at:
            d = c - o
            c = o + d * ((d.length + HAND_REACH * (HAND_SWELL - 1)) / d.length)
        swell(hi, c, HAND_REACH, HAND_SWELL)
        at.append(c)
    hi = thin(hi, tris)
    for c in reversed(at):
        swell(hi, c, HAND_REACH, HAND_SWELL, back=True)
    return hi


def shorts_form(legs=None, folds=0.022):
    """
    The shorts as a solid of their own (cloth hangs from the hips; it doesn't cling to what's under
    it): a seat round both hips down to the fork, a loose leg each side with a gap between the two,
    a few folds toward the hem. `legs` (height, how far out its middle is, half width, depth in
    front and behind, from the bottom up to the fork) makes them something longer: a suit's trousers.
    """
    # (height, half width, depth in front, depth behind, how far forward its middle sits)
    seat = [
        (FORK + 0.08, 0.3, 0.14, 0.2, 0.0),
        (FORK + 0.2, 0.52, 0.24, 0.34, 0.0),
        (FORK + 0.36, 0.7, 0.36, 0.44, 0.0),
        (HIP - 0.14, 0.785, 0.425, 0.475, 0.0),
        (HIP - 0.02, 0.795, 0.44, 0.495, -0.01),
        (HIP + 0.2, 0.715, 0.41, 0.45, -0.01),
        (WAIST - 0.12, 0.6, 0.385, 0.385, 0.0),
        (WAIST + 0.02, 0.555, 0.378, 0.358, 0.0),
        (WAIST + 0.3, 0.545, 0.37, 0.35, 0.0),
    ]
    parts = [solid([ring((0, y, zc), rx, rzf, 40, rzb, square=2.5) for y, rx, rzf, rzb, zc in seat], 'seat')]
    for s in (1, -1):
        # (the two legs are one cloth down to the fork, and part below it: seen from in front, an upturned V between them)
        # (cut wide, as the game's are: the legs flare a little to the hem, standing off his thighs all round)
        low = legs or [(HEM - 0.25, 0.47, 0.418, 0.47, 0.48), (HEM, 0.465, 0.414, 0.468, 0.478), (FORK - 0.12, 0.425, 0.39, 0.442, 0.455)]
        up = [(FORK + 0.04, 0.385, 0.392, 0.428, 0.445), (HIP - 0.3, 0.385, 0.4, 0.43, 0.45), (HIP - 0.05, 0.4, 0.37, 0.425, 0.45), (HIP + 0.12, 0.4, 0.29, 0.37, 0.4)]
        parts.append(solid([ring((s * cx, y, 0.012), rx, rzf, 28, rzb) for y, cx, rx, rzf, rzb in low + up], 'leg'))
    form = join(parts, 'shorts')
    form = apply_modifier(form, 'REMESH', mode='VOXEL', voxel_size=0.022, adaptivity=0.0, use_smooth_shade=True)
    relax(form, 8)
    # folds: each leg's cloth gathers a little, more toward the hem
    for v in form.data.vertices:
        x, y, z = G(v.co)
        if y > HIP - 0.2:
            continue
        cx = math.copysign(0.445, x)
        a = math.atan2(z - 0.012, x - cx)
        r = math.hypot(x - cx, z - 0.012)
        deep = folds * sstep(HIP - 0.2, HEM, y) * (math.sin(a * 5 + 0.7 * math.copysign(1, x)) + 0.5 * math.sin(a * 9 + 2.0))
        k = (r + deep) / r if r > 1e-6 else 1
        v.co = B(cx + (x - cx) * k, y, 0.012 + (z - 0.012) * k)
    form.data.update()
    return form


def hairline(p):
    """How far over his hairline a point of his head is (in head heights; under 0: his face, his neck)."""
    py, pz = (p[1] - HEAD_C[1]) / HEAD_H, (p[2] - HEAD_C[2]) / HEAD_D
    return max(py - HAIR_AT - HAIR_FRONT * pz, py - HAIR_AT - HAIR_BACK * pz)


def crop(body):
    """His hair, cropped close: his scalp over the hairline, a material of its own (the bench's colour; on the floor his hair is painted, see figure.ts). Takes his head."""
    c = HEAD_C
    lines = [((0, c[1] + HAIR_AT * HEAD_H, c[2]), (0, 1 / HEAD_H, -k / HEAD_D)) for k in (HAIR_FRONT, HAIR_BACK)]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for co, no in lines:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=B(*co), plane_no=B(*no))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    slots(body, [SKIN, HAIR], lambda p: HAIR if hairline(p) > 0 and p[1] > HEAD_C[1] - HEAD_H else SKIN)
    return body


def fit_shorts(shorts, body):
    """
    The shorts cut to the real man, from their waistband to their hem (the form is cut for a thicker trunk, and its
    legs for thicker thighs): at each height the cloth is his own girth there and a little room, more of it lower
    down, and never less cloth than just above (cloth hangs from the widest of him: it doesn't follow him back in
    under his hips, nor in to his knee). One rule all the way down. Fitted at the waistband alone and left the form's
    own below it, the seat stood off his hips a hand's breadth each side, a puff under a drawn-in band; fitted to the
    fork and eased back to the form's own over the top of each leg, the puff only moved down: a seat cut to him, and
    under it the form's legs a hand wider than his thighs, out in front of them and to each side like riding breeches.
    So the legs hang from his seat as the seat hangs from his hips: straight down, off his thighs by the same room.
    """
    def girth(o, y):
        ps = [G(v.co) for v in o.data.vertices]
        ps = [p for p in ps if abs(p[1] - y) < 0.04 and abs(p[0]) < 0.9]
        return max(abs(p[0]) for p in ps), max(p[2] for p in ps), max(-p[2] for p in ps)

    # (from the waistband down to where the two legs part, and on down the legs to the hem; the room: a thumb at the
    # band, two fingers over his seat, three at the hem, where a leg of them stands off his thigh all round)
    SEAT, LEG = 8, 6
    ys = [WAIST + (FORK + 0.1 - WAIST) * k / (SEAT - 1) for k in range(SEAT)]
    ys += [FORK + 0.1 + (HEM - FORK - 0.1) * k / LEG for k in range(1, LEG + 1)]
    his = [girth(body, y) for y in ys]
    theirs = [girth(shorts, y) for y in ys]
    fit = []
    most = [0.0, 0.0, 0.0]
    for k, (b, s) in enumerate(zip(his, theirs)):
        room = 0.05 + 0.045 * sstep(0.0, 4.0, k) + 0.035 * sstep(SEAT - 1.0, SEAT + LEG - 1.0, k)
        most = [max(m, v + room) for m, v in zip(most, b)]
        fit.append([m / v for m, v in zip(most, s)])
    bw, bf, bb = his[0]
    sw, sf, sb = theirs[0]
    print(f'[models] shorts: his waist {bw:.3f} wide, {bf:.3f} and {bb:.3f} deep; theirs {sw:.3f}, {sf:.3f}, {sb:.3f}; his seat {max(h[0] for h in his):.3f} wide, theirs {max(t[0] for t in theirs):.3f}')
    k = SEAT + 1
    print(f'[models] shorts: under the fork his thighs {his[k][0]:.3f} out, {his[k][1]:.3f} and {his[k][2]:.3f} deep; theirs {theirs[k][0]:.3f}, {theirs[k][1]:.3f}, {theirs[k][2]:.3f}; cut to {most[0]:.3f}, {most[1]:.3f}, {most[2]:.3f} at the hem')

    def at(y):
        # (above the band, the band's; below the hem, the hem's)
        if y >= ys[0]:
            return fit[0]
        for k in range(len(ys) - 1):
            if y >= ys[k + 1]:
                u = (ys[k] - y) / (ys[k] - ys[k + 1])
                return [a + (b - a) * u for a, b in zip(fit[k], fit[k + 1])]
        return fit[-1]

    for v in shorts.data.vertices:
        x, y, z = G(v.co)
        fx, ff, fb = at(y)
        v.co = B(x * fx, y, z * (fb + (ff - fb) * sstep(-0.12, 0.12, z)))
    shorts.data.update()


def kit(mid, q=1.0):
    """His kit, cut from a lighter copy of his skin (`mid`, which becomes his socks): a V-neck vest tucked into shorts, socks."""
    # the vest: his trunk, a little looser, cut at the armholes and the V of the neck, tucked in; a band of trim round each opening
    vest = copy(mid, 'vest')
    # (it stands a little further off him round the armholes: the skin that goes on under their edge never shows through)
    # (and it is cloth, not paint: it stands off his chest a little and hangs from it, so it is well off his belly and
    # the small of his back, and blouses over the waistband it's tucked into)
    push(vest, lambda p: 0.026 + 0.034 * sstep(-0.32, -0.08, max(pit(p, 1), pit(p, -1))) + 0.022 * sstep(WAIST, WAIST + 0.14, p[1]) + 0.05 * sstep(WAIST + 0.1, WAIST + 0.45, p[1]) * sstep(5.2, 4.55, p[1]))
    # (smoothed well: it bridges the hollows of his chest and back, and doesn't show every muscle under it)
    relax(vest, 16)
    # (it gathers in folds over the waistband it's tucked into, and hangs in a few under each arm)
    for v in vest.data.vertices:
        p = G(v.co)
        a = math.atan2(p[2], p[0])
        waist = sstep(WAIST + 0.6, WAIST + 0.14, p[1]) * sstep(TUCK - 0.04, WAIST + 0.1, p[1])
        side = sstep(0.3, 0.55, abs(p[0])) * sstep(WAIST + 0.2, 4.3, p[1]) * sstep(4.85, 4.5, p[1])
        # (only ever out from him: a fold in toward him would let his skin through)
        k = 1 + 0.04 * waist * (1.1 + math.sin(a * 7 + 0.6) + 0.5 * math.sin(a * 13 + 2.0)) + 0.026 * side * (1 + math.sin(p[1] * 9 + a * 3))
        v.co = B(p[0] * k, p[1], p[2] * k)
    # (and it hangs from the fullest of his chest and his shoulder blades, nearly straight down to where it's tucked
    # in: it bridges the hollow under his chest and the small of his back, as a vest does, and doesn't cling under them)
    peak = {}
    for v in vest.data.vertices:
        x, y, z = G(v.co)
        if 4.7 < y < 5.3 and abs(x) < 0.7:
            key = (round(x / 0.05), z > 0)
            peak[key] = max(peak.get(key, 0.0), abs(z))
    for v in vest.data.vertices:
        x, y, z = G(v.co)
        crest = peak.get((round(x / 0.05), z > 0))
        if crest is None or not TUCK < y < 5.1:
            continue
        hang = crest - 0.07 * (5.05 - y)
        k = sstep(TUCK + 0.15, TUCK + 0.55, y) * sstep(0.68, 0.4, abs(x))
        if hang > abs(z):
            v.co = B(x, y, math.copysign(abs(z) + (hang - abs(z)) * k, z))
    vest.data.update()
    relax(vest, 2)
    thin(vest, (5340 if q >= 1 else 3000) * q)
    relax(vest, 3 if q >= 1 else 1)
    in_vest = lambda p: p[1] > TUCK and p[1] < 5.75 and pit(p, 1) <= 0 and pit(p, -1) <= 0 and vee(p) <= 0  # noqa: E731
    cut(vest, [level(TUCK), plane_pit(1), plane_pit(-1), plane_vee(1), plane_vee(-1), plane_pit(1, -TRIM), plane_pit(-1, -TRIM), plane_vee(1, -TRIM), plane_vee(-1, -TRIM)], in_vest)
    slots(vest, [JERSEY, TRIM_M], lambda p: TRIM_M if pit(p, 1) > -TRIM or pit(p, -1) > -TRIM or vee(p) > -TRIM else JERSEY)

    # the shorts: their own shape over his hips, a leg each; a waistband, a hem band and a stripe down each side
    shorts = shorts_form()
    if _real is not None:
        fit_shorts(shorts, mid)
    thin(shorts, 3320 * q)
    stripe = lambda p: abs(p[2] - 0.02) < 0.075 and abs(p[0]) > 0.45  # noqa: E731
    cut(
        shorts,
        [level(HEM), level(WAIST), level(HEM + 0.085), level(WAIST - 0.13), ((0, 0, 0.095), (0, 0, 1)), ((0, 0, -0.055), (0, 0, 1))],
        lambda p: HEM < p[1] < WAIST and abs(p[0]) < 1.2,
    )
    slots(shorts, [CLOTH, TRIM_M], lambda p: TRIM_M if p[1] < HEM + 0.085 or p[1] > WAIST - 0.13 or stripe(p) else CLOTH)
    tag(shorts, SHORTS)

    # the socks, a cuff at the top
    socks = mid
    push(socks, lambda p: 0.009 + 0.013 * sstep(SOCK_HI - 0.16, SOCK_HI - 0.1, p[1]))
    thin(socks, 2000 * q)
    cut(socks, [level(SOCK_LO), level(SOCK_HI)], lambda p: SOCK_LO < p[1] < SOCK_HI)
    set_material(socks, material(WHITE))

    return vest, shorts, socks


def dress_player(hi, q=1.0):
    """In his kit: a V-neck vest tucked into shorts, socks, sneakers. `q` scales how many triangles he's made of (the bench is seen from far off)."""
    # (the clothes are cut from a lighter copy: cloth has no fine detail to keep)
    mid = thin(copy(hi, 'mid'), 44000)

    # the skin that shows: head, neck and shoulders outside the vest, the arms; the legs from under the shorts to inside the socks
    body = thin_body(hi, (8600 if q >= 1 else 3000) * q)
    # (how far under the vest's edges his skin goes on: less on the benches' coarser bodies, which would poke through it)
    under = UNDER if q >= 1 else 0.07
    cut(
        body,
        [plane_pit(1, -under), plane_pit(-1, -under), plane_vee(1, -under), plane_vee(-1, -under), level(HEM + 0.3), level(SOCK_HI - 0.06)],
        lambda p: pit(p, 1) > -under or pit(p, -1) > -under or (vee(p) > -under and p[1] > 4.9) or (SOCK_HI - 0.06 < p[1] < HEM + 0.3 and abs(p[0]) < 1.2),
    )
    set_material(body, material(SKIN))
    top = crop(head(q, slit=q >= 1))

    vest, shorts, socks = kit(mid, q)
    for o in (body, vest, socks):
        tag(o, BY_PLACE)
    built = [body, top, vest, shorts, socks, *ears(EAR if q >= 1 else SKIN), *(mouth() if q >= 1 else [])]
    for s in (1, -1):
        built += fingers(s) + (shoe_fine(s) if q >= 1 else shoe(s))
    return built


def real_player():
    """The man on the floor: a real man's body and head on the puppet's joints (mhbody.py), his head the size a head is."""
    global HEAD_W, HEAD_H, HEAD_D, _real
    HEAD_W, HEAD_H, HEAD_D = PLAYER_HEAD
    # (each finger's line, as fingers() lays them out: theirs are put on ours)
    for s in (1, -1):
        for o in fingers(s):
            bpy.data.objects.remove(o)
    ours = {
        'eye': face_point(EYE_X, EYE_Y),
        'eye_x': face_point(EYE_X, EYE_Y)[0],
        'nose': face_point(0, NOSE_TIP),
        'mouth': face_point(MOUTH_W, MOUTH_Y),
        'chin': face_point(0, -0.84),
        'crown': (0, HEAD_C[1] + head_r((0, 1, 0)) * HEAD_H, HEAD_C[2]),
        'back': (0, HEAD_C[1], HEAD_C[2] - head_r((0, 0, -1)) * HEAD_D),
    }
    # (figure.ts's own numbers for what it paints: his eye's half width as it draws it, how far open, his lips' corners)
    marks = {'eye': (EYE_X, EYE_Y, 0.166), 'eye_up': 0.05, 'eye_low': 0.039, 'mouth_y': MOUTH_Y, 'mouth_w': MOUTH_W}
    m = dict(HIP=HIP, KN_Y=KN_Y, AN_Y=AN_Y, HIP_W=HIP_W, SHOULDER=SHOULDER, SH_Y=SH_Y, UARM=UARM, FARM=FARM, ARM_OUT=ARM_OUT)
    _real = mhbody.Player(m, DIGITS, ours, HEAD_C, PLAYER_HEAD, marks)
    return _real


def real_skin(man, faces, name, mh=False):
    """
    Some of the real man's faces as a mesh, each point knowing which of theirs it is (`mhv`), what it is (`tag`) and
    its fingers' shares (`d_...`); with `mh`, each corner its modellers' uv too (`mhuv`: finish makes it his skin's
    second uv). Only his skin as it is drawn takes that: Blender's thinning minds a uv, so a copy the clothes are cut
    from (or a bench man's skin) would come out another shape with one.
    """
    used = sorted({i for f in faces for i in f})
    to = {v: i for i, v in enumerate(used)}
    o = mesh_obj(name, [tuple(man.Q[i]) for i in used], [[to[i] for i in f] for f in faces])
    me = o.data
    if mh:
        # (polygon i is faces[i], its corners in their order: from_pydata keeps both)
        me.attributes.new('mhuv', 'FLOAT2', 'CORNER').data.foreach_set('vector', [c for f in faces for t in man.uv_of[tuple(f)] for c in t])
    me.attributes.new('tag', 'INT', 'POINT').data.foreach_set('value', [FACE if man.is_head[i] else REAL for i in used])
    me.attributes.new('mhv', 'FLOAT', 'POINT').data.foreach_set('value', [float(i + 1) for i in used])
    me.attributes.new('ball', 'FLOAT', 'POINT').data.foreach_set('value', [1.0 if man.eye[i] or man.lip_edge[i] else 0.0 for i in used])
    for d in mhbody.DIGIT_OF:
        for k in (1, 2):
            me.attributes.new(f'd_{d}{k}', 'FLOAT', 'POINT').data.foreach_set('value', [float(man.digits[f'{d}{k}l'][i] + man.digits[f'{d}{k}r'][i]) for i in used])
    return o


def scalp_of(man, shut=False):
    """His head's skin to find a point of his scalp on (see on_head), and each eye's ball (its middle and how big it is: see on_eye)."""
    global _scalp, _balls
    from mathutils.bvhtree import BVHTree

    pts, polys = [], []
    for f in man.faces + man.eyes + (man.lips_shut if shut else []):
        # (and the top of his neck under it: what grows under his jaw is put on that)
        if min(man.Q[i][1] for i in f) > HEAD_C[1] - HEAD_H * 1.45 and all(abs(man.Q[i][0]) < 0.5 for i in f):
            polys.append(list(range(len(pts), len(pts) + len(f))))
            pts += [Vector(man.Q[i]) for i in f]
    _scalp = BVHTree.FromPolygons(pts, polys)
    _balls = {}
    for s in (1, -1):
        ix = sorted({i for f in man.eyes for i in f if s * man.Q[i][0] > 0})
        P = np.array([man.Q[i] for i in ix])
        # (the ball those points are on: least squares)
        A = np.hstack([2 * P, np.ones((len(P), 1))])
        sol, *_ = np.linalg.lstsq(A, (P * P).sum(1), rcond=None)
        c = sol[:3]
        _balls[s] = (Vector(c), math.sqrt(sol[3] + c @ c))


def on_eye(n, out=0.0):
    """The point of his eye's ball along n (in the head's half sizes), `out` feet off it: where his lids are in the way, the ball behind them."""
    size = (HEAD_W, HEAD_H, HEAD_D)
    d = Vector([n[i] * size[i] for i in range(3)]).normalized()
    c, r = _balls[1 if n[0] > 0 else -1]
    o = Vector(HEAD_C) - c
    b = o.dot(d)
    disc = b * b - (o.length_squared - r * r)
    t = -b + math.sqrt(disc) if disc > 0 else -b
    p = Vector(HEAD_C) + d * t
    # (a ray that misses the ball: the point of the ball nearest it)
    return c + (p - c).normalized() * (r + out)


def dress_real(man):
    """The real man in his kit: as dress_player, but his skin is his own points (none thinned away), his head, ears and hands part of it."""
    global _scalp
    from mathutils.bvhtree import BVHTree

    # (the clothes are cut from a finer, then lighter, copy of him below his chin)
    hi = real_skin(man, [f for f in man.faces if max(man.Q[i][1] for i in f) < 5.95], 'hi')
    hi = apply_modifier(hi, 'SUBSURF', levels=2)
    for a in list(hi.data.attributes):
        if a.name in ('tag', 'mhv', 'ball') or a.name.startswith('d_'):
            hi.data.attributes.remove(a)
    fix_normals(hi)
    mid = thin(hi, 44000)

    body = real_skin(man, man.faces + man.eyes, 'body', mh=True)
    ear = set(np.where(man.ear)[0])
    ears_at = [i for i, f in enumerate(man.faces + man.eyes) if all(v in ear for v in f)]
    body.data.materials.append(material(SKIN))
    body.data.materials.append(material(EAR))
    for i in ears_at:
        body.data.polygons[i].material_index = 1
    pts, polys = [], []
    for p in body.data.polygons:
        if G(p.center)[1] > HEAD_C[1] - HEAD_H * 1.2:
            polys.append(list(range(len(pts), len(pts) + len(p.vertices))))
            pts += [G(body.data.vertices[i].co) for i in p.vertices]
    _scalp = BVHTree.FromPolygons(pts, polys)
    under = UNDER
    cut(
        body,
        [plane_pit(1, -under), plane_pit(-1, -under), plane_vee(1, -under), plane_vee(-1, -under), level(HEM + 0.12), level(SOCK_HI - 0.06)],
        lambda p: pit(p, 1) > -under or pit(p, -1) > -under or (vee(p) > -under and p[1] > 4.9) or (SOCK_HI - 0.06 < p[1] < HEM + 0.12 and abs(p[0]) < 1.2),
        under=5.7,
    )
    vest, shorts, socks = kit(mid)
    for o in (vest, socks):
        tag(o, BY_PLACE)
    built = [body, vest, shorts, socks, *mouth()]
    for s in (1, -1):
        built += shoe_fine(s)
    return built


# --- the same man, far off ---

# The far body (figureFar): what a lamp's shadow map, the floor's mirror and a device that can't keep up draw of him
# (figure.ts's Fig.low). A man in it is some 5,000 triangles to his 28,000: his skin this many (his head and his
# hands more than their share of them: see dress_far), his kit this share of its own, each shoe's part this share,
# and each piece of hair this many.
FAR_SKIN = 2400
FAR_KIT = 0.2
FAR_SHOE = 0.13
FAR_HAIR = {BUN: 72, TAIL: 60, TWISTS: 760, LOCS: 720, BRAIDS: 220, AFRO: 260, HIGHTOP: 180, CURLS: 230}


def thin_part(obj, tris):
    """A finished part, thinned: what it is (its points' one tag) is kept (thinning mixes a point's numbers with its neighbours')."""
    a = obj.data.attributes.get('tag')
    kind = a.data[0].value if a is not None and len(a.data) else None
    thin(obj, max(12, tris))
    return obj if kind is None else tag(obj, kind)


def dress_far(man):
    """
    The real man in his kit again, far off: the same parts by the same names on the same bones as dress_real's, so his
    sheet's pictures lie on this body as they do on that one (figure.ts's sheetUv reads either). His lips are shut and
    there is nothing inside his mouth; his skin has no map of its own (a uv would have thinning keep its seams).
    """
    from mathutils.kdtree import KDTree

    hi = real_skin(man, [f for f in man.faces if max(man.Q[i][1] for i in f) < 5.95], 'hiFar')
    hi = apply_modifier(hi, 'SUBSURF', levels=1)
    for a in list(hi.data.attributes):
        if a.name in ('tag', 'mhv', 'ball') or a.name.startswith('d_'):
            hi.data.attributes.remove(a)
    fix_normals(hi)
    mid = thin(hi, 16000)

    faces = man.faces + man.eyes + man.lips_shut
    body = real_skin(man, faces, 'bodyFar')
    for a in [a.name for a in body.data.attributes if a.name in ('mhv', 'ball') or a.name.startswith('d_')]:
        body.data.attributes.remove(body.data.attributes[a])
    ear = set(np.where(man.ear)[0])
    body.data.materials.append(material(SKIN))
    body.data.materials.append(material(EAR))
    for i, f in enumerate(faces):
        if all(v in ear for v in f):
            body.data.polygons[i].material_index = 1
    # (his skin goes less far in under his vest's edges than the near body's: a coarser skin would poke through it)
    under = 0.07
    cut(
        body,
        [plane_pit(1, -under), plane_pit(-1, -under), plane_vee(1, -under), plane_vee(-1, -under), level(HEM + 0.12), level(SOCK_HI - 0.06)],
        lambda p: pit(p, 1) > -under or pit(p, -1) > -under or (vee(p) > -under and p[1] > 4.9) or (SOCK_HI - 0.06 < p[1] < HEM + 0.12 and abs(p[0]) < 1.2),
        under=5.7,
    )
    # (thinned with his face and his hands swollen: thinning goes by size, and a head of a few hundred triangles is a
    # block on his shoulders, a hand of a few dozen a paddle)
    spots = [(Vector((0, HEAD_C[1] - 0.05, HEAD_C[2] + 0.12)), 0.42, 1.7)]
    for s in (1, -1):
        spots.append((arm_frame(s) @ Vector((0.0, -(ARM + 0.2), 0.01)), HAND_REACH, 1.5))
    at = []
    for c, reach, by in spots:
        for o, r0, b0 in at:
            d = c - o
            if d.length > r0:
                c = o + d * ((d.length + r0 * (b0 - 1)) / d.length)
        swell(body, c, reach, by)
        at.append((c, reach, by))
    thin(body, FAR_SKIN)
    for c, reach, by in reversed(at):
        swell(body, c, reach, by, back=True)
    # (what each point is, his head's or his body's, as the point of him nearest it was)
    tree = KDTree(len(man.Q))
    for i, q in enumerate(man.Q):
        tree.insert(B(*q), i)
    tree.balance()
    body.data.attributes.remove(body.data.attributes['tag'])
    kinds = [FACE if man.is_head[tree.find(v.co)[1]] else REAL for v in body.data.vertices]
    body.data.attributes.new('tag', 'INT', 'POINT').data.foreach_set('value', kinds)

    vest, shorts, socks = kit(mid, FAR_KIT)
    for o in (vest, socks):
        tag(o, BY_PLACE)
    built = [body, vest, shorts, socks]
    for s in (1, -1):
        built += [thin_part(o, tri_count(o) * FAR_SHOE) for o in shoe_fine(s)]
    for o in hair_pieces(light=True):
        built.append(thin_part(o, FAR_HAIR[o.data.materials[0].name]))
    return built


# a coach's suit: the jacket opens in a V down his chest (steep, so it only cuts the front)
SK, SM, SC = 2.3, 2.2, 5.26
SLEN = math.sqrt(1 + SK * SK + SM * SM)
CUFF = ARM - 0.06
SUIT, SHIRT, TIE = 'suit', 'shirt', 'tie'


def lapel(p):
    return (p[1] - SK * abs(p[0]) + SM * p[2] - SC) / SLEN


def down_arm(p):
    """How far down either arm a point is (0 when it's on neither)."""
    best = 0.0
    for s in (1, -1):
        loc = ARM_INV[s] @ Vector(p)
        if math.hypot(loc.x, loc.z) < 0.5:
            best = max(best, -loc.y)
    return best


def dress_coach(hi, q=1.0):
    """In a suit: a jacket over a shirt and tie, trousers, dark shoes. Only his head and hands show."""
    mid = thin(copy(hi, 'mid'), 44000)
    cuff = [((arm_frame(s) @ Vector((0, -CUFF, 0))).to_tuple(), (arm_frame(s).to_3x3() @ Vector((0, -1, 0))).to_tuple()) for s in (1, -1)]

    body = thin_body(hi, (5200 if q >= 1 else 1500) * q)
    cut(body, [level(5.3), *[(c, n) for c, n in cuff]], lambda p: p[1] > 5.3 and abs(p[0]) < 0.6 or down_arm(p) > CUFF - 0.08)
    set_material(body, material(SKIN))
    top = crop(head(q))

    shirt = copy(mid, 'shirt')
    # (its collar stands up round his neck; out toward the shoulders it lies flat, well under the jacket)
    push(shirt, lambda p: 0.014 + 0.034 * sstep(5.4, 5.5, p[1]) * (1 - sstep(0.2, 0.32, abs(p[0]))))
    thin(shirt, 3600 * q)
    cut(shirt, [level(5.58), ((0.075, 0, 0), (1, 0, 0)), ((-0.075, 0, 0), (1, 0, 0)), level(5.4)], lambda p: lapel(p) > -0.1 and 4.1 < p[1] < 5.58 and abs(p[0]) < 0.46 and p[2] > -0.5)
    for v in shirt.data.vertices:
        # (the tie sits on the shirt)
        p = G(v.co)
        if abs(p[0]) < 0.08 and p[1] < 5.41 and p[2] > 0:
            v.co = v.co + Vector((0, -0.022, 0))
    slots(shirt, [SHIRT, TIE], lambda p: TIE if abs(p[0]) < 0.075 and p[1] < 5.4 and p[2] > 0 else SHIRT)

    jacket = copy(mid, 'jacket')
    push(jacket, lambda p: 0.088 + 0.04 * sstep(3.6, 3.0, p[1]) * (1 if down_arm(p) < 0.5 else 0))
    relax(jacket, 14)
    thin(jacket, 5200 * q)
    relax(jacket, 1)
    hem = HIP - 0.42
    cut(jacket, [level(hem), *cuff, ((0, SC, 0), (SK, 1, SM)), ((0, SC, 0), (-SK, 1, SM)), level(5.62)], lambda p: lapel(p) <= 0 and hem < p[1] < 5.62 and (down_arm(p) < CUFF or abs(p[0]) < 0.9))
    set_material(jacket, material(SUIT))

    # (a suit's trousers: the shorts' seat, a straight leg each down to the shoe)
    trousers = shorts_form(
        [(AN_Y - 0.1, 0.4, 0.2, 0.235, 0.24), (AN_Y + 0.12, 0.4, 0.205, 0.24, 0.245), (KN_Y - 0.5, 0.4, 0.235, 0.265, 0.3), (KN_Y, 0.405, 0.265, 0.31, 0.31), (FORK - 0.12, 0.415, 0.34, 0.395, 0.415)],
        folds=0.007,
    )
    thin(trousers, 4200 * q)
    cut(trousers, [level(AN_Y + 0.1), level(WAIST)], lambda p: AN_Y + 0.1 < p[1] < WAIST and abs(p[0]) < 1.2)
    set_material(trousers, material(SUIT))

    bpy.data.objects.remove(mid)
    for o in (body, shirt, jacket, trousers):
        tag(o, BY_PLACE)
    built = [body, top, shirt, jacket, trousers, *ears()]
    for s in (1, -1):
        built += fingers(s)
        for part in shoe(s):
            set_material(part, material(SHOE))
            built.append(part)
    return built


def finish(built, name='figure'):
    """The parts as one mesh: the vest's picture, every hollow's shade, bones and weights."""
    for o in built:
        if o.name.startswith(('shoe', 'sole')):  # (theirs is set where they're built)
            continue
        smooth(o)
    fig = join(built, name)
    # (join orders the slots as it meets them: the app wants them by name, so the order is free)
    me = fig.data
    # (his skin's own uv, if real_skin gave it one, is taken off and put back after the vest's: the file numbers its
    # uvs in the order they were made, and the app reads the vest's picture from the first)
    mhuv = None
    if 'mhuv' in me.attributes:
        mhuv = np.zeros(len(me.loops) * 2, dtype=np.float32)
        me.attributes['mhuv'].data.foreach_get('vector', mhuv)
        me.attributes.remove(me.attributes['mhuv'])

    # the vest's picture: round him from his left side (the back a quarter of the way, the front three), bottom to top
    uv = me.uv_layers.new(name='UVMap')
    names = [m.name for m in me.materials]
    jersey_slot = names.index(JERSEY) if JERSEY in names else -1
    for poly in me.polygons:
        us = []
        for li in poly.loop_indices:
            p = G(me.vertices[me.loops[li].vertex_index].co)
            us.append(((math.atan2(p[0], p[2]) - math.pi / 2) / (2 * math.pi)) % 1.0)
        if poly.material_index == jersey_slot and max(us) - min(us) > 0.5:
            us = [u + 1 if u < 0.5 else u for u in us]
        for li, u in zip(poly.loop_indices, us):
            p = G(me.vertices[me.loops[li].vertex_index].co)
            uv.data[li].uv = (u, (p[1] - 3.6) / 2.0) if poly.material_index == jersey_slot else (0.5, 0.5)
    if mhuv is not None:
        # his skin's map's uv (the file's TEXCOORD_1): his skin and ears their modellers', everything else nothing
        mat, start, tot = (np.zeros(len(me.polygons), dtype=np.int32) for _ in range(3))
        me.polygons.foreach_get('material_index', mat)
        me.polygons.foreach_get('loop_start', start)
        me.polygons.foreach_get('loop_total', tot)
        corner = np.repeat(start, tot) + np.arange(tot.sum()) - np.repeat(np.cumsum(tot) - tot, tot)
        mhuv = mhuv.reshape(-1, 2)
        mhuv[corner[~np.repeat(np.isin(mat, [names.index(m) for m in (SKIN, EAR) if m in names]), tot)]] = 0.0
        me.uv_layers.new(name='BodyUV').data.foreach_set('uv', mhuv.ravel())
        me.uv_layers.active = uv
        uv.active_render = True

    # shade: every hollow, and the face's. (The pieces of hair only some men wear shade no one's head but their own:
    # the rest of him is shaded as if none were there, and each piece by itself and him)
    worn = [i for i, m in enumerate(names) if m in (BUN, TAIL, TWISTS, LOCS, BRAIDS, AFRO, HIGHTOP, CURLS)]
    piece = np.zeros(len(me.vertices), dtype=bool)
    for poly in me.polygons:
        if poly.material_index in worn:
            piece[list(poly.vertices)] = True
    bake_occlusion(fig, floor=FLOOR, rays=64, reach=1.1, low=0.58, only=~piece, skip=worn)
    if piece.any():
        bake_occlusion(fig, floor=FLOOR, rays=64, reach=1.1, low=0.58, only=piece)
    # (a face is small: the shade of all of him on it is a hint, or its few points read as bruises)
    soften(fig, lambda x, y, z: y > HEAD_C[1] - HEAD_H * 1.05, 0.55)
    # (an ear's back is hard against his head: left as dark as that makes it, it is a hole beside his face)
    soften(fig, lambda x, y, z: abs(x) > HEAD_W * 0.86 and abs(y - HEAD_C[1]) < 0.16 and z < HEAD_C[2] + 0.06, 0.15)
    paint(fig, face_shade)
    if mhuv is not None:
        # (and a real face's own hollows, close: his eyes' sockets, his nostrils and under his nose, his mouth's corners
        # and the line of his lips, the folds beside his nose, round and in his ears, under his jaw. Rays from just off
        # him and only a little way: the shade of all of him above starts too far off his skin to find them)
        head = np.array([G(v.co)[1] > HEAD_C[1] - HEAD_H * 1.3 for v in me.vertices]) & ~piece
        bake_occlusion(fig, rays=128, reach=FACE_REACH, low=FACE_LOW, lift=0.004, blur=1, only=head, skip=worn)
    # (and a shoulder moves: the shade of the grooves round it as he's built would stay behind as a painted crease)
    soften(fig, lambda x, y, z: (abs(x) - SHOULDER) ** 2 + (y - SH_Y) ** 2 + z * z < 0.62 ** 2 and y < CHEST_Y + 0.2, 0.25)

    # bones and weights
    tags = [0] * len(me.vertices)
    me.attributes['tag'].data.foreach_get('value', tags)
    groups = {b: fig.vertex_groups.new(name=b) for b in [*BONES, *leaves()]}
    digit = {}
    for a in me.attributes:
        if a.name.startswith('d_'):
            digit[a.name[2:]] = np.zeros(len(me.vertices), dtype=np.float32)
            a.data.foreach_get('value', digit[a.name[2:]])
    if 'ball' in me.attributes:
        # (an eye's ball is behind its lids, and the edge of a lip behind the lip: the shade of that is not theirs)
        ball = np.zeros(len(me.vertices), dtype=np.float32)
        me.attributes['ball'].data.foreach_get('value', ball)
        col = me.color_attributes['Col']
        data = np.zeros(len(col.data) * 4, dtype=np.float32)
        col.data.foreach_get('color', data)
        data = data.reshape(-1, 4)
        if len(data) == len(me.vertices):
            data[ball > 0.5, :3] = 1.0
        else:
            for lp in me.loops:
                if ball[lp.vertex_index] > 0.5:
                    data[lp.index, :3] = 1.0
        col.data.foreach_set('color', data.ravel())
    for v in me.vertices:
        kind = tags[v.index]
        at = tuple(G(v.co))
        ws = {RIGID[kind]: 1.0} if kind in RIGID else swing_weights(at) if kind == SWINGS else face_weights(at) if kind == FACE else hand_weights(at, kind) if kind in (HAND_L, HAND_R) else weights(at, kind)
        if kind == REAL:
            # (his fingers' and thumb's shares are his own modellers')
            sfx = 'l' if at[0] > 0 else 'r'
            mine = {f'{d}{sfx}': float(a[v.index]) for d, a in digit.items() if a[v.index] > 0.004}
            if not digit:
                # (a skin that was thinned has lost them: each finger's points are those nearest its line, as a built hand's)
                hand = ws.get('ha' + sfx, 0.0)
                if hand > 0.004:
                    hw = hand_weights(at, HAND_L if sfx == 'l' else HAND_R)
                    del ws['ha' + sfx]
                    for k, w in hw.items():
                        ws[k] = ws.get(k, 0.0) + hand * w
                    top = sorted(((w, k) for k, w in ws.items() if w > 0.004), reverse=True)[:4]
                    tot = sum(w for w, _ in top)
                    ws = {k: w / tot for w, k in top}
            f = min(1.0, sum(mine.values()))
            if f > 0:
                ws = {k: w * (1 - f) for k, w in ws.items()}
                for k, w in mine.items():
                    ws[k] = ws.get(k, 0.0) + w
                top = sorted(((w, k) for k, w in ws.items() if w > 0.004), reverse=True)[:4]
                tot = sum(w for w, _ in top)
                ws = {k: w / tot for w, k in top}
        for b, wt in ws.items():
            groups[b].add([v.index], wt, 'REPLACE')
    me.attributes.remove(me.attributes['tag'])
    for a in [a.name for a in me.attributes if a.name == 'ball' or a.name.startswith('d_')]:
        me.attributes.remove(me.attributes[a])
    arm_ob = rig(fig)
    return fig, arm_ob


def materials():
    material(SKIN, (0.3, 0.31, 0.35), 0.52)
    material(HAIR, (0.08, 0.082, 0.095), 0.7)
    material(JERSEY, (0.1, 0.2, 0.5), 0.8)
    material(TRIM_M, (1.0, 0.72, 0.1), 0.8)
    material(CLOTH, (0.1, 0.2, 0.5), 0.8)
    material(SHOE, (0.05, 0.05, 0.055), 0.45)
    material(WHITE, (0.86, 0.85, 0.82), 0.7)
    material(COLLAR, (0.07, 0.07, 0.08), 0.5)
    material(HIGH, (0.07, 0.07, 0.08), 0.5)
    material(SUIT, (0.03, 0.032, 0.04), 0.7)
    material(SHIRT, (0.85, 0.85, 0.85), 0.7)
    material(TIE, (1.0, 0.72, 0.1), 0.6)
    material(EAR, (0.3, 0.31, 0.35), 0.52)
    material(MOUTH, (0.05, 0.015, 0.015), 0.8, shade=False)
    material(TEETH, (0.8, 0.78, 0.72), 0.4, shade=False)
    material(GUM, (0.62, 0.27, 0.27), 0.35, shade=False)
    material(TONGUE, (0.58, 0.26, 0.26), 0.45, shade=False)


def on_head(n, out=0.0):
    """The point of his scalp along n (in the head's half sizes), `out` feet off it."""
    ln = math.sqrt(sum(v * v for v in n))
    n = tuple(v / ln for v in n)
    size = (HEAD_W, HEAD_H, HEAD_D)
    if _scalp is not None:
        # (the real man's: where a ray in from outside, along n, meets his skin)
        d = Vector([n[i] * size[i] for i in range(3)]).normalized()
        for lift in (0.0, 0.006, -0.006, 0.014):
            # (a ray down the line between his lips finds no skin there, but the inside of the back of his head: one a
            # hair over the line does)
            dd = (d + Vector((0, lift, 0))).normalized()
            hit = _scalp.ray_cast(Vector(HEAD_C) + dd * 3.0, -dd)
            if hit[0] is not None and (hit[0] - Vector(HEAD_C)).dot(dd) > 0:
                return hit[0] + Vector(n) * out
    r = head_r(n)
    p = Vector([HEAD_C[i] + n[i] * r * size[i] for i in range(3)])
    return p + Vector(n) * out


def strand(pts, r, sides, name):
    """A lock of hair through these points, thinner toward its end."""
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        e1 = d.cross(Vector((0.3, 0.2, 1))).normalized()
        e2 = d.cross(e1)
        rad = r * (1 - 0.45 * i / (len(pts) - 1))
        rings.append([tuple(p + (e1 * math.cos(a) + e2 * math.sin(a)) * rad) for a in (2 * math.pi * k / sides for k in range(sides))])
    return solid(rings, name)


def hair_line(round_):
    """How high his hairline is, that far round from the front (figure.ts's hairlineAt)."""
    for k in range(1, len(HAIRLINE)):
        if round_ <= HAIRLINE[k][0]:
            (a0, y0), (a1, y1) = HAIRLINE[k - 1], HAIRLINE[k]
            return y0 + (y1 - y0) * sstep(a0, a1, round_)
    return HAIRLINE[-1][1]


def volume(name, lift, low=None, top=None, cols=44, rows=12, lumps=0.0):
    """
    A head of hair as a shape of its own: a skin `lift(n)` feet off his scalp, from his hairline (or
    from `low`, a height, where that is higher) up over his crown, rolled in to the scalp at its edge;
    nothing of it higher than `top`. `lumps` (ft) makes it uneven, as a head of curls is: no smooth helmet.
    """
    verts, faces = [], []

    def at(n, edge):
        bump = lumps * (math.sin(n[0] * 17 + n[1] * 9 + 1.0) * math.sin(n[2] * 16 - n[1] * 11) + 0.6 * math.sin(n[0] * 31 - n[2] * 27 + n[1] * 23)) if lumps else 0.0
        p = on_head(n, -0.012 + (lift(n) + bump + 0.012) * edge)
        if top is not None:
            p.y = min(p.y, top)
        return tuple(p)

    for i in range(rows + 1):
        u = i / rows
        for j in range(cols):
            phi = -math.pi + 2 * math.pi * j / cols
            yh = hair_line(abs(phi)) - 0.02
            if low is not None:
                yh = max(yh, low)
            y = yh + (0.99 - yh) * u
            r = math.sqrt(max(0.0, 1 - y * y))
            verts.append(at((r * math.sin(phi), y, r * math.cos(phi)), math.sqrt(1 - (1 - min(1.0, u / 0.25)) ** 2)))
    apex = len(verts)
    verts.append(at((0, 1, 0), 1.0))
    for i in range(rows):
        for j in range(cols):
            k = (j + 1) % cols
            faces.append((i * cols + j, i * cols + k, (i + 1) * cols + k, (i + 1) * cols + j))
    for j in range(cols):
        faces.append((rows * cols + j, rows * cols + (j + 1) % cols, apex))
    o = mesh_obj(name, verts, faces)
    fix_normals(o)
    return o


def hightop(cols=40):
    """
    A high top: hair stood up off his crown in a block, its sides upright from his hairline in front and the line
    his barber faded the sides up to, a little wider at the top than at the foot, the top flat, its edge rounded;
    uneven all over, as a head of tight curls is.
    """
    top = HEAD_C[1] + HEAD_H * 0.92 + 0.16
    axis = HEAD_C[2] - 0.03
    rnd = 0.085
    # (its foot: the hairline in front, the fade's line round the sides and back, eased: no step at the temple)
    heights = [max(hair_line(abs(-math.pi + 2 * math.pi * j / cols)) - 0.02, 0.45) for j in range(cols)]
    for _ in range(3):
        heights = [(heights[j - 1] + 2 * heights[j] + heights[(j + 1) % cols]) / 4 for j in range(cols)]
    base = []
    for j, yh in enumerate(heights):
        phi = -math.pi + 2 * math.pi * j / cols
        r = math.sqrt(max(0.0, 1 - yh * yh))
        base.append(on_head((r * math.sin(phi), yh, r * math.cos(phi)), -0.004))
    span = max(math.hypot(p.x, p.z - axis) for p in base)

    def lump(p):
        return 0.003 * (math.sin(p.x * 61 + p.y * 37) * math.sin(p.z * 57 - p.y * 41) + 0.6 * math.sin(p.x * 113 - p.z * 97 + p.y * 71))

    # (each ring: how far out from the axis, as a share of where the foot of the hair is; how high, from its foot to the top)
    prof = [(0.96, -0.012, 0.0), (1.0, 0.0, 0.0), (1.035, 0.0, 0.25), (1.065, 0.0, 0.55), (1.08, 0.0, 0.8), (1.075, 0.0, 1.0)]
    for a in (0.3, 0.6, 0.85, 1.0):
        prof.append((None, a, None))
    prof += [(0.55, None, None), (0.18, None, None)]
    verts, faces = [], []
    for i, (k, dy, up) in enumerate(prof):
        for p in base:
            dx, dz = p.x, p.z - axis
            if up is not None:
                # (the foot, then up the side to where its edge begins to round)
                y = p.y + dy + (top - rnd - p.y) * up
                f = k
            elif k is None:
                # (the rounded edge: a quarter turn from the side to the top)
                ang = dy * math.pi / 2
                f = 1.075 - (rnd * (1 - math.cos(ang))) / max(0.05, math.hypot(dx, dz) * span / span)
                y = top - rnd + rnd * math.sin(ang)
            else:
                f = k * 1.075 - rnd / max(0.05, math.hypot(dx, dz))
                y = top
            q = Vector((dx * f, y, axis + dz * f))
            if i > 1:
                q += Vector((dx, 0, dz)).normalized() * lump(q) + Vector((0, 1, 0)) * (lump(q * 1.3) if up is None else 0)
            verts.append(tuple(q))
    rows = len(prof)
    for i in range(rows - 1):
        for j in range(cols):
            k = (j + 1) % cols
            faces.append((i * cols + j, i * cols + k, (i + 1) * cols + k, (i + 1) * cols + j))
    apex = len(verts)
    verts.append((0, top + 0.004, axis))
    for j in range(cols):
        faces.append(((rows - 1) * cols + j, (rows - 1) * cols + (j + 1) % cols, apex))
    o = mesh_obj('hightop', verts, faces)
    fix_normals(o)
    return o


def lock(pts, r, sides, name, wind=0.0, swell=0.0, tip=0.6):
    """
    A lock of hair through these points: round, its end rounded off (never a cut stub), a little thinner toward it
    (`tip`: its share of the root's thickness there). `wind` turns each ring on from the last (a twist is wound);
    `swell` makes it thicker and thinner along itself, as a lock that was palm-rolled is.
    """
    n = len(pts)
    verts, faces = [], []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        e1 = d.cross(Vector((0.3, 0.2, 1))).normalized()
        e2 = d.cross(e1)
        t = i / (n - 1)
        rad = r * (1 - (1 - tip) * t ** 1.5) * (1 + swell * math.sin(i * 2.4 + pts[0].x * 40))
        for k in range(sides):
            a = 2 * math.pi * k / sides + wind * i
            verts.append(tuple(p + (e1 * math.cos(a) + e2 * math.sin(a)) * rad))
    # (its end: a smaller ring a little past the last, and a point)
    d = (pts[-1] - pts[-2]).normalized()
    e1 = d.cross(Vector((0.3, 0.2, 1))).normalized()
    e2 = d.cross(e1)
    for k in range(sides):
        a = 2 * math.pi * k / sides + wind * n
        verts.append(tuple(pts[-1] + d * r * tip * 0.7 + (e1 * math.cos(a) + e2 * math.sin(a)) * r * tip * 0.6))
    end = len(verts)
    verts.append(tuple(pts[-1] + d * r * tip))
    for i in range(n):
        for k in range(sides):
            a, b_ = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b_, b_ + sides, a + sides))
    for k in range(sides):
        faces.append((n * sides + k, n * sides + (k + 1) % sides, end))
    o = mesh_obj(name, verts, faces)
    fix_normals(o)
    return o


def scalp_spots(count, rnd, low=0.06, crown=1.75, power=0.62):
    """Places spread evenly over his scalp (a spiral from his crown down), a little off it each its own way: directions from his head's middle, over his hairline."""
    out = []
    for i in range(count):
        t = (i + 0.5) / count
        e = math.pi / 2 - t ** power * crown
        a = i * 2.39996 + rnd.uniform(-0.12, 0.12)
        n = (math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a))
        if hairline(tuple(on_head(n))) >= low:
            out.append(n)
    return out


def hair_pieces(light=False):
    """
    Hair that stands off his head as shapes of their own: a bun, hair tied back, short twists, locks to his shoulders,
    the ends of his braids, an afro, a high top, a head of curls. `light`: the benches', seen from further off (fewer
    twists and locks, each of fewer sides).
    """
    rnd = random.Random(7)
    out = []
    down = Vector((0, -1, 0))
    # a bun, high on the back of his crown: a knot of hair wound round, flatter than a ball, a dimple in its middle,
    # over the band it's tied with
    at, way = on_head((0, 0.62, -0.72), 0.0), Vector((0, 0.62, -0.72)).normalized()
    side = way.cross(Vector((1, 0, 0))).normalized()
    rings = []
    for u, rad, off in ((0.0, 0.07, -0.01), (0.25, 0.105, 0.02), (0.5, 0.122, 0.055), (0.75, 0.112, 0.092), (0.9, 0.08, 0.112), (1.0, 0.03, 0.108)):
        rings.append([tuple(at + way * off + (Vector((1, 0, 0)) * math.cos(a) + side * math.sin(a)) * rad * (1 + 0.07 * math.sin(a * 3 + u * 5))) for a in (2 * math.pi * k / 16 for k in range(16))])
    out.append((solid(rings, 'bun'), BUN))
    # hair tied at the back of his head: gathered at the band, a tail that swells out from it and hangs to his nape,
    # round, coming to a soft end, a little wave in it
    root = on_head((0, 0.28, -1), 0.012)
    line = [root + Vector((0, 0.02, 0.01)), root + Vector((0, 0.012, -0.035)), root + Vector((0, -0.04, -0.075)), root + Vector((0.008, -0.13, -0.085)), root + Vector((-0.006, -0.23, -0.075)), root + Vector((0.004, -0.32, -0.06)), root + Vector((0, -0.39, -0.05))]
    rings = []
    for i, p in enumerate(line):
        w = (0.024, 0.04, 0.052, 0.05, 0.043, 0.031, 0.013)[i]
        d = (line[min(i + 1, len(line) - 1)] - line[max(i - 1, 0)]).normalized()
        e1 = Vector((1, 0, 0))
        e2 = d.cross(e1).normalized()
        rings.append([tuple(p + (e1 * math.cos(a) * 1.05 + e2 * math.sin(a) * 0.9) * w * (1 + 0.07 * math.sin(a * 5 + i))) for a in (2 * math.pi * k / 10 for k in range(10))])
    out.append((solid(rings, 'tail'), TAIL))
    # short twists all over his scalp: each a wound lock a finger long, standing off his head where it grows and
    # falling over with its own weight, its end round; thick enough that they crowd one another and little scalp shows
    parts = []
    for n in scalp_spots(74 if light else 160, rnd, power=0.68):
        nv = Vector(n)
        lean = Vector((rnd.uniform(-0.5, 0.5), 0, rnd.uniform(-0.5, 0.5)))
        tall = rnd.uniform(0.11, 0.165)
        # (those round his hairline hang; those on his crown stand a little and fall outward)
        out_ = Vector((n[0], 0, n[2]))
        out_ = out_.normalized() if out_.length > 0.1 else lean.normalized()
        fall = (out_ * 0.55 + down * (0.5 + 0.5 * (1 - n[1])) + lean * 0.3).normalized()
        p0 = on_head(n, -0.012)
        p1 = p0 + nv * tall * 0.36
        p2 = p1 + (nv * 0.55 + fall * 0.6).normalized() * tall * 0.34
        p3 = p2 + (nv * 0.1 + fall).normalized() * tall * 0.3
        # (round, not wound: the app draws its two strands winding down it, see figure.ts's TWIST)
        parts.append(lock([p0, p1, p2, p3], rnd.uniform(0.036, 0.042) if light else rnd.uniform(0.03, 0.037), 4 if light else 6, 'twist', tip=0.7))
    out.append((join(parts, 'twists'), TWISTS))
    # locks from his crown down past his jaw, over his ears and down the back of his neck: each lies over his head from
    # where it grows, comes off it and hangs straight, thick as a finger, uneven along itself
    parts = []
    for n in scalp_spots(42 if light else 86, rnd, low=0.05, crown=1.5, power=0.78):
        nv = Vector(n)
        side = Vector((n[0], 0, min(n[2], 0.15)))
        side = side.normalized() if side.length > 0.08 else Vector((rnd.uniform(-0.4, 0.4), 0, -1)).normalized()
        base = on_head(n, -0.008)
        # (out over his scalp toward his side or the back, never down over his face: those in front are swept back)
        m1 = on_head((n[0] + side.x * 0.35, n[1] - 0.12, min(n[2], 0.55) + side.z * 0.35), 0.03)
        m2 = on_head((n[0] + side.x * 0.75, n[1] - 0.42, min(n[2], 0.3) + side.z * 0.75 - 0.1), 0.045)
        m2.z = min(m2.z, 0.1)
        end_y = HEAD_C[1] - HEAD_H * rnd.uniform(1.0, 1.45)
        end_y = min(end_y, m2.y - 0.08)
        sway = Vector((rnd.uniform(-0.02, 0.02), 0, rnd.uniform(-0.02, 0.02)))
        pts = [base, m1, m2]
        for f in (0.3, 0.62, 1.0):
            pts.append(Vector((m2.x + side.x * 0.03 * f, m2.y + (end_y - m2.y) * f, m2.z + side.z * 0.03 * f - 0.015 * f)) + sway * f)
        parts.append(lock(pts, rnd.uniform(0.033, 0.039) if light else rnd.uniform(0.027, 0.033), 4 if light else 6, 'lock', swell=0.1, tip=0.72))
    out.append((join(parts, 'locs'), LOCS))
    # the ends of his braids, each row's own, down the back of his neck: plaited (thicker and thinner along it), a
    # bead's width, hanging a hand's breadth
    parts = []
    for i in range(11):
        a = math.pi + (i - 5) * 0.2
        n = (math.sin(a) * 0.9, -0.4 + 0.03 * abs(i - 5), math.cos(a) * 0.9)
        base = on_head(n, -0.004)
        drop = rnd.uniform(0.26, 0.4)
        back = Vector((n[0], 0, n[2])).normalized()
        pts = [base + Vector((0, 0.03, 0)), base + back * 0.012 + Vector((0, -0.03, 0))]
        for f in (0.3, 0.55, 0.8, 1.0):
            pts.append(base + back * (0.02 - 0.012 * f) + Vector((rnd.uniform(-0.006, 0.006), -drop * f, 0)))
        parts.append(lock(pts, 0.021, 4 if light else 5, 'braid', swell=0.22, tip=0.75))
    out.append((join(parts, 'braids'), BRAIDS))
    # heads of hair that stand off the scalp (his hair's fuzz is laid over them as coils: figure.ts's COILED, so their
    # own shape is the mass under the curls, even, with no lumps of its own): an afro, round, fullest over his temples and
    # crown, drawn in a little at his nape; a high top; short curls
    def afro(n):
        return 0.11 + 0.11 * sstep(-0.1, 0.75, n[1]) - 0.035 * sstep(0.35, 0.95, n[2]) * sstep(0.7, 0.2, n[1]) + 0.025 * sstep(0.5, 0.95, abs(n[0])) * sstep(-0.2, 0.3, n[1])

    out.append((volume('afro', afro, cols=46 if light else 56, rows=13 if light else 16, lumps=0.006), AFRO))
    out.append((hightop(), HIGHTOP))
    out.append((volume('curls', lambda n: 0.04 + 0.022 * sstep(0.2, 0.8, n[1]), cols=52, rows=14, lumps=0.004), CURLS))
    for o, name in out:
        set_material(o, material(name, (0.05, 0.04, 0.035), 0.8))
        tag(o, SWINGS if name in (TAIL, LOCS, BRAIDS) else ON_HEAD)
    return [o for o, _ in out]


def build(who='player'):
    global girdled
    reset()
    materials()
    girdled = who == 'player'
    if who == 'player':
        return finish(dress_real(real_player()) + hair_pieces(), 'figure')
    hi = fused()
    # (only the men on the floor have hair that is a shape of its own: the benches are seen from far off)
    return finish(dress_player(hi) + hair_pieces() if who == 'player' else dress_coach(hi), 'figure' if who == 'player' else who)


def report(fig):
    count = {}
    for f in fig.data.polygons:
        n = fig.data.materials[f.material_index].name
        count[n] = count.get(n, 0) + len(f.vertices) - 2
    print(f'[models] {fig.name}: {tri_count(fig)} triangles {count}, {len(fig.data.vertices)} points')


# ---------------------------------------------------------------- faces of their own
#: How finely a point's place is told in faces.bin (ft; run.ts's GRID: the packed model's points are on it, so a
#: point of the model is found in the file by its place).
FACE_GRID = 1 / 4096
#: Which bones a point of his head hangs on (the hair's swing is not his face).
FACE_BONES = ('head', 'jaw', 'nose', 'brow', 'lip')
# (and half of what hangs on his neck's own bone, which is turned half way to his head: a point of the top of his neck
# is as much his head's as it was when his neck hung on his chest and his head alone: see TRUNK)
#: How many times each shape is smoothed over his head (a feature's own, a whole head's: see faces_bin).
FACE_SMOOTH = (8, 20, 30)


def face_point(px, py):
    """The point of his skin at that place on the plane of his face (face_at's), in the game's frame."""
    size = (HEAD_W, HEAD_H, HEAD_D)
    d = (px / 0.8, py / 0.8, 1.0)
    ln = math.sqrt(sum(v * v for v in d))
    n = tuple(v / ln for v in d)
    r = head_r(n)
    return tuple(HEAD_C[i] + n[i] * r * size[i] for i in range(3))


def face_reach(p):
    """How much of a face's shape a point of his head takes: all of his face and jaw, none of his crown, the back of his head or his neck (his hair stays where it is)."""
    size = (HEAD_W, HEAD_H, HEAD_D)
    d = [(p[i] - HEAD_C[i]) / size[i] for i in range(3)]
    ln = math.sqrt(sum(v * v for v in d))
    if ln < 1e-6 or ln > 1.3:
        return 0.0
    n = [v / ln for v in d]
    return sstep(-0.55, -0.1, n[2]) * sstep(0.78, 0.45, n[1]) * sstep(-0.98, -0.86, n[1])


def faces_bin(fig, path):
    """
    faces.bin: how far each point of his head moves for each of mh.py's shapes. 'FACE', a version, the length of a
    JSON head ({names, scales, points}), the JSON (padded to a fourth byte); each point's place (int16 x3, in
    FACE_GRID); then a shape at a time: how many points it moves (uint32), which (uint16 each, padded to a fourth
    byte), and by how much (int8 x3 each, times the shape's scale, padded).
    """
    import struct

    import mh

    theirs = mh.Theirs()
    ours = {
        'eye': face_point(EYE_X, EYE_Y),
        'eye_x': face_point(EYE_X, EYE_Y)[0],
        'nose': face_point(0, NOSE_TIP),
        'mouth': face_point(MOUTH_W, MOUTH_Y),
        'chin': face_point(0, -0.84),
        'crown': (0, HEAD_C[1] + head_r((0, 1, 0)) * HEAD_H, HEAD_C[2]),
        'back': (0, HEAD_C[1], HEAD_C[2] - head_r((0, 0, -1)) * HEAD_D),
    }
    s, o = mh.fit(ours, theirs)
    for k in ('eye', 'nose', 'mouth', 'chin', 'crown', 'back'):
        t = getattr(theirs, k) * s + o
        t[0] = abs(t[0]) if k != 'eye' else theirs.eye_x * s[0]
        print(f'[models] faces: {k} theirs on ours {tuple(round(float(v), 3) for v in t)} ours {tuple(round(float(v), 3) for v in ours[k])}')
    me = fig.data
    names = {g.index: g.name for g in fig.vertex_groups}
    keys, points = {}, []
    for v in me.vertices:
        on = sum(g.weight * (0.5 if names[g.group] == 'neck' else 1.0) for g in v.groups if names[g.group] in FACE_BONES or names[g.group] == 'neck')
        if on < 0.5:
            continue
        p = G(v.co)
        q = tuple(int(round(c / FACE_GRID)) for c in p)
        if q in keys:
            continue
        keys[q] = len(points)
        points.append(tuple(c * FACE_GRID for c in q))
    def skin(p):
        size = (HEAD_W, HEAD_H, HEAD_D)
        d = [(p[i] - HEAD_C[i]) / size[i] for i in range(3)]
        ln = math.sqrt(sum(v * v for v in d)) or 1.0
        n = tuple(v / ln for v in d)
        r = head_r(n)
        return tuple(HEAD_C[i] + n[i] * r * size[i] for i in range(3))

    moves, found = mh.shapes(theirs, points, HEAD_C, s, o, face_reach, ours, skin)
    # (smoothed over our head's own surface: what is theirs alone, a fold of their lip a little off ours, would be a
    # lump on ours; what is left is the shape. The whole head's shapes most, a nose's or a lip's least)
    vkey = {}
    for v in me.vertices:
        q = tuple(int(round(c / FACE_GRID)) for c in G(v.co))
        if q in keys:
            vkey[v.index] = keys[q]
    near = [set() for _ in points]
    for e in me.edges:
        a, b = (vkey.get(i) for i in e.vertices)
        if a is not None and b is not None and a != b:
            near[a].add(b)
            near[b].add(a)
    rows = np.array([i for i, nb in enumerate(near) for _ in nb])
    cols = np.array([j for nb in near for j in nb])
    count = np.maximum(1, np.bincount(rows, minlength=len(points)))[:, None]
    wide = set(mh.KINDS) | {'real', 'age', 'oval', 'round', 'square', 'triangle', 'heart', 'diamond', 'oblong', 'fat', 'nubian', 'slope', 'temples'}
    # (a cheek, a jaw, a chin are broad: what is theirs of them is a bulge, and only its broad shape is a face's)
    broad = {'cheekBone', 'cheekFull', 'cheekIn', 'chinOut', 'chinWide', 'chinLong', 'jawBone', 'underbite', 'laugh', 'browOut', 'browTilt', 'corners'}
    for k, m in moves.items():
        for _ in range(FACE_SMOOTH[2] if k in wide else FACE_SMOOTH[1] if k in broad else FACE_SMOOTH[0]):
            avg = np.zeros_like(m)
            np.add.at(avg, rows, m[cols])
            m[:] = 0.5 * m + 0.5 * avg / count
    # (their eyes are holes in their skin, ours are balls under lids: our eyes and their sockets keep our own shape)
    for i, p in enumerate(points):
        d = [(p[k] - HEAD_C[k]) / sz for k, sz in enumerate((HEAD_W, HEAD_H, HEAD_D))]
        ln = math.sqrt(sum(v * v for v in d)) or 1.0
        n = [v / ln for v in d]
        # (and only his face's front: round his sides, his ears and the corners of his jaw are his own)
        moves['real'][i] *= sstep(-0.05, 0.35, n[2])
        if n[2] <= 0.2:
            continue
        px, py = face_at(n)
        e = math.hypot((abs(px) - EYE_X) / (EYE_W * 1.9), (py - EYE_Y - 0.01) / 0.16)
        moves['real'][i] *= sstep(0.75, 1.35, e)
    write_faces(path, points, moves, found, rows, cols, count, near)


def faces_bin_real(fig, man, path):
    """
    faces.bin for the real man: his head's points are MakeHuman's own, so each of mh.py's shapes moves each of them
    as it moves theirs (in our head's scale), less toward his crown and the back of his head (face_reach: his hair
    stays where it is). The file is as faces_bin writes it.
    """
    import mh

    theirs = mh.Theirs()
    me = fig.data
    names = {g.index: g.name for g in fig.vertex_groups}
    mhv = np.zeros(len(me.vertices), dtype=np.float32)
    me.attributes['mhv'].data.foreach_get('value', mhv)
    keys, points, src = {}, [], []
    for v in me.vertices:
        on = sum(g.weight * (0.5 if names[g.group] == 'neck' else 1.0) for g in v.groups if names[g.group] in FACE_BONES or names[g.group] == 'neck')
        if on < 0.5 or mhv[v.index] < 0.5:
            continue
        q = tuple(int(round(c / FACE_GRID)) for c in G(v.co))
        if q in keys:
            continue
        keys[q] = len(points)
        points.append(tuple(c * FACE_GRID for c in q))
        src.append(int(round(mhv[v.index])) - 1)
    src = np.array(src)
    reach = np.array([face_reach(p) for p in points])
    moves = {k: m[src] * man.scale * reach[:, None] for k, m in theirs.moves.items()}
    write_faces(path, points, moves, len(points))


def write_faces(path, points, moves, found, rows=None, cols=None, count=None, near=None):
    import struct

    order = list(moves)
    if os.environ.get('FACE_DEBUG') and rows is not None:
        for k in order:
            m = moves[k]
            avg = np.zeros_like(m)
            np.add.at(avg, rows, m[cols])
            dev = np.linalg.norm(m - avg / count, axis=1)
            i = int(dev.argmax())
            print(f'[models] spike {k}: {dev[i]:.4f} at {tuple(round(c, 3) for c in points[i])} move {np.round(m[i], 4)} n {len(near[i])}')
    head, blobs, scales = [], [], []
    for k in order:
        m = moves[k]
        ln = np.linalg.norm(m, axis=1)
        idx = np.where(ln > 0.0003)[0]
        top = float(np.abs(m[idx]).max()) if len(idx) else 0.0
        scale = top / 127 if top else 1.0
        q = np.clip(np.round(m[idx] / scale), -127, 127).astype(np.int8)
        scales.append(scale)
        blob = struct.pack('<I', len(idx)) + idx.astype(np.uint16).tobytes()
        blob += b'\0' * (-len(blob) % 4)
        blob += q.tobytes()
        blob += b'\0' * (-len(blob) % 4)
        blobs.append(blob)
        head.append(f'{k} {len(idx)} {top:.4f}')
    meta = json.dumps({'names': order, 'scales': scales, 'points': len(points), 'grid': FACE_GRID}).encode()
    meta += b' ' * (-len(meta) % 4)
    out = b'FACE' + struct.pack('<II', 1, len(meta)) + meta
    pts = np.array([[int(round(c / FACE_GRID)) for c in p] for p in points], dtype=np.int16).tobytes()
    out += pts + b'\0' * (-len(pts) % 4)
    out += b''.join(blobs)
    with open(path, 'wb') as f:
        f.write(out)
    print(f'[models] faces: {len(points)} points, {found} found on theirs, {len(out) // 1024} kB; ' + ', '.join(head))


if __name__ == '__main__':
    a = args()
    fig, arm_ob = build()
    report(fig)
    faces_bin_real(fig, _real, os.path.join(a['out'], 'faces.bin'))
    # (and his skin's map, in its second uv: skin-anat.png and anat.json beside the model. Only here: the benches and
    # the building import this file, and never draw a man close enough for it)
    import anatomy

    anatomy.write(fig, _real, a['out'])
    fig.data.attributes.remove(fig.data.attributes['mhv'])
    # (and the same man far off: a second mesh on bones of the same names)
    low, low_rig = finish(dress_far(_real), 'figureFar')
    low_rig.name = 'figureFarRig'
    report(low)
    export_glb(os.path.join(a['out'], 'figure.glb'), [fig, arm_ob, low, low_rig])
    save_blend(os.path.join(a['blend'], 'figure.blend'))
    if 'preview' in a:
        hand = arm_frame(1) @ Vector((0, -(ARM + 0.35), 0))
        preview(
            os.path.join(a['preview'], 'figure-body.png'),
            [((0, 3.6, 30), (0, 3.25, 0), 6.2), ((20, 5, 22), (0, 3.25, 0), 6.2), ((30, 3.6, 0), (0, 3.25, 0), 6.2), ((-12, 6, -26), (0, 3.25, 0), 6.2)],
            size=(480, 560),
            ground=FLOOR,
        )
        preview(
            os.path.join(a['preview'], 'figure-detail.png'),
            [((0.6, 6.25, 10), (0, 6.1, 0), 1.25), ((9, 6.2, 5), (0, 6.05, 0), 1.25), ((10, 6.15, 0.3), (0, 6.05, 0), 1.25), ((-4, 6.6, -9), (0, 6.05, 0), 1.4), ((2, 6.3, 10), (0, 5.85, 0), 2.0), ((hand.x + 3, hand.y + 1, 9), tuple(hand), 1.5), ((5, 1.4, 9), (0.2, 0.25, 0.2), 2.4), ((2, 3.4, 12), (0, 3.2, 0), 3.0), ((-8, 3.2, -9), (0, 3.2, 0), 3.0)],
            size=(480, 480),
            ground=FLOOR,
            sheet_cols=5,
        )
