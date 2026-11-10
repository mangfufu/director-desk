"""Network output -> editable scene interchange, keeping measured and fitted data distinct."""
import pathlib, json, argparse, importlib.util, os, numpy as np
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation
ROOT=pathlib.Path(os.environ['DIRECTOR_RECON_ROOT'])
spec=importlib.util.spec_from_file_location('rig',pathlib.Path(__file__).with_name('gltf-rig.py'));rig=importlib.util.module_from_spec(spec);spec.loader.exec_module(rig)
parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--scene',choices=['none','planes','mesh'],default='planes');args=parser.parse_args()
out=pathlib.Path(args.input);meta=json.loads((out/'analysis.json').read_text());frames=[np.load(out/f['file']) for f in meta['frames']]
G=np.diag([1.,-1.,-1.]);rng=np.random.default_rng(17)
def world(points,frame):return (points@frame['c2w'][:3,:3].T+frame['c2w'][:3,3])@G.T

# First-view static evidence only; avoids leaving moving-person trails in scenery.
first=frames[0];pts=first['pts3d_in_self_view'][0];h,w,_=pts.shape
valid=np.isfinite(pts).all(-1)&(first['conf_self'][0]>2)&(pts[...,2]>.1)&(pts[...,2]<35)
if 'msk' in first:
    import cv2
    mask=np.squeeze(first['msk'])
    if mask.shape != (h,w):
        side=mask.shape[0]
        target_h=round(side*h/max(h,w));target_w=round(side*w/max(h,w))
        y=(side-target_h)//2;x=(side-target_w)//2
        mask=cv2.resize(mask[y:y+target_h,x:x+target_w],(w,h))
    valid &= cv2.dilate((mask>.35).astype('uint8'),np.ones((11,11),np.uint8))==0
else:
    # Exclude projected body regions using recovered head locations and depth.
    for head in first.get('smpl_transl',np.empty((1,0,3)))[0]:
        f=float(first['focal']);u=f*head[0]/head[2]+w/2;v=f*head[1]/head[2]+h/2
        yy,xx=np.mgrid[:h,:w];radius=f*.45/head[2]
        valid &= ~((np.abs(xx-u)<radius)&(yy>v-radius*.5)&(yy<v+radius*4))
grid=world(pts,first);sample=grid[::3,::3][valid[::3,::3]]
remaining=sample.copy();planes=[]
for index in range(10):
    if len(remaining)<150:break
    best=np.zeros(len(remaining),dtype=bool);normal=None
    for _ in range(160):
        a,b,c=remaining[rng.choice(len(remaining),3,replace=False)];n=np.cross(b-a,c-a);length=np.linalg.norm(n)
        if length<1e-7:continue
        n/=length;inliers=np.abs((remaining-a)@n)<.055
        if inliers.sum()>best.sum():best=inliers;normal=n
    if best.sum()<150:break
    cloud=remaining[best];remaining=remaining[~best];center=np.median(cloud,axis=0)
    _,_,axes=np.linalg.svd(cloud-center,full_matrices=False);u,v=axes[:2]
    uv=(cloud-center)@np.stack([u,v],axis=1)
    # Trim distant outliers before making the planar polygon.
    keep=((uv>=np.quantile(uv,.015,axis=0))&(uv<=np.quantile(uv,.985,axis=0))).all(1);uv=uv[keep]
    if len(uv)<4:continue
    hull=ConvexHull(uv);poly=uv[hull.vertices];vertices=poly@np.stack([u,v]);
    area=float(hull.volume)
    if area<.15:continue
    planes.append({'center':center,'normal':axes[2],'vertices':vertices,'area':area,'points':len(cloud)})

floor_candidates=[p for p in planes if abs(p['normal'][1])>.8]
floor=min(floor_candidates,key=lambda p:p['center'][1])['center'][1] if floor_candidates else float(np.quantile(sample[:,1],.03)) if len(sample) else 0.
shift=np.array([0.,-floor,0.])
objects=[]
for i,p in enumerate(planes if args.scene=='planes' else []):
    g=rig.GLB();vertices=p['vertices'];idx=[]
    # SceneModels anchors imported props at the AABB bottom centre.
    anchor=(vertices.min(0)+vertices.max(0))/2;anchor[1]=vertices[:,1].min()
    vertices=vertices-anchor
    for j in range(1,len(vertices)-1):idx.extend([0,j,j+1])
    pos=g.array(vertices,'VEC3',bounds=True);norm=g.array(np.tile(p['normal'],(len(vertices),1)),'VEC3');indices=g.array(idx,'SCALAR',5123)
    g.doc.update(nodes=[{'mesh':0}],scenes=[{'nodes':[0]}],scene=0,meshes=[{'primitives':[{'attributes':{'POSITION':pos,'NORMAL':norm},'indices':indices,'material':0}]}],materials=[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.45,.45,.45,1],'metallicFactor':0,'roughnessFactor':1}}])
    name=f'surface-{i:02d}.glb';g.save(out/name)
    horizontal=abs(p['normal'][1])>.8
    objects.append({'id':f'surface-{i}','name':('水平表面' if horizontal else '场景表面')+f' {i+1}','file':name,'position':(p['center']+shift+anchor).tolist(),'kind':'prop'})

if args.scene=='mesh':
    import cv2
    occupied=set()
    for i in range(0,len(frames),int(meta['analysisFps'])):
        print(f'Scene {i//int(meta["analysisFps"])+1}/{len(range(0,len(frames),int(meta["analysisFps"])))}',flush=True)
        frame=frames[i];points=frame['pts3d_in_self_view'][0];hh,ww,_=points.shape
        valid=np.isfinite(points).all(-1)&(frame['conf_self'][0]>2)&(points[...,2]>.1)&(points[...,2]<35)
        mask=np.squeeze(frame['msk'])
        if mask.shape!=(hh,ww):
            side=mask.shape[0];th=round(side*hh/max(hh,ww));tw=round(side*ww/max(hh,ww));y=(side-th)//2;x=(side-tw)//2
            mask=cv2.resize(mask[y:y+th,x:x+tw],(ww,hh))
        valid &= cv2.dilate((mask>.25).astype('uint8'),np.ones((15,15),np.uint8))==0
        step=5;sample=world(points,frame)+shift;vertices=[];indices=[];normals=[];frame_voxels=set()
        for y in range(0,hh-step,step):
            for x in range(0,ww-step,step):
                ys=[y,y+step,y+step,y];xs=[x,x,x+step,x+step]
                if not valid[ys,xs].all():continue
                quad=sample[ys,xs];edges=np.linalg.norm(np.roll(quad,-1,axis=0)-quad,axis=1)
                if edges.max()>.30:continue
                center=quad.mean(0);voxel=tuple(np.floor(center/.08).astype(int))
                if voxel in occupied:continue
                normal=np.cross(quad[1]-quad[0],quad[2]-quad[0]);length=np.linalg.norm(normal)
                if length<1e-8:continue
                frame_voxels.add(voxel);base=len(vertices);vertices.extend(quad);normals.extend([normal/length]*4);indices.extend([base,base+1,base+2,base,base+2,base+3])
        occupied.update(frame_voxels)
        if not vertices:continue
        vertices=np.array(vertices);center=(vertices.min(0)+vertices.max(0))/2;center[1]=vertices[:,1].min()
        g=rig.GLB();pos=g.array(vertices-center,'VEC3',bounds=True);norm=g.array(normals,'VEC3');idx=g.array(indices,'SCALAR',5125)
        g.doc.update(nodes=[{'mesh':0}],scenes=[{'nodes':[0]}],scene=0,meshes=[{'primitives':[{'attributes':{'POSITION':pos,'NORMAL':norm},'indices':idx,'material':0}]}],materials=[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.45,.45,.45,1],'metallicFactor':0,'roughnessFactor':1}}])
        name=f'environment-{i:03d}.glb';g.save(out/name)
        objects.append({'id':f'environment-{i}','name':f'环境区块 {i//int(meta["analysisFps"])+1}','file':name,'position':center.tolist(),'kind':'prop'})

cameras=[];people={}
for i,frame in enumerate(frames):
    t=meta['frames'][i]['time'];c=frame['c2w'];pos=G@c[:3,3]+shift;forward=G@c[:3,2];up=-G@c[:3,1]
    right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);base_up=np.cross(right,forward)
    roll=np.degrees(np.arctan2(-up@right,up@base_up))
    # A 4:3 output is used for this example. Adjust focal to its vertical field.
    aspect=meta.get('aspect','4:3');aw,ah=map(float,aspect.split(':'))
    focal=float(frame['focal'])*(36/max(aw/ah,1))/h
    cameras.append({'time':t,'position':pos.tolist(),'target':(pos+forward*5).tolist(),'focal':focal,'roll':float(roll)})
    ids=frame.get('smpl_id',np.empty((1,0)))[0]
    for j,person_id in enumerate(ids):
        rot=frame['smpl_rotmat'][0,j,:22].copy();rot[0]=G@c[:3,:3]@rot[0]
        head=world(frame['smpl_transl'][0,j],frame)+shift
        joints,_=rig.fk(rot);root=head-joints[15]
        person=people.setdefault(int(person_id),{'times':[],'rotations':[],'positions':[]})
        person['times'].append(t);person['rotations'].append(rot);person['positions'].append(root.tolist())

for person_id,p in people.items():
    if len(p['times'])<2:continue
    name=f'person-{person_id}.glb';times=np.array(p['times']);rot=np.array(p['rotations'])
    # Animation is sampled relative to its clip start; root travel remains editable.
    duration=meta['duration'];end=min(duration,times[-1]+1/meta['analysisFps'])
    visible=[];start=float(times[0]);previous=float(times[0])
    for t in times[1:]:
        if t-previous>1.5/meta['analysisFps']:
            visible.append({'start':start,'end':min(duration,previous+1/meta['analysisFps'])})
            start=float(t)
        previous=float(t)
    visible.append({'start':start,'end':end})
    anim_times=np.r_[times-times[0],end-times[0]];rot=np.concatenate([rot,rot[-1:]])
    rig.write_rig(out/name,anim_times,rot)
    paths=[]
    for j in range(22):
        path='0/0/0'
        for child in rig.ancestors(j)[1:]:
            parent=rig.PARENTS[child];siblings=[k for k,pid in enumerate(rig.PARENTS) if pid==parent];path+='/'+str(siblings.index(child))
        paths.append(path)
    objects.append({'id':f'person-{person_id}','name':f'人物 {person_id+1}','file':name,'kind':'actor',
        'position':p['positions'][0],'path':{'smooth':False,'points':[{'time':t,'position':pos} for t,pos in zip(p['times'],p['positions'])]},
        'start':float(times[0]),'end':end,'visibility':visible,'rig':{'version':1,'family':'humanoid','bones':dict(zip(rig.NAMES,paths))}})
result={'duration':meta['duration'],'fps':24,'aspect':meta.get('aspect','4:3'),'cameras':cameras,'objects':objects,'floorOffset':float(-floor),
    'evidence':{'people':len(people),'surfaces':len([o for o in objects if o['kind']=='prop']),'backgroundPoints':0 if args.scene=='none' else len(occupied) if args.scene=='mesh' else len(sample),'surfaceType':'none' if args.scene=='none' else 'multi-frame masked depth meshes' if args.scene=='mesh' else 'first-frame RANSAC planes',
    'bodyType':'original approximate humanoid proportions driven by recovered joint rotations','semanticObjectSegmentation':False}}
(out/'scene.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result['evidence'],indent=2),flush=True)
