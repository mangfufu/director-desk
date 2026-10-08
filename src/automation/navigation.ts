import type { AppContext } from '../app-context.ts';
import { geometryBounds } from '../spatial/geometry.ts';
import { planNavigationAsync } from '../navigation/worker-client.ts';
import type { NavBounds, NavigationOptions } from '../navigation/planner.ts';
import { Vector3 } from 'three';
export async function navigationPlan(ctx: AppContext, args: Record<string, unknown>, signal?: AbortSignal) {
    const ids = args.entityIds as string[], explicit = args.obstacleIds as string[] | undefined;
    const time = ctx.engine.time, bounds: Record<string, NavBounds> = {}, movingObstacleIds: string[] = [];
    const startingPositions:NonNullable<NavigationOptions['startingPositions']>={};
    if (explicit?.some(id => !ctx.project.entities.some(e => e.id === id))) throw Error('障碍物不存在');
    try {
        ctx.engine.sample(Number(args.start));
        for(const id of ids){
            const root=ctx.engine.models.get(id),members=ctx.engine.crowdRigs.get(id);
            if(members)startingPositions[id]=members.map(r=>r.root.getWorldPosition(new Vector3()).toArray());
            else if(root)startingPositions[id]=[root.getWorldPosition(new Vector3()).toArray()];
        }
        for (const e of ctx.project.entities) {
            if (ids.includes(e.id) || e.kind === 'camera' || e.light || e.visual || e.field || !e.visible || (explicit && !explicit.includes(e.id))) continue;
            const root = ctx.engine.models.get(e.id), box = root && geometryBounds(root);
            if (box) bounds[e.id] = {min:box.min.toArray(),max:box.max.toArray()};
            if (e.path || e.physics?.enabled || e.memberPaths) movingObstacleIds.push(e.id);
        }
    } finally { ctx.engine.sample(time); }
    const options:NavigationOptions={entityIds:ids,destination:args.destination as NavigationOptions['destination'],start:Number(args.start),end:Number(args.end),radius:args.radius as number|undefined,speed:args.speed as number|undefined,bounds,startingPositions};
    return {...await planNavigationAsync(ctx.project,options,signal),movingObstacleIds};
}
