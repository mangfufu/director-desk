"""Research-only raw Human3R inference; no SMPL body assets or viewer required.

Uses the released network predictions unchanged. Mean initialization comes from
the checkpoint's own registered buffers. Body shape evaluation is deliberately
left out: the downstream adapter uses an explicitly approximate mannequin rig.
"""
import argparse, pathlib, os, sys, json, time, gc
process_started=time.monotonic()
ROOT = pathlib.Path(os.environ['DIRECTOR_RECON_ROOT'])
REPOS = pathlib.Path(os.environ['DIRECTOR_RECON_REPOS'])
REPO = REPOS/'Human3R'
for key, sub in {'HF_HOME':'huggingface','TORCH_HOME':'torch','XDG_CACHE_HOME':'xdg','TMPDIR':'tmp','MPLCONFIGDIR':'matplotlib','CUDA_CACHE_PATH':'cuda'}.items():
    os.environ[key] = str(ROOT/'cache'/sub)
    pathlib.Path(os.environ[key]).mkdir(parents=True, exist_ok=True)
os.chdir(REPO)
sys.path[:0] = [str(REPO), str(REPO/'src')]

# The upstream utils package eagerly imports its Gaussian viewer. Headless
# inference never uses it; removing this import avoids gsplat/CUDA compilation.
p = REPO/'src/dust3r/utils/__init__.py'
original = p.read_text()
line = 'from .render import render_meshes, vis_heatmap, OPENCV_TO_OPENGL_CAMERA_CONVENTION'
if line in original:
    p.write_text(original.replace(line, '# Headless prototype: viewer import omitted.'))

import numpy as np
import torch
import cv2
# Use the locally downloaded architecture; its weights are in Human3R's checkpoint.
original_hub_load = torch.hub.load
def local_hub_load(repo_or_dir, model, *a, **kw):
    if repo_or_dir == 'facebookresearch/dinov2':
        repo_or_dir = str(REPOS/'dinov2')
        kw['source'] = 'local'
    return original_hub_load(repo_or_dir, model, *a, **kw)
torch.hub.load = local_hub_load
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--seconds', type=float, default=4)
parser.add_argument('--start', type=float, default=0)
parser.add_argument('--fps', type=float, default=6)
parser.add_argument('--output', required=True)
parser.add_argument('--scene', choices=['none','planes','mesh'], default='planes')
args = parser.parse_args()
out = pathlib.Path(args.output); out.mkdir(parents=True,exist_ok=True)
frames_dir = out/'frames'; frames_dir.mkdir(exist_ok=True)
cap = cv2.VideoCapture(args.input)
source_fps = cap.get(cv2.CAP_PROP_FPS)
source_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
if not cap.isOpened() or source_fps<=0 or source_count<=0: raise ValueError('视频无法读取')
if args.start<0 or args.start>=source_count/source_fps or args.fps<=0 or args.seconds<0: raise ValueError('视频时间范围或采样帧率无效')
source_ratio=cap.get(cv2.CAP_PROP_FRAME_WIDTH)/cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
aspects={'9:16':9/16,'16:9':16/9,'21:9':21/9,'3:4':3/4,'4:3':4/3,'1:1':1}
aspect=min(aspects,key=lambda k:abs(np.log(aspects[k]/source_ratio)))
duration = min(args.seconds or float('inf'), source_count/source_fps-args.start)
times = np.arange(0, duration, 1/args.fps)
if len(times)<2 or source_count-round(args.start*source_fps)<2:
    cap.release()
    raise ValueError('视频区间太短，请扩大范围后重试')
paths=[]
for i,t in enumerate(times):
    cap.set(cv2.CAP_PROP_POS_FRAMES, min(source_count-1,round((t+args.start)*source_fps)))
    ok, frame = cap.read()
    if not ok: raise RuntimeError(f'Video decode failed at {t}')
    path=frames_dir/f'{i:05d}.jpg'; encoded_ok,encoded=cv2.imencode('.jpg',frame)
    if not encoded_ok: raise RuntimeError('视频帧无法解码')
    encoded.tofile(path); paths.append(str(path))
cap.release()
from preview import source_image, publish, prediction
publish(out,{'sequence':0,'frameIndex':0,'frameCount':len(paths),'time':0,'source':source_image(paths[0])})
checkpoint = ROOT/'models/human3r_672S.pth'
torch.set_num_threads(4)
torch.backends.cuda.matmul.allow_tf32 = True
torch.cuda.reset_peak_memory_stats()
started = time.monotonic()
print('Reading checkpoint initialization buffers', flush=True)
ckpt = torch.load(checkpoint, map_location='cpu', mmap=True, weights_only=False)
state = ckpt['model']
prefix = next(k[:-len('init_body_pose')] for k in state if k.endswith('init_body_pose'))
np.savez(REPO/'src/models/smpl_mean_params.npz',
    pose=state[prefix+'init_body_pose'].numpy().reshape(-1)[:144],
    shape=state[prefix+'init_betas'].numpy().reshape(-1)[:10],
    cam=state[prefix+'init_cam'].numpy().reshape(-1))
del state, ckpt; gc.collect()
from demo import prepare_input
from src.dust3r.model import ARCroco3DStereo
from src.dust3r.inference import inference_recurrent_lighter
from src.dust3r.utils.camera import pose_encoding_to_camera
from src.dust3r.post_process import estimate_focal_knowing_depth

# The upstream table-based fallback cannot index negative pose-token positions.
# Evaluate the same signed-angle formula as curope/kernels.cu directly instead.
from models.pos_embed import RoPE2D
def signed_rope(self,tokens,positions):
    d=tokens.shape[-1]//2
    inv=1.0/(self.base**(torch.arange(0,d,2,device=tokens.device,dtype=torch.float32)/d))
    parts=[]
    for axis,part in enumerate(tokens.chunk(2,dim=-1)):
        angle=positions[...,axis,None].float()*inv
        angle=torch.cat((angle,angle),dim=-1)[:,None]
        cos=angle.cos().to(tokens.dtype);sin=angle.sin().to(tokens.dtype)
        a,b=part.chunk(2,dim=-1)
        parts.append(part*cos+torch.cat((-b,a),dim=-1)*sin)
    return torch.cat(parts,dim=-1)
RoPE2D.forward=signed_rope

print(f'Loading model, {len(paths)} frames, {duration:.2f}s',flush=True)
model=ARCroco3DStereo.from_pretrained(str(checkpoint)).cuda().eval()
views=prepare_input(paths,[True]*len(paths),512,img_res=model.mhmr_img_res,reset_interval=100000)
import src.dust3r.model as model_module
original_to_cpu=model_module.to_cpu
processed=0
last_preview=0
preview_warning=False
def progress_cpu(value):
    global processed, last_preview, preview_warning
    result=original_to_cpu(value)
    if isinstance(result,dict) and 'camera_pose' in result:
        processed+=1
        if time.monotonic()-last_preview>.2 or processed==len(views):
            try:
                prediction(out,result,paths[processed-1],processed-1,len(views),times[processed-1],pose_encoding_to_camera,estimate_focal_knowing_depth,include_scene=args.scene!='none')
                last_preview=time.monotonic()
            except Exception as error:
                if not preview_warning: print(f'Preview unavailable: {error}',flush=True);preview_warning=True
        print(f'Frame {processed}/{len(views)}, GPU allocated {torch.cuda.memory_allocated()/1024**3:.2f} GiB',flush=True)
    return result
model_module.to_cpu=progress_cpu
infer_start=time.monotonic()
with torch.inference_mode():
    outputs,_=inference_recurrent_lighter(views,model,'cuda',use_ttt3r=False)
torch.cuda.synchronize()
infer_seconds=time.monotonic()-infer_start
print('STAGE 整理识别结果',flush=True)
result_started=time.monotonic()
peak=torch.cuda.max_memory_allocated()/1024**3
reserved=torch.cuda.max_memory_reserved()/1024**3
del model; torch.cuda.empty_cache()
frames=[]
for i,pred in enumerate(outputs['pred']):
    # The scene adapter consumes dense geometry only at these sampled frames.
    # Camera and actor tracks still retain every analyzed frame unchanged.
    keys=['smpl_id','smpl_rotmat','smpl_transl']
    # Keep the first depth frame for identical ground alignment in all modes.
    if i==0 or (args.scene=='mesh' and i%max(1,int(args.fps))==0):keys+=['pts3d_in_self_view','conf_self','msk']
    arr={k:pred[k].detach().cpu().numpy() for k in keys if k in pred}
    c2w=pose_encoding_to_camera(pred['camera_pose'].clone()).cpu().numpy()[0]
    points=pred['pts3d_in_self_view'].cpu()
    _,h,w,_=points.shape
    pp=torch.tensor([[w/2,h/2]],dtype=points.dtype)
    focal=float(estimate_focal_knowing_depth(points,pp,focal_mode='weiszfeld')[0])
    arr.update(c2w=c2w,focal=np.asarray(focal),time=np.asarray(times[i]))
    np.savez(out/f'frame-{i:05d}.npz',**arr)
    frames.append({'time':float(times[i]),'file':f'frame-{i:05d}.npz',
        'people':len(arr.get('smpl_id',np.empty((1,0)))[0]),'focalPixels':focal,'size':[w,h]})
    print(f'Result {i+1}/{len(outputs["pred"])}',flush=True)
report={'sourceName':pathlib.Path(args.input).name,'duration':duration,'sourceFps':source_fps,
        'sourceStart':args.start,'sourceAspect':source_ratio,'aspect':aspect,
        'analysisFps':args.fps,'scene':args.scene,'frames':frames,'inferenceSeconds':infer_seconds,
        'peakAllocatedGiB':peak,'peakReservedGiB':reserved,'totalSeconds':time.monotonic()-started,
        'resultSeconds':time.monotonic()-result_started,
        'processSeconds':time.monotonic()-process_started,
        'model':'Human3R-672S','bodySurfaceEvaluated':False,
        'note':'Raw network outputs; body-to-mannequin proportions are approximated separately.'}
(out/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='frames'},ensure_ascii=False,indent=2),flush=True)
