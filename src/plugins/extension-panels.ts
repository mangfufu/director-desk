export function extensionPanel(title:string,mount:(root:ShadowRoot)=>void|(()=>void),onError:(error:unknown)=>void){
    const panel=document.createElement('section');panel.className='extension-custom-panel';
    const header=document.createElement('header'),caption=document.createElement('strong'),close=document.createElement('button'),body=document.createElement('div');
    caption.textContent=title;close.textContent='×';close.ariaLabel='关闭插件面板';header.append(caption,close);panel.append(header,body);document.body.append(panel);
    const shadow=body.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=':host{display:block;color:#eee;font:13px system-ui}*{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer}';shadow.append(style);
    let cleanup:void|(()=>void);try{cleanup=mount(shadow);}catch(error){panel.remove();throw error;}
    const dispose=()=>{try{cleanup?.();}catch(error){onError(error);}panel.remove();};close.onclick=()=>{panel.hidden=true;};
    header.onpointerdown=e=>{if(e.target===close||e.button!==0)return;e.preventDefault();const rect=panel.getBoundingClientRect(),x=e.clientX,y=e.clientY;header.setPointerCapture(e.pointerId);
        header.onpointermove=event=>{panel.style.left=Math.max(0,Math.min(innerWidth-100,rect.left+event.clientX-x))+'px';panel.style.top=Math.max(0,Math.min(innerHeight-50,rect.top+event.clientY-y))+'px';panel.style.right='auto';};
        const stop=()=>{header.onpointermove=null;header.onpointerup=null;header.onpointercancel=null;header.onlostpointercapture=null;};header.onpointerup=stop;header.onpointercancel=stop;header.onlostpointercapture=stop;
    };
    return {element:panel,show:()=>{panel.hidden=false;},hide:()=>{panel.hidden=true;},dispose};
}
