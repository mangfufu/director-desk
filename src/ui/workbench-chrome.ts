import {icon} from './common.ts';
import {mountDesktopTitlebar} from './desktop-titlebar.ts';
import {layoutControls} from './resizable-layout.ts';
import {t} from '../i18n/locale.ts';

/** Rearrange the original controls so their editor handlers and IDs stay intact. */
export function mountWorkbenchChrome() {
    const top=document.querySelector('.topbar')!,navigation=document.createElement('div');
    navigation.className='workbench-navigation';
    top.insertBefore(navigation,document.querySelector('.header-actions'));
    navigation.append(document.querySelector('.scene-switcher')!,document.querySelector('.view-modes')!);
    const commandbar=document.createElement('div');commandbar.className='workbench-commandbar';
    navigation.before(commandbar);commandbar.append(navigation,document.querySelector('.header-actions')!);
    document.querySelector('.brand')?.setAttribute('title','导演台');
    const tabs=document.querySelector('.side-tabs')!,resources=document.createElement('div');
    const clear=document.createElement('button');clear.id='clear-search';clear.type='button';clear.className='mini-button';clear.innerHTML=icon('close');clear.hidden=true;clear.title=t('清空搜索 · Esc');clear.setAttribute('aria-label',t('清空搜索'));document.querySelector('.search-field')!.append(clear);
    resources.id='resource-tabs';resources.className='resource-tabs';resources.hidden=true;
    const resourceHome=document.createElement('button');resourceHome.id='resource-home';resourceHome.textContent='资源';resourceHome.dataset.resourceTab='assets';
    tabs.append(resourceHome);tabs.after(resources);
    const models=tabs.querySelector<HTMLElement>('[data-side=assets]')!;models.textContent='模型';
    resources.append(models,tabs.querySelector('[data-side=motions]')!);
    const staging=document.createElement('button');staging.textContent='布景库';staging.dataset.act='staging-open';resources.append(staging);
    const expand=document.createElement('button');expand.className='resource-expand';expand.innerHTML=icon('panelExpand');
    expand.setAttribute('aria-label',t('展开资源库'));expand.title=t('展开资源库');resources.append(expand);
    let previousWidth:number|undefined;
    expand.addEventListener('click',()=>{
        const before=layoutControls.read?.();if(!before)return;
        const target=previousWidth??Math.max(420,before.sidebar);
        if(previousWidth===undefined)previousWidth=before.sidebar;else previousWidth=undefined;
        layoutControls.set?.({sidebar:target});
        expand.setAttribute('aria-pressed',String(previousWidth!==undefined));
        expand.title=t(previousWidth!==undefined?'收起资源库':'展开资源库');expand.setAttribute('aria-label',expand.title);
    });

    const ai=document.getElementById('ai-toggle')!,changes=document.getElementById('ai-changes-toggle')!;
    const group=document.createElement('div');group.className='ai-access';ai.before(group);group.append(ai);
    const trigger=document.createElement('button'),menu=document.createElement('div');
    trigger.id='ai-tools-toggle';trigger.className='ai-tools-toggle';trigger.innerHTML=icon('chevronDown');
    trigger.setAttribute('aria-label','AI 菜单');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
    menu.id='ai-tools-menu';menu.className='application-dropdown';menu.popover='auto';menu.setAttribute('aria-label','AI 菜单');
    trigger.setAttribute('popovertarget',menu.id);group.append(trigger);document.body.append(menu);menu.append(changes);
    changes.className='menu-command';
    const place=()=>{if(!menu.matches(':popover-open'))return;const r=trigger.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=r.bottom+5+'px';};
    menu.addEventListener('toggle',()=>{trigger.setAttribute('aria-expanded',String(menu.matches(':popover-open')));place();});
    menu.addEventListener('click',()=>{if(menu.matches(':popover-open'))menu.hidePopover();});
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();menu.showPopover();place();changes.focus();}});
    menu.addEventListener('keydown',event=>{
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();changes.focus();}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.hidePopover();trigger.focus();}
    });
    window.addEventListener('resize',place);
    new MutationObserver(()=>trigger.classList.toggle('has-changes',changes.textContent?.includes('·')??false)).observe(changes,{childList:true,subtree:true,characterData:true});
    mountDesktopTitlebar();
    if(!document.querySelector('.window-menu-row')) {
        const row=document.createElement('div');row.className='workbench-menu-row';
        row.append(top.querySelector('.brand')!,top.querySelector('.application-menu')!);top.prepend(row);
    }
    // Arrow keys follow the same commands as clicking, without another selection state.
    for(const group of [tabs,resources,document.querySelector('.view-modes')!]) {
        group.addEventListener('keydown',event=>{
            const key=(event as KeyboardEvent).key;
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(key))return;
            const buttons=Array.from(group.querySelectorAll<HTMLButtonElement>(':scope > button:is([data-side],[data-resource-tab],[data-view]):not(:disabled)'));
            const index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0)return;
            event.preventDefault();event.stopPropagation();
            const next=key==='Home'?0:key==='End'?buttons.length-1:(index+(key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
            buttons[next].focus();buttons[next].click();
        });
    }
}
