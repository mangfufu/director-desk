import bpy
import math
import os
import sys
import json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

destination = sys.argv[sys.argv.index('--') + 1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.frame_start, scene.frame_end, scene.render.fps = 11, 35, 24
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
bpy.ops.mesh.primitive_cube_add(location=(3, 2, 1))
cube = bpy.context.object
cube.name = 'Moving Cube'
cube.scale = (1, .5, 1)
cube.keyframe_insert('location', frame=11)
cube.location.x = 5
cube.keyframe_insert('location', frame=35)
mat = bpy.data.materials.new('Blue')
mat.diffuse_color = (.2, .4, .7, 1)
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.2, .4, .7, 1)
cube.data.materials.append(mat)
bpy.ops.mesh.primitive_cube_add(location=(-3, 0, .5), scale=(.4, .4, .5))
array = bpy.context.object
array.name = 'Array Props'
mod = array.modifiers.new('Three copies', 'ARRAY')
mod.count = 3
mod.relative_offset_displace = (2, 0, 0)
bpy.ops.object.armature_add(location=(0, 0, 0))
rig = bpy.context.object
rig.name = 'Animated Rig'
bpy.ops.mesh.primitive_cube_add(location=(0, 0, .5), scale=(.2, .2, .5))
body = bpy.context.object
body.name = 'Rig Body'
body.parent = rig
group = body.vertex_groups.new(name='Bone')
group.add(list(range(len(body.data.vertices))), 1, 'REPLACE')
arm = body.modifiers.new('Armature', 'ARMATURE')
arm.object = rig
bone = rig.pose.bones['Bone']
bone.rotation_mode = 'XYZ'
bone.keyframe_insert('rotation_euler', frame=11)
bone.rotation_euler.y = .8
bone.keyframe_insert('rotation_euler', frame=35)
bpy.ops.object.camera_add(location=(9, -10, 6))
camera = bpy.context.object
camera.name = 'Tracking Camera'
camera.rotation_euler = (Vector((1, 0, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 45
camera.data.shift_x = .1
camera.data.shift_y = .05
camera.rotation_euler.rotate_axis('Z', .25)
camera.keyframe_insert('location', frame=11)
camera.location.x = 7
camera.keyframe_insert('location', frame=35)
camera.data.keyframe_insert('lens', frame=11)
camera.data.lens = 60
camera.data.keyframe_insert('lens', frame=35)
scene.camera = camera
first_marker = scene.timeline_markers.new('First shot', frame=11)
first_marker.camera = camera
bpy.ops.object.camera_add(location=(-7, -8, 4))
second = bpy.context.object
second.name = 'Second Camera'
second.rotation_euler = (Vector((1, 0, 1)) - second.location).to_track_quat('-Z', 'Y').to_euler()
marker = scene.timeline_markers.new('Switch', frame=23)
marker.camera = second
bpy.ops.object.light_add(type='AREA', location=(0, -3, 6))
bpy.context.object.name = 'Key Area'
bpy.context.object.data.energy = 400
bpy.context.object.data.size = 4
bpy.context.object.rotation_euler = (.2, 0, 0)
# A renderable collection with a nested collection, instanced twice. Its source
# meshes are deliberately not linked directly into the scene.
parts = bpy.data.collections.new('Instance Parts')
part = bpy.data.objects.new('Instance Part', cube.data.copy())
part.location = (.5, 0, .5)
part.scale = (.5, .5, .5)
parts.objects.link(part)
nested = bpy.data.collections.new('Nested Parts')
nested_part = bpy.data.objects.new('Nested Part', cube.data.copy())
nested_part.location = (-.5, 0, .5)
nested_part.scale = (.25, .25, .25)
nested.objects.link(nested_part)
nested_root = bpy.data.objects.new('Nested Instance', None)
nested_root.instance_type, nested_root.instance_collection = 'COLLECTION', nested
parts.objects.link(nested_root)
for name, position in [('Instance A', (8, 2, 0)), ('Instance B', (-8, 2, 0))]:
    instance = bpy.data.objects.new(name, None)
    scene.collection.objects.link(instance)
    instance.instance_type, instance.instance_collection = 'COLLECTION', parts
    instance.location = position
    instance.keyframe_insert('location', frame=11)
    instance.location.y += 2
    instance.keyframe_insert('location', frame=35)
# Control edges must not abort an otherwise valid scene import.
wire = bpy.data.meshes.new('Control Edges')
wire.from_pydata([(0, 0, 0), (1, 0, 0)], [(0, 1)], [])
scene.collection.objects.link(bpy.data.objects.new('Wire Control', wire))
curve_data = bpy.data.curves.new('Unbeveled Path', 'CURVE')
curve_data.dimensions = '3D'
spline = curve_data.splines.new('POLY')
spline.points.add(1)
spline.points[0].co, spline.points[1].co = (0, 0, 0, 1), (1, 0, 0, 1)
scene.collection.objects.link(bpy.data.objects.new('Path Control', curve_data))
scene.frame_set(11)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(destination))
expected = []
for frame in [11, 23, 35]:
    scene.frame_set(frame)
    for cam in [camera, second]:
        for point in [(0, 0, 0), (3, 2, 1), (-3, 0, .5)]:
            screen = world_to_camera_view(scene, cam, Vector(point))
            expected.append({'camera': cam.name, 'time': (frame - 11) / 24, 'point': [point[0], point[2], -point[1]], 'ndc': [2 * screen.x - 1, 2 * screen.y - 1]})
with open(os.path.splitext(destination)[0] + '-projection.json', 'w') as handle:
    json.dump(expected, handle)
