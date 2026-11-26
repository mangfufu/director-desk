import type { AppContext } from '../app-context.ts';
import { uid } from '../model.ts';

export const MAX_JOB_WAIT_MS = 10_000;

interface JobState {
    id: string;
    status: 'running' | 'completed' | 'canceled' | 'failed';
    progress: number;
    result?: unknown;
    error?: string;
}
interface Task { tool: string; state: JobState; aborter: AbortController; done: Promise<void> }
export interface BusyJob { id: string; tool: string; status: 'running' }
export class EditorBusyError extends Error {
    readonly job?: BusyJob;
    constructor(job?: BusyJob) {
        super(job ? '当前有任务正在运行，请等待任务完成或取消' : '当前正在编辑、绘制或执行长任务，请等待或取消');
        this.job = job;
    }
}
type RunJob = (signal: AbortSignal, progress: (value: number) => void, report: (value: unknown) => void) => Promise<unknown>;
type JobContext = Pick<AppContext, 'busy' | 'draft' | 'history' | 'engine' | 'playing' | 'updateTimeUI'>;

export function createToolJobs(ctx: JobContext) {
    const tasks = new Map<string, Task>();
    let active: Task | undefined;

    function assertIdle() {
        if (!ctx.busy && !ctx.draft && !ctx.history.pending && !ctx.engine.exporting) return;
        const job = active?.state.status === 'running' ? { id: active.state.id, tool: active.tool, status: 'running' as const } : undefined;
        throw new EditorBusyError(job);
    }
    function start(tool: string, run: RunJob) {
        assertIdle();
        const state: JobState = { id: uid(), status: 'running', progress: 0 };
        const aborter = new AbortController();
        ctx.busy = true;
        ctx.playing = false;
        ctx.updateTimeUI();
        const done = Promise.resolve().then(async () => {
            try {
                state.result = await run(aborter.signal, progress => { state.progress = progress; }, result => { state.result = result; });
                state.status = 'completed';
                state.progress = 1;
            } catch (error) {
                state.status = error instanceof Error && error.name === 'AbortError' ? 'canceled' : 'failed';
                state.error = error instanceof Error ? error.message : String(error);
            } finally {
                if (active?.state === state) {
                    active = undefined;
                    ctx.busy = false;
                    ctx.updateTimeUI();
                }
                if (tasks.size > 30) {
                    for (const [id, task] of tasks) {
                        if (task.state.status === 'running') continue;
                        tasks.delete(id);
                        break;
                    }
                }
            }
        });
        active = { tool, state, aborter, done };
        tasks.set(state.id, active);
        return { jobId: state.id, status: state.status };
    }
    async function read(id: string, cancel = false, waitMs = 0) {
        if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > MAX_JOB_WAIT_MS) throw Error(`waitMs 必须是 0—${MAX_JOB_WAIT_MS} 的整数`);
        const task = tasks.get(id);
        if (!task) throw Error('任务不存在');
        if (cancel) task.aborter.abort();
        if (waitMs > 0 && task.state.status === 'running') {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([task.done, new Promise<void>(resolve => { timer = setTimeout(resolve, waitMs); })]);
            } finally { clearTimeout(timer); }
        }
        return { ...task.state };
    }
    return { assertIdle, start, read };
}
