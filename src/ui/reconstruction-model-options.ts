import {t} from '../i18n/locale.ts';

/** Keep the workspace and settings model choices named consistently. */
export function paintReconstructionModes(select:HTMLSelectElement,modes?:Record<string,{ready:boolean}>){
    for(const option of select.options){
        const name=t(option.value==='mediapipe'?'简易识别（默认）':'标准识别');
        const label=modes?.[option.value]?.ready?`${name} · ${t('已安装')}`:name;
        if(option.textContent!==label)option.textContent=label;
    }
}
