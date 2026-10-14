import type { AppContext } from '../app-context.ts';
import { motionPresets } from '../animation/motion-catalog.ts';
import { listUserMotions } from '../animation/user-motion-store.ts';
import { rigStatus } from '../resources/rig-definition.ts';
import { canRetarget } from '../resources/retarget-animation.ts';
import { addLibraryMotion } from './motion-insertion.ts';
import { escape, options } from './common.ts';
import './motion-browser.css';
import { englishText } from '../i18n/locale.ts';

export interface MotionLibraryItem { id: string; name: string; duration: number; group: string; ready: boolean }
export function createMotionBrowser(ctx: AppContext) {
    let users: MotionLibraryItem[] = [], host: HTMLElement | undefined, observer: ResizeObserver | undefined;
    let generation = 0, category = '全部', page = 0, pageSize = 8, query = '', chosen = '', loading = false, failed = false;
    let listKey = '', groupKey = '', libraryRevision = 0;
    const builtins: MotionLibraryItem[] = motionPresets().map(p => ({ id: p.id, name: p.name, duration: p.defaultDuration, group: p.group, ready: true }));
    const items = () => [...builtins, ...users];
    async function reload() {
        const token = ++generation; loading = true; failed = false;
        try {
            const motions = await listUserMotions();
            if (token !== generation) return;
            users = motions.map(m => ({ id: m.id, name: m.name, duration: m.duration, group: '用户收藏', ready: rigStatus(m.data.rig).complete }));
            libraryRevision++;
        } catch { if (token === generation) failed = true; }
        finally { if (token === generation) { loading = false; if (host?.isConnected) render(host); } }
    }
    function mount(content: HTMLElement) {
        host = content;
        listKey = ''; groupKey = '';
        content.innerHTML = `<div class="motion-browser"><div class="motion-library-tools"><label class="library-category">分类<select aria-label="动作分类"></select></label><button data-act="user-motion-library">导入 / 管理</button></div><div class="motion-library-list" role="list" aria-label="动作库"></div><div class="library-pager"><button data-motion-page="-1" aria-label="上一页动作">‹ 上页</button><span class="motion-library-page"></span><button data-motion-page="1" aria-label="下一页动作">下页 ›</button></div><button class="motion-library-add">添加到当前人物</button></div>`;
        const browser = content.firstElementChild as HTMLElement;
        browser.querySelector('select')!.onchange = event => { category = (event.target as HTMLSelectElement).value; page = 0; render(content); };
        browser.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            const item = target.closest<HTMLElement>('[data-library-motion]');
            if (item) { chosen = item.dataset.libraryMotion!; render(content); }
            const pager = target.closest<HTMLElement>('[data-motion-page]');
            if (pager) { page += Number(pager.dataset.motionPage); render(content); }
            if (target.closest('.motion-library-add') && chosen) void addLibraryMotion(ctx, chosen, ctx.selected, ctx.time);
        });
        const list = browser.querySelector<HTMLElement>('.motion-library-list')!;
        observer = new ResizeObserver(() => {
            const count = Math.max(1, Math.floor(list.clientHeight / 54));
            if (count !== pageSize) { pageSize = count; render(content); }
        });
        observer.observe(list);
        void reload();
    }
    function render(content: HTMLElement) {
        if (!content.querySelector('.motion-browser')) mount(content);
        if (query !== ctx.query) { query = ctx.query; page = 0; }
        const all = items(), search = query.trim().toLocaleLowerCase();
        const groups = ['全部', ...new Set(all.map(m => m.group)), ...(!users.length ? ['用户收藏'] : [])];
        const nextGroups = JSON.stringify(groups);
        const select = content.querySelector('select')!;
        if (groupKey !== nextGroups) { groupKey = nextGroups; select.innerHTML = options(groups.map(g => [g, g]), category); }
        select.value = category;
        const filtered = all.filter(m => (category === '全部' || category === m.group) && `${m.name} ${m.id} ${m.group} ${englishText(m.name)} ${englishText(m.group)}`.toLocaleLowerCase().includes(search));
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.max(0, Math.min(page, pages - 1));
        const nextList = JSON.stringify([search, category, page, pageSize, libraryRevision, loading, failed]);
        if (listKey !== nextList) {
            listKey = nextList;
            content.querySelector('.motion-library-list')!.innerHTML = filtered.slice(page * pageSize, (page + 1) * pageSize).map(m => `<button type="button" class="motion-library-item" draggable="${m.ready}" data-library-motion="${escape(m.id)}" data-motion-name="${escape(m.name)}" data-motion-duration="${m.duration}" aria-pressed="${chosen === m.id}" title="${escape(m.name)}${m.ready ? ' · 拖入人物轨道' : ' · 请先完善骨架映射'}"><span class="motion-library-grip" aria-hidden="true">⠿</span><span><strong ${m.group === '用户收藏' ? 'data-i18n-ignore' : ''}>${escape(m.name)}</strong><small>${escape(m.group)} · ${Number(m.duration.toFixed(2))} 秒${m.ready ? '' : ' · 待映射'}</small></span></button>`).join('') || `<div class="library-empty">${loading ? '正在加载…' : failed && category === '用户收藏' ? '动作库读取失败' : '没有匹配的动作'}${failed ? '<button data-motion-reload>重试</button>' : ''}</div>`;
            content.querySelector('[data-motion-reload]')?.addEventListener('click', () => void reload());
        }
        content.querySelectorAll<HTMLElement>('[data-library-motion]').forEach(item => {
            const pressed = String(item.dataset.libraryMotion === chosen);
            if (item.getAttribute('aria-pressed') !== pressed) item.setAttribute('aria-pressed', pressed);
        });
        content.querySelector('.motion-library-page')!.textContent = `${page + 1} / ${pages}`;
        content.querySelector<HTMLButtonElement>('[data-motion-page="-1"]')!.disabled = page === 0;
        content.querySelector<HTMLButtonElement>('[data-motion-page="1"]')!.disabled = page === pages - 1;
        const target = ctx.current(), add = content.querySelector<HTMLButtonElement>('.motion-library-add')!;
        add.disabled = ctx.busy || !target || target.locked || !canRetarget(target) || !all.find(m => m.id === chosen)?.ready;
    }
    window.addEventListener('director-motion-library-changed', () => { if (host?.isConnected) void reload(); });
    return { render, leave() { generation++; observer?.disconnect(); observer = undefined; host = undefined; } };
}
