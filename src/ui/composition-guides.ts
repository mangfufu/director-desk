import { editorPreferences, type PreferenceKey } from '../editor/preferences.ts';
import './composition-guides.css';

/** DOM-only overlay follows the actual camera canvas, including letterboxing.
 * Nothing is drawn into the WebGL output, screenshots or exported media. */
export function mountCompositionGuides(canvas: HTMLCanvasElement) {
    const host=canvas.parentElement!;
    host.querySelector('.shot-crosshair')?.remove();
    const overlay=document.createElement('div');
    overlay.className='composition-guides'; overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none"><g data-guide="guideThirds"><path d="M33.333 0V100M66.667 0V100M0 33.333H100M0 66.667H100"/></g><g data-guide="guideCenter"><path d="M47 50H53M50 47V53"/></g><g data-guide="guideSafe"><rect x="5" y="5" width="90" height="90"/></g></svg>';
    host.append(overlay);
    const menu=document.createElement('details');menu.className='composition-menu';
    const fields:[PreferenceKey,string][]=[['guideThirds','三分线'],['guideCenter','中心线'],['guideSafe','安全框']];
    menu.innerHTML='<summary>辅助线</summary><div class="composition-options">'+fields.map(([key,name])=>`<label><input type="checkbox" data-guide-setting="${key}">${name}</label>`).join('')+'</div>';
    document.querySelector('.shot-bottomline')!.append(menu);
    const refresh=()=>{
        const preferences=editorPreferences.current;
        for(const [key] of fields){
            overlay.querySelector<SVGGElement>(`[data-guide="${key}"]`)!.style.display=preferences[key]?'':'none';
            menu.querySelector<HTMLInputElement>(`[data-guide-setting="${key}"]`)!.checked=!!preferences[key];
        }
        overlay.hidden=!fields.some(([key])=>preferences[key]);
    };
    const resize=()=>{overlay.style.width=canvas.clientWidth+'px';overlay.style.height=canvas.clientHeight+'px';};
    const observer=new ResizeObserver(resize);observer.observe(canvas);
    menu.addEventListener('change',event=>{
        const input=event.target as HTMLInputElement;
        if(input.dataset.guideSetting)editorPreferences.set(input.dataset.guideSetting as PreferenceKey,input.checked);
    });
    document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target as Node))menu.open=false;});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary')!.focus();}});
    editorPreferences.subscribe(refresh);refresh();resize();
}
