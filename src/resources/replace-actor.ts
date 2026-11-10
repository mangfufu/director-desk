import { findAsset, isAnimalAsset } from '../asset-catalog.ts';
import { clone, type Project } from '../model.ts';
import { rigStatus } from './rig-definition.ts';

export interface ReplaceActorOptions { height?: number }

/** Change the body, not the actor's identity or clocks. Native motion keeps its original source resource. */
export function replaceActor(project: Project, id: string, asset: string, options: ReplaceActorOptions = {}) {
    const actor = project.entities.find(e => e.id === id);
    if (!actor || actor.kind !== 'actor' || isAnimalAsset(actor.asset)) throw Error('请选择人形人物');
    if (actor.locked) throw Error('对象已锁定，请先解锁');
    const target = findAsset(asset);
    if (!target || target.kind !== 'actor' || !['human', 'human-legacy'].includes(target.capabilities?.rig ?? '')) throw Error('请选择内置人形模型');
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => k !== 'height')) throw Error('更换人物只接受 height 身高参数');
    if (options.height !== undefined && (!Number.isFinite(options.height) || options.height < .2 || options.height > 10)) throw Error('身高应在 0.2 到 10 米之间');
    if (actor.asset === asset) { if (options.height !== undefined) actor.height = options.height; return; }
    if (actor.initialPose) throw Error('请先清除本场继承姿态，再更换人物外形');
    const source = actor.external;
    const clips = actor.clips.map(clip => {
        if (clip.action !== 'native') return clip;
        if (!source || !rigStatus(source.rig).complete) throw Error('请先完成来源人物的骨骼映射，再保留动作更换外形');
        const { native, ...rest } = clip;
        return { ...rest, action: 'retarget' as const, retarget: {
            resourceId: source.resourceId, index: native!.index, loop: native!.loop,
            unitScale: source.unitScale, orientation: clone(source.orientation), rig: clone(source.rig!),
            ...(source.defaultPose ? { referencePose: clone(source.defaultPose) } : {}),
            ...(native!.motion ? { motion: clone(native!.motion) } : {}),
        } };
    });
    actor.clips = clips;
    actor.asset = asset;
    actor.gender = target.defaults?.gender ?? actor.gender;
    if (options.height !== undefined) actor.height = options.height;
    delete actor.external;
    delete actor.assetParameters;
    delete actor.parameters;
}
