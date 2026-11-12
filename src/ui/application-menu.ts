import './application-menu.css';

/** Move existing controls, preserving their handlers, state and unique IDs. */
export function mountApplicationMenu() {
    const bar = document.createElement('nav');
    bar.className = 'application-menu'; bar.setAttribute('aria-label', '应用菜单');
    document.querySelector('.topbar .brand')!.after(bar);
    const header = document.querySelector('.header-actions')!;
    const status = document.querySelector<HTMLElement>('#save-status')!;
    status.hidden = false;
    document.querySelector('.statusbar')!.prepend(status);
    for (const [id, label] of [['ai-toggle', 'AI'], ['ai-changes-toggle', 'AI 最新改动']]) {
        const control = document.getElementById(id)!; control.textContent = label; header.append(control);
    }
    for (const id of ['aspect','fps']) header.insertBefore(document.getElementById(id)!,document.getElementById('ai-toggle'));
    for (const action of ['save','export']) {
        const control = document.querySelector<HTMLButtonElement>(`.header-actions [data-act="${action}"]`)!;
        const entry = control.cloneNode(true) as HTMLButtonElement; entry.removeAttribute('id'); entry.dataset.menuCopy=action;
        document.querySelector('.side-bottom')!.append(entry); header.append(control);
        control.textContent = action==='save' ? '保存' : '导出'; control.className=action==='export'?'primary':'subtle';
    }
    const camera = document.querySelector<HTMLElement>('[data-act="add-camera"]')!;
    camera.className='subtle';camera.textContent='添加摄影机'; document.querySelector('.key-tools')!.prepend(camera);
    const mode = document.getElementById('creation-mode')!;
    mode.querySelector('[data-creation-mode="full"]')!.textContent = '精细模型';
    mode.querySelector('[data-creation-mode="geometry"]')!.textContent = '几何体';
    document.querySelector('.sidebar .search-field')!.before(mode);
    for (const [action, label] of [['blender-import', '导入 Blender 工程'], ['group-create', '编组'], ['group-select', '选择整组'], ['group-ungroup', '解组'], ['arrange-open', '对齐与阵列'], ['staging-open', '布景库'], ['versions-open','历史版本'], ['plugins-open','插件'], ['navigate-open','自动避障'], ['scene-reuse-open','场景复用 / 插入'], ['preview-settings','预览设置']]) {
        const control = document.createElement('button'); control.dataset.act = action; control.textContent = label;
        document.querySelector('.side-bottom')!.append(control);
    }
    const saveAs = document.createElement('button'); saveAs.dataset.act = 'save-as'; saveAs.textContent = '另存为…';
    document.querySelector('.side-bottom')!.append(saveAs);
    const contact=document.createElement('button');contact.dataset.act='contact-sheet';contact.textContent='镜头联系表';document.querySelector('.side-bottom')!.append(contact);
    const previewCache=document.createElement('button');previewCache.dataset.act='preview-cache';previewCache.textContent='局部预览';document.querySelector('.side-bottom')!.append(previewCache);
    const definitions: [string, string, [string, string][][]][] = [
        ['file', '文件', [
            [['[data-act="scene-templates"]', '新建工程'], ['[data-act="open"]', '打开']],
            [['[data-menu-copy="save"]', '保存'], ['[data-act="save-as"]', '另存为…'], ['[data-act="project"]', '重命名项目'], ['[data-act="versions-open"]', '历史版本']],
            [['[data-act="model-import"]', '导入模型'], ['[data-act="blender-import"]', '导入 Blender 工程']],
            [['[data-menu-copy="export"]', '导出视频']],
        ]],
        ['edit', '编辑', [
            [['[data-act="undo"]', '撤销'], ['[data-act="redo"]', '重做']],
            [['[data-act="group-create"]', '编组'], ['[data-act="group-ungroup"]', '解组'], ['[data-act="group-select"]', '选择整组']],
            [['[data-act="arrange-open"]', '对齐与阵列']],
            [['#settings-toggle', '设置']],
        ]],
        ['view', '视图', [
            [['[data-act="preview-settings"]', '预览设置'], ['[data-act="preview-cache"]', '局部预览']],
            [['#reset-layout', '重置面板布局']],
        ]],
        ['production', '制作', [
            [['[data-act="room"]', '灯光与场景'], ['[data-act="scene-reuse-open"]', '场景复用 / 插入']],
            [['[data-act="spatial-open"]', '空间检查'], ['[data-act="navigate-open"]', '自动避障']],
            [['[data-act="production-notes"]', '剧情与提示词'], ['[data-act="contact-sheet"]', '镜头联系表']],
        ]],
        ['extensions', '扩展', [[['[data-act="plugins-open"]', '插件']]]],
        ['help', '帮助', [
            [['[data-act="help"]', '操作与快捷键']],
            [['#update-toggle', '检查更新']],
        ]],
    ];
    const menus: { trigger: HTMLButtonElement; menu: HTMLDivElement }[] = [];
    for (const [id, title, groups] of definitions) {
        const trigger = document.createElement('button'), menu = document.createElement('div');
        trigger.type = 'button'; trigger.textContent = title; trigger.dataset.menu = id;
        menu.id = `application-menu-${id}`; menu.className = 'application-dropdown'; menu.popover = 'auto';
        menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', title); trigger.setAttribute('popovertarget', menu.id);
        trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
        for (const entries of groups) {
            const controls: HTMLButtonElement[] = [];
            for (const [selector, label] of entries) {
                const control = document.querySelector<HTMLButtonElement>(selector); if (!control) continue;
                control.textContent = label;
                control.setAttribute('aria-label', label); control.setAttribute('role', 'menuitem');
                control.type = 'button';
                control.classList.remove('icon-button', 'subtle', 'wide', 'primary'); control.classList.add('menu-command');
                controls.push(control);
            }
            if (!controls.length) continue;
            if (menu.childElementCount) {
                const separator = document.createElement('div'); separator.className = 'menu-separator';
                separator.setAttribute('role', 'separator'); menu.append(separator);
            }
            menu.append(...controls);
        }
        bar.append(trigger); document.body.append(menu); menus.push({ trigger, menu });
        const place = (opening = false) => {
            if (!opening && !menu.matches(':popover-open')) return;
            const r = trigger.getBoundingClientRect();
            const width = menu.offsetWidth || parseFloat(getComputedStyle(menu).width);
            menu.style.left = Math.max(8, Math.min(r.left, innerWidth - width - 8)) + 'px';
            menu.style.top = r.bottom + 5 + 'px';
        };
        menu.addEventListener('beforetoggle', event => { if ((event as ToggleEvent).newState === 'open') place(true); });
        menu.addEventListener('toggle', () => { trigger.setAttribute('aria-expanded', String(menu.matches(':popover-open'))); place(); });
        menu.addEventListener('click', event => {
            if ((event.target as HTMLElement).closest('button:not(:disabled)') && menu.matches(':popover-open')) menu.hidePopover();
        });
        trigger.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation(); menu.showPopover(); place();
            const items = menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            items[event.key === 'ArrowUp' ? items.length - 1 : 0]?.focus();
        });
        menu.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault(); event.stopPropagation(); menu.hidePopover(); trigger.focus(); return;
            }
            if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation();
                const index = menus.findIndex(item => item.menu === menu);
                const next = menus[(index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length];
                next.menu.showPopover(); next.menu.querySelector<HTMLElement>('button:not(:disabled)')?.focus(); return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
        });
        window.addEventListener('resize', () => place());
    }
    if(window.directorDesktop?.reconstruction){const video=document.createElement('button');video.type='button';video.dataset.act='video-reconstruction';video.textContent='视频反推';bar.append(video);}
    bar.addEventListener('pointerover', event => {
        const next = menus.find(m => m.trigger === event.target);
        if (next && menus.some(m => m.menu.matches(':popover-open')) && !next.menu.matches(':popover-open')) next.menu.showPopover();
    });
    const update = document.querySelector('#update-toggle');
    if (update) new MutationObserver(() => {
        bar.querySelector('[data-menu="help"]')?.classList.toggle('has-update', update.classList.contains('has-update'));
    }).observe(update, { attributes: true, attributeFilter: ['class'] });
    document.querySelector('.side-bottom')?.remove();
    document.querySelector('.header-actions .top-separator')?.remove();
}
