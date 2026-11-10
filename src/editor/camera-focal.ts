import type { Entity } from '../model.ts';
import { numberAt, setNumberKey } from '../animation/channels.ts';

/** Inspector edits the active focal value without destroying an existing curve. */
export function editCameraFocal(camera: NonNullable<Entity['camera']>, time: number, value: number, fps: number) {
    if (!Number.isFinite(value) || value < 8 || value > 300) throw Error('焦距应在 8 到 300 mm 之间');
    if (camera.effects?.dollyZoom) throw Error('请先关闭希区柯克变焦，再调整焦距');
    const channel = camera.effects?.channels?.focal;
    if (typeof channel === 'object') {
        const frame = Math.round(time * fps) / fps;
        const existing = channel.keys.find(key => Math.abs(key.time - frame) < 1e-7);
        camera.effects!.channels!.focal = setNumberKey(channel, frame, value, camera.focal, existing?.easing ?? 'smooth');
    } else if (typeof channel === 'number') camera.effects!.channels!.focal = value;
    else camera.focal = value;
}

export function inspectorFocal(camera: NonNullable<Entity['camera']>, time: number, rendered?: number) {
    return camera.effects?.dollyZoom && rendered !== undefined ? rendered : numberAt(camera.effects?.channels?.focal, time, camera.focal);
}
