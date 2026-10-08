import type { AppContext } from '../app-context.ts';
import { sceneResourceReport } from '../resources/render-statistics.ts';
import { $, button } from './common.ts';

export function createResourceStatisticsPanel(ctx: AppContext) {
    function render() {
        const report = sceneResourceReport(ctx.engine), { scene, sources, lastRender } = report;
        const mib = (bytes: number) => (bytes / 1048576).toFixed(2) + ' MiB';
        const row = (name: string, value: string | number) => `<div class="resource-row"><span>${name}</span><strong>${typeof value === 'number' ? value.toLocaleString() : value}</strong></div>`;
        ctx.showModal('场景资源统计', `<div class="resource-panel"><label class="field">查看统计<select id="statistics-page"><option value="scene">场景资源</option><option value="render">最近绘制</option></select></label>
            <div id="statistics-scene">${row('模型文件', `${sources.count} 项 · ${mib(sources.bytes)}`)}${row('网格对象 / 实例', `${scene.meshes} / ${scene.instances}`)}${row('独立几何体', scene.uniqueGeometries)}${row('几何内存 / CPU', mib(scene.geometryBufferBytes))}${row('材质 / 纹理', `${scene.materials} / ${scene.textures}`)}${row('纹理像素', `${(scene.baseLevelTexels / 1000000).toFixed(2)} 百万`)}<p class="panel-help">${scene.unknownTextureSizes ? `另有 ${scene.unknownTextureSizes} 项纹理尺寸未知。` : ''}</p></div>
            <div id="statistics-render" hidden>${row('布景 / 机位绘制调用', `${lastRender.editor.drawCalls} / ${lastRender.camera.drawCalls}`)}${row('布景 / 机位三角面', `${lastRender.editor.triangles.toLocaleString()} / ${lastRender.camera.triangles.toLocaleString()}`)}${row('布景 / 机位几何体', `${lastRender.editor.geometries} / ${lastRender.camera.geometries}`)}${row('布景 / 机位纹理', `${lastRender.editor.textures} / ${lastRender.camera.textures}`)}</div></div>`, button('resource-statistics-refresh', '刷新', '', 'subtle') + button('resource-open', '模型资源', '', 'subtle') + button('close-modal', '关闭', '', 'primary'), true);
        $('#statistics-page').onchange = () => { const scene = $('#statistics-page').value === 'scene'; $('#statistics-scene').hidden = !scene; $('#statistics-render').hidden = scene; };
    }
    return { handle(action: string) {
        if (action !== 'resource-statistics' && action !== 'resource-statistics-refresh') return false;
        ctx.playing = false; render(); return true;
    } };
}
