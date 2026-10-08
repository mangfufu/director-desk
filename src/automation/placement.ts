import { Box3, Vector3 } from 'three';
import type { AppContext } from '../app-context.ts';
import { clone, clip } from '../model.ts';
import { shiftPath } from '../timeline.ts';
import { seatedPlacement } from '../editor/seat-placement.ts';
import { worldContactAnchors } from '../assets/contact-anchors.ts';
import { detachHandBinding } from '../animation/hand-binding.ts';
import { freezeCamera } from '../editor/camera-editing.ts';
import type { EditOperation } from './edits.ts';

export function placementOperation(ctx: AppContext, args: Record<string, unknown>): EditOperation {
    const original = ctx.project.entities.find(e => e.id === args.entityId);
    if (!original) throw Error('对象不存在');
    if (original.locked) throw Error('对象已锁定');
    const entity = clone(original), root = ctx.engine.models.get(entity.id);
    const time = args.time ?? ctx.time;
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > ctx.project.duration) throw Error('定位时间超出戏段');
    const previous = ctx.engine.time;
    try {
        ctx.engine.sample(time);
        if (args.action === 'freeze-camera') {
            if (!entity.camera) throw Error('请选择摄影机'); freezeCamera(ctx.engine, entity);
        } else {
            if (!root) throw Error('模型未准备好');
            if (args.action === 'detach-hand') {
                if (!entity.handBinding) throw Error('对象没有手持绑定'); detachHandBinding(entity, root);
            } else if (args.action === 'ground') {
                if (entity.handBinding || entity.structureLink || entity.camera || ['ground','road'].includes(entity.asset)) throw Error('此对象不能直接对齐地面');
                const bounds = new Box3().setFromObject(root); if (bounds.isEmpty()) throw Error('对象没有可测量边界');
                shiftPath(entity, new Vector3(0, -bounds.min.y, 0));
            } else if (args.action === 'seat') {
                if (entity.handBinding || entity.structureLink) throw Error('请先解除绑定');
                const target = ctx.project.entities.find(e => e.id === args.targetId), model = target && ctx.engine.models.get(target.id);
                if (!target || !model) throw Error('座位对象不存在');
                const anchor = worldContactAnchors(target, model).find(a => a.id === args.anchorId);
                if (!anchor) throw Error('座面接触点不存在，请查询 director_spatial');
                const placement = seatedPlacement(entity, anchor);
                entity.position = placement.position; entity.rotation[1] = placement.yaw;
                entity.face = 'fixed'; entity.faceTarget = ''; entity.path = null; entity.pose = {}; entity.poseKeys = [];
                entity.clips = [clip('sit', 0, ctx.project.duration)];
            } else throw Error('未知定位操作');
        }
        const patch = Object.fromEntries(Object.entries(entity).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key as keyof typeof original])));
        return { operation: 'update', id: entity.id, patch };
    } finally { ctx.engine.sample(previous); }
}
