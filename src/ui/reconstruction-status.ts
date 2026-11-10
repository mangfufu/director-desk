import type {AppContext} from '../app-context.ts';
import {reconstruction} from '../reconstruction/client.ts';
import {installSummary} from './reconstruction-install-progress.ts';
import {t} from '../i18n/locale.ts';

export function mountReconstructionStatus(ctx:AppContext){
    if(!window.directorDesktop?.reconstruction)return;
    const button=document.createElement('button');button.id='reconstruction-install-status';button.hidden=true;
    document.querySelector('#app-usage')?.append(button);
    button.onclick=()=>{if(document.querySelector('.reconstruction-settings-modal'))return;void import('./video-reconstruction-settings.ts').then(m=>m.openReconstructionSettings(ctx)).catch(e=>ctx.toast(e.message,true));};
    let closed=false,timer:ReturnType<typeof setTimeout>;
    async function poll(){
        try{const state=await reconstruction('state');if(closed)return;
            button.hidden=state.job?.kind!=='download';
            if(!button.hidden){button.textContent=t('视频反推')+' '+installSummary(state.job);button.title=t('查看配置进度');}
        }catch{button.hidden=true;}
        finally{if(!closed)timer=setTimeout(poll,1500);}
    }
    window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);},{once:true});void poll();
}
