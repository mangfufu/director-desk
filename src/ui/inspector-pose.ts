import type { AppContext } from '../app-context.ts';
import { assetJoints } from '../asset-catalog.ts';
import type { Entity, Joint } from '../model.ts';
import { samplePose } from '../timeline.ts';
import { jointAngles } from '../assets/joint-schema.ts';
import { isAnimalAsset } from '../asset-catalog.ts';
import { setJointAxis } from '../editor/joint-editing.ts';
import { assertProject } from '../model.ts';
import { assertLockedEntitiesUnchanged } from '../editor/invariants.ts';
import { button, options } from './common.ts';
import type { InspectorNavigation } from './inspector-navigation.ts';

export function createPoseInspector(ctx: AppContext, navigation: InspectorNavigation, refresh: () => void) {
    let group = 0, keyIndex = 0;
    let live: HTMLInputElement | undefined;
    const host = document.querySelector('#inspector-content')!;
    const finish = (cancel = false) => {
        if (!live) return; const input = live; live = undefined;
        try {
            if (cancel) throw Error('cancel');
            if (input.value === '' || !input.checkValidity()) throw Error('关节角度须为 -360 至 360 度'); assertLockedEntitiesUnchanged(ctx.history.pending!, ctx.project); assertProject(ctx.project);
            ctx.history.commit(ctx.project); ctx.changed(false);
        } catch (error) {
            ctx.project = ctx.history.rollback() ?? ctx.project; ctx.engine.project = ctx.project; ctx.engine.sample(ctx.time); ctx.renderPanels();
            if (!cancel) ctx.toast((error as Error).message, true);
        }
    };
    host.addEventListener('input', event => {
        const input = event.target as HTMLInputElement;
        if (!input.dataset.poseAxis || input.value === '' || !input.checkValidity() || ctx.busy || ctx.draft || ctx.current()?.locked) return;
        if (!live) { if (ctx.history.pending) return; ctx.playing = false; ctx.history.begin(ctx.project); live = input; }
        if (input !== live) return;
        setJointAxis(ctx.current()!, input.dataset.poseJoint as Joint, Number(input.dataset.poseAxis) - 1, Number(input.value), ctx.time, ctx.project.fps);
        ctx.engine.sample(ctx.time); ctx.engine.render();
    });
    host.addEventListener('change', event => {
        const input = event.target as HTMLInputElement;
        if (input.dataset.poseAxis) { event.stopImmediatePropagation(); if (input === live) finish(); return; }
        if (input.id === 'pose-joint-choice') { event.stopImmediatePropagation(); ctx.engine.selectJoint(input.value as Joint); refresh(); return; }
        if (input.id === 'pose-nodes-visible') { event.stopImmediatePropagation(); ctx.engine.jointNodesVisible = input.checked; if (!input.checked) ctx.engine.selectJoint(''); ctx.engine.render(); return; }
    }, true);
    host.addEventListener('focusout', event => { if (event.target === live) finish(); });
    host.addEventListener('keydown', event => { if (live && (event as KeyboardEvent).key === 'Escape') { event.stopPropagation(); finish(true); } });
    window.addEventListener('blur', () => finish());
    host.addEventListener('change', event => {
        const input = event.target as HTMLSelectElement;
        if (!['pose-group', 'pose-key-choice'].includes(input.id)) return;
        event.stopPropagation(); if (input.id === 'pose-group') group = Number(input.value); else keyIndex = Number(input.value); refresh();
    });
    return { render(e: Entity) {
        const joints = Object.entries(assetJoints(e.asset)), pageSize = e.locked || e.initialPose ? 3 : 4;
        const groups = Array.from({ length: Math.ceil(joints.length / pageSize) }, (_, index) => joints.slice(index * pageSize, index * pageSize + pageSize));
        group = Math.max(0, Math.min(groups.length - 1, group));
        const pose = samplePose(e, ctx.time);
        const animal = isAnimalAsset(e.asset), chosen = (ctx.engine.selectedJoint || 'head') as Joint;
        const angles = jointAngles(pose[chosen], chosen);
        const physical = ctx.project.physics?.enabled && e.physics?.enabled && e.physics.mode === 'dynamic' && ctx.time >= e.physics.start;
        const controls = (animal
            ? `<select id="pose-group" aria-label="选择关节分组">${options(groups.map((items, i) => [String(i), items.map(([, label]) => label).join(' · ')]), String(group))}</select><div class="pose-joints">${(groups[group] ?? []).map(([joint, label]) => `<label class="joint-field"><span>${label}</span><input type="range" data-joint="${joint}" min="${joint.includes('Knee') ? 0 : -160}" max="160" value="${pose[joint as Joint] ?? 0}"/><output>${Math.round(Number(pose[joint as Joint] ?? 0))}°</output></label>`).join('')}</div>`
            : `<label class="check"><input id="pose-nodes-visible" type="checkbox" ${ctx.engine.jointNodesVisible ? 'checked' : ''}/>关节节点</label><label class="field"><span>关节</span><select id="pose-joint-choice">${options(joints, chosen)}</select></label><div class="triple">${angles.map((angle, axis) => `<label class="field"><span>${'XYZ'[axis]} / °</span><input type="number" data-pose-joint="${chosen}" data-pose-axis="${axis + 1}" value="${Number(angle.toFixed(2))}" min="-360" max="360" step="1" ${physical ? 'disabled title="物理接管中"' : ''}/></label>`).join('')}</div>`)
            + `<div class="button-row">${button('pose-reset', '复位', '', 'subtle')}${button('pose-mirror', '左右镜像', '', 'subtle')}</div>`;
        keyIndex = Math.max(0, Math.min(e.poseKeys.length - 1, keyIndex));
        const keys = !e.poseKeys.length ? '<div class="empty-state">尚未记录姿态关键帧</div>' : `<label class="field"><span>姿态关键帧</span><select id="pose-key-choice">${options(e.poseKeys.map((k, i) => [String(i), `${i + 1} · ${k.time.toFixed(2)} 秒`]), String(keyIndex))}</select></label><div class="button-row">${button('seek-key', '跳到此帧', '', 'subtle', `data-index="${keyIndex}"`)}${button('delete-key', '删除此帧', 'trash', 'subtle', `data-index="${keyIndex}"`)}</div>`;
        return navigation.render(`${e.id}:pose`, [{ id: 'joints', label: '调整关节', html: controls }, { id: 'keys', label: '姿态关键帧', html: keys }]);
    } };
}
