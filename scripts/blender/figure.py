# The player: one athlete's body on the 18 bones the game's puppet drives (figure.ts), dressed.
#
# How it's made: the body's masses (trunk, limbs, palms) are laid out as simple solids and fused
# into one skin (voxel remesh, then smoothed), so a shoulder runs into an arm without a seam. His
# head is a skin of its own, shaped by a formula (head_r: a skull, a jaw, a brow, a nose, lips), so
# a face keeps its form however few triangles it gets, and the app can paint eyes and a mouth where
# the formula put their hollows; it sits down over the top of his neck.
# The clothes are that same skin, pushed out and cut along planes (a V-neck vest tucked into shorts
# with two legs, socks), so they sit on him and move with him; the skin under them is cut away.
# Fingers, ears and sneakers are built by hand and joined on, and so is hair that stands off a
# head (a bun, a tail, twists, locks, braids: the app draws a man with one of them or none). Each
# point follows the bones near it (weights are a function of where the point is), and the shade of
# every hollow is baked in. Beyond the puppet's bones he has six leaves the app turns itself: his
# fingers' two joints on each hand, and his jaw and nose, whose sizes make one face unlike another.
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
HEM = KN_Y + 0.36
# where the shorts' two legs part (lower than his own fork: they hang)
FORK = HIP - 0.66
TUCK = WAIST - 0.07
SOCK_LO, SOCK_HI = AN_Y + 0.02, AN_Y + 0.78
# the vest's armholes (a plane each side) and its V neck (two planes, lower in front)
PIT = 0.7, 4.75
PIT_N = Vector((0.995, 0.1, 0)).normalized()
VK, VM, VC = 1.0, 0.5, 5.27
VLEN = math.sqrt(1 + VK * VK + VM * VM)
TRIM = 0.055
# the head (a tenth bigger than a real one for his height, as a figurine's is: narrower than it is
# long, longer than it is deep), set forward on his neck as a head is
HEAD_W, HEAD_H, HEAD_D = 0.3, 0.42, 0.37
HEAD_C = (0, HEAD_Y + 0.045, 0.05)
UNDER = 0.17
# his hair, cropped: the scalp over a line that runs from his forehead down past the top of each ear to the nape
HAIR_AT, HAIR_FRONT, HAIR_BACK = 0.3, 0.5, 0.85

BONES = ['pelvis', 'chest', 'head', 'ual', 'fal', 'hal', 'uar', 'far', 'har', 'thl', 'shl', 'ftl', 'thr', 'shr', 'ftr', 'hem', 'hemL', 'hemR']
# (the puppet drives those; these are leaves only figure.ts turns, each with the bone it goes with when nothing
# does: each hand's fingers at the knuckles and at their middle joints, and two that shape a face, his jaw and his nose)
# (and one that hair which hangs swings from)
LEAVES = {'kn1l': 'hal', 'kn2l': 'kn1l', 'kn1r': 'har', 'kn2r': 'kn1r', 'jaw': 'head', 'nose': 'head', 'hair': 'head'}
SKIN, HAIR, JERSEY, TRIM_M, CLOTH, SHOE, WHITE = 'skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white'
# hair that is a shape of its own (a man wears one of them or none: figure.ts leaves the others out)
BUN, TAIL, TWISTS, LOCS, BRAIDS, AFRO, HIGHTOP, CURLS = 'bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'
# what a hand-built part hangs on (anything else: by where each point is)
BY_PLACE, SHORTS, HAND_L, HAND_R, ON_HEAD, FOOT_L, FOOT_R, FACE, SWINGS = range(9)
RIGID = {ON_HEAD: 'head', FOOT_L: 'ftl', FOOT_R: 'ftr'}
# the fingers' knuckles and middle joints, down the arm from the wrist
KNUCKLE, MIDDLE = 0.4, 0.545
# where his jaw and his nose are scaled about, from the head's middle (in its half sizes)
JAW_AT, NOSE_AT = (0, -0.42, 0.25), (0, -0.2, 0.8)
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
        (5.70, 0.245, 0.205, 0.23, 0.0),
        (5.82, 0.222, 0.2, 0.215, 0.012),
        (6.05, 0.215, 0.195, 0.21, 0.03),
        (6.10, 0.05, 0.05, 0.05, 0.03),
    ]
    return solid([ring((0, y, zc), rx, rzf, 32, rzb) for y, rx, rzf, rzb, zc in st], 'trunk')


def ray(n, c, r):
    """How far from the middle of the head (in its half sizes) a ray along n leaves an ellipsoid round c."""
    aa = sum((n[i] / r[i]) ** 2 for i in range(3))
    bb = sum(n[i] * c[i] / r[i] ** 2 for i in range(3))
    cc = sum((c[i] / r[i]) ** 2 for i in range(3)) - 1
    return (bb + math.sqrt(max(0.0, bb * bb - aa * cc))) / aa


def face_at(n):
    """Where on the plane of his face a direction from the head's middle looks (in the head's half sizes: figure.ts paints by the same)."""
    nz = max(n[2], 0.3)
    return n[0] / nz * 0.8, n[1] / nz * 0.8


def head_r(n):
    """
    How far out the head's skin is along n (a unit direction from its middle, in its half sizes): a
    skull with a narrower face and jaw under it, then a brow, the eyes' hollows, cheekbones, a nose,
    lips and a chin. Everything on the face is placed by face_at, as figure.ts paints it.
    """
    skull = ray(n, (0, 0.2, -0.08), (0.97, 0.79, 0.93))
    jaw = ray(n, (0, -0.3, 0.1), (0.79, 0.65, 0.76))
    t = 0.5 * (skull + jaw + math.sqrt((skull - jaw) ** 2 + 0.006))
    x, y, z = n
    # the jaw's corners under the ears; the temples a little hollow
    for sx in (-1, 1):
        t += 0.035 * math.exp(-(((x - sx * 0.74) / 0.2) ** 2 + ((y + 0.55) / 0.16) ** 2 + ((z - 0.12) / 0.3) ** 2))
        t -= 0.02 * math.exp(-(((x - sx * 0.85) / 0.2) ** 2 + ((y - 0.25) / 0.2) ** 2 + ((z - 0.45) / 0.25) ** 2))
    front = sstep(0.1, 0.5, z)
    if front <= 0:
        return t
    px, py = face_at(n)
    g = lambda ax, ay, sx, sy: math.exp(-(((px - ax) / sx) ** 2 + ((py - ay) / sy) ** 2))  # noqa: E731
    d = 0.056 * math.exp(-(((py - 0.25) / 0.07) ** 2)) * math.exp(-((px / 0.75) ** 2)) * (1 - 0.45 * math.exp(-((px / 0.12) ** 2)))
    for sx in (-1, 1):
        d -= 0.108 * g(sx * 0.38, 0.07, 0.17, 0.085)
        # (the eye's own round under its lids, the upper lid's fold over it)
        d += 0.05 * g(sx * 0.38, 0.062, 0.115, 0.042)
        d += 0.012 * g(sx * 0.38, 0.125, 0.14, 0.018)
        d += 0.052 * g(sx * 0.62, -0.14, 0.2, 0.14)
        d += 0.068 * g(sx * 0.15, -0.265, 0.07, 0.05)
        # (the fold from each side of the nose down past the mouth)
        d -= 0.014 * g(sx * 0.33, -0.44, 0.04, 0.13)
    # the nose: low between the eyes, highest at its tip, cut in under it
    u = clamp((0.2 - py) / 0.44)
    d += (0.02 + 0.125 * u ** 1.3) * sstep(-0.335, -0.275, py) * sstep(0.32, 0.16, py) * math.exp(-((px / (0.07 + 0.05 * u)) ** 2))
    # (his forehead stands up over his brow)
    d += 0.03 * g(0, 0.52, 0.6, 0.2)
    # the mouth: both lips on a rise of their own, the line between them, the groove under the lower one, a chin
    wide = math.exp(-((px / 0.27) ** 4))
    d += 0.04 * g(0, -0.5, 0.36, 0.17)
    d += wide * (0.034 * math.exp(-(((py + 0.472) / 0.04) ** 2)) + 0.044 * math.exp(-(((py + 0.572) / 0.045) ** 2)) - 0.04 * math.exp(-(((py + 0.52) / 0.013) ** 2)))
    d -= 0.014 * g(0, -0.41, 0.032, 0.05)
    d -= 0.02 * g(0, -0.675, 0.2, 0.04)
    d += 0.062 * g(0, -0.85, 0.2, 0.1)
    return t + d * front


def head(q=1.0):
    """His head: a skin over head_r, finer over his face than over his skull."""
    c = HEAD_C
    size = (HEAD_W, HEAD_H, HEAD_D)
    cols, rows = 132, 96
    verts, faces = [], []

    def at(a, e):
        d = (math.cos(e) * math.sin(a) / size[0], math.sin(e) / size[1], math.cos(e) * math.cos(a) / size[2])
        ln = math.sqrt(sum(v * v for v in d))
        n = tuple(v / ln for v in d)
        r = head_r(n)
        return tuple(c[i] + n[i] * r * size[i] for i in range(3))

    for i in range(1, rows):
        e = -math.pi / 2 + math.pi * i / rows
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
    face = (0, c[1] - 0.08, c[2] + 0.3)
    swell(o, face, 0.3, 2.6)
    # (the benches, seen from far off, get by with a good deal less)
    o = thin(o, (5400 if q >= 1 else 1400) * q)
    swell(o, face, 0.3, 2.6, back=True)
    # (what is down inside his neck is never seen)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    inside = [f for f in bm.faces if (lambda p: p[1] < c[1] - 0.3 and math.hypot(p[0], p[2] - 0.03) < 0.15)(G(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=inside, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    set_material(o, material(SKIN))
    return tag(o, FACE)


def ears():
    out = []
    for s in (1, -1):
        # (a shell that leans back off the head, and its lobe)
        e = ellipsoid((s * (HEAD_W * 0.93 + 0.002), HEAD_C[1] - 0.03, HEAD_C[2] - 0.05), (0.02, 0.1, 0.06), 10, 8, 'ear', Matrix.Rotation(s * 0.28, 3, 'Y') @ Matrix.Rotation(-0.18, 3, 'X'))
        lobe = ellipsoid((s * (HEAD_W * 0.93 + 0.004), HEAD_C[1] - 0.115, HEAD_C[2] - 0.03), (0.02, 0.036, 0.03), 6, 5, 'lobe')
        for part in (e, lobe):
            set_material(part, material(SKIN))
            out.append(tag(part, ON_HEAD))
    return out


def arm(s):
    f = arm_frame(s)
    # (how far down the arm, its radius across, its depth, how far forward its middle sits)
    st = [
        (-0.14, 0.05, 0.05, 0.0),
        (-0.07, 0.15, 0.18, 0.0),
        (0.06, 0.2, 0.235, 0.005),
        (0.26, 0.238, 0.252, 0.01),
        (0.5, 0.205, 0.225, 0.012),
        (0.72, 0.205, 0.232, 0.022),
        (1.0, 0.168, 0.18, 0.0),
        (1.14, 0.166, 0.162, 0.0),
        (1.38, 0.192, 0.182, 0.008),
        (1.74, 0.152, 0.14, 0.004),
        (2.06, 0.112, 0.098, 0.0),
        (2.19, 0.1, 0.082, 0.0),
        (2.3, 0.05, 0.05, 0.0),
    ]
    parts = [solid([ring((0, -u, zc), rx, rz, 20, frame=f) for u, rx, rz, zc in st], 'arm')]
    # the shoulder's cap, and the palm (its back to the outside, thumb edge forward)
    cap = ellipsoid((-s * 0.055, -0.14, 0.0), (0.205, 0.25, 0.24), 20, 14, 'cap')
    palm = ellipsoid((0.0, -(ARM + 0.215), 0.012), (0.066, 0.25, 0.17), 20, 14, 'palm')
    heel = ellipsoid((-s * 0.03, -(ARM + 0.14), 0.09), (0.06, 0.13, 0.085), 12, 8, 'heel')
    # (the shoulder runs into the chest and the back: no ball on a stick)
    bridge = ellipsoid((-s * 0.22, -0.1, 0.0), (0.3, 0.17, 0.285), 16, 10, 'bridge')
    # (and into the chest in front: a shallow groove there, not a cut)
    fill = ellipsoid((-s * 0.17, -0.18, 0.06), (0.22, 0.17, 0.17), 14, 10, 'fill')
    for p in (cap, bridge, fill, palm, heel):
        transform(p, f)
        parts.append(p)
    return parts


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
    for z, ln, r, splay in ((0.122, 0.31, 0.034, 0.1), (0.041, 0.345, 0.035, 0.025), (-0.04, 0.32, 0.033, -0.05), (-0.116, 0.255, 0.03, -0.13)):
        knuckle = -(ARM + KNUCKLE) + abs(z - 0.02) * 0.22
        # (built nearly straight: figure.ts curls them at the knuckles and the middle joints)
        out.append(digit(f, (-s * 0.008, knuckle + 0.03, z), (-s * 0.04, -1, splay), (0.03 + ln * 0.44, ln * 0.31, ln * 0.25), (0.05, 0.08, 0.2), r, s))
    out.append(digit(f, (-s * 0.03, -(ARM + 0.1), 0.125), (-s * 0.12, -0.84, 0.52), (0.13, 0.11, 0.08), (0.06, 0.14, 0.14), 0.042, s, 'thumb'))
    return out


def leg(s):
    x = s * HIP_W
    st = [
        (HIP + 0.3, 0.05, 0.05, 0.0),
        (HIP + 0.2, 0.26, 0.28, 0.02),
        (HIP, 0.335, 0.36, 0.035),
        (HIP - 0.45, 0.31, 0.335, 0.035),
        (HIP - 0.9, 0.275, 0.29, 0.025),
        (HIP - 1.3, 0.235, 0.245, 0.012),
        (KN_Y + 0.08, 0.205, 0.215, 0.012),
        (KN_Y - 0.1, 0.2, 0.205, 0.0),
        (KN_Y - 0.4, 0.235, 0.255, -0.045),
        (KN_Y - 0.72, 0.215, 0.235, -0.055),
        (KN_Y - 1.05, 0.165, 0.175, -0.03),
        (KN_Y - 1.35, 0.13, 0.14, -0.012),
        (AN_Y + 0.02, 0.125, 0.14, 0.0),
        (AN_Y - 0.1, 0.05, 0.05, 0.0),
    ]
    limb = solid([ring((x, y, zc), rx, rz, 22) for y, rx, rz, zc in reversed(st)], 'leg')
    knee = ellipsoid((x, KN_Y + 0.03, 0.15), (0.12, 0.15, 0.09), 12, 8, 'knee')
    return [limb, knee]


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
        # (the top of his shoulder gives way to the arm slowly, the armpit quickly: an arm that hangs leaves no shelf over it)
        out = max(0.0, s * loc.x / rho) if rho > 1e-6 else 0.0
        m = 1.0 if u > 0.8 and rho < 0.6 else (1 - sstep(0.31, 0.5, rho)) * sstep(-0.24 - 0.14 * out, 0.3 + 0.4 * out, u)
        if m <= 0:
            continue
        e = sstep(UARM - 0.24, UARM + 0.24, u)
        h = sstep(ARM - 0.1, ARM + 0.1, u)
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
    """His head's points: all his head's, but for what his jaw and his nose take with them (they shape a face: see figure.ts)."""
    size = (HEAD_W, HEAD_H, HEAD_D)
    d = [(p[i] - HEAD_C[i]) / size[i] for i in range(3)]
    ln = math.sqrt(sum(v * v for v in d)) or 1.0
    n = tuple(v / ln for v in d)
    px, py = face_at(n)
    nose = sstep(0.1, 0.4, n[2]) * math.exp(-((px / 0.2) ** 2 + ((py + 0.25) / 0.17) ** 2)) * 0.9
    jaw = sstep(-0.15, -0.6, n[1] / max(0.35, math.hypot(n[0], n[2]))) * sstep(-0.5, 0.0, n[2]) * (1 - nose)
    w = {'head': 1 - nose - jaw, 'jaw': jaw, 'nose': nose}
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
    for name, at in (('jaw', JAW_AT), ('nose', NOSE_AT), ('hair', SWING_AT)):
        rest[name] = Matrix.Translation((HEAD_C[0] + at[0] * HEAD_W, HEAD_C[1] + at[1] * HEAD_H, HEAD_C[2] + at[2] * HEAD_D))
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    for name in [*BONES, *LEAVES]:
        eb = arm_data.edit_bones.new(name)
        eb.head = (0, 0, 0)
        eb.tail = (0, 0.3, 0)
        eb.matrix = conv @ rest[name]
    for name, parent in LEAVES.items():
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = ob
    mod = mesh.modifiers.new('rig', 'ARMATURE')
    mod.object = ob
    return ob


def fused():
    """One skin over all his masses."""
    masses = [trunk()]
    for s in (1, -1):
        masses += arm(s) + leg(s)
    hi = join(masses, 'hi')
    hi = apply_modifier(hi, 'REMESH', mode='VOXEL', voxel_size=0.019, adaptivity=0.0, use_smooth_shade=True)
    relax(hi, 5)
    return hi


def thin_body(hi, tris):
    """The skin, thinned (his head is a skin of its own: see head)."""
    return thin(hi, tris)


def shorts_form(legs=None, folds=0.016):
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
        low = legs or [(HEM - 0.25, 0.45, 0.372, 0.425, 0.435), (HEM, 0.445, 0.37, 0.425, 0.435), (FORK - 0.12, 0.415, 0.372, 0.425, 0.44)]
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
    body = thin_body(hi, (7200 if q >= 1 else 3000) * q)
    # (how far under the vest's edges his skin goes on: less on the benches' coarser bodies, which would poke through it)
    under = UNDER if q >= 1 else 0.07
    cut(
        body,
        [plane_pit(1, -under), plane_pit(-1, -under), plane_vee(1, -under), plane_vee(-1, -under), level(HEM + 0.3), level(SOCK_HI - 0.06)],
        lambda p: pit(p, 1) > -under or pit(p, -1) > -under or (vee(p) > -under and p[1] > 4.9) or (SOCK_HI - 0.06 < p[1] < HEM + 0.3 and abs(p[0]) < 1.2),
    )
    set_material(body, material(SKIN))
    top = crop(head(q))

    # the vest: his trunk, a little looser, cut at the armholes and the V of the neck, tucked in; a band of trim round each opening
    vest = copy(mid, 'vest')
    # (it stands a little further off him round the armholes: the skin that goes on under their edge never shows through)
    push(vest, lambda p: 0.017 + 0.022 * sstep(-0.32, -0.08, max(pit(p, 1), pit(p, -1))) + 0.016 * sstep(WAIST, WAIST + 0.14, p[1]) + 0.034 * sstep(WAIST + 0.1, WAIST + 0.45, p[1]) * sstep(5.0, 4.4, p[1]))
    relax(vest, 10)
    # (it gathers in folds over the waistband it's tucked into, and hangs in a few under each arm)
    for v in vest.data.vertices:
        p = G(v.co)
        a = math.atan2(p[2], p[0])
        waist = sstep(WAIST + 0.6, WAIST + 0.14, p[1]) * sstep(TUCK - 0.04, WAIST + 0.1, p[1])
        side = sstep(0.3, 0.55, abs(p[0])) * sstep(WAIST + 0.2, 4.3, p[1]) * sstep(4.85, 4.5, p[1])
        # (only ever out from him: a fold in toward him would let his skin through)
        k = 1 + 0.03 * waist * (1.1 + math.sin(a * 7 + 0.6) + 0.5 * math.sin(a * 13 + 2.0)) + 0.018 * side * (1 + math.sin(p[1] * 9 + a * 3))
        v.co = B(p[0] * k, p[1], p[2] * k)
    vest.data.update()
    thin(vest, (4400 if q >= 1 else 3000) * q)
    relax(vest, 1)
    in_vest = lambda p: p[1] > TUCK and p[1] < 5.75 and pit(p, 1) <= 0 and pit(p, -1) <= 0 and vee(p) <= 0  # noqa: E731
    cut(vest, [level(TUCK), plane_pit(1), plane_pit(-1), plane_vee(1), plane_vee(-1), plane_pit(1, -TRIM), plane_pit(-1, -TRIM), plane_vee(1, -TRIM), plane_vee(-1, -TRIM)], in_vest)
    slots(vest, [JERSEY, TRIM_M], lambda p: TRIM_M if pit(p, 1) > -TRIM or pit(p, -1) > -TRIM or vee(p) > -TRIM else JERSEY)

    # the shorts: their own shape over his hips, a leg each; a waistband, a hem band and a stripe down each side
    shorts = shorts_form()
    thin(shorts, 3400 * q)
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
    built = [body, top, vest, shorts, socks, *ears()]
    for s in (1, -1):
        built += fingers(s) + shoe(s)
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
    paint(fig, face_shade)

    # bones and weights
    tags = [0] * len(me.vertices)
    me.attributes['tag'].data.foreach_get('value', tags)
    groups = {b: fig.vertex_groups.new(name=b) for b in [*BONES, *LEAVES]}
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
    material(SUIT, (0.03, 0.032, 0.04), 0.7)
    material(SHIRT, (0.85, 0.85, 0.85), 0.7)
    material(TIE, (1.0, 0.72, 0.1), 0.6)


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


def volume(name, lift, low=None, top=None, cols=44, rows=12):
    """
    A head of hair as a shape of its own: a skin `lift(n)` feet off his scalp, from his hairline (or
    from `low`, a height, where that is higher) up over his crown, rolled in to the scalp at its edge;
    nothing of it higher than `top`.
    """
    verts, faces = [], []

    def at(n, edge):
        p = on_head(n, -0.012 + (lift(n) + 0.012) * edge)
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
    # short twists all over his scalp, each standing a little off it
    parts = []
    for i in range(170):
        # (spread evenly over the scalp: a spiral from the crown down to the hairline)
        t = (i + 0.5) / 170
        e = math.pi / 2 - t ** 0.62 * 1.75
        a = i * 2.39996
        n = (math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a))
        if hairline(tuple(on_head(n))) < 0.02:
            continue
        base = on_head(n, -0.012)
        lean = Vector((rnd.uniform(-0.3, 0.3), -0.3, rnd.uniform(-0.3, 0.3)))
        tip = on_head(n, rnd.uniform(0.045, 0.07)) + lean * 0.05
        parts.append(strand([base, tip], 0.036, 4, 'twist'))
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
    out.append((volume('afro', lambda n: 0.1 + 0.1 * sstep(0.05, 0.8, n[1]) - 0.03 * sstep(0.3, 0.9, n[2])), AFRO))
    out.append((volume('hightop', lambda n: 0.19, low=0.47, top=HEAD_C[1] + HEAD_H * 0.8 + 0.2, rows=8), HIGHTOP))
    out.append((volume('curls', lambda n: 0.034 + 0.01 * math.sin(n[0] * 23 + n[1] * 9) * math.sin(n[2] * 21 - n[1] * 13), cols=52, rows=14), CURLS))
    for o, name in out:
        set_material(o, material(name, (0.05, 0.04, 0.035), 0.8))
        tag(o, SWINGS if name in (TAIL, LOCS, BRAIDS) else ON_HEAD)
    return [o for o, _ in out]


def build(who='player'):
    reset()
    materials()
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
