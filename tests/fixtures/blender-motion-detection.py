import bpy
import importlib.util
import os
import sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('director_export', os.path.abspath('desktop/blender-import/export-scene.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add(); static = bpy.context.object
static.modifiers.new('Array', 'ARRAY')
assert not module.has_motion(static)
bpy.ops.object.empty_add(); parent = bpy.context.object
parent.keyframe_insert('location', frame=1); parent.location.x=2; parent.keyframe_insert('location', frame=20)
assert not module.has_motion(static), 'Unrelated animated objects must not force static furniture sampling'
static.parent = parent
assert module.has_motion(static)
static.parent = None
constraint=static.constraints.new('COPY_LOCATION'); constraint.target=parent
assert module.has_motion(static)
static.constraints.remove(constraint)
driver=static.driver_add('location',0); driver.driver.expression='frame * 0.1'
assert module.has_motion(static)
static.animation_data_clear()
static.modifiers.new('Geometry Nodes','NODES')
assert module.has_motion(static)
print('PASS static objects, animated parents, constraint targets, drivers and procedural geometry')
