import {t} from '../i18n/locale.ts';

/** Keep the workspace and settings model choices named consistently. */
export function paintReconstructionModes(select:HTMLSelectElement,modes?:Record<string,{ready:boolean;bundled?:boolean}>){
    for(const option of select.options){
        const name=t(option.value==='mediapipe'?'轻量识别 · MediaPipe（默认）':option.value==='flowhmr'?'FlowHMR':'标准识别 · Human3R');
        const mode=modes?.[option.value];
        const label=mode?.bundled?`${name} · ${t('内置')}`:mode?.ready?`${name} · ${t('已安装')}`:name;
        if(option.textContent!==label)option.textContent=label;
    }
}
