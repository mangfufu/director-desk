import { Matrix4, Euler, Quaternion, Vector3 } from 'three';
import { clone, clip, type Project, type Vec3, type MotionPath, type Entity } from '../model.ts';
import { entityPosition, entityYaw, pathPosition } from '../timeline.ts';
import { memberSample } from './member-paths.ts';
import type { EditOperation } from '../automation/edits.ts';
import { sliceAction } from '../clip-editing.ts';
export interface NavBounds { min: Vec3; max: Vec3 }
export interface NavigationOptions { entityIds: string[]; destination: Vec3; start: number; end: number; radius?: number; speed?: number; bounds: Record<string, NavBounds>; startingPositions?: Record<string,Vec3[]> }
type Point = [number, number];
type Rect = [number, number, number, number];
const distance = (a:Point,b:Point) => Math.hypot(a[0]-b[0],a[1]-b[1]);
function segmentDistance(a:Point,b:Point,p:Point) {
    const dx=b[0]-a[0],dy=b[1]-a[1], t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(a[0]+t*dx-p[0],a[1]+t*dy-p[1]);
}
function hits(a:Point,b:Point,r:Rect) {
    let lo=0,hi=1;
    for(let axis=0;axis<2;axis++) {
        const d=b[axis]-a[axis];
        if(Math.abs(d)<1e-10){if(a[axis]<r[axis]||a[axis]>r[axis+2])return false;}
        else{const u=(r[axis]-a[axis])/d,v=(r[axis+2]-a[axis])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;}
    }
    return true;
}
class Heap {
    items: {key:number;score:number}[]=[];
    push(item:{key:number;score:number}){let i=this.items.length;this.items.push(item);while(i){const p=(i-1)>>1;if(this.items[p].score<=item.score)break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
    pop(){const first=this.items[0],last=this.items.pop()!;if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].score<this.items[c].score)c++;if(last.score<=this.items[c].score)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return first;}
}
export function findGroundRoute(start:Point,goal:Point,rects:Rect[],people:Point[],radius:number):Point[] {
    const clear=(a:Point,b:Point)=>!rects.some(r=>hits(a,b,r))&&!people.some(p=>segmentDistance(a,b,p)<radius*2-1e-7);
    if(!clear(start,start)||!clear(goal,goal))throw Error('起点或终点被占用，请移动目标或减小避让半径');
    if(clear(start,goal))return [start,goal];
    const step=Math.max(.25,radius),margin=Math.max(5,distance(start,goal)*.4);
    const x0=Math.min(start[0],goal[0])-margin,z0=Math.min(start[1],goal[1])-margin;
    const nx=Math.ceil((Math.abs(start[0]-goal[0])+margin*2)/step)+1,nz=Math.ceil((Math.abs(start[1]-goal[1])+margin*2)/step)+1;
    if(nx*nz>80000)throw Error('寻路范围过大，请缩短路线或增大避让半径');
    const point=(key:number):Point=>[x0+key%nx*step,z0+Math.floor(key/nx)*step];
    const open=new Heap(),cost=new Map<number,number>(),from=new Map<number,number>(),closed=new Set<number>();
    const sx=Math.round((start[0]-x0)/step),sz=Math.round((start[1]-z0)/step);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        const x=sx+dx,z=sz+dz;if(x<0||x>=nx||z<0||z>=nz)continue;
        const k=z*nx+x,p=point(k);if(clear(start,p)){const g=distance(start,p);cost.set(k,g);from.set(k,-1);open.push({key:k,score:g+distance(p,goal)});}
    }
    let last=-1;
    while(open.items.length){const {key}=open.pop();if(closed.has(key))continue;closed.add(key);const p=point(key);
        if(distance(p,goal)<=step*2&&clear(p,goal)){last=key;break;}
        for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
            if(!dx&&!dz)continue;const x=key%nx+dx,z=Math.floor(key/nx)+dz;if(x<0||x>=nx||z<0||z>=nz)continue;
            const next=z*nx+x,q=point(next);if(closed.has(next)||!clear(p,q))continue;
            const g=cost.get(key)!+distance(p,q);if(g>=(cost.get(next)??Infinity))continue;cost.set(next,g);from.set(next,key);open.push({key:next,score:g+distance(q,goal)});
        }
    }
    if(last<0)throw Error('没有找到可通行路线');
    const route:Point[]=[goal];for(let k=last;k!==-1;k=from.get(k)!)route.push(point(k));route.push(start);route.reverse();
    const simple=[start];let cursor=0;
    while(cursor<route.length-1){let next=route.length-1;while(next>cursor+1&&!clear(route[cursor],route[next]))next--;simple.push(route[next]);cursor=next;}
    return simple;
}
/** Exact closest separation over each overlapping linear segment, including endpoint holds. */
export function routesConflict(a:MotionPath,b:MotionPath,start:number,end:number,radius:number) {
    const times=[...new Set([start,end,...a.points.map(p=>p.time),...b.points.map(p=>p.time)].filter(t=>t>=start&&t<=end))].sort((x,y)=>x-y);
    for(let i=1;i<times.length;i++){
        const d0=pathPosition(a,[0,0,0],times[i-1]).sub(pathPosition(b,[0,0,0],times[i-1]));
        const d1=pathPosition(a,[0,0,0],times[i]).sub(pathPosition(b,[0,0,0],times[i]));
        if(segmentDistance([d0.x,d0.z],[d1.x,d1.z],[0,0])<radius*2-1e-6)return true;
    }
    return false;
}
export function planNavigation(project:Project,options:NavigationOptions) {
    const {entityIds,destination,start,end,bounds}=options,radius=options.radius??.35,speed=options.speed??1.5;
    if(!Array.isArray(entityIds)||!entityIds.length||new Set(entityIds).size!==entityIds.length||!Array.isArray(destination)||destination.length!==3||!destination.every(Number.isFinite)
        ||![start,end,radius,speed].every(Number.isFinite)||start<0||end<=start||end-start>600||radius<.1||radius>5||speed<.1||speed>20)throw Error('避障参数无效');
    const selected=entityIds.map(id=>{const e=project.entities.find(e=>e.id===id);if(!e||!['actor','crowd'].includes(e.kind)||e.external||e.locked)throw Error('请选择未锁定的内置人物或群演');
        if(e.handBinding||e.structureLink||e.physics?.enabled||e.rotation[0]||e.rotation[2])throw Error('请先解除绑定、物理和倾斜，再安排地面走位');return e;});
    const matrices=new Map<string,Matrix4>(), bases=new Map<string,Vec3>(), rotations=new Map<string,Vec3>();
    const people:{entity:Entity;index:number;position:Vec3}[]=[];
    for(const e of selected){const base=entityPosition(e,start).toArray(),rotation:Vec3=[0,entityYaw(e,start,project),0];bases.set(e.id,base);rotations.set(e.id,rotation);
        const matrix=new Matrix4().compose(new Vector3(...base),new Quaternion().setFromEuler(new Euler(...rotation)),new Vector3(...e.scale));matrices.set(e.id,matrix);
        const count=e.kind==='crowd'?e.count:1, supplied=options.startingPositions?.[e.id];
        if(supplied && (supplied.length!==count||supplied.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))))throw Error('人物起点数据无效');
        for(let i=0;i<count;i++)people.push({entity:e,index:i,position:supplied?.[i]??(e.kind==='crowd'?memberSample(e,i,start).position.applyMatrix4(matrix).toArray():base)});
    }
    if(people.length>150)throw Error('每次最多规划 150 人，请分批安排');
    const center=people.reduce((v,p)=>v.add(new Vector3(...p.position)),new Vector3()).divideScalar(people.length);
    if(Math.abs(destination[1]-center.y)>.1||people.some(p=>Math.abs(p.position[1]-center.y)>.1))throw Error('当前避障支持同一高度的地面走位');
    for(let i=0;i<people.length;i++)for(let j=0;j<i;j++)if(distance([people[i].position[0],people[i].position[2]],[people[j].position[0],people[j].position[2]])<radius*2-1e-6)throw Error('人物起点过密，请增大间距或减小避让半径');
    const rects:Rect[]=[];
    for(const [id,box] of Object.entries(bounds)){
        if(entityIds.includes(id))continue;
        if(!box||![...box.min,...box.max].every(Number.isFinite))throw Error('障碍边界无效');
        if(box.max[1]<=center.y+.1||box.min[1]>=center.y+Math.max(...selected.map(e=>e.height*e.scale[1])))continue;
        rects.push([box.min[0]-radius,box.min[2]-radius,box.max[0]+radius,box.max[2]+radius]);
    }
    if(project.room.enabled){const x=project.room.width/2-radius,z=project.room.depth/2-radius;rects.push([-1e6,-1e6,-x,1e6],[x,-1e6,1e6,1e6],[-1e6,-1e6,1e6,-z],[-1e6,z,1e6,1e6]);}
    const routes:MotionPath[]=[],timing:{entityId:string;member:number;start:number;end:number}[]=[];
    for(const [i,p] of people.entries()){
        const goal:Point=[destination[0]+p.position[0]-center.x,destination[2]+p.position[2]-center.z];
        const pending=people.slice(i+1).map(v=>[v.position[0],v.position[2]] as Point);
        const route=findGroundRoute([p.position[0],p.position[2]],goal,rects,pending,radius);
        const length=route.slice(1).reduce((n,v,j)=>n+distance(route[j],v),0),duration=Math.max(1/project.fps,length/speed);
        let accepted:MotionPath|undefined, depart=start;
        const delayStep=Math.max(1/project.fps,.2);
        for(;depart+duration<=end+1e-7;depart+=delayStep){
            let time=depart;const points:MotionPath['points']=[];
            if(depart>start)points.push({time:start,position:[...p.position]});
            for(const [j,v] of route.entries()){if(j)time+=distance(route[j-1],v)/speed;if(j&&time<=points.at(-1)!.time+1e-9)continue;points.push({time,position:[v[0],p.position[1],v[1]]});}
            if(points.length===1)points.push({time:depart+duration,position:[...points[0].position]});
            const candidate:MotionPath={smooth:false,points};
            if(!routes.some(other=>routesConflict(candidate,other,start,end,radius))){accepted=candidate;break;}
        }
        if(!accepted)throw Error(`第 ${i+1} 人无法在指定时段内安全通过，请延长时间、调整终点或分组安排`);
        routes.push(accepted);timing.push({entityId:p.entity.id,member:p.index,start:depart,end:accepted.points.at(-1)!.time});
    }
    const operations:EditOperation[]=[];
    for(const e of selected){
        const own=people.flatMap((p,i)=>p.entity===e?[routes[i]]:[]);
        const clips=clone(e.clips).flatMap(c=>c.end<=start||c.start>=end?[c]:[...(c.start<start?[sliceAction(c,c.start,start,false)]:[]),...(c.end>end?[sliceAction(c,end,c.end)]:[])]);
        clips.push(clip(speed>2.5?'run':'walk',start,end));clips.sort((a,b)=>a.start-b.start);
        const patch:Record<string,unknown>={clips,face:'path',faceTarget:''};
        if(e.initialPose)operations.push({operation:'clear-inherited-pose',id:e.id});
        if(e.kind==='crowd'){
            const inverse=matrices.get(e.id)!.clone().invert();
            const rotation=[...rotations.get(e.id)!] as Vec3;
            rotation[1]-=e.clips.filter(c=>c.action==='turn'&&c.end<=start).reduce((n,c)=>n+(c.turnAmount??1),0)*Math.PI;
            patch.position=bases.get(e.id);patch.rotation=rotation;patch.path=null;
            patch.memberPaths=own.map(path=>({...path,points:path.points.map(p=>({...p,position:new Vector3(...p.position).applyMatrix4(inverse).toArray()}))}));
        }else patch.path=own[0];
        operations.push({operation:'update',id:e.id,patch});
    }
    if(end>project.duration)operations.push({operation:'project',patch:{duration:end}});
    return {operations,timing,people:people.length};
}
