# His skin's map: the relief a real man's arms, legs and neck have and a mesh of his size can't (the grooves between
# his muscles, his tendons and the edges of his bones, his veins), as heights laid in his skin's own uv (their
# modellers': see mhbody.read_obj), for the app to light him by. Worked out here in numpy when the figure is built
# (figure.py runs it), never by a renderer: each texel is a place on their man as he stands, and its height is what
# these say of that place. None of it is noise:
#  - their own lean man: how far 'maxmuscle-minweight' pushes his skin past ours ('maxmuscle-averageweight', see
#    mhbody.athlete), its broad swell taken off, so what is left is where one muscle ends and the next begins (LEAN);
#  - the curve of his own skin, sharpened a little (CURVE_MM): his knuckles, his collarbones, his ears' rims;
#  - what their mesh is too coarse to have (FEATURES): each a line of places round one of their bones (how far along
#    it, which way round from his front), found on his skin as their man stands, the same on his right as his left.
# His face takes only what is fixed in a face and small (the edge of his lips, the columns under his nose, the rim of
# his ears; FACE_MM at most): the lines of a face that moves are the app's own (figure.ts's creases), drawn on a face
# that is smooth at rest.
#
# The picture is ANAT x ANAT, grey and alpha, in his uv as the file has it (glTF's way up: v down, row r at
# v = (r + 0.5) / ANAT, so row 0 is the first the app uploads). Its grey is his form's height (128 flat, 128 +- 127 is
# +- FORM_MM), its alpha his veins' (0 none, 255 VEIN_MM). It is flat where his skin doesn't show (under his kit, past
# GUTTER texels round what does), on the balls of his eyes, and at texel (0, 0): every other part of him reads that uv.
# A copy half the size beside it (SMALL: a phone's, which never wants more) is the same heights taken down before they
# are put in bytes. anat.json says how big it is, its scales, and where on him a few points of it are (PROBES: the test
# finds each on the packed model by its place, and its uv there, so a uv lost, flipped or swapped on the way shows).
import json
import math
import os
import time

import numpy as np

import mhbody
from lib import dilate, raster_uv, write_png

#: How many texels across (his limbs get some 1.5 mm a texel at 2048, his face three times finer: their layout's; at
#: 1024 a limb's 3 mm a texel would blur a vein away).
ANAT = 2048
#: How high a texel's form and veins can be (mm on him: his figure as built, 6 ft 7).
FORM_MM, VEIN_MM = 4.0, 1.5
#: How much of their lean man goes in (as it is, some 1.4 mm either way over what shows), and over how many passes his
#: broad swell is smoothed off it (after four that smooth off what is no bigger than a triangle of theirs).
LEAN, LEAN_PASSES = 1.0, 12
#: How high a texel's form is told as it is (mm); past that it is bent over toward FORM_MM.
KNEE = 3.0
#: How much the curve of his skin is sharpened: its 99th percentile, mm.
CURVE_MM = 0.8
#: The most his face's relief may be (mm), either way.
FACE_MM = 0.4
#: How far (texels at 2048) what comes from his points (LEAN, CURVE_MM) is blurred over his uv, so no triangle shows.
BLUR = 4.0
#: How far round the skin that shows its relief runs on (texels: the app's coarser copies of the map blend in that much).
GUTTER = 16
#: The copy for a phone: half the size, its own file.
SMALL = 'skin-anat-1024.png'
#: How far a plate's edge runs (mm, either side of where its width says): a plane falling away, not a step.
PLATE_EDGE = 10.0
#: The packed model's grid (run.ts's GRID): a probe's place is told on it.
GRID = 1 / 4096
#: mm in a foot (his figure is built in feet).
MM = 304.8

#
# The features, each a line of places on their man (MakeHuman's frame: decimetres, x to his left, y up, z the way he
# faces) on his left side, his right the same in a mirror (unless `sides` is 1: a feature on his middle). A place is
# (bone, how far along it 0..1, the way round from his front in degrees, how much of the feature's height is there):
# toward his outside is +90 (on his forearm and hand: toward his thumb), his back 180, his inside -90. The bones are
# theirs, put together as limbs() does (uarm: shoulder to elbow; farm: elbow to wrist, turning with his hand as his
# radius does; hand: wrist to his knuckles, mc1..mc4 the bones in it, front his palm; thigh, shin; neck; clav: his
# collarbone, +90 up; trunk: straight up his middle, from a hand under his collarbones to a hand over them).
# Kinds: a groove or a ridge (height < 0 or > 0, across it a bell `width` mm wide at half its height), a vein (a round
# tube that wanders a little, in its own channel), a dome (one place: `width` across), a ring (one place: a groove 7 mm
# wide round it, `width` across, open over its top, toward where its bone starts, and faded where it crosses the line
# straight down from it: a kneecap's edge, which runs into its tendon), a plate (flat, `width` across, its edges planes
# PLATE_EDGE mm either way).
#
FEATURES = (
    # his shoulder: the deltoid's three heads, its front edge against his chest and its back edge, meeting in the V
    # a third of the way down his arm, outside (all of them nearly gone by then: drawn to its point, the V reads as a
    # line cut in him once his arm is up, as a shooter's is)
    ('deltoid, front edge', 'groove', -1.8, 11, [('uarm', -0.1, -30, 0.2), ('uarm', 0.08, -8, 0.8), ('uarm', 0.25, 28, 1), ('uarm', 0.4, 62, 0.5), ('uarm', 0.47, 80, 0.1)]),
    ('deltoid, back edge', 'groove', -1.0, 16, [('uarm', -0.06, -165, 0.2), ('uarm', 0.1, 168, 0.8), ('uarm', 0.27, 135, 1), ('uarm', 0.4, 105, 0.45), ('uarm', 0.47, 84, 0.1)]),
    ('deltoid, front head', 'groove', -0.5, 12, [('uarm', -0.02, 30, 0.2), ('uarm', 0.18, 50, 1), ('uarm', 0.4, 76, 0.2)]),
    ('deltoid, back head', 'groove', -0.5, 12, [('uarm', -0.02, 128, 0.2), ('uarm', 0.18, 112, 1), ('uarm', 0.4, 88, 0.2)]),
    # his upper arm: the grooves down either side of his biceps
    ('biceps, outside groove', 'groove', -1.6, 7, [('uarm', 0.47, 82, 0.1), ('uarm', 0.62, 78, 1), ('uarm', 0.8, 76, 1), ('uarm', 0.96, 85, 0.4)]),
    ('biceps, inside groove', 'groove', -2.0, 8, [('uarm', 0.3, -92, 0.3), ('uarm', 0.45, -95, 1), ('uarm', 0.7, -98, 1), ('uarm', 0.93, -102, 0.5)]),
    # the back of it: his triceps, its two heads standing either side of the flat of its tendon (a horseshoe by their
    # fullness, not a line drawn round it)
    ('triceps, outer head', 'ridge', 1.6, 24, [('uarm', 0.2, 118, 0.3), ('uarm', 0.36, 132, 1), ('uarm', 0.52, 142, 1), ('uarm', 0.64, 150, 0.3)]),
    ('triceps, long head', 'ridge', 1.6, 24, [('uarm', 0.18, -125, 0.3), ('uarm', 0.34, -140, 1), ('uarm', 0.5, -150, 1), ('uarm', 0.64, -158, 0.3)]),
    ('triceps, tendon', 'plate', -1.0, 26, [('uarm', 0.55, 180, 0.4), ('uarm', 0.72, 180, 1), ('uarm', 0.9, 180, 0.6)]),
    # his forearm: the line down the front edge of his brachioradialis, and the one along his ulna
    ('brachioradialis, front edge', 'groove', -1.6, 7, [('farm', 0.04, 25, 0.5), ('farm', 0.25, 40, 1), ('farm', 0.5, 55, 1), ('farm', 0.72, 68, 0.3)]),
    ('brachioradialis, back edge', 'groove', -1.0, 6, [('farm', 0.08, 120, 0.4), ('farm', 0.3, 118, 1), ('farm', 0.55, 115, 0.3)]),
    ('ulna', 'groove', -1.5, 7, [('farm', 0.1, 178, 0.2), ('farm', 0.3, -168, 1), ('farm', 0.65, -152, 1), ('farm', 0.95, -140, 0.4)]),
    # his veins: the cephalic up the thumb side of his forearm and a little way up the outside of his arm, the basilic
    # up the other side to just above his elbow, the median cubital across the crook of his elbow between them; the
    # arch on the back of his hand they start from. (Above his elbow they go in under his muscle: run on up his arm
    # they read, with the arm up, as cracks in him)
    ('cephalic vein', 'vein', 1.0, 3.5, [('mc1', 0.15, 135, 0.6), ('farm', 0.92, 110, 1), ('farm', 0.6, 85, 1), ('farm', 0.3, 62, 1), ('farm', 0.08, 45, 0.9), ('uarm', 0.92, 62, 0.55), ('uarm', 0.72, 70, 0.25), ('uarm', 0.55, 62, 0.05)]),
    ('basilic vein', 'vein', 0.9, 3.5, [('mc4', 0.2, -140, 0.6), ('farm', 0.92, -140, 1), ('farm', 0.6, -112, 1), ('farm', 0.3, -82, 1), ('farm', 0.06, -62, 0.9), ('uarm', 0.93, -72, 0.6), ('uarm', 0.8, -86, 0.25), ('uarm', 0.66, -92, 0.05)]),
    ('median cubital vein', 'vein', 1.1, 4, [('farm', 0.2, 58, 0.8), ('farm', 0.07, 15, 1), ('uarm', 0.95, -40, 1), ('uarm', 0.92, -62, 0.8)]),
    ('dorsal venous arch', 'vein', 0.9, 3.2, [('mc1', 0.15, 135, 0.6), ('mc1', 0.45, 175, 1), ('mc2', 0.55, 180, 1), ('mc3', 0.55, 180, 1), ('mc4', 0.4, -170, 1), ('mc4', 0.2, -140, 0.6)]),
    ('metacarpal vein, index', 'vein', 0.7, 2.8, [('mc1', 0.45, 175, 1), ('mc1', 0.8, -160, 0.3)]),
    ('metacarpal vein, middle', 'vein', 0.7, 2.8, [('mc2', 0.55, 180, 1), ('mc2', 0.85, -155, 0.3)]),
    ('metacarpal vein, ring', 'vein', 0.6, 2.8, [('mc3', 0.55, 180, 1), ('mc3', 0.85, -155, 0.3)]),
    # the back of his hand: a tendon to each knuckle, and the knuckles
    ('extensor tendon, index', 'ridge', 0.9, 4, [('mc1', 0.1, 180, 0.2), ('mc1', 0.5, 180, 1), ('mc1', 0.92, 180, 0.6)]),
    ('extensor tendon, middle', 'ridge', 0.9, 4, [('mc2', 0.1, 180, 0.2), ('mc2', 0.5, 180, 1), ('mc2', 0.92, 180, 0.6)]),
    ('extensor tendon, ring', 'ridge', 0.8, 4, [('mc3', 0.1, 180, 0.2), ('mc3', 0.5, 180, 1), ('mc3', 0.92, 180, 0.6)]),
    ('extensor tendon, little', 'ridge', 0.7, 4, [('mc4', 0.1, 180, 0.2), ('mc4', 0.5, 180, 1), ('mc4', 0.92, 180, 0.6)]),
    ('knuckle, index', 'dome', 1.2, 14, [('mc1', 1.0, 180, 1)]),
    ('knuckle, middle', 'dome', 1.2, 14, [('mc2', 1.0, 180, 1)]),
    ('knuckle, ring', 'dome', 1.1, 13, [('mc3', 1.0, 180, 1)]),
    ('knuckle, little', 'dome', 1.0, 12, [('mc4', 1.0, 180, 1)]),
    # his knee: his kneecap and the groove round it, the tendon under it; his shin's crest; the two heads of his calf
    ('kneecap', 'dome', 1.4, 46, [('thigh', 0.965, 0, 1)]),
    ('kneecap, edge', 'ring', -0.5, 50, [('thigh', 0.965, 0, 1)]),
    ('patellar tendon', 'ridge', 1.0, 13, [('shin', -0.01, 0, 0.6), ('shin', 0.06, 0, 1), ('shin', 0.12, 0, 0.7)]),
    ('tibia, crest', 'ridge', 1.0, 6, [('shin', 0.12, -2, 0.5), ('shin', 0.3, -6, 1), ('shin', 0.5, -12, 1), ('shin', 0.7, -18, 0.8), ('shin', 0.9, -30, 0.4)]),
    ('calf, between its heads', 'groove', -1.5, 8, [('shin', 0.1, 180, 0.3), ('shin', 0.25, 180, 1), ('shin', 0.42, 178, 0.4)]),
    ('calf, inner head', 'groove', -1.8, 9, [('shin', 0.22, -105, 0.3), ('shin', 0.36, -135, 1), ('shin', 0.47, -160, 1), ('shin', 0.52, 178, 0.4)]),
    ('calf, outer head', 'groove', -1.8, 9, [('shin', 0.2, 108, 0.3), ('shin', 0.32, 132, 1), ('shin', 0.41, 158, 1), ('shin', 0.45, 178, 0.4)]),
    # his neck: the cord down each side of it, the notch over his breastbone, his collarbones and the hollow under each
    ('sternocleidomastoid', 'ridge', 1.2, 13, [('neck', 1.0, 112, 0.3), ('neck', 0.62, 82, 1), ('neck', 0.15, 45, 1), ('trunk', 0.75, 22, 1), ('trunk', 0.52, 12, 0.4)]),
    ('sternocleidomastoid, its collarbone head', 'ridge', 0.8, 10, [('neck', 0.3, 62, 0.3), ('trunk', 0.75, 36, 1), ('trunk', 0.55, 30, 0.4)]),
    ('notch over his breastbone', 'dome', -1.3, 30, [('trunk', 0.47, 0, 1)], 1),
    ('collarbone', 'ridge', 1.1, 9, [('clav', 0.06, 40, 0.4), ('clav', 0.3, 35, 1), ('clav', 0.6, 40, 1), ('clav', 0.85, 55, 0.8), ('clav', 1.0, 70, 0.4)]),
    ('under his collarbone', 'groove', -1.0, 14, [('clav', 0.15, -5, 0.3), ('clav', 0.45, -8, 1), ('clav', 0.75, 0, 0.6), ('clav', 0.9, 15, 0.2)]),
)
#: The places anat.json tells (as FEATURES tells them; each also on his right, '.R'): the test finds each in the
#: packed model by where it is, and checks the uv there is still this one.
PROBES = {
    'upperarm': ('uarm', 0.7, 72),
    'elbow': ('uarm', 0.95, -40),
    'forearm': ('farm', 0.55, 80),
    'hand': ('mc2', 0.55, 180),
    'knee': ('thigh', 0.965, 0),
    'shin': ('shin', 0.35, -6),
}
#: How the ends of a line fade in (mm).
TAPER = 14.0


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def off(v, *axes):
    """v, with what lies along each of these (unit, at right angles to each other) taken out, made one long."""
    v = np.asarray(v, dtype=np.float64)
    for a in axes:
        v = v - (v @ a) * a
    return unit(v)


def limbs(rig):
    """
    Each bone a feature is placed on (his left one): where it starts, where it ends, and at a point t along it which
    way his front is and which way his outside is (both at right angles to it).
    """
    h, t = rig.head, rig.tail
    X, Y, Z = np.eye(3)
    mc = [(h(f'metacarpal{k}.L'), t(f'metacarpal{k}.L')) for k in (1, 2, 3, 4)]
    wrist = h('wrist.L')
    # (his palm: the way his middle finger curls; his thumb's side: from his little finger's knuckle to his index's)
    d1, d3 = unit(t('finger3-1.L') - h('finger3-1.L')), unit(t('finger3-3.L') - h('finger3-3.L'))
    curl = off(d3 - d1, d1)
    palm = unit(np.cross(mc[0][1] - wrist, mc[3][1] - wrist))
    palm = palm if palm @ curl > 0 else -palm
    thumb = mc[0][1] - mc[3][1]
    out = {}

    def plain(name, a, b, front, side):
        d = unit(b - a)
        f = off(front, d)
        out[name] = (a, b, lambda _t, d=d, f=f: (f, off(side, d, f)))

    shoulder, elbow, wrist_ = h('upperarm01.L'), h('lowerarm01.L'), t('lowerarm02.L')
    plain('uarm', shoulder, elbow, Z, X)
    # (his forearm turns with his hand: at his elbow its front is the inside of the bend, at his wrist his palm; his
    # outside, his thumb's side, is at right angles to that all the way down)
    d = unit(wrist_ - elbow)
    f0, f1 = off(d - unit(elbow - shoulder), d), off(palm, d)
    turn = math.atan2(np.cross(f0, f1) @ d, f0 @ f1)
    way = 1.0 if np.cross(d, f1) @ thumb > 0 else -1.0

    def farm(t_):
        a = turn * min(1.0, max(0.0, t_))
        f = f0 * math.cos(a) + np.cross(d, f0) * math.sin(a) + d * (d @ f0) * (1 - math.cos(a))
        f = off(f, d)
        return f, unit(np.cross(d, f) * way)

    out['farm'] = (elbow, wrist_, farm)
    plain('hand', wrist, np.mean([b for _a, b in mc], axis=0), palm, thumb)
    for k, (a, b) in enumerate(mc):
        plain(f'mc{k + 1}', a, b, palm, thumb)
    plain('thigh', h('upperleg02.L'), h('lowerleg01.L'), Z, X)
    plain('shin', h('lowerleg01.L'), t('lowerleg02.L'), Z, X)
    plain('neck', h('neck01'), h('head'), Z, X)
    # (his trunk, straight up his middle at his collarbones: for what is at the foot of his neck)
    plain('trunk', np.array([0.0, 5.5, 0.2]), np.array([0.0, 6.5, 0.2]), Z, X)
    # (his collarbone: from where it meets his breastbone to over his shoulder's joint, under its end)
    a, b = h('clavicle.L'), t('clavicle.L')
    plain('clav', a, np.array([t('shoulder01.L')[0] - 0.15, b[1] - 0.05, b[2]]), Z, Y)
    return out


class Skin:
    """Their man's skin as he stands (the faces of his that are drawn), to find places on: rays and nearest points."""

    def __init__(self, P, faces):
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree

        self.V = Vector
        self.tree = BVHTree.FromPolygons([Vector(p) for p in P], faces)

    def cast(self, a, d, reach=3.0):
        hit = self.tree.ray_cast(self.V(a), self.V(d), reach)
        return None if hit[0] is None else (np.array(hit[0]), np.array(hit[1]))

    def near(self, p):
        hit = self.tree.find_nearest(self.V(p))
        return np.array(hit[0]), np.array(hit[1])


def place(skin, frames, seg, t, round_):
    """The point of his skin at (bone, t, degrees round) and its normal: out from the bone there, the way round asked."""
    a, b, frame = frames[seg]
    f, side = frame(t)
    d = math.radians(round_)
    hit = skin.cast(a + (b - a) * t, f * math.cos(d) + side * math.sin(d))
    if hit is None:
        raise RuntimeError(f'anatomy: no skin at {seg} {t} {round_}')
    return hit


def line_of(skin, places, step, wander=None):
    """
    A line on his skin through these points (each with its share of the height): a smooth curve through them, a
    point every `step`, each put back on his skin. `wander` (amplitude, rng) moves it from side to side a little,
    smoothly, as a vein does. Says its points, their normals and shares, and how far along each is (in his frame).
    """
    pts = np.array([p for p, _k in places])
    ks = np.array([k for _p, k in places], dtype=np.float64)
    if len(pts) == 1:
        p, n = skin.near(pts[0])
        return p[None], n[None], ks, np.zeros(1)
    # (Catmull-Rom through them, the ends doubled)
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out, share = [], []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = ext[i : i + 4]
        n = max(2, int(math.ceil(np.linalg.norm(p2 - p1) / step)))
        for s in np.arange(n) / n:
            out.append(0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (3 * p1 - p0 - 3 * p2 + p3) * s**3))
            share.append(ks[i] + (ks[i + 1] - ks[i]) * s)
    out.append(pts[-1])
    share.append(ks[-1])
    got = [skin.near(p) for p in out]
    pts, nrm = np.array([g[0] for g in got]), np.array([g[1] for g in got])
    if wander is not None:
        amp, rng = wander
        along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        # (two slow waves and a quicker one, each its own length and start: at most `amplitude` off, 1.85 being their sum)
        w = np.zeros(len(pts))
        for length, k in ((0.45, 1.0), (0.28, 0.6), (0.12, 0.25)):
            w += k * np.sin(2 * math.pi * along / (length * rng.uniform(0.8, 1.25)) + rng.uniform(0, 2 * math.pi))
        tang = np.gradient(pts, axis=0)
        side = unit(np.cross(nrm, tang))
        got = [skin.near(p) for p in pts + side * (amp * w / 1.85)[:, None]]
        pts, nrm = np.array([g[0] for g in got]), np.array([g[1] for g in got])
    along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return pts, nrm, np.array(share), along


def nearest(X, pts, piece=16, reach=0.3):
    """
    For each point of X, the nearest point of the line through pts: how far (inf past `reach`), which segment, how
    far along that one (0..1). Only the points within the line's box are tried, then a piece of it at a time, only
    those within the piece's box.
    """
    n = len(X)
    best = np.full(n, np.inf)
    seg = np.zeros(n, dtype=np.int64)
    frac = np.zeros(n)
    near = np.where(np.all((X >= pts.min(0) - reach) & (X <= pts.max(0) + reach), axis=1))[0]
    Xn = X[near]
    if len(pts) == 1:
        dd = np.linalg.norm(Xn - pts[0], axis=1)
        best[near] = np.where(dd < reach, dd, np.inf)
        return best, seg, frac
    for at in range(0, len(pts) - 1, piece):
        A, B = pts[at : at + piece], pts[at + 1 : at + piece + 1]
        A = A[: len(B)]
        lo, hi = np.minimum(A, B).min(0) - reach, np.maximum(A, B).max(0) + reach
        idx = np.where(np.all((Xn >= lo) & (Xn <= hi), axis=1))[0]
        if not len(idx):
            continue
        Y = Xn[idx]
        idx = near[idx]
        AB = B - A
        u = np.clip(((Y[:, None] - A[None]) * AB[None]).sum(2) / np.maximum((AB * AB).sum(1), 1e-12)[None], 0, 1)
        dd = np.linalg.norm(Y[:, None] - (A[None] + u[..., None] * AB[None]), axis=2)
        k = dd.argmin(1)
        dk = dd[np.arange(len(idx)), k]
        win = dk < best[idx]
        best[idx[win]] = dk[win]
        seg[idx[win]] = at + k[win]
        frac[idx[win]] = u[np.arange(len(idx)), k][win]
    best[best > reach] = np.inf
    return best, seg, frac


def profile(kind, d, width):
    """A feature's height across it (1 on it), d mm from its line or point."""
    if kind in ('groove', 'ridge'):
        return np.exp(-4 * math.log(2) * (d / width) ** 2)
    if kind == 'vein':
        x = np.clip(2 * d / width, 0, 1)
        return (1 - x * x) ** 1.5
    if kind == 'dome':
        x = np.clip(2 * d / width, 0, 1)
        return (1 - x * x) ** 2
    if kind == 'plate':
        return 1 - smoothstep(width / 2 - PLATE_EDGE, width / 2 + PLATE_EDGE, d)
    if kind == 'ring':
        return np.exp(-4 * math.log(2) * ((d - width / 2) / 7.0) ** 2)
    raise ValueError(kind)


def blur(img, mask, sigma):
    """The picture blurred (some sigma texels: three running means, as near a bell as that makes), only what `mask` holds counted."""
    w = max(1, int(round(math.sqrt(4 * sigma * sigma + 1))) // 2 * 2 + 1)
    m = np.asarray(mask, dtype=np.float64)[..., None]
    a = np.concatenate([img * m, m], axis=2)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0)] * 3
            pad[axis] = (w // 2 + 1, w // 2)
            c = np.cumsum(np.pad(a, pad), axis=axis)
            a = (np.take(c, np.arange(w, c.shape[axis]), axis=axis) - np.take(c, np.arange(0, c.shape[axis] - w), axis=axis)) / w
    return np.where(m > 0, a[..., :-1] / np.maximum(a[..., -1:], 1e-9), img)


def contour(P, faces, value, level):
    """Where `value` (a point's) crosses `level` over these faces: a segment across each face it crosses, as pairs of points."""
    segs = []
    for f in faces:
        cut = []
        for a, b in zip(f, f[1:] + f[:1]):
            va, vb = value[a] - level, value[b] - level
            if (va < 0) != (vb < 0):
                cut.append(P[a] + (P[b] - P[a]) * (va / (va - vb)))
        if len(cut) == 2:
            segs.append(cut)
    return np.array(segs)


def write(fig, man, out, size=ANAT, log=print):
    """skin-anat.png and anat.json in `out`, for the built figure `fig` (his skin's second uv, BodyUV) and the real man it is (mhbody.Player)."""
    t0 = time.time()
    P = np.asarray(man.P, dtype=np.float64)
    Q = np.asarray(man.Q, dtype=np.float64)
    n = len(P)
    faces = [list(f) for f in man.faces]
    tri = np.array([(f[0], f[k], f[k + 1]) for f in faces for k in range(1, len(f) - 1)])
    tuv = np.array([[man.uv_of[tuple(f)][j] for j in (0, k, k + 1)] for f in faces for k in range(1, len(f) - 1)])
    tuv[..., 1] = 1 - tuv[..., 1]

    # each point of theirs: its normal as he stands, how many mm on him a decimetre of theirs is there
    cross = np.cross(P[tri[:, 1]] - P[tri[:, 0]], P[tri[:, 2]] - P[tri[:, 0]])
    area_p = np.linalg.norm(cross, axis=1) / 2
    area_q = np.linalg.norm(np.cross(Q[tri[:, 1]] - Q[tri[:, 0]], Q[tri[:, 2]] - Q[tri[:, 0]]), axis=1) / 2
    nrm = np.zeros((n, 3))
    kmm = np.zeros(n)
    wt = np.zeros(n)
    for j in range(3):
        np.add.at(nrm, tri[:, j], cross)
        np.add.at(kmm, tri[:, j], area_p * np.sqrt(area_q / np.maximum(area_p, 1e-12)) * MM)
        np.add.at(wt, tri[:, j], area_p)
    used = wt > 0
    nrm[used] = unit(nrm[used])
    kmm = np.where(used, kmm / np.maximum(wt, 1e-12), 0.0)

    # (his points' neighbours, for smoothing over his skin)
    edges = np.array(sorted({(min(a, b), max(a, b)) for f in faces for a, b in zip(f, f[1:] + f[:1])}))
    deg = np.bincount(edges.ravel(), minlength=n).astype(np.float64)

    def smooth(x, passes):
        for _ in range(passes):
            acc = np.zeros(n)
            np.add.at(acc, edges[:, 0], x[edges[:, 1]])
            np.add.at(acc, edges[:, 1], x[edges[:, 0]])
            x = np.where(deg > 0, 0.5 * x + 0.5 * acc / np.maximum(deg, 1), x)
        return x

    # their lean man, its broad swell off; the curve of his skin (how far each point stands out of its neighbours'
    # middle), sharpened to CURVE_MM at its 99th percentile
    lean = (nrm * (mhbody.target('universal-male-young-maxmuscle-minweight', n) - mhbody.target('universal-male-young-maxmuscle-averageweight', n))).sum(1) * kmm
    lean = smooth(lean, 4) - smooth(lean, 4 + LEAN_PASSES)
    mid = np.zeros((n, 3))
    np.add.at(mid, edges[:, 0], P[edges[:, 1]])
    np.add.at(mid, edges[:, 1], P[edges[:, 0]])
    curve = -((mid / np.maximum(deg, 1)[:, None] - P) * nrm).sum(1) * kmm
    curve = np.where(used, smooth(curve, 1) - smooth(curve, 4), 0.0)
    curve *= CURVE_MM / max(np.percentile(np.abs(curve[used]), 99), 1e-9)
    # (his face: what hangs on his head alone; it fades in up his neck)
    face = smoothstep(0.55, 0.97, man.head)
    # (his lips: how far the targets that fill them move a point, each lip's its own most)
    lips = np.zeros(n)
    for name in ('mouth-upperlip-volume-incr', 'mouth-lowerlip-volume-incr'):
        far = np.linalg.norm(mhbody.target(name, n), axis=1)
        lips = np.maximum(lips, far / far.max())

    # every texel of his skin's uv, and what is there: the place on their man, its normal, mm a decimetre, his lean
    # and his curve, how much of it is his face
    per = np.column_stack([P, nrm, kmm, lean, curve, face])
    vals, hits = raster_uv(tuv, per[tri], size)
    covered = hits > 0
    twice = int((hits > 1).sum())
    # (a point's value, laid straight across each triangle, would bend only at their edges: his skin would be lit in
    # flat facets. Blurred over his uv a little, it bends smoothly)
    vals[..., 7:9] = blur(vals[..., 7:9], covered, BLUR * size / 2048)

    # what of it shows: his skin and ears as the figure is built (its second uv), and round that; his eyes
    me = fig.data
    names = [m.name for m in me.materials]
    bodyuv = np.zeros(len(me.loops) * 2)
    me.uv_layers['BodyUV'].data.foreach_get('uv', bodyuv)
    bodyuv = bodyuv.reshape(-1, 2)
    shows = []
    for p in me.polygons:
        if names[p.material_index] in ('skin', 'ear'):
            li = list(p.loop_indices)
            shows += [(li[0], li[k], li[k + 1]) for k in range(1, len(li) - 1)]
    suv = bodyuv[np.array(shows)]
    suv[..., 1] = 1 - suv[..., 1]
    seen = raster_uv(suv, np.ones(suv.shape[:2] + (1,)), size)[1] > 0
    # (his ears: the curve of his skin is their rims)
    ear_uv = bodyuv[np.array([(li[0], li[k], li[k + 1]) for p in me.polygons if names[p.material_index] == 'ear' for li in [list(p.loop_indices)] for k in range(1, len(li) - 1)])]
    ear_uv[..., 1] = 1 - ear_uv[..., 1]
    on_ear = raster_uv(ear_uv, np.ones(ear_uv.shape[:2] + (1,)), size)[1] > 0
    on_ear = dilate(on_ear.astype(np.float64), on_ear, 4) > 0.5
    eyes = [list(f) for f in man.eyes]
    euv = np.array([[man.uv_of[tuple(f)][j] for j in (0, k, k + 1)] for f in eyes for k in range(1, len(f) - 1)])
    euv[..., 1] = 1 - euv[..., 1]
    on_eye = raster_uv(euv, np.ones(euv.shape[:2] + (1,)), size)[1] > 0
    on_eye = dilate(on_eye.astype(np.float64), on_eye, 2) > 0.5
    near = dilate(seen.astype(np.float64), seen, GUTTER) > 0.5
    work = covered & near & ~on_eye
    at = np.where(work.ravel())[0]
    X = vals.reshape(-1, vals.shape[2])[at]
    Xp, Xn, Xk, Xlean, Xcurve, Xface = X[:, :3], unit(X[:, 3:6]), X[:, 6], X[:, 7], X[:, 8], X[:, 9]
    Xear = on_ear.ravel()[at].astype(np.float64)

    # the features, found on their man's skin and put on each texel near one
    skin = Skin(P, faces)
    frames = limbs(man.rig)
    step = 1.5 / np.median(kmm[used])
    rng = np.random.default_rng(7)
    form = np.zeros(len(at))
    vein = np.zeros(len(at))
    mirror = np.array([-1.0, 1.0, 1.0])
    found = {}
    for row in FEATURES:
        name, kind, height, width, where = row[:5]
        sides = row[5] if len(row) > 5 else 2
        places = [(place(skin, frames, seg, t, r)[0], k) for seg, t, r, k in where]
        # (a vein wanders up to 2.5 mm off its line, the same way on both his arms)
        wander = (2.5 / np.median(kmm[used]), rng) if kind == 'vein' else None
        pts, pn, share, along = line_of(skin, places, step, wander)
        lines = [(pts, pn)]
        if sides == 2:
            got = [skin.near(p * mirror) for p in pts]
            lines.append((np.array([g[0] for g in got]), np.array([g[1] for g in got])))
        # (how far from it a texel can feel it, in their decimetres where theirs are smallest on him)
        reach = (width * (1.5 if kind in ('groove', 'ridge') else 0.7) + (7 if kind == 'ring' else 0) + (PLATE_EDGE if kind == 'plate' else 0)) / Xk.clip(60).min()
        for lp, ln in lines:
            d, sg, fr = nearest(Xp, lp, reach=reach)
            hit = np.isfinite(d)
            if not hit.any():
                log(f'[models] anatomy: {name} found on no texel')
                continue
            i = np.where(hit)[0]
            j = np.minimum(sg[i] + 1, len(lp) - 1)
            s = along[sg[i]] + (along[j] - along[sg[i]]) * fr[i]
            sh = share[sg[i]] + (share[j] - share[sg[i]]) * fr[i]
            fade = smoothstep(0, TAPER, s * Xk[i]) * smoothstep(0, TAPER, (along[-1] - s) * Xk[i]) if len(lp) > 1 else 1.0
            # (a texel facing away from the line, through a finger or across a crease, is not under it)
            facing = smoothstep(0.15, 0.5, (Xn[i] * ln[sg[i]]).sum(1))
            h = height * sh * fade * facing * profile(kind, d[i] * Xk[i], width)
            if kind == 'ring':
                # (open over its top, and faded where it would cut across what runs on straight down from it)
                a, b, _f = frames[where[0][0]]
                down = unit(b - a)
                way = ((Xp[i] - lp[0]) @ down) / np.maximum(np.linalg.norm(Xp[i] - lp[0], axis=1), 1e-9)
                h *= smoothstep(0.35, -0.1, -way) * (1 - 0.8 * smoothstep(0.8, 0.97, way))
            if kind == 'vein':
                vein[i] = np.maximum(vein[i], h)
            else:
                form[i] += h
            found[name] = found.get(name, 0) + len(i)

    # his face: only what is fixed in a face and small. The columns under his nose (from his upper lip's edge to the
    # foot of his nose, a little apart), and the edge of his lips
    lm = man.lm
    # (down the middle of his face, its outermost point every hundredth of a decimetre: the foot of his nose is the
    # deepest of them over his mouth, the edge of his upper lip the furthest out under that)
    ys = np.arange(lm.mouth[1], lm.nose[1], 0.01)
    outer = []
    for y in ys:
        hit = skin.cast((0.0, y, lm.nose[2] + 1.0), (0, 0, -1), 2.0)
        outer.append(hit[0][2] if hit is not None else -np.inf)
    outer = np.array(outer)
    up = ys > lm.mouth[1] + 0.15
    foot = ys[up][outer[up].argmin()]
    below = ys < foot - 0.04
    lip_top = ys[below][outer[below].argmax()]
    face_form = np.zeros(len(at))
    for sd in (1, -1):
        # (each column some 6 mm off his middle at his lip, closer under his nose)
        col = []
        for k in np.linspace(0, 1, 6):
            y = lip_top + 0.012 + (foot - 0.008 - lip_top - 0.012) * k
            x = sd * (0.05 - 0.012 * k)
            hit = skin.cast((x, y, lm.nose[2] - 0.7), (0, 0, 1))
            if hit is not None:
                col.append(hit[0])
        pts, pn, share, along = line_of(skin, [(p, 1.0) for p in col], step)
        d, sg, fr = nearest(Xp, pts, reach=0.08)
        i = np.where(np.isfinite(d))[0]
        face_form[i] += 0.3 * profile('ridge', d[i] * Xk[i], 2.5) * smoothstep(0, 0.012, along[sg[i]]) * smoothstep(0, 0.012, along[-1] - along[sg[i]])
    # (his upper lip's edge, a faint rim: where what fills it comes to an eighth of its most. His lower lip's would be
    # a line drawn under it)
    edge = contour(P, faces, lips, 0.12)
    edge = edge[edge[:, :, 1].mean(1) > lm.mouth[1]] if len(edge) else edge
    if not len(edge):
        raise RuntimeError('anatomy: no edge to his lips')
    A, B = edge[:, 0], edge[:, 1]
    lo, hi = np.minimum(A, B).min(0) - 0.05, np.maximum(A, B).max(0) + 0.05
    i = np.where(np.all((Xp >= lo) & (Xp <= hi), axis=1))[0]
    AB = B - A
    u = np.clip(((Xp[i][:, None] - A[None]) * AB[None]).sum(2) / np.maximum((AB * AB).sum(1), 1e-12)[None], 0, 1)
    dd = np.linalg.norm(Xp[i][:, None] - (A[None] + u[..., None] * AB[None]), axis=2).min(1)
    face_form[i] += 0.125 * profile('ridge', dd * Xk[i], 1.6)

    # all of it: his body's, fading into his face's (bent over smoothly short of FACE_MM), his veins on his body only.
    # His scalp and his brow are smooth: the curve of his skin is on his face only below his brows and in front of his
    # cheekbones' ends, and on his ears' rims; his lean man's swell is off his head too (on a shaved head they were a
    # skull's gentle undulations, and a byte's stairs in them drew rings like a map's)
    eye = man.lm.eye
    front = smoothstep(eye[2] - 0.65, eye[2] - 0.35, Xp[:, 2]) * smoothstep(eye[1] + 0.3, eye[1] + 0.1, Xp[:, 1])
    smooth_ = 1 - smoothstep(0.1, 0.6, Xface) * (1 - np.maximum(front, Xear))
    body = (LEAN * Xlean + Xcurve) * smooth_ + form
    total = body * (1 - Xface) + FACE_MM * np.tanh((Xcurve * smooth_ + face_form) / FACE_MM) * Xface
    # (as it is up to KNEE, then bent over smoothly so that nothing reaches past FORM_MM: a height cut off flat would
    # light as a flat patch)
    big = np.abs(total) > KNEE
    total[big] = np.sign(total[big]) * (KNEE + (FORM_MM - KNEE) * np.tanh((np.abs(total[big]) - KNEE) / (FORM_MM - KNEE)))
    vein *= 1 - Xface

    img = np.zeros((size * size, 2))
    img[at, 0] = total
    img[at, 1] = vein
    img = dilate(img.reshape(size, size, 2), work, GUTTER)
    img[~near | on_eye] = 0.0
    img[0, 0] = 0.0

    def put(img, name):
        n = len(img)
        px = np.zeros((n, n, 2), dtype=np.uint8)
        px[..., 0] = np.clip(np.round(128 + 127 * img[..., 0] / FORM_MM), 1, 255)
        px[..., 1] = np.clip(np.round(255 * img[..., 1] / VEIN_MM), 0, 255)
        return write_png(os.path.join(out, name), px)

    nbytes = put(img, 'skin-anat.png')
    # (a phone's: each 2 by 2 of its heights in one, before they are put in bytes)
    small = 0.25 * (img[0::2, 0::2] + img[1::2, 0::2] + img[0::2, 1::2] + img[1::2, 1::2])
    small[0, 0] = 0.0
    nsmall = put(small, SMALL)

    # the probes: a point of his skin as built (one of their points, on no seam of the uv, the only one at its place)
    # at each, its place on the grid and its uv as the file has it
    mhv = np.zeros(len(me.vertices))
    me.attributes['mhv'].data.foreach_get('value', mhv)
    lv = np.zeros(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', lv)
    skin_loop = np.zeros(len(me.loops), dtype=bool)
    for p in me.polygons:
        if names[p.material_index] in ('skin', 'ear'):
            skin_loop[list(p.loop_indices)] = True
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)[:, [0, 2, 1]] * np.array([1, 1, -1])
    cell = np.round(co / GRID).astype(np.int64)
    uvs_of = {}
    for li in np.where(skin_loop)[0]:
        uvs_of.setdefault(int(lv[li]), set()).add((float(bodyuv[li, 0]), float(bodyuv[li, 1])))
    taken = {}
    for v in uvs_of:
        taken.setdefault(tuple(cell[v]), []).append(v)
    by_mh = {}
    for v, uvs in uvs_of.items():
        m = mhv[v]
        if len(uvs) == 1 and abs(m - round(m)) < 1e-4 and len(taken[tuple(cell[v])]) == 1:
            by_mh[int(round(m)) - 1] = v
    pool = np.array(sorted(by_mh))
    probes = []
    for name, (seg, t, r) in PROBES.items():
        p = place(skin, frames, seg, t, r)[0]
        for sd, tag in ((1, '.L'), (-1, '.R')):
            q = p * np.array([sd, 1, 1])
            v = by_mh[int(pool[np.linalg.norm(P[pool] - q, axis=1).argmin()])]
            (u_, v_), = uvs_of[v]
            probes.append({'name': name + tag, 'pos': [float(c * GRID) for c in cell[v]], 'uv1': [round(u_, 7), round(1 - v_, 7)]})
    # (laid out as prettier lays it out: the repo's formatter checks it as it checks any file)
    rows = ',\n'.join('    {\n' + ',\n'.join(f'      {json.dumps(k)}: {json.dumps(v)}' for k, v in p.items()) + '\n    }' for p in probes)
    with open(os.path.join(out, 'anat.json'), 'w') as f:
        f.write(f'{{\n  "size": {size},\n  "formMM": {FORM_MM},\n  "veinMM": {VEIN_MM},\n  "probes": [\n{rows}\n  ]\n}}\n')

    # how fine it is where: mm on him a texel, by what their weights say a place is
    texel = np.sqrt(area_q * MM * MM / np.maximum(np.abs(np.cross(tuv[:, 1] - tuv[:, 0], tuv[:, 2] - tuv[:, 0])) / 2 * size * size, 1e-12))
    at_tri = lambda share: share[tri].mean(1)  # noqa: E731
    rig = man.rig
    region = {
        'forearm': mhbody.shares(rig, n, {'lowerarm01.L', 'lowerarm02.L', 'lowerarm01.R', 'lowerarm02.R'}),
        'upper arm': mhbody.shares(rig, n, {'upperarm01.L', 'upperarm02.L', 'upperarm01.R', 'upperarm02.R'}),
        'hand': mhbody.shares(rig, n, {b for b in rig.bones if b.startswith(('wrist', 'metacarpal', 'finger'))}),
        'shin': mhbody.shares(rig, n, {'lowerleg01.L', 'lowerleg02.L', 'lowerleg01.R', 'lowerleg02.R'}),
        'face': (man.head > 0.999) & (nrm[:, 2] > 0.3),
    }
    fine = ', '.join(f'{k} {np.median(texel[at_tri(v.astype(np.float64)) > 0.7]):.2f}' for k, v in region.items())
    if os.environ.get('ANAT_DEBUG'):
        np.savez(os.environ['ANAT_DEBUG'], at=at, X=X, form=total, vein=vein, size=size)
    log(
        f'[models] anatomy: {size} x {size}, mm a texel: {fine}; uv on {covered.mean() * 100:.1f}%, {twice} texels laid twice, '
        f'{seen.mean() * 100:.1f}% shows; form {np.percentile(total, 1):.2f}..{np.percentile(total, 99):.2f} mm, veins to {vein.max():.2f} mm; '
        f'{len(found)} of {len(FEATURES)} features found; {nbytes} bytes ({nsmall} at half); {time.time() - t0:.1f} s'
    )
    return nbytes
