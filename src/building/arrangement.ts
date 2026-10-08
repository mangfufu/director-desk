import { clone, uid, type Project, type Vec3 } from '../model.ts';
import { duplicateEntities, groupPivot, transformEntities } from './group-editing.ts';

export interface LayoutBounds { min: Vec3; max: Vec3 }
export interface Arrangement {
    action: 'align' | 'distribute' | 'array'; entityIds: string[];
    axis?: 'x' | 'y' | 'z'; alignment?: 'min' | 'center' | 'max'; anchorId?: string;
    bounds?: Record<string, LayoutBounds>;
    shape?: 'line' | 'grid' | 'circle'; count?: number; step?: Vec3; columns?: number; rowStep?: Vec3;
    radius?: number; pivot?: Vec3; rotate?: boolean;
}
const vector = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
/** Work on a candidate so all generated copies/transforms commit together or not at all. */
export function arrangeEntities(original: Project, options: Arrangement): Project {
    if (!options || !['align', 'distribute', 'array'].includes(options.action)) throw Error('排列操作无效');
    const fields = ['action', 'entityIds', 'axis', 'alignment', 'anchorId', 'bounds', 'shape', 'count', 'step', 'columns', 'rowStep', 'radius', 'pivot', 'rotate'];
    if (Object.keys(options).some(k => !fields.includes(k))) throw Error('不支持的排列参数');
    const { entityIds: ids } = options;
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !original.entities.some(e => e.id === id))) throw Error('请选择有效且不重复的对象');
    const p = clone(original);
    if (options.action === 'array') {
        const { count = 2, shape = 'line', step = [2, 0, 0], columns = 3, rowStep = [0, 0, 2], radius = 3, rotate = false } = options;
        if (!Number.isSafeInteger(count) || count < 2 || count > 1000 || (count - 1) * ids.length > 10000) throw Error('阵列需要 2—1000 份，新增对象不超过 10000 个');
        if (!['line', 'grid', 'circle'].includes(shape) || !vector(step) || !vector(rowStep) || typeof rotate !== 'boolean'
            || !Number.isSafeInteger(columns) || columns < 1 || !Number.isFinite(radius) || radius <= 0 || options.pivot !== undefined && !vector(options.pivot)) throw Error('阵列参数无效');
        const sourcePivot = groupPivot(original, ids), pivot = options.pivot ?? sourcePivot;
        const groups = (original.groups ?? []).filter(g => g.entityIds.every(id => ids.includes(id)));
        const sourceEntities = p.entities.slice();
        for (let i = 1; i < count; i++) {
            // Validate each copy against the fixed source, not an ever-growing array result.
            const batch = { ...p, entities: [...sourceEntities] };
            const { entityIds, mapping } = duplicateEntities(batch, ids, [0, 0, 0]);
            let delta: Vec3, rotation: Vec3 = [0, 0, 0];
            if (shape === 'circle') {
                const angle = Math.PI * 2 * i / count;
                // The source is the first point on the ring; centre lies radius metres along -X.
                delta = [radius * (Math.cos(angle) - 1), 0, -radius * Math.sin(angle)];
                if (rotate) rotation = [0, angle, 0];
            } else delta = step.map((v, axis) => v * (shape === 'grid' ? i % columns : i) + (shape === 'grid' ? rowStep[axis] * Math.floor(i / columns) : 0)) as Vec3;
            transformEntities(batch, entityIds, { translation: delta, rotation, pivot });
            p.entities.push(...batch.entities.slice(sourceEntities.length));
            for (const g of groups) (p.groups ??= []).push({ id: uid(), name: `${g.name} ${i + 1}`, entityIds: g.entityIds.map(id => mapping.get(id)!) });
        }
    } else {
        if (ids.length < (options.action === 'distribute' ? 3 : 2)) throw Error(options.action === 'distribute' ? '等距分布至少选择三个对象' : '对齐至少选择两个对象');
        const axis = ['x', 'y', 'z'].indexOf(options.axis ?? 'x'), alignment = options.alignment ?? 'center';
        if (axis < 0 || !['min', 'center', 'max'].includes(alignment)) throw Error('对齐轴或边界无效');
        const measured = options.bounds;
        const value = (id: string) => {
            const box = measured?.[id];
            if (!box || !vector(box.min) || !vector(box.max) || box.min.some((v, i) => v > box.max[i])) throw Error(`缺少「${id}」的有效实际边界`);
            return alignment === 'center' ? (box.min[axis] + box.max[axis]) / 2 : box[alignment][axis];
        };
        const positions = new Map(ids.map(id => [id, value(id)]));
        const targets = new Map<string, number>();
        if (options.action === 'align') {
            const anchor = options.anchorId ?? ids[0]; if (!positions.has(anchor)) throw Error('基准对象必须包含在选择中');
            ids.forEach(id => targets.set(id, positions.get(anchor)!));
        } else {
            const ordered = [...ids].sort((a, b) => positions.get(a)! - positions.get(b)!);
            const first = positions.get(ordered[0])!, last = positions.get(ordered.at(-1)!)!;
            ordered.forEach((id, i) => targets.set(id, first + (last - first) * i / (ordered.length - 1)));
        }
        for (const id of ids) {
            const delta = targets.get(id)! - positions.get(id)!; if (Math.abs(delta) < 1e-9) continue;
            const translation: Vec3 = [0, 0, 0]; translation[axis] = delta;
            transformEntities(p, [id], { translation });
        }
    }
    return p;
}
