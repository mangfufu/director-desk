import type { Scene,Camera,WebGLRenderer } from 'three';
import type { Project } from '../model.ts';
export interface PluginFrame {time:number;project:Project;exporting:boolean}
export interface PluginRender extends PluginFrame {renderer:WebGLRenderer;scene:Scene;camera:Camera;view:'stage'|'shot';depth:boolean}
export class PluginRenderHooks {
    samples=new Set<(frame:PluginFrame)=>void>();
    passes=new Set<(frame:PluginRender,next:()=>void)=>void>();
    sample(frame:PluginFrame){for(const fn of this.samples)fn(frame);}
    render(frame:PluginRender,draw:()=>void){const passes=[...this.passes];const next=(i:number)=>{if(i<passes.length)passes[i](frame,()=>next(i+1));else draw();};next(0);}
}
