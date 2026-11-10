import {createContextMenu, type ContextItem} from './context-menu.ts';

/** Editor chrome is not a document. Text fields still use native editing and undo. */
export function bindEditorShellInput(toast: (message: string, error?: boolean) => void) {
    const menu=createContextMenu();
    const textTarget=(target: EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>('input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=button],[type=submit]),textarea,[contenteditable=true],pre,code,[data-selectable]'):null;
    document.addEventListener('contextmenu',event=>{
        if(event.defaultPrevented)return;
        event.preventDefault();
        const field=textTarget(event.target);
        if(!field)return;
        const input=field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement;
        const writable=input?!field.readOnly&&!field.disabled:field.isContentEditable;
        const selected=input&&field.selectionStart!==null?field.value.slice(field.selectionStart,field.selectionEnd??field.selectionStart):getSelection()?.toString()??'';
        const start=input?field.selectionStart:null,end=input?field.selectionEnd:null;
        const selection=getSelection(),range=selection?.rangeCount?selection.getRangeAt(0).cloneRange():undefined;
        const restore=()=>{
            if(!field.isConnected)return false;
            field.focus({preventScroll:true});
            if(input&&start!==null&&end!==null)field.setSelectionRange(start,end);
            else if(range){selection?.removeAllRanges();selection?.addRange(range);}
            return true;
        };
        const run=async(command:'cut'|'copy'|'paste'|'selectAll')=>{
            if(!restore())return;
            try{
                if(command==='selectAll'&&!input&&!field.isContentEditable){const all=document.createRange();all.selectNodeContents(field);selection?.removeAllRanges();selection?.addRange(all);return;}
                if(window.directorDesktop?.editText){const result=await window.directorDesktop.editText(command);if(!result.ok)throw Error(result.error);return;}
                if(command==='paste'){
                    const value=await navigator.clipboard.readText();
                    // Do not paste into another field if focus changed while requesting clipboard access.
                    if(!field.isConnected||document.activeElement!==field)return;
                    if(!document.execCommand('insertText',false,value))throw Error('请使用 Ctrl+V 粘贴');
                }else if(!document.execCommand(command)){
                    if(command==='copy')await navigator.clipboard.writeText(selected);
                    else throw Error('请使用键盘快捷键');
                }
            }catch(error){toast(error instanceof Error?error.message:String(error),true);}
        };
        const item=(id:'cut'|'copy'|'paste'|'selectAll',label:string,disabled=false):ContextItem=>({id:'text-'+id,label,disabled,run:()=>void run(id)});
        const secret=field instanceof HTMLInputElement&&field.type==='password';
        menu.open(event.clientX,event.clientY,[...(writable?[item('cut','剪切',!selected||secret)]:[]),item('copy','复制',!selected||secret),...(writable?[item('paste','粘贴')]:[]),null,item('selectAll','全选')],field);
    });
    document.addEventListener('dragstart',event=>{
        if(!(event.target instanceof Element))return;
        if(event.target.closest('[draggable=true]')||textTarget(event.target))return;
        // Keep asset/motion/file drops; suppress browser ghosts for icons and links.
        event.preventDefault();
    });
    window.addEventListener('keydown',event=>{
        if(!window.directorDesktop)return;
        const key=event.key.toLowerCase();
        if(event.key==='F5'||(event.ctrlKey||event.metaKey)&&['r','+','-','=','0'].includes(key))event.preventDefault();
    },true);
}
