import type { AppContext } from '../app-context.ts';
import { createToolService } from '../automation/service.ts';
export async function extensionCall(ctx: AppContext, name: string, args: Record<string, unknown>, write = false) {
    const service = createToolService(ctx);
    if (write) {
        const read = await service.call('director_read',{sections:[]}); if (!read.ok) throw Error(read.error);
        args = { ...args, revision:read.data.revision, requestId:crypto.randomUUID() };
    }
    const result = await service.call(name,args); if (!result.ok) throw Error(result.error); return result.data;
}
