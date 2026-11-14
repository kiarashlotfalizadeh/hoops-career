# The people round the floor: everyone who isn't one of the ten. Three bodies, each the player's own
# (figure.py) in other clothes, each one skin on the puppet's bones as he is:
#   bench     a player off the floor: a long-sleeved warm-up top over his shorts
#   staff     a suit: a jacket with lapels over a shirt, its collar and a tie, trousers. Coaches and their
#             assistants, the scorer's table, security, and (in other colours) the photographers
#   official  a referee: a short-sleeved V-neck shirt with a dark collar and cuffs, long trousers, a whistle
# Each has the player's own head (figure.py's, with more of its triangles than a far-off man needs: the
# broadcast cuts to the bench and the coach) and, on it, what a player has painted on his: eyes between
# their lids, brows, lips, a beard. Here they are thin skins of their own just off his face, each a
# material the app colours by who he is (sideline.ts PARTS), placed by the same numbers figure.ts paints
# a player's face by, so a man on the bench has the face he has on the floor. So with hair: every way a
# player wears his (figure.py's pieces), a fuller crop, and hair to the jaw; the app shows the one he has.
#
# Each body is built twice: as above, for a man the camera is near, and again with about a sixth of the
# triangles (benchFar, staffFar, officialFar: the same parts on the same bones, so the app draws either),
# which is all a man across the floor from the broadcast camera shows, and what throws a walker's shadow
# and stands in the floor's mirror for him.
#
# Nothing here is posed. The app sits them down, stands them up and puts them at the table by their
# bones (sideline.ts bakes each pose once, when the court loads), and the ones who move are driven by
# the players' puppet.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: E402,F403
from figure import (  # noqa: E402
    AN_Y,
    ARM,
    BY_PLACE,
    CLOTH,
    FACE,
    FLOOR,
    FORK,
    G,
    HEAD_C,
    HEAD_D,
    HEAD_H,
    HEAD_W,
    HEM,
    HIP,
    KN_Y,
    ON_HEAD,
    SHOE,
    SHORTS,
    SKIN,
    SOCK_HI,
    SOCK_LO,
    TRIM_M,
    TUCK,
    WAIST,
    WHITE,
    arm_frame,
    copy,
    crop,
    cut,
    down_arm,
    ears,
    fingers,
    finish,
    fused,
    hair_line,
    hair_pieces,
    head,
    level,
    materials,
    on_head,
    push,
    relax,
    report,
    shoe,
    shorts_form,
    slots,
    solid,
    sstep,
    swell,
    tag,
    thin,
    volume,
)

# what the app colours by who he is (sideline.ts PARTS: the names are its own)
EYE, IRIS, BROW, LIP, BEARD, GOATEE, STRAP, HAIR_TOP, BOB = 'eye', 'iris', 'brow', 'lip', 'beard', 'goatee', 'strap', 'hairTop', 'bob'
WARM, TOP, LEGS, METAL, SUIT, LAPEL, SHIRT, TIE = 'warm', 'top', 'legs', 'metal', 'suit', 'lapel', 'shirt', 'tie'
# a sleeve ends this far down the arm: a warm-up's and a jacket's at the wrist, a referee's above the elbow
CUFF = ARM - 0.06
SLEEVE = 0.7
# a round neck: the cloth ends on a plane that tips down toward his front (how much lower, a foot forward)
NECK_TIP = 0.45
# the jacket opens in a V down his chest (steep, so it only cuts the front): how far above it a point is
VK, VM, VC = 2.3, 2.2, 5.26
# a referee's shirt has a shallower V than a player's vest
RK, RM, RC = 1.1, 0.5, 5.43


#: How much of its triangles everything built here keeps (1: the body for a camera close by; FAR: the far one).
DETAIL = 1.0
FAR = 0.17
_thin = thin


def thin(obj, tris):  # noqa: F811
    """figure.py's, to this many triangles at full detail: the far body keeps its share of them."""
    return _thin(obj, max(16, tris * DETAIL))


def far(obj, keep=1.0):
    """Something built at full detail (a face's patch, a finger, an ear): as it is, or the far body's share of it."""
    return obj if DETAIL >= 1 else _thin(obj, max(12, tri_count(obj) * DETAIL * keep))


def front(tree, x, y):
    """How far forward (z) a body's skin is at this height and this far across: the first of it met from in front."""
    hit = tree.ray_cast(B(x, y, 3.0), B(0, 0, -1))[0]
    return -hit.y if hit is not None else 0.0


def tree_of(obj):
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def cuffs(at):
    """A plane across each arm this far down it."""
    return [((arm_frame(s) @ Vector((0, -at, 0))).to_tuple(), (arm_frame(s).to_3x3() @ Vector((0, -1, 0))).to_tuple()) for s in (1, -1)]


def neck(p, c):
    """How far over a round neck's edge a point is (the edge at height c at his middle)."""
    return p[1] + NECK_TIP * p[2] - c


def neck_plane(c):
    return (0, c, 0), (0, 1, NECK_TIP)


def ref_vee(p):
    return (p[1] - RK * abs(p[0]) + RM * p[2] - RC) / math.sqrt(1 + RK * RK + RM * RM)


def ref_plane(s, off=0.0):
    return (0, RC + off * math.sqrt(1 + RK * RK + RM * RM), 0), (-s * RK, 1, RM)


def lapel(p):
    return p[1] - VK * abs(p[0]) + VM * p[2] - VC


# --- his face and his hair: skins of their own, just off his head ---

def patch(name, mat, to_n, f, us, vs, out, kind=FACE, fade=None):
    """
    A thin skin over part of his head: where f(u, v) is over 0, on a grid of (u, v) that `to_n` turns into
    directions from the head's middle, `out(u, v)` feet off his skin. The grid's cells are cut along
    f = 0, so its edge is a line however coarse the grid; `fade(u, v)` (0 to 1), if given, is how much of
    its colour each point shows over his skin's (`_FADE`: the app takes it the rest of the way to his skin;
    in the file it is the blue of its shade, see the build).
    """
    (u0, u1, nu), (v0, v1, nv) = us, vs
    verts, index, faces, seen = [], {}, [], {}

    def val(p):
        if p not in seen:
            seen[p] = f(*p)
        return seen[p]

    shows = []

    def vert(p):
        key = (round(p[0], 6), round(p[1], 6))
        if key not in index:
            index[key] = len(verts)
            verts.append(tuple(on_head(to_n(*p), out(*p) if callable(out) else out)))
            shows.append(fade(*p) if fade else 1.0)
        return index[key]

    def cross(a, b):
        # (f is no straight line between two points of the grid: the place it turns over is searched for)
        lo, hi = (a, b) if val(a) > 0 else (b, a)
        for _ in range(12):
            mid = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2)
            if f(*mid) > 0:
                lo = mid
            else:
                hi = mid
        return lo

    for i in range(nu):
        for j in range(nv):
            ua, ub = u0 + (u1 - u0) * i / nu, u0 + (u1 - u0) * (i + 1) / nu
            va, vb = v0 + (v1 - v0) * j / nv, v0 + (v1 - v0) * (j + 1) / nv
            c = [(ua, va), (ub, va), (ub, vb), (ua, vb)]
            for tri in ((c[0], c[1], c[2]), (c[0], c[2], c[3])):
                poly = []
                for k in range(3):
                    a, b = tri[k], tri[(k + 1) % 3]
                    if val(a) > 0:
                        poly.append(a)
                    if (val(a) > 0) != (val(b) > 0):
                        poly.append(cross(a, b))
                ids = []
                for p in poly:
                    k = vert(p)
                    if k not in ids:
                        ids.append(k)
                if len(ids) >= 3:
                    faces.append(ids)
    o = mesh_obj(name, verts, faces)
    if fade:
        o.data.attributes.new('_FADE', 'FLOAT', 'POINT').data.foreach_set('value', shows)
    set_material(o, material(mat))
    return tag(o, kind)


def on_face(px, py):
    """The direction a place on the plane of his face is in (figure.py's face_at, the other way round)."""
    return (px / 0.8, py / 0.8, 1.0)


def round_him(a, e):
    """The direction this far round him from his front, this far up (as figure.py's head lays its points out)."""
    return (math.cos(e) * math.sin(a) / HEAD_W, math.sin(e) / HEAD_H, math.cos(e) * math.cos(a) / HEAD_D)


def unit(n):
    ln = math.sqrt(sum(v * v for v in n))
    return tuple(v / ln for v in n)


def bump(x, y, ax, ay, sx, sy):
    return math.exp(-(((x - ax) / sx) ** 2 + ((y - ay) / sy) ** 2))


# his eyes, brows and mouth, as figure.ts paints a player's (headPainter: the numbers are its own)
EYE_X, EYE_Y, EYE_W = 0.38, 0.066, 0.152
MOUTH_W, MOUTH_Y = 0.3, -0.52


def lids(px, py):
    """
    An eye, from its middle: how far across and up a point is, and where the upper and the lower lid are there (a
    player's, figure.ts's EYE_OPEN: his upper lid over the top of his iris, as a man's is, not a stare).
    """
    ex, ey = abs(px) - EYE_X, py - EYE_Y
    k = max(0.0, 1 - min(1.0, abs(ex) / EYE_W) ** 2)
    tilt = 0.01 * ex / EYE_W
    return ex, ey, tilt + 0.042 * k ** 0.55, tilt - 0.037 * k ** 0.8


def eye_open(px, py):
    ex, ey, up, low = lids(px, py)
    return min(up - ey, ey - low, EYE_W - abs(ex))


def eye_iris(px, py, r=1.0):
    ex, ey, _, _ = lids(px, py)
    return min(eye_open(px, py), (r - math.hypot(ex / 0.06, (ey - 0.01) / 0.043)) * 0.05)


def eye_lash(px, py):
    ex, ey, up, _ = lids(px, py)
    return min(0.013 - abs(ey - up - 0.006), EYE_W + 0.012 - abs(ex))


def brow(px, py, heavy=0.6):
    q = (abs(px) - 0.15) / 0.52
    yb = 0.2 + 0.07 * math.sin(min(1.0, max(0.0, q) * 1.15) * math.pi * 0.62) - 0.035 * sstep(0.7, 1, q)
    thick = (0.02 + 0.022 * heavy) * (1 - 0.55 * q * q) + 0.004
    return min(thick * 0.85 - abs(py - yb), q * 0.5 + 0.01, (1.02 - q) * 0.5)


def lips(px, py):
    t = min(1.0, abs(px) / MOUTH_W)
    up = MOUTH_Y + 0.058 * (1 - t * t) ** 0.6 * (1 - 0.2 * math.exp(-((t / 0.14) ** 2)))
    low = MOUTH_Y - 0.082 * (1 - t * t) ** 0.8
    return min(up - py, py - low, MOUTH_W - abs(px))


def mouth_line(px, py):
    t = min(1.0, abs(px) / MOUTH_W)
    return min(0.008 - abs(py - MOUTH_Y + 0.012 * t * t), MOUTH_W - 0.015 - abs(px))


def whiskers(n):
    """
    Where a beard grows (figure.ts's): round his mouth (over the lip, down beside it, his chin), his jaw and cheeks, and
    a strap's trimmed band (down from his sideburn to the corner of his jaw, along it and round his chin); each 0..1.
    """
    nx, ny, nz = unit(n)
    ax = abs(nx)
    fz = max(nz, 0.3)
    px, py = nx / fz * 0.8, ny / fz * 0.8
    apx = abs(px)
    front_ = 1.0 if nz > 0.3 else 0.0
    mouth = front_ * sstep(0.3, 0.26, apx) * sstep(-0.617, -0.602, py) * sstep(-0.447, -0.462, py)
    tache = front_ * sstep(-0.34, -0.375, py) * sstep(-0.53, -0.47, py) * sstep(0.36, 0.3, apx) * (1 - 0.7 * bump(px, py, 0, -0.39, 0.035, 0.03))
    bars = front_ * sstep(0.2, 0.26, apx) * sstep(0.4, 0.34, apx) * sstep(-0.47, -0.53, py) * sstep(-0.95, -0.8, py)
    chin = sstep(-0.635, -0.695, py) * sstep(0.42, 0.34, apx) * front_ * sstep(-1.25, -1.0, py)
    round_ = max(tache, bars, chin) * (1 - mouth)
    cheek = sstep(0.05, -0.09, ny + 0.52 - 0.62 * (ax - 0.3) - 0.5 * (ax - 0.3) ** 2) * sstep(-0.99, -0.9, ny) * sstep(-0.1, 0.06, nz) * (1 - mouth)
    jaw = max(0.25 * ax - ny - 0.4 * nz - 0.83, -ny + 0.12 * nz - 1.137)
    ramus = sstep(0.14, 0.09, nz + 0.06 * (ny + 0.3)) * sstep(0.62, 0.74, ax) * sstep(0.32, 0.18, ny)
    strap = max(sstep(-0.27, -0.21, jaw - 0.12 * sstep(0.5, 0.1, ax)), ramus) * sstep(-0.99, -0.9, ny) * sstep(-0.12, -0.05, nz) * (1 - mouth)
    return round_, cheek, strap


def face():
    """What a player has painted on his head: the whites of his eyes between their lids, an iris and a pupil in each, lashes, brows, lips and the line between them."""
    eyes = ((-0.56, 0.56, 56), (-0.01, 0.15, 10))
    return [
        patch('eyeWhite', WHITE, on_face, eye_open, *eyes, 0.004),
        patch('iris', IRIS, on_face, eye_iris, *eyes, 0.006),
        patch('pupil', EYE, on_face, lambda x, y: eye_iris(x, y, 0.46), (-0.47, 0.47, 94), (0.03, 0.12, 9), 0.008),
        patch('lash', EYE, on_face, eye_lash, (-0.56, 0.56, 56), (0.04, 0.16, 10), 0.008),
        patch('brow', BROW, on_face, brow, (-0.7, 0.7, 56), (0.14, 0.34, 10), 0.006),
        patch('lips', LIP, on_face, lips, (-0.3, 0.3, 20), (-0.62, -0.44, 9), 0.004),
        patch('mouth', EYE, on_face, mouth_line, (-0.3, 0.3, 20), (-0.56, -0.5, 6), 0.007),
    ]


#: Where a beard's skin stops (how thick its hair has grown: whiskers' 0..1, taken over BEARD_EDGE round each place),
#: and where it shows all its colour: between them it thins out to his skin over a wide edge (figure.ts's beards do the
#: same), never a line round it. BEARD_EDGE is in radians round and up his head (a tenth is about a third of an inch).
BEARD_CUT = 0.14
BEARD_FULL = 0.97
BEARD_EDGE = 0.14


def thinned(w):
    """How thick a beard has grown at a place (`w` of round_him's angles), taken over a square BEARD_EDGE to each side of it: its edge a slope."""
    steps = [BEARD_EDGE * (k / 2 - 1) for k in range(5)]
    return lambda a, e: sum(w(a + da, e + de) for da in steps for de in steps) / 25


def beards():
    """His beard, three skins: all of his jaw (cheeks, chin, round his mouth), a goatee (round his mouth only), a strap (along his jaw). The app shows one of them, or none."""
    full_w = thinned(lambda a, e: max(whiskers(round_him(a, e))[:2]))
    goat_w = thinned(lambda a, e: whiskers(round_him(a, e))[0])
    full = lambda a, e: full_w(a, e) - BEARD_CUT  # noqa: E731
    goat = lambda a, e: goat_w(a, e) - BEARD_CUT  # noqa: E731
    strap_w = thinned(lambda a, e: whiskers(round_him(a, e))[2])
    strap = lambda a, e: strap_w(a, e) - BEARD_CUT  # noqa: E731
    # (its colour comes in over the whole of that slope, a cell or three of the grid wide, slowest at its edge: one cell
    # from nothing to all of it is a plate's edge again, however soft its colour)
    thin = lambda w: (lambda a, e: sstep(BEARD_CUT, BEARD_FULL, w(a, e)) ** 1.4)  # noqa: E731
    # (it lies closer at its edge than in its middle, its edge all but on his skin: no step up onto it)
    deep = lambda f, most: (lambda a, e: 0.0015 + most * sstep(0.0, 0.6, f(a, e)))  # noqa: E731
    return [
        patch('beard', BEARD, round_him, full, (-1.9, 1.9, 44), (-1.5, 0.2, 22), deep(full, 0.012), fade=thin(full_w)),
        patch('goatee', GOATEE, round_him, goat, (-0.75, 0.75, 30), (-1.4, -0.3, 26), deep(goat, 0.01), fade=thin(goat_w)),
        # (a strap is a narrow band: a coarser skin than a full beard's does, and its edge fades all the same)
        patch('strap', STRAP, round_him, strap, (-1.9, 1.9, 30), (-1.5, 0.2, 14), deep(strap, 0.006), fade=thin(strap_w)),
    ]


def bob():
    """Hair to the jaw: over the crown from the hairline, down the sides and the back of the head as far as the chin, turned in a little at its ends."""
    cols, rows = 40, 12
    verts, faces = [], []
    for i in range(rows + 1):
        u = i / rows
        for j in range(cols):
            phi = -math.pi + 2 * math.pi * j / cols
            side = sstep(0.45, 1.05, abs(phi))
            # (in front it stops at his hairline; from the temples round the back it hangs)
            low = (hair_line(abs(phi)) - 0.02) * (1 - side) - 1.02 * side
            y = 0.99 + (low - 0.99) * u
            yy = max(y, -0.3)
            r = math.sqrt(max(0.0, 1 - yy * yy))
            # (rolled in to his scalp at the hairline in front)
            edge = 1 - (1 - side) * (1 - math.sqrt(1 - (1 - min(1.0, (1 - u) / 0.22)) ** 2))
            lift = 0.036 + 0.02 * sstep(0.2, 0.8, yy) + 0.012 * side
            p = on_head((r * math.sin(phi), yy, r * math.cos(phi)), -0.01 + (lift + 0.01) * edge)
            if y < -0.3:
                # (below his ears it hangs straight, and turns in under his jaw)
                p.y += (y + 0.3) * HEAD_H
                k = 1 - 0.16 * sstep(-0.62, -1.02, y)
                p.x, p.z = p.x * k, HEAD_C[2] + (p.z - HEAD_C[2]) * k
            verts.append(tuple(p))
    apex = len(verts)
    verts.append(tuple(on_head((0, 1, 0), 0.056)))
    for i in range(rows):
        for j in range(cols):
            k = (j + 1) % cols
            faces.append((i * cols + j, (i + 1) * cols + j, (i + 1) * cols + k, i * cols + k))
    for j in range(cols):
        faces.append((j, (j + 1) % cols, apex))
    o = mesh_obj('bob', verts, faces)
    set_material(o, material(BOB))
    return tag(o, ON_HEAD)


def hairs(keep=0.4):
    """Every way he may wear his hair, each a material of its own: the players' pieces (lighter: seen from further off), a fuller crop, hair to the jaw."""
    out = []
    for o in hair_pieces():
        out.append(thin(o, max(120, tri_count(o) * keep)))
    top = volume(HAIR_TOP, lambda n: 0.012 + 0.05 * sstep(0.3, 0.7, n[1]) + 0.025 * sstep(0.35, 0.9, n[2]) * sstep(0.5, 0.7, n[1]), cols=36, rows=9)
    set_material(top, material(HAIR_TOP))
    return [*out, far(tag(top, ON_HEAD)), far(bob())]


def head_bits(tris=2600):
    """His head (its scalp his cropped hair), his ears, his face, his beard and his hair."""
    h = head(1.0)
    # (thinned as figure.py thins it: his face keeps more of its triangles than its size gives it)
    mid = (0, HEAD_C[1] - 0.08, HEAD_C[2] + 0.3)
    swell(h, mid, 0.3, 2.6)
    thin(h, tris)
    swell(h, mid, 0.3, 2.6, back=True)
    # (the far body's eyes, brows and lips keep more than their share: a dot each is what is left of them)
    return [crop(tag(h, FACE)), *[far(o) for o in ears()], *[far(o, 1.6) for o in face()], *[far(o) for o in beards()], *hairs()]


# --- what they wear ---

def lighter(built, keep=0.4):
    """The same people with lighter shoes: a sneaker built for a close-up is most of a far-off man's triangles."""
    for o in built:
        if o.name.startswith(('shoe', 'sole')):
            thin(o, max(40, tri_count(o) * keep))
    return built


def skin_of(mid, tris, planes, keep):
    """The skin that shows: cut from the body first, then thinned, so what little shows keeps its shape."""
    body = cut(copy(mid, 'body'), planes, keep)
    thin(body, tris)
    set_material(body, material(SKIN))
    return tag(body, BY_PLACE)


def trousers(tris, mat):
    """Long trousers (the suit's: the shorts' seat, a straight leg each down to the shoe, a crease of cloth at the ankle)."""
    t = shorts_form(
        [(AN_Y - 0.1, 0.4, 0.21, 0.25, 0.25), (AN_Y + 0.12, 0.4, 0.21, 0.245, 0.25), (KN_Y - 0.5, 0.4, 0.235, 0.265, 0.3), (KN_Y, 0.405, 0.265, 0.31, 0.31), (FORK - 0.12, 0.415, 0.34, 0.395, 0.415)],
        folds=0.007,
    )
    thin(t, tris)
    cut(t, [level(AN_Y + 0.02), level(WAIST)], lambda p: AN_Y + 0.02 < p[1] < WAIST and abs(p[0]) < 1.2)
    set_material(t, material(mat))
    return tag(t, BY_PLACE)


def dark_shoes(keep=0.5):
    out = []
    for s in (1, -1):
        for part in shoe(s):
            set_material(part, material(SHOE))
            out.append(part)
    return lighter(out, keep)


def dress_bench(hi):
    """Off the floor: a long-sleeved warm-up top (a band round its neck and its cuffs) tucked into his shorts, socks, sneakers."""
    mid = thin(copy(hi, 'mid'), 44000)
    bpy.data.objects.remove(hi)
    c = 5.66
    body = skin_of(
        mid,
        2000,
        [level(5.28), *cuffs(CUFF - 0.08), level(HEM + 0.3), level(SOCK_HI - 0.06)],
        lambda p: (p[1] > 5.28 and abs(p[0]) < 0.95 and down_arm(p) < 0.55) or down_arm(p) > CUFF - 0.08 or (SOCK_HI - 0.06 < p[1] < HEM + 0.3 and abs(p[0]) < 1.2),
    )

    top = copy(mid, 'top')
    # (it hangs off him a little, more over his waist)
    push(top, lambda p: 0.032 + 0.03 * sstep(WAIST + 0.1, WAIST + 0.5, p[1]) * sstep(5.0, 4.4, p[1]) * (1 if down_arm(p) < 0.3 else 0))
    relax(top, 12)
    push(top, lambda p: 0.012)
    thin(top, 3400)
    relax(top, 1)
    band = 0.1
    cut(
        top,
        [level(TUCK), *cuffs(CUFF), *cuffs(CUFF - band), neck_plane(c), neck_plane(c - band)],
        lambda p: TUCK < p[1] and neck(p, c) < 0 and (down_arm(p) < CUFF or abs(p[0]) < 0.9),
    )
    slots(top, [WARM, TRIM_M], lambda p: TRIM_M if neck(p, c) > -band or down_arm(p) > CUFF - band else WARM)

    shorts = shorts_form()
    thin(shorts, 1500)
    cut(shorts, [level(HEM), level(WAIST), level(HEM + 0.085)], lambda p: HEM < p[1] < WAIST and abs(p[0]) < 1.2)
    slots(shorts, [CLOTH, TRIM_M], lambda p: TRIM_M if p[1] < HEM + 0.085 else CLOTH)
    tag(shorts, SHORTS)

    socks = mid
    push(socks, lambda p: 0.009 + 0.013 * sstep(SOCK_HI - 0.16, SOCK_HI - 0.1, p[1]))
    thin(socks, 600)
    cut(socks, [level(SOCK_LO), level(SOCK_HI)], lambda p: SOCK_LO < p[1] < SOCK_HI)
    set_material(socks, material(WHITE))

    for o in (top, socks):
        tag(o, BY_PLACE)
    built = [body, top, shorts, socks, *head_bits()]
    for s in (1, -1):
        built += [far(o, 1.4) for o in fingers(s)] + lighter(shoe(s))
    return built


def dress_official(hi):
    """A referee: a short-sleeved shirt with a V neck (its collar and its sleeves' ends dark), long trousers, dark shoes, a whistle on a cord."""
    mid = thin(copy(hi, 'mid'), 44000)
    bpy.data.objects.remove(hi)
    chest = front(tree_of(mid), 0, 4.95)
    under = 0.1
    body = skin_of(
        mid,
        2600,
        [ref_plane(1, -under), ref_plane(-1, -under), *cuffs(SLEEVE - 0.1)],
        lambda p: (ref_vee(p) > -under and p[1] > 5.0 and abs(p[0]) < 0.75 and down_arm(p) < 0.4) or down_arm(p) > SLEEVE - 0.1,
    )

    shirt = copy(mid, 'shirt')
    push(shirt, lambda p: 0.03 + 0.022 * sstep(WAIST + 0.1, WAIST + 0.5, p[1]) * sstep(5.0, 4.4, p[1]) * (1 if down_arm(p) < 0.3 else 0))
    relax(shirt, 10)
    push(shirt, lambda p: 0.01)
    thin(shirt, 3400)
    relax(shirt, 1)
    band = 0.07
    cut(
        shirt,
        [level(TUCK), *cuffs(SLEEVE), *cuffs(SLEEVE - 0.09), ref_plane(1), ref_plane(-1), ref_plane(1, -band), ref_plane(-1, -band)],
        lambda p: TUCK < p[1] < 5.75 and ref_vee(p) <= 0 and (down_arm(p) < SLEEVE or (abs(p[0]) < 0.9 and down_arm(p) == 0)),
    )
    dark = lambda p: ref_vee(p) > -band or down_arm(p) > SLEEVE - 0.09  # noqa: E731
    slots(shirt, [TOP, TRIM_M], lambda p: TRIM_M if dark(p) else TOP)

    # (his whistle, on a cord round his neck)
    whistle = box((0, 4.78, chest + 0.05), (0.1, 0.06, 0.055), 'whistle')
    set_material(whistle, material(METAL))
    cord = []
    for s in (1, -1):
        rings = []
        for k in range(7):
            t = k / 6
            x, y = s * (0.02 + 0.3 * t ** 1.3), 4.8 + 0.72 * t
            z = front(tree_of(shirt), x, y) if k else chest + 0.03
            rings.append([(x + dx, y + dy, max(z, 0.05) + 0.022 + dz) for dx, dy, dz in ((-0.011, 0, 0), (0, 0, 0.011), (0.011, 0, 0), (0, 0, -0.011))])
        c = solid(rings, 'cord')
        set_material(c, material(TRIM_M))
        cord.append(c)

    bpy.data.objects.remove(mid)
    for o in (shirt, whistle, *cord):
        tag(o, BY_PLACE)
    built = [body, shirt, trousers(2200, LEGS), whistle, *cord, *head_bits()]
    for s in (1, -1):
        built += [far(o, 1.4) for o in fingers(s)]
    return built + dark_shoes()


def strip(rows, name, mat):
    """A band of cloth through these rows of points (each row the same count)."""
    n = len(rows[0])
    verts = [p for r in rows for p in r]
    faces = [(i * n + j, i * n + j + 1, (i + 1) * n + j + 1, (i + 1) * n + j) for i in range(len(rows) - 1) for j in range(n - 1)]
    o = mesh_obj(name, verts, faces)
    set_material(o, material(mat))
    return tag(o, BY_PLACE)


def dress_staff(hi):
    """
    A suit: a jacket (its lapels a flap of their own down each side of the V it opens in, two buttons) over a
    shirt (a collar with its points, a cuff past each sleeve's end) and a tie; trousers a material of their own,
    so a jacket and trousers can differ; dark shoes. Only his head and hands show.
    """
    mid = thin(copy(hi, 'mid'), 44000)
    bpy.data.objects.remove(hi)
    body = skin_of(mid, 1500, [level(5.46), *cuffs(CUFF - 0.08)], lambda p: (p[1] > 5.46 and abs(p[0]) < 0.6) or down_arm(p) > CUFF - 0.08)

    # the shirt: what shows of it in the jacket's V, and a cuff at each wrist
    shirt = copy(mid, 'shirt')
    push(shirt, lambda p: 0.02 + 0.012 * sstep(CUFF - 0.2, CUFF - 0.1, down_arm(p)))
    cut(
        shirt,
        [level(5.58), level(4.05), *cuffs(CUFF - 0.1), *cuffs(CUFF + 0.05)],
        lambda p: (4.05 < p[1] < 5.58 and abs(p[0]) < 0.5 and p[2] > 0 and down_arm(p) < 0.3) or CUFF - 0.1 < down_arm(p) < CUFF + 0.05,
    )
    # (little of it shows: cut out first, then thinned, so that little keeps its shape)
    thin(shirt, 900)
    set_material(shirt, material(SHIRT))
    # its collar: a band round his neck, a leaf each side of the knot down to its point on his chest
    under = tree_of(shirt)
    rows = []
    for f in (0, 0.5, 1):
        row = []
        for k in range(41):
            th = -math.pi + 2 * math.pi * k / 40
            a = abs(th)
            # (how far down it comes: a hand's breadth round the back, each leaf's point a little out from the knot)
            deep = 0.12 + 0.2 * max(0.0, 1 - abs(a - 0.5) / 0.45) - 0.05 * max(0.0, 1 - a / 0.12)
            x = math.sin(th) * (0.3 + 0.035 * f)
            z = math.cos(th) * ((0.25 if a < math.pi / 2 else 0.29) + 0.035 * f)
            y = 5.73 - NECK_TIP * z - deep * f
            if a < 1.2:
                z = max(z, front(under, x, y) + 0.02 + 0.012 * f)
            row.append((x, y, z))
        rows.append(row)
    collar = strip(rows, 'collar', SHIRT)

    # the jacket: looser than he is, open in a V, down past his hips
    jacket = copy(mid, 'jacket')
    # (well off him: smoothing draws cloth in, and the shirt must never come through it)
    push(jacket, lambda p: 0.1 + 0.08 * sstep(3.9, 3.3, p[1]) * (1 if down_arm(p) < 0.5 else 0))
    # (pushed out, it runs through itself under the arms: one skin is made of it again)
    jacket = apply_modifier(jacket, 'REMESH', mode='VOXEL', voxel_size=0.03, adaptivity=0.0, use_smooth_shade=True)
    relax(jacket, 8)
    thin(jacket, 6400)
    relax(jacket, 1)
    cloth = tree_of(jacket)
    hem = HIP - 0.42
    top_ = 5.74
    cut(
        jacket,
        [level(hem), *cuffs(CUFF), ((0, VC, 0), (VK, 1, VM)), ((0, VC, 0), (-VK, 1, VM)), neck_plane(top_)],
        lambda p: lapel(p) <= 0 and hem < p[1] and neck(p, top_) < 0 and (down_arm(p) < CUFF or abs(p[0]) < 0.9),
    )
    set_material(jacket, material(SUIT))

    def edge(y):
        """Where the V's edge is at this height (how far out from his middle), on the jacket."""
        x = 0.2
        for _ in range(8):
            x = max(0.0, (y + VM * front(cloth, x, y) - VC) / VK)
        return x

    # its lapels: a flap lying on the jacket outside each edge of the V
    flaps = []
    for s in (1, -1):
        rows = []
        for k in range(13):
            y = 5.44 + (4.32 - 5.44) * k / 12
            # (narrow by his neck, widest at its peak on his chest, down to nothing at the button)
            w = 0.05 + 0.13 * sstep(5.44, 5.14, y) if y > 5.14 else 0.015 + 0.165 * (y - 4.32) / (5.14 - 4.32)
            x = edge(y)
            rows.append([(s * (x + w * q), y, front(cloth, s * (x + w * q), y) + 0.012 + 0.02 * q) for q in (0, 0.5, 1)])
        flaps.append(strip(rows, 'lapel', LAPEL))
    buttons = []
    for y in (4.08, 3.74):
        b = ellipsoid((0.015, y, front(cloth, 0.015, y) + 0.008), (0.03, 0.03, 0.014), 8, 5, 'button')
        set_material(b, material(LAPEL))
        buttons.append(tag(b, BY_PLACE))

    # his tie: a knot under the collar, a blade down his shirt into the jacket
    rings = []
    # (a ring every couple of inches down the blade: it lies on his chest, which is no straight line)
    blade = [(5.36 - 0.07 * k, 0.04 + 0.054 * k / 16) for k in range(17)]
    for y, w in ((5.5, 0.03), (5.47, 0.058), (5.4, 0.046), *blade):
        z = max(front(under, 0, y), front(under, 0.05, y), front(under, -0.05, y)) + (0.05 if y > 5.38 else 0.024)
        rings.append([(-w, y, z - 0.014), (-w, y, z), (w, y, z), (w, y, z - 0.014)])
    tie = solid(rings, 'tie')
    set_material(tie, material(TIE))

    bpy.data.objects.remove(mid)
    for o in (shirt, collar, jacket, tie):
        tag(o, BY_PLACE)
    built = [body, shirt, collar, jacket, *flaps, *buttons, tie, trousers(2300, LEGS), *head_bits()]
    for s in (1, -1):
        built += [far(o, 1.4) for o in fingers(s, 6)]
    return built + dark_shoes()


def without(fig, names):
    """The same figure with these materials' faces gone (for a look at him: he wears one head of hair, not all of them)."""
    bm = bmesh.new()
    bm.from_mesh(fig.data)
    gone = {i for i, m in enumerate(fig.data.materials) if m.name in names}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in gone], context='FACES')
    bm.to_mesh(fig.data)
    bm.free()
    fig.data.update()


def face_hollows(x, y, z):
    """
    The shade figure.ts paints into a player's face and his head here has no picture for: the socket deepest up
    beside the nose and the thin skin under each eye, the sides of the nose, under its tip and its nostrils, the groove
    under the lower lip. A little of each (a face is small: see finish), so a man on the bench has the player's face.
    """
    px, py, pz = x / HEAD_W, (y - HEAD_C[1]) / HEAD_H, z - HEAD_C[2]
    if pz < 0.15 * HEAD_D or abs(py) > 1.0:
        return 1.0
    ax = abs(px)
    c = 1.0 - 0.09 * bump(ax, py, 0.22, 0.15, 0.08, 0.07) - 0.05 * bump(ax, py, 0.34, -0.05, 0.13, 0.04)
    c -= 0.05 * bump(ax, py, 0.125, -0.08, 0.04, 0.16) + 0.08 * bump(ax, py, 0.0, -0.36, 0.13, 0.03) + 0.06 * bump(ax, py, 0.075, -0.335, 0.03, 0.012)
    c -= 0.06 * bump(ax, py, 0.0, -0.68, 0.17, 0.04)
    return c


def one_head(figs):
    """
    Every body here has the same head, face, beards and hair, built by the same steps: all that differs is
    the baked shade, by a hair (a collar under one jaw, a jacket under another). Given the first body's
    shade, those parts are the same numbers in each, and the file keeps them once (run.ts pack).
    """
    heads = {'hair', 'white', EYE, IRIS, BROW, LIP, BEARD, GOATEE, STRAP, HAIR_TOP, BOB, 'bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'}
    key = lambda v: (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))  # noqa: E731
    shade = None
    for fig in figs:
        me = fig.data
        slots = {i for i, m in enumerate(me.materials) if m.name in heads}
        on = {vi for f in me.polygons if f.material_index in slots for vi in f.vertices}
        col = me.color_attributes['Col']
        if shade is None:
            shade = {key(me.vertices[vi]): tuple(col.data[vi].color) for vi in on}
            continue
        for vi in on:
            c = shade.get(key(me.vertices[vi]))
            if c is not None:
                col.data[vi].color = c


if __name__ == '__main__':
    a = args()
    reset()
    materials()
    for name, color in ((EYE, (0.02, 0.015, 0.012)), (IRIS, (0.1, 0.06, 0.03)), (BROW, (0.05, 0.04, 0.035)), (LIP, (0.3, 0.14, 0.12))):
        material(name, color, 0.7)
    for name in (BEARD, GOATEE, STRAP, HAIR_TOP, BOB):
        material(name, (0.05, 0.04, 0.035), 0.8)
    for name, color in ((WARM, (0.08, 0.1, 0.2)), (TOP, (0.3, 0.3, 0.32)), (LEGS, (0.02, 0.02, 0.025)), (METAL, (0.5, 0.5, 0.52)), (LAPEL, (0.015, 0.016, 0.02))):
        material(name, color, 0.75)

    hi = fused()
    people = []
    for detail, suffix in ((1.0, ''), (FAR, 'Far')):
        DETAIL = detail
        for name, dress in (('bench', dress_bench), ('staff', dress_staff), ('official', dress_official)):
            fig, rig_ob = finish(dress(copy(hi, 'hi2')), name + suffix)
            paint(fig, face_hollows)
            rig_ob.name = name + suffix + 'Rig'
            report(fig)
            people += [fig, rig_ob]
        one_head(people[-6::2])
    bpy.data.objects.remove(hi)
    # (how much of a beard's colour shows over his skin, `_FADE` (see beards), goes in its shade's blue: the shade
    # is a grey, and the file has no other list to spend on it; sideline.ts reads it back out)
    for fig in people[0::2]:
        me = fig.data
        fade = me.attributes.get('_FADE')
        if fade is None:
            continue
        slots = {i for i, m in enumerate(me.materials) if m.name in (BEARD, GOATEE, STRAP)}
        col = me.color_attributes['Col']
        for vi in {vi for f in me.polygons if f.material_index in slots for vi in f.vertices}:
            c = col.data[vi].color
            col.data[vi].color = (c[0], c[1], fade.data[vi].value, c[3])
        me.attributes.remove(fade)
    export_glb(os.path.join(a['out'], 'people.glb'), people)
    save_blend(os.path.join(a['blend'], 'people.blend'))
    if 'preview' in a:
        # (each as one of the people he may be: a man with curls and a beard, a woman with her hair to her jaw, a man with a crop and a goatee)
        every = {BEARD, GOATEE, STRAP, HAIR_TOP, BOB, 'bun', 'tail', 'twists', 'locs', 'braids', 'afro', 'hightop', 'curls'}
        for fig, wears in zip(people[0::2], ({BEARD, 'curls'}, {BOB}, {GOATEE, HAIR_TOP}) * 2):
            without(fig, every - wears)
        # (the far bodies stand behind the near ones: the first three looks have them small, as they are seen)
        for i, o in enumerate(people[1::2]):
            o.location = B((i % 3 - 1) * 3.4 + (1.7 if i > 2 else 0), -FLOOR, -9 if i > 2 else 0)
        y = 5.95 - FLOOR
        preview(
            os.path.join(a['preview'], 'people.png'),
            [
                ((0, 4.5, 30), (0, 3.4, 0), 12),
                ((20, 6, 20), (0, 3.4, 0), 12),
                ((-12, 5, -26), (0, 3.4, 0), 12),
                ((-3.4, y + 0.2, 10), (-3.4, y, 0), 1.9),
                ((0, y + 0.2, 10), (0, y, 0), 1.9),
                ((3.4, y + 0.2, 10), (3.4, y, 0), 1.9),
                ((-9, y + 0.3, 5), (-3.4, y, 0), 1.9),
                ((5, y + 0.3, 6), (0, y, 0), 1.9),
                ((9, y + 0.3, 4), (3.4, y, 0), 1.9),
                ((-3.4, 5.6, 10), (-3.4, 4.3, 0), 3.2),
                ((0.6, 5.6, 10), (0, 4.5, 0), 3.2),
                ((3.4, 5.6, 10), (3.4, 4.3, 0), 3.2),
            ],
            size=(560, 520),
            ground=0,
            sheet_cols=3,
        )
