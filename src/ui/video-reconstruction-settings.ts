import type {AppContext} from '../app-context.ts';
import {reconstruction} from '../reconstruction/client.ts';
import {escape} from './common.ts';
import {paintInstallProgress} from './reconstruction-install-progress.ts';
import {t} from '../i18n/locale.ts';
import './video-reconstruction-panel.css';

export async function openReconstructionSettings(ctx:AppContext){
    const initial=await reconstruction('state');
    if (!ctx.showModal('视频反推设置',`<div class="reconstruction-settings">
        <label class="field"><span>存储位置</span><div class="reconstruction-file"><input id="recon-directory" value="${escape(initial.settings.runtimeRoot)}"><button id="recon-folder">选择</button><button id="recon-settings">应用</button></div></label>
        <p id="recon-install-size">下载约 6–7 GB，安装后约 8 GB；建议预留 20 GB 空间</p>
        <section class="reconstruction-hardware" aria-label="设备配置">
            <table><caption>设备配置</caption><thead><tr><th scope="col">硬件</th><th scope="col">最低配置（估计）</th><th scope="col">推荐配置</th></tr></thead><tbody>
                <tr><th scope="row">显存</th><td>8 GB</td><td>16 GB</td></tr>
                <tr><th scope="row">内存</th><td>16 GB</td><td>32 GB</td></tr>
                <tr><th scope="row">处理器</th><td>4 核 8 线程</td><td>6 核 12 线程及以上</td></tr>
                <tr><th scope="row">可用空间</th><td>20 GB</td><td>40 GB · SSD</td></tr>
            </tbody></table>
            <p>Windows / Linux（64 位），NVIDIA RTX 20 / 30 / 40 系列显卡及兼容驱动。</p>
            <p>最低配置按短片段估计；长视频、多人场景建议分段转换。暂不支持 AMD、Intel 显卡或 macOS。</p>
        </section>
        <section id="recon-license" hidden><p>此功能使用 Human3R，原许可仅允许非商业用途。商业使用需另行取得授权。</p><details><summary>查看许可</summary><pre>${escape(initial.model.licenseText)}</pre></details></section>
        <div class="reconstruction-actions"><button id="recon-project" title="${escape(initial.model.sourceUrl)}">项目主页</button><button id="recon-source">官方许可</button></div>
        <section id="recon-settings-progress" class="reconstruction-install-progress" hidden></section>
        <div id="recon-usage" class="reconstruction-usage">正在统计</div>
        <section id="recon-remove-confirm" hidden><p>移除模型和运行环境？转换结果会保留。</p><div class="reconstruction-actions"><button id="recon-remove-cancel">取消</button><button id="recon-remove-yes">移除</button></div></section>
        <p id="recon-settings-message" role="status"></p>
    </div>`,`<div class="reconstruction-storage-actions"><button id="recon-clear">清理缓存</button><button id="recon-remove">移除运行环境</button></div><button id="recon-accept" class="primary">同意并下载</button><button id="recon-download" class="primary">下载模型</button><button id="recon-install-cancel" hidden>取消配置</button><button data-act="close-modal">完成</button>`,true)) return;
    const modal=document.querySelector<HTMLElement>('.modal')!;modal.classList.add('reconstruction-settings-modal');
    const el=<T extends HTMLElement=HTMLButtonElement>(id:string)=>modal.querySelector<T>('#recon-'+id)!;
    let active=true,working=false,state=initial,managed=false;
    function paint(){const busy=state.job?.status==='running';el('license').hidden=state.accepted;el('install-size').hidden=state.ready;el('accept').hidden=state.accepted;el('download').hidden=!state.accepted||state.ready||busy;
        paintInstallProgress(el('settings-progress'),state.job?.kind==='download'?state.job:state.installation);
        el('install-cancel').hidden=state.job?.kind!=='download'||!busy;el('install-cancel').disabled=working||!!state.job?.cancelled;
        el('install-size').hidden=state.ready||busy;
        for(const id of ['directory','folder','settings','accept','download'])el<HTMLInputElement>(id).disabled=working||busy||!state.supported;
        for(const id of ['clear','remove','remove-yes'])el(id).disabled=working||busy||!managed;
    }
    async function usage(){const data=await reconstruction('storage');if(!active)return;managed=data.managed;const size=(n:number)=>n>=1024**3?`${(n/1024**3).toFixed(2)} GB`:`${Math.round(n/1024**2)} MB`;
        el('usage').innerHTML=[['模型',data.models],['运行环境',data.runtime],['缓存',data.cache],['转换结果',data.runs],['总占用',data.total]].map(([label,value])=>`<div><span>${escape(t(String(label)))}</span><output>${size(Number(value))}</output></div>`).join('');paint();}
    async function act(fn:()=>Promise<unknown>){if(working)return;working=true;paint();el('settings-message').textContent='';try{await fn();if(active){state=await reconstruction('state');await usage();}}catch(e){if(active)el('settings-message').textContent=(e as Error).message;}finally{working=false;if(active)paint();}}
    const save=()=>reconstruction('configure',{runtimeRoot:el<HTMLInputElement>('directory').value.trim()});
    el('folder').onclick=()=>void act(async()=>{const r=await reconstruction('choose-directory');if(r.path)el<HTMLInputElement>('directory').value=r.path;});
    el('settings').onclick=()=>void act(async()=>{await save();el('settings-message').textContent=t('已保存');});
    const openPage=(page:string)=>void reconstruction(page).catch(e=>{if(active)el('settings-message').textContent=e.message;});
    el('source').onclick=()=>openPage('license-page');
    el('project').onclick=()=>openPage('project-page');
    const download=async()=>{await save();if(!state.accepted)await reconstruction('accept-license',{accepted:true,version:state.model.licenseVersion});const next=await reconstruction('state');if(!next.ready)await reconstruction('download',{requestId:crypto.randomUUID()});};
    el('accept').onclick=()=>void act(download);el('download').onclick=()=>void act(download);
    el('install-cancel').onclick=()=>void act(()=>reconstruction('cancel'));
    el('clear').onclick=()=>void act(()=>reconstruction('clear-cache'));
    el('remove').onclick=()=>{el('remove-confirm').hidden=false;el('remove-cancel').focus();};
    el('remove-cancel').onclick=()=>el('remove-confirm').hidden=true;
    el('remove-yes').onclick=()=>void act(async()=>{await reconstruction('remove-runtime');el('remove-confirm').hidden=true;});
    let polling=false;const timer=setInterval(()=>{if(!active||working||polling)return;polling=true;void reconstruction('state').then(async next=>{if(!active)return;const finished=state.job?.status==='running'&&next.job?.status!=='running';state=next;paint();if(finished)await usage();}).catch(e=>{if(active)el('settings-message').textContent=e.message;}).finally(()=>polling=false);},750);
    modal.addEventListener('director-before-close',()=>{active=false;clearInterval(timer);});paint();void usage().catch(e=>{if(active)el('settings-message').textContent=e.message;});
}
