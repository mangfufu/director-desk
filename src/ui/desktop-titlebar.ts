import './desktop-titlebar.css';
import { t, onLanguageChange } from '../i18n/locale.ts';

/** Custom caption buttons invoke only the host's fixed window commands. */
export function mountDesktopTitlebar() {
    const chrome=window.directorDesktop?.windowChrome;
    if(!chrome)return;
    document.documentElement.dataset.windowChrome=chrome;
    const top=document.querySelector<HTMLElement>('.topbar')!;
    const row=document.createElement('div');row.className='window-menu-row';
    const title=document.createElement('div');title.id='window-project-title';
    title.setAttribute('data-i18n-ignore','');
    row.append(top.querySelector('.brand')!,top.querySelector('.application-menu')!,title);
    top.prepend(row);
    const sync=()=>{title.textContent=document.title;title.title=document.title;};sync();
    new MutationObserver(sync).observe(document.querySelector('title')!,{childList:true,subtree:true,characterData:true});
    const api = window.directorDesktop!;
    const controls = document.createElement('div'); controls.className = 'window-controls';
    const paths = { minimize:'M5 12h14', maximize:'M5 5h14v14H5z', restore:'M8 5V3h13v13h-2 M3 8h13v13H3z', close:'M5 5l14 14 M19 5L5 19' };
    const svg = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${path}"/></svg>`;
    let state = { maximized:false, fullscreen:false };
    const buttons = new Map<string,HTMLButtonElement>();
    const update = () => {
        const restored = state.maximized || state.fullscreen;
        for (const [command,label] of [['minimize','最小化'],['maximize',restored?'还原窗口':'最大化'],['close','关闭窗口']]) {
            const button = buttons.get(command)!;
            button.title = t(label); button.setAttribute('aria-label',t(label));
            if (command === 'maximize') button.innerHTML = svg(restored ? paths.restore : paths.maximize);
        }
    };
    for (const command of ['minimize','maximize','close'] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.windowCommand = command;
        button.innerHTML = svg(paths[command]); buttons.set(command,button); controls.append(button);
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { const result = await api.windowControl?.(command); if (result?.ok && result.data) { state = result.data; update(); } }
            finally { button.disabled = false; }
        });
    }
    row.append(controls); update(); onLanguageChange(update);
    api.onWindowState?.(next => { state = next; update(); });
    void api.windowControl?.('state').then(result => { if (result.ok && result.data) { state = result.data; update(); } });
}
