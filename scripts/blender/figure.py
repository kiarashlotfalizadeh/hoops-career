# The player: one athlete's body on the 18 bones the game's puppet drives (figure.ts), dressed.
#
# How it's made: the body's masses (trunk, head, limbs, palms) are laid out as simple solids and
# fused into one skin (voxel remesh, then smoothed), so a shoulder runs into an arm without a seam.
# The clothes are that same skin, pushed out and cut along planes (a V-neck vest tucked into shorts
# with two legs, socks), so they sit on him and move with him; the skin under them is cut away.
# Fingers, ears and sneakers are built by hand and joined on. Each point follows the bones near it
# (weights are a function of where the point is), and the shade of every hollow is baked in.
#
# He stands with his arms out from his sides (they can't be fused hanging against the trunk); the
# rig's bones carry that pose, so the game needs to know nothing about it.
import os
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
HEM = KN_Y + 0.5
# where the shorts' two legs part (lower than his own fork: they hang)
FORK = HIP - 0.66
TUCK = WAIST - 0.07
SOCK_LO, SOCK_HI = AN_Y + 0.02, AN_Y + 0.78
# the vest's armholes (a plane each side) and its V neck (two planes, lower in front)
PIT = 0.69, 4.70
PIT_N = Vector((0.978, 0.209, 0)).normalized()
VK, VM, VC = 1.0, 0.5, 5.27
VLEN = math.sqrt(1 + VK * VK + VM * VM)
TRIM = 0.055
# the head (a little big for his height, as a figurine's is)
HEAD_W, HEAD_H, HEAD_D = 0.338, 0.43, 0.4
HEAD_C = (0, HEAD_Y + 0.045, 0.03)
UNDER = 0.11
# his hair, cropped: the scalp over a line that runs from his forehead down past the top of each ear to the nape
HAIR_AT, HAIR_FRONT, HAIR_BACK = 0.3, 0.5, 0.85

BONES = ['pelvis', 'chest', 'head', 'ual', 'fal', 'hal', 'uar', 'far', 'har', 'thl', 'shl', 'ftl', 'thr', 'shr', 'ftr', 'hem', 'hemL', 'hemR']
SKIN, HAIR, JERSEY, TRIM_M, CLOTH, SHOE, WHITE = 'skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white'
# what a hand-built part hangs on (anything else: by where each point is)
BY_PLACE, SHORTS, HAND_L, HAND_R, ON_HEAD, FOOT_L, FOOT_R = range(7)
RIGID = {HAND_L: 'hal', HAND_R: 'har', ON_HEAD: 'head', FOOT_L: 'ftl', FOOT_R: 'ftr'}


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
        (5.27, 0.69, 0.4, 0.365, -0.01),
        (5.40, 0.52, 0.29, 0.32, -0.02),
        (5.50, 0.37, 0.235, 0.27, -0.02),
        (5.60, 0.265, 0.215, 0.24, -0.012),
        (5.82, 0.235, 0.21, 0.225, 0.0),
        (6.05, 0.22, 0.2, 0.21, 0.0),
        (6.10, 0.05, 0.05, 0.05, 0.0),
    ]
    return solid([ring((0, y, zc), rx, rzf, 32, rzb) for y, rx, rzf, rzb, zc in st], 'trunk')


def head():
    """A skull with a jaw (square at its corners, a chin), a brow over the eyes' hollows, cheekbones, a nose, lips."""
    w, h, d = HEAD_W, HEAD_H, HEAD_D
    c = HEAD_C
    o = ellipsoid((0, 0, 0), (1, 1, 1), seg=48, rings=36, name='head')
    bump = lambda x, y, at, sx, sy: math.exp(-(((x - at[0]) / sx) ** 2 + ((y - at[1]) / sy) ** 2))  # noqa: E731
    for v in o.data.vertices:
        x, y, z = G(v.co)
        front = max(0.0, z)
        # the skull is longest behind and above the ears; the face under it is narrower, and flat
        if y > 0 and z < 0:
            z *= 1 + 0.07 * y
        if y < -0.15:
            t = min(1.0, (-0.15 - y) / 0.8)
            x *= 1 - 0.2 * t * t
            z = z * (1 - 0.16 * t) + 0.13 * t * front
        if z > 0:
            z *= 0.92
        # the jaw's corners under the ears, and a chin
        for ex in (-0.62, 0.62):
            x += math.copysign(0.05, ex) * bump(x, y, (ex, -0.5), 0.3, 0.22) * (1 if z > -0.5 else 0)
        z += bump(x, y, (0, -0.84), 0.3, 0.15) * front * 0.1
        # a brow, the eyes' hollows under it, cheekbones, lips
        z += math.exp(-((y - 0.2) ** 2) / 0.014) * front * front * 0.085
        for ex in (-0.4, 0.4):
            if z > 0:
                z -= bump(x, y, (ex, 0.06), 0.2, 0.09) * 0.085
            z += bump(x, y, (ex * 1.35, -0.13), 0.2, 0.13) * front * 0.04
        z += bump(x, y, (0, -0.47), 0.3, 0.07) * front * 0.045
        z -= bump(x, y, (0, -0.47), 0.26, 0.016) * front * 0.02
        v.co = B(c[0] + x * w, c[1] + y * h, c[2] + z * d)
    # (the nose: a bridge down from between the brows, a tip, a wing each side)
    nose = ellipsoid((0, c[1] - 0.03, c[2] + d * 0.88), (0.046, 0.14, 0.07), 14, 10, 'nose', Matrix.Rotation(-0.33, 3, 'X'))
    tip = ellipsoid((0, c[1] - 0.115, c[2] + d * 0.955), (0.052, 0.045, 0.052), 12, 8, 'tip')
    wings = [ellipsoid((sx * 0.045, c[1] - 0.125, c[2] + d * 0.9), (0.036, 0.034, 0.045), 10, 6, 'wing') for sx in (-1, 1)]
    return [o, nose, tip, *wings]


def ears():
    out = []
    for s in (1, -1):
        e = ellipsoid((s * (HEAD_W - 0.004), HEAD_C[1] - 0.02, 0.0), (0.03, 0.095, 0.058), 10, 8, 'ear', Matrix.Rotation(s * 0.4, 3, 'Y') @ Matrix.Rotation(-0.15, 3, 'X'))
        set_material(e, material(SKIN))
        out.append(tag(e, ON_HEAD))
    return out


def arm(s):
    f = arm_frame(s)
    # (how far down the arm, its radius across, its depth, how far forward its middle sits)
    st = [
        (-0.14, 0.05, 0.05, 0.0),
        (-0.07, 0.17, 0.19, 0.0),
        (0.06, 0.222, 0.24, 0.005),
        (0.32, 0.232, 0.25, 0.014),
        (0.66, 0.205, 0.218, 0.01),
        (1.0, 0.17, 0.178, 0.0),
        (1.14, 0.166, 0.162, 0.0),
        (1.38, 0.192, 0.182, 0.008),
        (1.74, 0.152, 0.14, 0.004),
        (2.06, 0.112, 0.098, 0.0),
        (2.19, 0.1, 0.082, 0.0),
        (2.3, 0.05, 0.05, 0.0),
    ]
    parts = [solid([ring((0, -u, zc), rx, rz, 20, frame=f) for u, rx, rz, zc in st], 'arm')]
    # the shoulder's cap, and the palm (its back to the outside, thumb edge forward)
    cap = ellipsoid((-s * 0.03, -0.07, 0.0), (0.225, 0.215, 0.245), 20, 14, 'cap')
    palm = ellipsoid((0.0, -(ARM + 0.215), 0.012), (0.066, 0.25, 0.17), 20, 14, 'palm')
    heel = ellipsoid((-s * 0.03, -(ARM + 0.14), 0.09), (0.06, 0.13, 0.085), 12, 8, 'heel')
    # (the shoulder runs into the chest and the back: no ball on a stick)
    bridge = ellipsoid((-s * 0.22, -0.1, 0.0), (0.3, 0.17, 0.285), 16, 10, 'bridge')
    # (and into the chest in front: a shallow groove there, not a cut)
    fill = ellipsoid((-s * 0.17, -0.16, 0.07), (0.25, 0.2, 0.2), 14, 10, 'fill')
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
    for z, ln, r, splay in ((0.118, 0.3, 0.039, 0.07), (0.04, 0.335, 0.04, 0.015), (-0.036, 0.31, 0.038, -0.04), (-0.108, 0.25, 0.034, -0.1)):
        knuckle = -(ARM + 0.4) + abs(z - 0.02) * 0.22
        out.append(digit(f, (-s * 0.008, knuckle, z), (-s * 0.08, -1, splay), (ln * 0.44, ln * 0.31, ln * 0.25), (0.16, 0.3, 0.3), r, s))
    out.append(digit(f, (-s * 0.035, -(ARM + 0.1), 0.125), (-s * 0.3, -0.78, 0.62), (0.13, 0.11, 0.08), (0.1, 0.22, 0.2), 0.046, s, 'thumb'))
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
        [ring((ox, oy + y, zc), rx, rz, 16) for y, rx, rz, zc in ((-0.12, 0.12, 0.15, -0.03), (0.04, 0.165, 0.2, -0.03), (0.2, 0.178, 0.208, -0.025), (0.262, 0.182, 0.208, -0.02), (0.292, 0.174, 0.2, -0.02), (0.288, 0.158, 0.184, -0.02), (0.16, 0.152, 0.178, -0.02))],
        'shoeCollar',
    )
    for o in (upper, collar):
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
    return [tag(upper, foot), tag(collar, BY_PLACE), tag(sole, foot)]


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
        m = 1.0 if u > 0.8 and rho < 0.6 else (1 - sstep(0.31, 0.5, rho)) * sstep(-0.24, 0.3, u)
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
    n = sstep(CHEST_Y + 0.17, CHEST_Y + 0.62, y)
    w['pelvis'], w['chest'], w['head'] = up * (1 - c), up * c * (1 - n), up * c * n
    top = sorted(((v, k) for k, v in w.items() if v > 0.004), reverse=True)[:4]
    tot = sum(v for v, _ in top)
    return {k: v / tot for v, k in top}


def face_shade(x, y, z):
    """The face's hollows, darker than light alone leaves them at a distance: the eyes, under the brow, the mouth."""
    w, h, d = HEAD_W, HEAD_H, HEAD_D
    px, py, pz = x / w, (y - HEAD_C[1]) / h, z - HEAD_C[2]
    if pz < 0.1 * d or abs(py) > 1.05:
        return 1.0
    c = 1.0
    for ex in (-0.4, 0.4):
        c -= 0.08 * math.exp(-(((px - ex) / 0.16) ** 2 + ((py - 0.06) / 0.06) ** 2))
    c -= 0.06 * math.exp(-((py + 0.47) ** 2) / 0.0016) * math.exp(-((px / 0.26) ** 2))
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
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    for name in BONES:
        eb = arm_data.edit_bones.new(name)
        eb.head = (0, 0, 0)
        eb.tail = (0, 0.3, 0)
        eb.matrix = conv @ rest[name]
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = ob
    mod = mesh.modifiers.new('rig', 'ARMATURE')
    mod.object = ob
    return ob


def fused():
    """One skin over all his masses."""
    masses = [trunk(), *head()]
    for s in (1, -1):
        masses += arm(s) + leg(s)
    hi = join(masses, 'hi')
    hi = apply_modifier(hi, 'REMESH', mode='VOXEL', voxel_size=0.019, adaptivity=0.0, use_smooth_shade=True)
    relax(hi, 5)
    return hi


def thin_body(hi, tris):
    """The skin, thinned: the face keeps more of its triangles than its size alone would give it."""
    face = (0, HEAD_C[1], 0.1)
    swell(hi, face, 0.6, 2.7)
    body = thin(hi, tris)
    swell(body, face, 0.6, 2.7, back=True)
    return body


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
    """His hair, cropped close: his scalp over the hairline, a hair's depth proud of the skin, a material of its own."""
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
    push(body, lambda p: 0.007 * sstep(0.0, 0.1, hairline(p)) if p[1] > HEAD_C[1] - HEAD_H else 0.0)
    return body


def dress_player(hi, q=1.0):
    """In his kit: a V-neck vest tucked into shorts, socks, sneakers. `q` scales how many triangles he's made of (the bench is seen from far off)."""
    # (the clothes are cut from a lighter copy: cloth has no fine detail to keep)
    mid = thin(copy(hi, 'mid'), 44000)

    # the skin that shows: head, neck and shoulders outside the vest, the arms; the legs from under the shorts to inside the socks
    body = thin_body(hi, 6000 * q)
    cut(
        body,
        [plane_pit(1, -UNDER), plane_pit(-1, -UNDER), plane_vee(1, -UNDER), plane_vee(-1, -UNDER), level(HEM + 0.3), level(SOCK_HI - 0.06)],
        lambda p: pit(p, 1) > -UNDER or pit(p, -1) > -UNDER or (vee(p) > -UNDER and p[1] > 4.9) or (SOCK_HI - 0.06 < p[1] < HEM + 0.3 and abs(p[0]) < 1.2),
    )
    crop(body)

    # the vest: his trunk, a little looser, cut at the armholes and the V of the neck, tucked in; a band of trim round each opening
    vest = copy(mid, 'vest')
    push(vest, lambda p: 0.01 + 0.016 * sstep(WAIST, WAIST + 0.14, p[1]) + 0.034 * sstep(WAIST + 0.1, WAIST + 0.45, p[1]) * sstep(5.0, 4.4, p[1]))
    relax(vest, 10)
    thin(vest, 3000 * q)
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
    built = [body, vest, shorts, socks, *ears()]
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

    body = thin_body(hi, 5200 * q)
    cut(body, [level(5.3), *[(c, n) for c, n in cuff]], lambda p: p[1] > 5.3 and abs(p[0]) < 0.6 or down_arm(p) > CUFF - 0.08)
    crop(body)

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
    built = [body, shirt, jacket, trousers, *ears()]
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
    groups = {b: fig.vertex_groups.new(name=b) for b in BONES}
    for v in me.vertices:
        kind = tags[v.index]
        ws = {RIGID[kind]: 1.0} if kind in RIGID else weights(tuple(G(v.co)), kind)
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


def build(who='player'):
    reset()
    materials()
    hi = fused()
    return finish(dress_player(hi) if who == 'player' else dress_coach(hi), 'figure' if who == 'player' else who)


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
            [((2, 6.3, 10), (0, 5.85, 0), 2.0), ((9, 6.2, 5), (0, 5.85, 0), 2.0), ((hand.x + 3, hand.y + 1, 9), tuple(hand), 1.5), ((5, 1.4, 9), (0.2, 0.25, 0.2), 2.4), ((2, 3.4, 12), (0, 3.2, 0), 3.0), ((-8, 3.2, -9), (0, 3.2, 0), 3.0)],
            size=(480, 480),
            ground=FLOOR,
            sheet_cols=3,
        )
