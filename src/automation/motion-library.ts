import { clone } from '../model.ts';
import { getUserMotion, removeUserMotion, saveUserMotion } from '../animation/user-motion-store.ts';
import { assertUserMotion } from '../animation/user-motion.ts';
import { assertRigBindings, rigStatus } from '../resources/rig-definition.ts';
import { assertAnimationBinding } from '../resources/native-animation.ts';
import { loadModelPackage } from '../resources/model-loader.ts';

export async function editMotionLibrary(args: Record<string, unknown>) {
    const asset = await getUserMotion(String(args.id));
    if (args.action === 'read') {
        const result = { motion: asset.motion, resource: { id: asset.resource.id, name: asset.resource.name } };
        if (!args.details) return result;
        const loaded = await loadModelPackage(asset.resource.package);
        try { return { ...result, model: loaded.inspection }; } finally { loaded.dispose(); }
    }
    if (args.action === 'remove') { await removeUserMotion(asset.motion.id); return { removed: asset.motion.id }; }
    if (args.action !== 'update') throw Error('未知动作库操作');
    const patch = args.patch as Record<string, unknown>;
    if (!patch || Object.keys(patch).some(k => !['name', 'duration', 'data'].includes(k))) throw Error('动作库 patch 仅支持 name、duration、data');
    const motion = { ...clone(asset.motion), ...clone(patch) };
    if (motion.data.resourceId !== asset.motion.data.resourceId || motion.data.index !== asset.motion.data.index) throw Error('来源动作不可替换，请重新导入');
    assertUserMotion(motion);
    const loaded = await loadModelPackage(asset.resource.package);
    try {
        assertRigBindings(motion.data.rig, motion.data.referencePose, loaded.inspection.bones);
        assertAnimationBinding(motion.data, loaded.inspection.animations, loaded.inspection.nodes);
        await saveUserMotion(motion, asset.resource);
    } finally { loaded.dispose(); }
    return { motion, rigStatus: rigStatus(motion.data.rig) };
}
