import {escape} from './common.ts';
import {t} from '../i18n/locale.ts';

export function installSummary(job:any){
    const label=job.status==='completed'?(job.message||'模型已就绪'):job.status==='failed'?'配置失败':job.status==='cancelled'?'已取消':job.status==='interrupted'?'配置已中断':job.message||'准备中';
    return t(label)+(job.status==='running'?` ${Math.floor(job.progress||0)}%`:'');
}
export function paintInstallProgress(container:HTMLElement,job:any){
    container.hidden=job?.kind!=='download';if(container.hidden)return;
    const seconds=Math.max(0,Math.floor(((job.finishedAt||Date.now())-job.startedAt)/1000));
    const bytes=job.totalBytes?`${Math.round((job.downloadedBytes||0)/1024**2)} / ${Math.round(job.totalBytes/1024**2)} MB`:'';
    const detail=[job.detail?String(job.detail).split(' · ').map(t).join(' · '):'',bytes,`${t(job.status==='running'?'已用时':'总用时')} ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`].filter(Boolean).join(' · ');
    const states:Record<string,string>={pending:'等待',running:'进行中',completed:'完成',failed:'失败',cancelled:'已取消',interrupted:'已中断'};
    const same=container.dataset.job===job.id&&container.dataset.status===job.status;
    const expanded=same?(container.querySelector('details')?.open??true):job.status!=='completed';
    container.dataset.job=job.id;container.dataset.status=job.status;
    container.innerHTML=`<div class="reconstruction-install-summary"><strong>${escape(installSummary(job))}</strong><span>${escape(detail)}</span>${job.downloadFile?`<span class="reconstruction-download-file">${escape(job.downloadFile)}</span>`:''}</div><progress max="100" value="${Math.max(0,Math.min(100,job.progress||0))}" aria-label="${escape(t('配置进度'))}"></progress><details ${expanded?'open':''}><summary>${escape(t('配置步骤'))}</summary><ol>${(job.steps||[]).map((step:any)=>`<li data-state="${escape(step.status)}"><span>${escape(t(step.label))}</span><span>${escape(t(states[step.status]||'等待'))}${step.finishedAt&&step.startedAt?` · ${Math.floor((step.finishedAt-step.startedAt)/60000)}:${String(Math.floor((step.finishedAt-step.startedAt)/1000)%60).padStart(2,'0')}`:''}</span></li>`).join('')}</ol></details>`;
}
