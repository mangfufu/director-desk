import { BUILTIN_SKILL } from './skill.ts';

/** Keep renderer help and scene summaries on the same edition as the desktop MCP host. */
export async function connectDesktopSkill() {
    const bridge = window.directorDesktop;
    if (!bridge?.builtinSkill) return;
    const replace = (data: typeof BUILTIN_SKILL) => { Object.assign(BUILTIN_SKILL, data); };
    bridge.onBuiltinSkill?.(replace);
    const response = await bridge.builtinSkill();
    if (!response.ok || !response.data) throw Error(response.error || '无法读取官方技能');
    replace(response.data);
}
