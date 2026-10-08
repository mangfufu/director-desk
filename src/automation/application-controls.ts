import type { SkillRequest } from './desktop-types.ts';
export async function controlApplication(args: Record<string, unknown>) {
    const desktop = window.directorDesktop;
    if (!desktop) throw Error('此功能需要桌面版');
    const data = args.data as Record<string, unknown> | undefined;
    if (args.scope === 'skills') {
        if (!desktop.skills) throw Error('当前桌面版不支持技能管理');
        const allowed = ['id', 'path', 'url', 'enabled'];
        if (data && Object.keys(data).some(k => !allowed.includes(k))) throw Error('技能参数无效');
        if (!['list','read','enable','remove','import','github','reload'].includes(String(args.action))) throw Error('未知技能操作');
        if (args.action === 'import' && typeof data?.path !== 'string') throw Error('技能导入需要 path，不使用文件选择框');
        const result = await desktop.skills({ ...data, action: args.action } as SkillRequest);
        if (!result.ok) throw Error(result.error); return result.data;
    }
    if (args.scope === 'updates') {
        if (!['state','save','check','download','page'].includes(String(args.action))) throw Error('未知更新操作');
        const result = await desktop.update(args.action as 'state'|'save'|'check'|'download'|'page', data);
        if (!result.ok) throw Error(result.error); return result.data;
    }
    throw Error('未知桌面功能');
}
