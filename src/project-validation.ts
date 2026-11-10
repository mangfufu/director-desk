/** Validation locations shared by files, editor transactions and automation. */
export class ProjectValidationError extends Error {
    readonly path: string;
    readonly reason: string;
    readonly entityId?: string;
    constructor(path: string, reason: string, entityId?: string) {
        super(`项目文件无效：${path}${entityId ? `（对象 ${entityId}）` : ''}：${reason}`);
        this.name = 'ProjectValidationError'; this.path = path; this.reason = reason; this.entityId = entityId;
    }
}
export function invalidField(path: string, reason: string): never { throw new ProjectValidationError(path, reason); }
export function validateAt(path: string, run: () => void, entityId?: string) {
    try { run(); }
    catch (error) {
        const nested = error instanceof ProjectValidationError;
        const suffix = nested && error.path ? `${error.path.startsWith('[') ? '' : '.'}${error.path}` : '';
        throw new ProjectValidationError(path + suffix, nested ? error.reason : error instanceof Error ? error.message.replace(/^项目文件无效：/, '') : '数据无效', entityId ?? (nested ? error.entityId : undefined));
    }
}
