import importlib.util
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
root=Path(__file__).resolve().parents[1]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
from types import SimpleNamespace
# Known identity alignment isolates camera conversion from the upstream fit.
group=SimpleNamespace(_directions=lambda values:(values,None), _rotation=lambda a,b,w:np.eye(3), yaw_matrix=lambda yaw:np.eye(3))
adapter=module('camera',root/'desktop/video-reconstruction/flow-camera.py')
# Synthetic camera and moving joints with known coordinate translation and metric scale.
base=np.array([[-.2,1.5,0],[.2,1.5,0],[-.1,.9,0],[.1,.9,0],[-.1,.5,0],[.1,.5,0],[-.1,.1,0],[.1,.1,0]])
motion=np.stack([base,base+[.4,0,.2],base+[.8,0,.4]])
centers=np.array([[0,2,-5],[.1,2.2,-4.7],[.3,2.1,-4.3]])
rot=Rotation.from_euler('xyz',[[.1,0,.1],[.2,.1,.2],[.1,.2,.3]]).as_matrix()
rt=np.tile(np.eye(4),(3,1,1));rt[:,:3,:3]=rot;rt[:,:3,3]=-np.einsum('tij,tj->ti',rot,centers)
origin=np.array([1.2,-.7,2.1]);scale=2.
world=motion+origin-centers[:,None,:]*scale
observed=world@rot.transpose(0,2,1)
track=dict(world=world,motion=motion,observed=observed,yaw=0,offset=[0,0,0],samples=[(10+i,observed[i]) for i in range(3)])
k=np.tile([[800,0,320],[0,800,180],[0,0,1]],(3,1,1))
camera,raw=adapter.aligned_camera(group,[track],k,rt,10,640,360,scale)
np.testing.assert_allclose([f['position'] for f in camera['frames']],centers*scale-origin,atol=1e-6)
for i,f in enumerate(camera['frames']):
 np.testing.assert_allclose(np.array(f['target'])-f['position'],rot[i].T[:,2],atol=1e-6)
 np.testing.assert_allclose(f['up'],-rot[i].T[:,1],atol=1e-6)
 np.testing.assert_allclose((motion[i]-f['position'])@rot[i].T,observed[i],atol=1e-6)
assert camera['frames'][0]['time']==10/30
print('PASS synthetic shared-camera placement, metric scale, translation, orientation and source-camera projection')

# A fixed source camera must stay fixed even while the actor moves.
static_rt=np.tile(np.eye(4),(3,1,1))
static_track={**track,'world':motion+origin,'observed':motion+origin}
fixed,_=adapter.aligned_camera(group,[static_track],k,static_rt,10,640,360,0.)
np.testing.assert_allclose([f['position'] for f in fixed['frames']],np.tile(-origin,(3,1)),atol=1e-6)
print('PASS single-person fixed camera remains independent of actor motion')
