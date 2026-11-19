# What every model script shares: the game's frame, mesh helpers, materials, the GLB export and the
# preview renders. Run by scripts/blender/run.ts (npm run models:build), never by hand inside Blender.
#
# The game's frame (G): x to a figure's left, y up, z the way he faces; feet. Blender's is z up with a
# figure facing -y, so G (x, y, z) is Blender (x, -z, y); the glTF export turns it back.
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector


def args():
    """The arguments after `--`: {out, blend, preview} folders (preview may be missing)."""
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return {a[i].lstrip('-'): a[i + 1] for i in range(0, len(a) - 1, 2)}


def B(x, y, z):
    """A point of the game's frame, in Blender's."""
    return Vector((x, -z, y))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'NONE'
    return sc


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, verts, faces):
    """A mesh from points of the game's frame."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([B(*v) for v in verts], [], faces)
    me.update()
    return link(bpy.data.objects.new(name, me))


def from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def material(name, color=(0.5, 0.5, 0.5), rough=0.6, shade=True):
    """A named material (the app picks its own by the name); in Blender it shows the mesh's shading."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if shade:
        col = nt.nodes.new('ShaderNodeVertexColor')
        col.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Fac'].default_value = 1
        mix.inputs['Color1'].default_value = (*color, 1)
        nt.links.new(col.outputs['Color'], mix.inputs['Color2'])
        nt.links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj, angle=None):
    """Smooth shading; edges sharper than `angle` (degrees) stay hard."""
    me = obj.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if angle is not None:
        me.set_sharp_from_angle(angle=math.radians(angle))
    me.update()


def apply_modifier(obj, kind, **props):
    """Adds a modifier and bakes it into the mesh."""
    mod = obj.modifiers.new(kind, kind)
    for k, v in props.items():
        setattr(mod, k, v)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
    obj.modifiers.remove(mod)
    old = obj.data
    mats = list(old.materials)
    obj.data = me
    if not me.materials:
        for m in mats:
            me.materials.append(m)
    bpy.data.meshes.remove(old)
    return obj


def join(objs, name):
    """Several meshes as one (their materials kept, each in its own slot)."""
    bm = bmesh.new()
    mats = []
    for o in objs:
        slot = []
        for m in o.data.materials:
            if m not in mats:
                mats.append(m)
            slot.append(mats.index(m))
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        for f in tmp.faces:
            f.material_index = slot[f.material_index] if slot else 0
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        # (from_mesh keeps each face's slot number as written above)
    out = from_bm(name, bm)
    for m in mats:
        out.data.materials.append(m)
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(me)
    return out


# --- shapes (all in the game's frame) ---

def lathe(profile, seg=24, deep=1.0, at=(0, 0, 0), name='lathe', cap=True):
    """A shape turned round the line straight up: (height, radius) pairs from the bottom up; `deep` squashes it front to back."""
    verts, faces = [], []
    for y, r in profile:
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append((at[0] + math.cos(a) * r, at[1] + y, at[2] + math.sin(a) * r * deep))
    n = len(profile)
    for i in range(n - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, a + seg, b + seg, b))
    if cap:
        faces.append(tuple(range(seg)))
        faces.append(tuple(reversed(range((n - 1) * seg, n * seg))))
    return mesh_obj(name, verts, faces)


def ellipsoid(center, radii, seg=20, rings=14, name='ball', rot=None):
    """An ellipsoid; `rot` is a Matrix (game frame) turning it about its center."""
    verts, faces = [], []
    for i in range(1, rings):
        t = math.pi * i / rings
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append(Vector((math.sin(t) * math.cos(a) * radii[0], math.cos(t) * radii[1], math.sin(t) * math.sin(a) * radii[2])))
    top, bot = len(verts), len(verts) + 1
    verts += [Vector((0, radii[1], 0)), Vector((0, -radii[1], 0))]
    for i in range(rings - 2):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    for k in range(seg):
        faces.append((top, (k + 1) % seg, k))
        faces.append((bot, (rings - 2) * seg + k, (rings - 2) * seg + (k + 1) % seg))
    c = Vector(center)
    if rot is not None:
        verts = [rot @ v for v in verts]
    return mesh_obj(name, [tuple(v + c) for v in verts], faces)


def box(center, size, name='box'):
    x, y, z = (s / 2 for s in size)
    c = center
    v = [(c[0] + sx * x, c[1] + sy * y, c[2] + sz * z) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return mesh_obj(name, v, f)


def loft(rings, name='loft', cap=True, closed=True):
    """A skin over rings of points (each ring the same count, the same way round)."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces = []
    for i in range(len(rings) - 1):
        for k in range(n if closed else n - 1):
            a, b = i * n + k, i * n + (k + 1) % n
            faces.append((a, b, b + n, a + n))
    if cap:
        faces.append(tuple(reversed(range(n))))
        faces.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    return mesh_obj(name, verts, faces)


def transform(obj, m):
    """Moves a mesh's points by a matrix given in the game's frame."""
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # G -> Blender
    obj.data.transform(conv @ m @ conv.inverted())
    obj.data.update()
    return obj


def fix_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# --- shading baked into the mesh: how open to the sky each point is ---

def bake_occlusion(obj, others=(), rays=48, reach=1.4, floor=None, low=0.42, name='Col', lift=0.03, blur=2, only=None, skip=()):
    """
    Writes each point's shade (1 open, `low` shut in) to the colour attribute: rays from just off the
    point over its outward half, against this mesh and `others`. `floor` (a height, game frame) also
    blocks. The shade is evened out over neighbours `blur` times (a bump in the mesh is not a hollow).
    `only` (one flag a point): the points shaded, the rest left as they are. `skip`: the material slots
    of this mesh whose faces don't block (what only some men wear).
    """
    from mathutils.bvhtree import BVHTree
    trees = []
    for o in (obj, *others):
        if o is obj and skip:
            world = [o.matrix_world @ v.co for v in o.data.vertices]
            trees.append(BVHTree.FromPolygons(world, [list(p.vertices) for p in o.data.polygons if p.material_index not in skip]))
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        trees.append(BVHTree.FromBMesh(bm))
        bm.free()
    rng = np.random.default_rng(7)
    dirs = rng.normal(size=(rays, 3))
    dirs /= np.linalg.norm(dirs, axis=1)[:, None]
    me = obj.data
    shut = np.zeros(len(me.vertices))
    for v in me.vertices:
        if only is not None and not only[v.index]:
            continue
        n = v.normal
        p = v.co + n * lift
        hit = 0.0
        tot = 0.0
        for d in dirs:
            dv = Vector(d)
            c = dv.dot(n)
            if c < 0:
                dv = -dv
                c = -c
            if c <= 0.2:
                continue
            tot += c
            blocked = False
            for t in trees:
                loc, _, _, dist = t.ray_cast(p, dv, reach)
                if loc is not None:
                    blocked = True
                    hit += c * (1 - 0.6 * dist / reach)
                    break
            if not blocked and floor is not None and dv.z < 0 and (p.z - floor) / -dv.z < reach:
                hit += c * 0.6
        shut[v.index] = min(1.0, (hit / tot) * 1.25) if tot else 0
    if blur:
        ea = np.zeros(len(me.edges) * 2, dtype=np.int32)
        me.edges.foreach_get('vertices', ea)
        ea = ea.reshape(-1, 2)
        deg = np.bincount(ea.ravel(), minlength=len(me.vertices)).astype(float)
        for _ in range(blur):
            acc = np.zeros(len(me.vertices))
            np.add.at(acc, ea[:, 0], shut[ea[:, 1]])
            np.add.at(acc, ea[:, 1], shut[ea[:, 0]])
            shut = np.where(deg > 0, 0.4 * shut + 0.6 * acc / np.maximum(deg, 1), shut)
    if only is not None:
        shut = np.where(np.asarray(only, dtype=bool), shut, 0.0)
    shade = 1 - (1 - low) * shut
    col = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    prev = np.ones(len(me.vertices) * 4)
    col.data.foreach_get('color', prev)
    prev = prev.reshape(-1, 4)
    prev[:, :3] *= shade[:, None]
    col.data.foreach_set('color', prev.ravel())
    me.color_attributes.active_color = col
    me.color_attributes.render_color_index = list(me.color_attributes).index(col)
    return shade


def paint(obj, fn, name='Col'):
    """Sets (or with existing colour, multiplies) each point's shade by fn(x, y, z) of its game-frame position."""
    me = obj.data
    fresh = me.color_attributes.get(name) is None
    col = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    data = np.ones(len(me.vertices) * 4)
    if not fresh:
        col.data.foreach_get('color', data)
    data = data.reshape(-1, 4)
    for v in me.vertices:
        data[v.index, :3] *= fn(v.co.x, v.co.z, -v.co.y)
    col.data.foreach_set('color', data.ravel())
    me.color_attributes.active_color = col


def soften(obj, where, keep, name='Col'):
    """
    Lifts the baked shade toward white, `keep` of it staying: at the points `where(x, y, z)` (game
    frame) says yes to, or (a list) at the points whose entry is true.
    """
    me = obj.data
    col = me.color_attributes[name]
    data = np.ones(len(me.vertices) * 4)
    col.data.foreach_get('color', data)
    data = data.reshape(-1, 4)
    for v in me.vertices:
        if where[v.index] if isinstance(where, list) else where(v.co.x, v.co.z, -v.co.y):
            data[v.index, :3] = 1 - (1 - data[v.index, :3]) * keep
    col.data.foreach_set('color', data.ravel())


# --- a picture laid in a mesh's uv (anatomy.py's map of his skin) ---

def raster_uv(uv, attrs, size, chunk=4096):
    """
    Each texel of a size x size picture whose centre one of the triangles covers, and what that triangle has there:
    `uv` (T, 3, 2) in the picture's own frame (u across, v DOWN from its top row: row r is v = (r + 0.5) / size),
    `attrs` (T, 3, C) at the corners, straight between them. Says (values (size, size, C), hits (size, size): how
    many triangles cover each texel; more than one is a uv laid twice).
    """
    uv = np.asarray(uv, dtype=np.float64) * size - 0.5
    attrs = np.asarray(attrs, dtype=np.float64)
    out = np.zeros((size * size, attrs.shape[2]), dtype=np.float64)
    hits = np.zeros(size * size, dtype=np.int32)
    lo = np.clip(np.ceil(uv.min(1)), 0, size - 1).astype(np.int64)
    hi = np.clip(np.floor(uv.max(1)), 0, size - 1).astype(np.int64)
    span = np.maximum(hi - lo + 1, 0)
    # (a few thousand triangles at a time: each one's box of texels, every texel in it tried)
    for at in range(0, len(uv), chunk):
        sl = slice(at, at + chunk)
        n = span[sl, 0] * span[sl, 1]
        tri = np.repeat(np.arange(at, at + len(n)), n)
        k = np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n)
        x = lo[tri, 0] + k % span[tri, 0]
        y = lo[tri, 1] + k // span[tri, 0]
        a, b, c = uv[tri, 0], uv[tri, 1], uv[tri, 2]
        d = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1])
        ok = np.abs(d) > 1e-12
        d = np.where(ok, d, 1.0)
        l1 = ((x - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (y - a[:, 1])) / d
        l2 = ((b[:, 0] - a[:, 0]) * (y - a[:, 1]) - (x - a[:, 0]) * (b[:, 1] - a[:, 1])) / d
        l0 = 1 - l1 - l2
        inside = ok & (l0 >= 0) & (l1 >= 0) & (l2 >= 0)
        tri, x, y, l0, l1, l2 = tri[inside], x[inside], y[inside], l0[inside], l1[inside], l2[inside]
        at_ = y * size + x
        out[at_] = attrs[tri, 0] * l0[:, None] + attrs[tri, 1] * l1[:, None] + attrs[tri, 2] * l2[:, None]
        np.add.at(hits, at_, 1)
    return out.reshape(size, size, -1), hits.reshape(size, size)


def dilate(img, mask, px=16):
    """
    The picture with the texels within `px` of `mask` (and not in it) filled from it, the rest as they were: pushed
    down to ever coarser copies of what the mask holds (each texel the mean of the four under it that hold
    something), then pulled back up wherever the finer copy holds nothing. A texel in the mask keeps its own.
    """
    img = np.asarray(img, dtype=np.float64)
    flat = img.ndim == 2
    v = img[..., None] if flat else img
    w = np.asarray(mask, dtype=np.float64)
    vs, ws = [v * w[..., None]], [w]
    while max(ws[-1].shape) > 1:
        a, b = vs[-1], ws[-1]
        h, wd = (a.shape[0] + 1) // 2 * 2, (a.shape[1] + 1) // 2 * 2
        a = np.pad(a, ((0, h - a.shape[0]), (0, wd - a.shape[1]), (0, 0)))
        b = np.pad(b, ((0, h - b.shape[0]), (0, wd - b.shape[1])))
        vs.append(a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2])
        ws.append(b[0::2, 0::2] + b[1::2, 0::2] + b[0::2, 1::2] + b[1::2, 1::2])
    fill = vs[-1] / np.maximum(ws[-1], 1e-12)[..., None]
    for a, b in zip(vs[-2::-1], ws[-2::-1]):
        up = np.repeat(np.repeat(fill, 2, 0), 2, 1)[: a.shape[0], : a.shape[1]]
        # (each coarse texel's four, eased into their neighbours': a quarter, a half, a quarter each way, so the fill is not blocks)
        for axis in (0, 1):
            e = np.concatenate([np.take(up, [0], axis), up, np.take(up, [-1], axis)], axis)
            up = 0.25 * np.take(e, range(0, e.shape[axis] - 2), axis) + 0.5 * up + 0.25 * np.take(e, range(2, e.shape[axis]), axis)
        fill = np.where((b > 0)[..., None], a / np.maximum(b, 1e-12)[..., None], up)
    # (how far each texel is from the mask: grown a texel at a time, square, so `px` is a box round it)
    near = np.asarray(mask, dtype=bool)
    for _ in range(px):
        g = near.copy()
        g[1:] |= near[:-1]
        g[:-1] |= near[1:]
        near = g.copy()
        near[:, 1:] |= g[:, :-1]
        near[:, :-1] |= g[:, 1:]
    out = np.where((near & ~np.asarray(mask, dtype=bool))[..., None], fill, v)
    return out[..., 0] if flat else out


def write_png(path, pixels):
    """
    A picture as a PNG (8 bits a channel: grey, grey and alpha, RGB or RGBA by how many channels it has), written the
    same to the byte every time: its header, its pixels and its end, nothing else (no time, no text), each row
    filtered the way that leaves it smallest by the format's usual test, at zlib's best.
    """
    import struct
    import zlib

    px = np.asarray(pixels)
    if px.dtype != np.uint8:
        raise ValueError('write_png: 8-bit pixels only')
    if px.ndim == 2:
        px = px[..., None]
    h, w, c = px.shape
    kind = {1: 0, 2: 4, 3: 2, 4: 6}[c]
    row = px.reshape(h, w * c).astype(np.int16)
    left = np.zeros_like(row)
    left[:, c:] = row[:, :-c]
    up = np.zeros_like(row)
    up[1:] = row[:-1]
    corner = np.zeros_like(row)
    corner[1:, c:] = row[:-1, :-c]
    # (Paeth: whichever of left, up and their corner is nearest left + up - corner)
    p = left + up - corner
    pa, pb, pc = np.abs(p - left), np.abs(p - up), np.abs(p - corner)
    paeth = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, up, corner))
    tries = [row, row - left, row - up, row - (left + up) // 2, row - paeth]
    tries = [(t % 256).astype(np.uint8) for t in tries]
    # (the usual test: the least sum of each byte taken as a signed number)
    cost = np.stack([np.abs(t.astype(np.int8).astype(np.int64)).sum(1) for t in tries])
    best = cost.argmin(0)
    raw = np.empty((h, w * c + 1), dtype=np.uint8)
    raw[:, 0] = best
    for k, t in enumerate(tries):
        raw[best == k, 1:] = t[best == k]

    def chunk(kind_, data):
        return struct.pack('>I', len(data)) + kind_ + data + struct.pack('>I', zlib.crc32(kind_ + data) & 0xFFFFFFFF)

    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, kind, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw.tobytes(), 9)) + chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(out)
    return len(out)


# --- out ---

def export_glb(path, objs):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_all_influences=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_materials='EXPORT',
        export_image_format='NONE',
        export_vertex_color='ACTIVE',
        export_active_vertex_color_when_no_material=True,
        export_attributes=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
    )
    print(f'[models] wrote {path} ({os.path.getsize(path) / 1024:.0f} kB)')


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # (no .blend1 beside it: the script is the model's history)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=path, check_existing=False)


def preview(path, shots, size=(520, 760), ground=None, sheet_cols=None):
    """
    Renders the scene for a look: `shots` is a list of (eye, target, across) in the game's frame
    (`across` is how many feet the picture's width covers at the target), tiled into one picture.
    """
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sc.world = world
    made = []
    for name, at, energy, color in (('key', (6, 16, 9), 3.2, (1, 0.96, 0.9)), ('rim', (-7, 9, -12), 1.6, (0.8, 0.86, 1)), ('fill', (-9, 5, 8), 0.9, (1, 1, 1))):
        li = bpy.data.lights.new(name, 'SUN')
        li.energy = energy
        li.color = color
        ob = link(bpy.data.objects.new(name, li))
        ob.location = B(*at)
        ob.rotation_euler = (Vector((0, 0, 0)) - B(*at)).to_track_quat('-Z', 'Y').to_euler()
        made.append(ob)
    if ground is not None:
        g = box((0, ground - 0.05, 0), (60, 0.1, 60), 'ground')
        set_material(g, material('ground', (0.62, 0.44, 0.27), 0.5, shade=False))
        made.append(g)
    cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam')))
    cam.data.lens = 85
    cam.data.sensor_width = 36
    sc.camera = cam
    made.append(cam)
    tiles = []
    for i, (eye, target, across) in enumerate(shots):
        e, t = B(*eye), B(*target)
        d = (e - t).normalized()
        dist = across * cam.data.lens / cam.data.sensor_width
        cam.location = t + d * dist
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{path}.{i}.png'
        bpy.ops.render.render(write_still=True)
        tiles.append(sc.render.filepath)
    cols = sheet_cols or len(tiles)
    rows = math.ceil(len(tiles) / cols)
    w, h = size
    sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    for i, p in enumerate(tiles):
        img = bpy.data.images.load(p)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        r, c = divmod(i, cols)
        sheet[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = px
        bpy.data.images.remove(img)
        os.remove(p)
    out = bpy.data.images.new('sheet', cols * w, rows * h, alpha=False)
    out.pixels = sheet.ravel()
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
    for o in made:
        bpy.data.objects.remove(o)
    print(f'[models] preview {path}')
