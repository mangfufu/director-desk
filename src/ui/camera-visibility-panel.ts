import type { AppContext } from '../app-context.ts';
import { $, button, options } from './common.ts';

export function createCameraVisibilityPanel(ctx: AppContext) {
    let cameraId = '', selected = '';
    function render() {
        const camera = ctx.project.entities.find(e => e.id === cameraId); if (!camera?.camera) return;
        const hidden = camera.camera.hiddenEntityIds ?? [], entities = ctx.project.entities.filter(e => e.kind !== 'camera');
        if (!entities.some(e => e.id === selected)) selected = entities[0]?.id ?? '';
        if (!ctx.showModal('本机位隐藏对象', `<label class="field"><span>选择对象</span><select id="camera-hidden-choice">${options(entities.map(e => [e.id, `${hidden.includes(e.id) ? '已隐藏 · ' : ''}${e.name}`]), selected)}</select></label><p class="panel-help">该机位隐藏 ${hidden.length} 个对象。</p>`, button('camera-hidden-toggle', '切换所选对象显示', '', 'primary', camera.locked || !entities.length ? 'disabled' : '') + button('close-modal', '关闭', '', 'subtle'))) return;
    }
    return { handle(action: string) {
        if (action === 'camera-hidden-open') { cameraId = ctx.current()?.id ?? ''; render(); }
        else if (action === 'camera-hidden-toggle') {
            const e = ctx.project.entities.find(e => e.id === cameraId); if (!e?.camera || e.locked) return true;
            selected = $('#camera-hidden-choice').value;
            if (ctx.change(() => { const hidden = e.camera!.hiddenEntityIds ?? []; e.camera!.hiddenEntityIds = hidden.includes(selected) ? hidden.filter(id => id !== selected) : [...hidden, selected]; }, false)) render();
        } else return false;
        return true;
    } };
}
