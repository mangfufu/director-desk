/** Keep repeated clicks from starting the same pending command twice. */
export function withActionFeedback(
    execute:(action:string,element:HTMLElement)=>Promise<void>,
    report:(message:string,error?:boolean)=>void,
) {
    const pending=new Set<string>();
    return async (action:string,element:HTMLElement) => {
        if(pending.has(action))return;
        pending.add(action);
        const busy=element.getAttribute('aria-busy');
        let shown=false;
        const timer=setTimeout(()=>{shown=true;element.setAttribute('aria-busy','true');},150);
        try {await execute(action,element);}
        catch(error) {
            if(error instanceof Error&&error.name==='AbortError')return;
            console.error('Editor command failed',action,error);
            const message=error instanceof Error?error.message:'';
            report(/dynamically imported module|module script|loading chunk|chunkloaderror/i.test(message)
                ?'页面加载失败，请重新打开软件后重试。':message||'操作未完成，请重试。',true);
        } finally {
            clearTimeout(timer);pending.delete(action);
            if(shown){if(busy===null)element.removeAttribute('aria-busy');else element.setAttribute('aria-busy',busy);}
        }
    };
}
