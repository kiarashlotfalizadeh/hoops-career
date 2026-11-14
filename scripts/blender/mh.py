# Faces of men who are not all one man: what tells one face from another, taken from a real model of a
# head and put on ours. The model is MakeHuman's (its base mesh, hm08, and its "targets": how each of its
# points moves for a broader nose, a heavier brow, a fuller lip, a squarer jaw, and for the average young
# African, Asian and European man), released CC0 (data/raw/makehuman, fetched from the MakeHuman
# project's own repository: makehumancommunity/makehuman, makehuman/data). Nothing of its mesh is
# drawn: our head keeps its own points, its face's picture and everything the app draws by them. What
# comes over is how far each of our head's points moves, for each target (`shapes`): figure.py writes
# that beside the model (faces.bin), and the app puts a man's own mix of them on his head (look.ts
# `shapeOf`, figure.ts).
#
# How a point of ours finds its place on their head: the two heads are laid one on the other by where
# their eyes, nose, mouth and chin are (an affine fit, each axis its own scale), and a ray in from
# outside our point, toward the middle of our head, meets their skin; what their target moves there
# (between the three points of the triangle it meets) is what it moves ours, in our head's scale.
import math
import os

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'raw', 'makehuman')

# What comes over, and from which of their targets: a name of ours, then the target that moves it one way
# (and the one that moves it the other, whose move is taken off: a signed shape, -1..1).
SHAPES = [
    # (the head's own shape)
    ('oval', 'head-oval', None),
    ('round', 'head-round', None),
    ('square', 'head-square', None),
    ('triangle', 'head-triangular', None),
    ('heart', 'head-invertedtriangular', None),
    ('diamond', 'head-diamond', None),
    ('oblong', 'head-rectangular', None),
    ('fat', 'head-fat-incr', 'head-fat-decr'),
    # (the nose)
    ('hump', 'nose-hump-incr', 'nose-hump-decr'),
    ('flare', 'nose-flaring-incr', 'nose-flaring-decr'),
    ('tip', 'nose-point-width-incr', 'nose-point-width-decr'),
    ('nostrils', 'nose-nostrils-width-incr', 'nose-nostrils-width-decr'),
    ('noseLong', 'nose-scale-vert-incr', 'nose-scale-vert-decr'),
    ('greek', 'nose-greek-incr', 'nose-greek-decr'),
    ('curve', 'nose-curve-convex', 'nose-curve-concave'),
    ('tipUp', 'nose-point-up', 'nose-point-down'),
    ('noseOut', 'nose-scale-depth-incr', 'nose-scale-depth-decr'),
    ('noseBig', 'nose-volume-incr', 'nose-volume-decr'),
    # (the chin and jaw)
    ('chinOut', 'chin-prominent-incr', 'chin-prominent-decr'),
    ('chinWide', 'chin-width-incr', 'chin-width-decr'),
    ('chinLong', 'chin-height-incr', 'chin-height-decr'),
    ('cleft', 'chin-cleft-incr', None),
    ('jawBone', 'chin-bones-incr', 'chin-bones-decr'),
    ('underbite', 'chin-prognathism-incr', 'chin-prognathism-decr'),
    # (the cheeks)
    ('cheekBone', ('l-cheek-bones-incr', 'r-cheek-bones-incr'), ('l-cheek-bones-decr', 'r-cheek-bones-decr')),
    ('cheekFull', ('l-cheek-volume-incr', 'r-cheek-volume-incr'), ('l-cheek-volume-decr', 'r-cheek-volume-decr')),
    ('cheekIn', ('l-cheek-inner-incr', 'r-cheek-inner-incr'), ('l-cheek-inner-decr', 'r-cheek-inner-decr')),
    # (the mouth)
    ('upperLip', 'mouth-upperlip-volume-incr', 'mouth-upperlip-volume-decr'),
    ('lowerLip', 'mouth-lowerlip-volume-incr', 'mouth-lowerlip-volume-decr'),
    ('mouthWide', 'mouth-scale-horiz-incr', 'mouth-scale-horiz-decr'),
    ('bow', 'mouth-cupidsbow-incr', 'mouth-cupidsbow-decr'),
    ('corners', 'mouth-angles-up', 'mouth-angles-down'),
    ('philtrum', 'mouth-philtrum-volume-incr', 'mouth-philtrum-volume-decr'),
    ('laugh', 'mouth-laugh-lines-in', 'mouth-laugh-lines-out'),
    # (the eyes)
    ('bags', ('l-eye-bag-incr', 'r-eye-bag-incr'), ('l-eye-bag-decr', 'r-eye-bag-decr')),
    ('hooded', ('l-eye-eyefold-down', 'r-eye-eyefold-down'), ('l-eye-eyefold-up', 'r-eye-eyefold-up')),
    ('epicanthus', ('l-eye-epicanthus-in', 'r-eye-epicanthus-in'), ('l-eye-epicanthus-out', 'r-eye-epicanthus-out')),
    ('deepSet', ('l-eye-push1-in', 'r-eye-push1-in'), ('l-eye-push1-out', 'r-eye-push1-out')),
    # (the brow and forehead)
    ('browOut', 'eyebrows-trans-forward', 'eyebrows-trans-backward'),
    ('browTilt', 'eyebrows-angle-up', 'eyebrows-angle-down'),
    ('nubian', 'forehead-nubian-incr', 'forehead-nubian-decr'),
    ('temples', 'forehead-temple-incr', 'forehead-temple-decr'),
    ('slope', 'forehead-trans-backward', 'forehead-trans-forward'),
]
# (and the three averages, each off the mean of the three, and how a face ages)
KINDS = ['african', 'asian', 'caucasian']


def _obj():
    verts, groups, g = [], {}, None
    with open(os.path.join(ROOT, 'base.obj')) as f:
        for line in f:
            if line.startswith('v '):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('g '):
                g = line.split()[1]
                groups.setdefault(g, [])
            elif line.startswith('f '):
                groups[g].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
    return np.array(verts), groups


def _target(name, n):
    d = np.zeros((n, 3))
    with open(os.path.join(ROOT, 'targets', name + '.target')) as f:
        for line in f:
            if line[0] == '#' or not line.strip():
                continue
            p = line.split()
            d[int(p[0])] = [float(x) for x in p[1:4]]
    return d


def _of(spec, n):
    if spec is None:
        return np.zeros((n, 3))
    if isinstance(spec, tuple):
        return sum(_target(s, n) for s in spec)
    return _target(spec, n)


class Theirs:
    """Their head: its points (the average young man of the three), triangles, landmarks, and what each shape moves."""

    def __init__(self):
        V, G = _obj()
        n = len(V)
        self.n = n
        eye_ix = [sorted({i for f in G[k] for i in f}) for k in ('joint-l-eye', 'joint-r-eye')]
        body = G['body']

        def eyes(P):
            return [P[ix].mean(0) for ix in eye_ix]

        def mouth_y(P):
            return P[self.lip_ix, 1].mean()

        # where the head is: over the neck's joint
        neck = V[sorted({i for f in G['joint-neck'] for i in f})].mean(0)
        self.polys = [f for f in body if min(V[i][1] for i in f) > neck[1] + 0.25]
        hv = sorted({i for f in self.polys for i in f})
        self.head_ix = np.array(hv)
        # (the middle of the mouth: the points the target that widens it moves least, on its line)
        mw = _target('mouth-scale-horiz-incr', n)
        moved = np.where(np.abs(mw[:, 0]) > 1e-6)[0]
        self.lip_ix = moved

        # each kind's young man, laid on the base's eyes and size (his head's own place and size are not his face)
        def laid(P):
            el, er = eyes(P)
            mid = (el + er) / 2
            span = np.linalg.norm(el - er) + abs(mid[1] - mouth_y(P))
            return mid, span

        mid0, span0 = laid(V)
        young = {}
        for k in KINDS:
            P = V + _target(f'{k}-male-young', n)
            mid, span = laid(P)
            young[k] = (P - mid) * (span0 / span) + mid0
        mean = sum(young.values()) / len(KINDS)
        self.V = mean
        self.moves = {}
        for k in KINDS:
            self.moves[k] = young[k] - mean
        # (how a face ages: each kind's old man off its young one, the three's mean)
        aged = []
        for k in KINDS:
            P = V + _target(f'{k}-male-old', n)
            mid, span = laid(P)
            aged.append((P - mid) * (span0 / span) + mid0 - young[k])
        self.moves['age'] = sum(aged) / len(aged)
        for name, plus, minus in SHAPES:
            self.moves[name] = (_of(plus, n) - _of(minus, n)) * (0.5 if minus is not None else 1.0)
        tris = []
        for f in self.polys:
            for k in range(1, len(f) - 1):
                tris.append((f[0], f[k], f[k + 1]))
        self.tris = tris
        self.tree = BVHTree.FromPolygons([Vector(p) for p in mean], tris, all_triangles=True)

        # landmarks (their frame): the eyes' middles, the tip of the nose, the corners of the mouth, the chin's front,
        # the crown, the back of the head
        P = mean
        el, er = eyes(P)
        H = P[self.head_ix]
        midline = H[np.abs(H[:, 0]) < 0.02]
        face = midline[midline[:, 2] > 0.5]
        self.nose = face[face[:, 2].argmax()]
        # (the corners of the mouth: the point turning them up moves furthest)
        up = _target('mouth-angles-up', n)
        corner = np.abs(P[np.argmax(np.linalg.norm(up, axis=1))])
        self.mouth = np.array([abs(corner[0]), corner[1], corner[2]])
        chin_t = _target('chin-prominent-incr', n)
        ci = np.argmax(chin_t[:, 2] * (np.abs(P[:, 0]) < 0.02))
        self.chin = P[ci]
        self.crown = midline[midline[:, 1].argmax()]
        self.back = midline[midline[:, 2].argmin()]
        self.eye = (el + er) / 2
        self.eye_x = abs(el[0] - er[0]) / 2


def fit(ours, theirs):
    """
    Each axis of theirs onto ours (a scale and an offset each): x by the eyes and the mouth's corners, y and z by
    everything. `ours` holds the same landmarks as Theirs, in our frame. Returns (scale, offset): ours = theirs * s + o.
    """
    s, o = [0.0] * 3, [0.0] * 3
    # x: no offset (both heads are about x = 0)
    s[0] = (2 * ours['eye_x'] / theirs.eye_x + ours['mouth'][0] / theirs.mouth[0]) / 3
    for ax in (1, 2):
        # (up and down by the face, which is what moves: ours is the taller skull, a figurine's; in and out by the
        # face and the back of the head, but not the eyes, whose middles are inside their balls on theirs and on the
        # skin on ours)
        use = ['eye', 'nose', 'mouth', 'chin'] if ax == 1 else ['nose', 'mouth', 'chin', 'back']
        a = np.array([[getattr(theirs, k)[ax], 1.0] for k in use])
        b = np.array([ours[k][ax] for k in use])
        (s[ax], o[ax]), *_ = np.linalg.lstsq(a, b, rcond=None)
    return np.array(s), np.array(o)


LANDMARKS = ('eye', 'nose', 'mouth', 'chin', 'crown', 'back')


def warp(ours, theirs, s, o, reach=0.45):
    """
    What the affine fit leaves over, put right: each landmark of ours (both eyes and both corners of the mouth) is
    carried exactly onto theirs, and the space round it with it, less and less over `reach` (theirs' units, dm).
    Returns a function from a point of ours (in their frame by the fit) to its place on theirs.
    """
    src, dst = [], []
    for k in LANDMARKS:
        a = np.array(ours[k], dtype=float)
        b = np.array(getattr(theirs, k), dtype=float)
        sides = (1, -1) if k in ('eye', 'mouth') else (1,)
        for sd in sides:
            aa = a.copy()
            bb = b.copy()
            if k == 'eye':
                aa[0] = sd * ours['eye_x']
                bb[0] = sd * theirs.eye_x
                # (their eye's middle is inside its ball: carried across and up, not in)
                bb[2] = ((aa - o) / s)[2]
            elif k == 'mouth':
                aa[0] = sd * abs(aa[0])
                bb[0] = sd * abs(bb[0])
            src.append((aa - o) / s)
            dst.append(bb)
    src, dst = np.array(src), np.array(dst)
    phi = lambda r: np.exp(-((r / reach) ** 2))  # noqa: E731
    K = phi(np.linalg.norm(src[:, None] - src[None], axis=2))
    W = np.linalg.solve(K + 1e-9 * np.eye(len(src)), dst - src)

    def at(q):
        return q + phi(np.linalg.norm(src - q, axis=1)) @ W

    return at


def shapes(theirs, points, centre, s, o, weight, ours=None, skin=None):
    """
    What each of theirs' shapes moves each of our points (ours' frame, feet): {name: (n, 3) array}. A point is found
    on their head by a ray in toward our head's middle; `weight(p)` says how much of the move a point takes (the
    crown and the back of the head none: hair and what stands on it stay where they are).
    """
    s, o = np.asarray(s), np.asarray(o)
    c = (np.asarray(centre) - o) / s
    move = warp(ours, theirs, s, o) if ours else (lambda q: q)
    c = move(c)
    out = {k: np.zeros((len(points), 3)) for k in theirs.moves}
    # (and 'real': how far our point is from their skin, there: our head taken onto theirs)
    out['real'] = np.zeros((len(points), 3))
    T = theirs.tris
    V = theirs.V
    found = 0
    for i, p in enumerate(points):
        w = weight(p)
        if w <= 0:
            continue
        q0 = (np.asarray(p) - o) / s
        q = move(q0)
        d = q - c
        ln = np.linalg.norm(d)
        if ln < 1e-9:
            continue
        d /= ln
        start = c + d * (ln + 3.0)
        hit, _n, f, _dist = theirs.tree.ray_cast(Vector(start), Vector(-d))
        if hit is None:
            continue
        found += 1
        a, b, cc = (V[j] for j in T[f])
        # (where on the triangle: its three corners' shares)
        v0, v1, v2 = b - a, cc - a, np.array(hit) - a
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d20, d21 = v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01 or 1e-12
        bv = (d11 * d20 - d01 * d21) / den
        bw = (d00 * d21 - d01 * d20) / den
        bu = 1 - bv - bw
        # (a point inside, a tooth, moves as our skin in front of it does: `skin(p)`, our skin's point on that ray)
        back = (np.array(hit) - (q - q0)) * s + o
        out['real'][i] = (back - np.asarray(skin(p) if skin else p)) * w
        for k, m in theirs.moves.items():
            mv = bu * m[T[f][0]] + bv * m[T[f][1]] + bw * m[T[f][2]]
            out[k][i] = mv * s * w
    return out, found
