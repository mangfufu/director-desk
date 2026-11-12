"""Prepare editable PBR materials in the disposable Blender process only.

Legacy shaders become editable PBR surfaces. Existing image textures are retained;
unsupported procedural inputs use inexpensive color/parameter approximations.
No render baking, new UV atlases or source-file writes are performed.
"""
import bpy
import os


def linked(socket):
    return socket.links[0].from_socket if socket and socket.is_linked else None


def copy_input(tree, source, target):
    if source is None or target is None:
        return
    output = linked(source)
    if output:
        tree.links.new(output, target)
    elif hasattr(source, 'default_value'):
        try:
            target.default_value = source.default_value
        except (TypeError, ValueError):
            if target.type == 'RGBA' and isinstance(source.default_value, (float, int)):
                value = source.default_value
                target.default_value = (value, value, value, 1)


def flatten_groups(tree, depth=0):
    """Copy groups before ungrouping: never edit linked/shared source trees."""
    if depth > 16:
        raise ValueError('Material node groups are nested too deeply')
    for group in list(tree.nodes):
        if group.type != 'GROUP' or not group.node_tree:
            continue
        inner = group.node_tree.copy()
        flatten_groups(inner, depth + 1)
        mapping = {}
        for old in inner.nodes:
            if old.type in {'GROUP_INPUT', 'GROUP_OUTPUT'}:
                continue
            new = tree.nodes.new(old.bl_idname)
            mapping[old] = new
            for prop in old.bl_rna.properties:
                key = prop.identifier
                if prop.is_readonly or key in {'rna_type', 'name', 'location', 'parent', 'inputs', 'outputs', 'internal_links'}:
                    continue
                try:
                    setattr(new, key, getattr(old, key))
                except (AttributeError, TypeError, ValueError):
                    pass
            if old.type == 'VALTORGB':
                ramp = new.color_ramp
                while len(ramp.elements) > 1:
                    ramp.elements.remove(ramp.elements[-1])
                for index, element in enumerate(old.color_ramp.elements):
                    dest = ramp.elements[0] if index == 0 else ramp.elements.new(element.position)
                    dest.position, dest.color = element.position, element.color
                ramp.interpolation = old.color_ramp.interpolation
                ramp.color_mode = old.color_ramp.color_mode
                ramp.hue_interpolation = old.color_ramp.hue_interpolation
            if hasattr(old, 'mapping') and hasattr(new, 'mapping'):
                for src, dst in zip(old.mapping.curves, new.mapping.curves):
                    for i, p in enumerate(src.points):
                        q = dst.points[i] if i < len(dst.points) else dst.points.new(*p.location)
                        q.location, q.handle_type = p.location, p.handle_type
                new.mapping.update()
            for src, dst in zip(old.inputs, new.inputs):
                if hasattr(src, 'default_value'):
                    try:
                        dst.default_value = src.default_value
                    except (TypeError, ValueError):
                        pass
        def resolve(socket):
            if socket.node.type == 'GROUP_INPUT':
                source = group.inputs.get(socket.identifier) or group.inputs.get(socket.name)
                return linked(source), source
            node = mapping.get(socket.node)
            return (node.outputs[list(socket.node.outputs).index(socket)] if node else None), None
        for edge in inner.links:
            if edge.to_node in mapping:
                target = mapping[edge.to_node].inputs[list(edge.to_node.inputs).index(edge.to_socket)]
                source, default = resolve(edge.from_socket)
                if source:
                    tree.links.new(source, target)
                elif default:
                    copy_input(tree, default, target)
        output = next((n for n in inner.nodes if n.type == 'GROUP_OUTPUT' and n.is_active_output), None)
        if output:
            for src, exported in zip(output.inputs, group.outputs):
                for edge in list(exported.links):
                    if linked(src):
                        source, default = resolve(linked(src))
                        if source:
                            tree.links.new(source, edge.to_socket)
                        elif default:
                            copy_input(tree, default, edge.to_socket)
        tree.nodes.remove(group)
        bpy.data.node_groups.remove(inner)


def surface_leaves(socket, seen=None):
    if not socket:
        return []
    seen = set() if seen is None else seen
    node = socket.node
    if node in seen:
        return []
    seen.add(node)
    if node.type == 'REROUTE':
        return surface_leaves(linked(node.inputs[0]), seen)
    if node.type in {'MIX_SHADER', 'ADD_SHADER'}:
        return [leaf for inp in node.inputs if inp.type == 'SHADER' for leaf in surface_leaves(linked(inp), seen)]
    return [node]


def prepare_material(source, warn):
    material = source.copy()
    material.use_nodes = True
    tree = material.node_tree
    if not source.use_nodes:
        p = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p:
            p.inputs['Base Color'].default_value = source.diffuse_color
            p.inputs['Roughness'].default_value = source.roughness
            p.inputs['Metallic'].default_value = source.metallic
        return material
    flatten_groups(tree)
    output = next((n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if not output:
        return material
    leaves = surface_leaves(linked(output.inputs['Surface']))
    # Preserve directly exportable Principled/Emission instead of reducing them.
    if len(leaves) == 1 and leaves[0].type in {'BSDF_PRINCIPLED', 'EMISSION'}:
        return material
    diffuse = next((n for n in leaves if n.type in {'BSDF_DIFFUSE', 'BSDF_TRANSLUCENT'}), None)
    glossy = next((n for n in leaves if n.type in {'BSDF_GLOSSY', 'BSDF_ANISOTROPIC'}), None)
    glass = next((n for n in leaves if n.type in {'BSDF_GLASS', 'BSDF_REFRACTION'}), None)
    transparent = next((n for n in leaves if n.type == 'BSDF_TRANSPARENT'), None)
    principled = next((n for n in leaves if n.type == 'BSDF_PRINCIPLED'), None)
    base = diffuse or principled or glass or glossy
    if base is None:
        warn(source.name + '：材质着色方式未转换。')
        return material
    p = tree.nodes.new('ShaderNodeBsdfPrincipled')
    copy_input(tree, base.inputs.get('Base Color') or base.inputs.get('Color'), p.inputs['Base Color'])
    copy_input(tree, (glossy or base).inputs.get('Roughness'), p.inputs['Roughness'])
    copy_input(tree, base.inputs.get('Normal'), p.inputs['Normal'])
    if principled:
        for key in ['Metallic', 'Alpha', 'Transmission Weight', 'IOR', 'Coat Weight', 'Emission Color', 'Emission Strength']:
            copy_input(tree, principled.inputs.get(key), p.inputs.get(key))
    elif glossy and not diffuse and not glass:
        p.inputs['Metallic'].default_value = 1
    if glass:
        p.inputs['Transmission Weight'].default_value = 1
        copy_input(tree, glass.inputs.get('IOR'), p.inputs['IOR'])
    root = linked(output.inputs['Surface'])
    if transparent and root and root.node.type == 'MIX_SHADER':
        mix = root.node
        alpha = p.inputs['Alpha']
        if linked(mix.inputs[1]) and linked(mix.inputs[1]).node == transparent:
            copy_input(tree, mix.inputs[0], alpha)
        else:
            inv = tree.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'
            inv.inputs[0].default_value = 1
            copy_input(tree, mix.inputs[0], inv.inputs[1]); tree.links.new(inv.outputs[0], alpha)
    tree.links.new(p.outputs['BSDF'], output.inputs['Surface'])
    return material


def image_source(socket):
    """Find an existing image through color adjustments, never bake new textures."""
    queue = [linked(socket)]
    seen = set()
    while queue:
        source = queue.pop(0)
        if not source or source.node in seen:
            continue
        node = source.node
        seen.add(node)
        if node.type == 'TEX_IMAGE' and node.image:
            return source
        # Do not mistake coordinate/displacement textures for surface color.
        inputs = [i for i in node.inputs if i.type == 'RGBA' or socket.type != 'RGBA' and i.type == 'VALUE']
        inputs.sort(key=lambda i: i.type != 'RGBA')
        queue.extend(linked(i) for i in inputs if i.is_linked)
    return None


def image_tint(socket, image, seen=None):
    """Retain constant multiply tints without evaluating procedural textures."""
    white = (1, 1, 1, 1)
    source = linked(socket)
    if not source or source.node == image.node:
        return white
    seen = set() if seen is None else seen
    node = source.node
    if node in seen: return white
    seen.add(node)
    colors = [i for i in node.inputs if i.type == 'RGBA']
    if node.type in {'MIX_RGB', 'MIX'} and node.blend_type == 'MULTIPLY' and not node.inputs[0].is_linked and len(colors) == 2:
        for color, other in [(colors[0], colors[1]), (colors[1], colors[0])]:
            found = image_source(color)
            if found and found.node == image.node:
                tint = image_tint(color, image, seen)
                factor = approximate_value(other, white) if not image_source(other) else white
                if hasattr(factor, '__len__') and len(factor) == 4:
                    mix = node.inputs[0].default_value
                    return tuple(tint[i] * (1 - mix + mix * factor[i]) for i in range(4))
                return tint
    for child in node.inputs:
        if child.type != 'RGBA': continue
        found = image_source(child)
        if found and found.node == image.node:
            return image_tint(child, image, seen)
    return white


def approximate_value(socket, fallback, seen=None):
    source = linked(socket)
    if not source:
        return getattr(socket, 'default_value', fallback)
    seen = set() if seen is None else seen
    node = source.node
    if node in seen:
        return fallback
    seen.add(node)
    if node.type in {'RGB', 'VALUE'}:
        return source.default_value
    if node.type == 'REROUTE':
        return approximate_value(node.inputs[0], fallback, seen)
    if node.type == 'VALTORGB':
        return node.color_ramp.evaluate(.5)
    if node.type in {'TEX_CHECKER', 'TEX_BRICK'}:
        colors = [node.inputs.get(name) for name in ['Color1', 'Color2']]
        if all(colors):
            return tuple((a + b) / 2 for a, b in zip(colors[0].default_value, colors[1].default_value))
    if node.type == 'MATH':
        a, b = [approximate_value(i, .5, seen.copy()) for i in list(node.inputs)[:2]]
        if isinstance(a, (float, int)) and isinstance(b, (float, int)):
            if node.operation == 'SUBTRACT': return a - b
            if node.operation == 'MULTIPLY': return a * b
            if node.operation == 'ADD': return a + b
    return fallback


def simplify_surface(material):
    tree = material.node_tree
    output = next((n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    root = linked(output.inputs['Surface']) if output else None
    if not root or root.node.type not in {'BSDF_PRINCIPLED', 'EMISSION'}:
        return False
    p, simplified = root.node, False
    names = ['Base Color', 'Roughness', 'Metallic', 'Alpha', 'Emission Color', 'Emission Strength', 'Transmission Weight'] if p.type == 'BSDF_PRINCIPLED' else ['Color', 'Strength']
    for name in names:
        target = p.inputs.get(name)
        if not target or not target.is_linked:
            continue
        source = linked(target)
        if source.node.type in {'TEX_IMAGE', 'RGB', 'VALUE'}:
            continue
        image = image_source(target)
        if image:
            tint = image_tint(target, image) if target.type == 'RGBA' else (1, 1, 1, 1)
            if any(abs(value - 1) > .00001 for value in tint[:3]):
                multiply = tree.nodes.new('ShaderNodeMix'); multiply.data_type = 'RGBA'; multiply.blend_type = 'MULTIPLY'
                multiply.inputs[0].default_value = 1
                colors = [i for i in multiply.inputs if i.type == 'RGBA']
                colors[1].default_value = tuple(max(0, min(1, v)) for v in tint)
                tree.links.new(image, colors[0]); tree.links.new(next(o for o in multiply.outputs if o.type == 'RGBA'), target)
            else:
                tree.links.new(image, target)
        else:
            value = approximate_value(target, target.default_value)
            for edge in list(target.links): tree.links.remove(edge)
            try: target.default_value = value
            except (TypeError, ValueError): pass
        simplified = True
    normal = p.inputs.get('Normal')
    if normal and normal.is_linked:
        source = linked(normal)
        if source.node.type != 'NORMAL_MAP' or not image_source(source.node.inputs['Color']):
            for edge in list(normal.links): tree.links.remove(edge)
            simplified = True
    return simplified


class MaterialConverter:
    def __init__(self, scene, destination, warn):
        self.scene, self.destination, self.warn = scene, destination, warn
        self.materials, self.meshes = {}, {}
        self.converted = self.simplified = 0
        for image in bpy.data.images:
            if image.source == 'FILE' and not image.packed_file and image.filepath:
                file = bpy.path.abspath(image.filepath, library=image.library)
                if os.path.isfile(file): image.filepath = file
                else: warn('缺失贴图：' + image.name)

    def prepare(self, objects):
        for obj in objects:
            if obj.type != 'MESH' or not obj.data.polygons:
                continue
            originals = tuple(slot.material for slot in obj.material_slots)
            if not any(originals): continue
            key = (obj.data, originals)
            if key not in self.meshes:
                obj.data = obj.data.copy()
                for index, original in enumerate(originals):
                    if not original: continue
                    if original not in self.materials:
                        material = prepare_material(original, self.warn)
                        if simplify_surface(material):
                            self.simplified += 1
                            self.warn('复杂程序材质已简化为基础颜色和贴图。')
                        self.materials[original] = material
                        self.converted += 1
                    obj.material_slots[index].link = 'DATA'
                    obj.material_slots[index].material = self.materials[original]
                self.meshes[key] = obj.data
            else:
                obj.data = self.meshes[key]
                for slot in obj.material_slots: slot.link = 'DATA'
