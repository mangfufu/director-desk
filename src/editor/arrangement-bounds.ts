import type { Engine } from '../engine.ts';
import type { LayoutBounds } from '../building/arrangement.ts';
import { geometryBounds } from '../spatial/geometry.ts';

/** Measure only requested models, once on command, with skinning and node visibility applied. */
export function arrangementBounds(engine: Engine, ids: string[]): Record<string, LayoutBounds> {
    engine.sample(engine.time);
    return Object.fromEntries(ids.map(id => {
        const root = engine.models.get(id), box = root && geometryBounds(root);
        if (!box) throw Error('无法取得所选对象的实际边界');
        return [id, { min: box.min.toArray(), max: box.max.toArray() }];
    }));
}
