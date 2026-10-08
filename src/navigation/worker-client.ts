import type { Project } from '../model.ts';
import type { NavigationOptions, planNavigation } from './planner.ts';
export function planNavigationAsync(project: Project, options: NavigationOptions, signal?: AbortSignal): Promise<ReturnType<typeof planNavigation>> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('已取消','AbortError')); return; }
        const worker = new Worker(new URL('./planner.worker.ts', import.meta.url), {type:'module'});
        const timer = setTimeout(() => { close(); reject(Error('路线计算超时，请缩小范围或分批安排')); }, 120000);
        const close = () => { clearTimeout(timer); signal?.removeEventListener('abort',abort); worker.terminate(); };
        const abort = () => {close();reject(new DOMException('已取消','AbortError'));};
        signal?.addEventListener('abort',abort,{once:true});
        worker.onmessage = ({data}) => { close(); data.error ? reject(Error(data.error)) : resolve(data.result); };
        worker.onerror = event => { close(); reject(Error(event.message || '路线计算失败')); };
        // Planning uses geometry bounds, not embedded source packages or reference images.
        worker.postMessage({project:{...project,resources:[],media:[],references:[]},options});
    });
}
