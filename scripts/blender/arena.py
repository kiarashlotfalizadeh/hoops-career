# The building's props, as models: the basket unit (hoop), its rim and net, a bench chair, the scorer's
# table, the ball, the centre-hung scoreboard and the one spectator the crowd is made of (fan). One .glb,
# a thing each, all at the origin of their own frame (see each builder). Feet, the game's frame (x, y up,
# z). Every thing carries its shade ("Col").
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

pi, sin, cos, rad = math.pi, math.sin, math.cos, math.radians

#: How far the plate the rim bolts to stands off the board's face.
PLATE = 0.055
#: The board's face (in the hoop's frame: the rim is over the origin).
FACE = -1.25
#: How far a painted line or a screen stands off what it lies on: less and the two flicker at a distance.
PROUD = 0.026
#: The spectator's joints, which the crowd's shader knows too (CROWD_MOVE in court3d/arena.ts: change both).
#: An arm swings about its shoulder (x to either side, y; z = 0) and lies FAN_REST radians forward of
#: hanging while he sits. A thigh is FAN_THIGH long, back from the knee (y, z), and swings up about it.
FAN_SHOULDER = (0.69, 1.55)
FAN_REST = 0.6
FAN_KNEE = (0.2, 1.2)
FAN_THIGH = 1.2


# --- shapes this file needs that lib.py doesn't have (all in the game's frame) ---

def slab(x0, x1, y0, y1, z0, z1, name='slab'):
    """A box by its sides."""
    return box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), name)


def prism(outline, z0, z1, name='prism'):
    """A side view's outline ((x, y) points) pushed across from z0 to z1."""
    n = len(outline)
    verts = [(x, y, z0) for x, y in outline] + [(x, y, z1) for x, y in outline]
    faces = [(k, (k + 1) % n, (k + 1) % n + n, k + n) for k in range(n)]
    faces += [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    o = mesh_obj(name, verts, faces)
    fix_normals(o)
    return o


def rod(a, b, r, seg=6, name='rod', cap=True, r2=None, flat=1.0, up=(0, 1, 0)):
    """A straight bar from a to b: `seg` sides, `r` to its corners (`r2` at the far end); `flat` squashes it along `up`."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = Vector(up).cross(d)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    top = d.cross(side)
    turn = pi / seg
    rings = [[tuple(p + (side * cos(turn + 2 * pi * k / seg) + top * sin(turn + 2 * pi * k / seg) * flat) * rr) for k in range(seg)] for p, rr in ((a, r), (b, r2 or r))]
    o = loft(rings, name, cap=cap)
    if cap:
        fix_normals(o)
    return o


def beam(a, b, w, h, name='beam', cap=True, up=(0, 1, 0)):
    """A square-cornered bar from a to b, `w` across and `h` deep."""
    return rod(a, b, math.hypot(w, w) / 2, 4, name, cap, flat=h / w, up=up)


def hoop_loft(rings, name='loop'):
    """A skin over rings of points that comes back round to the first ring (a torus, a band)."""
    n, m = len(rings[0]), len(rings)
    verts = [p for r in rings for p in r]
    faces = [(i * n + k, i * n + (k + 1) % n, ((i + 1) % m) * n + (k + 1) % n, ((i + 1) % m) * n + k) for i in range(m) for k in range(n)]
    o = mesh_obj(name, verts, faces)
    fix_normals(o)
    return o


def sheet(corners, name='sheet'):
    """One flat face, seen from the side its corners go round anticlockwise."""
    return mesh_obj(name, corners, [tuple(range(len(corners)))])


def bevel(obj, width, seg=1):
    return apply_modifier(obj, 'BEVEL', width=width, segments=seg, limit_method='ANGLE', angle_limit=rad(30))


def of(obj, mat):
    set_material(obj, mat)
    return obj


def finish(pieces, name, angle=50, weigh=True):
    """The pieces as one thing, smooth where it bends gently; big flat faces stay flat next to a bevel."""
    o = join(pieces, name)
    smooth(o, angle)
    if weigh:
        apply_modifier(o, 'WEIGHTED_NORMAL', keep_sharp=True, weight=90)
    return o


def shade(obj, plain=(), **kw):
    """The thing's shade, baked; faces of the `plain` materials (glass, screens) keep none."""
    bake_occlusion(obj, **kw)
    me = obj.data
    names = [m.name for m in me.materials]
    col = me.color_attributes['Col']
    for p in me.polygons:
        if names[p.material_index] in plain:
            for v in p.vertices:
                col.data[v].color = (1, 1, 1, 1)


def see_through(mat, alpha):
    """In Blender's own renders the glass is glass (the app has its own material for it)."""
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Alpha'].default_value = alpha
    if hasattr(mat, 'surface_render_method'):
        mat.surface_render_method = 'BLENDED'
    return mat


# --- the basket unit: base, arm, braces, board, shot clock (no rim, no net) ---

def hoop():
    pad = material('pad', (0.035, 0.035, 0.04), 0.65)
    steel = material('steel', (0.07, 0.075, 0.085), 0.4)
    team = material('team', (0.55, 0.07, 0.09), 0.55)
    edge = material('edge', (0.92, 0.92, 0.92), 0.5)
    glass = see_through(material('glass', (0.8, 0.9, 0.95), 0.05, shade=False), 0.22)
    clock = material('clock', (0.03, 0.045, 0.07), 0.25, shade=False)
    out = []

    # the base: a padded unit on the floor behind the baseline, its front (toward the floor) the team's
    out.append(of(bevel(prism([(-14.3, 0.22), (-14.3, 2.3), (-13.5, 3.1), (-9.7, 3.1), (-8.5, 1.9), (-8.5, 0.22)], -1.7, 1.7), 0.12, 2), pad))
    out.append(of(slab(-14.15, -8.62, 0, 0.3, -1.58, 1.58), steel))
    out.append(of(bevel(prism([(-8.8, 0.3), (-8.28, 0.3), (-8.28, 1.992), (-9.544, 3.256), (-9.9, 2.9), (-8.8, 1.8)], -1.76, 1.76), 0.09, 2), team))
    # (a housing on its back, and the two handles it is wheeled away by)
    out.append(of(bevel(slab(-14.05, -12.7, 2.9, 3.55, -1.15, 1.15), 0.1, 1), steel))
    for s in (-1, 1):
        out.append(of(rod((-14.38, 1.05, s * 1.1), (-14.38, 1.95, s * 1.1), 0.045, 6), steel))

    # the arm: from inside the base up to the back of the board, along `d`; `n` is square to it (up and back)
    ox, oy = -10.75, 2.14
    dx, dy = 7.85, 6.95
    ln = math.hypot(dx, dy)
    dx, dy = dx / ln, dy / ln
    nx, ny = -dy, dx
    at = lambda s, t: (ox + dx * s + nx * t, oy + dy * s + ny * t)
    back = -2.15
    thick = 1.2
    s_low = (back - ox) / dx
    s_up = (back - ox - nx * thick) / dx
    out.append(of(bevel(prism([at(0, 0), at(s_low, 0), at(s_up, thick), at(0, thick)], -0.48, 0.48), 0.07, 1), pad))
    # (its pad: under and in front of it, where a player lands)
    out.append(of(bevel(prism([at(1.2, -0.24), at(9.7, -0.24), at(9.85, 0.52), at(1.2, 0.52)], -0.64, 0.64), 0.09, 2), team))
    # where the arm meets the board
    out.append(of(bevel(slab(back - 0.05, FACE - 0.08, 9.66, 11.46, -0.6, 0.6), 0.06, 1), steel))

    # the board: a sheet of glass, its white edge and square, a steel frame behind
    out.append(of(sheet([(FACE, 9.5, 3), (FACE, 9.5, -3), (FACE, 13, -3), (FACE, 13, 3)]), glass))
    f0, f1 = FACE - PROUD, FACE + PROUD
    line = 2 / 12
    for y0, y1, z0, z1 in ((13 - line, 13, -3, 3), (9.5, 9.5 + line, -3, 3), (9.5 + line, 13 - line, -3, -3 + line), (9.5 + line, 13 - line, 3 - line, 3)):
        out.append(of(slab(f0, f1, y0, y1, z0, z1), edge))
    for y0, y1, z0, z1 in ((11.5 - line, 11.5, -1, 1), (10, 10 + line, -1, 1), (10 + line, 11.5 - line, -1, -1 + line), (10 + line, 11.5 - line, 1 - line, 1)):
        out.append(of(slab(f0, f1, y0, y1, z0, z1), edge))
    b0, b1 = FACE - 2 * PROUD, FACE - 0.3
    for y0, y1, z0, z1 in ((12.7, 12.97, -2.97, 2.97), (9.53, 9.8, -2.97, 2.97), (9.8, 12.7, -2.97, -2.7), (9.8, 12.7, 2.7, 2.97)):
        out.append(of(slab(b1, b0, y0, y1, z0, z1), steel))
    # the plate the rim bolts to
    out.append(of(slab(FACE - 2 * PROUD + 0.004, FACE + PLATE, 9.62, 10.04, -0.3, 0.3), steel))
    # padding along the bottom edge and up the lower sides
    p0, p1 = FACE - 0.34, FACE + 0.085
    out.append(of(bevel(slab(p0, p1, 9.3, 9.62, -3.09, 3.09), 0.05, 2), pad))
    for s in (-1, 1):
        out.append(of(bevel(slab(p0, p1, 9.62, 10.78, s * 2.86, s * 3.09), 0.05, 2), pad))

    # braces: two from the top of the board's frame down to the arm, two from the arm out to the frame's sides
    for s in (-1, 1):
        a = at(6.4, thick - 0.05)
        out.append(of(beam((a[0], a[1], s * 0.32), (FACE - 0.18, 12.82, s * 1.9), 0.17, 0.17), steel))
        a = at(8.5, thick * 0.5)
        out.append(of(beam((a[0], a[1], s * 0.44), (FACE - 0.18, 10.9, s * 2.82), 0.15, 0.15), steel))

    # the shot clock over the board
    cx0, cx1 = FACE - 0.62, FACE - 0.14
    out.append(of(bevel(slab(cx0, cx1, 13.45, 15.0, -1.15, 1.15), 0.06, 1), steel))
    for s in (-1, 1):
        out.append(of(slab(FACE - 0.44, FACE - 0.32, 12.97, 13.47, s * 0.7 - 0.06, s * 0.7 + 0.06), steel))
    # (its two faces: one panel through the box, standing a little proud of it front and back)
    out.append(of(slab(cx0 - PROUD, cx1 + PROUD, 13.58, 14.87, -1.02, 1.02), clock))

    o = finish(out, 'hoop')
    # (the white on the glass is paint: it takes no shade from the frame behind it)
    shade(o, plain=('glass', 'clock', 'edge'), floor=0, reach=2.2, rays=64)
    return o


# --- the rim: the ring over the origin, the tie ring under it the net hangs from, and its mount back to the board ---

#: The thin ring under the rim that the net's loops go over: how far under, and its radius.
TIE_Y = -0.043
TIE_R = 0.752


def rim():
    iron = material('iron', (0.82, 0.2, 0.04), 0.45)
    R, r = 0.75, 0.034
    seg = 36

    def torus(R, r, y, around):
        return hoop_loft([[((R + r * cos(2 * pi * j / around)) * cos(2 * pi * i / seg), y + r * sin(2 * pi * j / around), (R + r * cos(2 * pi * j / around)) * sin(2 * pi * i / seg)) for j in range(around)] for i in range(seg)], 'ring')

    out = [torus(R, r, 0, 8), torus(TIE_R, 0.012, TIE_Y, 4)]
    x0 = FACE + PLATE
    # the mount: a plate against the board, and the box of the breakaway hinge out from it to the ring's back
    # (deep at the board, shallow under the ring)
    out.append(bevel(slab(x0, x0 + 0.035, -0.37, 0.03, -0.28, 0.28), 0.012))
    out.append(bevel(prism([(x0 + 0.03, 0.012), (-0.72, 0.012), (-0.72, -0.075), (-0.98, -0.25), (x0 + 0.03, -0.25)], -0.2, 0.2), 0.016))
    # two arms from the box round under the ring's sides: they carry it when someone hangs on the front
    for s in (-1, 1):
        a = pi - s * 0.95
        out.append(beam((-0.93, -0.15, s * 0.19), (R * cos(a), -0.03, R * sin(a)), 0.035, 0.06))
    o = finish([of(p, iron) for p in out], 'rim', 40, weigh=False)
    shade(o, reach=0.35, low=0.5)
    return o


# --- the net: twelve loops over the tie ring, a lattice of cord down to a narrower mouth ---

def net():
    cord = material('cord', (0.9, 0.9, 0.88), 0.8)
    N, K = 12, 5
    top, bottom, r0, r1 = TIE_Y, -1.35, TIE_R, 0.42
    # (a real cord is thinner: this is what still reads as a lattice from the sideline camera)
    thick = 0.017

    def node(k, m):
        t = k / K
        r = r1 + (r0 - r1) * (1 - t) ** 1.7
        a = 2 * pi * m / N
        return (r * cos(a), top + (bottom - top) * t, r * sin(a))

    segs = []
    loop = 0.085
    for m in range(N):
        a, b = node(0, m - loop), node(0, m + loop)
        segs += [(a, b), (a, node(1, m - 0.5)), (b, node(1, m + 0.5))]
    for k in range(1, K):
        off = 0.5 * (k % 2)
        for m in range(N):
            for s in (-0.5, 0.5):
                segs.append((node(k, m + off), node(k + 1, m + off + s)))
    out = []
    for a, b in segs:
        # (a cord's three sides: one of them faces out of the net)
        mid = (Vector(a) + Vector(b)) / 2
        out.append(of(rod(a, b, thick, 3, cap=False, up=(mid.x, 0, mid.z)), cord))
    o = join(out, 'net')
    smooth(o)
    # (cords this thin shade nothing: a little darker toward the mouth, where less light gets in)
    paint(o, lambda x, y, z: 1 - 0.2 * min(1.0, max(0.0, -y / 1.35)) ** 1.5)
    return o


# --- a bench chair: padded seat and back on a folding steel frame; faces +z, the floor under the seat's centre ---

def chair():
    seat = material('seat', (0.55, 0.07, 0.09), 0.6)
    steel = material('steel')
    out = [of(bevel(slab(-0.8, 0.8, 1.27, 1.5, -0.75, 0.75), 0.09, 2), seat)]
    back = bevel(slab(-0.8, 0.8, 0, 1.12, -0.1, 0.1), 0.09, 2)
    transform(back, Matrix.Translation((0, 1.86, -0.74)) @ Matrix.Rotation(rad(-10), 4, 'X'))
    out.append(of(back, seat))
    w = 0.075
    for s in (-1, 1):
        # the long leg: front foot to behind the seat's back edge and on up behind the back; the short one crosses inside it
        out.append(of(beam((s * 0.72, 0.035, 0.66), (s * 0.72, 1.245, -0.774), w, w), steel))
        out.append(of(beam((s * 0.72, 1.225, -0.77), (s * 0.72, 2.77, -1.043), w, w), steel))
        out.append(of(beam((s * 0.63, 0.035, -0.78), (s * 0.63, 1.26, 0.5), w, w), steel))
    out.append(of(beam((-0.72, 0.36, 0.26), (0.72, 0.36, 0.26), w * 0.8, w * 0.8, cap=False), steel))
    out.append(of(beam((-0.63, 0.36, -0.43), (0.63, 0.36, -0.43), w * 0.8, w * 0.8, cap=False), steel))
    o = finish(out, 'chair')
    shade(o, floor=0, reach=1.2, low=0.5)
    return o


# --- the scorer's table: 34 ft along x, faces +z; its front is one flat LED face with a UV map ---

def table():
    dark = material('dark', (0.03, 0.03, 0.035), 0.6)
    board = material('board', (0.55, 0.07, 0.09), 0.4, shade=False)
    screen = material('screen', (0.03, 0.045, 0.07), 0.25, shade=False)
    L = 17
    led = (-L + 0.08, L - 0.08, 0.2, 2.5)
    # (the LED face stands clear of the body behind it: the ends and the top's overhang frame it)
    out = [of(slab(-L, L, 0.14, 2.56, -0.62, 0.55), dark)]
    out.append(of(sheet([(led[0], led[2], 0.6), (led[1], led[2], 0.6), (led[1], led[3], 0.6), (led[0], led[3], 0.6)]), board))
    out.append(of(bevel(slab(-L - 0.2, L + 0.2, 2.56, 2.7, -0.72, 0.78), 0.035, 1), dark))
    out.append(of(slab(-L - 0.04, L + 0.04, 0, 0.16, -0.54, 0.5), dark))
    for s in (-1, 1):
        out.append(of(bevel(slab(s * L, s * (L + 0.15), 0, 2.56, -0.67, 0.69), 0.035, 1), dark))
    # on top: low monitors turned to the people behind it, a few desk mics, the possession arrow's box facing the floor
    for x in (-13.2, -8.2, -3.4, 3.4, 8.2, 13.2):
        tilt = Matrix.Translation((x, 2.7, 0.22)) @ Matrix.Rotation(rad(14), 4, 'X')
        case = slab(-0.72, 0.72, 0.1, 0.92, -0.04, 0.04)
        face = slab(-0.66, 0.66, 0.16, 0.86, -0.04 - PROUD, 0)
        foot = slab(-0.25, 0.25, 0, 0.12, -0.26, 0.06)
        for piece, mat in ((case, dark), (face, screen), (foot, dark)):
            out.append(of(transform(piece, tilt), mat))
    for x in (-10.7, -5.8, 5.8, 10.7):
        out.append(of(rod((x, 2.7, -0.3), (x + 0.04, 3.3, -0.44), 0.016, 3, cap=False), dark))
        out.append(of(rod((x + 0.04, 3.28, -0.43), (x + 0.055, 3.45, -0.5), 0.04, 5), dark))
    out.append(of(bevel(slab(-0.9, 0.9, 2.7, 3.12, 0.12, 0.6), 0.03, 1), dark))
    out.append(of(slab(-0.8, 0.8, 2.78, 3.04, 0.4, 0.6 + PROUD), screen))
    o = finish(out, 'table')
    shade(o, plain=('board', 'screen'), floor=0, reach=1.6, low=0.5)
    # the LED face's map: 0..1 along its length (left to right as the floor reads it) and up its height
    me = o.data
    names = [m.name for m in me.materials]
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        on = names[p.material_index] == 'board'
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((v.x - led[0]) / (led[1] - led[0]), (v.z - led[2]) / (led[3] - led[2])) if on else (0, 0)
    return o


# --- the ball: eight panels, the seams between them cut in ---

def ball():
    leather = material('leather', (0.72, 0.3, 0.1), 0.6)
    seam = material('seam', (0.03, 0.025, 0.025), 0.7)
    R, half, deep = 0.39, 0.0135, 0.0105
    dl = half / R
    # Round the x axis: `th` is the angle from +x, `ph` the angle round it (0 toward +z, a quarter turn toward +y).
    # The meridian seam is th = 90 deg, the equator ph = 0 and 180 deg, a side seam th = t0 + amp cos 2ph
    # (nearest the meridian where it crosses the equator), so every seam runs along the grid.
    t0, amp, cap = rad(52), rad(8), rad(7)
    # (enough of a grid that its outline is round with the camera close on the man holding it)
    na, nb, nc = 6, 5, 22
    side = lambda f: t0 + amp * cos(2 * f)
    const = lambda v: (lambda f: v)
    between = lambda lo, hi, n: [(lambda f, k=k: lo(f) + (hi(f) - lo(f)) * k / (n + 1)) for k in range(1, n + 1)]
    A, S0, S2, M0 = const(cap), (lambda f: side(f) - dl), (lambda f: side(f) + dl), const(pi / 2 - dl)
    first = [(A, 0)] + [(g, 0) for g in between(A, S0, na)] + [(S0, 0), (side, 1), (S2, 0)] + [(g, 0) for g in between(S2, M0, nb)] + [(M0, 0)]
    rings = first + [(const(pi / 2), 1)] + [((lambda f, g=g: pi - g(f)), c) for g, c in reversed(first)]
    # (the equator's edges keep their distance from it all the way to the poles)
    e = lambda t: math.asin(min(1.0, sin(dl) / max(1e-6, sin(t))))
    mids = lambda base: [(lambda t, k=k: base + e(t) + (pi - 2 * e(t)) * k / (nc + 1), 0) for k in range(1, nc + 1)]
    cols = [(lambda t: 0.0, 1), (e, 0)] + mids(0) + [(lambda t: pi - e(t), 0), (lambda t: pi, 1), (lambda t: pi + e(t), 0)] + mids(pi) + [(lambda t: 2 * pi - e(t), 0)]
    nr, nk = len(rings), len(cols)
    verts, faces, cut = [], [], []
    for ring, rc in rings:
        for col, cc in cols:
            th = ring(0)
            for _ in range(8):
                ph = col(th)
                th = ring(ph)
            r = R - deep if rc or cc else R
            verts.append((r * cos(th), r * sin(th) * sin(ph), r * sin(th) * cos(ph)))
    for i in range(nr - 1):
        for j in range(nk):
            k = (j + 1) % nk
            faces.append((i * nk + j, i * nk + k, (i + 1) * nk + k, (i + 1) * nk + j))
            cut.append(bool(rings[i][1] or rings[i + 1][1] or cols[j][1] or cols[k][1]))
    # the two poles: the equator's seam runs straight over each
    for end, row in ((1, 0), (-1, nr - 1)):
        pc = len(verts)
        verts += [(end * (R - deep), 0, 0), (end * R * cos(dl), R * sin(dl), 0), (end * R * cos(dl), -R * sin(dl), 0)]
        v = lambda j: row * nk + j % nk
        for p, a in ((pc + 1, 1), (pc + 2, nc + 4)):
            for j in range(a, a + nc + 1):
                faces.append((p, v(j), v(j + 1)))
                cut.append(False)
            faces += [(v(a - 1), v(a), p, pc), (pc, p, v(a + nc + 1), v(a + nc + 2))]
            cut += [True, True]
    o = mesh_obj('ball', verts, faces)
    fix_normals(o)
    me = o.data
    me.materials.append(leather)
    me.materials.append(seam)
    me.polygons.foreach_set('material_index', [1 if c else 0 for c in cut])
    # smooth all over, but the lip of a seam is an edge
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        f.smooth = True
    for ed in bm.edges:
        fs = ed.link_faces
        ed.smooth = not (len(fs) == 2 and fs[0].material_index != fs[1].material_index)
    bm.to_mesh(me)
    bm.free()
    # (a seam is too shallow for the baked shade to find: the bottom of each is put in the dark by hand)
    paint(o, lambda x, y, z: 0.6 if math.sqrt(x * x + y * y + z * z) < R - deep / 2 else 1.0)
    return o


# --- the spectator: one of the thousands in the stands, a couple of hundred triangles of him (fan), and
# --- the twenty-odd he is where he is only a blur (fanFar) ---

def fan_pose(p, part, up=0.0, keen=True, clap=0.0):
    """
    Where the crowd's shader puts one of his points (CROWD_MOVE in court3d/arena.ts, without the sway):
    `up` 0 sat to 1 on his feet, `keen` with his arms in the air (else clapping, `clap` -1 to 1 through a beat).
    """
    x, y, z = p
    swing = up * pi / 2
    ky, kz = FAN_KNEE
    if part > 3.5:
        # a leg: the shin and the foot stay; the hip's end of the thigh swings up about the knee
        if z < 0.6:
            ry, rz = y - ky, z - kz
            y, z = ky + ry * cos(swing) - rz * sin(swing), kz + ry * sin(swing) + rz * cos(swing)
        return (x, y, z)
    if part > 1.5:
        side = 1 if part < 2.5 else -1
        high = 2.7 if keen else 1.15 + 0.2 * clap
        a = FAN_REST + (high - FAN_REST) * up
        ry, rz = y - FAN_SHOULDER[1], z
        reach = min(1.0, max(0.0, -ry / 1.45))
        y, z = FAN_SHOULDER[1] + ry * cos(a) + rz * sin(a), rz * cos(a) - ry * sin(a)
        if keen:
            t = min(1.0, max(0.0, (y - 1.2) / 1.4))
            x += side * up * 0.45 * t * t * (3 - 2 * t)
        else:
            x -= side * up * reach * reach * (0.22 + 0.08 * clap)
    # the rest of him goes where the top of his thighs goes: up, and forward over his feet
    return (x, y + FAN_THIGH * sin(swing), z + FAN_THIGH * (1 - cos(swing)))


def fan_piece(rings, part, name, start=False, end=False, tip=None, skip=()):
    """A skin over rings of points, shut at the ends asked for (`tip`: drawn up to one point); `part` is one value, or one a point."""
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = [(i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k) for i in range(len(rings) - 1) for k in range(n) if k not in skip]
    if start:
        faces.append(tuple(reversed(range(n))))
    if end:
        faces.append(tuple(range(len(verts) - n, len(verts))))
    if tip:
        last = len(verts) - n
        verts.append(tip)
        faces += [(last + k, last + (k + 1) % n, len(verts) - 1) for k in range(n)]
    o = mesh_obj(name, verts, faces)
    # (faces out: of a shape this simple, the way that points away from its middle)
    fix_normals(o)
    me = o.data
    mid = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    if sum(f.normal.dot(f.center - mid) * f.area for f in me.polygons) < 0:
        me.flip_normals()
    values = part if isinstance(part, list) else [part] * len(verts)
    me.attributes.new('_PART', 'FLOAT', 'POINT').data.foreach_set('value', [float(v) for v in values])
    return o


def fan():
    """
    Someone in the stands (there are thousands of him): sat on y = 0
    facing +z, his feet on the row below. The crowd's shader moves and colours him by `_PART`: 0 his
    trunk, 1 his head, 2 and 3 his arms (as they hang: the shader swings them from the shoulders), 4 his
    legs (the points at z < 0.6 are the hip's end of a thigh). A quarter more marks an end that takes its
    own colour: hair (1.25), a hand (2.25, 3.25), a shoe (4.25).
    """
    def six(y, w, wz, f, fz, b, bz):
        """A ring round him at one height: out to each side, two points across the front, two across the back."""
        return [(w, y, wz), (f, y, fz), (-f, y, fz), (-w, y, wz), (-b, y, bz), (b, y, bz)]

    SKIN, HAIR = 1, 1.25
    parts = []
    # his trunk: flat across the chest and the back, widest under the arms, the shoulders sloping in to the collar
    parts.append(fan_piece([six(-0.02, 0.48, 0, 0.4, 0.29, 0.4, -0.29), six(1.36, 0.55, -0.03, 0.38, 0.26, 0.38, -0.32), six(1.61, 0.53, -0.04, 0.32, 0.2, 0.32, -0.28), six(1.86, 0.16, -0.03, 0.1, 0.12, 0.1, -0.18)], 0, 'trunk'))
    # his head: a neck, the jaw out to a chin, cheeks, brow, the crown; hair over the top, the sides and the back
    head = [six(1.86, 0.14, -0.03, 0.09, 0.1, 0.09, -0.16), six(2.02, 0.22, 0.0, 0.11, 0.29, 0.14, -0.22), six(2.3, 0.29, 0.0, 0.18, 0.32, 0.19, -0.3), six(2.49, 0.26, -0.02, 0.16, 0.25, 0.17, -0.29)]
    grown = [[SKIN] * 6, [SKIN] * 6, [SKIN, SKIN, SKIN, SKIN, HAIR, HAIR], [HAIR] * 6, [HAIR]]
    parts.append(fan_piece(head, [v for ring in grown for v in ring], 'head', tip=(0, 2.63, -0.04)))

    sx, sy = FAN_SHOULDER
    for s in (1, -1):
        def hang(x, y, z):
            """A point of his arm given as it lies while he sits, where it is with the arm hanging."""
            ry = y - sy
            return Vector((s * x, sy + ry * cos(FAN_REST) - z * sin(FAN_REST), z * cos(FAN_REST) + ry * sin(FAN_REST)))

        # an arm: the shoulder, the elbow out and forward of it, the wrist in over his thigh, his hand on it
        mids = [Vector((s * sx, 1.61, -0.02)), hang(0.74, 0.97, 0.3), hang(0.57, 0.6, 0.8), hang(0.42, 0.46, 1.03)]
        thick = [(0.15, 0.16), (0.115, 0.12), (0.08, 0.075), (0.085, 0.04)]
        rings = []
        for i, (c, (across, deep)) in enumerate(zip(mids, thick)):
            along = (mids[min(i + 1, 3)] - mids[max(i - 1, 0)]).normalized()
            side = along.cross(Vector((0, 0, 1))).normalized()
            front = side.cross(along)
            rings.append([tuple(c + side * across * cos(k * pi / 2) + front * deep * sin(k * pi / 2)) for k in range(4)])
        # (the shoulder's outside falls away, as a shoulder does)
        k = max(range(4), key=lambda k: s * rings[0][k][0])
        rings[0][k] = (rings[0][k][0], rings[0][k][1] - 0.08, rings[0][k][2])
        parts.append(fan_piece(rings[:3], 2 if s > 0 else 3, 'arm', start=True))
        parts.append(fan_piece(rings[2:], 2.25 if s > 0 else 3.25, 'hand', end=True))

        # a leg: the thigh from the hip out to the knee (the knees a little apart), the shin down to the row below, a shoe
        hip = [(s * 0.04, 0.0, 0.0), (s * 0.44, 0.0, 0.0), (s * 0.42, 0.4, 0.0), (s * 0.07, 0.4, 0.0)]
        knee = [(s * 0.17, 0.03, 1.03), (s * 0.49, 0.03, 1.03), (s * 0.48, 0.37, 1.37), (s * 0.18, 0.37, 1.37)]
        ankle = [(s * 0.23, -0.78, 1.1), (s * 0.44, -0.78, 1.1), (s * 0.44, -0.78, 1.31), (s * 0.23, -0.78, 1.31)]
        parts.append(fan_piece([hip, knee, ankle], 4, 'leg'))
        heel = [(s * 0.22, -0.88, 1.06), (s * 0.45, -0.88, 1.06), (s * 0.45, -0.71, 1.06), (s * 0.22, -0.71, 1.06)]
        toe = [(s * 0.27, -0.88, 1.62), (s * 0.48, -0.88, 1.62), (s * 0.47, -0.81, 1.62), (s * 0.28, -0.81, 1.62)]
        # (nobody sees his sole or the back of his heel)
        parts.append(fan_piece([heel, toe], 4.25, 'shoe', end=True, skip=(0,)))

    out = join(parts, 'fan')
    set_material(out, material('fan', (0.3, 0.3, 0.33), 0.8))
    smooth(out)
    # his shade, as he sits (arms in his lap): under the chin, between arm and trunk, in his lap
    me = out.data
    part = [0.0] * len(me.vertices)
    me.attributes['_PART'].data.foreach_get('value', part)
    hung = [v.co.copy() for v in me.vertices]
    for v in me.vertices:
        v.co = B(*fan_pose((v.co.x, v.co.z, -v.co.y), part[v.index]))
    me.update()
    seat = box((0, -0.12, 0.3), (1.8, 0.2, 1.6), 'seat')
    bake_occlusion(out, others=[seat], rays=64, reach=0.9, low=0.5, blur=1)
    bpy.data.objects.remove(seat)
    for v in me.vertices:
        v.co = hung[v.index]
    me.update()
    return out


def fan_far():
    """
    The spectator where he is only a blur (the floor's varnish mirrors the stands, small and smeared): his
    trunk, as wide as his arms make him, and his head. The fan's frame and `_PART`, so the same shader
    moves and colours him.
    """
    def four(y, w, d, cz):
        return [(w, y, cz + d), (-w, y, cz + d), (-w, y, cz - d), (w, y, cz - d)]

    trunk = fan_piece([four(-0.02, 0.5, 0.3, 0.1), four(1.45, 0.72, 0.3, 0), four(1.84, 0.2, 0.16, -0.03)], 0, 'trunk')
    head = fan_piece([four(1.9, 0.2, 0.2, 0.02), four(2.42, 0.27, 0.29, 0)], [1, 1, 1, 1, 1.25, 1.25, 1.25, 1.25, 1.25], 'head', tip=(0, 2.63, -0.04))
    out = join([trunk, head], 'fanFar')
    set_material(out, material('fan'))
    smooth(out)
    paint(out, lambda x, y, z: 1.0)
    return out


def fan_look(fan, name, at, up=0.0, keen=True, clap=0.0, tone=0.7, bare=False):
    """For the preview only: the fan as the crowd's shader draws him (moved as CROWD_MOVE, coloured as CROWD_COLOR)."""
    me = fan.data.copy()
    o = link(bpy.data.objects.new(name, me))
    part = [0.0] * len(me.vertices)
    me.attributes['_PART'].data.foreach_get('value', part)
    skin = Vector((0.07, 0.04, 0.03)).lerp(Vector((0.4, 0.27, 0.2)), tone)
    col = me.color_attributes['Col']
    for v in me.vertices:
        p, hung = part[v.index], (v.co.x, v.co.z, -v.co.y)
        end = p % 1 > 0.1
        if p > 3.5:
            wear = Vector((0.5, 0.5, 0.5)) if end else Vector((0.03, 0.04, 0.07))
        elif p > 1.5:
            wear = skin if end or (bare and hung[1] < 1.3) else Vector((0.1, 0.16, 0.34))
        elif p > 0.5:
            wear = Vector((0.02, 0.015, 0.012)) if end else skin
        else:
            wear = Vector((0.1, 0.16, 0.34))
        col.data[v.index].color = (*(wear * col.data[v.index].color[0]), 1)
        v.co = B(*fan_pose(hung, p, up, keen, clap)) + B(*at)
    me.update()
    set_material(o, material('fanLook', (1, 1, 1), 0.8))
    return o


# --- the scoreboard: four screens leaning down, a ring under it, hung from the roof; the origin is its centre ---

def scoreboard():
    dark = material('dark')
    screen = material('screen')
    ribbon = material('ribbon', (0.55, 0.07, 0.09), 0.4, shade=False)
    cham = 1.5
    def eight(h, y):
        """The eight corners of a square with its corners cut, `h` from the middle to a side."""
        g = h - cham
        return [(h, y, g), (g, y, h), (-g, y, h), (-h, y, g), (-h, y, -g), (-g, y, -h), (g, y, -h), (h, y, -g)]

    y_low, y_top, h_low, h_top = -3.5, 4.6, 9.3, 10.75
    out = [of(loft([eight(h_low, y_low), eight(h_top, y_top)], 'body'), dark)]
    fix_normals(out[0])
    cap = loft([eight(11, 4.6), eight(11, 5.5)], 'cap')
    fix_normals(cap)
    out.append(of(bevel(cap, 0.14, 1), dark))
    # the four screens, a little proud of the body
    for q in range(4):
        turn = Matrix.Rotation(q * pi / 2, 4, 'Y')
        pts = []
        for v, zs in ((0.05, 1), (0.05, -1), (0.95, -1), (0.95, 1)):
            h = h_low + (h_top - h_low) * v
            pts.append((h + 0.07, y_low + (y_top - y_low) * v, zs * (h - cham - 0.3)))
        out.append(of(transform(sheet(pts), turn), screen))
    # the ring under it, and what it hangs by
    seg, r_in, r_out, r0, r1 = 48, 8.7, 9.25, -5.5, -4.25
    ring = hoop_loft([[(r * cos(2 * pi * i / seg), y, r * sin(2 * pi * i / seg)) for r, y in ((r_in, r0), (r_out, r0), (r_out, r1), (r_in, r1))] for i in range(seg)], 'ring')
    out.append(of(ring, ribbon))
    for q in range(4):
        a = pi / 4 + q * pi / 2
        out.append(of(beam(((r_in + 0.25) * cos(a), r1 - 0.1, (r_in + 0.25) * sin(a)), (7.6 * cos(a), y_low + 0.3, 7.6 * sin(a)), 0.3, 0.3, cap=False), dark))
    out.append(of(loft([eight(6.4, -4.3), eight(8.4, y_low)], 'belly', cap=True), dark))
    fix_normals(out[-1])
    # (a screen under it too, for the seats right below: every camera in the building looks up at this side)
    under = loft([eight(5.6, -4.3 - 0.12), eight(5.6, -4.2)], 'under', cap=True)
    fix_normals(under)
    out.append(of(under, screen))
    # the truss on top and the cables up into the roof
    for q in range(4):
        turn = Matrix.Rotation(q * pi / 2, 4, 'Y')
        out.append(of(transform(slab(5.6, 6.4, 5.5, 6.3, -6.4, 6.4), turn), dark))
        a = pi / 4 + q * pi / 2
        out.append(of(rod((8.2 * cos(a), 6.2, 8.2 * sin(a)), (5.6 * cos(a), 12, 5.6 * sin(a)), 0.12, 4, cap=False), dark))
    out.append(of(bevel(slab(-2, 2, 5.5, 7.1, -2, 2), 0.12, 1), dark))
    out.append(of(rod((0, 7.0, 0), (0, 12, 0), 0.45, 6, cap=False), dark))
    o = finish(out, 'scoreboard')
    shade(o, plain=('screen', 'ribbon'), reach=4.5, low=0.5)
    return o


# --- build, write, look ---

a = args()
reset()
objs = [f() for f in (hoop, rim, net, chair, table, ball, scoreboard, fan, fan_far)]
things = {o.name: o for o in objs}
for name, o in things.items():
    mats = ', '.join(f'{m.name} {sum(len(p.vertices) - 2 for p in o.data.polygons if p.material_index == i)}' for i, m in enumerate(o.data.materials))
    print(f'[models] {name}: {tri_count(o)} triangles ({mats})')
print(f'[models] arena: {sum(tri_count(o) for o in objs)} triangles in all')
export_glb(os.path.join(a['out'], 'arena.glb'), objs)

if 'preview' in a:
    def look(name, show, shots, place=None, **kw):
        for o in objs:
            o.hide_render = o not in show
        for o, at in (place or {}).items():
            o.location = B(*at)
        preview(os.path.join(a['preview'], f'arena-{name}.png'), shots, **kw)
        for o in place or {}:
            o.location = (0, 0, 0)

    T = things
    up = {T['rim']: (0, 10, 0), T['net']: (0, 10, 0)}
    basket = [T['hoop'], T['rim'], T['net']]
    c = (-6, 7, 0)
    look('hoop', basket, [((c[0] + 14, c[1] + 12, c[2] + 40), c, 21), ((c[0] + 40, c[1] + 4, c[2] + 14), c, 19), ((c[0] - 22, c[1] + 10, c[2] + 30), c, 21), ((c[0] - 2, c[1] + 2, c[2] + 40), c, 21)], up, size=(640, 640), ground=0, sheet_cols=2)
    c = (-0.9, 11.4, 0)
    look('board', basket, [((c[0] + 20, c[1] + 4, c[2] + 14), c, 9), ((c[0] - 16, c[1] + 6, c[2] + 14), c, 9), ((0.5, 14, 6), (-0.3, 9.7, 0), 3.4), ((6, 9.2, 3), (-0.3, 9.6, 0), 3.4)], up, size=(640, 640), sheet_cols=2)
    look('net', [T['rim'], T['net']], [((6, 3, 8), (-0.2, -0.6, 0), 2.6), ((0, 0.4, 8), (-0.2, -0.6, 0), 2.6), ((2, 8, 3), (-0.2, -0.3, 0), 2.6), ((30, 14, 60), (-0.2, -0.6, 0), 9)], size=(520, 520), sheet_cols=2)
    look('chair', [T['chair']], [((5, 4, 8), (0, 1.5, 0), 4.2), ((-8, 3, -5), (0, 1.5, 0), 4.2), ((9, 1.5, 0.2), (0, 1.5, 0), 4.2), ((2, 9, 20), (0, 1.5, 0), 12)], size=(520, 520), ground=0, sheet_cols=2)
    look('table', [T['table']], [((6, 12, 40), (0, 1.5, 0), 37), ((10, 5, 9), (-13.5, 1.8, 0), 10), ((-6, 5, -9), (0, 2.2, 0), 9), ((-10, 4, 8), (15.5, 1.5, 0), 6)], size=(900, 420), ground=0, sheet_cols=1)
    look('ball', [T['ball']], [((3, 2, 8), (0, 0, 0), 1.0), ((8, 1, 1), (0, 0, 0), 1.0), ((1, 8, 2), (0, 0, 0), 1.0), ((-4, -1, 6), (0, 0, 0), 1.0), ((3, 2, 8), (0, 0, 0), 5), ((5, 0.5, 5), (0.39, 0, 0.1), 0.3)], size=(440, 440), sheet_cols=3)
    look('scoreboard', [T['scoreboard']], [((10, -14, 40), (0, 1, 0), 30), ((25, 6, 30), (0, 1, 0), 30), ((4, -30, 12), (0, 0, 0), 30), ((10, -30, 80), (0, 1, 0), 90)], size=(560, 560), sheet_cols=2)
    # the spectator as the crowd shows him: sat, on his feet with his arms in the air, on his feet clapping
    # (they stay in the .blend, off to one side)
    crowd = [
        fan_look(T['fan'], 'fanSat', (-3.2, 0.88, 0), tone=0.75, bare=True),
        fan_look(T['fanFar'], 'fanFarSat', (-6.4, 0.88, 0), tone=0.75),
        fan_look(T['fan'], 'fanUp', (0, 0.88, 0), up=1, tone=0.3),
        fan_look(T['fan'], 'fanClap', (3.2, 0.88, 0), up=1, keen=False, clap=1, tone=0.95),
        fan_look(T['fan'], 'fanHalf', (6.4, 0.88, 0), up=0.5, tone=0.6),
        of(box((-3.2, 0.78, 0.25), (1.8, 0.2, 1.5), 'fanSeat'), material('fanSeatLook', (0.2, 0.2, 0.22), 0.6, shade=False)),
    ]
    c = (0, 2.6, 0.6)
    look('fan', [], [((c[0], c[1] + 1.5, c[2] + 30), c, 16), ((c[0] + 18, c[1] + 5, c[2] + 22), c, 16), ((c[0] - 30, c[1] + 1, c[2] + 3), (-1.6, 2.6, 0.6), 8), ((c[0] - 6, c[1] + 6, c[2] - 30), c, 16), ((-1.2, 4.6, 12), (-3.2, 2.4, 0.4), 4.6), ((c[0], c[1] + 14, c[2] + 60), c, 44)], size=(780, 440), ground=0, sheet_cols=2)
    for o in objs:
        o.hide_render = False

# the .blend, laid out to be looked at: the basket put together, the rest spread along the floor
for o, at in ((things['rim'], (0, 10, 0)), (things['net'], (0, 10, 0)), (things['chair'], (-4, 0, 14)), (things['ball'], (2, 0.39, 14)), (things['table'], (0, 0, 22)), (things['scoreboard'], (0, 34, 22)), (things['fan'], (8, 0.88, 14)), (things['fanFar'], (11, 0.88, 14))):
    o.location = B(*at)
save_blend(os.path.join(a['blend'], 'arena.blend'))
