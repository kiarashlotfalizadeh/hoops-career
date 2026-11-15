# The player's own body and head: a real man's, not masses fused by a formula. It is MakeHuman's base
# mesh (hm08, CC0: data/raw/makehuman, see mh.py), made the average young man of its three kinds, lean
# and muscled as a ball player is, and then stood as the game's puppet stands: its joints on the
# puppet's (figure.py's measures), arms straight and out from his sides, legs under his hips, his
# fingers and thumb along the lines figure.ts turns them on. Each point is carried there by the bones
# MakeHuman itself hangs it on (its default rig and weights: data/raw/makehuman/rigs), each bone taken
# from where it is to where ours is (a turn, a stretch along it, a scale across it), so an elbow
# straightened or a shoulder set wider keeps the shape their modellers gave it.
#
# His head is laid on the head figure.py's formula makes (head_r), feature on feature (eyes, nose,
# mouth, chin, crown: an affine fit, then each landmark carried exactly), because everything the app
# does to a face it does by where that formula put it: it paints his eyes and lips there, moves his
# mouth and brows there, hangs his jaw there.
import json
import math
import os

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'raw', 'makehuman')
KINDS = ('african', 'asian', 'caucasian')
# how muscled and how heavy he is (MakeHuman's own scales, 0..1: 0.5 the average man)
MUSCLE, WEIGHT = 1.0, 0.5
# how much wider than his height alone makes it his chest is at the shoulders (the puppet's are a ball player's)
CHEST_WIDE = 1.14
# how much thicker than his height alone makes them his limbs, his trunk (front to back) and his neck are
LIMB, DEEP, NECK = 1.07, 1.1, 1.16
# how much of his hand's turn about his forearm each half of the forearm takes
TWIST = (0.35, 0.85)
# how thick his palm is for theirs, and how far over it sits toward its back from the line of his arm (ft)
PALM_THIN, PALM_OVER = 0.72, 0.016


def read_obj():
    """Their mesh: its points, each group's faces, and each face's uv (unused: the app lays its own)."""
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


def read_target(path, n):
    d = np.zeros((n, 3))
    with open(path) as f:
        for line in f:
            if line[0] == '#' or not line.strip():
                continue
            p = line.split()
            d[int(p[0])] = [float(x) for x in p[1:4]]
    return d


def target(name, n):
    for sub in ('targets', 'body'):
        p = os.path.join(ROOT, sub, name + '.target')
        if os.path.exists(p):
            return read_target(p, n)
    raise FileNotFoundError(name)


def athlete(V):
    """The base mesh as our man: the mean of the three kinds' young men, muscled and lean."""
    n = len(V)
    P = V + sum(target(f'{k}-male-young', n) for k in KINDS) / len(KINDS)
    # (MakeHuman's own way of mixing: each of muscle and weight between its average and its end)
    mu, we = (MUSCLE - 0.5) * 2, (WEIGHT - 0.5) * 2
    mus = {'maxmuscle': max(0.0, mu), 'averagemuscle': 1 - abs(mu), 'minmuscle': max(0.0, -mu)}
    wes = {'maxweight': max(0.0, we), 'averageweight': 1 - abs(we), 'minweight': max(0.0, -we)}
    for m, a in mus.items():
        for w, b in wes.items():
            if a * b > 0 and (m, w) != ('averagemuscle', 'averageweight'):
                P = P + a * b * target(f'universal-male-young-{m}-{w}', n)
    return P


class Rig:
    """Their bones (heads and tails from the mesh's own joint markers) and what each point hangs on."""

    def __init__(self, P):
        with open(os.path.join(ROOT, 'rigs', 'default.mhskel')) as f:
            sk = json.load(f)
        self.at = {k: P[v].mean(0) for k, v in sk['joints'].items()}
        self.bones = {k: (self.at[b['head']], self.at[b['tail']], b['parent']) for k, b in sk['bones'].items()}
        with open(os.path.join(ROOT, 'rigs', 'default_weights.mhw')) as f:
            self.weights = json.load(f)['weights']

    def head(self, b):
        return self.bones[b][0]

    def tail(self, b):
        return self.bones[b][1]


def arc(a, b):
    """The least turn that takes direction a to direction b (3x3)."""
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v = np.cross(a, b)
    c = float(a @ b)
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def about(axis, ang):
    axis = axis / np.linalg.norm(axis)
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(ang) * k + (1 - math.cos(ang)) * (k @ k)


def affine(lin, h, H):
    """The 3x4 that takes p to H + lin (p - h)."""
    return np.hstack([lin, (H - lin @ h)[:, None]])


def seg(h, t, H, T, across, roll=0.0, turn=None):
    """A bone from h..t taken to H..T: turned the least way (after `turn`, if the limb it is on is already turned), rolled about itself, stretched along itself, scaled `across`."""
    d0 = (t - h) / np.linalg.norm(t - h)
    d1 = (T - H) / np.linalg.norm(T - H)
    base = turn if turn is not None else np.eye(3)
    R = about(d1, roll) @ arc(base @ d0, d1) @ base
    along = np.linalg.norm(T - H) / np.linalg.norm(t - h)
    M = across * (np.eye(3) - np.outer(d0, d0)) + along * np.outer(d0, d0)
    return affine(R @ M, h, H)


def pose(P, rig, m, digits, head_fit):
    """
    Each of their points where it is on the puppet as built. `m`: figure.py's measures (HIP, KN_Y, AN_Y, HIP_W,
    SHOULDER, SH_Y, UARM, FARM, ARM_OUT); `digits`: figure.py's DIGITS (each finger's line, by side, in the
    arm's frame); `head_fit`: (scale, offset) of their head onto ours, each axis its own.
    Returns the points (game frame, ft) and each bone's 3x4.
    """
    hipL, kneeL, ankL = rig.head('upperleg01.L'), rig.head('lowerleg01.L'), rig.head('foot.L')
    shL = rig.head('upperarm01.L')
    ft = (m['HIP'] - m['AN_Y']) / (np.linalg.norm(kneeL - hipL) + np.linalg.norm(ankL - kneeL))
    sx_hip = m['HIP_W'] / hipL[0]
    sx_sh = ft * CHEST_WIDE
    sy = (m['SH_Y'] - m['HIP']) / (shL[1] - hipL[1])
    y0, y1 = hipL[1], shL[1]
    z0, z1 = hipL[2], shL[2]

    def field(p):
        """Where a point of his trunk goes, and how the space round it is stretched there."""
        t = (p[1] - y0) / (y1 - y0)
        k = min(1.0, max(0.0, (t - 0.1) / 0.6))
        k = k * k * (3 - 2 * k)
        sx = sx_hip + (sx_sh - sx_hip) * k
        yy = m['HIP'] + (p[1] - y0) * (sy if 0 <= t <= 1 else ft) + (0 if t <= 1 else (y1 - y0) * (sy - ft))
        zc = z0 + (z1 - z0) * min(1.0, max(0.0, t))
        return np.array([sx * p[0], yy, ft * DEEP * (p[2] - zc)]), np.diag([sx, sy if 0 <= t <= 1 else ft, ft * DEEP])

    A = {}

    def trunk(b):
        h = rig.head(b)
        at, lin = field(h)
        A[b] = affine(lin, h, at)

    for b in ('root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01'):
        trunk(b)
    # (his neck: a ball player's, thick from his shoulders up)
    h = rig.head('neck01')
    at, lin = field(h)
    A['neck01'] = affine(lin @ np.diag([NECK, 1.0, NECK / DEEP]), h, at)
    hs, ho = (np.asarray(v, dtype=float) for v in head_fit)
    A['head'] = np.hstack([np.diag(hs), ho[:, None]])
    A['neck02'] = 0.6 * A['neck01'] + 0.4 * A['head']
    A['neck03'] = 0.25 * A['neck01'] + 0.75 * A['head']

    for s, sfx in ((1, 'L'), (-1, 'R')):
        mir = np.array([s, 1, 1])
        # the leg: under his hip
        hip, knee, ank = (rig.head(f'{b}.{sfx}') for b in ('upperleg01', 'lowerleg01', 'foot'))
        Ht = np.array([s * m['HIP_W'], m['HIP'], 0.0])
        Kt = np.array([s * m['HIP_W'], m['KN_Y'], 0.0])
        At = np.array([s * m['HIP_W'], m['AN_Y'], 0.0])
        A[f'pelvis.{sfx}'] = A['root']
        A[f'upperleg01.{sfx}'] = A[f'upperleg02.{sfx}'] = seg(hip, knee, Ht, Kt, ft * LIMB)
        A[f'lowerleg01.{sfx}'] = A[f'lowerleg02.{sfx}'] = A[f'foot.{sfx}'] = seg(knee, ank, Kt, At, ft * LIMB)

        # the arm: straight, out from his side
        sh, el, wr = (rig.head(f'{b}.{sfx}') for b in ('upperarm01', 'lowerarm01', 'wrist'))
        a = s * m['ARM_OUT']
        d = np.array([math.sin(a), -math.cos(a), 0.0])
        St = np.array([s * m['SHOULDER'], m['SH_Y'], 0.0])
        Et = St + d * m['UARM']
        Wt = Et + d * m['FARM']
        trunk(f'clavicle.{sfx}')
        ch = rig.head(f'shoulder01.{sfx}')
        A[f'shoulder01.{sfx}'] = seg(ch, sh, field(ch)[0], St, ft * LIMB)
        A[f'upperarm01.{sfx}'] = A[f'upperarm02.{sfx}'] = seg(sh, el, St, Et, ft * LIMB)
        # his hand: its back to the outside, its thumb's edge forward; scaled by wrist to middle knuckle
        lines = digits[s]
        frame = np.array([[math.cos(a), -math.sin(a), 0.0], [math.sin(a), math.cos(a), 0.0], [0.0, 0.0, 1.0]])
        local = lambda q: Wt + frame @ (np.asarray(q, dtype=float) + np.array([0.0, m['UARM'] + m['FARM'], 0.0]))  # noqa: E731
        kn_mh, ix_mh, pk_mh = (rig.head(f'finger{k}-1.{sfx}') for k in (3, 2, 5))
        down = (kn_mh - wr) / np.linalg.norm(kn_mh - wr)
        fwd = ix_mh - pk_mh
        fwd = fwd - down * (fwd @ down)
        fwd /= np.linalg.norm(fwd)
        theirs = np.stack([np.cross(-down, fwd), -down, fwd], axis=1)
        kn_ours = local(lines['kn'][1][0])
        ix_ours, pk_ours = local(lines['ix'][1][0]), local(lines['pk'][1][0])
        down_o = (kn_ours - Wt) / np.linalg.norm(kn_ours - Wt)
        fwd_o = ix_ours - pk_ours
        fwd_o = fwd_o - down_o * (fwd_o @ down_o)
        fwd_o /= np.linalg.norm(fwd_o)
        ours = np.stack([np.cross(-down_o, fwd_o), -down_o, fwd_o], axis=1)
        Rh = ours @ theirs.T
        kh = np.linalg.norm(kn_ours - Wt) / np.linalg.norm(kn_mh - wr)
        # (his palm a little thinner than theirs at that size, and about the line of his arm: the game puts a ball
        # against it, and knows where it is from the bone)
        n0 = theirs[:, 0]
        A[f'wrist.{sfx}'] = affine(Rh * kh @ (np.eye(3) - (1 - PALM_THIN) * np.outer(n0, n0)), wr, Wt + s * PALM_OVER * frame[:, 0])
        # (the forearm: straightened, and turned about itself as far as his hand is, more toward the wrist)
        d0 = (wr - el) / np.linalg.norm(wr - el)
        Ra = arc(d0, d)
        rel = Rh @ Ra.T
        # (how far rel turns about d)
        ref = np.cross(d, [0.0, 0.0, 1.0])
        ref /= np.linalg.norm(ref)
        to = rel @ ref
        roll = math.atan2(np.cross(ref, to) @ d, ref @ to)
        mid = rig.head(f'lowerarm02.{sfx}')
        Mt = Et + d * m['FARM'] * (np.linalg.norm(mid - el) / (np.linalg.norm(mid - el) + np.linalg.norm(wr - mid)))
        A[f'lowerarm01.{sfx}'] = seg(el, mid, Et, Mt, ft * LIMB, roll * TWIST[0])
        A[f'lowerarm02.{sfx}'] = seg(mid, wr, Mt, Wt, ft * 0.5 + kh * 0.5, roll * TWIST[1])
        # his fingers: each joint on ours (the knuckle, the middle joint), then on along our finger's line
        for k, name in ((2, 'ix'), (3, 'kn'), (4, 'rg'), (5, 'pk')):
            pts, (j1, _), (j2, _) = lines[name]
            a_, b_, c_, e_ = rig.head(f'finger{k}-1.{sfx}'), rig.head(f'finger{k}-2.{sfx}'), rig.head(f'finger{k}-3.{sfx}'), rig.tail(f'finger{k}-3.{sfx}')
            J1, J2, J3 = local(j1), local(j2), local(pts[2])
            tip = J3 + (local(pts[3]) - J3) * 1.25
            mc = f'metacarpal{k - 1}.{sfx}'
            mh_ = rig.head(mc)
            # (the bones of his palm, thinned as his wrist's share of it is: about each one's own line)
            lin = seg(mh_, a_, A[f'wrist.{sfx}'] @ np.append(mh_, 1.0), J1, kh, turn=Rh)[:, :3] @ (np.eye(3) - (1 - PALM_THIN) * np.outer(n0, n0))
            A[mc] = affine(lin, mh_, A[f'wrist.{sfx}'] @ np.append(mh_, 1.0))
            A[f'finger{k}-1.{sfx}'] = seg(a_, b_, J1, J2, kh, turn=Rh)
            A[f'finger{k}-2.{sfx}'] = seg(b_, c_, J2, J3, kh, turn=Rh)
            A[f'finger{k}-3.{sfx}'] = seg(c_, e_, J3, tip, kh, turn=Rh)
        pts, _, _ = lines['th']
        a_, b_, c_, e_ = rig.head(f'finger1-1.{sfx}'), rig.head(f'finger1-2.{sfx}'), rig.head(f'finger1-3.{sfx}'), rig.tail(f'finger1-3.{sfx}')
        T0, T1, T2, T3 = (local(p) for p in pts)
        A[f'finger1-1.{sfx}'] = seg(a_, b_, T0, T1, kh, turn=Rh)
        A[f'finger1-2.{sfx}'] = seg(b_, c_, T1, T2, kh, turn=Rh)
        A[f'finger1-3.{sfx}'] = seg(c_, e_, T2, T3 + (T3 - T2) * 0.2, kh, turn=Rh)
        del mir

    # (a bone of theirs we name no place for goes with the nearest one above it that has one)
    def of(b):
        while b not in A:
            b = rig.bones[b][2]
        return A[b]

    n = len(P)
    out = np.zeros((n, 3))
    tot = np.zeros(n)
    hom = np.hstack([P, np.ones((n, 1))])
    for b, pairs in rig.weights.items():
        if not pairs:
            continue
        idx = np.array([p[0] for p in pairs], dtype=int)
        w = np.array([p[1] for p in pairs])
        out[idx] += w[:, None] * (hom[idx] @ of(b).T)
        tot[idx] += w
    ok = tot > 1e-6
    out[ok] /= tot[ok][:, None]
    return out, {b: of(b) for b in rig.bones}, ok


def shares(rig, n, names):
    """How much of each point hangs on these bones of theirs, in all (their weights, each point's made to add to one)."""
    tot = np.zeros(n)
    part = np.zeros(n)
    for b, pairs in rig.weights.items():
        if not pairs:
            continue
        idx = np.array([p[0] for p in pairs], dtype=int)
        w = np.array([p[1] for p in pairs])
        tot[idx] += w
        if b in names:
            part[idx] += w
    return part / np.maximum(tot, 1e-9)


class Landmarks:
    """Where the features of their face are (their frame, on the points given), found as mh.py finds them."""

    def __init__(self, P, groups, rig):
        n = len(P)
        el, er = rig.head('eye.L'), rig.head('eye.R')
        neck = rig.at['neck03____head'] if 'neck03____head' in rig.at else rig.head('head')
        polys = [f for f in groups['body'] if min(P[i][1] for i in f) > neck[1] + 0.1]
        hv = np.array(sorted({i for f in polys for i in f}))
        H = P[hv]
        midline = H[np.abs(H[:, 0]) < 0.02]
        face = midline[midline[:, 2] > 0.5]
        self.nose = face[face[:, 2].argmax()]
        up = target('mouth-angles-up', n)
        corner = P[np.argmax(np.linalg.norm(up, axis=1))]
        self.mouth = np.array([abs(corner[0]), corner[1], corner[2]])
        chin_t = target('chin-prominent-incr', n)
        self.chin = P[np.argmax(chin_t[:, 2] * (np.abs(P[:, 0]) < 0.02))]
        self.crown = midline[midline[:, 1].argmax()]
        self.back = midline[midline[:, 2].argmin()]
        self.eye = (el + er) / 2
        self.eye_x = abs(el[0] - er[0]) / 2
        self.head_ix = hv


# ---------------------------------------------------------------- the man as figure.py takes him

#: Which of their bones each of our fingers' two is (figure.ts's DIGIT_NAMES: a finger's knuckle to its middle joint,
#: then the rest of it; the thumb's root in the heel of the hand to its middle knuckle, then the rest).
DIGIT_OF = {'th': 1, 'ix': 2, 'kn': 3, 'rg': 4, 'pk': 5}
#: Their bones a point of his head hangs on, all of them: what is all theirs is his head (a face's points: see figure.py's FACE).
HEAD_BONES = ('head', 'jaw', 'eye.', 'levator', 'oculi', 'orbicularis', 'oris', 'risorius', 'special', 'temporalis', 'tongue')


# ---------------------------------------------------------------- a real face's layout, and the formula's
#
# A real man's features are not where figure.py's formula has them (his nose is shorter than its, his chin longer,
# his eyes lower and further apart, his lips fuller), and everything the app does to a face it does by the formula's
# places. So his face is left as it is, and a place on it is read through a map: from where a thing is on him (the
# plane of his face, face_at's) to where the formula has that thing.
# Up and down, the map is a table: at each of a few distances out from the middle of his face (FACE_COLS), the heights
# of some things on him and the heights the formula has them at, straight between them (so it never doubles back), and
# straight between one distance and the next. Across, a place by his eye goes in with his eye, and the corner of his
# mouth with it (FACE_ACROSS: where, how wide and tall the patch that moves is, how far).
# figure.ts has the same tables and works the same map out for itself (its FACE_COLS, faceT): keep the two alike.
FACE_COLS = (
    # (his middle line: between his eyes; his nose's tip and foot; the top of his upper lip, the line of his mouth, the
    # foot of his lower lip; the groove under it; his chin)
    (0.0, ((0.62, 0.62), (0.03, 0.075), (-0.209, -0.262), (-0.317, -0.345), (-0.383, -0.481), (-0.445, -0.522), (-0.548, -0.61), (-0.727, -0.685), (-0.929, -0.84), (-1.3, -1.3))),
    (0.08, ((0.62, 0.62), (0.03, 0.075), (-0.209, -0.262), (-0.317, -0.345), (-0.378, -0.471), (-0.458, -0.522), (-0.555, -0.604), (-0.727, -0.685), (-0.929, -0.84), (-1.3, -1.3))),
    # (out past his nose's wing)
    (0.16, ((0.62, 0.62), (0.12, 0.2), (0.03, 0.075), (-0.243, -0.298), (-0.398, -0.479), (-0.471, -0.522), (-0.565, -0.587), (-0.727, -0.685), (-0.929, -0.84), (-1.3, -1.3))),
    (0.24, ((0.62, 0.62), (0.14, 0.215), (0.02, 0.065), (-0.243, -0.29), (-0.469, -0.496), (-0.489, -0.522), (-0.53, -0.55), (-0.727, -0.69), (-0.929, -0.84), (-1.3, -1.3))),
    # (the corner of his mouth)
    (0.32, ((0.62, 0.62), (0.15, 0.235), (0.02, 0.065), (-0.25, -0.27), (-0.519, -0.522), (-0.75, -0.71), (-0.93, -0.85), (-1.3, -1.3))),
    # (his eye's middle, his brow over it)
    (0.45, ((0.62, 0.62), (0.165, 0.26), (0.021, 0.066), (-0.25, -0.24), (-0.52, -0.515), (-0.93, -0.88), (-1.3, -1.3))),
    (0.65, ((0.62, 0.62), (0.15, 0.22), (0.026, 0.071), (-0.3, -0.29), (-1.3, -1.3))),
    (0.95, ((0.62, 0.62), (-1.3, -1.3))),
)
FACE_ACROSS = ((0.45, 0.08, 0.22, 0.2, -0.071), (0.32, -0.52, 0.05, 0.06, -0.019), (0.155, -0.243, 0.06, 0.06, -0.007))


def _col_y(knots, y):
    """A column of the table at height y."""
    if y >= knots[0][0]:
        return y
    for (y0, v0), (y1, v1) in zip(knots, knots[1:]):
        if y >= y1:
            return v0 + (v1 - v0) * (y0 - y) / (y0 - y1)
    return y


def _face_t(px, py):
    ax = abs(px)
    cols = FACE_COLS
    if ax >= cols[-1][0]:
        y = py
    else:
        k = next(i for i in range(1, len(cols)) if ax <= cols[i][0])
        (x0, k0), (x1, k1) = cols[k - 1], cols[k]
        t = (ax - x0) / (x1 - x0)
        y = _col_y(k0, py) * (1 - t) + _col_y(k1, py) * t
    dx = sum(by * math.exp(-(((ax - cx) / sx) ** 2 + ((py - cy) / sy) ** 2)) for cx, cy, sx, sy, by in FACE_ACROSS)
    return math.copysign(ax + dx, px) if ax > 1e-9 else 0.0, y


def face_t(px, py):
    """Where the formula has what is at (px, py) on the real man's face (numbers, or arrays of them)."""
    if np.ndim(px) == 0:
        return _face_t(float(px), float(py))
    out = np.array([_face_t(float(a), float(b)) for a, b in zip(np.ravel(px), np.ravel(py))])
    return out[:, 0].reshape(np.shape(px)), out[:, 1].reshape(np.shape(px))


def face_back(fx, fy):
    """Where on the real man's face the formula's (fx, fy) is: face_t undone (up and down by halving: the map never doubles back)."""
    x, y = float(fx), float(fy)
    for _ in range(6):
        lo, hi = -1.4, 0.8
        for _ in range(40):
            mid = (lo + hi) / 2
            if _face_t(x, mid)[1] < fy:
                lo = mid
            else:
                hi = mid
        y = (lo + hi) / 2
        x += fx - _face_t(x, y)[0]
    return x, y


def plane_of(p, c, size):
    """Where on the plane of his face a point looks from his head's middle (figure.py's face_at), and how far out it is in his head's half sizes."""
    d = (np.asarray(p, dtype=float) - c) / size
    rho = np.linalg.norm(d, axis=-1)
    n = d / np.maximum(rho, 1e-9)[..., None]
    nz = np.maximum(n[..., 2], 0.3)
    return n[..., 0] / nz * 0.8, n[..., 1] / nz * 0.8, rho, n


def on_plane(px, py, rho, c, size):
    d = np.array([px / 0.8, py / 0.8, 1.0])
    return c + size * d / np.linalg.norm(d) * rho


def loops(faces):
    """The open edges of these faces, as closed runs of points."""
    count = {}
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            k = (min(a, b), max(a, b))
            count[k] = count.get(k, 0) + 1
    near = {}
    for (a, b), c in count.items():
        if c == 1:
            near.setdefault(a, []).append(b)
            near.setdefault(b, []).append(a)
    out, seen = [], set()
    for v in near:
        if v in seen:
            continue
        run, todo = [], [v]
        while todo:
            u = todo.pop()
            if u in seen:
                continue
            seen.add(u)
            run.append(u)
            todo += near[u]
        out.append(run)
    return out


class Player:
    """
    Their man on our puppet, ready to be dressed: his points (game frame, ft), the faces of his skin (what is
    inside his mouth and behind his eyes left out, his lips parted along the line of his mouth, his eyes' balls
    in their sockets), which of them are his head's, his ears', his eyes'; how much of each point is each
    finger's; and what each of mh.py's shapes moves each point (ft).
    """

    def __init__(self, m, digits, ours, c, size, marks, log=print):
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree

        import mh

        V, groups = read_obj()
        n = len(V)
        P = athlete(V)
        rig = Rig(P)
        lm = Landmarks(P, groups, rig)
        s, o = mh.fit(ours, lm)
        log(f'[models] mh: head fit {np.round(s, 4)} {np.round(o, 4)}')
        Q, A, ok = pose(P, rig, m, digits, (s, o))
        c, size = np.asarray(c, dtype=float), np.asarray(size, dtype=float)
        self.n, self.rig, self.scale = n, rig, float(np.mean(s))
        self.made = (V, m, digits, (s, o))
        # (all of their skin, closed: what is cut from him as cloth is cut from this)
        self.whole = [list(f) for f in groups['body']]
        body = [list(f) for f in groups['body']]
        eyes = [list(f) for k in ('helper-l-eye', 'helper-r-eye') for f in groups[k]]
        eye_v = np.zeros(n, dtype=bool)
        eye_v[sorted({i for f in eyes for i in f})] = True

        # his head: what hangs on his head's bones alone
        head = np.zeros(n)
        for b in rig.bones:
            if b.startswith(HEAD_BONES):
                head += shares(rig, n, {b})
        self.head = head
        is_head = head > 0.999

        # what is inside him: the bag of his mouth behind his lips, the socket behind each eye's ball
        tris = [(f[0], f[k], f[k + 1]) for f in body + eyes for k in range(1, len(f) - 1)]
        tree = BVHTree.FromPolygons([Vector(p) for p in Q], tris, all_triangles=True)
        px, py, rho, nrm = plane_of(Q, c, size)
        E = marks['eye']
        MY, MW = marks['mouth_y'], marks['mouth_w']
        inside = np.zeros(n, dtype=bool)
        cand = np.where(is_head & ~eye_v & (nrm[:, 2] > 0.2) & (((np.abs(px) < MW + 0.1) & (py < MY + 0.14) & (py > MY - 0.2)) | ((np.abs(np.abs(px) - E[0]) < E[2] + 0.12) & (np.abs(py - E[1]) < 0.2))))[0]
        for i in cand:
            hit = tree.ray_cast(Vector(Q[i]) + Vector((0, 0, 0.0004)), Vector((0, 0, 1)), 0.14)
            inside[i] = hit[0] is not None
        keep = [f for f in body if not all(inside[i] for i in f)]
        # (what that cuts loose, the bag of his mouth and the back of each socket, goes too: his skin is the one piece left)
        root = list(range(n))

        def find(a):
            while root[a] != a:
                root[a] = root[root[a]]
                a = root[a]
            return a

        for f in keep:
            for a in f[1:]:
                ra, rb = find(f[0]), find(a)
                if ra != rb:
                    root[ra] = rb
        size_of = {}
        for f in keep:
            r = find(f[0])
            size_of[r] = size_of.get(r, 0) + 1
        main = max(size_of, key=size_of.get)
        keep = [f for f in keep if find(f[0]) == main]
        log(f'[models] mh: {len(body) - len(keep)} faces inside his mouth and behind his eyes left out')
        self.inside = inside

        # the open edges that leaves: the line of his mouth, the rim of each eye's lids
        runs = [r for r in loops(keep)]
        mouth_run = [r for r in runs if abs(px[r].mean()) < 0.1 and abs(py[r].mean() - MY) < 0.15]
        eye_runs = {sd: [r for r in runs if abs(px[r].mean() - sd * E[0]) < 0.15 and abs(py[r].mean() - E[1]) < 0.15] for sd in (1, -1)}
        if os.environ.get('MH_DEBUG'):
            up_ = np.linalg.norm(target('mouth-upperlip-volume-incr', n), axis=1) > 1e-4
            lo_ = np.linalg.norm(target('mouth-lowerlip-volume-incr', n), axis=1) > 1e-4
            for r in runs:
                r = np.array(r)
                log(f'run {len(r)} x {Q[r, 0].min():.3f}..{Q[r, 0].max():.3f} y {Q[r, 1].min():.3f}..{Q[r, 1].max():.3f} z {Q[r, 2].min():.3f}..{Q[r, 2].max():.3f} upper {int(up_[r].sum())} lower {int(lo_[r].sum())} inside {int(inside[r].sum())}')
            box = is_head & ~eye_v & (np.abs(px) < MW + 0.1) & (np.abs(py - MY) < 0.2) & (nrm[:, 2] > 0.2)
            log(f'mouth box {int(box.sum())} inside {int((box & inside).sum())} upper {int((box & up_).sum())} lower {int((box & lo_).sum())} inside&upper {int((box & inside & up_).sum())} z of inside {np.percentile(Q[box & inside, 2], [0, 25, 50, 75, 100]).round(3)} z of lips {np.percentile(Q[box & (up_ | lo_), 2], [0, 25, 50, 75, 100]).round(3)}')
        if len(mouth_run) != 1 or any(len(v) != 1 for v in eye_runs.values()):
            raise RuntimeError(f'mh: his mouth and eyes did not open as three runs ({len(mouth_run)}, {[len(v) for v in eye_runs.values()]}; {[(len(r), round(float(px[r].mean()), 2), round(float(py[r].mean()), 2)) for r in runs]})')
        mouth_run = np.array(mouth_run[0])

        # landmarks: where each is on him, and where the formula's face has it (the plane of his face)
        src, dst = [], []

        def mark(p, tx, ty):
            p = np.asarray(p, dtype=float)
            ax_, ay_, r, _ = plane_of(p, c, size)
            if os.environ.get('MH_DEBUG'):
                log(f'mark at ({float(ax_):.3f}, {float(ay_):.3f}) -> ({tx:.3f}, {ty:.3f})')
            src.append(p)
            dst.append(on_plane(tx, ty, r, c, size))

        for sd in (1, -1):
            # (his lids, opened to where the app draws them open: the rim of each a little outside what it paints)
            run = np.array(eye_runs[sd][0])
            ex = sd * px[run]
            inner, outer = run[ex.argmin()], run[ex.argmax()]
            mid = (ex.min() + ex.max()) / 2
            near = run[np.abs(ex - mid) < 0.25 * (ex.max() - ex.min())]
            top, bot = near[py[near].argmax()], near[py[near].argmin()]
            cx, cy = face_back(E[0], E[1])
            mark(Q[inner], float(px[inner]), float(py[inner]))
            mark(Q[outer], float(px[outer]), float(py[outer]))
            mark(Q[top], sd * cx, cy + marks['eye_up'])
            mark(Q[bot], sd * cx, cy - marks['eye_low'])
        for sd in (1, -1):
            end = mouth_run[(sd * px[mouth_run]).argmax()]
            mark(Q[end], float(px[end]), float(py[end]))
        mark(lm.nose * s + o, 0.0, float(plane_of(lm.nose * s + o, c, size)[1]))
        # (and what stays where it is: the back and top of his head, his ears, his neck)
        still = np.where(is_head & ~eye_v & (Q[:, 0] >= 0) & ((nrm[:, 2] < 0.05) | (nrm[:, 1] > 0.75) | (nrm[:, 1] < -0.93)))[0][::12]
        for i in still:
            for sd in ((1, -1) if Q[i][0] > 0.01 else (1,)):
                src.append(Q[i] * np.array([sd, 1, 1]))
                dst.append(Q[i] * np.array([sd, 1, 1]))
        src, dst = np.array(src), np.array(dst)
        k = len(src)
        K = np.linalg.norm(src[:, None] - src[None], axis=2)
        Pm = np.hstack([np.ones((k, 1)), src])
        M = np.block([[K, Pm], [Pm.T, np.zeros((4, 4))]])
        W = np.linalg.solve(M + 1e-9 * np.eye(k + 4), np.vstack([dst - src, np.zeros((4, 3))]))
        moved = np.where(head > 0.5)[0]
        D = np.linalg.norm(Q[moved][:, None] - src[None], axis=2) @ W[:k] + np.hstack([np.ones((len(moved), 1)), Q[moved]]) @ W[k:]
        far = np.linalg.norm(D, axis=1)
        log(f'[models] mh: his face laid on the formula\'s by {k} marks: a point moves {far.mean() * 304.8:.1f} mm, at most {far.max() * 304.8:.1f} mm')
        # (down his neck, less and less of it)
        Q[moved] += D * np.clip((head[moved] - 0.5) / 0.45, 0.0, 1.0)[:, None]

        # his lips, each on its own side of the line of his mouth: the open edge on it (a hair off, each its own way),
        # tucked in behind the lip it is the edge of
        px, py, rho, nrm = plane_of(Q, c, size)
        upper = np.linalg.norm(target('mouth-upperlip-volume-incr', n), axis=1) > 1e-4
        lower = np.linalg.norm(target('mouth-lowerlip-volume-incr', n), axis=1) > 1e-4
        zone = is_head & ~eye_v & (np.abs(px) < MW + 0.03) & (np.abs(py - MY) < 0.12) & (nrm[:, 2] > 0.3)
        near = {}
        for f in keep:
            for a, b in zip(f, f[1:] + f[:1]):
                near.setdefault(a, set()).add(b)
                near.setdefault(b, set()).add(a)

        if os.environ.get('MH_DEBUG'):
            for nm, st in (('upper', upper), ('lower', lower)):
                for xb in (0.0, 0.08, 0.16, 0.24):
                    ii = np.where(is_head & ~eye_v & (nrm[:, 2] > 0.3) & (py < -0.3) & (py > -0.75) & (px > -0.01) & ~inside & st & (np.abs(np.abs(px) - xb) < 0.012))[0]
                    ii = ii[np.argsort(-py[ii])]
                    log(f'{nm} lip at x {xb}: ' + ', '.join(f'py {py[i]:.3f} y {Q[i][1]:.3f} z {Q[i][2]:.3f} mv {np.linalg.norm(target("mouth-upperlip-volume-incr" if nm == "upper" else "mouth-lowerlip-volume-incr", n)[i]):.3f}' for i in ii))
            for x0 in np.arange(0.0, 0.36, 0.04):
                band = zone & ~inside & (np.abs(np.abs(px) - x0) < 0.02)
                u_, l_ = band & upper & ~lower, band & lower & ~upper
                log(f'lips at {x0:.2f}: upper lowest {py[u_].min() if u_.any() else 0:.3f} lower highest {py[l_].max() if l_.any() else 0:.3f} z {Q[u_, 2].max() if u_.any() else 0:.3f}')

        def off_line(p):
            """How far over the line of his mouth a point is (the formula's plane of his face, through the map)."""
            ax_, ay_, _, _ = plane_of(p, c, size)
            return float(face_t(ax_, ay_)[1]) - MY

        def to_line(p, want):
            """Moves a point up or down until it is `want` over the line (by halving: the map never doubles back)."""
            lo, hi = p[1] - 0.06, p[1] + 0.06
            for _ in range(30):
                p[1] = (lo + hi) / 2
                if off_line(p) < want:
                    lo = p[1]
                else:
                    hi = p[1]
            return p

        edge_up = np.zeros(n, dtype=bool)
        edge = np.zeros(n, dtype=bool)
        # (which lip's each point of the open edge is: over or under the edge's own middle there)
        HAIR_OFF = 0.001
        # (by the lip it is joined to: outward from each lip's own points over the skin that shows, between the corners
        # of his mouth, where alone the two lips are one skin)
        fpx = face_t(px, py)[0]
        within = zone & ~inside & (np.abs(fpx) < MW - 0.03)
        label = {int(i): 1 for i in np.where(within & upper & ~lower)[0]}
        label.update({int(i): -1 for i in np.where(within & lower & ~upper)[0]})
        front_ = list(label)
        while front_:
            nxt = []
            for a in front_:
                for b in near.get(a, ()):
                    if b not in label and within[b]:
                        label[b] = label[a]
                        nxt.append(b)
            front_ = nxt
        # (nothing of what is behind his lips is kept, and no skin runs from one lip to the other: either would stretch
        # across his open mouth. His lips end at the last of their points that shows)
        was = len(keep)
        mouth_in = inside & zone
        gone = lambda f: any(mouth_in[i] for i in f) or (any(label.get(i, 0) > 0 for i in f) and any(label.get(i, 0) < 0 for i in f))  # noqa: E731
        # (kept aside: a man whose mouth never opens has his lips shut by them, see people.py)
        self.lips_shut = [f for f in keep if gone(f)]
        keep = [f for f in keep if not gone(f)]
        log(f'[models] mh: {was - len(keep)} faces behind his lips, or from one to the other, left out')
        rim = set()
        for r in loops(keep):
            if abs(px[r].mean()) < 0.1 and abs(py[r].mean() - np.mean([py[i] for i in label]) ) < 0.15:
                rim |= set(r)
        # (his lips' own points, each on its own side of the line: whichever lip it is joined to; the open edge on the
        # line itself, a hair off it, each lip's its own way)
        fixed = 0
        for i in np.where(zone & ~inside)[0]:
            side = label.get(int(i), 0)
            if not side or abs(fpx[i]) > MW - 0.03:
                continue
            if int(i) in rim:
                # (and drawn in behind his lips' fronts: shut, the two meet in the crease between them)
                Q[i][2] -= 0.009
                to_line(Q[i], HAIR_OFF * side)
                edge[i], edge_up[i] = True, side > 0
                continue
            off = off_line(Q[i])
            if side > 0 and off < 3 * HAIR_OFF:
                to_line(Q[i], 3 * HAIR_OFF)
                fixed += 1
            if side < 0 and off > -3 * HAIR_OFF:
                to_line(Q[i], -3 * HAIR_OFF)
                fixed += 1
        mouth_run = np.where(edge)[0]
        log(f'[models] mh: {len(mouth_run)} points on the line of his mouth ({int(edge_up.sum())} his upper lip\'s), {fixed} of his lips\' put on their own side of it')
        self.lip_edge, self.lip_up = edge, edge_up

        # his ears: what the targets that scale them move
        ear = np.zeros(n, dtype=bool)
        for sd in 'lr':
            # (the ear itself, not the skin round it: what the target that turns it out from his head moves, and its lobe)
            for t, share in ((f'{sd}-ear-flap-incr', 0.12), (f'{sd}-ear-lobe-incr', 0.25)):
                far_ = np.linalg.norm(target(t, n), axis=1)
                ear |= far_ > share * far_.max()
        self.ear = ear
        # his eyes' balls: the half of each that faces out
        front = [f for f in eyes if np.mean([Q[i][2] for i in f]) > np.mean([Q[i][2] for g in eyes for i in g]) - 0.004]
        self.faces = keep
        self.eyes = front
        self.eye = eye_v
        self.Q = Q
        # (his head's picture ends where figure.ts's painter lets it go: under his jaw, round the top of his neck; below
        # that his skin is his trunk's, and goes with his head only as far as its height says)
        px, py, rho, nrm = plane_of(Q, c, size)
        neck = (nrm[:, 1] < -0.62) & (np.hypot(nrm[:, 0] * size[0] / 0.225, (nrm[:, 2] * size[2] + 0.08) / 0.19) < 1.0)
        self.is_head = ((head > 0.5) & ~neck) | eye_v
        # each finger's share of a point (ours' names: see DIGIT_OF)
        self.digits = {}
        for name, k in DIGIT_OF.items():
            for sfx, low_ in (('L', 'l'), ('R', 'r')):
                self.digits[f'{name}1{low_}'] = shares(rig, n, {f'finger{k}-1.{sfx}'})
                self.digits[f'{name}2{low_}'] = shares(rig, n, {f'finger{k}-2.{sfx}', f'finger{k}-3.{sfx}'})
        self.lm = lm


    def built(self, muscle, weight, chest, limb, deep, neck):
        """
        The same man with another body (softer, lighter in the limb: a coach, a referee), his head his own: every
        point of his head where it is, his neck going over to the other body's down its length. Says the points.
        """
        global MUSCLE, WEIGHT, CHEST_WIDE, LIMB, DEEP, NECK
        was = (MUSCLE, WEIGHT, CHEST_WIDE, LIMB, DEEP, NECK)
        MUSCLE, WEIGHT, CHEST_WIDE, LIMB, DEEP, NECK = muscle, weight, chest, limb, deep, neck
        try:
            V, m, digits, fit = self.made
            P = athlete(V)
            Q, _, _ = pose(P, Rig(P), m, digits, fit)
        finally:
            MUSCLE, WEIGHT, CHEST_WIDE, LIMB, DEEP, NECK = was
        f = np.clip(self.head / 0.5, 0.0, 1.0)
        f = (f * f * (3 - 2 * f))[:, None]
        f[self.eye] = 1.0
        return self.Q * f + Q * (1 - f)
