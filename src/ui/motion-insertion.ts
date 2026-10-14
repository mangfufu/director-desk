import type { AppContext } from '../app-context.ts';
import { applyOperations, applyOperationsWithResources } from '../automation/edits.ts';
import { motionPreset } from '../animation/motion-catalog.ts';
import { getUserMotion } from '../animation/user-motion-store.ts';
import { isUserMotion, type UserMotionAsset } from '../animation/user-motion.ts';
import { selectClip } from './clip-controls.ts';
import { refreshTimelineSelection } from './timeline-selection-view.ts';
import { planMotionInsertion } from '../editor/timeline-insertion.ts';

export async function addLibraryMotion(ctx: AppContext, asset: string, entityId: string, time: number, insert = false) {
    if (ctx.busy || ctx.draft || ctx.history.pending) return;
    const original = ctx.project, revision = ctx.revision, scene = ctx.scenes.context;
    const focused = document.activeElement;
    const play = document.querySelector<HTMLButtonElement>('[data-act="play"]');
    const playTitle = play?.getAttribute('title');
    if (play) { play.disabled = true; play.setAttribute('aria-busy', 'true'); play.title = '正在添加动作'; }
    ctx.busy = true; ctx.playing = false; ctx.updateTimeUI();
    try {
        const motions = new Map<string, UserMotionAsset>();
        if (isUserMotion(asset)) motions.set(asset, await getUserMotion(asset));
        const basic = !isUserMotion(asset) && !!motionPreset(asset).basicAction;
        const operations = [{ operation: 'motion', id: entityId, asset, time }];
        // Basic actions need no new source resources. Commit synchronously instead
        // of entering the asynchronous model preparation queue for the whole scene.
        const after = basic ? applyOperations(original, operations) : await applyOperationsWithResources(original, operations, motions);
        const previous = new Set(original.entities.find(e => e.id === entityId)!.clips.map(c => c.id));
        const added = after.entities.find(e => e.id === entityId)!.clips.find(c => !previous.has(c.id))!;
        if(insert){
            const target=after.entities.find(e=>e.id===entityId)!;
            const plan=planMotionInsertion(target.clips.filter(c=>c.id!==added.id),time,added.end-added.start,after.fps);
            Object.assign(added,{start:plan.start,end:plan.end});
            target.clips=[...plan.clips,added].sort((a,b)=>a.start-b.start);
            after.duration=Math.max(original.duration,...target.clips.map(c=>c.end));
        }
        if (!basic) await ctx.engine.externalModels.prepare(after);
        if (ctx.project !== original || ctx.revision !== revision || ctx.scenes.context.revision !== scene.revision || ctx.draft || ctx.history.pending) throw Error('工程已变化，请重新添加动作');
        ctx.busy = false;
        // Built-in procedural actions are sampled from the existing rig; neither
        // their geometry nor material-animation bindings change. Physics and
        // imported targets retain the normal reconstruction path.
        const reuseRig = basic && !original.entities.find(e => e.id === entityId)!.external && !original.physics?.enabled;
        if (ctx.change(() => { ctx.project = after; ctx.selected = entityId; }, !reuseRig)) {
            selectClip({ kind: 'action', entityId, id: added.id });
            refreshTimelineSelection(ctx);
            if (document.activeElement === focused || document.activeElement === document.body)
                document.querySelector<HTMLElement>('#timeline-content')?.focus({ preventScroll: true });
        }
    } catch (error) { ctx.toast(error instanceof Error ? error.message : '动作添加失败', true); }
    finally {
        ctx.busy = false;
        ctx.engine.externalModels.retain([ctx.project, ...ctx.history.undoStack, ...ctx.history.redoStack]);
        if (play) {
            play.disabled = false; play.removeAttribute('aria-busy');
            if (playTitle === null || playTitle === undefined) play.removeAttribute('title'); else play.setAttribute('title', playTitle);
        }
        ctx.updateTimeUI();
    }
}
