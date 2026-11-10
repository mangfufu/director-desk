import { demoProject, entity } from '../model.ts';
import { motionPreset } from './motion-catalog.ts';
import { insertBuiltinMotion } from './motion-presets.ts';
import { isUserMotion, type UserMotion } from './user-motion.ts';
import { getUserMotion } from './user-motion-store.ts';
import { loadModelPackage } from '../resources/model-loader.ts';
import type { LoadedModel } from '../resources/model-runtime.ts';
import type { ModelResource } from '../resources/project-resources.ts';
import { rigStatus } from '../resources/rig-definition.ts';
import { ActionPreview } from './action-preview.ts';
import { MotionPreview } from './motion-preview.ts';

/** One live renderer, with the built-in source shared only for this library visit. */
export class LibraryPreview {
    private token = 0;
    private release?: () => void;
    private builtin?: Promise<LoadedModel>;
    clear() { this.token++; this.release?.(); this.release = undefined; }
    async show(host: HTMLElement, id: string) {
        this.clear(); const token = this.token;
        let owned: LoadedModel | undefined;
        try {
            if (!isUserMotion(id)) {
                const preset = motionPreset(id);
                if (preset.basicAction) {
                    const preview = new ActionPreview(host); preview.set(preset.basicAction);
                    this.release = () => preview.dispose(); return;
                }
            }
            let model: LoadedModel, motion: UserMotion;
            if (isUserMotion(id)) {
                const asset = await getUserMotion(id);
                if (token !== this.token) return;
                owned = model = await loadModelPackage(asset.resource.package); motion = asset.motion;
            } else {
                const { default: packaged } = await import('./library/humanoid-v1.ts');
                const resource = packaged as ModelResource;
                if (token !== this.token) return;
                this.builtin ??= loadModelPackage(resource.package).catch(error => { this.builtin = undefined; throw error; });
                model = await this.builtin;
                const project = demoProject(), target = entity('actor', 'human-adult', '预览');
                project.entities = [target]; project.resources = [resource];
                insertBuiltinMotion(project, target.id, id, 0);
                const clip = target.clips[0];
                motion = { id, name: motionPreset(id).name, duration: clip.end, data: clip.retarget! };
            }
            if (token !== this.token || !host.isConnected) { owned?.dispose(); return; }
            const preview = new MotionPreview(host, model, motion, rigStatus(motion.data.rig).complete ? 'human' : 'source', undefined, 30);
            this.release = () => { preview.dispose(); owned?.dispose(); };
        } catch (error) { owned?.dispose(); if (token === this.token) throw error; }
    }
    dispose() {
        this.clear(); const model = this.builtin; this.builtin = undefined;
        void model?.then(value => value.dispose(), () => {});
    }
}
