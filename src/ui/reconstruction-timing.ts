import {t} from '../i18n/locale.ts';

function duration(seconds:number){
    const total=Math.max(0,Math.floor(seconds));
    return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
}
export function reconstructionTimingText(job:any){
    if(job?.kind!=='convert'||!Number.isFinite(job.elapsedSeconds))return '';
    const running=job.status==='running';
    const elapsed=`${t(running?'已用时':'总用时')} ${duration(job.elapsedSeconds)}`;
    if(!running)return elapsed;
    const remaining=job.estimatedRemainingSeconds;
    return `${elapsed} · ${Number.isFinite(remaining)?`${t('预计剩余约')} ${duration(remaining)}`:t('正在估算剩余时间')}`;
}
