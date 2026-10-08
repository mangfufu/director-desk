import type { AppContext } from '../app-context.ts';
import { selectedEntities } from '../editor/timeline-selection.ts';
import { entityPosition } from '../timeline.ts';
import { extensionCall } from './extension-tools.ts';
import { $, button } from './common.ts';
import './extensions.css';
export function createNavigationPanel(ctx:AppContext){
    let ids:string[]=[],owner='',busy=false,jobId='';
    return {handle(action:string){
        if(!action.startsWith('navigate-'))return false;
        if(action==='navigate-cancel'){
            if(jobId)void extensionCall(ctx,'director_job',{id:jobId,cancel:true}).catch(e=>ctx.toast(e.message,true));
            else if(!busy)ctx.closeModal();return true;
        }
        if(action==='navigate-clear'){
            const e=ctx.current();if(e?.memberPaths&&!e.locked)ctx.change(()=>{delete e.memberPaths;});return true;
        }
        if(action==='navigate-open'){
            ids=selectedEntities();if(!ids.length)ids=[ctx.selected];ids=ids.filter(id=>ctx.project.entities.some(e=>e.id===id&&['actor','crowd'].includes(e.kind)));
            if(!ids.length){ctx.toast('请先选择人物或群演');return true;}
            owner=ctx.scenes.context.sceneId;
            const p=entityPosition(ctx.project.entities.find(e=>e.id===ids[0])!,ctx.time).toArray();p[0]+=6;
            ctx.showModal('自动避障',`<div class="extension-panel navigation-panel"><span>${ids.length} 个对象</span><div class="triple">${['X','Y','Z'].map((axis,i)=>`<label class="field"><span>终点 ${axis}</span><input id="nav-${i}" type="number" step=".1" value="${p[i].toFixed(2)}"></label>`).join('')}</div><div class="extension-fields">${[['start','开始',ctx.time],['end','结束',Math.max(ctx.time+10,ctx.project.duration)],['speed','速度 · 米/秒',1.5],['radius','避让半径 · 米',.35]].map(([id,label,value])=>`<label class="field"><span>${label}</span><input id="nav-${id}" type="number" step=".1" value="${value}"></label>`).join('')}</div></div>`,button('navigate-generate','生成路线','','primary')+button('navigate-cancel','关闭','','subtle'));return true;
        }
        if(busy)return true;busy=true;
        const cancel=document.querySelector('[data-act="navigate-cancel"]');if(cancel)cancel.textContent='取消';
        void(async()=>{
            if(owner!==ctx.scenes.context.sceneId)throw Error('戏段已切换，请重新选择');
            const destination=[0,1,2].map(i=>Number($(`#nav-${i}`).value));
            const args=Object.fromEntries(['start','end','speed','radius'].map(k=>[k,Number($(`#nav-${k}`).value)]));
            const ref=await extensionCall(ctx,'director_navigate',{entityIds:ids,destination,...args},true);jobId=ref.jobId;
            let result;
            while(true){const job=await extensionCall(ctx,'director_job',{id:jobId});if(job.status==='canceled'){ctx.toast('已取消');return;}if(job.status==='failed')throw Error(job.error);if(job.status==='completed'){result=job.result;break;}await new Promise(r=>setTimeout(r,150));}
            ctx.closeModal();ctx.toast(`已生成 ${result.people} 人的路线${result.movingObstacleIds.length?'；移动障碍按起点位置计算':''}`);
        })().catch(e=>ctx.toast(e.message,true)).finally(()=>{busy=false;jobId='';if(cancel?.isConnected)cancel.textContent='关闭';});return true;
    }};
}
