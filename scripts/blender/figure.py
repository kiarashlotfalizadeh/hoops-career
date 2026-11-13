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
# every hollow is baked in. Beyond the puppet's bones he has leaves the app turns itself: his
# fingers' two joints on each hand, his jaw and nose, whose sizes make one face unlike another (and
# his jaw comes open), and on the floor his brows and his lower lip.
#
# He stands with his arms out from his sides (they can't be fused hanging against the trunk); the
# rig's bones carry that pose, so the game needs to know nothing about it.
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: E402,F403

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
HEM = KN_Y + 0.3
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
TRIM = 0.055
# the head (a tenth bigger than a real one for his height, as a figurine's is: narrower than it is
# long, longer than it is deep), set forward on his neck as a head is
HEAD_W, HEAD_H, HEAD_D = 0.3, 0.42, 0.37
HEAD_C = (0, HEAD_Y + 0.045, 0.05)
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
# cap of the shoulder and the armpit go with it, so an arm raised overhead or hung at his side keeps its shoulder;
# and one down each forearm that takes part of the hand's turn about it, so a wrist turns over the length of the
# forearm, as the two bones in it do, and not in a twist of skin at the wrist.
# The people round the floor, people.py, are seen from far off and keep the bones above.)
GIRDLE = {'cll': 'chest', 'clr': 'chest', 'fwl': 'fal', 'fwr': 'far', 'brow': 'head', 'lip': 'head'}
girdled = False


def leaves():
    return {**LEAVES, **GIRDLE} if girdled else LEAVES
SKIN, HAIR, JERSEY, TRIM_M, CLOTH, SHOE, WHITE = 'skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white'
# hair that is a shape of its own (a man wears one of them or none: figure.ts leaves the others out)
BUN, TAIL, TWISTS, LOCS, BRAIDS, AFRO, HIGHTOP, CURLS = 'bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'
# what a hand-built part hangs on (anything else: by where each point is)
BY_PLACE, SHORTS, HAND_L, HAND_R, ON_HEAD, FOOT_L, FOOT_R, FACE, SWINGS, ON_JAW = range(10)
RIGID = {ON_HEAD: 'head', FOOT_L: 'ftl', FOOT_R: 'ftr', ON_JAW: 'lip'}
# what is behind his lips (see mouth)
MOUTH, TEETH, EAR = 'mouth', 'teeth', 'ear'
# the fingers' knuckles and middle joints, down the arm from the wrist
KNUCKLE, MIDDLE = 0.4, 0.545
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
            return d[2] > 0.3 and abs(d[1] / d[2] * 0.8 - MOUTH_Y) < 2e-4 and abs(d[0] / d[2] * 0.8) < MOUTH_W - 0.07

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


def mouth():
    """
    What is behind his lips when his jaw comes open: the dark of his mouth, his upper teeth (his
    head's) and his lower ones (his jaw's), each a short band round the front of it. Shut, his lips
    are in front of all of it.
    """

    def band(name, mat, kind, deep, ys, half, cols=8):
        verts, faces = [], []
        for py in ys:
            for j in range(cols + 1):
                px = half * (2 * j / cols - 1)
                # (set back from his lips, further toward the corners, as the arch of his teeth is)
                verts.append(tuple(on_head((px / 0.8, py / 0.8, 1.0), -deep - 0.05 * (px / half) ** 2 * (0.4 + half))))
        for i in range(len(ys) - 1):
            for j in range(cols):
                a = i * (cols + 1) + j
                faces.append((a, a + 1, a + cols + 2, a + cols + 1))
        o = mesh_obj(name, verts, faces)
        fix_normals(o)
        set_material(o, material(mat))
        return tag(o, kind)

    return [
        band('gullet', MOUTH, ON_HEAD, 0.05, (-0.4, -0.52, -0.64, -0.78), 0.3, 6),
        band('upper teeth', TEETH, ON_HEAD, 0.02, (-0.485, -0.565), 0.2),
        band('lower teeth', TEETH, ON_JAW, 0.03, (-0.545, -0.62), 0.18),
    ]


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
        (1.28, 0.176, 0.166, 0.008),
        (1.5, 0.166, 0.158, 0.006),
        (1.75, 0.138, 0.124, 0.004),
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
        ((0.01, 0.25, 0.0), (0.17, 0.4, 0.222)),
        ((0.075, 0.42, -0.01), (0.14, 0.26, 0.17)),
        ((-0.01, 0.63, 0.078), (0.148, 0.31, 0.142)),
        ((0.015, 0.55, -0.085), (0.158, 0.35, 0.142)),
        ((0.0, 1.12, -0.095), (0.07, 0.11, 0.07)),
        ((0.045, 1.36, 0.035), (0.142, 0.31, 0.132)),
        ((-0.045, 1.42, -0.01), (0.132, 0.33, 0.128)),
    ):
        parts.append(transform(ellipsoid((s * out, -u, z), r, 16, 12, 'muscle'), f))
    # the palm (its back to the outside, thumb edge forward), the heel of the thumb
    palm = ellipsoid((0.0, -(ARM + 0.215), 0.012), (0.066, 0.25, 0.17), 20, 14, 'palm')
    heel = ellipsoid((-s * 0.03, -(ARM + 0.14), 0.09), (0.06, 0.13, 0.085), 12, 8, 'heel')
    # (the shoulder runs into the chest and the back: no ball on a stick)
    # (over the top of the joint only: under it his armpit is a hollow, or an arm raised overhead would carry a lump up with it)
    bridge = ellipsoid((-s * 0.2, -0.04, 0.0), (0.26, 0.14, 0.25), 16, 10, 'bridge')
    for p in (bridge, palm, heel):
        transform(p, f)
        parts.append(p)
    return parts


def girdle(s):
    """What ties an arm to his trunk: the trapezius from his neck down to the point of the shoulder, the chest's muscle to the front of the armpit, the back's to the back of it, a collarbone."""
    out = [
        ellipsoid((s * 0.43, 5.47, -0.09), (0.44, 0.115, 0.24), 16, 10, 'trap', Matrix.Rotation(-s * 0.4, 3, 'Z')),
        ellipsoid((s * 0.35, 4.94, 0.285), (0.34, 0.25, 0.185), 16, 10, 'pec', Matrix.Rotation(s * 0.25, 3, 'Z')),
        ellipsoid((s * 0.42, 4.7, -0.2), (0.28, 0.42, 0.17), 16, 10, 'lat', Matrix.Rotation(-s * 0.2, 3, 'Z')),
        ellipsoid((s * 0.4, 5.415, 0.17), (0.36, 0.04, 0.045), 12, 8, 'collarbone', Matrix.Rotation(-s * 0.08, 3, 'Z') @ Matrix.Rotation(s * 0.3, 3, 'Y')),
    ]
    return out


def digit(f, base, way, lens, curl, r, s, name='finger'):
    """A finger from `base` (the arm's frame): three bones, each bent a little more toward the palm."""
    rings = []
    p = Vector(base)
    d = Vector(way).normalized()
    pts = [(p.copy(), d.copy(), r)]
    for n, (ln, c) in enumerate(zip(lens, curl)):
        d = (Matrix.Rotation(-s * c, 3, 'Z') @ d).normalized()
        p = p + d * ln
        pts.append((p.copy(), d.copy(), r * (1 - 0.1 * (n + 1))))
    last, dl, rl = pts[-1]
    pts.append((last + dl * rl * 0.75, dl, rl * 0.55))
    for at, dr, rad in pts:
        e1 = dr.cross(Vector((0, 0, 1))).normalized()
        e2 = dr.cross(e1).normalized()
        rings.append([tuple(f @ (at + (e1 * math.cos(a) * rad * 0.92 + e2 * math.sin(a) * rad))) for a in (2 * math.pi * k / 6 for k in range(6))])
    o = solid(rings, name)
    set_material(o, material(SKIN))
    return tag(o, HAND_L if s > 0 else HAND_R)


def fingers(s):
    f = arm_frame(s)
    out = []
    # (where along the knuckles, how long, how thick, how much it splays)
    for z, ln, r, splay in ((0.122, 0.3, 0.039, 0.1), (0.041, 0.335, 0.04, 0.025), (-0.04, 0.31, 0.038, -0.05), (-0.116, 0.25, 0.034, -0.13)):
        knuckle = -(ARM + KNUCKLE) + abs(z - 0.02) * 0.22
        # (built nearly straight: figure.ts curls them at the knuckles and the middle joints)
        out.append(digit(f, (-s * 0.008, knuckle + 0.03, z), (-s * 0.04, -1, splay), (0.03 + ln * 0.44, ln * 0.31, ln * 0.25), (0.05, 0.08, 0.2), r, s))
    out.append(digit(f, (-s * 0.03, -(ARM + 0.1), 0.125), (-s * 0.16, -0.88, 0.42), (0.13, 0.11, 0.08), (0.06, 0.14, 0.14), 0.046, s, 'thumb'))
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


def cut(obj, planes, keep):
    """Splits the mesh along each plane ((point, normal), game frame), then keeps the faces `keep` says yes to (by their middle)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=B(*co), plane_no=B(*no))
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
        if girdled:
            # (his chest gives way to the shoulder's own bone, and that to the arm: two gentle turns, not one sharp one)
            mine = sstep(0.45, 1.0, m)
            both = sstep(0.0, 0.55, m)
            w['cll' if s > 0 else 'clr'] = both - mine
            tw = sstep(UARM + 0.3, ARM - 0.08, u)
            w[ua], w[fa], w[ha] = mine * (1 - e), mine * e * (1 - h) * (1 - tw), mine * e * h
            w['fwl' if s > 0 else 'fwr'] = mine * e * (1 - h) * tw
            arms += both
        else:
            w[ua], w[fa], w[ha] = m * (1 - e), m * e * (1 - h), m * e * h
            arms += m
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
    w['pelvis'], w['chest'], w['head'] = up * (1 - c), up * c * (1 - n), up * c * n
    top = sorted(((v, k) for k, v in w.items() if v > 0.004), reverse=True)[:4]
    tot = sum(v for v, _ in top)
    return {k: v / tot for v, k in top}


def hand_weights(p, kind):
    """A finger's points: with the hand as far as the knuckles, then with each of its two joints."""
    s, sfx = (1, 'l') if kind == HAND_L else (-1, 'r')
    loc = ARM_INV[s] @ Vector(p)
    u = -loc.y - ARM
    # (the thumb, forward of the palm, goes with the hand)
    k1 = sstep(KNUCKLE - 0.035, KNUCKLE + 0.035, u) * sstep(0.2, 0.17, loc.z)
    k2 = sstep(MIDDLE - 0.03, MIDDLE + 0.03, u)
    w = {'ha' + sfx: 1 - k1, 'kn1' + sfx: k1 * (1 - k2), 'kn2' + sfx: k1 * k2}
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
    apx = abs(px)
    nose = sstep(0.1, 0.4, n[2]) * math.exp(-((px / 0.2) ** 2 + ((py + 0.25) / 0.17) ** 2)) * 0.9
    # (round the sides, by how far under the line from his ear to the corner of his mouth; in front, by the line of his mouth)
    side = sstep(-0.15, -0.6, n[1] / max(0.35, math.hypot(n[0], n[2]))) * sstep(-0.5, 0.0, n[2])
    soft = 0.001 + 0.02 * sstep(MOUTH_W - 0.09, MOUTH_W - 0.05, apx) + 0.5 * sstep(MOUTH_W - 0.06, MOUTH_W + 0.4, apx)
    lip = sstep(MOUTH_Y + soft, MOUTH_Y - soft, py)
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
    }
    for s, sfx, ua, fa, ha, th, sh, ft in ((1, 'L', 'ual', 'fal', 'hal', 'thl', 'shl', 'ftl'), (-1, 'R', 'uar', 'far', 'har', 'thr', 'shr', 'ftr')):
        f = arm_frame(s)
        for name, u in ((ua, 0), (fa, UARM), (ha, ARM)):
            rest[name] = f @ Matrix.Translation((0, -u, 0))
        rest[th] = Matrix.Translation((s * HIP_W, HIP, 0))
        rest[sh] = Matrix.Translation((s * HIP_W, KN_Y, 0))
        rest[ft] = Matrix.Translation((s * HIP_W, AN_Y, 0))
        rest['hem' + sfx] = Matrix.Translation((s * HIP_W, KN_Y + 0.7, 0))
        rest['kn1' + sfx.lower()] = f @ Matrix.Translation((0, -(ARM + KNUCKLE), 0))
        rest['kn2' + sfx.lower()] = f @ Matrix.Translation((0, -(ARM + MIDDLE), 0))
        rest['cl' + sfx.lower()] = f
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


def thin_body(hi, tris):
    """The skin, thinned (his head is a skin of its own: see head)."""
    return thin(hi, tris)


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
        low = legs or [(HEM - 0.25, 0.46, 0.392, 0.45, 0.46), (HEM, 0.455, 0.39, 0.45, 0.46), (FORK - 0.12, 0.42, 0.382, 0.435, 0.45)]
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

    for o in (body, vest, socks):
        tag(o, BY_PLACE)
    built = [body, top, vest, shorts, socks, *ears(EAR if q >= 1 else SKIN), *(mouth() if q >= 1 else [])]
    for s in (1, -1):
        built += fingers(s) + (shoe_fine(s) if q >= 1 else shoe(s))
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

    # shade: every hollow, and the face's
    bake_occlusion(fig, floor=FLOOR, rays=64, reach=1.1, low=0.58)
    # (a face is small: its baked shade is a hint, or its few points read as bruises)
    soften(fig, lambda x, y, z: y > HEAD_C[1] - HEAD_H * 1.05, 0.55)
    # (an ear's back is hard against his head: left as dark as that makes it, it is a hole beside his face)
    soften(fig, lambda x, y, z: abs(x) > HEAD_W * 0.86 and abs(y - HEAD_C[1]) < 0.16 and z < HEAD_C[2] + 0.06, 0.15)
    paint(fig, face_shade)
    # (and a shoulder moves: the shade of the grooves round it as he's built would stay behind as a painted crease)
    soften(fig, lambda x, y, z: (abs(x) - SHOULDER) ** 2 + (y - SH_Y) ** 2 + z * z < 0.62 ** 2 and y < CHEST_Y + 0.2, 0.25)

    # bones and weights
    tags = [0] * len(me.vertices)
    me.attributes['tag'].data.foreach_get('value', tags)
    groups = {b: fig.vertex_groups.new(name=b) for b in [*BONES, *leaves()]}
    for v in me.vertices:
        kind = tags[v.index]
        at = tuple(G(v.co))
        ws = {RIGID[kind]: 1.0} if kind in RIGID else swing_weights(at) if kind == SWINGS else face_weights(at) if kind == FACE else hand_weights(at, kind) if kind in (HAND_L, HAND_R) else weights(at, kind)
        for b, wt in ws.items():
            groups[b].add([v.index], wt, 'REPLACE')
    me.attributes.remove(me.attributes['tag'])
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


def on_head(n, out=0.0):
    """The point of his scalp along n (in the head's half sizes), `out` feet off it."""
    ln = math.sqrt(sum(v * v for v in n))
    n = tuple(v / ln for v in n)
    r = head_r(n)
    size = (HEAD_W, HEAD_H, HEAD_D)
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
        return 0.011 * (math.sin(p.x * 61 + p.y * 37) * math.sin(p.z * 57 - p.y * 41) + 0.6 * math.sin(p.x * 113 - p.z * 97 + p.y * 71))

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


def hair_pieces():
    """Hair that stands off his head as shapes of their own: a bun, hair tied back, short twists, locks to his neck, the ends of his braids."""
    rnd = random.Random(7)
    out = []
    # a bun, high on the back of his crown, over the knot it's tied in
    bun = ellipsoid(tuple(on_head((0, 0.62, -0.72), 0.075)), (0.115, 0.1, 0.11), 14, 10, 'bun', Matrix.Rotation(0.7, 3, 'X'))
    knot = ellipsoid(tuple(on_head((0, 0.62, -0.72), 0.0)), (0.07, 0.05, 0.07), 10, 6, 'knot', Matrix.Rotation(0.7, 3, 'X'))
    out.append((join([bun, knot], 'bun'), BUN))
    # hair tied at the back of his head, its tail down to the nape
    root = on_head((0, 0.25, -1), 0.02)
    tail = [root + Vector((0, 0.03, 0.02)), root + Vector((0, 0.02, -0.07)), root + Vector((0, -0.08, -0.12)), root + Vector((0, -0.2, -0.11)), root + Vector((0, -0.31, -0.08)), root + Vector((0, -0.38, -0.06))]
    rings = []
    for i, p in enumerate(tail):
        w = (0.035, 0.07, 0.075, 0.065, 0.045, 0.012)[i]
        rings.append([(p.x + math.cos(a) * w * 1.25, p.y, p.z + math.sin(a) * w) for a in (2 * math.pi * k / 8 for k in range(8))])
    out.append((solid(rings, 'tail'), TAIL))
    # short twists all over his scalp: each a stub with a round end, standing off it and leaning its own way, the
    # scalp showing in the partings between them
    parts = []
    for i in range(124):
        # (spread evenly over the scalp: a spiral from the crown down to the hairline)
        t = (i + 0.5) / 124
        e = math.pi / 2 - t ** 0.62 * 1.75
        a = i * 2.39996
        n = (math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a))
        if hairline(tuple(on_head(n))) < 0.06:
            continue
        base = on_head(n, -0.012)
        lean = Vector((rnd.uniform(-0.4, 0.4), -0.35, rnd.uniform(-0.4, 0.4)))
        tall = rnd.uniform(0.07, 0.105)
        mid = on_head(n, tall * 0.6) + lean * 0.018
        tip = on_head(n, tall) + lean * 0.05
        r = rnd.uniform(0.03, 0.037)
        e1 = Vector(n).cross(Vector((0.3, 0.2, 1))).normalized()
        e2 = Vector(n).cross(e1).normalized()
        rings = [[tuple(at + (e1 * math.cos(q + turn) + e2 * math.sin(q + turn)) * rad) for q in (2 * math.pi * k / 5 for k in range(5))] for at, rad, turn in ((base, r, 0.0), (mid, r * 0.96, 0.5), (tip, r * 0.62, 1.0))]
        # (its foot is under his scalp: left open, a triangle or three saved on each)
        stub = mesh_obj('twist', [p for ring_ in rings for p in ring_], [(i * 5 + k, i * 5 + (k + 1) % 5, (i + 1) * 5 + (k + 1) % 5, (i + 1) * 5 + k) for i in range(2) for k in range(5)] + [tuple(range(10, 15))])
        fix_normals(stub)
        parts.append(stub)
    out.append((join(parts, 'twists'), TWISTS))
    # locks from his crown down to his neck, over his ears
    parts = []
    for i in range(46):
        t = (i + 0.5) / 46
        e = math.pi / 2 - (0.25 + t ** 0.7 * 1.2)
        a = i * 2.39996
        n = (math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a))
        if hairline(tuple(on_head(n))) < 0.05:
            continue
        base = on_head(n, 0.0)
        # (out over the scalp, then straight down; the ones in front are swept back)
        side = Vector((n[0], 0, min(n[2], 0.1)))
        side = side.normalized() if side.length > 0.05 else Vector((0, 0, -1))
        over = on_head((n[0] * 1.3, n[1] - 0.3, min(n[2] * 1.2, n[2] - 0.15)), 0.035)
        end_y = HEAD_C[1] - HEAD_H * rnd.uniform(0.85, 1.15)
        over.z = min(over.z, 0.12)
        low = Vector((over.x + side.x * 0.03, min(over.y - 0.05, max(end_y, over.y - 0.5)), over.z + side.z * 0.03 - 0.02))
        mid = (over + low) / 2 + side * 0.012
        parts.append(strand([base, (base + over) / 2 + Vector(n) * 0.03, over, mid, low], 0.03, 5, 'lock'))
    out.append((join(parts, 'locs'), LOCS))
    # the ends of his braids, a row of them down the back of his neck
    parts = []
    for i in range(9):
        a = math.pi + (i - 4) * 0.19
        n = (math.sin(a) * 0.9, -0.42, math.cos(a) * 0.9)
        base = on_head(n, 0.0)
        drop = rnd.uniform(0.2, 0.3)
        parts.append(strand([base + Vector((0, 0.03, 0.01)), base + Vector((0, -0.02, -0.012)), base + Vector((0, -drop * 0.6, -0.008)), base + Vector((0, -drop, 0.0))], 0.018, 4, 'braid'))
    out.append((join(parts, 'braids'), BRAIDS))
    # heads of hair that stand off the scalp: an afro, round; a high top, its sides left to the scalp; short curls, uneven
    out.append((volume('afro', lambda n: 0.1 + 0.1 * sstep(0.05, 0.8, n[1]) - 0.03 * sstep(0.3, 0.9, n[2]), cols=52, rows=15, lumps=0.022), AFRO))
    out.append((hightop(), HIGHTOP))
    out.append((volume('curls', lambda n: 0.034 + 0.01 * math.sin(n[0] * 23 + n[1] * 9) * math.sin(n[2] * 21 - n[1] * 13), cols=52, rows=14), CURLS))
    for o, name in out:
        set_material(o, material(name, (0.05, 0.04, 0.035), 0.8))
        tag(o, SWINGS if name in (TAIL, LOCS, BRAIDS) else ON_HEAD)
    return [o for o, _ in out]


def build(who='player'):
    global girdled
    reset()
    materials()
    girdled = who == 'player'
    hi = fused()
    # (only the men on the floor have hair that is a shape of its own: the benches are seen from far off)
    return finish(dress_player(hi) + hair_pieces() if who == 'player' else dress_coach(hi), 'figure' if who == 'player' else who)


def report(fig):
    count = {}
    for f in fig.data.polygons:
        n = fig.data.materials[f.material_index].name
        count[n] = count.get(n, 0) + len(f.vertices) - 2
    print(f'[models] {fig.name}: {tri_count(fig)} triangles {count}, {len(fig.data.vertices)} points')


if __name__ == '__main__':
    a = args()
    fig, arm_ob = build()
    report(fig)
    export_glb(os.path.join(a['out'], 'figure.glb'), [fig, arm_ob])
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
