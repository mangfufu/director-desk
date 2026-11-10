import type { Project } from '../model.ts';
import { t } from '../i18n/locale.ts';

export interface ContactShot { index:number; start:number; end:number; time:number; cameraId:string; cameraName:string }
export interface ContactCard extends ContactShot { image:string; people:string[]; notes:string }
export function contactShots(project:Project):ContactShot[] {
    return project.cuts.map((cut,index)=>{
        const end=project.cuts[index+1]?.time??project.duration;
        const time=Math.max(cut.time,Math.min(end-Number.EPSILON*Math.max(1,end),Math.floor((cut.time+end)*.5*project.fps)/project.fps));
        return {index,start:cut.time,end,time,cameraId:cut.cameraId,cameraName:project.entities.find(e=>e.id===cut.cameraId)?.name??''};
    });
}
export function contactNotes(project:Project,shot:ContactShot){
    const parts:string[]=[];let length=0;
    for(const note of project.production?.notes??[]){
        if(note.start>=shot.end||note.end<=shot.start)continue;
        for(const text of [note.story,note.emotion,note.dialogue,note.action])if(text){length+=text.length;if(length>4*1024*1024)throw Error('镜头备注过长，请拆分戏段后导出');parts.push(text);}
    }
    return parts.join('\n');
}
export const contactTime=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`;
export const contactEscape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function contactCardHtml(card:ContactCard,editableLayout=false){
    const esc=contactEscape;
    return `<article class="contact-card"><h2>${esc(t('镜头'))} ${card.index+1} · ${esc(card.cameraName)}</h2><p>${contactTime(card.start)}—${contactTime(card.end)} · ${esc(t('取样'))} ${contactTime(card.time)}</p><img src="${esc(card.image)}" alt="${esc(card.cameraName)}"/><p>${esc(t('取样人物'))}：${esc(card.people.join('、')||'—')}</p>${editableLayout?`<textarea readonly aria-label="${esc(t('镜头备注'))}">${esc(card.notes)}</textarea>`:`<pre>${esc(card.notes)}</pre>`}</article>`;
}
export function contactHtmlStart(name:string,aspect:string){return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${contactEscape(name)} · ${contactEscape(t('镜头联系表'))}</title><style>body{margin:24px;background:#fff;color:#171717;font:14px/1.5 system-ui,sans-serif}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}article{border:1px solid #ccc;padding:12px;min-width:0;break-inside:avoid}h2{font-size:16px;margin:0}p{margin:6px 0;font-size:12px}img{width:100%;height:200px;object-fit:contain;background:#111}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}h1,h2,p{overflow-wrap:anywhere}@media print{body{margin:0}main{grid-template-columns:repeat(2,minmax(0,1fr))}img{height:160px}article{break-inside:avoid}}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>${contactEscape(name)}</h1><p>${contactEscape(aspect)} · ${contactEscape(t('人物按取样画面列出'))}</p><main>`;}
