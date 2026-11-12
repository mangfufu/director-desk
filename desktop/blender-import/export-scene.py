"""Executed by a separate Blender process. Never saves or modifies the input file."""
import bpy
import json
import math
import os
import struct
import sys
from mathutils import Vector
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from materials import MaterialConverter


def progress(stage, amount):
    print('DIRECTOR_PROGRESS ' + json.dumps({'stage': stage, 'progress': amount}), flush=True)


def light_parameters(light, matrix):
    energy, color, temperature = light.energy, list(light.color), None
    if light.node_tree and getattr(light, 'use_nodes', False):
        out = next((n for n in light.node_tree.nodes if n.type == 'OUTPUT_LIGHT' and n.is_active_output), None)
        emission = out.inputs['Surface'].links[0].from_node if out and out.inputs['Surface'].is_linked else None
        if emission and emission.type == 'EMISSION':
            strength = emission.inputs['Strength']
            if light.type == 'SUN' and not strength.is_linked:
                energy = strength.default_value
            elif strength.is_linked and strength.links[0].from_node.type == 'LIGHT_FALLOFF':
                energy = strength.links[0].from_node.inputs['Strength'].default_value
            tint = emission.inputs['Color']
            if not tint.is_linked:
                color = list(tint.default_value[:3])
            elif tint.links[0].from_node.type == 'BLACKBODY':
                temperature = tint.links[0].from_node.inputs['Temperature'].default_value
                color = [1, 1, 1]
            elif tint.links[0].from_node.type == 'RGB':
                color = list(tint.links[0].from_socket.default_value[:3])
    if not getattr(light, 'normalize', True) and light.type != 'SUN' and hasattr(light, 'area'):
        energy *= light.area(matrix_world=matrix)
    return {'energy': energy * 2 ** getattr(light, 'exposure', 0), 'color': color, **({'temperature': temperature} if temperature else {})}


def has_surface(filepath):
    """glTF may export a control mesh as nodes only, even with export_apply."""
    with open(filepath, 'rb') as handle:
        header = handle.read(20)
        if len(header) != 20 or header[:4] != b'glTF' or header[16:20] != b'JSON':
            raise ValueError('Invalid GLB output')
        data = json.loads(handle.read(struct.unpack_from('<I', header, 12)[0]))
    accessors = data.get('accessors', [])
    return any(p.get('mode', 4) in {4, 5, 6}
               and accessors[p['attributes']['POSITION']].get('count', 0) > 0
               for mesh in data.get('meshes', []) for p in mesh.get('primitives', [])
               if 'POSITION' in p.get('attributes', {}))


def has_motion(obj, seen=None):
    """Conservatively include animation driven by parents, rigs or constraints.
    Static furniture need not be sampled across every frame of the scene.
    """
    if obj is None:
        return False
    seen = set() if seen is None else seen
    if obj in seen:
        return False
    seen.add(obj)
    data = getattr(obj, 'data', None)
    for owner in [obj, data, getattr(data, 'shape_keys', None)]:
        if getattr(owner, 'animation_data', None):
            return True
    if obj.rigid_body or obj.particle_systems:
        return True
    if any(m.type in {'NODES', 'CLOTH', 'SOFT_BODY', 'FLUID', 'MESH_CACHE', 'MESH_SEQUENCE_CACHE', 'OCEAN', 'WAVE', 'DYNAMIC_PAINT'} for m in obj.modifiers):
        return True
    dependencies = [obj.parent]
    settings = list(obj.modifiers) + list(obj.constraints)
    if obj.pose:
        settings += [constraint for bone in obj.pose.bones for constraint in bone.constraints]
    for item in settings:
        for prop in item.bl_rna.properties:
            if prop.type == 'POINTER':
                value = getattr(item, prop.identifier, None)
                if isinstance(value, bpy.types.Object): dependencies.append(value)
    return any(has_motion(target, seen) for target in dependencies if target)


def expand_collections(scene):
    """Only mutate the background process. Keep instance parents and their animation."""
    roots = {o for o in scene.objects if o.instance_type == 'COLLECTION' and o.instance_collection and not o.hide_render}
    pending = list(roots)
    while pending:
        obj = pending.pop()
        # Nested instances must be made local before changing their instance settings.
        before = set(scene.objects)
        for other in bpy.context.view_layer.objects:
            other.select_set(False)
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_select = False
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.duplicates_make_real(use_base_parent=True, use_hierarchy=True)
        obj.instance_type = 'NONE'
        added = set(scene.objects) - before
        pending.extend(o for o in added if o.instance_type == 'COLLECTION' and o.instance_collection and not o.hide_render)
    return roots


def convert(source, destination, animated):
    progress('reading', .02)
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    start, end = scene.frame_start, scene.frame_end
    if end < start:
        raise ValueError('Invalid scene frame range')
    fps = scene.render.fps / scene.render.fps_base
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError('Invalid scene frame rate')
    if animated and end - start > 36000:
        raise ValueError('Animation exceeds 36000 frames; shorten the Blender scene range')
    unit = scene.unit_settings.scale_length if scene.unit_settings.system != 'NONE' else 1.0
    scene.frame_set(start)
    instance_roots = expand_collections(scene)
    original_objects = [o for o in scene.objects if not o.hide_render]
    warnings = []
    result = {'version': 1, 'name': os.path.splitext(os.path.basename(source))[0], 'fps': fps,
              'duration': max(1 / fps, (end - start + 1) / fps) if animated else 10,
              'aspect': scene.render.resolution_x * scene.render.pixel_aspect_x / (scene.render.resolution_y * scene.render.pixel_aspect_y),
              'unitScale': unit, 'models': [], 'cameras': [], 'lights': [], 'cuts': [], 'warnings': warnings}

    def vec(value, scale=1):
        return [float(value[0]) * scale, float(value[2]) * scale, -float(value[1]) * scale]

    def warn(text):
        if text not in warnings:
            warnings.append(text)

    meshes = [o for o in original_objects if o.type in {'MESH', 'CURVE', 'SURFACE', 'FONT', 'META'}]
    groups, rigs, instances = [], {}, {}
    for obj in meshes:
        parent = obj.parent
        instance = None
        while parent:
            if parent in instance_roots:
                instance = parent
            parent = parent.parent
        if instance:
            if instance not in instances:
                instances[instance] = [instance]
            members = instances[instance]
            members.append(obj)
            armature = obj.find_armature() if obj.type == 'MESH' else None
            if armature and animated and armature not in members:
                members.append(armature)
            continue
        armature = obj.find_armature() if obj.type == 'MESH' else None
        if armature and animated:
            if armature.name not in rigs:
                rigs[armature.name] = [armature]
                groups.append((armature.name, rigs[armature.name], True))
            rigs[armature.name].append(obj)
        else:
            groups.append((obj.name, [obj], False))
    groups.extend((root.name, members, any(o.type == 'ARMATURE' for o in members)) for root, members in instances.items())
    for obj in original_objects:
        if obj.instance_type != 'NONE':
            warn('顶点或面实例未转换，请在 Blender 中将实例转为真实对象后导入。')
        if obj.type not in {'MESH', 'CURVE', 'SURFACE', 'FONT', 'META', 'EMPTY', 'ARMATURE', 'CAMERA', 'LIGHT'}:
            warn('未转换的对象类型：' + obj.type)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    materials = MaterialConverter(scene, destination, warn)
    for index, (name, objects, skinned) in enumerate(groups):
        progress('materials', .08 + .62 * index / max(1, len(groups)))
        scene.frame_set(start)
        materials.prepare(objects)
        progress('models', .08 + .62 * index / max(1, len(groups)))
        for obj in bpy.context.view_layer.objects:
            obj.select_set(False)
        for obj in objects:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_select = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        filename = 'model-%d.glb' % index
        animate_group = animated and any(has_motion(obj) for obj in objects)
        kwargs = {'filepath': os.path.join(destination, filename), 'export_format': 'GLB',
                  'use_selection': True, 'export_yup': True, 'export_animations': animate_group,
                  'export_animation_mode': 'SCENE', 'export_force_sampling': True,
                  'export_frame_range': True, 'export_frame_step': 1, 'export_negative_frame': 'SLIDE',
                  'export_anim_slide_to_zero': True, 'export_current_frame': not animate_group,
                  'export_apply': not skinned, 'export_skins': True, 'export_morph': True,
                  'export_cameras': False, 'export_lights': False, 'export_extras': False,
                  'export_draco_mesh_compression_enable': False, 'export_materials': 'EXPORT'}
        # Reuse original PNG/JPEG bytes. Forcing WebP re-encodes the same image
        # for every separately editable object and dominates conversion time.
        kwargs.update(export_image_format='AUTO', export_image_quality=100)
        bpy.ops.export_scene.gltf(**{k: v for k, v in kwargs.items() if k in props})
        if not has_surface(kwargs['filepath']):
            os.remove(kwargs['filepath'])
            warn(name + '：没有可导入的表面，已跳过。')
            continue
        result['models'].append({'name': name, 'file': filename, 'skinned': skinned})
        if any(m.type not in {'ARMATURE'} for o in objects for m in o.modifiers) and animated:
            warn('模型修改器按导出形状保留；随时间变化的几何形变需检查结果。')
    cameras = [o for o in original_objects if o.type == 'CAMERA']
    frames = range(start, end + 1) if animated else [start]
    for index, obj in enumerate(cameras):
        progress('cameras', .7 + .1 * index / max(1, len(cameras)))
        if obj.data.type != 'PERSP':
            warn(obj.name + '：正交或全景摄影机暂不转换。')
            continue
        camera = {'id': obj.name, 'name': obj.name, 'samples': []}
        for frame in frames:
            scene.frame_set(frame)
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            matrix = evaluated.matrix_world
            rotation = matrix.to_quaternion()
            corners = evaluated.data.view_frame(scene=scene)
            top = max(v.y / -v.z for v in corners)
            bottom = min(v.y / -v.z for v in corners)
            left = min(v.x / -v.z for v in corners)
            right = max(v.x / -v.z for v in corners)
            camera['samples'].append({'time': (frame - start) / fps, 'position': vec(matrix.translation, unit),
                'forward': vec(rotation @ Vector((0, 0, -1))), 'up': vec(rotation @ Vector((0, 1, 0))),
                'verticalSpan': top - bottom, 'frameX': -(left + right) / (right - left), 'frameY': -(top + bottom) / (top - bottom)})
        result['cameras'].append(camera)
    available = {c['id'] for c in result['cameras']}
    scene.frame_set(start)
    initial_camera = scene.camera.name if scene.camera else ''
    markers = sorted([m for m in scene.timeline_markers if m.camera], key=lambda m: m.frame)
    for marker in markers:
        if marker.frame <= start:
            initial_camera = marker.camera.name
    if initial_camera not in available and available:
        initial_camera = result['cameras'][0]['id']
    if initial_camera:
        result['cuts'].append({'time': 0, 'camera': initial_camera})
    if animated:
        for marker in markers:
            if start < marker.frame <= end and marker.camera.name in available:
                cut = {'time': (marker.frame - start) / fps, 'camera': marker.camera.name}
                if result['cuts'] and result['cuts'][-1]['time'] == cut['time']:
                    result['cuts'][-1] = cut
                else:
                    result['cuts'].append(cut)
    scene.frame_set(start)
    progress('lights', .82)
    for obj in original_objects:
        if obj.type != 'LIGHT':
            continue
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        light = evaluated.data
        matrix = evaluated.matrix_world
        result['lights'].append({'name': obj.name, 'type': light.type, 'position': vec(matrix.translation, unit),
            'forward': vec(matrix.to_quaternion() @ Vector((0, 0, -1))), 'up': vec(matrix.to_quaternion() @ Vector((0, 1, 0))),
            **light_parameters(light, matrix), 'angle': getattr(light, 'spot_size', math.pi / 4),
            'penumbra': getattr(light, 'spot_blend', .15), 'width': getattr(light, 'size', 1) * unit,
            'height': getattr(light, 'size_y', getattr(light, 'size', 1)) * unit})
        if obj.animation_data or light.animation_data or obj.constraints:
            warn(obj.name + '：灯光采用起始帧状态，灯光动画未导入。')
    if scene.world and scene.world.use_nodes:
        warn('世界环境节点未转换；可在导演台中调整环境光。')
    for image in bpy.data.images:
        if image.source == 'FILE' and not image.packed_file and image.filepath and not os.path.isfile(bpy.path.abspath(image.filepath, library=image.library)):
            warn('缺失贴图：' + image.name)
    if not result['models'] and not result['cameras'] and not result['lights']:
        raise ValueError('Scene contains no supported objects')
    progress('packing', .9)
    with open(os.path.join(destination, 'scene.json'), 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, allow_nan=False)
    print('DIRECTOR_MATERIALS ' + json.dumps({'materials': materials.converted, 'simplifiedMaterials': materials.simplified}), flush=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    convert(args[0], args[1], args[2] == 'animated')
