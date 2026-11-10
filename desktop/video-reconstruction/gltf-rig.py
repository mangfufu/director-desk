"""Original low-poly humanoid, no third-party SMPL body meshes.
SMPL body-joint order is used only to interpret the network's rotations.
"""
import numpy as np, json, struct
from scipy.spatial.transform import Rotation
NAMES=['hips','leftUpperLeg','rightUpperLeg','spine','leftLowerLeg','rightLowerLeg','chest','leftFoot','rightFoot','upperChest','leftToes','rightToes','neck','leftShoulder','rightShoulder','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand']
PARENTS=[-1,0,0,0,1,2,3,4,5,6,7,8,9,9,9,12,13,14,16,17,18,19]
OFFSETS=np.array([[0,.94,0],[.095,-.02,0],[-.095,-.02,0],[0,.12,0],[0,-.43,0],[0,-.43,0],[0,.14,0],[0,-.43,0],[0,-.43,0],[0,.14,0],[0,-.02,.13],[0,-.02,.13],[0,.11,0],[.08,.04,0],[-.08,.04,0],[0,.1,0],[.105,0,0],[-.105,0,0],[.27,0,0],[-.27,0,0],[.24,0,0],[-.24,0,0]],dtype=float)
def fk(rotations):
    positions=[]; worlds=[]
    for j,parent in enumerate(PARENTS):
        positions.append(OFFSETS[j].copy() if parent<0 else positions[parent]+worlds[parent]@OFFSETS[j])
        worlds.append(rotations[j] if parent<0 else worlds[parent]@rotations[j])
    return np.array(positions),np.array(worlds)

class GLB:
    def __init__(self):
        self.data=bytearray(); self.doc={'asset':{'version':'2.0','generator':'Director video reconstruction prototype'},'buffers':[],'bufferViews':[],'accessors':[]}
    def array(self,values,typ,component=5126, bounds=False):
        arr=np.asarray(values,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);
        while len(self.data)%4:self.data.append(0)
        offset=len(self.data);raw=arr.tobytes();self.data.extend(raw)
        view=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)})
        acc={'bufferView':view,'componentType':component,'count':len(arr),'type':typ}
        if bounds:acc.update(min=arr.min(axis=0).reshape(-1).astype(float).tolist(),max=arr.max(axis=0).reshape(-1).astype(float).tolist())
        self.doc['accessors'].append(acc);return len(self.doc['accessors'])-1
    def save(self,path):
        self.doc['buffers']=[{'byteLength':len(self.data)}]
        raw=json.dumps(self.doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
        data=bytes(self.data);data+=b'\x00'*((-len(data))%4)
        path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(raw)+len(data))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(data),0x004e4942)+data)

def write_rig(path,times,rotations):
    g=GLB(); rest,_=fk(np.tile(np.eye(3),(22,1,1)))
    nodes=[{'name':'ReconstructedRig','children':[1,23]}]
    for j,name in enumerate(NAMES):
        node={'name':name,'translation':OFFSETS[j].tolist()}
        children=[k+1 for k,p in enumerate(PARENTS) if p==j]
        if children:node['children']=children
        nodes.append(node)
    vertices=[];normals=[];joints=[];indices=[]
    # Each rigid anatomical section has its own skin weight. No smoothing across
    # joints: this is a deliberately simple, editable white mannequin.
    def box(center,size,j):
        center=np.asarray(center); size=np.asarray(size)/2
        faces=[([1,0,0],[(1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)]),([-1,0,0],[(-1,-1,1),(-1,1,1),(-1,1,-1),(-1,-1,-1)]),([0,1,0],[(-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)]),([0,-1,0],[(-1,-1,1),(-1,-1,-1),(1,-1,-1),(1,-1,1)]),([0,0,1],[(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]),([0,0,-1],[(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)])]
        for n,corners in faces:
            base=len(vertices)
            for p in corners:vertices.append(center+np.array(p)*size);normals.append(n);joints.append([j,0,0,0])
            indices.extend([base,base+1,base+2,base,base+2,base+3])
    box(rest[0]+[0,.015,0],[.27,.16,.18],0)
    for j in [3,6,9]:box(rest[j]+[0,.05,0],[.30 if j<9 else .34,.15,.18],j)
    box(rest[15]+[0,.045,0],[.15,.22,.17],15)
    for j,child,width in [(1,4,.13),(2,5,.13),(4,7,.10),(5,8,.10),(16,18,.085),(17,19,.085),(18,20,.065),(19,21,.065)]:
        delta=rest[child]-rest[j];size=np.maximum(np.abs(delta),[width,width,width]);box((rest[j]+rest[child])/2,size,j)
    for j in [7,8]:box(rest[j]+[0,-.02,.065],[.10,.07,.23],j)
    for j in [20,21]:box(rest[j],[.10,.065,.04],j)
    weights=np.zeros((len(vertices),4));weights[:,0]=1
    pos=g.array(vertices,'VEC3',bounds=True);normal=g.array(normals,'VEC3');joint=g.array(joints,'VEC4',5123);weight=g.array(weights,'VEC4');idx=g.array(indices,'SCALAR',5125)
    inverse=np.tile(np.eye(4),(22,1,1));inverse[:,:3,3]=-rest
    bind=g.array(inverse.transpose(0,2,1).reshape(-1,16),'MAT4')
    g.doc.update(nodes=nodes+[{'name':'WhiteMannequin','mesh':0,'skin':0}],scenes=[{'nodes':[0]}],scene=0,
        skins=[{'joints':list(range(1,23)),'skeleton':1,'inverseBindMatrices':bind}],
        meshes=[{'primitives':[{'attributes':{'POSITION':pos,'NORMAL':normal,'JOINTS_0':joint,'WEIGHTS_0':weight},'indices':idx,'material':0}]}],
        materials=[{'name':'White','pbrMetallicRoughness':{'baseColorFactor':[.72,.75,.78,1],'metallicFactor':0,'roughnessFactor':.9}}])
    inp=g.array(times,'SCALAR',bounds=True);samplers=[];channels=[]
    for j in range(22):
        q=Rotation.from_matrix(rotations[:,j]).as_quat()
        for k in range(1,len(q)):
            if q[k]@q[k-1]<0:q[k]*=-1
        output=g.array(q,'VEC4');samplers.append({'input':inp,'output':output,'interpolation':'LINEAR'});channels.append({'sampler':j,'target':{'node':j+1,'path':'rotation'}})
    g.doc['animations']=[{'name':'Recovered body motion','samplers':samplers,'channels':channels}]
    g.save(path)
    return ['/'.join(['ReconstructedRig']+[NAMES[k] for k in ancestors(j)]) for j in range(22)]

def ancestors(j):
    return ([] if PARENTS[j]<0 else ancestors(PARENTS[j]))+[j]
