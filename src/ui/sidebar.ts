import { createAssetBrowser } from './asset-browser.ts';
import { createMotionBrowser } from './motion-browser.ts';
import { $ } from './common.ts';
import type { AppContext } from '../app-context.ts';
import { createSceneObjectBrowser } from './scene-object-browser.ts';
import {t} from '../i18n/locale.ts';
export function createSidebar(ctx: AppContext) {
    const objects = createSceneObjectBrowser(ctx, renderSidebar);
    const browser = createAssetBrowser(ctx);
    const motions = createMotionBrowser(ctx);
    function renderSidebar() {
        const search=$<HTMLInputElement>('#search');if(search.value!==ctx.query)search.value=ctx.query;
        search.placeholder=t(ctx.sidebarTab==='assets'?'搜索白模资产':ctx.sidebarTab==='motions'?'搜索动作':'搜索场景对象');
        const clear=document.querySelector<HTMLButtonElement>('#clear-search');if(clear)clear.hidden=!ctx.query;
        const shortcut=document.querySelector<HTMLElement>('.search-field kbd');if(shortcut)shortcut.hidden=!!ctx.query;
        document.querySelectorAll('[data-side]').forEach(el => el.classList.toggle('active', (el as HTMLElement).dataset.side === ctx.sidebarTab));
        const resources=document.getElementById('resource-home'),tabs=document.getElementById('resource-tabs');
        if(resources){resources.classList.toggle('active',ctx.sidebarTab!=='scene');if(ctx.sidebarTab!=='scene')resources.dataset.resourceTab=ctx.sidebarTab;}
        if(tabs)tabs.hidden=ctx.sidebarTab==='scene';
        document.getElementById('creation-mode')!.hidden = ctx.sidebarTab !== 'assets';
        const content = $('#sidebar-content');
        content.classList.toggle('asset-mode', ctx.sidebarTab === 'assets' || ctx.sidebarTab === 'motions');
        content.classList.toggle('object-mode', ctx.sidebarTab === 'scene');
        if (ctx.sidebarTab !== 'assets') browser.leave();
        if (ctx.sidebarTab !== 'motions') motions.leave();
        if (ctx.sidebarTab === 'assets') browser.render(content);
        else if (ctx.sidebarTab === 'motions') motions.render(content);
        else content.innerHTML = objects.render();
    }
    return { renderSidebar };
}
