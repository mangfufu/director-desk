"""Independent material fixture; no Classroom names or source assets."""
import bpy
import os
import sys
import json

destination = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name, kind='ShaderNodeBsdfDiffuse'):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes.clear()
    surface = m.node_tree.nodes.new(kind)
    output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(surface.outputs[0], output.inputs['Surface'])
    return m, surface

def cube(name, m, x):
    bpy.ops.mesh.primitive_cube_add(location=(x, 0, 1))
    obj = bpy.context.object; obj.name = name; obj.data.materials.append(m)
    return obj

red, diffuse = material('Legacy red')
diffuse.inputs['Color'].default_value = (.7, .02, .04, 1)
cube('Solid red', red, 0)

pattern, diffuse = material('Procedural checker')
checker = pattern.node_tree.nodes.new('ShaderNodeTexChecker')
checker.inputs['Color1'].default_value = (.02, .1, .8, 1)
checker.inputs['Color2'].default_value = (.8, .6, .02, 1)
checker.inputs['Scale'].default_value = 4
pattern.node_tree.links.new(checker.outputs['Color'], diffuse.inputs['Color'])
cube('Procedural checker', pattern, 3)

image = bpy.data.images.new('Portable image', width=4, height=4)
image.pixels[:] = [.02, .8, .04, 1] * 16
image.filepath_raw = os.path.join(os.path.dirname(destination), 'green.png')
image.file_format = 'PNG'; image.save()
image_mat, diffuse = material('Image color')
node = image_mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = image
image_mat.node_tree.links.new(node.outputs['Color'], diffuse.inputs['Color'])
cube('Image green', image_mat, 6)

adjusted, diffuse=material('Adjusted image')
tex=adjusted.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
mix=adjusted.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
mix.inputs[2].default_value=(.3,.6,.9,1)
adjusted.node_tree.links.new(tex.outputs['Color'],mix.inputs[1])
adjusted.node_tree.links.new(mix.outputs['Color'],diffuse.inputs['Color'])
cube('Adjusted image',adjusted,18)

plain=bpy.data.materials.new('Viewport color');plain.diffuse_color=(.15,.25,.75,1);plain.use_nodes=False
cube('Viewport color',plain,21)

group = bpy.data.node_groups.new('Legacy group', 'ShaderNodeTree')
group.interface.new_socket(name='Tint', in_out='INPUT', socket_type='NodeSocketColor')
group.interface.new_socket(name='Shader', in_out='OUTPUT', socket_type='NodeSocketShader')
inp = group.nodes.new('NodeGroupInput'); out = group.nodes.new('NodeGroupOutput')
surface = group.nodes.new('ShaderNodeBsdfDiffuse')
group.links.new(inp.outputs['Tint'], surface.inputs['Color']); group.links.new(surface.outputs[0], out.inputs['Shader'])
grouped, old = material('Grouped purple'); grouped.node_tree.nodes.remove(old)
node = grouped.node_tree.nodes.new('ShaderNodeGroup'); node.node_tree = group
node.inputs['Tint'].default_value = (.4, .02, .6, 1)
grouped.node_tree.links.new(node.outputs['Shader'], next(n for n in grouped.node_tree.nodes if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
cube('Group purple', grouped, 9)

glass, shader = material('Glass', 'ShaderNodeBsdfGlass')
shader.inputs['IOR'].default_value = 1.45; shader.inputs['Roughness'].default_value = .12
cube('Glass', glass, 12)

metal, shader = material('Metal', 'ShaderNodeBsdfAnisotropic')
shader.inputs['Color'].default_value = (.6, .3, .05, 1)
shader.inputs['Roughness'].default_value = .2
cube('Metal', metal, 15)

bpy.ops.object.light_add(type='SUN', location=(0,0,5))
light=bpy.context.object.data;light.use_nodes=True
emission=next(n for n in light.node_tree.nodes if n.type=='EMISSION')
emission.inputs['Strength'].default_value=2.3
temperature=light.node_tree.nodes.new('ShaderNodeBlackbody');temperature.inputs['Temperature'].default_value=4100
light.node_tree.links.new(temperature.outputs[0],emission.inputs['Color'])

bpy.ops.wm.save_as_mainfile(filepath=destination)
with open(destination+'.expected.json','w') as file:
    json.dump({'plainColor':list(plain.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value) if plain.use_nodes else list(plain.diffuse_color)},file)
