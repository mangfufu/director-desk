"""Convert the shared reconstruction camera into the aligned motion coordinate frame."""
import numpy as np


def aligned_camera(group, tracks, intrinsics, extrinsics, first, width, height, scale):
    # The upstream placement fits this same shared orientation against the first actor.
    a, weights = group._directions(tracks[0]['world'])
    b, _ = group._directions(tracks[0]['motion'])
    shared = group._rotation(a, b, weights)
    rotation = np.asarray(extrinsics)[:, :3, :3]
    centers = np.einsum('tji,tj->ti', rotation, -np.asarray(extrinsics)[:, :3, 3]) @ shared.T * scale
    offsets = []
    for track in tracks:
        indices = np.array([frame for frame, _ in track['samples']]) - first
        observed = track['world'] @ shared.T
        motion = track['motion'] @ group.yaw_matrix(track['yaw']).T + np.asarray(track['offset'])
        # A single translation for the whole shot: never follow the moving subject.
        offsets.append((observed + centers[indices, None, :] - motion).reshape(-1, 3))
    origin = np.median(np.concatenate(offsets), axis=0)
    centers -= origin
    orientation = shared @ rotation.transpose(0, 2, 1)
    forward, up = orientation[:, :, 2], -orientation[:, :, 1]
    frames = []
    for index, (position, direction, vertical, k) in enumerate(zip(centers, forward, up, intrinsics)):
        frames.append(dict(time=(first+index)/30, position=position.tolist(),
                           target=(position+direction).tolist(), up=vertical.tolist(),
                           focal=float(k[1, 1]/height * 36/max(width/height, 1)),
                           frameX=float(2*k[0, 2]/width-1), frameY=float(1-2*k[1, 2]/height)))
    if not frames or not all(np.isfinite(np.asarray([f['position'], f['target'], f['up']])).all()
                             and np.isfinite([f['focal'], f['frameX'], f['frameY']]).all() for f in frames):
        raise ValueError('相机识别结果无效')
    return dict(fps=30, frames=frames, source='FlowHMR/VGGT+SAM alignment'), dict(
        K=intrinsics, camera_RT=extrinsics, shared_rotation=shared, origin=origin,
        camera_scale=np.asarray(scale), first_frame=np.asarray(first), image_size_hw=np.array([height, width]))


def place_with_camera(group, destination, members, inspection, extractor, device, *, width, height, check, notify, release_camera):
    """Retain the camera and alignment observations already used by upstream placement."""
    original_camera, original_align = group._shared_camera, group.align_tracks
    captured = {}
    def shared_camera(*args):
        with release_camera():
            k, rt, mode = original_camera(*args)
        captured.update(k=k, rt=rt, first=args[3][0])
        return k, rt, mode
    def align(tracks):
        scale = original_align(tracks)
        captured['camera'], captured['raw'] = aligned_camera(group, tracks, captured['k'], captured['rt'], captured['first'], width, height, scale)
        return scale
    group._shared_camera, group.align_tracks = shared_camera, align
    try:
        placement = group.build_group_scene(destination, members, inspection, extractor, device, check=check, notify=notify)
    finally:
        group._shared_camera, group.align_tracks = original_camera, original_align
    return placement, captured['camera'], captured['raw']
