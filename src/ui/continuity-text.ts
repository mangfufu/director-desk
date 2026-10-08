import { ACTIONS, type Action } from '../model.ts';
import type { continuitySummary } from '../scenes/continue-scene.ts';

/** Display the saved handoff to people; the structured MCP response stays unchanged. */
export function continuityText(summary: Awaited<ReturnType<typeof continuitySummary>>) {
    const origin = summary.origin;
    if (!origin) return '本场没有接拍记录。';
    const names = new Map(origin.objects.filter(o => o.entityId).map(o => [o.entityId, o.name]));
    const lines = [`接拍自：${origin.sceneName}`, `接拍时间：${origin.time.toFixed(2)} 秒`];
    if (origin.sourceStatus === 'changed') lines.push('前一场之后有过修改；以下为接拍时的记录。');
    if (origin.sourceStatus === 'deleted') lines.push('前一场已删除；以下为接拍时的记录。');
    if (origin.notes.length) {
        lines.push('', '剧情与表演');
        for (const note of origin.notes) {
            lines.push(`${note.start}—${note.end} 秒${names.has(note.actorId) ? ' · ' + names.get(note.actorId) : ''}${note.timing === 'continues-beyond-source' ? '（延续至本场）' : ''}`);
            if (note.story) lines.push(note.story);
            if (note.emotion) lines.push('情绪：' + note.emotion);
            if (note.action) lines.push('动作：' + note.action);
            if (note.dialogue) lines.push('台词：' + note.dialogue);
        }
    }
    lines.push('', '对象位置');
    for (const object of origin.objects) {
        const action = object.action && ACTIONS[object.action as Action];
        lines.push(`${object.name || '未命名对象'}${object.enabled ? '' : '（已隐藏）'}${action ? ' · ' + action : ''}`);
        lines.push(object.position.map((v, i) => `${'XYZ'[i]} ${v.toFixed(2)}`).join(' · ') + ' 米');
    }
    return lines.join('\n');
}
