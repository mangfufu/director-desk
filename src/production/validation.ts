import type { ProductionData } from '../model.ts';

export const productionValueGuide = 'notes replaces the complete production object: {fixedPrompt:"",sceneReferenceIds:[],notes:[{id:"note-1",start:0,end:3,actorId:"existing-actor-id",story:"Plot",emotion:"Emotion",dialogue:"Speech",action:"Behavior"}]}. Optional promptText is the reference-video prompt; textOnlyPrompt is the independent text-only prompt (each string, max 100000 characters). promptMode selects reference-video (default when omitted) or text-only. Switching mode never converts/copies either draft. Preserve both drafts and mode unless updating them. The example fields are required; unused text is "". actorId is an existing actor ID or "" for an unassigned note. Times are scene seconds, 0 <= start < end. sceneReferenceIds contains existing image IDs only. Keep existing fixedPrompt, promptText, textOnlyPrompt, promptMode, references and notes when not changing them; the arrays are replaced, not appended. Entity reference is an image ID, never story text. ';

/** Shared structural validation for tools and project files; references are checked after the entire edit batch. */
export function assertProductionShape(value: unknown): asserts value is ProductionData {
    const fail = (field: string, expected: string): never => { throw Error(`制作备注 ${field}：${expected}`); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('production', '需要完整对象；用 director_read sections:[production] 读取后修改');
    const data = value as Record<string, unknown>;
    if (typeof data.fixedPrompt !== 'string' || data.fixedPrompt.length > 50000) fail('production.fixedPrompt', '需要字符串（可为 ""），最长 50000 字');
    for (const key of ['promptText', 'textOnlyPrompt'])
        if (data[key] !== undefined && (typeof data[key] !== 'string' || (data[key] as string).length > 100000)) fail(`production.${key}`, '需要完整提示词字符串（可为 ""），最长 100000 字');
    if (data.promptMode !== undefined && data.promptMode !== 'reference-video' && data.promptMode !== 'text-only') fail('production.promptMode', '需要 reference-video 或 text-only');
    if (!Array.isArray(data.sceneReferenceIds) || data.sceneReferenceIds.some(id => typeof id !== 'string')) fail('production.sceneReferenceIds', '需要已导入图片 ID 的数组；没有图片时为 []');
    if (!Array.isArray(data.notes)) fail('production.notes', '需要备注数组；没有备注时为 []');
    const ids = new Set<string>();
    for (const [index, item] of (data.notes as unknown[]).entries()) {
        const at = `production.notes[${index}]`;
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail(at, '需要对象，如 {id:"note-1",start:0,end:3,actorId:"",story:"",emotion:"",dialogue:"",action:""}');
        const note = item as Record<string, unknown>;
        if (typeof note.id !== 'string' || !/^[\p{L}\p{N}_:.-]{1,200}$/u.test(note.id) || ids.has(note.id)) fail(at + '.id', '需要唯一 ID，1—200 个字母、数字或 _:.-');
        if (typeof note.start !== 'number' || !Number.isFinite(note.start) || note.start < 0) fail(at + '.start', '需要非负有限秒数');
        if (typeof note.end !== 'number' || !Number.isFinite(note.end) || note.end <= (note.start as number)) fail(at + '.end', '需要大于 start 的有限秒数');
        if (typeof note.actorId !== 'string') fail(at + '.actorId', '需要角色 ID 字符串；不关联角色时为 ""');
        for (const key of ['story', 'emotion', 'dialogue', 'action'])
            if (typeof note[key] !== 'string' || (note[key] as string).length > 20000) fail(at + '.' + key, '需要字符串（未填写时为 ""），最长 20000 字');
        ids.add(note.id as string);
    }
}
