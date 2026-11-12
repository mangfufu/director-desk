"""DirectorDesk adapter for the pinned FlowHMR-Windows inference pipeline.

No scene reconstruction. Original NPZ predictions are retained alongside the
editable motion result; scene placement is recorded separately as postprocessing.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import zipfile


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.tmp')
    pending.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    pending.replace(path)


def progress(message, value):
    print('DIRECTOR_PROGRESS ' + json.dumps({'message': message, 'progress': value}, ensure_ascii=False), flush=True)


def import_body(source, destination):
    import numpy as np
    source, destination = Path(source), Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pending = destination.with_suffix('.npz.part')
    def copy(stream, length):
        if length <= 0 or length > 1024 ** 3:
            raise ValueError('人体文件大小无效')
        with pending.open('wb') as output:
            shutil.copyfileobj(stream, output, 1024 * 1024)
    try:
        if source.suffix.lower() == '.npz':
            with source.open('rb') as stream:
                copy(stream, source.stat().st_size)
        elif zipfile.is_zipfile(source):
            with zipfile.ZipFile(source) as archive:
                candidates = [v for v in archive.infolist() if v.filename.replace('\\', '/').endswith('neutral/model.npz') and not v.is_dir()]
                if len(candidates) != 1:
                    raise ValueError('请选择 Extended SMPL+H 的 neutral/model.npz 或原始压缩包')
                with archive.open(candidates[0]) as stream:
                    copy(stream, candidates[0].file_size)
        else:
            with tarfile.open(source, 'r:*') as archive:
                candidates = [v for v in archive.getmembers() if v.name.replace('\\', '/').endswith('neutral/model.npz') and v.isfile()]
                if len(candidates) != 1:
                    raise ValueError('压缩包缺少 neutral/model.npz')
                with archive.extractfile(candidates[0]) as stream:
                    copy(stream, candidates[0].size)
        with zipfile.ZipFile(pending) as data_archive:
            if sum(item.file_size for item in data_archive.infolist()) > 1024 ** 3:
                raise ValueError('人体文件解压后过大')
        with np.load(pending, allow_pickle=False) as model:
            rest, parents, shapes = model['v_template'], model['kintree_table'], model['shapedirs']
            if rest.ndim != 2 or rest.shape[1] != 3 or parents.shape not in [(52,), (2, 52)] or shapes.ndim != 3 or shapes.shape[:2] != rest.shape or shapes.shape[2] != 16:
                raise ValueError('请选择包含 16 个体型参数的 Extended SMPL+H 人体文件')
            if model['J_regressor'].shape != (52, len(rest)) or model['weights'].shape != (len(rest), 52):
                raise ValueError('SMPL+H 骨架格式不匹配')
            hierarchy = parents[0] if parents.ndim == 2 else parents
            if any(not 0 <= int(parent) < i for i, parent in enumerate(hierarchy[1:], 1)):
                raise ValueError('SMPL+H 骨架层级无效')
            faces, posedirs = model['f'], model['posedirs']
            if posedirs.shape != (len(rest), 3, 459) or faces.ndim != 2 or faces.shape[1] != 3 or not np.issubdtype(faces.dtype, np.integer) or (faces < 0).any() or (faces >= len(rest)).any():
                raise ValueError('SMPL+H 人体网格无效')
            if not all(np.isfinite(model[key]).all() for key in ['v_template', 'shapedirs', 'posedirs', 'weights', 'J_regressor']):
                raise ValueError('人体文件包含无效数据')
        pending.replace(destination)
    finally:
        pending.unlink(missing_ok=True)


def motion_data(file, skeleton, start, ident):
    import numpy as np
    import torch
    from scipy.spatial.transform import Rotation
    with np.load(file, allow_pickle=False) as data:
        poses = np.asarray(data['poses'], np.float32).reshape(-1, 52, 3)
        trans = np.asarray(data['trans'], np.float32)
        shapes = torch.as_tensor(np.asarray(data['betas'], np.float32).reshape(1, -1), device=skeleton.device)
    if len(poses) < 2 or trans.shape != (len(poses), 3) or not np.isfinite(poses).all() or not np.isfinite(trans).all():
        raise ValueError('识别动作数据不完整')
    with torch.inference_mode():
        rest = skeleton.compute_j_shaped(shapes)[0].cpu().numpy()
    return dict(id=int(ident), start=start / 30, end=(start + len(poses)) / 30,
                parents=skeleton.parents.cpu().tolist(), rest=rest.tolist(), translations=trans.tolist(),
                rotations=Rotation.from_rotvec(poses.reshape(-1, 3)).as_quat().reshape(-1, 52, 4).tolist())


def fk(person):
    import numpy as np
    from scipy.spatial.transform import Rotation
    local = Rotation.from_quat(np.asarray(person['rotations']).reshape(-1, 4)).as_matrix().reshape(-1, 52, 3, 3)
    rest, trans = np.asarray(person['rest']), np.asarray(person['translations'])
    joints = np.zeros((len(local), 52, 3)); rotations = np.empty_like(local)
    for j, parent in enumerate(person['parents']):
        if parent < 0:
            joints[:, j] = rest[j] + trans
            rotations[:, j] = local[:, j]
        else:
            rotations[:, j] = rotations[:, parent] @ local[:, j]
            joints[:, j] = joints[:, parent] + (rotations[:, parent] @ (rest[j] - rest[parent])[:, None])[..., 0]
    return joints


def run(args):
    import cv2
    import numpy as np
    import torch
    from flowhmr.model_files import flowhmr_paths
    from flowhmr.pipeline.v2m_inference import V2MInferenceEngine, StageName
    from flowhmr.utils.runtime_video_processing import VideoProcessor, find_ffmpeg
    from preview import publish, source_image
    options = json.loads(Path(args.input).read_text(encoding='utf-8'))
    out = Path(args.output); work = out / 'flow-work'; work.mkdir(parents=True, exist_ok=True)
    def check():
        if (out / '.cancel').exists():
            raise RuntimeError('已取消')
    started = time.perf_counter()
    source = VideoProcessor.get_video_meta(options['path'])
    duration = source.total_frames / source.fps - options['start']
    if options['seconds']:
        duration = min(duration, options['seconds'])
    if not .1 <= duration <= 5000 / 30:
        raise ValueError('FlowHMR 每次支持 0.1–166 秒，请调整视频区间')
    progress('准备视频', 2)
    video = work / 'input.mp4'
    subprocess.run([find_ffmpeg(), '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(options['start']), '-i', options['path'], '-t', str(duration), '-an', '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '18', str(video)], check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    check(); duration = VideoProcessor.get_video_meta(str(video)).total_frames / 30
    if not .1 <= duration <= 5000 / 30:
        raise ValueError('视频区间帧数无效')
    progress('加载 FlowHMR', 5)
    ckpt, config = flowhmr_paths()
    engine = V2MInferenceEngine.build(str(ckpt), str(config), postprocess=False)
    progress('识别人物', 10); engine._activate_stage(StageName.DETECTION)
    tracking = engine.proc.detect_and_track(str(video))
    selected = sorted(range(len(tracking.tracks)), key=lambda i: (tracking.tracks[i].length, tracking.tracks[i].avg_area), reverse=True)
    selected = [i for i in selected if tracking.tracks[i].length >= 3]
    if not selected:
        raise ValueError('没有识别到连续人物，请选择人物清晰的视频')
    people, members, joint_cache = [], [], {}
    labels = {'detection': '跟踪人物', 'camera': '分析镜头运动', 'feature_extract': '提取人物姿态', 'sam_extract': '提取人物姿态', 'generation': '还原动作', 'preprocess': '准备视频'}
    stages = {'detection': 0, 'camera': 1, 'feature_extract': 2, 'sam_extract': 2, 'generation': 3}
    for index, track_index in enumerate(selected):
        check(); directory = work / ('person-' + str(index)); inp = directory / 'input'; inp.mkdir(parents=True, exist_ok=True)
        boxes, interval = VideoProcessor.track_bboxes(tracking, track_index)
        np.savez(inp / 'input_bbox.npz', bbox=boxes, start_end=interval)
        try:
            os.link(video, inp / 'input_30fps.mp4')
        except OSError:
            shutil.copyfile(video, inp / 'input_30fps.mp4')
        def report(stage, percent, desc):
            check(); name = stage.value if hasattr(stage, 'value') else str(stage)
            progress(f'{labels.get(name, "还原动作")} · {index+1}/{len(selected)}', 12 + 68 * (index + (stages.get(name, 0) + percent / 100) / 4) / len(selected))
        # None enables upstream VRAM planning and batch reduction after CUDA OOM.
        engine.process_video(str(video), str(directory), static_camera=options.get('cameraMode', 'moving') == 'fixed', vggt_frame_interval=10,
                             sam_chunk_size=None, progress_callback=report, cancel_check=check)
        prediction = inp / 'input_seed0_origin.npz'
        shutil.copyfile(prediction, out / f'flow-raw-{index}.npz')
        shutil.copyfile(prediction, directory / 'motion.npz')
        person = motion_data(prediction, engine.body_model, int(interval[0]), index)
        people.append(person); joints = fk(person); joint_cache[str(directory)] = joints
        members.append(({'id': str(index), 'selected_person': index, 'params': {'static_camera': options.get('cameraMode') == 'fixed'}}, directory))
        # Publish the real generated motion before optional shared-scene placement.
        cap = cv2.VideoCapture(str(video))
        try:
            for frame in range(0, len(joints), 6):
                check(); timecode = person['start'] + frame / 30
                cap.set(cv2.CAP_PROP_POS_MSEC, timecode * 1000); ok, image = cap.read()
                source_frame = None
                if ok:
                    image_path = work / 'preview.jpg'; cv2.imencode('.jpg', image)[1].tofile(image_path); source_frame = source_image(image_path)
                center = joints[frame, 0]; sequence = index * 5001 + frame + 1
                publish(out, {'sequence': sequence, 'frameIndex': round(timecode*30), 'frameCount': round(duration*30), 'time': timecode, 'source': source_frame,
                              'aspect': source.width/source.height, 'points': [], 'parents': person['parents'], 'actors': [{'id': index, 'joints': joints[frame].round(4).tolist()}],
                              'camera': {'position': [float(center[0]), 1.5, float(center[2])+6], 'target': center.tolist(), 'up': [0,1,0], 'fov': 45}})
        finally:
            cap.release()
    if people:
        progress('匹配人物与镜头', 82)
        from flowhmr.utils import runtime_group_scene as group_scene
        class Inspection:
            def load(self, directory):
                joints = joint_cache[str(directory)]; file = Path(directory) / 'joints.bin'; joints.astype('<f4').tofile(file)
                return file, {'frames': len(joints), 'ground': {'height_m': 0}}
        class SceneExtractor:
            def scene_keypoints(self, *values):
                engine._activate_stage(StageName.FEATURE_EXTRACT)
                return engine.sam_extractor.scene_keypoints(*values)
        import importlib.util
        spec = importlib.util.spec_from_file_location('director_flow_camera', Path(__file__).with_name('flow-camera.py'))
        camera_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(camera_module)
        placement, camera, raw_camera = camera_module.place_with_camera(
            group_scene, work / 'group', members, Inspection(), SceneExtractor(), engine.device,
            width=source.width, height=source.height, check=check,
            notify=lambda _: progress('匹配人物与镜头', 85), release_camera=engine._release_camera_cuda)
        np.savez_compressed(out / 'flow-camera-raw.npz', **raw_camera)
        with np.load(work / 'group/motion.npz', allow_pickle=False) as aligned:
            from scipy.spatial.transform import Rotation
            for person in people:
                suffix = str(person['id'] + 1)
                person['translations'] = aligned['trans_' + suffix].tolist()
                poses = aligned['poses_' + suffix]
                person['rotations'] = Rotation.from_rotvec(poses.reshape(-1, 3)).as_quat().reshape(-1, 52, 4).tolist()
        # Replace the inspection view with the aligned source camera and all visible actors.
        cap = cv2.VideoCapture(str(video))
        aligned_joints = [fk(person) for person in people]
        try:
            for index in range(0, len(camera['frames']), 6):
                check(); frame = camera['frames'][index]; timecode = frame['time']
                cap.set(cv2.CAP_PROP_POS_MSEC, timecode * 1000); ok, image = cap.read()
                source_frame = None
                if ok:
                    image_path = work / 'preview.jpg'; cv2.imencode('.jpg', image)[1].tofile(image_path); source_frame = source_image(image_path)
                actors = []
                for person, joints in zip(people, aligned_joints):
                    local = round((timecode-person['start'])*30)
                    if 0 <= local < len(joints):
                        actors.append({'id':person['id'], 'joints':joints[local].round(4).tolist()})
                view = dict(position=frame['position'], target=frame['target'], up=frame['up'],
                            fov=float(np.degrees(2*np.arctan(36/max(source.width/source.height,1)/(2*frame['focal'])))),
                            frameX=frame['frameX'], frameY=frame['frameY'])
                publish(out, {'sequence':len(people)*5001+index+1, 'frameIndex':round(timecode*30), 'frameCount':round(duration*30),
                              'time':timecode, 'source':source_frame, 'aspect':source.width/source.height, 'points':[],
                              'parents':people[0]['parents'], 'actors':actors, 'camera':view})
        finally:
            cap.release()
    check(); progress('生成人物动作', 92)
    write_json(out / 'flow-motion.json', {'version': 1, 'fps': 30, 'duration': duration, 'aspect': source.width/source.height, 'people': people, 'camera': camera,
                                        'inferenceSeconds': time.perf_counter()-started, 'placement': placement, 'manualIntervention': False})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'import-body', 'run']); parser.add_argument('--repo', required=True)
    parser.add_argument('--input'); parser.add_argument('--output'); args = parser.parse_args()
    sys.path.insert(0, str(Path(args.repo).resolve()))
    if os.name == 'nt':
        import multiprocessing
        child_python = Path(sys.executable).with_name('pythonw.exe')
        if child_python.is_file():
            multiprocessing.set_executable(str(child_python))
    if args.action != 'import-body':
        # Use the managed video executable, not an unrelated system override.
        os.environ.pop('IMAGEIO_FFMPEG_EXE', None)
        os.environ.pop('FFMPEG', None)
        import imageio_ffmpeg
        os.environ['FFMPEG'] = imageio_ffmpeg.get_ffmpeg_exe()
    if args.action == 'import-body':
        import_body(args.input, args.output)
    elif args.action == 'check':
        print('Checking compute components', flush=True)
        import torch
        import flowhmr.pipeline.v2m_inference
        print('Checking pose components', flush=True)
        import flowhmr.utils.runtime_sam_features
        from flowhmr.utils.runtime_video_processing import find_ffmpeg
        if not torch.cuda.is_available():
            raise RuntimeError('FlowHMR 需要 NVIDIA 显卡及兼容驱动')
        (torch.ones(1, device='cuda') + 1).cpu()
        subprocess.run([find_ffmpeg(), '-version'], check=True, stdout=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        print('FlowHMR runtime ready', flush=True)
    else:
        run(args)


if __name__ == '__main__':
    main()
