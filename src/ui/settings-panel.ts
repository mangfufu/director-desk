import { addPageBack } from './modal-pages.ts';
import type { AppContext } from '../app-context.ts';
import { icon } from './common.ts';
import { editorPreferences, preferenceRanges, type PreferenceKey } from '../editor/preferences.ts';
import './settings-panel.css';
import { getLanguage, setLanguage } from '../i18n/locale.ts';

export function mountSettings(ctx:AppContext) {
    const trigger=document.createElement('button');trigger.id='settings-toggle';trigger.className='icon-button subtle';trigger.title='设置';trigger.setAttribute('aria-label','设置');trigger.innerHTML=icon('settings');
    document.querySelector('.header-actions')!.prepend(trigger);
    const locations=document.querySelector<HTMLButtonElement>('#file-locations-open');if(locations)locations.hidden=true;
    const apply = () => {
        const p=editorPreferences.current,orbit=ctx.engine.orbit;
        orbit.rotateSpeed=p.rotationSpeed;orbit.zoomSpeed=p.zoomSpeed;orbit.panSpeed=p.panSpeed;orbit.enableDamping=p.viewDamping;
        ctx.engine.gizmo.setSize(p.gizmoSize);
        document.querySelector<HTMLElement>('#stage-hint')!.hidden=!p.showNavigationHint;
        ctx.engine.render();
    };
    editorPreferences.subscribe(apply);apply();
    const row=(label:string,control:string)=>`<div class="setting-row"><div><strong>${label}</strong></div><div class="setting-control">${control}</div></div>`;
    const input=(key:PreferenceKey)=>{
        const value=editorPreferences.current[key];
        if(typeof value==='boolean')return `<input type="checkbox" data-preference="${key}" aria-label="${key==='viewDamping'?'视角惯性':'布景操作提示'}" ${value?'checked':''}/>`;
        const range=preferenceRanges[key]!;
        return `<input type="number" data-preference="${key}" aria-label="${key}" value="${Number(value.toFixed(2))}" min="${range[0]}" max="${range[1]}" step=".1"/>`;
    };
    trigger.onclick=()=>{
        if(ctx.busy || ctx.history.pending || ctx.draft)return;
        ctx.showModal('设置',`<div class="settings-list">
            ${row('语言',`<select id="ui-language" aria-label="Language"><option value="zh-CN" ${getLanguage()==='zh-CN'?'selected':''}>简体中文</option><option value="en" ${getLanguage()==='en'?'selected':''}>English</option></select>`)}
            <div class="settings-navigation"><div class="settings-categories" role="group" aria-label="设置分类"><button data-settings-category="navigation" aria-pressed="true">操作与视角</button><button data-settings-category="editing">编辑辅助</button><button data-settings-category="files">保存与软件</button></div><button data-setting="help">操作与快捷键</button></div><section data-settings-panel="navigation">
            ${row('键盘移动速度 / 米每秒',input('navigationSpeed'))}
            ${row('加速倍率 / Shift',input('navigationBoost'))}
            ${row('旋转灵敏度',input('rotationSpeed'))}
            ${row('平移灵敏度',input('panSpeed'))}
            ${row('滚轮缩放灵敏度',input('zoomSpeed'))}
            ${row('视角惯性',input('viewDamping'))}
            </section><section data-settings-panel="editing" hidden>
            ${row('变换手柄大小',input('gizmoSize'))}
            ${row('布景操作提示',input('showNavigationHint'))}
            </section><section data-settings-panel="files" hidden>
            ${row('默认文件位置',`<button data-setting="files" ${locations?'':'disabled'}>设置目录</button>`)}
            ${row('软件更新',`<button data-setting="updates" ${window.directorDesktop?'':'disabled'}>更新设置</button>`)}
            ${row('工作区布局','<button data-setting="layout">恢复布局</button>')}
            </section><p id="settings-feedback" role="status"></p>
        </div>`, '<button data-setting="reset" class="subtle">恢复操作偏好默认值</button><button data-act="close-modal">完成</button>');
        document.querySelector('.modal')!.classList.add('preferences-modal');
        const list=document.querySelector('.settings-list')!;
        list.querySelector<HTMLSelectElement>('#ui-language')!.addEventListener('change',event=>{event.stopPropagation();setLanguage((event.target as HTMLSelectElement).value);});
        list.addEventListener('input',event=>{
            const input=event.target as HTMLInputElement,key=input.dataset.preference as PreferenceKey;
            if(!key)return;event.stopPropagation();
            const ok=editorPreferences.set(key,input.type==='checkbox'?input.checked:Number(input.value));
            document.querySelector('#settings-feedback')!.textContent=ok?'':`请输入 ${input.min}—${input.max} 之间的数值`;
        });
        const modal=document.querySelector('.preferences-modal')!;
        modal.addEventListener('click',event=>{
            const category=(event.target as HTMLElement).closest<HTMLElement>('[data-settings-category]')?.dataset.settingsCategory;
            if(category){modal.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach(panel=>panel.hidden=panel.dataset.settingsPanel!==category);modal.querySelectorAll<HTMLElement>('[data-settings-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.settingsCategory===category)));return;}
            const action=(event.target as HTMLElement).closest<HTMLElement>('[data-setting]')?.dataset.setting;if(!action)return;
            if(action==='reset') {editorPreferences.reset();modal.querySelectorAll<HTMLInputElement>('[data-preference]').forEach(input=>{const value=editorPreferences.current[input.dataset.preference as PreferenceKey];if(typeof value==='boolean')input.checked=value;else input.value=String(Number(value.toFixed(2)));});document.querySelector('#settings-feedback')!.textContent='已恢复操作偏好默认值';}
            if(action==='layout')document.querySelector<HTMLButtonElement>('#reset-layout')!.click();
            if(action==='files')locations?.click();
            if(action==='help')ctx.helpDialog();
            if(action==='updates'){ctx.closeModal();document.querySelector<HTMLButtonElement>('#update-toggle')?.click();const dialog=document.querySelector<HTMLDialogElement>('#update-panel');if(dialog)addPageBack(dialog,'返回设置',()=>{dialog.close();trigger.click();});}
        });
    };
}
