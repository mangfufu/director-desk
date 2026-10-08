import type { AppContext } from '../app-context.ts';
import { assertProject,type Entity } from '../model.ts';
import { canUseRagdoll,defaultPhysicsBody,defaultPhysicsWorld } from '../physics/model.ts';
import { options } from './common.ts';
import './physics-panel.css';

export function createPhysicsPanel(ctx:AppContext){
    const host=document.querySelector('#inspector-content')!;
    let live:HTMLInputElement|null=null,selectedEvent=0,owner='';
    function finish(cancel=false){if(!live)return;const input=live;live=null;try{if(cancel)throw Error('cancel');if(input.value===''||!input.checkValidity())throw Error('请输入范围内的数值');assertProject(ctx.project);ctx.history.commit(ctx.project);ctx.changed(false);}
        catch(error){ctx.project=ctx.history.rollback()??ctx.project;ctx.engine.project=ctx.project;ctx.engine.sample(ctx.time);ctx.renderPanels();if(!cancel)ctx.toast((error as Error).message,true);}}
    host.addEventListener('input',event=>{const input=event.target as HTMLInputElement,key=input.dataset.physics,worldKey=input.dataset.physicsWorld;
        if(input.type!=='number'||!key&&!worldKey||key==='time'||key==='start'||input.value===''||!input.checkValidity()||ctx.busy||ctx.draft||!worldKey&&ctx.current()?.locked)return;
        if(!live){if(ctx.history.pending)return;ctx.history.begin(ctx.project);live=input;ctx.playing=false;}
        if(live!==input)return;
        const axis=Number(input.dataset.axis),value=Number(input.value);
        if(worldKey==='gravity'){ctx.project.physics??={...defaultPhysicsWorld(),enabled:false};ctx.project.physics.gravity[axis]=value;}
        else {const b=ctx.current()!.physics!;if(key==='velocity'||key==='angularVelocity')b[key][axis]=value;
            else if(key==='impulse'||key==='point')b.impulses[Number(input.dataset.event)][key][axis]=value;else Object.assign(b,{[key!]:value});}
        ctx.engine.project=ctx.project;ctx.engine.sample(ctx.time);
    });
    host.addEventListener('focusout',event=>{if(event.target===live)finish();});
    host.addEventListener('keydown',event=>{if(live&&(event as KeyboardEvent).key==='Escape'){event.stopPropagation();finish(true);}});
    window.addEventListener('blur',()=>finish());
    const edit=(fn:()=>void)=>{if(ctx.busy||ctx.history.pending||ctx.draft||ctx.inspectorTab!=='environment'&&ctx.current()?.locked)return;ctx.change(fn,false);};
    host.addEventListener('change',event=>{const input=event.target as HTMLInputElement,key=input.dataset.physics,worldKey=input.dataset.physicsWorld;
        if(input.hasAttribute('data-physics-event-select')){event.stopPropagation();selectedEvent=Number(input.value);ctx.renderInspector();return;}
        if(!key&&!worldKey)return;event.stopPropagation();
        if(input===live){finish();return;}
        if(input.type==='number'&&(input.value===''||!input.checkValidity())){ctx.renderInspector();return;}
        edit(()=>{
            if(worldKey){ctx.project.physics??={...defaultPhysicsWorld(),enabled:false};const w=ctx.project.physics;if(worldKey==='gravity')w.gravity[Number(input.dataset.axis)]=Number(input.value);else Object.assign(w,{[worldKey]:input.checked});return;}
            const e=ctx.current()!;e.physics??={...defaultPhysicsBody(),mass:e.kind==='actor'?60:1};const b=e.physics;ctx.project.physics??=defaultPhysicsWorld();
            if(key==='enabled'&&input.checked)ctx.project.physics.enabled=true;
            if(key==='velocity'||key==='angularVelocity')b[key][Number(input.dataset.axis)]=Number(input.value);
            else if(key==='impulse'||key==='point'||key==='time'){const i=b.impulses[Number(input.dataset.event)];if(key==='time'){i.time=Number(input.value);b.impulses.sort((a,b)=>a.time-b.time);selectedEvent=b.impulses.indexOf(i);}else i[key][Number(input.dataset.axis)]=Number(input.value);}
            else Object.assign(b,{[key!]:input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value});
            if(key==='ragdoll'&&b.ragdoll)b.mode='dynamic';if(key==='mode'&&b.mode!=='dynamic')b.ragdoll=false;
        });
    });
    host.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-physics-event-add],[data-physics-event-remove]');if(!target)return;event.stopPropagation();
        edit(()=>{const b=ctx.current()!.physics!;if(target.hasAttribute('data-physics-event-add')){const item={time:Math.max(b.start,ctx.time),impulse:[0,0,0] as [number,number,number],point:[0,0,0] as [number,number,number]};b.impulses.push(item);b.impulses.sort((a,b)=>a.time-b.time);selectedEvent=b.impulses.indexOf(item);}else b.impulses.splice(Number(target.dataset.physicsEventRemove),1);});
    });
    const check=(key:string,label:string,value:boolean,world=false,disabled=false)=>`<label class="check"><input type="checkbox" data-${world?'physics-world':'physics'}="${key}" ${value?'checked':''} ${disabled?'disabled':''}/> ${label}</label>`;
    const number=(key:string,label:string,value:number,min:number,max:number,extra='')=>`<label class="field"><span>${label}</span><input type="number" data-physics="${key}" ${extra} value="${value}" min="${min}" max="${max}" step="any"/></label>`;
    const vector=(key:string,label:string,value:number[],extra='')=>`<h3 class="parameter-divider">${label}</h3><div class="triple">${value.map((v,i)=>number(key,['X','Y','Z'][i],v,-(key==='angularVelocity'?100:key==='impulse'?100000:1000),key==='angularVelocity'?100:key==='impulse'?100000:1000,`data-axis="${i}" ${extra}`)).join('')}</div>`;
    return {render(e:Entity){if(owner!==e.id){owner=e.id;selectedEvent=0;}const b=e.physics??defaultPhysicsBody();selectedEvent=Math.min(selectedEvent,Math.max(0,b.impulses.length-1));let html=check('enabled','启用物理',e.physics?.enabled??false);
        if(!e.physics?.enabled)return '<div class="physics-panel">'+html+'</div>';
        html+=`<div class="field-pair"><label class="field"><span>运动模式</span><select data-physics="mode">${options([['dynamic','动态'],['kinematic','按路径运动'],['static','静态障碍']],b.mode)}</select></label><label class="field"><span>碰撞形状</span><select data-physics="shape">${options([['auto','自动'],['box','盒体'],['sphere','球体']],b.shape)}</select></label></div>`;
        html+=`<div class="field-pair">${check('collisions','碰撞',b.collisions)}${check('gravity','重力',b.gravity)}${check('inertia','惯性',b.inertia)}${check('ragdoll','布娃娃',b.ragdoll,false,!canUseRagdoll(e))}</div>`;
        html+='<div class="field-pair">'+number('start','开始 / 秒',b.start,0,ctx.project.duration)+number('mass','质量 / kg',b.mass,.01,100000)+'</div><div class="field-pair">'+number('friction','摩擦',b.friction,0,2)+number('restitution','弹性',b.restitution,0,1)+'</div>'+number('damping','阻尼',b.damping,0,1);
        html+=vector('velocity','初速度 / m/s',b.velocity)+vector('angularVelocity','初始旋转 / rad/s',b.angularVelocity);
        html+='<h3 class="parameter-divider">受力事件</h3>';
        if(b.impulses.length)html+=`<select data-physics-event-select aria-label="受力事件">${options(b.impulses.map((i,n)=>[String(n),`受力 ${n+1} · ${i.time} 秒`]),String(selectedEvent))}</select>`;
        const i=b.impulses[selectedEvent];if(i){const n=selectedEvent,extra=`data-event="${n}"`;html+=`<div class="field-pair">${number('time','时间 / 秒',i.time,b.start,ctx.project.duration,extra)}<button data-physics-event-remove="${n}">移除</button></div>`+vector('impulse','冲量 / N·s',i.impulse,extra)+vector('point','受力偏移 / 米',i.point,extra);}
        return '<div class="physics-panel">'+html+'<button class="wide subtle" data-physics-event-add>添加受力事件</button></div>';
    },world(){const w=ctx.project.physics??defaultPhysicsWorld();return '<section class="inspector-parameter-group"><h3>物理场景</h3>'+check('enabled','启用物理',ctx.project.physics?.enabled??false,true)+check('ground','地面碰撞',w.ground,true)+`<div class="triple">${w.gravity.map((v,i)=>`<label class="field"><span>重力 ${['X','Y','Z'][i]}</span><input type="number" data-physics-world="gravity" data-axis="${i}" value="${v}" min="-1000" max="1000" step="any"/></label>`).join('')}</div></section>`;}};
}
