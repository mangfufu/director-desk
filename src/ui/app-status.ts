import { t } from '../i18n/locale.ts';
import './app-status.css';

export function mountAppStatus() {
    const host = document.getElementById('app-usage')!;
    const read = window.directorDesktop?.appMetrics;
    if (!read) { host.hidden = true; return; }
    const metric = (name: string) => {
        const item = document.createElement('span'), label = document.createElement('span'), value = document.createElement('b');
        label.textContent = name; value.textContent = '—'; value.setAttribute('data-i18n-ignore','');
        item.className = 'app-metric';item.append(label,value);host.append(item);return value;
    };
    const cpu = metric('CPU'), memory = metric(t('内存'));
    let timer: ReturnType<typeof setTimeout> | undefined, pending = false, closed = false;
    const update = async () => {
        clearTimeout(timer);if (pending || closed) return;pending = true;
        try {
            const result = await read();const data = result.ok ? result.data : undefined;
            if (closed) return;
            cpu.textContent = data?.cpu != null && Number.isFinite(data.cpu) ? `${data.cpu.toFixed(1)}%` : '—';
            const bytes = data?.memoryBytes;
            memory.textContent = bytes != null && Number.isFinite(bytes)
                ? bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${Math.round(bytes / 1024 ** 2)} MB` : '—';
        } catch { cpu.textContent = memory.textContent = '—'; }
        finally { pending = false;if (!closed && !document.hidden) timer = setTimeout(update,2000); }
    };
    const visible = () => { clearTimeout(timer);if (!document.hidden) void update(); };
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);},{once:true});
    void update();
}
