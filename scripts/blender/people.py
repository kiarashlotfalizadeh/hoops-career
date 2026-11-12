# The people who don't play: two players sitting on the bench (one leaning on his knees, one sat
# back with a towel over his shoulder), and the coaches: the head coach on his feet with his arms
# folded, his assistant sat on the first chair behind him. Each is the player's own body (figure.py),
# put in a pose by its bones and baked as it stands: nothing in the app moves them. They stand on
# y = 0; a sitter's hips are over the origin's chair (see SIT_BACK), facing +z, and the head coach
# stands COACH_OUT in front of his assistant's chair.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: E402,F403
from figure import (  # noqa: E402
    AN_Y,
    ARM,
    BONES,
    CHEST_Y,
    FARM,
    FLOOR,
    HEAD,
    HEAD_C,
    HEAD_H,
    HIP,
    HIP_W,
    KN_Y,
    SHIN,
    SHOULDER,
    THIGH,
    TORSO,
    UARM,
    WHITE,
    arm_frame,
    copy,
    dress_coach,
    dress_player,
    face_shade,
    finish,
    fused,
    materials,
    report,
    solid,
)

CONV = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# a bench chair's seat is this high, and a sitter's hips this far behind its middle (arena.py's chair)
SEAT = 1.5
SIT_BACK = 0.3
# the head coach stands this far in front of the first chair (toward the floor; the app turns the two toward
# the middle of the floor, which puts him beside his assistant on either bench), and is this much smaller than his players
COACH_OUT = 3.0
COACH_SIZE = 0.93


def frame(at, x, y, z):
    m = Matrix.Identity(4)
    for i, axis in enumerate((x, y, z)):
        for r in range(3):
            m[r][i] = axis[r]
    for r in range(3):
        m[r][3] = at[r]
    return m


def turned(at, rot):
    return Matrix.Translation(at) @ rot.to_4x4()


def limb(a, mid, end, bend):
    """The two bones of an arm or a leg through these joints, as figure.ts turns them (an elbow folds forward, a knee back)."""
    up, low = (mid - a).normalized(), (end - mid).normalized()
    h = up.cross(low) * bend
    h = h.normalized() if h.length > 0.06 else Vector((1, 0, 0))
    out = []
    for origin, d in ((a, up), (mid, low)):
        y = -d
        x = (h - y * h.dot(y)).normalized()
        out.append(frame(origin, x, y, x.cross(y)))
    return out


def reach(a, toward, length):
    return a + (toward - a).normalized() * length


def body_pose(hips, lean, elbows, hands, knees=None, ankles=None, look=0.0, toes=0.2):
    """
    Every bone's place for a pose: the hips' middle, how far the trunk leans forward (radians), where
    each elbow and hand tries to be (left, right), and for a sitter where his knees and ankles are.
    """
    rot = Matrix.Rotation(lean, 3, 'X')
    hips = Vector(hips)
    chest = hips + rot @ Vector((0, TORSO, 0))
    out = {
        'pelvis': turned(hips, Matrix.Rotation(lean * 0.35, 3, 'X')),
        'chest': turned(chest, rot),
        'head': turned(chest + rot @ Vector((0, HEAD, 0)), Matrix.Rotation(lean * 0.3 + look, 3, 'X')),
    }
    out['hem'] = out['pelvis'] @ Matrix.Translation((0, -0.03, 0))
    for i, (s, sfx, ua, fa, ha, th, sh, ft) in enumerate(((1, 'L', 'ual', 'fal', 'hal', 'thl', 'shl', 'ftl'), (-1, 'R', 'uar', 'far', 'har', 'thr', 'shr', 'ftr'))):
        sho = chest + rot @ Vector((s * SHOULDER, -0.14, 0))
        el = reach(sho, Vector(elbows[i]), UARM)
        ha_at = reach(el, Vector(hands[i]), FARM)
        out[ua], out[fa] = limb(sho, el, ha_at, -1)
        out[ha] = turned(ha_at, out[fa].to_3x3())
        hip = hips + Vector((s * HIP_W, 0, 0))
        kn = Vector(knees[i]) if knees else hip + Vector((0, -THIGH, 0))
        an = Vector(ankles[i]) if ankles else kn + Vector((0, -SHIN, 0))
        kn = reach(hip, kn, THIGH)
        an = reach(kn, an, SHIN)
        out[th], out[sh] = limb(hip, kn, an, 1)
        out[ft] = turned(an, Matrix.Rotation(s * toes, 3, 'Y'))
        out['hem' + sfx] = out[th] @ Matrix.Translation((0, -(THIGH - 0.7), 0))
    return out


def sitting(lean, knee_y, splay, elbows, hands, look=0.0):
    """A pose on a chair: the knees at this height and this far apart, the feet where the shins then reach the floor."""
    hip_y = FLOOR + SEAT + 0.4
    knees, ankles = [], []
    for s in (1, -1):
        hip = Vector((s * HIP_W, hip_y, 0))
        dx, dy = s * splay, knee_y - hip_y
        kn = hip + Vector((dx, dy, math.sqrt(THIGH * THIGH - dx * dx - dy * dy)))
        ax, ay = s * 0.06, AN_Y - knee_y
        an = kn + Vector((ax, ay, math.sqrt(max(0.0, SHIN * SHIN - ax * ax - ay * ay))))
        knees.append(kn)
        ankles.append(an)
    mirror = lambda pts: [Vector(pts), Vector((-pts[0], pts[1], pts[2]))]  # noqa: E731
    return body_pose((0, hip_y, 0), lean, mirror(elbows), mirror(hands), knees, ankles, look, 0.25)


def white(obj):
    """Clears the mesh's baked shade."""
    col = obj.data.color_attributes.get('Col')
    col.data.foreach_set('color', [1.0] * (len(obj.data.vertices) * 4))


def towel(pose):
    """A towel over his left shoulder, a flap down his chest and one down his back (laid along the posed chest)."""
    x = SHOULDER * 0.55
    # (up and forward of the chest joint: down his front, over the top of the shoulder, down his back)
    path = [(-0.85, 0.43), (-0.45, 0.47), (-0.1, 0.42), (0.13, 0.22), (0.17, 0.0), (0.12, -0.22), (-0.15, -0.37), (-0.5, -0.4), (-0.9, -0.37)]
    rings = []
    for i, (y, z) in enumerate(path):
        a, b = path[max(0, i - 1)], path[min(len(path) - 1, i + 1)]
        ty, tz = b[0] - a[0], b[1] - a[1]
        n = math.hypot(ty, tz) or 1
        # (out from the body square to the path, a little thick)
        oy, oz = tz / n, -ty / n
        if z < 0:
            oy, oz = -oy, -oz
        ring = []
        for w, d in ((-0.2, 0.0), (0.2, 0.0), (0.2, 0.03), (-0.2, 0.03)):
            ring.append(tuple(pose['chest'] @ Vector((x + w - 0.04 * z, y + oy * d, z + oz * d))))
        rings.append(ring)
    o = solid(rings, 'towel')
    smooth(o)
    set_material(o, material(WHITE))
    paint(o, lambda *_: 1.0)
    return [o]


def posed(fig, rig_ob, pose, name, shift=(0, 0, 0), seat=False, extra=None):
    """The figure in a pose, as a mesh of its own (and `extra` things laid on him for it): its shade baked for how it now stands or sits."""
    # (which points are his head, while he still stands as built: a face's baked shade is only a hint)
    face = [v.co.z > HEAD_C[1] - HEAD_H * 1.05 for v in fig.data.vertices]
    for b in BONES:
        # (each bone stands alone, so its pose is its place now against its place as built)
        rig_ob.pose.bones[b].matrix_basis = rig_ob.data.bones[b].matrix_local.inverted() @ (CONV @ pose[b])
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(fig.evaluated_get(dg), depsgraph=dg)
    ob = link(bpy.data.objects.new(name, me))
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    if extra:
        # (joined after him: their points come after his, and none of them is his face)
        ob = join([ob, *extra(pose)], name)
        ob.name = name
        face += [False] * (len(ob.data.vertices) - len(face))
    others = []
    if seat:
        others = [box((0, FLOOR + SEAT - 0.1, SIT_BACK), (1.7, 0.2, 1.5), 'seat'), box((0, FLOOR + SEAT + 0.8, SIT_BACK - 0.8), (1.7, 1.6, 0.15), 'back')]
    bake_occlusion(ob, others=others, floor=FLOOR, rays=72, reach=1.2, low=0.6, blur=3)
    soften(ob, face, 0.55)
    for o in others:
        bpy.data.objects.remove(o)
    smooth(ob)
    transform(ob, Matrix.Translation((shift[0], shift[1] - FLOOR, shift[2])))
    return ob


if __name__ == '__main__':
    a = args()
    reset()
    materials()

    # the coach: on his feet, arms folded, watching
    hi = fused()
    # (two of them in one thing, each lighter than a player: they are seen from across the floor)
    coach_fig, coach_rig = finish(dress_coach(copy(hi, 'hi2'), 0.38), 'coachFig')
    white(coach_fig)
    paint(coach_fig, face_shade)
    sh = CHEST_Y - 0.14
    standing = body_pose(
        (0, HIP, 0),
        -0.04,
        [(SHOULDER + 0.1, sh - 1.0, 0.36), (-SHOULDER - 0.1, sh - 1.0, 0.36)],
        [(-0.3, 4.34, 0.62), (0.3, 4.2, 0.66)],
        look=0.06,
        toes=0.16,
    )
    head = posed(coach_fig, coach_rig, standing, 'headCoach')
    transform(head, Matrix.Translation((0, 0, COACH_OUT)) @ Matrix.Scale(COACH_SIZE, 4))
    # his assistant: sat on the first chair, leaning in a little, his hands on his thighs, watching
    watching = sitting(0.18, KN_Y - 0.04, 0.32, (0.95, 2.66, 0.45), (0.5, 2.22, 1.25), look=0.02)
    aide = posed(coach_fig, coach_rig, watching, 'assistant', (0, 0, -SIT_BACK), seat=True)
    coach = join([head, aide], 'coach')
    for o in (coach_fig, coach_rig):
        bpy.data.objects.remove(o)

    # the bench: one leaning forward with his forearms on his thighs, one sat back with his hands on them
    # (a lighter copy of the player: they are seen from across the floor)
    fig, rig_ob = finish(dress_player(hi, 0.42), 'sitter')
    white(fig)
    paint(fig, face_shade)
    lean_fwd = sitting(0.5, KN_Y, 0.3, (0.68, 2.42, 1.1), (0.22, 1.95, 1.75), look=-0.3)
    bench_a = posed(fig, rig_ob, lean_fwd, 'benchA', (0, 0, -SIT_BACK), seat=True)
    sat_back = sitting(-0.14, KN_Y - 0.13, 0.36, (1.0, 2.62, 0.0), (0.66, 2.2, 1.0), look=0.1)
    bench_b = posed(fig, rig_ob, sat_back, 'benchB', (0, 0, -SIT_BACK), seat=True, extra=towel)
    for o in (fig, rig_ob):
        bpy.data.objects.remove(o)

    people = [bench_a, bench_b, coach]
    for o in people:
        report(o)
    export_glb(os.path.join(a['out'], 'people.glb'), people)
    save_blend(os.path.join(a['blend'], 'people.blend'))
    if 'preview' in a:
        for i, o in enumerate(people):
            o.location = B((i - 1) * 4.0, 0, 0)
        chairs = [box(((i - 1) * 4.0, SEAT - 0.1, 0), (1.6, 0.2, 1.5), 'chair') for i in range(2)]
        for c in chairs:
            set_material(c, material('ground2', (0.2, 0.2, 0.22), 0.6, shade=False))
        preview(
            os.path.join(a['preview'], 'people.png'),
            [((0, 4.5, 30), (2, 3.2, 0), 16), ((22, 6, 20), (2, 3.2, 0), 16), ((14, 3, 12), (8, 2.2, 0), 5)],
            size=(720, 460),
            ground=0,
            sheet_cols=1,
        )
