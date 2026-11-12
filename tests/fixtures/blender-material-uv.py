"""Compare original image UVs before/after the fast material conversion."""
import bpy
import math
import os
import sys
from mathutils import Vector
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.abspath('desktop/blender-import'))
from materials import MaterialConverter

folder = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(folder, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add()
obj = bpy.context.object
m = bpy.data.materials.new('UV pattern'); m.use_nodes = True; m.node_tree.nodes.clear()
tree=m.node_tree
uv=tree.nodes.new('ShaderNodeTexCoord'); checker=tree.nodes.new('ShaderNodeTexImage')
image=bpy.data.images.new('UV checker',width=32,height=32)
image.pixels=[value for y in range(32) for x in range(32) for value in ((.04,.2,.6,1) if (x//4+y//4)%2 else (.8,.03,.1,1))]
checker.image=image
tree.links.new(uv.outputs['UV'],checker.inputs['Vector'])
diffuse=tree.nodes.new('ShaderNodeBsdfDiffuse');tree.links.new(checker.outputs['Color'],diffuse.inputs['Color'])
out=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(diffuse.outputs[0],out.inputs['Surface'])
obj.data.materials.append(m)
bpy.ops.object.camera_add(location=(4,-6,3))
camera=bpy.context.object;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.camera=camera;s.render.engine='CYCLES';s.cycles.samples=1;s.cycles.use_denoising=False
s.render.resolution_x=128;s.render.resolution_y=128;s.render.resolution_percentage=100
s.view_settings.view_transform='Standard'

def render_color(material, socket, name):
    tree=material.node_tree;out=next(n for n in tree.nodes if n.type=='OUTPUT_MATERIAL')
    old=out.inputs['Surface'].links[0].from_socket
    emission=tree.nodes.new('ShaderNodeEmission');tree.links.new(socket,emission.inputs[0]);tree.links.new(emission.outputs[0],out.inputs['Surface'])
    try:
        s.render.filepath=os.path.join(folder,name+'.png');bpy.ops.render.render(write_still=True)
        image=bpy.data.images.load(s.render.filepath,check_existing=False)
        result=list(image.pixels);bpy.data.images.remove(image);return result
    finally:
        tree.links.new(old,out.inputs['Surface']);tree.nodes.remove(emission)

before=render_color(m,checker.outputs['Color'],'before')
uv_names=[layer.name for layer in obj.data.uv_layers]
converter=MaterialConverter(s,folder,print);converter.prepare([obj])
assert [layer.name for layer in obj.data.uv_layers]==uv_names
assert converter.simplified==0
m=obj.material_slots[0].material
p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
after=render_color(m,p.inputs['Base Color'].links[0].from_socket,'after')
errors=[abs(a-b) for i,(a,b) in enumerate(zip(before,after)) if i%4!=3]
mean=sum(errors)/len(errors)
print('UV_RENDER_MEAN_ERROR',mean,flush=True)
assert mean<.025,mean
