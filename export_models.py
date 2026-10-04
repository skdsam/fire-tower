"""Run through Blender MCP. Export real scene meshes without modifying the blend."""
import bpy, os, json, math
from mathutils import Vector
out=r'D:\scratch\fire watch\Website\dist\assets'
os.makedirs(out,exist_ok=True)
s=bpy.context.scene
selected=list(bpy.context.selected_objects);active=bpy.context.view_layer.objects.active
visible=[o for o in s.objects if o.type=='MESH' and not o.hide_render and not o.hide_get()]
tower=[o for o in visible if o.name.startswith(('Tower_','Interior_'))]
forest=[o for o in visible if o.name.startswith('Forest_Pine_') and o.location.length<65]
# Preserve matched trunk/canopy pairs and keep distant trees lighter.
environment=[o for o in visible if o.name.startswith(('Landscape_','Distant_'))]+forest
saved_slots={};temporary=[];mods=[]
try:
    for o in tower+environment:
        if o.data in saved_slots:continue
        saved_slots[o.data]=list(o.data.materials)
        for i,mat in enumerate(list(o.data.materials)):
            if not mat:continue
            name='Web_'+mat.name
            web=bpy.data.materials.get(name)
            if not web:
                web=bpy.data.materials.new(name);temporary.append(web);web.use_nodes=True
                p=web.node_tree.nodes.get('Principled BSDF');src=mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None
                if src:
                    for key in ['Base Color','Roughness','Metallic','IOR','Transmission Weight','Alpha']:
                        if key in src.inputs and key in p.inputs:p.inputs[key].default_value=src.inputs[key].default_value
                    ramp=next((n for n in mat.node_tree.nodes if n.type=='VALTORGB'),None)
                    if ramp:
                        a=ramp.color_ramp.elements[0].color;b=ramp.color_ramp.elements[-1].color
                        p.inputs['Base Color'].default_value=tuple((a[j]+b[j])/2 for j in range(4))
                if 'Glass' in mat.name:
                    p.inputs['Transmission Weight'].default_value=0;p.inputs['Base Color'].default_value=(.22,.37,.40,1);p.inputs['Metallic'].default_value=.2;p.inputs['Roughness'].default_value=.15;p.inputs['Alpha'].default_value=.28
                    web.surface_render_method='DITHERED'
            o.data.materials[i]=web
    for o in environment:
        if o.name=='Landscape_Alpine_Ridge':
            m=o.modifiers.new('Temporary web terrain reduction','DECIMATE');m.ratio=.25;mods.append((o,m))
    for filename,objects in [('tower.glb',tower),('landscape.glb',environment)]:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.export_scene.gltf(filepath=os.path.join(out,filename),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
    metadata={'source':'Firewatch_Improved.blend','towerObjects':len(tower),'landscapeObjects':len(environment),'towerHeight':19.4,'platformHeight':14.05,'assets':{f:os.path.getsize(os.path.join(out,f)) for f in ['tower.glb','landscape.glb']}}
    with open(os.path.join(out,'scene-info.json'),'w') as f:json.dump(metadata,f,indent=2)
    result=metadata
finally:
    for mesh,materials in saved_slots.items():
        mesh.materials.clear()
        for m in materials:mesh.materials.append(m)
    for o,m in mods:o.modifiers.remove(m)
    for m in temporary:
        if m.users==0:bpy.data.materials.remove(m)
    bpy.ops.object.select_all(action='DESELECT')
    for o in selected:o.select_set(True)
    bpy.context.view_layer.objects.active=active
