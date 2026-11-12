# The people round the floor: everyone who isn't one of the ten. Three bodies, each the player's own
# (figure.py) in other clothes, each one skin on the puppet's bones as he is:
#   bench     a player off the floor: a long-sleeved warm-up top over his shorts
#   staff     a suit (figure.py's coach) with its trousers a material of their own: coaches and their
#             assistants, the scorer's table, security, and (in other colours) the photographers
#   official  a referee: a short-sleeved shirt, long trousers, a whistle at his chest
# Each has a face that reads from across the floor (eyes, brows, lips), a fuller head of hair over his
# crop, and his jaw a material of its own: the app colours each by who he is (sideline.ts: his skin, his
# hair, whether he has a beard) and shows or hides the fuller hair.
#
# Nothing here is posed. The app sits them down, stands them up and puts them at the table by their
# bones (sideline.ts bakes each pose once, when the court loads), and the ones who move (the
# referees, the head coaches) are driven by the players' puppet.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: E402,F403
from figure import (  # noqa: E402
    AN_Y,
    ARM,
    BY_PLACE,
    CHEST_Y,
    CLOTH,
    FLOOR,
    FORK,
    G,
    HEAD_C,
    HEAD_D,
    HEAD_H,
    HEAD_W,
    HEM,
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
    dress_coach,
    ears,
    fingers,
    finish,
    fused,
    hairline,
    level,
    materials,
    push,
    relax,
    report,
    shoe,
    shorts_form,
    slots,
    sstep,
    tag,
    thin,
    thin_body,
)

# what the app colours by who he is (sideline.ts PARTS: the names are its own)
EYE, BROW, LIP, BEARD, HAIR_TOP = 'eye', 'brow', 'lip', 'beard', 'hairTop'
WARM, TOP, LEGS, METAL = 'warm', 'top', 'legs', 'metal'
# a sleeve ends this far down the arm: a warm-up's at the wrist, a referee's above the elbow
CUFF = ARM - 0.06
SLEEVE = 0.7


def front(tree, x, y):
    """How far forward (z) the body's skin is at this height and this far across: the first of it met from in front."""
    hit = tree.ray_cast(B(x, y, 3.0), B(0, 0, -1))[0]
    return -hit.y if hit is not None else 0.0


def tree_of(obj):
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def bit(center, radii, mat, name, rot=None, seg=8, rings=5):
    o = ellipsoid(center, radii, seg, rings, name, rot)
    set_material(o, material(mat))
    return tag(o, ON_HEAD)


def face(hi):
    """A face that reads from across the floor: the whites of his eyes and a dark iris in each, brows over them, lips."""
    t = tree_of(hi)
    c, w, h = HEAD_C, HEAD_W, HEAD_H
    out = []
    for s in (1, -1):
        ex, ey = s * 0.4 * w, c[1] + 0.06 * h
        ez = front(t, ex, ey)
        out.append(bit((ex, ey, ez - 0.006), (0.058, 0.026, 0.017), WHITE, 'eyeWhite'))
        out.append(bit((ex * 0.96, ey, ez + 0.003), (0.026, 0.026, 0.012), EYE, 'iris', seg=6, rings=4))
        by = c[1] + 0.17 * h
        out.append(bit((ex * 1.04, by, front(t, ex, by) - 0.006), (0.086, 0.019, 0.02), BROW, 'brow', Matrix.Rotation(-s * 0.08, 3, 'Z')))
    ly = c[1] - 0.47 * h
    out.append(bit((0, ly, front(t, 0, ly) - 0.006), (0.072, 0.017, 0.018), LIP, 'lips'))
    return out


# a beard's edges, in head sizes from the head's middle (up, forward): its top runs from in front of the ear down to
# under the lips, its foot is under the chin, and it stops this far back toward the ears
BEARD_EAR, BEARD_LIP, BEARD_FOOT, BEARD_BACK = (-0.1, -0.3), (-0.55, 0.85), -1.0, -0.3


def beard_line():
    """The beard's top edge as a plane (a point of it and its way up, game frame)."""
    (y0, z0), (y1, z1) = BEARD_EAR, BEARD_LIP
    # (square to the edge, in head sizes; a head is not as deep as it is tall)
    ny, nz = (z1 - z0) / HEAD_H, -(y1 - y0) / HEAD_D
    return (0, HEAD_C[1] + y0 * HEAD_H, HEAD_C[2] + z0 * HEAD_D), (0, ny, nz)


def jaw(p):
    """A point of his face where a beard grows: his cheeks below a line from his ear to under his lips, his chin and under it."""
    co, no = beard_line()
    y, z = (p[1] - HEAD_C[1]) / HEAD_H, (p[2] - HEAD_C[2]) / HEAD_D
    return (p[1] - co[1]) * no[1] + (p[2] - co[2]) * no[2] < 0 and y > BEARD_FOOT and z > BEARD_BACK and abs(p[0]) < HEAD_W * 1.2


def bearded(built):
    """The skin of his jaw as a material of its own: the app colours it as his skin, or as his beard. His head is cut along the beard's edges first, so they are lines."""
    c = HEAD_C
    planes = [beard_line(), ((0, c[1] + BEARD_FOOT * HEAD_H, 0), (0, 1, 0)), ((0, 0, c[2] + BEARD_BACK * HEAD_D), (0, 0, 1))]
    for o in built:
        names = [m.name for m in o.data.materials]
        if SKIN not in names:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for co, no in planes:
            # (only his head: a plane goes on for ever)
            faces = [f for f in bm.faces if G(f.calc_center_median())[1] > c[1] - HEAD_H * 1.3 and abs(G(f.calc_center_median())[0]) < 0.6]
            geom = list({v for f in faces for v in f.verts}) + list({e for f in faces for e in f.edges}) + faces
            bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=B(*co), plane_no=B(*no))
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
        o.data.materials.append(material(BEARD))
        skin, beard = names.index(SKIN), len(names)
        for f in o.data.polygons:
            if f.material_index == skin and jaw(G(f.center)):
                f.material_index = beard
    return built


def head_bits(hi, mid):
    """His face, and a fuller head of hair over his crop (shown on those who have it)."""
    scalp = lambda p: hairline(p) > 0.02 and p[1] > HEAD_C[1] - HEAD_H * 0.7  # noqa: E731
    hair = copy(mid, 'hairTop')
    cut(hair, [], scalp)
    push(hair, lambda p: 0.006 + 0.085 * sstep(0.02, 0.42, hairline(p)))
    relax(hair, 2)
    thin(hair, 240)
    set_material(hair, material(HAIR_TOP))
    return [*face(hi), tag(hair, ON_HEAD)]


def lighter(built, keep=0.4):
    """The same people with lighter shoes: a sneaker built for a close-up is most of a far-off man's triangles."""
    for o in built:
        if o.name.startswith(('shoe', 'sole')):
            thin(o, max(40, tri_count(o) * keep))
    return built


def cuffs(at):
    """A plane across each arm this far down it."""
    return [((arm_frame(s) @ Vector((0, -at, 0))).to_tuple(), (arm_frame(s).to_3x3() @ Vector((0, -1, 0))).to_tuple()) for s in (1, -1)]


def trousers(q, mat):
    """Long trousers (the suit's: the shorts' seat, a straight leg each down to the shoe)."""
    t = shorts_form(
        [(AN_Y - 0.1, 0.4, 0.2, 0.235, 0.24), (AN_Y + 0.12, 0.4, 0.205, 0.24, 0.245), (KN_Y - 0.5, 0.4, 0.235, 0.265, 0.3), (KN_Y, 0.405, 0.265, 0.31, 0.31), (FORK - 0.12, 0.415, 0.34, 0.395, 0.415)],
        folds=0.007,
    )
    thin(t, 3600 * q)
    cut(t, [level(AN_Y + 0.1), level(WAIST)], lambda p: AN_Y + 0.1 < p[1] < WAIST and abs(p[0]) < 1.2)
    set_material(t, material(mat))
    return tag(t, BY_PLACE)


def dress_bench(hi, q=1.0):
    """Off the floor: a long-sleeved warm-up top (a band at its neck and cuffs) tucked into his shorts, socks, sneakers."""
    mid = thin(copy(hi, 'mid'), 44000)
    bits = head_bits(hi, mid)
    body = thin_body(hi, 5000 * q)
    cut(
        body,
        [level(5.3), *cuffs(CUFF), level(HEM + 0.3), level(SOCK_HI - 0.06)],
        lambda p: (p[1] > 5.3 and abs(p[0]) < 0.6) or down_arm(p) > CUFF - 0.08 or (SOCK_HI - 0.06 < p[1] < HEM + 0.3 and abs(p[0]) < 1.2),
    )
    crop(body)

    top = copy(mid, 'top')
    push(top, lambda p: 0.03 + 0.03 * sstep(WAIST + 0.1, WAIST + 0.5, p[1]) * sstep(5.0, 4.4, p[1]) * (1 if down_arm(p) < 0.3 else 0))
    relax(top, 12)
    thin(top, 4600 * q)
    relax(top, 1)
    cut(
        top,
        [level(TUCK), *cuffs(CUFF), *cuffs(CUFF - 0.13), level(5.56), level(5.45)],
        lambda p: TUCK < p[1] < 5.56 and (down_arm(p) < CUFF or abs(p[0]) < 0.9),
    )
    slots(top, [WARM, TRIM_M], lambda p: TRIM_M if (p[1] > 5.45 and abs(p[0]) < 0.5) or down_arm(p) > CUFF - 0.13 else WARM)

    shorts = shorts_form()
    thin(shorts, 2600 * q)
    cut(shorts, [level(HEM), level(WAIST), level(HEM + 0.085)], lambda p: HEM < p[1] < WAIST and abs(p[0]) < 1.2)
    slots(shorts, [CLOTH, TRIM_M], lambda p: TRIM_M if p[1] < HEM + 0.085 else CLOTH)
    tag(shorts, SHORTS)

    socks = mid
    push(socks, lambda p: 0.009 + 0.013 * sstep(SOCK_HI - 0.16, SOCK_HI - 0.1, p[1]))
    thin(socks, 1400 * q)
    cut(socks, [level(SOCK_LO), level(SOCK_HI)], lambda p: SOCK_LO < p[1] < SOCK_HI)
    set_material(socks, material(WHITE))

    for o in (body, top, socks):
        tag(o, BY_PLACE)
    built = [body, top, shorts, socks, *ears(), *bits]
    for s in (1, -1):
        built += fingers(s) + shoe(s)
    return lighter(bearded(built))


def dress_official(hi, q=1.0):
    """A referee: a short-sleeved shirt (a darker band at its collar and sleeves), long trousers, dark shoes, a whistle at his chest."""
    mid = thin(copy(hi, 'mid'), 44000)
    bits = head_bits(hi, mid)
    chest = front(tree_of(mid), 0, 4.95)
    body = thin_body(hi, 5600 * q)
    cut(body, [level(5.3), *cuffs(SLEEVE - 0.1)], lambda p: (p[1] > 5.3 and abs(p[0]) < 0.6) or down_arm(p) > SLEEVE - 0.1)
    crop(body)

    shirt = copy(mid, 'shirt')
    push(shirt, lambda p: 0.024 + 0.022 * sstep(WAIST + 0.1, WAIST + 0.5, p[1]) * sstep(5.0, 4.4, p[1]) * (1 if down_arm(p) < 0.3 else 0))
    relax(shirt, 10)
    thin(shirt, 3800 * q)
    relax(shirt, 1)
    cut(
        shirt,
        [level(TUCK), *cuffs(SLEEVE), *cuffs(SLEEVE - 0.09), level(5.54), level(5.44)],
        lambda p: TUCK < p[1] < 5.54 and (down_arm(p) < SLEEVE or (abs(p[0]) < 0.9 and down_arm(p) == 0)),
    )
    slots(shirt, [TOP, TRIM_M], lambda p: TRIM_M if (p[1] > 5.44 and abs(p[0]) < 0.5) or down_arm(p) > SLEEVE - 0.09 else TOP)

    # (his whistle, on a cord round his neck)
    whistle = box((0, 4.93, chest + 0.045), (0.11, 0.07, 0.06), 'whistle')
    set_material(whistle, material(METAL))
    cord = []
    for s in (1, -1):
        c = box((s * 0.11, 5.19, chest + 0.02), (0.022, 0.56, 0.02), 'cord')
        transform(c, Matrix.Translation((0, 4.93, 0)) @ Matrix.Rotation(-s * 0.4, 4, 'Z') @ Matrix.Translation((0, -4.93, 0)))
        transform(c, Matrix.Translation((s * 0.02, 0, 0)))
        set_material(c, material(METAL))
        cord.append(c)

    bpy.data.objects.remove(mid)
    for o in (body, shirt, whistle, *cord):
        tag(o, BY_PLACE)
    built = [body, shirt, trousers(q, LEGS), whistle, *cord, *ears(), *bits]
    for s in (1, -1):
        built += fingers(s)
        for part in shoe(s):
            set_material(part, material(SHOE))
            built.append(part)
    return lighter(bearded(built), 0.5)


def dress_staff(hi, q=1.0):
    """The coach's suit (figure.py), its trousers a material of their own so a jacket and trousers can differ."""
    mid = thin(copy(hi, 'mid'), 44000)
    bits = head_bits(hi, mid)
    bpy.data.objects.remove(mid)
    built = dress_coach(hi, q)
    for o in built:
        # (figure.py builds the trousers from the shorts' form, and they keep its name)
        if o.name.startswith(('shorts', 'trousers')):
            set_material(o, material(LEGS))
    return lighter(bearded([*built, *bits]))


if __name__ == '__main__':
    a = args()
    reset()
    materials()
    for name, color in ((EYE, (0.02, 0.015, 0.012)), (BROW, (0.05, 0.04, 0.035)), (LIP, (0.3, 0.14, 0.12)), (BEARD, (0.3, 0.31, 0.35)), (HAIR_TOP, (0.08, 0.082, 0.095))):
        material(name, color, 0.7)
    for name, color in ((WARM, (0.08, 0.1, 0.2)), (TOP, (0.3, 0.3, 0.32)), (LEGS, (0.02, 0.02, 0.025)), (METAL, (0.5, 0.5, 0.52))):
        material(name, color, 0.75)

    hi = fused()
    people = []
    # (each is seen from across the floor more than up close: lighter than a player)
    for name, dress, q in (('bench', dress_bench, 0.44), ('staff', dress_staff, 0.42), ('official', dress_official, 0.6)):
        fig, rig_ob = finish(dress(copy(hi, 'hi2'), q), name)
        rig_ob.name = name + 'Rig'
        report(fig)
        people += [fig, rig_ob]
    bpy.data.objects.remove(hi)
    export_glb(os.path.join(a['out'], 'people.glb'), people)
    save_blend(os.path.join(a['blend'], 'people.blend'))
    if 'preview' in a:
        for i, o in enumerate(people[1::2]):
            o.location = B((i - 1) * 3.4, -FLOOR, 0)
        preview(
            os.path.join(a['preview'], 'people.png'),
            [((0, 4.5, 30), (0, 3.4, 0), 12), ((20, 6, 20), (0, 3.4, 0), 12), ((1.5, 6.3, 10), (0, 5.9 - FLOOR, 0), 2.2), ((-9, 6.2, 5), (-3.4, 5.9 - FLOOR, 0), 2.2)],
            size=(720, 520),
            ground=0,
            sheet_cols=2,
        )
