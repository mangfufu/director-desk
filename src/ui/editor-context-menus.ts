import type { AppContext } from '../app-context.ts';
import { clipRange } from '../clip-editing.ts';
import { clipSelected, selectedClips, setSelectedEntities } from '../editor/timeline-selection.ts';
import { clipFromBar, selectClip } from './clip-controls.ts';
import { createContextMenu, type ContextItem } from './context-menu.ts';
import { refreshTimelineSelection } from './timeline-selection-view.ts';
import { timelineTimeAt } from './timeline-zoom.ts';
import { $ } from './common.ts';

export function bindEditorContextMenus(ctx: AppContext) {
    const menu = createContextMenu(), timeline = $('#timeline-content');
    const ready = () => !ctx.busy && !ctx.draft && !ctx.history.pending && !$('#modal-root').children.length && ctx.engine.pickingEnabled;
    const command = (action: string, id?: string) => {
        const button = document.createElement('button'); if (id) button.dataset.id = id;
        void ctx.act(action, button).catch(error => ctx.toast(String(error instanceof Error ? error.message : error), true));
    };
    const item = (id: string, label: string, run: () => void, disabled = false): ContextItem => ({ id, label, run, disabled });
    const action = (id: string, label: string, disabled = false): ContextItem => item(id, label, () => command(id), disabled);
    const history = (): ContextItem[] => [action('undo', '撤销'), action('redo', '重做')];
    const show = (x: number, y: number, items: ContextItem[], origin: HTMLElement) => {
        const revision = ctx.revision;
        menu.open(x, y, items.map(entry => entry && ({ ...entry, run: () => {
            if (!ready()) return;
            if (ctx.revision !== revision) { ctx.toast('场景已更新，请重新选择'); return; }
            entry.run();
        } })), origin);
    };
    const selectObject = (id: string) => { setSelectedEntities([id]); ctx.selectEntity(id, true); refreshTimelineSelection(ctx); };
    const objects = (id: string): ContextItem[] => {
        const e = ctx.project.entities.find(value => value.id === id); if (!e) return [];
        selectObject(id);
        return [action('focus', '定位对象'), action('duplicate', '复制对象'),
            item('visibility', e.visible ? '隐藏对象' : '显示对象', () => command('visibility', id), e.locked),
            e.locked ? action('unlock-selected', '解除锁定') : null,
            null, action('position-key', '位置关键帧', e.locked), action('draw-path', '绘制路径', e.locked || !!e.handBinding),
            null, action('delete', '删除对象', e.locked), null, ...history()];
    };
    const seek = (time: number) => { ctx.playing = false; ctx.seek(time); };
    const timelineMenu = (x: number, y: number, target: HTMLElement, keyboard = false) => {
        if (!ready()) return;
        const bar = target.closest<HTMLElement>('[data-clip-id],[data-path-id],[data-cut]');
        const selection = bar ? clipFromBar(bar) : keyboard ? selectedClips().at(-1) : undefined;
        const time = keyboard ? ctx.time : Math.min(ctx.project.duration, Math.round(timelineTimeAt(x) * ctx.project.fps) / ctx.project.fps);
        if (selection) {
            ctx.playing = false; ctx.updateTimeUI();
            if (!clipSelected(selection)) selectClip(selection);
            refreshTimelineSelection(ctx);
            const group = selectedClips(), ranges = group.map(value => clipRange(ctx.project, value));
            const locked = group.some(value => value.kind !== 'cut' && ctx.project.entities.find(e => e.id === value.entityId)?.locked);
            const canSplit = !locked && ranges.some(range => ctx.time - range.start >= 1 / ctx.project.fps - 1e-8 && range.end - ctx.time >= 1 / ctx.project.fps - 1e-8);
            show(x, y, [
                item('split', '在播放头处分割', () => $('#timeline-split').click(), !canSplit),
                item('trim', '片段时长', () => $('#timeline-trim').click(), locked),
                item('clip-start', '跳到片段开头', () => seek(Math.min(...ranges.map(range => range.start)))),
                item('ask-ai', '交给 AI', () => $('#timeline-to-ai').click()), null,
                item('delete-clips', '删除片段', () => timeline.dispatchEvent(new Event('delete-selected-clips')), locked || group.some(value => value.kind === 'cut' && value.index === 0)),
                null, ...history(),
            ], timeline);
        } else {
            const id = target.closest<HTMLElement>('[data-track-key]')?.querySelector<HTMLElement>('[data-select]')?.dataset.select;
            const label = target.closest('.track-label');
            if (id && label) { show(x, y, objects(id), timeline); return; }
            const entries: ContextItem[] = [item('seek', '播放头移到此处', () => seek(time))];
            if (id && ctx.project.entities.find(e => e.id === id)?.kind === 'actor') entries.push(item('actions', '动作库', () => {
                selectObject(id); seek(time); document.querySelector<HTMLButtonElement>('[data-side="motions"]')?.click();
            }));
            show(x, y, [...entries, null, ...history()], timeline);
        }
    };
    timeline.addEventListener('contextmenu', event => {
        event.preventDefault(); timelineMenu(event.clientX, event.clientY, event.target as HTMLElement);
    });
    timeline.addEventListener('keydown', event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); const bounds = timeline.getBoundingClientRect();
        timelineMenu(bounds.left + 210, bounds.top + 35, event.target as HTMLElement, true);
    });

    const canvas = ctx.engine.editorRenderer.domElement, shot = ctx.engine.shotRenderer.domElement;
    const stageMenu = (x: number, y: number, keyboard = false) => {
        if (!ready()) return;
        const id = keyboard ? ctx.current()?.id : ctx.engine.entityAt(x, y);
        show(x, y, id ? objects(id) : [action('home', '回到全景'), action('top', '俯视'), null,
            action('add-camera', '添加摄影机'), action('new-from-view', '当前视角建机位'), action('lighting-open', '灯光与场景'), null, ...history()], canvas);
    };
    let press: { id: number; x: number; y: number; dragged: boolean } | undefined;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
        if (event.button === 2) press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    });
    window.addEventListener('pointermove', event => {
        if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press.dragged = true;
    }, true);
    window.addEventListener('pointerup', event => {
        if (!press || event.pointerId !== press.id || event.button !== 2) return;
        const click = press; press = undefined;
        if (!click.dragged && Math.hypot(event.clientX - click.x, event.clientY - click.y) <= 5) stageMenu(event.clientX, event.clientY);
    });
    window.addEventListener('pointercancel', () => { press = undefined; });
    window.addEventListener('blur', () => { press = undefined; });
    canvas.addEventListener('keydown', event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault(); const bounds = canvas.getBoundingClientRect(); stageMenu(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, true);
    });
    shot.addEventListener('contextmenu', event => {
        event.preventDefault(); if (!ready()) return;
        const id = ctx.engine.cameraEntity().id;
        show(event.clientX, event.clientY, [item('camera-properties', '摄影机属性', () => selectObject(id)),
            action('snapshot', '导出当前机位截图'), action('export', '导出视频')], shot);
    });
}
