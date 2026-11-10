import {clone,type Entity,type Waypoint} from '../model.ts';
import {entityPosition} from '../timeline.ts';

/** A deliberate motion-mode change replaces incompatible segment curves in the caller's transaction. */
export function setPathMotionMode(path:{interpolation?:'continuous';points:Waypoint[]},value:string) {
    if(value==='continuous'){
        path.interpolation='continuous';path.points.forEach(point=>{delete point.easing;});
    }else delete path.interpolation;
}

function route(entity:Entity,changeTimes=false) {
    if(!entity.path)throw Error('对象没有路径');
    if(changeTimes&&entity.path.sections)throw Error('已分割路线请在时间轴调整片段时间，或重新绘制路线');
    return entity.path;
}
function pointAt(entity:Entity,index:number,changeTimes=false):Waypoint {
    const path=route(entity,changeTimes);
    if(!Number.isInteger(index)||index<0||index>=path.points.length)throw Error('途经点不存在');
    return path.points[index];
}
export function editPathPoint(entity:Entity,index:number,axis:'time'|number,value:number) {
    if(!Number.isFinite(value)||axis!=='time'&&(!Number.isInteger(axis)||axis<0||axis>2))throw Error('途经点参数无效');
    const point=pointAt(entity,index,axis==='time');
    if(axis==='time')point.time=value;else point.position[axis]=value;
}
export function appendPathPoint(entity:Entity) {
    const path=route(entity,true),last=path.points.at(-1)!;
    path.points.push({...clone(last),time:last.time+2,position:[last.position[0]+.5,last.position[1],last.position[2]]});
    return path.points.length-1;
}
export function holdPathPoint(entity:Entity,index:number) {
    const point=pointAt(entity,index,true),path=entity.path!;
    for(let i=index+1;i<path.points.length;i++)path.points[i].time+=1;
    path.points.splice(index+1,0,{...clone(point),time:point.time+1,position:[...point.position]});
    return index+1;
}
export function removePathPoint(entity:Entity,index:number) {
    pointAt(entity,index,true);entity.path!.points.splice(index,1);
    if(!entity.path!.points.length)entity.path=null;
    return Math.max(0,Math.min(index,(entity.path?.points.length??1)-1));
}
export function clearEntityPath(entity:Entity,time:number) {
    entity.position=entityPosition(entity,time).toArray();entity.path=null;
}
export function retimeEntityPath(entity:Entity,start:number,end:number) {
    const path=route(entity),oldStart=path.points[0].time,oldEnd=path.points.at(-1)!.time;
    if(path.points.length===1)throw Error('单个位置关键帧请直接修改途经点时间');
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('结束时间必须晚于开始时间');
    const matching=entity.clips.find(c=>Math.abs(c.start-oldStart)<1e-6&&Math.abs(c.end-oldEnd)<1e-6&&['walk','run'].includes(c.action));
    const map=(time:number)=>start+(time-oldStart)/(oldEnd-oldStart)*(end-start);
    path.sections?.forEach(section=>{section.start=map(section.start);section.end=map(section.end);section.from=map(section.from);section.to=map(section.to);});
    path.points.forEach(point=>point.time=map(point.time));
    if(matching){matching.start=start;matching.end=end;}
}
