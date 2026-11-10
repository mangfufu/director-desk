import type { Engine } from '../engine.ts';
import type { Entity, Project, Vec3 } from '../model.ts';
import { Euler, Quaternion, type PerspectiveCamera } from 'three';
import { freezeEndingCamera } from '../cinematography/continuity.ts';

/** Freeze the evaluated camera pose before removing its target or binding. */
export function freezeCamera(engine: Engine, entity: Entity) {
    if (!entity.camera) return;
    const camera = engine.getShotCamera(entity.id);
    freezeEvaluatedCamera(entity, camera, engine.time);
}

export function freezeEvaluatedCamera(entity: Entity, camera: PerspectiveCamera, time: number) {
    if (!entity.camera) return;
    entity.position = camera.position.toArray() as Vec3;
    entity.rotation = [camera.rotation.x, camera.rotation.y, camera.rotation.z];
    entity.path = null;
    entity.camera.mode = 'free';
    entity.camera.aim = 'manual';
    freezeEndingCamera(entity, camera, time);
}

export function setCameraMode(project: Project, entity: Entity, mode: string, camera: PerspectiveCamera, time: number) {
    const c = entity.camera!;
    if (!['free', 'follow', 'pov'].includes(mode)) throw Error('未知机位方式');
    if (mode === c.mode) return;
    if (mode === 'free') { freezeEvaluatedCamera(entity, camera, time); return; }
    if (!c.targetId) c.targetId = project.entities.find(e => e.kind === 'actor')?.id ?? project.entities.find(e => e.kind !== 'camera')?.id ?? '';
    if (!c.targetId) throw Error('先添加人物或道具，再设置跟随／POV');
    c.mode = mode as typeof c.mode;
    c.offset = mode === 'pov' ? [0, 1.67, .13] : [0, 1.5, -2];
}

export function setCameraTarget(project: Project, entity: Entity, targetId: string, camera: PerspectiveCamera, time: number) {
    if (targetId && !project.entities.some(e => e.id === targetId && e.kind !== 'camera')) throw Error('目标对象不存在');
    if (!targetId && entity.camera!.mode !== 'free') freezeEvaluatedCamera(entity, camera, time);
    entity.camera!.targetId = targetId;
}

export function setCameraAim(entity: Entity, aim: string, camera: PerspectiveCamera) {
    if (!['manual', 'target'].includes(aim)) throw Error('未知机位朝向');
    if (aim === 'manual') {
        const base = camera.userData.directorBasePose;
        const r = base ? new Euler().setFromQuaternion(new Quaternion().fromArray(base.quaternion)) : camera.rotation;
        entity.rotation = [r.x, r.y, r.z];
    }
    entity.camera!.aim = aim as 'manual' | 'target';
}
