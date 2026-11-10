"""Small, transient preview of actual network output; never edits predictions."""
import base64, importlib.util, json, math, os, pathlib, time
import cv2
import numpy as np

HISTORY_LIMIT=120
_history=[]
_history_time=-1.


def write_json(target,value):
    text=json.dumps(value,separators=(',',':'),allow_nan=False)
    temp=target.with_suffix('.tmp');temp.write_text(text,encoding='utf-8')
    for attempt in range(4):
        try: os.replace(temp,target); return
        except PermissionError:
            if attempt==3: raise
            time.sleep(.01)

def source_image(file):
    image=cv2.imdecode(np.fromfile(file,dtype=np.uint8),cv2.IMREAD_COLOR)
    if image is None: return None
    h,w=image.shape[:2]
    image=cv2.resize(image,(max(1,round(w*min(1,480/w))),max(1,round(h*min(1,480/w)))))
    ok,encoded=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,75])
    return 'data:image/jpeg;base64,'+base64.b64encode(encoded).decode() if ok else None

def publish(out,value):
    global _history_time
    out=pathlib.Path(out)
    # At most 120 lightweight frames; keep a whole-clip overview by thinning
    # old samples instead of retaining hundreds of raw inference arrays.
    if value.get('camera') and (value['time']-_history_time>=.5 or value['frameIndex']==value['frameCount']-1):
        folder=out/'previews';folder.mkdir(exist_ok=True)
        write_json(folder/f"{value['sequence']}.json",value)
        _history.append({'sequence':value['sequence'],'time':value['time']});_history_time=value['time']
        if len(_history)>HISTORY_LIMIT:
            for item in _history[1:-1:2]: (folder/f"{item['sequence']}.json").unlink(missing_ok=True)
            _history[:]=_history[:-1:2]+[_history[-1]]
        write_json(out/'previews.json',_history)
    write_json(out/'preview.json',value)

def prediction(out,pred,file,index,count,seconds,camera_decoder,focal_estimator,include_scene=True):
    import torch
    spec=importlib.util.spec_from_file_location('preview_rig',pathlib.Path(__file__).with_name('gltf-rig.py'))
    rig=importlib.util.module_from_spec(spec);spec.loader.exec_module(rig)
    def array(key): return pred[key].detach().cpu().numpy()[0]
    c2w=camera_decoder(pred['camera_pose'].clone()).cpu().numpy()[0]
    axis=np.diag([1.,-1.,-1.])
    def world(points): return (points@c2w[:3,:3].T+c2w[:3,3])@axis.T
    points=array('pts3d_in_self_view'); h,w=points.shape[:2]
    stride=max(1,math.ceil(math.sqrt(h*w/1800)))
    sample=points[::stride,::stride].reshape(-1,3)
    valid=np.isfinite(sample).all(axis=1)&(sample[:,2]>.1)&(sample[:,2]<35)
    if 'conf_self' in pred:
        conf=array('conf_self').reshape(h,w)[::stride,::stride].reshape(-1)
        valid&=conf>2
    cloud=world(sample[valid]) if include_scene else np.empty((0,3))
    actors=[]
    if 'smpl_rotmat' in pred and 'smpl_transl' in pred:
        rotations=array('smpl_rotmat'); translations=array('smpl_transl')
        ids=array('smpl_id').reshape(-1) if 'smpl_id' in pred else np.arange(len(rotations))
        for ident,rot,head in zip(ids,rotations,translations):
            rot=rot[:22].copy();rot[0]=axis@c2w[:3,:3]@rot[0]
            joints,_=rig.fk(rot);joints+=world(head)-joints[15]
            if np.isfinite(joints).all(): actors.append({'id':int(ident),'joints':joints.round(4).tolist()})
    pp=torch.tensor([[w/2,h/2]],dtype=pred['pts3d_in_self_view'].dtype)
    focal=float(focal_estimator(pred['pts3d_in_self_view'].cpu(),pp,focal_mode='weiszfeld')[0])
    eye=axis@c2w[:3,3];target=eye+axis@c2w[:3,2];up=-axis@c2w[:3,1]
    publish(out,{'sequence':index+1,'frameIndex':index,'frameCount':count,'time':float(seconds),
        'source':source_image(file),'aspect':w/h,'points':cloud.round(4).reshape(-1).tolist(),'actors':actors,'parents':rig.PARENTS,
        'camera':{'position':eye.tolist(),'target':target.tolist(),'up':up.tolist(),'fov':math.degrees(2*math.atan(h/(2*focal)))}})
